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

import { ttx, verifyTtxOutput } from "./fontutils.js";
import { Font } from "../../src/core/fonts.js";
import { Stream } from "../../src/core/stream.js";
import { ToUnicodeMap } from "../../src/core/to_unicode_map.js";

// Minimal TrueType font: 4 glyphs (.notdef, space, A, B), OS/2 v1 / 86 bytes,
// no hinting tables.
const baseFont = Uint8Array.fromBase64(
  "AAEAAAAKAIAAAwAgT1MvMkTeRDYAAAEoAAAAVmNtYXAAdQBcAAABjAAAADxnbHlmmNLJuAAAAdQAAABKaGVhZC3Q8mwAAACsAAAANmhoZWEFFgH2AAAA5AAAACRobXR4AlgAAAAAAYAAAAAKbG9jYQAyACYAAAHIAAAACm1heHAABgAGAAABCAAAACBuYW1lAJlcyAAAAiAAAAA8cG9zdAAuACQAAAJcAAAAKgABAAAAAQAAfM/c718PPPUAAQPoAAAAAOYyVzYAAAAA5jJXNgAAAAACWAMgAAAAAwACAAAAAAAAAAEAAAMg/zgAAAJYAAAAZAH0AAEAAAAAAAAAAAAAAAAAAAABAAEAAAAEAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAQJYAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAQgMg/zgAAAMgAMgAAAAAAAAAAAAAAlgAAAAAAAAAAAAAAAAAAgAAAAMAAAAUAAMAAQAAABQABAAoAAAABgAEAAEAAgAgAEL//wAAACAAQf///+H/wQABAAAAAAAAAAAADQANABkAJQAAAAEAZAAAAlgDIAADAAAzIREhZAH0/gwDIAAAAQAAAAAB9AK8AAMAADEhESEB9P4MArwAAQAAAAAB9AK8AAMAADEhESEB9P4MArwAAAAAAAQANgABAAAAAAABAAEAAAABAAAAAAACAAEAAQADAAEECQABAAIAAgADAAEECQACAAIABFRSAFQAUgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAADACQAJQAA"
);

function clone(buf) {
  return new Uint8Array(buf);
}

function readUint16(buf, pos) {
  return (buf[pos] << 8) | buf[pos + 1];
}

function readUint32(buf, pos) {
  return (
    buf[pos] * 0x1000000 +
    ((buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3])
  );
}

function getTables(buf) {
  const tables = Object.create(null);
  const numTables = readUint16(buf, 4);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(
      buf[off],
      buf[off + 1],
      buf[off + 2],
      buf[off + 3]
    );
    tables[tag] = {
      offset: readUint32(buf, off + 8),
      length: readUint32(buf, off + 12),
    };
  }
  return tables;
}

function makeProperties(toUnicode) {
  return {
    loadedName: "font",
    type: "TrueType",
    differences: [],
    defaultEncoding: [],
    toUnicode,
    xHeight: 0,
    capHeight: 0,
    italicAngle: 0,
    firstChar: 0,
    lastChar: 255,
  };
}

describe("font_glyf", function () {
  describe("Cyclic composite glyph 0", function () {
    it("removes a self-referencing composite glyph 0 (issue 21298)", async function () {
      const buggy = clone(baseFont);
      const tables = getTables(buggy);
      const headOff = tables.head.offset;
      const indexToLocFormat = readUint16(buggy, headOff + 50);
      const locaOff = tables.loca.offset;
      const glyf0 =
        indexToLocFormat === 0
          ? readUint16(buggy, locaOff) * 2
          : readUint32(buggy, locaOff);
      const glyf0End =
        indexToLocFormat === 0
          ? readUint16(buggy, locaOff + 2) * 2
          : readUint32(buggy, locaOff + 4);
      const pos = tables.glyf.offset + glyf0;
      buggy.fill(0, pos, tables.glyf.offset + glyf0End);
      buggy[pos] = 0xff;
      buggy[pos + 1] = 0xff;
      buggy[pos + 11] = 0x02;

      const font = new Font(
        "font",
        new Stream(buggy),
        makeProperties(new ToUnicodeMap([])),
        {}
      );
      const output = await ttx(font.data);
      verifyTtxOutput(output);
      const notdef =
        /<TTGlyph[^>]*name="\.notdef"[^>]*\/>|<TTGlyph[^>]*name="\.notdef"[^>]*>([\s\S]*?)<\/TTGlyph>/.exec(
          output
        );
      expect(notdef).not.toBeNull();
      expect(notdef[1] || "").not.toMatch(
        /<component\b[^>]*glyphName="\.notdef"/
      );
    });
  });

  describe("OS/2 table length validation", function () {
    it("rewrites the OS/2 table when its length doesn't match the declared version", async function () {
      const buggy = clone(baseFont);
      const tables = getTables(buggy);
      const os2 = tables["OS/2"].offset;
      buggy[os2 + 62] = 0x00;
      buggy[os2 + 63] = 0x40;
      buggy[os2 + 1] = 0x03;

      const font = new Font(
        "font",
        new Stream(buggy),
        makeProperties(new ToUnicodeMap([])),
        {}
      );
      const output = await ttx(font.data);
      verifyTtxOutput(output);
      expect(
        /<OS_2>\s*(<!--[\s\S]*?-->\s*)?<version value="3"\/>/.test(output)
      ).toEqual(true);
      expect(/<sCapHeight\b/.test(output)).toEqual(true);
      expect(/<usMaxContext\b/.test(output)).toEqual(true);
    });
  });
});
