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

import {
  captureBuiltInCMaps,
  captureCFFPrograms,
  captureFontCharCodes,
  captureFonts,
  captureOpenTypeTables,
  captureToUnicodeStreams,
  captureType3GlyphMasks,
} from "./font_utils.js";
import { benchmark } from "./bench_utils.js";
import { CFFParser } from "../../src/core/cff_parser.js";
import { CMapFactory } from "../../src/core/cmap.js";
import { compileType3Glyph } from "../../src/core/fonts_utils.js";
import { describe } from "vitest";
import { Font } from "../../src/core/fonts.js";
import { getUnicodeRangeFor } from "../../src/core/unicode.js";
import { Name } from "../../src/core/primitives.js";
import { OpenTypeFileBuilder } from "../../src/core/opentype_file_builder.js";
import { Stream } from "../../src/core/stream.js";

const FONTS = [
  {
    type: "TrueType",
    filename: "issue14297.pdf",
    filter: ({ type, composite }) => type === "TrueType" && !composite,
  },
  {
    type: "CIDFontType2",
    filename: "issue6127.pdf",
    filter: ({ type }) => type === "CIDFontType2",
  },
  {
    type: "Type1",
    filename: "tracemonkey.pdf",
    filter: ({ type, fontFileN }) =>
      type === "Type1" && fontFileN === "FontFile",
  },
  {
    type: "Type1C",
    filename: "issue6132.pdf",
    filter: ({ subtype }) => subtype === "Type1C",
  },
  {
    type: "CIDFontType0C",
    filename: "pr12828.pdf",
    filter: ({ subtype }) => subtype === "CIDFontType0C",
  },
];
for (const entry of FONTS) {
  entry.fonts = await captureFonts(entry.filename, entry.filter);
}

const CFF_PROGRAMS = await captureCFFPrograms(
  FONTS.filter(
    ({ type }) => type === "Type1C" || type === "CIDFontType0C"
  ).flatMap(({ fonts }) => fonts)
);
const OPENTYPE_TABLES = await captureOpenTypeTables(
  FONTS.flatMap(({ fonts }) => fonts)
);
const FONT_CHAR_CODES = await captureFontCharCodes(
  "bug1473809.pdf",
  ({ type }) => type === "CIDFontType2"
);
const TO_UNICODE_STREAMS = await captureToUnicodeStreams("issue6127.pdf");
const BUILT_IN_CMAPS = [
  await captureBuiltInCMaps("noembed-sjis.pdf"),
  await captureBuiltInCMaps("issue2128r.pdf"),
];
const TYPE3_GLYPH_MASKS = await captureType3GlyphMasks("issue918.pdf");

describe("fonts", () => {
  for (const { type, filename, fonts } of FONTS) {
    benchmark(`Font: ${type} (${filename})`, () =>
      fonts.map(font => new Font(...font.args()))
    );
  }

  benchmark("CFFParser.parse", () =>
    CFF_PROGRAMS.map(cff => new CFFParser(...cff.args()).parse())
  );

  benchmark("OpenTypeFileBuilder.toArray", () =>
    OPENTYPE_TABLES.map(({ sfnt, tables }) => {
      const builder = new OpenTypeFileBuilder(sfnt);
      for (const [tag, data] of tables) {
        builder.addTable(tag, data);
      }
      return builder.toArray();
    })
  );

  benchmark("getUnicodeRangeFor (bug1473809.pdf)", () => {
    let count = 0;
    for (const charCodes of FONT_CHAR_CODES) {
      let position = -1;
      for (const charCode of charCodes) {
        position = getUnicodeRangeFor(charCode, position);
        count += position;
      }
    }
    return count;
  });

  benchmark("readToUnicode (issue6127.pdf)", async () =>
    Promise.all(
      TO_UNICODE_STREAMS.map(({ evaluator, bytes }) =>
        evaluator.readToUnicode(new Stream(bytes))
      )
    )
  );

  benchmark("CMapFactory.create: built-in CMaps", async () =>
    Promise.all(
      BUILT_IN_CMAPS.flatMap(({ names, fetchBuiltInCMap }) =>
        names.map(name =>
          CMapFactory.create({
            encoding: Name.get(name),
            fetchBuiltInCMap,
            useCMap: null,
          })
        )
      )
    )
  );

  benchmark("compileType3Glyph (issue918.pdf)", () =>
    TYPE3_GLYPH_MASKS.map(mask => compileType3Glyph(mask))
  );
});
