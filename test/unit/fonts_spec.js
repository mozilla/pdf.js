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

import { CFFCompiler, CFFParser } from "../../src/core/cff_parser.js";
import {
  CMAP_URL,
  DefaultBinaryDataFactory,
  fetchBuiltInCMapHelper,
} from "./test_utils.js";
import { CMapFactory, IdentityCMap } from "../../src/core/cmap.js";
import {
  IdentityToUnicodeMap,
  ToUnicodeMap,
} from "../../src/core/to_unicode_map.js";
import { CharCodeMap } from "../../src/core/char_code_map.js";
import { Font } from "../../src/core/fonts.js";
import { Name } from "../../src/core/primitives.js";
import { SEAC_ANALYSIS_ENABLED } from "../../src/core/fonts_utils.js";
import { Stream } from "../../src/core/stream.js";

describe("Font", () => {
  describe("charsToGlyphs", () => {
    // Match the sparse metric arrays from PartialEvaluator.extractWidths.
    function createFont(vertical) {
      return new Font(
        "TestFont",
        null,
        {
          type: "CIDFontType2",
          composite: true,
          vertical,
          cMap: new IdentityCMap(vertical, 2),
          cidEncoding: vertical ? "Identity-V" : "Identity-H",
          toUnicode: new IdentityToUnicodeMap(65, 68),
          differences: new Map(),
          defaultEncoding: [],
          widths: Object.assign([], { 65: 600, 66: 0, 68: 800 }),
          defaultWidth: 1000,
          vmetrics: vertical ? Object.assign([], { 68: [-800, 175, 700] }) : [],
          defaultVMetrics: vertical ? [-1200, 500, 900] : undefined,
        },
        {}
      );
    }

    it("should use half the glyph width for the default vertical origin", () => {
      const font = createFont(/* vertical = */ true);
      const glyphs = font.charsToGlyphs("\x00A\x00B\x00C\x00D");

      // Cover per-glyph widths, zero width, DW fallback, and explicit W2.
      expect(glyphs.map(glyph => glyph.vmetric)).toEqual([
        [-1200, 300, 900],
        [-1200, 0, 900],
        [-1200, 500, 900],
        [-800, 175, 700],
      ]);
      expect(font.defaultVMetrics).toEqual([-1200, 500, 900]);
    });

    it("should not set a vertical metric for horizontal fonts", () => {
      const font = createFont(/* vertical = */ false);
      const glyphs = font.charsToGlyphs("\x00A\x00B\x00C\x00D");

      for (const glyph of glyphs) {
        expect(glyph.vmetric).toBeUndefined();
      }
    });
  });

  describe("vertical glyphs in non-embedded fonts", () => {
    const binaryDataFactory = new DefaultBinaryDataFactory({
      cMapUrl: CMAP_URL,
    });
    const fetchBuiltInCMap = name =>
      fetchBuiltInCMapHelper(binaryDataFactory, /* cMapPacked = */ true, name);

    async function getGlyphs(cMapName, charCodes, unicodes = charCodes) {
      const cMap = await CMapFactory.create({
        encoding: Name.get(cMapName),
        fetchBuiltInCMap,
        useCMap: null,
      });
      const toUnicode = new CharCodeMap();
      for (let i = 0; i < charCodes.length; i++) {
        toUnicode.set(charCodes[i], String.fromCharCode(unicodes[i]));
      }
      const font = new Font(
        "TestFont",
        null,
        {
          type: "CIDFontType0",
          composite: true,
          vertical: cMap.vertical,
          cMap,
          cidEncoding: cMapName,
          toUnicode: new ToUnicodeMap(toUnicode),
          differences: new Map(),
          defaultEncoding: [],
          widths: [],
          defaultWidth: 1000,
          vmetrics: [],
          defaultVMetrics: [-1000, 500, 880],
        },
        {}
      );
      expect(font.missingFile).toBeTrue();

      const chars = charCodes.map(c => String.fromCharCode(c >> 8, c & 0xff));
      return font
        .charsToGlyphs(chars.join(""))
        .map(({ fontChar, isRotated }) => ({ fontChar, isRotated }));
    }

    it("should only use the vertical variants defined by the CMap", async () => {
      const glyphs = await getGlyphs(
        "UniJIS-UTF16-V",
        [0x3001, 0xff01, 0x301c, 0x3042]
      );

      expect(glyphs).toEqual([
        { fontChar: "︑", isRotated: false },
        // U+FF01 maps to CID 642 in both UniJIS-UTF16-H and UniJIS-UTF16-V.
        { fontChar: "！", isRotated: false },
        { fontChar: "〜", isRotated: true },
        { fontChar: "あ", isRotated: false },
      ]);
    });

    it("should handle a half-width vertical CMap", async () => {
      // UniJIS-UCS2-HW-V directly inherits UniJIS-UCS2-H.
      const glyphs = await getGlyphs("UniJIS-UCS2-HW-V", [0x301c, 0xff01]);

      expect(glyphs).toEqual([
        { fontChar: "〜", isRotated: true },
        { fontChar: "！", isRotated: false },
      ]);
    });

    it("should use all the vertical variants with an Identity-V CMap", async () => {
      // Identity-V has no base CMap to compare with.
      const glyphs = await getGlyphs(
        "Identity-V",
        [7887, 642, 7894],
        [0x3001, 0xff01, 0x301c]
      );

      expect(glyphs).toEqual([
        { fontChar: "︑", isRotated: false },
        { fontChar: "︕", isRotated: false },
        { fontChar: "〜", isRotated: true },
      ]);
    });

    it("should not use any vertical variant in a horizontal font", async () => {
      const glyphs = await getGlyphs("UniJIS-UTF16-H", [0x3001, 0x301c]);

      expect(glyphs).toEqual([
        { fontChar: "、", isRotated: false },
        { fontChar: "〜", isRotated: false },
      ]);
    });

    it("should not rotate the fullwidth macron", async () => {
      const glyphs = await getGlyphs("Identity-V", [1, 2], [0x30fc, 0xffe3]);

      expect(glyphs).toEqual([
        { fontChar: "ー", isRotated: true },
        { fontChar: "￣", isRotated: false },
      ]);
    });
  });

  describe("encodeString", () => {
    // `encodeString` only reads `this.toUnicode` and `this.cMap`, so a
    // full `Font` (which needs a complete properties/font-file setup) isn't
    // necessary to exercise it in isolation.
    function encodeString(str, { cMap = null } = {}) {
      const fakeFont = {
        toUnicode: new IdentityToUnicodeMap(0, 0x10ffff),
        cMap,
      };
      return Font.prototype.encodeString.call(fakeFont, str);
    }

    it("should keep the character after U+FFFE or U+FFFF", () => {
      expect(encodeString("￿A")).toEqual(["\xffA"]);
      expect(encodeString("￾B")).toEqual(["\xfeB"]);
    });

    it("should still treat a real surrogate pair as one code point", () => {
      // U+1F602 ("😂") is genuinely represented by a surrogate pair; the
      // character after it must still be kept, and the pair itself must
      // not be split into its two unpaired halves.
      expect(encodeString("😂C")).toEqual(["\x02C"]);
    });
  });

  describe("format 12 cmap parsing", () => {
    function concat(arrays) {
      let length = 0;
      for (const array of arrays) {
        length += array.length;
      }
      const out = new Uint8Array(length);
      let offset = 0;
      for (const array of arrays) {
        out.set(array, offset);
        offset += array.length;
      }
      return out;
    }
    function u16(value) {
      return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
    }
    function u32(value) {
      return new Uint8Array([
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
      ]);
    }
    function pad4(array) {
      const remainder = array.length % 4;
      return remainder ? concat([array, new Uint8Array(4 - remainder)]) : array;
    }
    // Groups are [startCharCode, endCharCode, startGlyphId] triples.
    function format12(groups, { length, nGroups } = {}) {
      const parts = [
        u16(12),
        u16(0),
        u32(length ?? 16 + 12 * groups.length),
        u32(0),
        u32(nGroups ?? groups.length),
      ];
      for (const [start, end, glyphId] of groups) {
        parts.push(u32(start), u32(end), u32(glyphId));
      }
      return concat(parts);
    }
    function loadFont(numGlyphs, cmapSubtable, glyphs = null) {
      const head = concat([
        u32(0x00010000),
        u32(0x00010000),
        u32(0),
        u32(0x5f0f3cf5),
        u16(0),
        u16(1000),
        u32(0),
        u32(0),
        u32(0),
        u32(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(8),
        u16(0),
        u16(0),
        u16(0),
      ]);
      const maxp = concat([
        u32(0x00010000),
        u16(numGlyphs),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
      ]);
      const hhea = concat([
        u32(0x00010000),
        u16(800),
        u16(0),
        u16(0),
        u16(500),
        u16(0),
        u16(0),
        u16(500),
        u16(1),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u16(1),
      ]);
      const hmtx = concat([u16(500), u16(0)]);
      // Without glyphs, repair rebuilds loca/glyf with a fallback glyph.
      let loca = new Uint8Array(6);
      let glyf = new Uint8Array(4);
      if (glyphs) {
        let glyphOffset = 0;
        loca = concat([
          u16(0),
          ...glyphs.map(glyph => {
            glyphOffset += glyph.length;
            return u16(glyphOffset / 2);
          }),
        ]);
        glyf = concat(glyphs);
      }
      const post = concat([
        u32(0x00030000),
        u32(0),
        u16(0),
        u16(0),
        u32(0),
        u32(0),
        u32(0),
        u32(0),
        u32(0),
      ]);
      // Use (3, 1): readCmapTable does not select (3, 10) subtables.
      const cmap = concat([
        u16(0),
        u16(1),
        u16(3),
        u16(1),
        u32(12),
        cmapSubtable,
      ]);

      const tables = [
        ["cmap", cmap],
        ["glyf", glyf],
        ["head", head],
        ["hhea", hhea],
        ["hmtx", hmtx],
        ["loca", loca],
        ["maxp", maxp],
        ["post", post],
      ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      let searchRange = 1,
        entrySelector = 0;
      while (searchRange * 2 <= tables.length) {
        searchRange *= 2;
        entrySelector++;
      }
      searchRange *= 16;
      const sfntHeader = concat([
        u32(0x00010000),
        u16(tables.length),
        u16(searchRange),
        u16(entrySelector),
        u16(tables.length * 16 - searchRange),
      ]);
      let offset = sfntHeader.length + tables.length * 16;
      const directory = [],
        bodies = [];
      for (const [tableTag, data] of tables) {
        directory.push(
          concat([
            Uint8Array.from(tableTag, c => c.charCodeAt(0)),
            u32(0),
            u32(offset),
            u32(data.length),
          ])
        );
        const padded = pad4(data);
        bodies.push(padded);
        offset += padded.length;
      }
      const file = new Stream(concat([sfntHeader, ...directory, ...bodies]));

      return new Font(
        "TestFont",
        file,
        {
          type: "TrueType",
          composite: false,
          loadedName: "font",
          differences: new Map(),
          defaultEncoding: [],
          hasEncoding: false,
          glyphNames: null,
          italicAngle: 0,
          firstChar: 0,
          lastChar: 0xffff,
          xHeight: 0,
          capHeight: 800,
          ascent: 800,
          descent: 0,
          toUnicode: new IdentityToUnicodeMap(0, 0xffff),
          widths: [],
          defaultWidth: 0,
        },
        { fontExtraProperties: false }
      );
    }

    it("preserves valid supplementary mappings and the last glyph", () => {
      // One contour, one point at (1, 1), no instructions.
      const glyph = new Uint8Array([
        0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0x37, 1, 1, 0,
      ]);
      const font = loadFont(
        4,
        format12([
          [0x41, 0x41, 1],
          [0x10000, 0x10001, 2],
          [0x10ffff, 0x10ffff, 3],
        ]),
        [new Uint8Array(0), glyph, glyph, glyph]
      );

      expect([...font.toFontChar.keys()]).toEqual([
        0x41, 0x10000, 0x10001, 0x10ffff,
      ]);
      // Check glyph IDs after remapping char codes to the private-use area.
      for (const [charCode, glyphId] of [
        [0x41, 1],
        [0x10000, 2],
        [0x10001, 3],
        [0x10ffff, 3],
      ]) {
        const fontChar = font.toFontChar.get(charCode);
        const { start, idDelta, ids } = font.renderer.cmap.find(
          range => range.start <= fontChar && fontChar <= range.end
        );
        const mappedGlyphId = ids ? ids[fontChar - start] : fontChar;
        expect((mappedGlyphId + idDelta) & 0xffff).toBe(glyphId);
      }
    });

    it("does not expand a group spanning the whole 32-bit range", () => {
      const font = loadFont(4, format12([[0, 0xffffffff, 0]]));
      // The original parser would expand this group to 2^32 mappings.
      expect(font.data.length).toBeLessThan(0x10000);
    });

    it("does not trust an inflated length or group count", () => {
      const font = loadFont(
        4,
        format12([[0, 0xffffffff, 0]], {
          length: 0xffffffff,
          nGroups: 0xffffffff,
        })
      );
      expect(font.data.length).toBeLessThan(0x10000);
    });

    it("bounds the total mappings across many groups", () => {
      // Without the aggregate bound: 1024 * 65535 mappings.
      const groups = Array.from({ length: 1024 }, () => [0, 65534, 0]);
      const font = loadFont(65535, format12(groups));
      expect(font.data.length).toBeLessThan(0x400000);
    });
  });

  describe("head table", () => {
    // Example font from Appendix D of the CFF spec:
    // https://adobe-type-tools.github.io/font-tech-notes/pdfs/5176.CFF.pdf
    const exampleFont = Uint8Array.fromHex(
      "0100040100010101134142434445462b" +
        "54696d65732d526f6d616e000101011f" +
        "f81b00f81c02f81d03f819041c6f000d" +
        "fb3cfb6efa7cfa1605e911b8f1120003" +
        "01010813183030312e30303754696d65" +
        "7320526f6d616e54696d657300000002" +
        "010102030e0e7d99f92a99fb7695f773" +
        "8b06f79a93fc7c8c077d99f85695f75e" +
        "9908fb6e8cf87393f7108b09a70adf0b" +
        "f78e14"
    );

    function createFont(fontBBox) {
      const cff = new CFFParser(
        new Stream(exampleFont),
        {},
        SEAC_ANALYSIS_ENABLED
      ).parse();
      cff.topDict.setByName("FontBBox", fontBBox);

      return new Font(
        "TestFont",
        new Stream(new CFFCompiler(cff).compile()),
        {
          type: "Type1",
          subtype: "Type1C",
          composite: false,
          loadedName: "font",
          differences: new Map(),
          defaultEncoding: [],
          toUnicode: new IdentityToUnicodeMap(0, 255),
          widths: [],
          defaultWidth: 0,
          italicAngle: 0,
          xHeight: 0,
          capHeight: 0,
        },
        {}
      );
    }

    function getHorizontalExtents(data) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const numTables = view.getUint16(4);
      for (let i = 0; i < numTables; i++) {
        const record = 12 + i * 16;
        const tag = String.fromCharCode(...data.subarray(record, record + 4));
        if (tag === "head") {
          const offset = view.getUint32(record + 8);
          return [view.getInt16(offset + 36), view.getInt16(offset + 40)];
        }
      }
      return null;
    }

    it("should extend the horizontal extents with the font bbox", () => {
      // FontDescriptor bbox from bug 1888084.
      let font = createFont([-1044, -3060, 4087.9998, 3560]);

      expect(font.missingFile).withContext("bug 1888084").toBeFalse();
      expect(getHorizontalExtents(font.data))
        .withContext("bug 1888084")
        .toEqual([-1044, 0x0fff]);

      font = createFont([-100.5, -218, 5000.5, 898]);

      expect(font.missingFile).withContext("wide bbox").toBeFalse();
      expect(getHorizontalExtents(font.data))
        .withContext("wide bbox")
        .toEqual([-101, 5001]);
    });

    it("should not shrink the default horizontal extents", () => {
      const font = createFont([100, -218, 1000, 898]);

      expect(font.missingFile).toBeFalse();
      expect(getHorizontalExtents(font.data)).toEqual([0, 0x0fff]);
    });
  });
});
