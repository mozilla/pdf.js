/* Copyright 2019 Mozilla Foundation
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
/* eslint no-var: error */

import { assert, BaseException, warn } from "../shared/util.js";

function getLookupTableFactory(initializer) {
  let lookup;
  return function() {
    if (initializer) {
      lookup = Object.create(null);
      initializer(lookup);
      initializer = null;
    }
    return lookup;
  };
}

class MissingDataException extends BaseException {
  constructor(begin, end) {
    super(`Missing data [${begin}, ${end})`);
    this.begin = begin;
    this.end = end;
  }
}

class XRefEntryException extends BaseException {}

class XRefParseException extends BaseException {}

/**
 * Get the value of an inheritable property.
 *
 * If the PDF specification explicitly lists a property in a dictionary as
 * inheritable, then the value of the property may be present in the dictionary
 * itself or in one or more parents of the dictionary.
 *
 * If the key is not found in the tree, `undefined` is returned. Otherwise,
 * the value for the key is returned or, if `stopWhenFound` is `false`, a list
 * of values is returned. To avoid infinite loops, the traversal is stopped when
 * the loop limit is reached.
 *
 * @param {Dict} dict - Dictionary from where to start the traversal.
 * @param {string} key - The key of the property to find the value for.
 * @param {boolean} getArray - Whether or not the value should be fetched as an
 *   array. The default value is `false`.
 * @param {boolean} stopWhenFound - Whether or not to stop the traversal when
 *   the key is found. If set to `false`, we always walk up the entire parent
 *   chain, for example to be able to find `\Resources` placed on multiple
 *   levels of the tree. The default value is `true`.
 */
function getInheritableProperty({
  dict,
  key,
  getArray = false,
  stopWhenFound = true,
}) {
  const LOOP_LIMIT = 100;
  let loopCount = 0;
  let values;

  while (dict) {
    const value = getArray ? dict.getArray(key) : dict.get(key);
    if (value !== undefined) {
      if (stopWhenFound) {
        return value;
      }
      if (!values) {
        values = [];
      }
      values.push(value);
    }
    if (++loopCount > LOOP_LIMIT) {
      warn(`getInheritableProperty: maximum loop count exceeded for "${key}"`);
      break;
    }
    dict = dict.get("Parent");
  }
  return values;
}

// prettier-ignore
const ROMAN_NUMBER_MAP = [
  "", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
  "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
  "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"
];

/**
 * Converts positive integers to (upper case) Roman numerals.
 * @param {number} number - The number that should be converted.
 * @param {boolean} lowerCase - Indicates if the result should be converted
 *   to lower case letters. The default value is `false`.
 * @returns {string} The resulting Roman number.
 */
function toRomanNumerals(number, lowerCase = false) {
  assert(
    Number.isInteger(number) && number > 0,
    "The number should be a positive integer."
  );
  const romanBuf = [];
  let pos;
  // Thousands
  while (number >= 1000) {
    number -= 1000;
    romanBuf.push("M");
  }
  // Hundreds
  pos = (number / 100) | 0;
  number %= 100;
  romanBuf.push(ROMAN_NUMBER_MAP[pos]);
  // Tens
  pos = (number / 10) | 0;
  number %= 10;
  romanBuf.push(ROMAN_NUMBER_MAP[10 + pos]);
  // Ones
  romanBuf.push(ROMAN_NUMBER_MAP[20 + number]);

  const romanStr = romanBuf.join("");
  return lowerCase ? romanStr.toLowerCase() : romanStr;
}

// Calculate the base 2 logarithm of the number `x`. This differs from the
// native function in the sense that it returns the ceiling value and that it
// returns 0 instead of `Infinity`/`NaN` for `x` values smaller than/equal to 0.
function log2(x) {
  if (x <= 0) {
    return 0;
  }
  return Math.ceil(Math.log2(x));
}

function readInt8(data, offset) {
  return (data[offset] << 24) >> 24;
}

function readUint16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32(data, offset) {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

// Checks if ch is one of the following characters: SPACE, TAB, CR or LF.
function isSpace(ch) {
  return ch === 0x20 || ch === 0x09 || ch === 0x0d || ch === 0x0a;
}

export {
  getLookupTableFactory,
  MissingDataException,
  XRefEntryException,
  XRefParseException,
  getInheritableProperty,
  toRomanNumerals,
  log2,
  readInt8,
  readUint16,
  readUint32,
  isSpace,
};
