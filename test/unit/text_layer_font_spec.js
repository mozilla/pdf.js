/* Copyright 2026 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AbortException, bytesToString } from "../../src/shared/util.js";
import {
  buildTextLayerFont,
  TextLayerFonts,
} from "../../src/core/text_layer_font.js";
import { FontTestData } from "./font_test_utils.js";
import { TextExtraction } from "../../src/core/text_extraction.js";

const idFactory = {
  getDocId: () => "g_d0",
  createFontId: () => "f1",
};

function createSink() {
  const chunks = [];
  return { chunks, isCancelled: false, enqueue: chunk => chunks.push(chunk) };
}

function getTextLayerFont(
  glyphs,
  {
    font = { ascent: 0.8, descent: -0.2 },
    drawBoxes = false,
    heightScaled = false,
    spaceGaps = [],
  } = {}
) {
  const textLayerFonts = new TextLayerFonts(idFactory, drawBoxes);
  if (heightScaled) {
    textLayerFonts.addHeightScaledFont(font);
  }
  for (const [unicode, advance] of glyphs) {
    textLayerFonts.addGlyph(font, unicode, advance);
  }
  for (const gap of spaceGaps) {
    textLayerFonts.addSpaceGap(font, gap);
  }
  return textLayerFonts.build(font);
}

function expectAdvances(font, advances) {
  for (const [codePoint, advance] of advances) {
    expect(font.getAdvance(codePoint))
      .withContext(`U+${codePoint.toString(16)}`)
      .toBeCloseTo(advance, 0);
  }
}

describe("text layer font", function () {
  it("builds a font without outlines", function () {
    const advances = new Map([
      [0x20, 250],
      [0x41, 722.5],
      [0x56, 722.5],
      [0x65, 444],
      [0x301, 0],
      [0x1f600, 1000],
    ]);
    const data = buildTextLayerFont(advances, 0.75);
    const font = new FontTestData(data);
    const { view, tables, unitsPerEm } = font;

    expect(view.getUint32(0)).toEqual(0x00010000);
    expect(tables.get("glyf").length).toEqual(1);
    const vendorId = tables.get("OS/2").offset + 58;
    expect(bytesToString(data.subarray(vendorId, vendorId + 4))).toEqual(
      "PDFJ"
    );
    const hhea = tables.get("hhea").offset;
    const ascender = view.getInt16(hhea + 4);
    const descender = view.getInt16(hhea + 6);
    expect(ascender / unitsPerEm).toBeCloseTo(0.75, 3);
    expect(ascender - descender).toEqual(unitsPerEm);

    expectAdvances(font, advances);
    // Equal advances share a glyph.
    expect(font.getGlyphId(0x41)).toEqual(font.getGlyphId(0x56));
    expect(font.getGlyphId(0x41)).not.toEqual(font.getGlyphId(0x65));
  });

  it("builds a font whose glyphs are boxes, for debugging", function () {
    const advances = new Map([
      [0x41, 722.5],
      [0x65, 444],
      [0x301, 0],
    ]);
    const font = new FontTestData(buildTextLayerFont(advances, 0.75, true));
    const { view, tables, renderer } = font;
    expect(view.getInt16(tables.get("head").offset + 50)).toEqual(1);
    const hhea = tables.get("hhea").offset;
    const ascender = view.getInt16(hhea + 4);
    const descender = view.getInt16(hhea + 6);
    const hmtx = tables.get("hmtx").offset;
    const loca = tables.get("loca").offset;
    const glyf = tables.get("glyf").offset;

    for (const codePoint of advances.keys()) {
      const glyphId = font.getGlyphId(codePoint);
      const start = view.getUint32(loca + 4 * glyphId);
      const end = view.getUint32(loca + 4 * glyphId + 4);
      if (codePoint === 0x301) {
        expect(end).toEqual(start);
        continue;
      }
      const offset = glyf + start;
      // Two contours bounded by the advance and the line metrics.
      expect([0, 2, 4, 6, 8].map(i => view.getInt16(offset + i)))
        .withContext(`U+${codePoint.toString(16)}`)
        .toEqual([
          2,
          0,
          descender,
          view.getUint16(hmtx + 4 * glyphId),
          ascender,
        ]);
      expect(
        renderer.compileGlyph(renderer.glyphs[glyphId], glyphId).length
      ).toBeGreaterThan(0);
    }
  });

  it("builds the fonts whose glyphs are boxes, for debugging", function () {
    const getGlyfLength = drawBoxes => {
      const { data } = getTextLayerFont([["a", 500]], { drawBoxes });
      return new FontTestData(data).tables.get("glyf").length;
    };
    expect(getGlyfLength(false)).toEqual(1);
    expect(getGlyfLength(true)).toBeGreaterThan(1);
  });

  it("clamps the average advance and keeps a Windows ascent", function () {
    const { data } = getTextLayerFont(
      [
        ["A", 80000],
        ["B", 90000],
        [" ", 100000],
      ],
      { font: { isType3Font: true, bbox: [0, -100, 80, 0] } }
    );
    const { view, tables } = new FontTestData(data);
    const offset = tables.get("OS/2").offset;
    expect(view.getInt16(offset + 2)).toEqual(0x7fff); // xAvgCharWidth
    expect(view.getInt16(offset + 68)).toEqual(0); // sTypoAscender
    expect(view.getUint16(offset + 74)).toEqual(1); // usWinAscent
  });

  it("keeps a default space which would round to zero", function () {
    const { data, advanceScale } = getTextLayerFont([["A", 40000000]]);
    expect(advanceScale).toEqual(2048);
    const font = new FontTestData(data);
    expect(font.getAdvance(0x41) * advanceScale).toEqual(40000000);
    expect(font.getAdvance(0x20)).toBeGreaterThan(0);
  });

  it("doesn't build a font whose measured space would round to zero", function () {
    const glyphs = [
      ["A", 1000],
      ["B", 1000],
      ["C", 40000000],
    ];
    expect(getTextLayerFont(glyphs, { spaceGaps: [300] })).toBeNull();
  });

  it("doesn't build a font with advances which don't fit", function () {
    expect(buildTextLayerFont(new Map([[0x41, 117000]]), 0.8)).toBeNull();
    expect(buildTextLayerFont(new Map([[0x41, NaN]]), 0.8)).toBeNull();
    // The narrow glyph would vanish at the scale of the widest one.
    expect(
      getTextLayerFont([
        ["A", 1],
        ["B", 200000],
      ])
    ).toBeNull();
  });

  it("encodes wide advances with the smallest scale which fits them", function () {
    const { data, advanceScale } = getTextLayerFont([
      ["A", 80000],
      ["B", 10],
    ]);
    expect(advanceScale).toEqual(4);
    const font = new FontTestData(data);
    expect(font.getAdvance(0x41) * advanceScale).toEqual(80000);
    expect(font.getAdvance(0x42) * advanceScale).toBeCloseTo(10, 0);
  });

  it("gets the most frequent advance of a character", function () {
    const { name, data, ascent } = getTextLayerFont([
      ["a", 500],
      ["a", 600],
      ["a", 500],
    ]);
    expect(name).toEqual("g_d0_tf1");
    expect(ascent).toEqual(0.8);
    // The text layer can have spaces which aren't in the PDF.
    expectAdvances(new FontTestData(data), [
      [0x61, 500],
      [0x20, 250],
    ]);
  });

  it("gives no advance to the nonspacing marks and the default-ignorable characters", function () {
    const { data } = getTextLayerFont([
      ["á", 600],
      ["́", 300],
      ["‍", 300],
    ]);
    expectAdvances(new FontTestData(data), [
      [0x61, 600],
      [0x301, 0],
      [0x200d, 0],
    ]);
  });

  it("handles single supplementary code points and skips unpaired surrogates", function () {
    const { data } = getTextLayerFont([
      ["\u{1f600}", 1000],
      ["\u{e0100}", 300],
      ["\ud800", 400],
      ["\udfff", 400],
    ]);
    const font = new FontTestData(data);
    expectAdvances(font, [
      [0x1f600, 1000],
      [0xe0100, 0],
    ]);
    expect(
      font.renderer.cmap.some(
        ({ start, end }) => start <= 0xdfff && end >= 0xd800
      )
    ).toBeFalse();
  });

  it("gets the advance of the characters only drawn in ligatures", function () {
    const { data } = getTextLayerFont([
      ["f", 300],
      ["fi", 520],
      ["ffl", 900],
    ]);
    expectAdvances(new FontTestData(data), [
      [0x66, 300],
      [0x69, 220],
      [0x6c, 300],
    ]);
  });

  it("includes the Thai and Lao SARA AM shaping components", function () {
    const { data } = getTextLayerFont([
      ["\u0e33", 500],
      ["\u0eb3", 450],
      ["\u0eb2", 400],
    ]);
    expectAdvances(new FontTestData(data), [
      [0x0e33, 500],
      [0x0e4d, 0],
      [0x0e32, 500],
      [0x0eb3, 450],
      [0x0ecd, 0],
      [0x0eb2, 400],
    ]);
  });

  it("gets the ascent from the font, else from its bounding box", function () {
    const getAscent = (font, heightScaled = false) =>
      getTextLayerFont([["a", 500]], { font, heightScaled }).ascent;

    expect(getAscent({ ascent: 0.9, descent: -0.3 })).toBeCloseTo(0.75, 6);
    // With a descent having the wrong sign.
    expect(getAscent({ ascent: 0.7, descent: 0.3 })).toBeCloseTo(0.7, 6);
    expect(
      getAscent({ ascent: NaN, descent: NaN, bbox: [-100, -250, 1000, 750] })
    ).toBeCloseTo(0.75, 6);
    // With the flipped glyph space of a Type3 font.
    expect(
      getAscent({
        ascent: NaN,
        descent: NaN,
        bbox: [0, -75, 100, 25],
        fontMatrix: [0.01, 0, 0, -0.01, 0, 0],
        isType3Font: true,
      })
    ).toBeCloseTo(0.75, 6);
    expect(getAscent({ ascent: 0, descent: 0, bbox: [0, 0, 0, 0] })).toEqual(
      0.8
    );
    // When the item height is the bbox height, it already carries the flip.
    expect(
      getAscent(
        {
          ascent: NaN,
          descent: NaN,
          bbox: [-5, -25, 97, 91],
          fontMatrix: [1, 0, 0, -1, 0, 0],
          isType3Font: true,
        },
        /* heightScaled = */ true
      )
    ).toBeCloseTo(91 / 116, 6);
    // A Type 3 drawing can also lie entirely below the baseline.
    expect(
      getAscent({
        isType3Font: true,
        bbox: [0, 0, 80, 100],
        fontMatrix: [1, 0, 0, -1, 0, 0],
      })
    ).toBe(0);
    // The d1 bounds of the glyphs win over a placeholder FontBBox.
    expect(
      getAscent({
        isType3Font: true,
        bbox: [0, 0, 1000, 1000],
        glyphBBox: [1, -71, 91, 16],
        fontMatrix: [1, 0, 0, -1, 0, 0],
      })
    ).toBeCloseTo(71 / 87, 6);
    // Vertical glyphs are centered on their column.
    expect(getAscent({ ascent: 0.9, descent: -0.3, vertical: true })).toEqual(
      0.5
    );
  });

  it("only builds the fonts of the styles", function () {
    const sink = createSink();
    let id = 0;
    const extraction = new TextExtraction(sink, {
      idFactory: {
        getDocId: () => "g_d0",
        createFontId: () => `f${++id}`,
      },
    });
    const font1 = { ascent: 0.8, descent: -0.2 };
    const font2 = { ascent: 0.8, descent: -0.2 };
    extraction.addFont("f1", font1);
    extraction.fonts.addGlyph(font1, "a", 500);
    // E.g. a font with the same name as the one of the current item.
    extraction.fonts.addGlyph(font2, "b", 500);
    extraction.enqueue({ items: [], styles: { f1: {} } });
    extraction.send();

    expect(sink.chunks[0].styles.f1.textLayerFont.name).toEqual("g_d0_tf1");
    expect(id).toEqual(1);
  });

  it("stops the text content extraction when its stream is cancelled", async function () {
    const sink = createSink();
    const extraction = new TextExtraction(sink, { idFactory });
    await expectAsync(extraction.ready).toBeResolved();
    extraction.enqueue({ items: [], styles: {} });

    sink.isCancelled = true;
    await expectAsync(extraction.ready).toBeRejectedWith(
      jasmine.any(AbortException)
    );
    extraction.send();
    expect(sink.chunks).toEqual([]);
  });
});
