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

import { checkSanitization } from "./fontutils.js";
import { FontTestData } from "../unit/font_test_utils.js";
import { TextLayerFonts } from "../../src/core/text_layer_font.js";

describe("generated text layer fonts", function () {
  const idFactory = {
    getDocId: () => "g_d0",
    createFontId: () => "f1",
  };

  const ltrGlyphs = [
    ["A", 667],
    ["V", 667],
    ["\u0301", 0],
    ["\u{1f600}", 1000],
    ["\u0e33", 500],
    ["\u0eb3", 450],
  ];

  const rtlGlyphs = [
    ["\u05d0", 500],
    ["\u05d1", 500],
  ];
  const ltrPairs = [
    ["A", "V", -150],
    ["V", "A", -100],
  ];

  async function getKerningTables(glyphs, pairs = [], drawBoxes = false) {
    const font = { ascent: 0.8, descent: -0.2 };
    const fonts = new TextLayerFonts(idFactory, drawBoxes);
    for (const [unicode, advance] of glyphs) {
      fonts.addGlyph(font, unicode, advance);
    }
    for (const [left, right, advance] of pairs) {
      fonts.addKerning(font, left, right, advance);
    }
    const { data } = fonts.build(font);
    await expectAsync(checkSanitization(data)).toBeResolved();
    const { tables } = new FontTestData(data);
    return ["GPOS", "kern"].filter(tag => tables.has(tag));
  }

  it("passes OTS without kerning", async function () {
    expect(await getKerningTables(ltrGlyphs)).toEqual([]);
  });

  it("passes OTS with GPOS kerning and debug glyph boxes", async function () {
    expect(await getKerningTables(ltrGlyphs, ltrPairs, true)).toEqual(["GPOS"]);
  });

  it("passes OTS with GPOS kerning in a font with RTL glyphs", async function () {
    expect(
      await getKerningTables([...ltrGlyphs, ...rtlGlyphs], ltrPairs)
    ).toEqual(["GPOS"]);
  });

  it("passes OTS with a kern table for a neutral pair in a font with RTL glyphs", async function () {
    expect(
      await getKerningTables(
        [...ltrGlyphs, ...rtlGlyphs, [".", 250], ['"', 400]],
        [['"', ".", -100]]
      )
    ).toEqual(["kern"]);
  });

  it("passes OTS with a kern table for mixed LTR and RTL pairs", async function () {
    expect(
      await getKerningTables(
        [...ltrGlyphs, ...rtlGlyphs],
        [...ltrPairs, ["\u05d0", "\u05d1", -100]]
      )
    ).toEqual(["kern"]);
  });
});
