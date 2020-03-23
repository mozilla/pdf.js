/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _pdf_find_utils = require("../../web/pdf_find_utils.js");

describe("pdf_find_utils", function () {
  describe("getCharacterType", function () {
    it("gets expected character types", function () {
      const characters = {
        A: _pdf_find_utils.CharacterType.ALPHA_LETTER,
        a: _pdf_find_utils.CharacterType.ALPHA_LETTER,
        "0": _pdf_find_utils.CharacterType.ALPHA_LETTER,
        "5": _pdf_find_utils.CharacterType.ALPHA_LETTER,
        Ä: _pdf_find_utils.CharacterType.ALPHA_LETTER,
        ä: _pdf_find_utils.CharacterType.ALPHA_LETTER,
        _: _pdf_find_utils.CharacterType.ALPHA_LETTER,
        " ": _pdf_find_utils.CharacterType.SPACE,
        "\t": _pdf_find_utils.CharacterType.SPACE,
        "\r": _pdf_find_utils.CharacterType.SPACE,
        "\n": _pdf_find_utils.CharacterType.SPACE,
        "\xA0": _pdf_find_utils.CharacterType.SPACE,
        "-": _pdf_find_utils.CharacterType.PUNCT,
        ",": _pdf_find_utils.CharacterType.PUNCT,
        ".": _pdf_find_utils.CharacterType.PUNCT,
        ";": _pdf_find_utils.CharacterType.PUNCT,
        ":": _pdf_find_utils.CharacterType.PUNCT,
        "\u2122": _pdf_find_utils.CharacterType.ALPHA_LETTER,
        ล: _pdf_find_utils.CharacterType.THAI_LETTER,
        䀀: _pdf_find_utils.CharacterType.HAN_LETTER,
        縷: _pdf_find_utils.CharacterType.HAN_LETTER,
        ダ: _pdf_find_utils.CharacterType.KATAKANA_LETTER,
        ぐ: _pdf_find_utils.CharacterType.HIRAGANA_LETTER,
        ﾀ: _pdf_find_utils.CharacterType.HALFWIDTH_KATAKANA_LETTER
      };

      for (const character in characters) {
        const charCode = character.charCodeAt(0);
        const type = characters[character];
        expect((0, _pdf_find_utils.getCharacterType)(charCode)).toEqual(type);
      }
    });
  });
});