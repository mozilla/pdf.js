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

const CharacterType = {
  SPACE: 0,
  ALPHA_LETTER: 1,
  PUNCT: 2,
  HAN_LETTER: 3,
  KATAKANA_LETTER: 4,
  HIRAGANA_LETTER: 5,
  HALFWIDTH_KATAKANA_LETTER: 6,
  THAI_LETTER: 7,
};

function isAlphabeticalScript(charCode) {
  return charCode < 0x2E80;
}

function isAscii(charCode) {
  return (charCode & 0xFF80) === 0;
}

function isAsciiAlpha(charCode) {
  return (charCode >= /* a = */ 0x61 && charCode <= /* z = */ 0x7A) ||
         (charCode >= /* A = */ 0x41 && charCode <= /* Z = */ 0x5A);
}

function isAsciiDigit(charCode) {
  return (charCode >= /* 0 = */ 0x30 && charCode <= /* 9 = */ 0x39);
}

function isAsciiSpace(charCode) {
  return (charCode === /* SPACE = */ 0x20 || charCode === /* TAB = */ 0x09 ||
          charCode === /* CR = */ 0x0D || charCode === /* LF = */ 0x0A);
}

function isHan(charCode) {
  return (charCode >= 0x3400 && charCode <= 0x9FFF) ||
         (charCode >= 0xF900 && charCode <= 0xFAFF);
}

function isKatakana(charCode) {
  return (charCode >= 0x30A0 && charCode <= 0x30FF);
}

function isHiragana(charCode) {
  return (charCode >= 0x3040 && charCode <= 0x309F);
}

function isHalfwidthKatakana(charCode) {
  return (charCode >= 0xFF60 && charCode <= 0xFF9F);
}

function isThai(charCode) {
  return (charCode & 0xFF80) === 0x0E00;
}

/**
 * This function is based on the word-break detection implemented in:
 * https://hg.mozilla.org/mozilla-central/file/tip/intl/lwbrk/WordBreaker.cpp
 */
function getCharacterType(charCode) {
  if (isAlphabeticalScript(charCode)) {
    if (isAscii(charCode)) {
      if (isAsciiSpace(charCode)) {
        return CharacterType.SPACE;
      } else if (isAsciiAlpha(charCode) || isAsciiDigit(charCode) ||
                 charCode === /* UNDERSCORE = */ 0x5F) {
        return CharacterType.ALPHA_LETTER;
      }
      return CharacterType.PUNCT;
    } else if (isThai(charCode)) {
      return CharacterType.THAI_LETTER;
    } else if (charCode === /* NBSP = */ 0xA0) {
      return CharacterType.SPACE;
    }
    return CharacterType.ALPHA_LETTER;
  }

  if (isHan(charCode)) {
    return CharacterType.HAN_LETTER;
  } else if (isKatakana(charCode)) {
    return CharacterType.KATAKANA_LETTER;
  } else if (isHiragana(charCode)) {
    return CharacterType.HIRAGANA_LETTER;
  } else if (isHalfwidthKatakana(charCode)) {
    return CharacterType.HALFWIDTH_KATAKANA_LETTER;
  }
  return CharacterType.ALPHA_LETTER;
}

export {
  CharacterType,
  getCharacterType,
};
