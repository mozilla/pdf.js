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
  { font = { ascent: 0.8, descent: -0.2 }, drawBoxes = false } = {}
) {
  const sink = createSink();
  const textLayerFonts = new TextLayerFonts(sink, idFactory, drawBoxes);
  textLayerFonts.addFont("f1", font);
  for (const [unicode, advance] of glyphs) {
    textLayerFonts.addGlyph(font, unicode, advance);
  }
  textLayerFonts.enqueue({ items: [], styles: { f1: {} } });
  textLayerFonts.send();
  return sink.chunks[0].styles.f1.textLayerFont;
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

  it("doesn't build a font with advances which don't fit", function () {
    expect(buildTextLayerFont(new Map([[0x41, 117000]]), 0.8)).toBeNull();
    expect(buildTextLayerFont(new Map([[0x41, NaN]]), 0.8)).toBeNull();
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

  it("gets the ascent from the font, else from its bounding box", function () {
    const getAscent = font => getTextLayerFont([["a", 500]], { font }).ascent;

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
    // Vertical glyphs are centered on their column.
    expect(getAscent({ ascent: 0.9, descent: -0.3, vertical: true })).toEqual(
      0.5
    );
  });

  it("only builds the fonts of the styles", function () {
    const sink = createSink();
    let id = 0;
    const textLayerFonts = new TextLayerFonts(sink, {
      getDocId: () => "g_d0",
      createFontId: () => `f${++id}`,
    });
    const font1 = { ascent: 0.8, descent: -0.2 };
    const font2 = { ascent: 0.8, descent: -0.2 };
    textLayerFonts.addFont("f1", font1);
    textLayerFonts.addGlyph(font1, "a", 500);
    // E.g. a font with the same name as the one of the current item.
    textLayerFonts.addGlyph(font2, "b", 500);
    textLayerFonts.enqueue({ items: [], styles: { f1: {} } });
    textLayerFonts.send();

    expect(sink.chunks[0].styles.f1.textLayerFont.name).toEqual("g_d0_tf1");
    expect(id).toEqual(1);
  });

  it("stops the text content extraction when its stream is cancelled", async function () {
    const sink = createSink();
    const textLayerFonts = new TextLayerFonts(sink, idFactory);
    await expectAsync(textLayerFonts.ready).toBeResolved();
    textLayerFonts.enqueue({ items: [], styles: {} });

    sink.isCancelled = true;
    await expectAsync(textLayerFonts.ready).toBeRejectedWith(
      jasmine.any(AbortException)
    );
    textLayerFonts.send();
    expect(sink.chunks).toEqual([]);
  });
});
