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
  AnnotationEditorPrefix,
  assert,
  BaseException,
  hexNumbers,
  objectSize,
  stringToPDFString,
  Util,
  warn,
} from "../shared/util.js";
import { Dict, isName, Ref, RefSet } from "./primitives.js";
import { BaseStream } from "./base_stream.js";

const PDF_VERSION_REGEXP = /^[1-9]\.\d$/;
const MAX_INT_32 = 2 ** 31 - 1;
const MIN_INT_32 = -(2 ** 31);

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

class MissingDataException extends BaseException {
  constructor(begin, end) {
    super(`Missing data [${begin}, ${end})`, "MissingDataException");
    this.begin = begin;
    this.end = end;
  }
}

class ParserEOFException extends BaseException {
  constructor(msg) {
    super(msg, "ParserEOFException");
  }
}

class XRefEntryException extends BaseException {
  constructor(msg) {
    super(msg, "XRefEntryException");
  }
}

class XRefParseException extends BaseException {
  constructor(msg) {
    super(msg, "XRefParseException");
  }
}

/**
 * Combines multiple ArrayBuffers into a single Uint8Array.
 * @param {Array<ArrayBuffer>} arr - An array of ArrayBuffers.
 * @returns {Uint8Array}
 */
function arrayBuffersToBytes(arr) {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
    for (const item of arr) {
      assert(
        item instanceof ArrayBuffer,
        "arrayBuffersToBytes - expected an ArrayBuffer."
      );
    }
  }
  const length = arr.length;
  if (length === 0) {
    return new Uint8Array(0);
  }
  if (length === 1) {
    return new Uint8Array(arr[0]);
  }
  let dataLength = 0;
  for (let i = 0; i < length; i++) {
    dataLength += arr[i].byteLength;
  }
  const data = new Uint8Array(dataLength);
  let pos = 0;
  for (let i = 0; i < length; i++) {
    const item = new Uint8Array(arr[i]);
    data.set(item, pos);
    pos += item.byteLength;
  }
  return data;
}

async function fetchBinaryData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch file "${url}" with "${response.statusText}".`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Get the value of an inheritable property.
 *
 * If the PDF specification explicitly lists a property in a dictionary as
 * inheritable, then the value of the property may be present in the dictionary
 * itself or in one or more parents of the dictionary.
 *
 * If the key is not found in the tree, `undefined` is returned. Otherwise,
 * the value for the key is returned or, if `stopWhenFound` is `false`, a list
 * of values is returned.
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
  let values;
  const visited = new RefSet();

  while (dict instanceof Dict && !(dict.objId && visited.has(dict.objId))) {
    if (dict.objId) {
      visited.put(dict.objId);
    }
    const value = getArray ? dict.getArray(key) : dict.get(key);
    if (value !== undefined) {
      if (stopWhenFound) {
        return value;
      }
      (values ||= []).push(value);
    }
    dict = dict.get("Parent");
  }
  return values;
}

/**
 * Get the parent dictionary to update when a property is set.
 *
 * @param {Dict} dict - Dictionary from where to start the traversal.
 * @param {Ref} ref - The reference to the dictionary.
 * @param {XRef} xref - The `XRef` instance.
 */
function getParentToUpdate(dict, ref, xref) {
  const visited = new RefSet();
  const firstDict = dict;
  const result = { dict: null, ref: null };

  while (dict instanceof Dict && !visited.has(ref)) {
    visited.put(ref);
    if (dict.has("T")) {
      break;
    }
    ref = dict.getRaw("Parent");
    if (!(ref instanceof Ref)) {
      return result;
    }
    dict = xref.fetch(ref);
  }
  if (dict instanceof Dict && dict !== firstDict) {
    result.dict = dict;
    result.ref = ref;
  }
  return result;
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

  const roman =
    "M".repeat((number / 1000) | 0) +
    ROMAN_NUMBER_MAP[((number % 1000) / 100) | 0] +
    ROMAN_NUMBER_MAP[10 + (((number % 100) / 10) | 0)] +
    ROMAN_NUMBER_MAP[20 + (number % 10)];
  return lowerCase ? roman.toLowerCase() : roman;
}

// Calculate the base 2 logarithm of the number `x`. This differs from the
// native function in the sense that it returns the ceiling value and that it
// returns 0 instead of `Infinity`/`NaN` for `x` values smaller than/equal to 0.
function log2(x) {
  return x > 0 ? Math.ceil(Math.log2(x)) : 0;
}

function readInt8(data, offset) {
  return (data[offset] << 24) >> 24;
}

function readInt16(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16)) >> 16;
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
 * Checks if something is an Array containing only boolean values,
 * and (optionally) checks its length.
 * @param {any} arr
 * @param {number | null} len
 * @returns {boolean}
 */
function isBooleanArray(arr, len) {
  return (
    Array.isArray(arr) &&
    (len === null || arr.length === len) &&
    arr.every(x => typeof x === "boolean")
  );
}

/**
 * Checks if something is an Array containing only numbers,
 * and (optionally) checks its length.
 * @param {any} arr
 * @param {number | null} len
 * @returns {boolean}
 */
function isNumberArray(arr, len) {
  if (Array.isArray(arr)) {
    return (
      (len === null || arr.length === len) &&
      arr.every(x => typeof x === "number")
    );
  }

  // This check allows us to have typed arrays but not the
  // BigInt64Array/BigUint64Array types (their elements aren't "number").
  return (
    ArrayBuffer.isView(arr) &&
    !(arr instanceof BigInt64Array || arr instanceof BigUint64Array) &&
    (len === null || arr.length === len)
  );
}

// Returns the matrix, or the fallback value if it's invalid.
function lookupMatrix(arr, fallback) {
  return isNumberArray(arr, 6) ? arr : fallback;
}

// Returns the rectangle, or the fallback value if it's invalid.
function lookupRect(arr, fallback) {
  return isNumberArray(arr, 4) ? arr : fallback;
}

// Returns the normalized rectangle, or the fallback value if it's invalid.
function lookupNormalRect(arr, fallback) {
  return isNumberArray(arr, 4) ? Util.normalizeRect(arr) : fallback;
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
  const positionPattern = /(.+)\[(\d+)\]$/;
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

// Replace "(", ")", "\n", "\r" and "\" by "\(", "\)", "\\n", "\\r" and "\\"
// in order to write it in a PDF file.
function escapeString(str) {
  return str.replaceAll(/([()\\\n\r])/g, match => {
    if (match === "\n") {
      return "\\n";
    } else if (match === "\r") {
      return "\\r";
    }
    return `\\${match}`;
  });
}

function _collectJS(entry, xref, list, parents) {
  if (!entry) {
    return;
  }

  let parent = null;
  if (entry instanceof Ref) {
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
    if (isName(entry.get("S"), "JavaScript")) {
      const js = entry.get("JS");
      let code;
      if (js instanceof BaseStream) {
        code = js.getString();
      } else if (typeof js === "string") {
        code = js;
      }
      code &&= stringToPDFString(code).replaceAll("\x00", "");
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
  const additionalActionsDicts = getInheritableProperty({
    dict,
    key: "AA",
    stopWhenFound: false,
  });
  if (additionalActionsDicts) {
    // additionalActionsDicts contains dicts from ancestors
    // as they're found in the tree from bottom to top.
    // So the dicts are visited in reverse order to guarantee
    // that actions from elder ancestors will be overwritten
    // by ones from younger ancestors.
    for (let i = additionalActionsDicts.length - 1; i >= 0; i--) {
      const additionalActions = additionalActionsDicts[i];
      if (!(additionalActions instanceof Dict)) {
        continue;
      }
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

const XMLEntities = {
  /* < */ 0x3c: "&lt;",
  /* > */ 0x3e: "&gt;",
  /* & */ 0x26: "&amp;",
  /* " */ 0x22: "&quot;",
  /* ' */ 0x27: "&apos;",
};

function* codePointIter(str) {
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.codePointAt(i);
    if (char > 0xd7ff && (char < 0xe000 || char > 0xfffd)) {
      // char is represented by two u16
      i++;
    }
    yield char;
  }
}

function encodeToXmlString(str) {
  const buffer = [];
  let start = 0;
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.codePointAt(i);
    if (0x20 <= char && char <= 0x7e) {
      // ascii
      const entity = XMLEntities[char];
      if (entity) {
        if (start < i) {
          buffer.push(str.substring(start, i));
        }
        buffer.push(entity);
        start = i + 1;
      }
    } else {
      if (start < i) {
        buffer.push(str.substring(start, i));
      }
      buffer.push(`&#x${char.toString(16).toUpperCase()};`);
      if (char > 0xd7ff && (char < 0xe000 || char > 0xfffd)) {
        // char is represented by two u16
        i++;
      }
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

function validateFontName(fontFamily, mustWarn = false) {
  // See https://developer.mozilla.org/en-US/docs/Web/CSS/string.
  const m = /^("|').*("|')$/.exec(fontFamily);
  if (m && m[1] === m[2]) {
    const re = new RegExp(`[^\\\\]${m[1]}`);
    if (re.test(fontFamily.slice(1, -1))) {
      if (mustWarn) {
        warn(`FontFamily contains unescaped ${m[1]}: ${fontFamily}.`);
      }
      return false;
    }
  } else {
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/custom-ident.
    for (const ident of fontFamily.split(/[ \t]+/)) {
      if (/^(\d|(-(\d|-)))/.test(ident) || !/^[\w-\\]+$/.test(ident)) {
        if (mustWarn) {
          warn(`FontFamily contains invalid <custom-ident>: ${fontFamily}.`);
        }
        return false;
      }
    }
  }
  return true;
}

function validateCSSFont(cssFontInfo) {
  // See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style.
  const DEFAULT_CSS_FONT_OBLIQUE = "14";
  // See https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight.
  const DEFAULT_CSS_FONT_WEIGHT = "400";
  const CSS_FONT_WEIGHT_VALUES = new Set([
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "1000",
    "normal",
    "bold",
    "bolder",
    "lighter",
  ]);

  const { fontFamily, fontWeight, italicAngle } = cssFontInfo;

  if (!validateFontName(fontFamily, true)) {
    return false;
  }

  const weight = fontWeight ? fontWeight.toString() : "";
  cssFontInfo.fontWeight = CSS_FONT_WEIGHT_VALUES.has(weight)
    ? weight
    : DEFAULT_CSS_FONT_WEIGHT;

  const angle = parseFloat(italicAngle);
  cssFontInfo.italicAngle =
    isNaN(angle) || angle < -90 || angle > 90
      ? DEFAULT_CSS_FONT_OBLIQUE
      : italicAngle.toString();

  return true;
}

function recoverJsURL(str) {
  // Attempt to recover valid URLs from `JS` entries with certain
  // white-listed formats:
  //  - window.open('http://example.com')
  //  - app.launchURL('http://example.com', true)
  //  - xfa.host.gotoURL('http://example.com')
  const URL_OPEN_METHODS = ["app.launchURL", "window.open", "xfa.host.gotoURL"];
  const regex = new RegExp(
    "^\\s*(" +
      URL_OPEN_METHODS.join("|").replaceAll(".", "\\.") +
      ")\\((?:'|\")([^'\"]*)(?:'|\")(?:,\\s*(\\w+)\\)|\\))",
    "i"
  );

  const jsUrl = regex.exec(str);
  if (jsUrl?.[2]) {
    return {
      url: jsUrl[2],
      newWindow: jsUrl[1] === "app.launchURL" && jsUrl[3] === "true",
    };
  }

  return null;
}

function numberToString(value) {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  const roundedValue = Math.round(value * 100);
  if (roundedValue % 100 === 0) {
    return (roundedValue / 100).toString();
  }

  if (roundedValue % 10 === 0) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function getNewAnnotationsMap(annotationStorage) {
  if (!annotationStorage) {
    return null;
  }
  const newAnnotationsByPage = new Map();
  // The concept of page in a XFA is very different, so
  // editing is just not implemented.
  for (const [key, value] of annotationStorage) {
    if (!key.startsWith(AnnotationEditorPrefix)) {
      continue;
    }
    let annotations = newAnnotationsByPage.get(value.pageIndex);
    if (!annotations) {
      annotations = [];
      newAnnotationsByPage.set(value.pageIndex, annotations);
    }
    annotations.push(value);
  }
  return newAnnotationsByPage.size > 0 ? newAnnotationsByPage : null;
}

function stringToAsciiOrUTF16BE(str) {
  return isAscii(str) ? str : stringToUTF16String(str, /* bigEndian = */ true);
}

function isAscii(str) {
  return /^[\x00-\x7F]*$/.test(str);
}

function stringToUTF16HexString(str) {
  const buf = [];
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push(hexNumbers[(char >> 8) & 0xff], hexNumbers[char & 0xff]);
  }
  return buf.join("");
}

function stringToUTF16String(str, bigEndian = false) {
  const buf = [];
  if (bigEndian) {
    buf.push("\xFE\xFF");
  }
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push(
      String.fromCharCode((char >> 8) & 0xff),
      String.fromCharCode(char & 0xff)
    );
  }
  return buf.join("");
}

function getRotationMatrix(rotation, width, height) {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0, width, 0];
    case 180:
      return [-1, 0, 0, -1, width, height];
    case 270:
      return [0, -1, 1, 0, 0, height];
    default:
      throw new Error("Invalid rotation");
  }
}

/**
 * Get the number of bytes to use to represent the given positive integer.
 * If n is zero, the function returns 0 which means that we don't need to waste
 * a byte to represent it.
 * @param {number} x - a positive integer.
 * @returns {number}
 */
function getSizeInBytes(x) {
  // n bits are required for numbers up to 2^n - 1.
  // So for a number x, we need ceil(log2(1 + x)) bits.
  return Math.ceil(Math.ceil(Math.log2(1 + x)) / 8);
}

export {
  arrayBuffersToBytes,
  codePointIter,
  collectActions,
  encodeToXmlString,
  escapePDFName,
  escapeString,
  fetchBinaryData,
  getInheritableProperty,
  getLookupTableFactory,
  getNewAnnotationsMap,
  getParentToUpdate,
  getRotationMatrix,
  getSizeInBytes,
  isAscii,
  isBooleanArray,
  isNumberArray,
  isWhiteSpace,
  log2,
  lookupMatrix,
  lookupNormalRect,
  lookupRect,
  MAX_INT_32,
  MIN_INT_32,
  MissingDataException,
  numberToString,
  ParserEOFException,
  parseXFAPath,
  PDF_VERSION_REGEXP,
  readInt16,
  readInt8,
  readUint16,
  readUint32,
  recoverJsURL,
  stringToAsciiOrUTF16BE,
  stringToUTF16HexString,
  stringToUTF16String,
  toRomanNumerals,
  validateCSSFont,
  validateFontName,
  XRefEntryException,
  XRefParseException,
};
