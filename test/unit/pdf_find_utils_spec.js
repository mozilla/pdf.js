/* Copyright 2018 Mozilla Foundation
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

import { CharacterType, getCharacterType } from "../../web/pdf_find_utils.js";

describe("pdf_find_utils", function () {
  describe("getCharacterType", function () {
    it("gets expected character types", function () {
      const characters = {
        A: CharacterType.ALPHA_LETTER,
        a: CharacterType.ALPHA_LETTER,
        0: CharacterType.ALPHA_LETTER,
        5: CharacterType.ALPHA_LETTER,
        "\xC4": CharacterType.ALPHA_LETTER, // "Ä"
        "\xE4": CharacterType.ALPHA_LETTER, // "ä"
        _: CharacterType.ALPHA_LETTER,
        " ": CharacterType.SPACE,
        "\t": CharacterType.SPACE,
        "\r": CharacterType.SPACE,
        "\n": CharacterType.SPACE,
        "\xA0": CharacterType.SPACE, // nbsp
        "-": CharacterType.PUNCT,
        ",": CharacterType.PUNCT,
        ".": CharacterType.PUNCT,
        ";": CharacterType.PUNCT,
        ":": CharacterType.PUNCT,
        "\u2122": CharacterType.ALPHA_LETTER, // trademark
        "\u0E25": CharacterType.THAI_LETTER,
        "\u4000": CharacterType.HAN_LETTER,
        "\uF950": CharacterType.HAN_LETTER,
        "\u30C0": CharacterType.KATAKANA_LETTER,
        "\u3050": CharacterType.HIRAGANA_LETTER,
        "\uFF80": CharacterType.HALFWIDTH_KATAKANA_LETTER,
      };

      for (const character in characters) {
        const charCode = character.charCodeAt(0);
        const type = characters[character];

        expect(getCharacterType(charCode)).toEqual(type);
      }
    });
  });
});
