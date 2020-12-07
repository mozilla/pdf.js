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

import {
  assert,
  BaseException,
  bytesToString,
  objectSize,
  stringToPDFString,
  warn,
} from "../shared/util.js";
import { Dict, isName, isRef, isStream, RefSet } from "./primitives.js";

function getLookupTableFactory(initializer) {
  let lookup;
  return function () {
    if (initializer) {
      lookup = Object.create(null);
      initializer(lookup);
      initializer = null;
    }
    return lookup;
  };
}

function getArrayLookupTableFactory(initializer) {
  let lookup;
  return function () {
    if (initializer) {
      let arr = initializer();
      initializer = null;
      lookup = Object.create(null);
      for (let i = 0, ii = arr.length; i < ii; i += 2) {
        lookup[arr[i]] = arr[i + 1];
      }
      arr = null;
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
function isWhiteSpace(ch) {
  return ch === 0x20 || ch === 0x09 || ch === 0x0d || ch === 0x0a;
}

/**
 * AcroForm field names use an array like notation to refer to
 * repeated XFA elements e.g. foo.bar[nnn].
 * see: XFA Spec Chapter 3 - Repeated Elements
 *
 * @param {string} path - XFA path name.
 * @returns {Array} - Array of Objects with the name and pos of
 * each part of the path.
 */
function parseXFAPath(path) {
  const positionPattern = /(.+)\[([0-9]+)\]$/;
  return path.split(".").map(component => {
    const m = component.match(positionPattern);
    if (m) {
      return { name: m[1], pos: parseInt(m[2], 10) };
    }
    return { name: component, pos: 0 };
  });
}

function escapePDFName(str) {
  const buffer = [];
  let start = 0;
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    // Whitespace or delimiters aren't regular chars, so escape them.
    if (
      char < 0x21 ||
      char > 0x7e ||
      char === 0x23 /* # */ ||
      char === 0x28 /* ( */ ||
      char === 0x29 /* ) */ ||
      char === 0x3c /* < */ ||
      char === 0x3e /* > */ ||
      char === 0x5b /* [ */ ||
      char === 0x5d /* ] */ ||
      char === 0x7b /* { */ ||
      char === 0x7d /* } */ ||
      char === 0x2f /* / */ ||
      char === 0x25 /* % */
    ) {
      if (start < i) {
        buffer.push(str.substring(start, i));
      }
      buffer.push(`#${char.toString(16)}`);
      start = i + 1;
    }
  }

  if (buffer.length === 0) {
    return str;
  }

  if (start < str.length) {
    buffer.push(str.substring(start, str.length));
  }

  return buffer.join("");
}

function _collectJS(entry, xref, list, parents) {
  if (!entry) {
    return;
  }

  let parent = null;
  if (isRef(entry)) {
    if (parents.has(entry)) {
      // If we've already found entry then we've a cycle.
      return;
    }
    parent = entry;
    parents.put(parent);
    entry = xref.fetch(entry);
  }
  if (Array.isArray(entry)) {
    for (const element of entry) {
      _collectJS(element, xref, list, parents);
    }
  } else if (entry instanceof Dict) {
    if (isName(entry.get("S"), "JavaScript") && entry.has("JS")) {
      const js = entry.get("JS");
      let code;
      if (isStream(js)) {
        code = bytesToString(js.getBytes());
      } else {
        code = js;
      }
      code = stringToPDFString(code);
      if (code) {
        list.push(code);
      }
    }
    _collectJS(entry.getRaw("Next"), xref, list, parents);
  }

  if (parent) {
    parents.remove(parent);
  }
}

function collectActions(xref, dict, eventType) {
  const actions = Object.create(null);
  if (dict.has("AA")) {
    const additionalActions = dict.get("AA");
    for (const key of additionalActions.getKeys()) {
      const action = eventType[key];
      if (!action) {
        continue;
      }
      const actionDict = additionalActions.getRaw(key);
      const parents = new RefSet();
      const list = [];
      _collectJS(actionDict, xref, list, parents);
      if (list.length > 0) {
        actions[action] = list;
      }
    }
  }
  // Collect the Action if any (we may have one on pushbutton).
  if (dict.has("A")) {
    const actionDict = dict.get("A");
    const parents = new RefSet();
    const list = [];
    _collectJS(actionDict, xref, list, parents);
    if (list.length > 0) {
      actions.Action = list;
    }
  }
  return objectSize(actions) > 0 ? actions : null;
}

export {
  collectActions,
  escapePDFName,
  getLookupTableFactory,
  getArrayLookupTableFactory,
  MissingDataException,
  XRefEntryException,
  XRefParseException,
  getInheritableProperty,
  toRomanNumerals,
  log2,
  parseXFAPath,
  readInt8,
  readUint16,
  readUint32,
  isWhiteSpace,
};
