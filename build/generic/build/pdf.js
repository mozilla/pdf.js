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

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("pdfjs-dist/build/pdf", [], factory);
	else if(typeof exports === 'object')
		exports["pdfjs-dist/build/pdf"] = factory();
	else
		root["pdfjs-dist/build/pdf"] = root.pdfjsLib = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __w_pdfjs_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __w_pdfjs_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__w_pdfjs_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__w_pdfjs_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__w_pdfjs_require__.d = function(exports, name, getter) {
/******/ 		if(!__w_pdfjs_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__w_pdfjs_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__w_pdfjs_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __w_pdfjs_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__w_pdfjs_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __w_pdfjs_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__w_pdfjs_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__w_pdfjs_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__w_pdfjs_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__w_pdfjs_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __w_pdfjs_require__(__w_pdfjs_require__.s = 0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


var pdfjsVersion = '2.5.32';
var pdfjsBuild = 'b1e3b21b';

var pdfjsSharedUtil = __w_pdfjs_require__(1);

var pdfjsDisplayAPI = __w_pdfjs_require__(3);

var pdfjsDisplayTextLayer = __w_pdfjs_require__(16);

var pdfjsDisplayAnnotationLayer = __w_pdfjs_require__(17);

var pdfjsDisplayDisplayUtils = __w_pdfjs_require__(4);

var pdfjsDisplaySVG = __w_pdfjs_require__(18);

const pdfjsDisplayWorkerOptions = __w_pdfjs_require__(10);

const pdfjsDisplayAPICompatibility = __w_pdfjs_require__(6);

{
  const {
    isNodeJS
  } = __w_pdfjs_require__(7);

  if (isNodeJS) {
    const PDFNodeStream = __w_pdfjs_require__(19).PDFNodeStream;

    pdfjsDisplayAPI.setPDFNetworkStreamFactory(params => {
      return new PDFNodeStream(params);
    });
  } else {
    const PDFNetworkStream = __w_pdfjs_require__(22).PDFNetworkStream;

    let PDFFetchStream;

    if (pdfjsDisplayDisplayUtils.isFetchSupported()) {
      PDFFetchStream = __w_pdfjs_require__(23).PDFFetchStream;
    }

    pdfjsDisplayAPI.setPDFNetworkStreamFactory(params => {
      if (PDFFetchStream && pdfjsDisplayDisplayUtils.isValidFetchUrl(params.url)) {
        return new PDFFetchStream(params);
      }

      return new PDFNetworkStream(params);
    });
  }
}
exports.build = pdfjsDisplayAPI.build;
exports.version = pdfjsDisplayAPI.version;
exports.getDocument = pdfjsDisplayAPI.getDocument;
exports.LoopbackPort = pdfjsDisplayAPI.LoopbackPort;
exports.PDFDataRangeTransport = pdfjsDisplayAPI.PDFDataRangeTransport;
exports.PDFWorker = pdfjsDisplayAPI.PDFWorker;
exports.renderTextLayer = pdfjsDisplayTextLayer.renderTextLayer;
exports.AnnotationLayer = pdfjsDisplayAnnotationLayer.AnnotationLayer;
exports.createPromiseCapability = pdfjsSharedUtil.createPromiseCapability;
exports.PasswordResponses = pdfjsSharedUtil.PasswordResponses;
exports.InvalidPDFException = pdfjsSharedUtil.InvalidPDFException;
exports.MissingPDFException = pdfjsSharedUtil.MissingPDFException;
exports.SVGGraphics = pdfjsDisplaySVG.SVGGraphics;
exports.NativeImageDecoding = pdfjsSharedUtil.NativeImageDecoding;
exports.CMapCompressionType = pdfjsSharedUtil.CMapCompressionType;
exports.PermissionFlag = pdfjsSharedUtil.PermissionFlag;
exports.UnexpectedResponseException = pdfjsSharedUtil.UnexpectedResponseException;
exports.OPS = pdfjsSharedUtil.OPS;
exports.VerbosityLevel = pdfjsSharedUtil.VerbosityLevel;
exports.UNSUPPORTED_FEATURES = pdfjsSharedUtil.UNSUPPORTED_FEATURES;
exports.createValidAbsoluteUrl = pdfjsSharedUtil.createValidAbsoluteUrl;
exports.createObjectURL = pdfjsSharedUtil.createObjectURL;
exports.removeNullCharacters = pdfjsSharedUtil.removeNullCharacters;
exports.shadow = pdfjsSharedUtil.shadow;
exports.Util = pdfjsSharedUtil.Util;
exports.RenderingCancelledException = pdfjsDisplayDisplayUtils.RenderingCancelledException;
exports.getFilenameFromUrl = pdfjsDisplayDisplayUtils.getFilenameFromUrl;
exports.LinkTarget = pdfjsDisplayDisplayUtils.LinkTarget;
exports.addLinkAttributes = pdfjsDisplayDisplayUtils.addLinkAttributes;
exports.loadScript = pdfjsDisplayDisplayUtils.loadScript;
exports.PDFDateString = pdfjsDisplayDisplayUtils.PDFDateString;
exports.GlobalWorkerOptions = pdfjsDisplayWorkerOptions.GlobalWorkerOptions;
exports.apiCompatibilityParams = pdfjsDisplayAPICompatibility.apiCompatibilityParams;

/***/ }),
/* 1 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.arrayByteLength = arrayByteLength;
exports.arraysToBytes = arraysToBytes;
exports.assert = assert;
exports.bytesToString = bytesToString;
exports.createPromiseCapability = createPromiseCapability;
exports.getVerbosityLevel = getVerbosityLevel;
exports.info = info;
exports.isArrayBuffer = isArrayBuffer;
exports.isArrayEqual = isArrayEqual;
exports.isBool = isBool;
exports.isEmptyObj = isEmptyObj;
exports.isNum = isNum;
exports.isString = isString;
exports.isSameOrigin = isSameOrigin;
exports.createValidAbsoluteUrl = createValidAbsoluteUrl;
exports.removeNullCharacters = removeNullCharacters;
exports.setVerbosityLevel = setVerbosityLevel;
exports.shadow = shadow;
exports.string32 = string32;
exports.stringToBytes = stringToBytes;
exports.stringToPDFString = stringToPDFString;
exports.stringToUTF8String = stringToUTF8String;
exports.utf8StringToString = utf8StringToString;
exports.warn = warn;
exports.unreachable = unreachable;
exports.IsEvalSupportedCached = exports.IsLittleEndianCached = exports.createObjectURL = exports.FormatError = exports.Util = exports.UnknownErrorException = exports.UnexpectedResponseException = exports.TextRenderingMode = exports.StreamType = exports.PermissionFlag = exports.PasswordResponses = exports.PasswordException = exports.NativeImageDecoding = exports.MissingPDFException = exports.InvalidPDFException = exports.AbortException = exports.CMapCompressionType = exports.ImageKind = exports.FontType = exports.AnnotationType = exports.AnnotationStateModelType = exports.AnnotationReviewState = exports.AnnotationReplyType = exports.AnnotationMarkedState = exports.AnnotationFlag = exports.AnnotationFieldFlag = exports.AnnotationBorderStyleType = exports.UNSUPPORTED_FEATURES = exports.VerbosityLevel = exports.OPS = exports.IDENTITY_MATRIX = exports.FONT_IDENTITY_MATRIX = exports.BaseException = void 0;

__w_pdfjs_require__(2);

const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];
exports.IDENTITY_MATRIX = IDENTITY_MATRIX;
const FONT_IDENTITY_MATRIX = [0.001, 0, 0, 0.001, 0, 0];
exports.FONT_IDENTITY_MATRIX = FONT_IDENTITY_MATRIX;
const NativeImageDecoding = {
  NONE: "none",
  DECODE: "decode",
  DISPLAY: "display"
};
exports.NativeImageDecoding = NativeImageDecoding;
const PermissionFlag = {
  PRINT: 0x04,
  MODIFY_CONTENTS: 0x08,
  COPY: 0x10,
  MODIFY_ANNOTATIONS: 0x20,
  FILL_INTERACTIVE_FORMS: 0x100,
  COPY_FOR_ACCESSIBILITY: 0x200,
  ASSEMBLE: 0x400,
  PRINT_HIGH_QUALITY: 0x800
};
exports.PermissionFlag = PermissionFlag;
const TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
};
exports.TextRenderingMode = TextRenderingMode;
const ImageKind = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3
};
exports.ImageKind = ImageKind;
const AnnotationType = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26
};
exports.AnnotationType = AnnotationType;
const AnnotationStateModelType = {
  MARKED: "Marked",
  REVIEW: "Review"
};
exports.AnnotationStateModelType = AnnotationStateModelType;
const AnnotationMarkedState = {
  MARKED: "Marked",
  UNMARKED: "Unmarked"
};
exports.AnnotationMarkedState = AnnotationMarkedState;
const AnnotationReviewState = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NONE: "None"
};
exports.AnnotationReviewState = AnnotationReviewState;
const AnnotationReplyType = {
  GROUP: "Group",
  REPLY: "R"
};
exports.AnnotationReplyType = AnnotationReplyType;
const AnnotationFlag = {
  INVISIBLE: 0x01,
  HIDDEN: 0x02,
  PRINT: 0x04,
  NOZOOM: 0x08,
  NOROTATE: 0x10,
  NOVIEW: 0x20,
  READONLY: 0x40,
  LOCKED: 0x80,
  TOGGLENOVIEW: 0x100,
  LOCKEDCONTENTS: 0x200
};
exports.AnnotationFlag = AnnotationFlag;
const AnnotationFieldFlag = {
  READONLY: 0x0000001,
  REQUIRED: 0x0000002,
  NOEXPORT: 0x0000004,
  MULTILINE: 0x0001000,
  PASSWORD: 0x0002000,
  NOTOGGLETOOFF: 0x0004000,
  RADIO: 0x0008000,
  PUSHBUTTON: 0x0010000,
  COMBO: 0x0020000,
  EDIT: 0x0040000,
  SORT: 0x0080000,
  FILESELECT: 0x0100000,
  MULTISELECT: 0x0200000,
  DONOTSPELLCHECK: 0x0400000,
  DONOTSCROLL: 0x0800000,
  COMB: 0x1000000,
  RICHTEXT: 0x2000000,
  RADIOSINUNISON: 0x2000000,
  COMMITONSELCHANGE: 0x4000000
};
exports.AnnotationFieldFlag = AnnotationFieldFlag;
const AnnotationBorderStyleType = {
  SOLID: 1,
  DASHED: 2,
  BEVELED: 3,
  INSET: 4,
  UNDERLINE: 5
};
exports.AnnotationBorderStyleType = AnnotationBorderStyleType;
const StreamType = {
  UNKNOWN: "UNKNOWN",
  FLATE: "FLATE",
  LZW: "LZW",
  DCT: "DCT",
  JPX: "JPX",
  JBIG: "JBIG",
  A85: "A85",
  AHX: "AHX",
  CCF: "CCF",
  RLX: "RLX"
};
exports.StreamType = StreamType;
const FontType = {
  UNKNOWN: "UNKNOWN",
  TYPE1: "TYPE1",
  TYPE1C: "TYPE1C",
  CIDFONTTYPE0: "CIDFONTTYPE0",
  CIDFONTTYPE0C: "CIDFONTTYPE0C",
  TRUETYPE: "TRUETYPE",
  CIDFONTTYPE2: "CIDFONTTYPE2",
  TYPE3: "TYPE3",
  OPENTYPE: "OPENTYPE",
  TYPE0: "TYPE0",
  MMTYPE1: "MMTYPE1"
};
exports.FontType = FontType;
const VerbosityLevel = {
  ERRORS: 0,
  WARNINGS: 1,
  INFOS: 5
};
exports.VerbosityLevel = VerbosityLevel;
const CMapCompressionType = {
  NONE: 0,
  BINARY: 1,
  STREAM: 2
};
exports.CMapCompressionType = CMapCompressionType;
const OPS = {
  dependency: 1,
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setMiterLimit: 5,
  setDash: 6,
  setRenderingIntent: 7,
  setFlatness: 8,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  beginText: 31,
  endText: 32,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setLeading: 36,
  setFont: 37,
  setTextRenderingMode: 38,
  setTextRise: 39,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setCharWidth: 48,
  setCharWidthAndBounds: 49,
  setStrokeColorSpace: 50,
  setFillColorSpace: 51,
  setStrokeColor: 52,
  setStrokeColorN: 53,
  setFillColor: 54,
  setFillColorN: 55,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  shadingFill: 62,
  beginInlineImage: 63,
  beginImageData: 64,
  endInlineImage: 65,
  paintXObject: 66,
  markPoint: 67,
  markPointProps: 68,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  beginCompat: 72,
  endCompat: 73,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  beginAnnotations: 78,
  endAnnotations: 79,
  beginAnnotation: 80,
  endAnnotation: 81,
  paintJpegXObject: 82,
  paintImageMaskXObject: 83,
  paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintSolidColorImageMask: 90,
  constructPath: 91
};
exports.OPS = OPS;
const UNSUPPORTED_FEATURES = {
  unknown: "unknown",
  forms: "forms",
  javaScript: "javaScript",
  smask: "smask",
  shadingPattern: "shadingPattern",
  font: "font"
};
exports.UNSUPPORTED_FEATURES = UNSUPPORTED_FEATURES;
const PasswordResponses = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2
};
exports.PasswordResponses = PasswordResponses;
let verbosity = VerbosityLevel.WARNINGS;

function setVerbosityLevel(level) {
  if (Number.isInteger(level)) {
    verbosity = level;
  }
}

function getVerbosityLevel() {
  return verbosity;
}

function info(msg) {
  if (verbosity >= VerbosityLevel.INFOS) {
    console.log(`Info: ${msg}`);
  }
}

function warn(msg) {
  if (verbosity >= VerbosityLevel.WARNINGS) {
    console.log(`Warning: ${msg}`);
  }
}

function unreachable(msg) {
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) {
    unreachable(msg);
  }
}

function isSameOrigin(baseUrl, otherUrl) {
  let base;

  try {
    base = new URL(baseUrl);

    if (!base.origin || base.origin === "null") {
      return false;
    }
  } catch (e) {
    return false;
  }

  const other = new URL(otherUrl, base);
  return base.origin === other.origin;
}

function _isValidProtocol(url) {
  if (!url) {
    return false;
  }

  switch (url.protocol) {
    case "http:":
    case "https:":
    case "ftp:":
    case "mailto:":
    case "tel:":
      return true;

    default:
      return false;
  }
}

function createValidAbsoluteUrl(url, baseUrl) {
  if (!url) {
    return null;
  }

  try {
    const absoluteUrl = baseUrl ? new URL(url, baseUrl) : new URL(url);

    if (_isValidProtocol(absoluteUrl)) {
      return absoluteUrl;
    }
  } catch (ex) {}

  return null;
}

function shadow(obj, prop, value) {
  Object.defineProperty(obj, prop, {
    value,
    enumerable: true,
    configurable: true,
    writable: false
  });
  return value;
}

const BaseException = function BaseExceptionClosure() {
  function BaseException(message) {
    if (this.constructor === BaseException) {
      unreachable("Cannot initialize BaseException.");
    }

    this.message = message;
    this.name = this.constructor.name;
  }

  BaseException.prototype = new Error();
  BaseException.constructor = BaseException;
  return BaseException;
}();

exports.BaseException = BaseException;

class PasswordException extends BaseException {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }

}

exports.PasswordException = PasswordException;

class UnknownErrorException extends BaseException {
  constructor(msg, details) {
    super(msg);
    this.details = details;
  }

}

exports.UnknownErrorException = UnknownErrorException;

class InvalidPDFException extends BaseException {}

exports.InvalidPDFException = InvalidPDFException;

class MissingPDFException extends BaseException {}

exports.MissingPDFException = MissingPDFException;

class UnexpectedResponseException extends BaseException {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }

}

exports.UnexpectedResponseException = UnexpectedResponseException;

class FormatError extends BaseException {}

exports.FormatError = FormatError;

class AbortException extends BaseException {}

exports.AbortException = AbortException;
const NullCharactersRegExp = /\x00/g;

function removeNullCharacters(str) {
  if (typeof str !== "string") {
    warn("The argument for removeNullCharacters must be a string.");
    return str;
  }

  return str.replace(NullCharactersRegExp, "");
}

function bytesToString(bytes) {
  assert(bytes !== null && typeof bytes === "object" && bytes.length !== undefined, "Invalid argument for bytesToString");
  const length = bytes.length;
  const MAX_ARGUMENT_COUNT = 8192;

  if (length < MAX_ARGUMENT_COUNT) {
    return String.fromCharCode.apply(null, bytes);
  }

  const strBuf = [];

  for (let i = 0; i < length; i += MAX_ARGUMENT_COUNT) {
    const chunkEnd = Math.min(i + MAX_ARGUMENT_COUNT, length);
    const chunk = bytes.subarray(i, chunkEnd);
    strBuf.push(String.fromCharCode.apply(null, chunk));
  }

  return strBuf.join("");
}

function stringToBytes(str) {
  assert(typeof str === "string", "Invalid argument for stringToBytes");
  const length = str.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }

  return bytes;
}

function arrayByteLength(arr) {
  if (arr.length !== undefined) {
    return arr.length;
  }

  assert(arr.byteLength !== undefined);
  return arr.byteLength;
}

function arraysToBytes(arr) {
  const length = arr.length;

  if (length === 1 && arr[0] instanceof Uint8Array) {
    return arr[0];
  }

  let resultLength = 0;

  for (let i = 0; i < length; i++) {
    resultLength += arrayByteLength(arr[i]);
  }

  let pos = 0;
  const data = new Uint8Array(resultLength);

  for (let i = 0; i < length; i++) {
    let item = arr[i];

    if (!(item instanceof Uint8Array)) {
      if (typeof item === "string") {
        item = stringToBytes(item);
      } else {
        item = new Uint8Array(item);
      }
    }

    const itemLength = item.byteLength;
    data.set(item, pos);
    pos += itemLength;
  }

  return data;
}

function string32(value) {
  return String.fromCharCode(value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff);
}

function isLittleEndian() {
  const buffer8 = new Uint8Array(4);
  buffer8[0] = 1;
  const view32 = new Uint32Array(buffer8.buffer, 0, 1);
  return view32[0] === 1;
}

const IsLittleEndianCached = {
  get value() {
    return shadow(this, "value", isLittleEndian());
  }

};
exports.IsLittleEndianCached = IsLittleEndianCached;

function isEvalSupported() {
  try {
    new Function("");
    return true;
  } catch (e) {
    return false;
  }
}

const IsEvalSupportedCached = {
  get value() {
    return shadow(this, "value", isEvalSupported());
  }

};
exports.IsEvalSupportedCached = IsEvalSupportedCached;
const rgbBuf = ["rgb(", 0, ",", 0, ",", 0, ")"];

class Util {
  static makeCssRgb(r, g, b) {
    rgbBuf[1] = r;
    rgbBuf[3] = g;
    rgbBuf[5] = b;
    return rgbBuf.join("");
  }

  static transform(m1, m2) {
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }

  static applyTransform(p, m) {
    const xt = p[0] * m[0] + p[1] * m[2] + m[4];
    const yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  }

  static applyInverseTransform(p, m) {
    const d = m[0] * m[3] - m[1] * m[2];
    const xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return [xt, yt];
  }

  static getAxialAlignedBoundingBox(r, m) {
    const p1 = Util.applyTransform(r, m);
    const p2 = Util.applyTransform(r.slice(2, 4), m);
    const p3 = Util.applyTransform([r[0], r[3]], m);
    const p4 = Util.applyTransform([r[2], r[1]], m);
    return [Math.min(p1[0], p2[0], p3[0], p4[0]), Math.min(p1[1], p2[1], p3[1], p4[1]), Math.max(p1[0], p2[0], p3[0], p4[0]), Math.max(p1[1], p2[1], p3[1], p4[1])];
  }

  static inverseTransform(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[4] * m[3]) / d, (m[4] * m[1] - m[5] * m[0]) / d];
  }

  static apply3dTransform(m, v) {
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  }

  static singularValueDecompose2dScale(m) {
    const transpose = [m[0], m[2], m[1], m[3]];
    const a = m[0] * transpose[0] + m[1] * transpose[2];
    const b = m[0] * transpose[1] + m[1] * transpose[3];
    const c = m[2] * transpose[0] + m[3] * transpose[2];
    const d = m[2] * transpose[1] + m[3] * transpose[3];
    const first = (a + d) / 2;
    const second = Math.sqrt((a + d) * (a + d) - 4 * (a * d - c * b)) / 2;
    const sx = first + second || 1;
    const sy = first - second || 1;
    return [Math.sqrt(sx), Math.sqrt(sy)];
  }

  static normalizeRect(rect) {
    const r = rect.slice(0);

    if (rect[0] > rect[2]) {
      r[0] = rect[2];
      r[2] = rect[0];
    }

    if (rect[1] > rect[3]) {
      r[1] = rect[3];
      r[3] = rect[1];
    }

    return r;
  }

  static intersect(rect1, rect2) {
    function compare(a, b) {
      return a - b;
    }

    const orderedX = [rect1[0], rect1[2], rect2[0], rect2[2]].sort(compare);
    const orderedY = [rect1[1], rect1[3], rect2[1], rect2[3]].sort(compare);
    const result = [];
    rect1 = Util.normalizeRect(rect1);
    rect2 = Util.normalizeRect(rect2);

    if (orderedX[0] === rect1[0] && orderedX[1] === rect2[0] || orderedX[0] === rect2[0] && orderedX[1] === rect1[0]) {
      result[0] = orderedX[1];
      result[2] = orderedX[2];
    } else {
      return null;
    }

    if (orderedY[0] === rect1[1] && orderedY[1] === rect2[1] || orderedY[0] === rect2[1] && orderedY[1] === rect1[1]) {
      result[1] = orderedY[1];
      result[3] = orderedY[2];
    } else {
      return null;
    }

    return result;
  }

}

exports.Util = Util;
const PDFStringTranslateTable = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C, 0x201D, 0x2018, 0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x141, 0x152, 0x160, 0x178, 0x17D, 0x131, 0x142, 0x153, 0x161, 0x17E, 0, 0x20AC];

function stringToPDFString(str) {
  const length = str.length,
        strBuf = [];

  if (str[0] === "\xFE" && str[1] === "\xFF") {
    for (let i = 2; i < length; i += 2) {
      strBuf.push(String.fromCharCode(str.charCodeAt(i) << 8 | str.charCodeAt(i + 1)));
    }
  } else if (str[0] === "\xFF" && str[1] === "\xFE") {
    for (let i = 2; i < length; i += 2) {
      strBuf.push(String.fromCharCode(str.charCodeAt(i + 1) << 8 | str.charCodeAt(i)));
    }
  } else {
    for (let i = 0; i < length; ++i) {
      const code = PDFStringTranslateTable[str.charCodeAt(i)];
      strBuf.push(code ? String.fromCharCode(code) : str.charAt(i));
    }
  }

  return strBuf.join("");
}

function stringToUTF8String(str) {
  return decodeURIComponent(escape(str));
}

function utf8StringToString(str) {
  return unescape(encodeURIComponent(str));
}

function isEmptyObj(obj) {
  for (const key in obj) {
    return false;
  }

  return true;
}

function isBool(v) {
  return typeof v === "boolean";
}

function isNum(v) {
  return typeof v === "number";
}

function isString(v) {
  return typeof v === "string";
}

function isArrayBuffer(v) {
  return typeof v === "object" && v !== null && v.byteLength !== undefined;
}

function isArrayEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }

  return arr1.every(function (element, index) {
    return element === arr2[index];
  });
}

function createPromiseCapability() {
  const capability = Object.create(null);
  let isSettled = false;
  Object.defineProperty(capability, "settled", {
    get() {
      return isSettled;
    }

  });
  capability.promise = new Promise(function (resolve, reject) {
    capability.resolve = function (data) {
      isSettled = true;
      resolve(data);
    };

    capability.reject = function (reason) {
      isSettled = true;
      reject(reason);
    };
  });
  return capability;
}

const createObjectURL = function createObjectURLClosure() {
  const digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  return function createObjectURL(data, contentType, forceDataSchema = false) {
    if (!forceDataSchema && URL.createObjectURL) {
      const blob = new Blob([data], {
        type: contentType
      });
      return URL.createObjectURL(blob);
    }

    let buffer = `data:${contentType};base64,`;

    for (let i = 0, ii = data.length; i < ii; i += 3) {
      const b1 = data[i] & 0xff;
      const b2 = data[i + 1] & 0xff;
      const b3 = data[i + 2] & 0xff;
      const d1 = b1 >> 2,
            d2 = (b1 & 3) << 4 | b2 >> 4;
      const d3 = i + 1 < ii ? (b2 & 0xf) << 2 | b3 >> 6 : 64;
      const d4 = i + 2 < ii ? b3 & 0x3f : 64;
      buffer += digits[d1] + digits[d2] + digits[d3] + digits[d4];
    }

    return buffer;
  };
}();

exports.createObjectURL = createObjectURL;

/***/ }),
/* 2 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


;

/***/ }),
/* 3 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDocument = getDocument;
exports.setPDFNetworkStreamFactory = setPDFNetworkStreamFactory;
exports.build = exports.version = exports.PDFPageProxy = exports.PDFDocumentProxy = exports.PDFWorker = exports.PDFDataRangeTransport = exports.LoopbackPort = void 0;

var _util = __w_pdfjs_require__(1);

var _display_utils = __w_pdfjs_require__(4);

var _font_loader = __w_pdfjs_require__(5);

var _api_compatibility = __w_pdfjs_require__(6);

var _canvas = __w_pdfjs_require__(8);

var _worker_options = __w_pdfjs_require__(10);

var _is_node = __w_pdfjs_require__(7);

var _message_handler = __w_pdfjs_require__(11);

var _metadata = __w_pdfjs_require__(12);

var _transport_stream = __w_pdfjs_require__(14);

var _webgl = __w_pdfjs_require__(15);

const DEFAULT_RANGE_CHUNK_SIZE = 65536;
const RENDERING_CANCELLED_TIMEOUT = 100;
let createPDFNetworkStream;

function setPDFNetworkStreamFactory(pdfNetworkStreamFactory) {
  createPDFNetworkStream = pdfNetworkStreamFactory;
}

function getDocument(src) {
  const task = new PDFDocumentLoadingTask();
  let source;

  if (typeof src === "string") {
    source = {
      url: src
    };
  } else if ((0, _util.isArrayBuffer)(src)) {
    source = {
      data: src
    };
  } else if (src instanceof PDFDataRangeTransport) {
    source = {
      range: src
    };
  } else {
    if (typeof src !== "object") {
      throw new Error("Invalid parameter in getDocument, " + "need either Uint8Array, string or a parameter object");
    }

    if (!src.url && !src.data && !src.range) {
      throw new Error("Invalid parameter object: need either .data, .range or .url");
    }

    source = src;
  }

  const params = Object.create(null);
  let rangeTransport = null,
      worker = null;

  for (const key in source) {
    if (key === "url" && typeof window !== "undefined") {
      params[key] = new URL(source[key], window.location).href;
      continue;
    } else if (key === "range") {
      rangeTransport = source[key];
      continue;
    } else if (key === "worker") {
      worker = source[key];
      continue;
    } else if (key === "data" && !(source[key] instanceof Uint8Array)) {
      const pdfBytes = source[key];

      if (typeof pdfBytes === "string") {
        params[key] = (0, _util.stringToBytes)(pdfBytes);
      } else if (typeof pdfBytes === "object" && pdfBytes !== null && !isNaN(pdfBytes.length)) {
        params[key] = new Uint8Array(pdfBytes);
      } else if ((0, _util.isArrayBuffer)(pdfBytes)) {
        params[key] = new Uint8Array(pdfBytes);
      } else {
        throw new Error("Invalid PDF binary data: either typed array, " + "string or array-like object is expected in the " + "data property.");
      }

      continue;
    }

    params[key] = source[key];
  }

  params.rangeChunkSize = params.rangeChunkSize || DEFAULT_RANGE_CHUNK_SIZE;
  params.CMapReaderFactory = params.CMapReaderFactory || _display_utils.DOMCMapReaderFactory;
  params.ignoreErrors = params.stopAtErrors !== true;
  params.pdfBug = params.pdfBug === true;
  const NativeImageDecoderValues = Object.values(_util.NativeImageDecoding);

  if (params.nativeImageDecoderSupport === undefined || !NativeImageDecoderValues.includes(params.nativeImageDecoderSupport)) {
    params.nativeImageDecoderSupport = _api_compatibility.apiCompatibilityParams.nativeImageDecoderSupport || _util.NativeImageDecoding.DECODE;
  }

  if (!Number.isInteger(params.maxImageSize)) {
    params.maxImageSize = -1;
  }

  if (typeof params.isEvalSupported !== "boolean") {
    params.isEvalSupported = true;
  }

  if (typeof params.disableFontFace !== "boolean") {
    params.disableFontFace = _api_compatibility.apiCompatibilityParams.disableFontFace || false;
  }

  if (typeof params.disableRange !== "boolean") {
    params.disableRange = false;
  }

  if (typeof params.disableStream !== "boolean") {
    params.disableStream = false;
  }

  if (typeof params.disableAutoFetch !== "boolean") {
    params.disableAutoFetch = false;
  }

  if (typeof params.disableCreateObjectURL !== "boolean") {
    params.disableCreateObjectURL = _api_compatibility.apiCompatibilityParams.disableCreateObjectURL || false;
  }

  (0, _util.setVerbosityLevel)(params.verbosity);

  if (!worker) {
    const workerParams = {
      verbosity: params.verbosity,
      port: _worker_options.GlobalWorkerOptions.workerPort
    };
    worker = workerParams.port ? PDFWorker.fromPort(workerParams) : new PDFWorker(workerParams);
    task._worker = worker;
  }

  const docId = task.docId;
  worker.promise.then(function () {
    if (task.destroyed) {
      throw new Error("Loading aborted");
    }

    return _fetchDocument(worker, params, rangeTransport, docId).then(function (workerId) {
      if (task.destroyed) {
        throw new Error("Loading aborted");
      }

      let networkStream;

      if (rangeTransport) {
        networkStream = new _transport_stream.PDFDataTransportStream({
          length: params.length,
          initialData: params.initialData,
          progressiveDone: params.progressiveDone,
          disableRange: params.disableRange,
          disableStream: params.disableStream
        }, rangeTransport);
      } else if (!params.data) {
        networkStream = createPDFNetworkStream({
          url: params.url,
          length: params.length,
          httpHeaders: params.httpHeaders,
          withCredentials: params.withCredentials,
          rangeChunkSize: params.rangeChunkSize,
          disableRange: params.disableRange,
          disableStream: params.disableStream
        });
      }

      const messageHandler = new _message_handler.MessageHandler(docId, workerId, worker.port);
      messageHandler.postMessageTransfers = worker.postMessageTransfers;
      const transport = new WorkerTransport(messageHandler, task, networkStream, params);
      task._transport = transport;
      messageHandler.send("Ready", null);
    });
  }).catch(task._capability.reject);
  return task;
}

function _fetchDocument(worker, source, pdfDataRangeTransport, docId) {
  if (worker.destroyed) {
    return Promise.reject(new Error("Worker was destroyed"));
  }

  if (pdfDataRangeTransport) {
    source.length = pdfDataRangeTransport.length;
    source.initialData = pdfDataRangeTransport.initialData;
    source.progressiveDone = pdfDataRangeTransport.progressiveDone;
  }

  return worker.messageHandler.sendWithPromise("GetDocRequest", {
    docId,
    apiVersion: '2.5.32',
    source: {
      data: source.data,
      url: source.url,
      password: source.password,
      disableAutoFetch: source.disableAutoFetch,
      rangeChunkSize: source.rangeChunkSize,
      length: source.length
    },
    maxImageSize: source.maxImageSize,
    disableFontFace: source.disableFontFace,
    disableCreateObjectURL: source.disableCreateObjectURL,
    postMessageTransfers: worker.postMessageTransfers,
    docBaseUrl: source.docBaseUrl,
    nativeImageDecoderSupport: source.nativeImageDecoderSupport,
    ignoreErrors: source.ignoreErrors,
    isEvalSupported: source.isEvalSupported
  }).then(function (workerId) {
    if (worker.destroyed) {
      throw new Error("Worker was destroyed");
    }

    return workerId;
  });
}

const PDFDocumentLoadingTask = function PDFDocumentLoadingTaskClosure() {
  let nextDocumentId = 0;

  class PDFDocumentLoadingTask {
    constructor() {
      this._capability = (0, _util.createPromiseCapability)();
      this._transport = null;
      this._worker = null;
      this.docId = "d" + nextDocumentId++;
      this.destroyed = false;
      this.onPassword = null;
      this.onProgress = null;
      this.onUnsupportedFeature = null;
    }

    get promise() {
      return this._capability.promise;
    }

    destroy() {
      this.destroyed = true;
      const transportDestroyed = !this._transport ? Promise.resolve() : this._transport.destroy();
      return transportDestroyed.then(() => {
        this._transport = null;

        if (this._worker) {
          this._worker.destroy();

          this._worker = null;
        }
      });
    }

    then(onFulfilled, onRejected) {
      throw new Error("Removed API method: " + "PDFDocumentLoadingTask.then, use the `promise` getter instead.");
    }

  }

  return PDFDocumentLoadingTask;
}();

class PDFDataRangeTransport {
  constructor(length, initialData, progressiveDone = false) {
    this.length = length;
    this.initialData = initialData;
    this.progressiveDone = progressiveDone;
    this._rangeListeners = [];
    this._progressListeners = [];
    this._progressiveReadListeners = [];
    this._progressiveDoneListeners = [];
    this._readyCapability = (0, _util.createPromiseCapability)();
  }

  addRangeListener(listener) {
    this._rangeListeners.push(listener);
  }

  addProgressListener(listener) {
    this._progressListeners.push(listener);
  }

  addProgressiveReadListener(listener) {
    this._progressiveReadListeners.push(listener);
  }

  addProgressiveDoneListener(listener) {
    this._progressiveDoneListeners.push(listener);
  }

  onDataRange(begin, chunk) {
    for (const listener of this._rangeListeners) {
      listener(begin, chunk);
    }
  }

  onDataProgress(loaded, total) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressListeners) {
        listener(loaded, total);
      }
    });
  }

  onDataProgressiveRead(chunk) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressiveReadListeners) {
        listener(chunk);
      }
    });
  }

  onDataProgressiveDone() {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressiveDoneListeners) {
        listener();
      }
    });
  }

  transportReady() {
    this._readyCapability.resolve();
  }

  requestDataRange(begin, end) {
    (0, _util.unreachable)("Abstract method PDFDataRangeTransport.requestDataRange");
  }

  abort() {}

}

exports.PDFDataRangeTransport = PDFDataRangeTransport;

class PDFDocumentProxy {
  constructor(pdfInfo, transport) {
    this._pdfInfo = pdfInfo;
    this._transport = transport;
  }

  get numPages() {
    return this._pdfInfo.numPages;
  }

  get fingerprint() {
    return this._pdfInfo.fingerprint;
  }

  getPage(pageNumber) {
    return this._transport.getPage(pageNumber);
  }

  getPageIndex(ref) {
    return this._transport.getPageIndex(ref);
  }

  getDestinations() {
    return this._transport.getDestinations();
  }

  getDestination(id) {
    return this._transport.getDestination(id);
  }

  getPageLabels() {
    return this._transport.getPageLabels();
  }

  getPageLayout() {
    return this._transport.getPageLayout();
  }

  getPageMode() {
    return this._transport.getPageMode();
  }

  getViewerPreferences() {
    return this._transport.getViewerPreferences();
  }

  getOpenAction() {
    return this._transport.getOpenAction();
  }

  getOpenActionDestination() {
    (0, _display_utils.deprecated)("getOpenActionDestination, use getOpenAction instead.");
    return this.getOpenAction().then(function (openAction) {
      return openAction && openAction.dest ? openAction.dest : null;
    });
  }

  getAttachments() {
    return this._transport.getAttachments();
  }

  getJavaScript() {
    return this._transport.getJavaScript();
  }

  getOutline() {
    return this._transport.getOutline();
  }

  getPermissions() {
    return this._transport.getPermissions();
  }

  getMetadata() {
    return this._transport.getMetadata();
  }

  getData() {
    return this._transport.getData();
  }

  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }

  getStats() {
    return this._transport.getStats();
  }

  cleanup() {
    return this._transport.startCleanup();
  }

  destroy() {
    return this.loadingTask.destroy();
  }

  get loadingParams() {
    return this._transport.loadingParams;
  }

  get loadingTask() {
    return this._transport.loadingTask;
  }

}

exports.PDFDocumentProxy = PDFDocumentProxy;

class PDFPageProxy {
  constructor(pageIndex, pageInfo, transport, pdfBug = false) {
    this._pageIndex = pageIndex;
    this._pageInfo = pageInfo;
    this._transport = transport;
    this._stats = pdfBug ? new _display_utils.StatTimer() : null;
    this._pdfBug = pdfBug;
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();
    this.cleanupAfterRender = false;
    this.pendingCleanup = false;
    this.intentStates = Object.create(null);
    this.destroyed = false;
  }

  get pageNumber() {
    return this._pageIndex + 1;
  }

  get rotate() {
    return this._pageInfo.rotate;
  }

  get ref() {
    return this._pageInfo.ref;
  }

  get userUnit() {
    return this._pageInfo.userUnit;
  }

  get view() {
    return this._pageInfo.view;
  }

  getViewport({
    scale,
    rotation = this.rotate,
    offsetX = 0,
    offsetY = 0,
    dontFlip = false
  } = {}) {
    if (arguments.length > 1 || typeof arguments[0] === "number") {
      throw new Error("PDFPageProxy.getViewport is called with obsolete arguments.");
    }

    return new _display_utils.PageViewport({
      viewBox: this.view,
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip
    });
  }

  getAnnotations({
    intent = null
  } = {}) {
    if (!this.annotationsPromise || this.annotationsIntent !== intent) {
      this.annotationsPromise = this._transport.getAnnotations(this._pageIndex, intent);
      this.annotationsIntent = intent;
    }

    return this.annotationsPromise;
  }

  render({
    canvasContext,
    viewport,
    intent = "display",
    enableWebGL = false,
    renderInteractiveForms = false,
    transform = null,
    imageLayer = null,
    canvasFactory = null,
    background = null,
    annotationsNotRendered = []
  }) {
    if (this._stats) {
      this._stats.time("Overall");
    }

    const renderingIntent = intent === "print" ? "print" : "display";
    this.pendingCleanup = false;

    if (!this.intentStates[renderingIntent]) {
      this.intentStates[renderingIntent] = Object.create(null);
    }

    const intentState = this.intentStates[renderingIntent];

    if (intentState.streamReaderCancelTimeout) {
      clearTimeout(intentState.streamReaderCancelTimeout);
      intentState.streamReaderCancelTimeout = null;
    }

    const canvasFactoryInstance = canvasFactory || new _display_utils.DOMCanvasFactory();
    const webGLContext = new _webgl.WebGLContext({
      enable: enableWebGL
    });

    if (!intentState.displayReadyCapability) {
      intentState.displayReadyCapability = (0, _util.createPromiseCapability)();
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false
      };

      if (this._stats) {
        this._stats.time("Page Request");
      }

      this._pumpOperatorList({
        pageIndex: this._pageIndex,
        intent: renderingIntent,
        renderInteractiveForms: renderInteractiveForms === true,
        annotationsNotRendered: annotationsNotRendered
      });
    }

    const complete = error => {
      const i = intentState.renderTasks.indexOf(internalRenderTask);

      if (i >= 0) {
        intentState.renderTasks.splice(i, 1);
      }

      if (this.cleanupAfterRender || renderingIntent === "print") {
        this.pendingCleanup = true;
      }

      this._tryCleanup();

      if (error) {
        internalRenderTask.capability.reject(error);

        this._abortOperatorList({
          intentState,
          reason: error
        });
      } else {
        internalRenderTask.capability.resolve();
      }

      if (this._stats) {
        this._stats.timeEnd("Rendering");

        this._stats.timeEnd("Overall");
      }
    };

    const internalRenderTask = new InternalRenderTask({
      callback: complete,
      params: {
        canvasContext,
        viewport,
        transform,
        imageLayer,
        background
      },
      objs: this.objs,
      commonObjs: this.commonObjs,
      operatorList: intentState.operatorList,
      pageIndex: this._pageIndex,
      canvasFactory: canvasFactoryInstance,
      webGLContext,
      useRequestAnimationFrame: renderingIntent !== "print",
      pdfBug: this._pdfBug
    });

    if (!intentState.renderTasks) {
      intentState.renderTasks = [];
    }

    intentState.renderTasks.push(internalRenderTask);
    const renderTask = internalRenderTask.task;
    intentState.displayReadyCapability.promise.then(transparency => {
      if (this.pendingCleanup) {
        complete();
        return;
      }

      if (this._stats) {
        this._stats.time("Rendering");
      }

      internalRenderTask.initializeGraphics(transparency);
      internalRenderTask.operatorListChanged();
    }).catch(complete);
    return renderTask;
  }

  getOperatorList() {
    function operatorListChanged() {
      if (intentState.operatorList.lastChunk) {
        intentState.opListReadCapability.resolve(intentState.operatorList);
        const i = intentState.renderTasks.indexOf(opListTask);

        if (i >= 0) {
          intentState.renderTasks.splice(i, 1);
        }
      }
    }

    const renderingIntent = "oplist";

    if (!this.intentStates[renderingIntent]) {
      this.intentStates[renderingIntent] = Object.create(null);
    }

    const intentState = this.intentStates[renderingIntent];
    let opListTask;

    if (!intentState.opListReadCapability) {
      opListTask = {};
      opListTask.operatorListChanged = operatorListChanged;
      intentState.opListReadCapability = (0, _util.createPromiseCapability)();
      intentState.renderTasks = [];
      intentState.renderTasks.push(opListTask);
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false
      };

      if (this._stats) {
        this._stats.time("Page Request");
      }

      this._pumpOperatorList({
        pageIndex: this._pageIndex,
        intent: renderingIntent
      });
    }

    return intentState.opListReadCapability.promise;
  }

  streamTextContent({
    normalizeWhitespace = false,
    disableCombineTextItems = false
  } = {}) {
    const TEXT_CONTENT_CHUNK_SIZE = 100;
    return this._transport.messageHandler.sendWithStream("GetTextContent", {
      pageIndex: this._pageIndex,
      normalizeWhitespace: normalizeWhitespace === true,
      combineTextItems: disableCombineTextItems !== true
    }, {
      highWaterMark: TEXT_CONTENT_CHUNK_SIZE,

      size(textContent) {
        return textContent.items.length;
      }

    });
  }

  getTextContent(params = {}) {
    const readableStream = this.streamTextContent(params);
    return new Promise(function (resolve, reject) {
      function pump() {
        reader.read().then(function ({
          value,
          done
        }) {
          if (done) {
            resolve(textContent);
            return;
          }

          Object.assign(textContent.styles, value.styles);
          textContent.items.push(...value.items);
          pump();
        }, reject);
      }

      const reader = readableStream.getReader();
      const textContent = {
        items: [],
        styles: Object.create(null)
      };
      pump();
    });
  }

  _destroy() {
    this.destroyed = true;
    this._transport.pageCache[this._pageIndex] = null;
    const waitOn = [];
    Object.keys(this.intentStates).forEach(intent => {
      const intentState = this.intentStates[intent];

      this._abortOperatorList({
        intentState,
        reason: new Error("Page was destroyed."),
        force: true
      });

      if (intent === "oplist") {
        return;
      }

      intentState.renderTasks.forEach(function (renderTask) {
        const renderCompleted = renderTask.capability.promise.catch(function () {});
        waitOn.push(renderCompleted);
        renderTask.cancel();
      });
    });
    this.objs.clear();
    this.annotationsPromise = null;
    this.pendingCleanup = false;
    return Promise.all(waitOn);
  }

  cleanup(resetStats = false) {
    this.pendingCleanup = true;
    return this._tryCleanup(resetStats);
  }

  _tryCleanup(resetStats = false) {
    if (!this.pendingCleanup || Object.keys(this.intentStates).some(intent => {
      const intentState = this.intentStates[intent];
      return intentState.renderTasks.length !== 0 || !intentState.operatorList.lastChunk;
    })) {
      return false;
    }

    Object.keys(this.intentStates).forEach(intent => {
      delete this.intentStates[intent];
    });
    this.objs.clear();
    this.annotationsPromise = null;

    if (resetStats && this._stats) {
      this._stats = new _display_utils.StatTimer();
    }

    this.pendingCleanup = false;
    return true;
  }

  _startRenderPage(transparency, intent) {
    const intentState = this.intentStates[intent];

    if (!intentState) {
      return;
    }

    if (this._stats) {
      this._stats.timeEnd("Page Request");
    }

    if (intentState.displayReadyCapability) {
      intentState.displayReadyCapability.resolve(transparency);
    }
  }

  _renderPageChunk(operatorListChunk, intentState) {
    for (let i = 0, ii = operatorListChunk.length; i < ii; i++) {
      intentState.operatorList.fnArray.push(operatorListChunk.fnArray[i]);
      intentState.operatorList.argsArray.push(operatorListChunk.argsArray[i]);
    }

    intentState.operatorList.lastChunk = operatorListChunk.lastChunk;

    for (let i = 0; i < intentState.renderTasks.length; i++) {
      intentState.renderTasks[i].operatorListChanged();
    }

    if (operatorListChunk.lastChunk) {
      this._tryCleanup();
    }
  }

  _pumpOperatorList(args) {
    (0, _util.assert)(args.intent, 'PDFPageProxy._pumpOperatorList: Expected "intent" argument.');

    const readableStream = this._transport.messageHandler.sendWithStream("GetOperatorList", args);

    const reader = readableStream.getReader();
    const intentState = this.intentStates[args.intent];
    intentState.streamReader = reader;

    const pump = () => {
      reader.read().then(({
        value,
        done
      }) => {
        if (done) {
          intentState.streamReader = null;
          return;
        }

        if (this._transport.destroyed) {
          return;
        }

        this._renderPageChunk(value, intentState);

        pump();
      }, reason => {
        intentState.streamReader = null;

        if (this._transport.destroyed) {
          return;
        }

        if (intentState.operatorList) {
          intentState.operatorList.lastChunk = true;

          for (let i = 0; i < intentState.renderTasks.length; i++) {
            intentState.renderTasks[i].operatorListChanged();
          }

          this._tryCleanup();
        }

        if (intentState.displayReadyCapability) {
          intentState.displayReadyCapability.reject(reason);
        } else if (intentState.opListReadCapability) {
          intentState.opListReadCapability.reject(reason);
        } else {
          throw reason;
        }
      });
    };

    pump();
  }

  _abortOperatorList({
    intentState,
    reason,
    force = false
  }) {
    (0, _util.assert)(reason instanceof Error || typeof reason === "object" && reason !== null, 'PDFPageProxy._abortOperatorList: Expected "reason" argument.');

    if (!intentState.streamReader) {
      return;
    }

    if (!force) {
      if (intentState.renderTasks.length !== 0) {
        return;
      }

      if (reason instanceof _display_utils.RenderingCancelledException) {
        intentState.streamReaderCancelTimeout = setTimeout(() => {
          this._abortOperatorList({
            intentState,
            reason,
            force: true
          });

          intentState.streamReaderCancelTimeout = null;
        }, RENDERING_CANCELLED_TIMEOUT);
        return;
      }
    }

    intentState.streamReader.cancel(new _util.AbortException(reason && reason.message));
    intentState.streamReader = null;

    if (this._transport.destroyed) {
      return;
    }

    Object.keys(this.intentStates).some(intent => {
      if (this.intentStates[intent] === intentState) {
        delete this.intentStates[intent];
        return true;
      }

      return false;
    });
    this.cleanup();
  }

  get stats() {
    return this._stats;
  }

}

exports.PDFPageProxy = PDFPageProxy;

class LoopbackPort {
  constructor(defer = true) {
    this._listeners = [];
    this._defer = defer;
    this._deferred = Promise.resolve(undefined);
  }

  postMessage(obj, transfers) {
    function cloneValue(value) {
      if (typeof value !== "object" || value === null) {
        return value;
      }

      if (cloned.has(value)) {
        return cloned.get(value);
      }

      let buffer, result;

      if ((buffer = value.buffer) && (0, _util.isArrayBuffer)(buffer)) {
        const transferable = transfers && transfers.includes(buffer);

        if (transferable) {
          result = new value.constructor(buffer, value.byteOffset, value.byteLength);
        } else {
          result = new value.constructor(value);
        }

        cloned.set(value, result);
        return result;
      }

      result = Array.isArray(value) ? [] : {};
      cloned.set(value, result);

      for (const i in value) {
        let desc,
            p = value;

        while (!(desc = Object.getOwnPropertyDescriptor(p, i))) {
          p = Object.getPrototypeOf(p);
        }

        if (typeof desc.value === "undefined") {
          continue;
        }

        if (typeof desc.value === "function") {
          if (value.hasOwnProperty && value.hasOwnProperty(i)) {
            throw new Error(`LoopbackPort.postMessage - cannot clone: ${value[i]}`);
          }

          continue;
        }

        result[i] = cloneValue(desc.value);
      }

      return result;
    }

    if (!this._defer) {
      this._listeners.forEach(listener => {
        listener.call(this, {
          data: obj
        });
      });

      return;
    }

    const cloned = new WeakMap();
    const e = {
      data: cloneValue(obj)
    };

    this._deferred.then(() => {
      this._listeners.forEach(listener => {
        listener.call(this, e);
      });
    });
  }

  addEventListener(name, listener) {
    this._listeners.push(listener);
  }

  removeEventListener(name, listener) {
    const i = this._listeners.indexOf(listener);

    this._listeners.splice(i, 1);
  }

  terminate() {
    this._listeners.length = 0;
  }

}

exports.LoopbackPort = LoopbackPort;

const PDFWorker = function PDFWorkerClosure() {
  const pdfWorkerPorts = new WeakMap();
  let isWorkerDisabled = false;
  let fallbackWorkerSrc;
  let nextFakeWorkerId = 0;
  let fakeWorkerCapability;

  if (_is_node.isNodeJS && typeof require === "function") {
    isWorkerDisabled = true;
    fallbackWorkerSrc = "./pdf.worker.js";
  } else if (typeof document === "object" && "currentScript" in document) {
    const pdfjsFilePath = document.currentScript && document.currentScript.src;

    if (pdfjsFilePath) {
      fallbackWorkerSrc = pdfjsFilePath.replace(/(\.(?:min\.)?js)(\?.*)?$/i, ".worker$1$2");
    }
  }

  function getWorkerSrc() {
    if (_worker_options.GlobalWorkerOptions.workerSrc) {
      return _worker_options.GlobalWorkerOptions.workerSrc;
    }

    if (typeof fallbackWorkerSrc !== "undefined") {
      if (!_is_node.isNodeJS) {
        (0, _display_utils.deprecated)('No "GlobalWorkerOptions.workerSrc" specified.');
      }

      return fallbackWorkerSrc;
    }

    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }

  function getMainThreadWorkerMessageHandler() {
    let mainWorkerMessageHandler;

    try {
      mainWorkerMessageHandler = globalThis.pdfjsWorker && globalThis.pdfjsWorker.WorkerMessageHandler;
    } catch (ex) {}

    return mainWorkerMessageHandler || null;
  }

  function setupFakeWorkerGlobal() {
    if (fakeWorkerCapability) {
      return fakeWorkerCapability.promise;
    }

    fakeWorkerCapability = (0, _util.createPromiseCapability)();

    const loader = async function () {
      const mainWorkerMessageHandler = getMainThreadWorkerMessageHandler();

      if (mainWorkerMessageHandler) {
        return mainWorkerMessageHandler;
      }

      if (_is_node.isNodeJS && typeof require === "function") {
        const worker = eval("require")(getWorkerSrc());
        return worker.WorkerMessageHandler;
      }

      await (0, _display_utils.loadScript)(getWorkerSrc());
      return window.pdfjsWorker.WorkerMessageHandler;
    };

    loader().then(fakeWorkerCapability.resolve, fakeWorkerCapability.reject);
    return fakeWorkerCapability.promise;
  }

  function createCDNWrapper(url) {
    const wrapper = "importScripts('" + url + "');";
    return URL.createObjectURL(new Blob([wrapper]));
  }

  class PDFWorker {
    constructor({
      name = null,
      port = null,
      verbosity = (0, _util.getVerbosityLevel)()
    } = {}) {
      if (port && pdfWorkerPorts.has(port)) {
        throw new Error("Cannot use more than one PDFWorker per port");
      }

      this.name = name;
      this.destroyed = false;
      this.postMessageTransfers = true;
      this.verbosity = verbosity;
      this._readyCapability = (0, _util.createPromiseCapability)();
      this._port = null;
      this._webWorker = null;
      this._messageHandler = null;

      if (port) {
        pdfWorkerPorts.set(port, this);

        this._initializeFromPort(port);

        return;
      }

      this._initialize();
    }

    get promise() {
      return this._readyCapability.promise;
    }

    get port() {
      return this._port;
    }

    get messageHandler() {
      return this._messageHandler;
    }

    _initializeFromPort(port) {
      this._port = port;
      this._messageHandler = new _message_handler.MessageHandler("main", "worker", port);

      this._messageHandler.on("ready", function () {});

      this._readyCapability.resolve();
    }

    _initialize() {
      if (typeof Worker !== "undefined" && !isWorkerDisabled && !getMainThreadWorkerMessageHandler()) {
        let workerSrc = getWorkerSrc();

        try {
          if (!(0, _util.isSameOrigin)(window.location.href, workerSrc)) {
            workerSrc = createCDNWrapper(new URL(workerSrc, window.location).href);
          }

          const worker = new Worker(workerSrc);
          const messageHandler = new _message_handler.MessageHandler("main", "worker", worker);

          const terminateEarly = () => {
            worker.removeEventListener("error", onWorkerError);
            messageHandler.destroy();
            worker.terminate();

            if (this.destroyed) {
              this._readyCapability.reject(new Error("Worker was destroyed"));
            } else {
              this._setupFakeWorker();
            }
          };

          const onWorkerError = () => {
            if (!this._webWorker) {
              terminateEarly();
            }
          };

          worker.addEventListener("error", onWorkerError);
          messageHandler.on("test", data => {
            worker.removeEventListener("error", onWorkerError);

            if (this.destroyed) {
              terminateEarly();
              return;
            }

            if (data) {
              this._messageHandler = messageHandler;
              this._port = worker;
              this._webWorker = worker;

              if (!data.supportTransfers) {
                this.postMessageTransfers = false;
              }

              this._readyCapability.resolve();

              messageHandler.send("configure", {
                verbosity: this.verbosity
              });
            } else {
              this._setupFakeWorker();

              messageHandler.destroy();
              worker.terminate();
            }
          });
          messageHandler.on("ready", data => {
            worker.removeEventListener("error", onWorkerError);

            if (this.destroyed) {
              terminateEarly();
              return;
            }

            try {
              sendTest();
            } catch (e) {
              this._setupFakeWorker();
            }
          });

          const sendTest = () => {
            const testObj = new Uint8Array([this.postMessageTransfers ? 255 : 0]);

            try {
              messageHandler.send("test", testObj, [testObj.buffer]);
            } catch (ex) {
              (0, _util.warn)("Cannot use postMessage transfers.");
              testObj[0] = 0;
              messageHandler.send("test", testObj);
            }
          };

          sendTest();
          return;
        } catch (e) {
          (0, _util.info)("The worker has been disabled.");
        }
      }

      this._setupFakeWorker();
    }

    _setupFakeWorker() {
      if (!isWorkerDisabled) {
        (0, _util.warn)("Setting up fake worker.");
        isWorkerDisabled = true;
      }

      setupFakeWorkerGlobal().then(WorkerMessageHandler => {
        if (this.destroyed) {
          this._readyCapability.reject(new Error("Worker was destroyed"));

          return;
        }

        const port = new LoopbackPort();
        this._port = port;
        const id = "fake" + nextFakeWorkerId++;
        const workerHandler = new _message_handler.MessageHandler(id + "_worker", id, port);
        WorkerMessageHandler.setup(workerHandler, port);
        const messageHandler = new _message_handler.MessageHandler(id, id + "_worker", port);
        this._messageHandler = messageHandler;

        this._readyCapability.resolve();

        messageHandler.send("configure", {
          verbosity: this.verbosity
        });
      }).catch(reason => {
        this._readyCapability.reject(new Error(`Setting up fake worker failed: "${reason.message}".`));
      });
    }

    destroy() {
      this.destroyed = true;

      if (this._webWorker) {
        this._webWorker.terminate();

        this._webWorker = null;
      }

      pdfWorkerPorts.delete(this._port);
      this._port = null;

      if (this._messageHandler) {
        this._messageHandler.destroy();

        this._messageHandler = null;
      }
    }

    static fromPort(params) {
      if (!params || !params.port) {
        throw new Error("PDFWorker.fromPort - invalid method signature.");
      }

      if (pdfWorkerPorts.has(params.port)) {
        return pdfWorkerPorts.get(params.port);
      }

      return new PDFWorker(params);
    }

    static getWorkerSrc() {
      return getWorkerSrc();
    }

  }

  return PDFWorker;
}();

exports.PDFWorker = PDFWorker;

class WorkerTransport {
  constructor(messageHandler, loadingTask, networkStream, params) {
    this.messageHandler = messageHandler;
    this.loadingTask = loadingTask;
    this.commonObjs = new PDFObjects();
    this.fontLoader = new _font_loader.FontLoader({
      docId: loadingTask.docId,
      onUnsupportedFeature: this._onUnsupportedFeature.bind(this)
    });
    this._params = params;
    this.CMapReaderFactory = new params.CMapReaderFactory({
      baseUrl: params.cMapUrl,
      isCompressed: params.cMapPacked
    });
    this.destroyed = false;
    this.destroyCapability = null;
    this._passwordCapability = null;
    this._networkStream = networkStream;
    this._fullReader = null;
    this._lastProgress = null;
    this.pageCache = [];
    this.pagePromises = [];
    this.downloadInfoCapability = (0, _util.createPromiseCapability)();
    this.setupMessageHandler();
  }

  destroy() {
    if (this.destroyCapability) {
      return this.destroyCapability.promise;
    }

    this.destroyed = true;
    this.destroyCapability = (0, _util.createPromiseCapability)();

    if (this._passwordCapability) {
      this._passwordCapability.reject(new Error("Worker was destroyed during onPassword callback"));
    }

    const waitOn = [];
    this.pageCache.forEach(function (page) {
      if (page) {
        waitOn.push(page._destroy());
      }
    });
    this.pageCache.length = 0;
    this.pagePromises.length = 0;
    const terminated = this.messageHandler.sendWithPromise("Terminate", null);
    waitOn.push(terminated);
    Promise.all(waitOn).then(() => {
      this.fontLoader.clear();

      if (this._networkStream) {
        this._networkStream.cancelAllRequests(new _util.AbortException("Worker was terminated."));
      }

      if (this.messageHandler) {
        this.messageHandler.destroy();
        this.messageHandler = null;
      }

      this.destroyCapability.resolve();
    }, this.destroyCapability.reject);
    return this.destroyCapability.promise;
  }

  setupMessageHandler() {
    const {
      messageHandler,
      loadingTask
    } = this;
    messageHandler.on("GetReader", (data, sink) => {
      (0, _util.assert)(this._networkStream);
      this._fullReader = this._networkStream.getFullReader();

      this._fullReader.onProgress = evt => {
        this._lastProgress = {
          loaded: evt.loaded,
          total: evt.total
        };
      };

      sink.onPull = () => {
        this._fullReader.read().then(function ({
          value,
          done
        }) {
          if (done) {
            sink.close();
            return;
          }

          (0, _util.assert)((0, _util.isArrayBuffer)(value));
          sink.enqueue(new Uint8Array(value), 1, [value]);
        }).catch(reason => {
          sink.error(reason);
        });
      };

      sink.onCancel = reason => {
        this._fullReader.cancel(reason);
      };
    });
    messageHandler.on("ReaderHeadersReady", data => {
      const headersCapability = (0, _util.createPromiseCapability)();
      const fullReader = this._fullReader;
      fullReader.headersReady.then(() => {
        if (!fullReader.isStreamingSupported || !fullReader.isRangeSupported) {
          if (this._lastProgress && loadingTask.onProgress) {
            loadingTask.onProgress(this._lastProgress);
          }

          fullReader.onProgress = evt => {
            if (loadingTask.onProgress) {
              loadingTask.onProgress({
                loaded: evt.loaded,
                total: evt.total
              });
            }
          };
        }

        headersCapability.resolve({
          isStreamingSupported: fullReader.isStreamingSupported,
          isRangeSupported: fullReader.isRangeSupported,
          contentLength: fullReader.contentLength
        });
      }, headersCapability.reject);
      return headersCapability.promise;
    });
    messageHandler.on("GetRangeReader", (data, sink) => {
      (0, _util.assert)(this._networkStream);

      const rangeReader = this._networkStream.getRangeReader(data.begin, data.end);

      if (!rangeReader) {
        sink.close();
        return;
      }

      sink.onPull = () => {
        rangeReader.read().then(function ({
          value,
          done
        }) {
          if (done) {
            sink.close();
            return;
          }

          (0, _util.assert)((0, _util.isArrayBuffer)(value));
          sink.enqueue(new Uint8Array(value), 1, [value]);
        }).catch(reason => {
          sink.error(reason);
        });
      };

      sink.onCancel = reason => {
        rangeReader.cancel(reason);
      };
    });
    messageHandler.on("GetDoc", ({
      pdfInfo
    }) => {
      this._numPages = pdfInfo.numPages;

      loadingTask._capability.resolve(new PDFDocumentProxy(pdfInfo, this));
    });
    messageHandler.on("DocException", function (ex) {
      let reason;

      switch (ex.name) {
        case "PasswordException":
          reason = new _util.PasswordException(ex.message, ex.code);
          break;

        case "InvalidPDFException":
          reason = new _util.InvalidPDFException(ex.message);
          break;

        case "MissingPDFException":
          reason = new _util.MissingPDFException(ex.message);
          break;

        case "UnexpectedResponseException":
          reason = new _util.UnexpectedResponseException(ex.message, ex.status);
          break;

        case "UnknownErrorException":
          reason = new _util.UnknownErrorException(ex.message, ex.details);
          break;
      }

      loadingTask._capability.reject(reason);
    });
    messageHandler.on("PasswordRequest", exception => {
      this._passwordCapability = (0, _util.createPromiseCapability)();

      if (loadingTask.onPassword) {
        const updatePassword = password => {
          this._passwordCapability.resolve({
            password
          });
        };

        try {
          loadingTask.onPassword(updatePassword, exception.code);
        } catch (ex) {
          this._passwordCapability.reject(ex);
        }
      } else {
        this._passwordCapability.reject(new _util.PasswordException(exception.message, exception.code));
      }

      return this._passwordCapability.promise;
    });
    messageHandler.on("DataLoaded", data => {
      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.length,
          total: data.length
        });
      }

      this.downloadInfoCapability.resolve(data);
    });
    messageHandler.on("StartRenderPage", data => {
      if (this.destroyed) {
        return;
      }

      const page = this.pageCache[data.pageIndex];

      page._startRenderPage(data.transparency, data.intent);
    });
    messageHandler.on("commonobj", data => {
      if (this.destroyed) {
        return;
      }

      const [id, type, exportedData] = data;

      if (this.commonObjs.has(id)) {
        return;
      }

      switch (type) {
        case "Font":
          const params = this._params;

          if ("error" in exportedData) {
            const exportedError = exportedData.error;
            (0, _util.warn)(`Error during font loading: ${exportedError}`);
            this.commonObjs.resolve(id, exportedError);
            break;
          }

          let fontRegistry = null;

          if (params.pdfBug && globalThis.FontInspector && globalThis.FontInspector.enabled) {
            fontRegistry = {
              registerFont(font, url) {
                globalThis.FontInspector.fontAdded(font, url);
              }

            };
          }

          const font = new _font_loader.FontFaceObject(exportedData, {
            isEvalSupported: params.isEvalSupported,
            disableFontFace: params.disableFontFace,
            ignoreErrors: params.ignoreErrors,
            onUnsupportedFeature: this._onUnsupportedFeature.bind(this),
            fontRegistry
          });
          this.fontLoader.bind(font).then(() => {
            this.commonObjs.resolve(id, font);
          }, reason => {
            messageHandler.sendWithPromise("FontFallback", {
              id
            }).finally(() => {
              this.commonObjs.resolve(id, font);
            });
          });
          break;

        case "FontPath":
        case "FontType3Res":
          this.commonObjs.resolve(id, exportedData);
          break;

        default:
          throw new Error(`Got unknown common object type ${type}`);
      }
    });
    messageHandler.on("obj", data => {
      if (this.destroyed) {
        return undefined;
      }

      const [id, pageIndex, type, imageData] = data;
      const pageProxy = this.pageCache[pageIndex];

      if (pageProxy.objs.has(id)) {
        return undefined;
      }

      switch (type) {
        case "JpegStream":
          return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = function () {
              resolve(img);
            };

            img.onerror = function () {
              reject(new Error("Error during JPEG image loading"));
              (0, _display_utils.releaseImageResources)(img);
            };

            img.src = imageData;
          }).then(img => {
            pageProxy.objs.resolve(id, img);
          });

        case "Image":
          pageProxy.objs.resolve(id, imageData);
          const MAX_IMAGE_SIZE_TO_STORE = 8000000;

          if (imageData && "data" in imageData && imageData.data.length > MAX_IMAGE_SIZE_TO_STORE) {
            pageProxy.cleanupAfterRender = true;
          }

          break;

        default:
          throw new Error(`Got unknown object type ${type}`);
      }

      return undefined;
    });
    messageHandler.on("DocProgress", data => {
      if (this.destroyed) {
        return;
      }

      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.loaded,
          total: data.total
        });
      }
    });
    messageHandler.on("UnsupportedFeature", this._onUnsupportedFeature.bind(this));
    messageHandler.on("JpegDecode", ([imageUrl, components]) => {
      if (this.destroyed) {
        return Promise.reject(new Error("Worker was destroyed"));
      }

      if (typeof document === "undefined") {
        return Promise.reject(new Error('"document" is not defined.'));
      }

      if (components !== 3 && components !== 1) {
        return Promise.reject(new Error("Only 3 components or 1 component can be returned"));
      }

      return new Promise(function (resolve, reject) {
        const img = new Image();

        img.onload = function () {
          const {
            width,
            height
          } = img;
          const size = width * height;
          const rgbaLength = size * 4;
          const buf = new Uint8ClampedArray(size * components);
          let tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          let tmpCtx = tmpCanvas.getContext("2d");
          tmpCtx.drawImage(img, 0, 0);
          const data = tmpCtx.getImageData(0, 0, width, height).data;

          if (components === 3) {
            for (let i = 0, j = 0; i < rgbaLength; i += 4, j += 3) {
              buf[j] = data[i];
              buf[j + 1] = data[i + 1];
              buf[j + 2] = data[i + 2];
            }
          } else if (components === 1) {
            for (let i = 0, j = 0; i < rgbaLength; i += 4, j++) {
              buf[j] = data[i];
            }
          }

          resolve({
            data: buf,
            width,
            height
          });
          (0, _display_utils.releaseImageResources)(img);
          tmpCanvas.width = 0;
          tmpCanvas.height = 0;
          tmpCanvas = null;
          tmpCtx = null;
        };

        img.onerror = function () {
          reject(new Error("JpegDecode failed to load image"));
          (0, _display_utils.releaseImageResources)(img);
        };

        img.src = imageUrl;
      });
    });
    messageHandler.on("FetchBuiltInCMap", (data, sink) => {
      if (this.destroyed) {
        sink.error(new Error("Worker was destroyed"));
        return;
      }

      let fetched = false;

      sink.onPull = () => {
        if (fetched) {
          sink.close();
          return;
        }

        fetched = true;
        this.CMapReaderFactory.fetch(data).then(function (builtInCMap) {
          sink.enqueue(builtInCMap, 1, [builtInCMap.cMapData.buffer]);
        }).catch(function (reason) {
          sink.error(reason);
        });
      };
    });
  }

  _onUnsupportedFeature({
    featureId
  }) {
    if (this.destroyed) {
      return;
    }

    if (this.loadingTask.onUnsupportedFeature) {
      this.loadingTask.onUnsupportedFeature(featureId);
    }
  }

  getData() {
    return this.messageHandler.sendWithPromise("GetData", null);
  }

  getPage(pageNumber) {
    if (!Number.isInteger(pageNumber) || pageNumber <= 0 || pageNumber > this._numPages) {
      return Promise.reject(new Error("Invalid page request"));
    }

    const pageIndex = pageNumber - 1;

    if (pageIndex in this.pagePromises) {
      return this.pagePromises[pageIndex];
    }

    const promise = this.messageHandler.sendWithPromise("GetPage", {
      pageIndex
    }).then(pageInfo => {
      if (this.destroyed) {
        throw new Error("Transport destroyed");
      }

      const page = new PDFPageProxy(pageIndex, pageInfo, this, this._params.pdfBug);
      this.pageCache[pageIndex] = page;
      return page;
    });
    this.pagePromises[pageIndex] = promise;
    return promise;
  }

  getPageIndex(ref) {
    return this.messageHandler.sendWithPromise("GetPageIndex", {
      ref
    }).catch(function (reason) {
      return Promise.reject(new Error(reason));
    });
  }

  getAnnotations(pageIndex, intent) {
    return this.messageHandler.sendWithPromise("GetAnnotations", {
      pageIndex,
      intent
    });
  }

  getDestinations() {
    return this.messageHandler.sendWithPromise("GetDestinations", null);
  }

  getDestination(id) {
    if (typeof id !== "string") {
      return Promise.reject(new Error("Invalid destination request."));
    }

    return this.messageHandler.sendWithPromise("GetDestination", {
      id
    });
  }

  getPageLabels() {
    return this.messageHandler.sendWithPromise("GetPageLabels", null);
  }

  getPageLayout() {
    return this.messageHandler.sendWithPromise("GetPageLayout", null);
  }

  getPageMode() {
    return this.messageHandler.sendWithPromise("GetPageMode", null);
  }

  getViewerPreferences() {
    return this.messageHandler.sendWithPromise("GetViewerPreferences", null);
  }

  getOpenAction() {
    return this.messageHandler.sendWithPromise("GetOpenAction", null);
  }

  getAttachments() {
    return this.messageHandler.sendWithPromise("GetAttachments", null);
  }

  getJavaScript() {
    return this.messageHandler.sendWithPromise("GetJavaScript", null);
  }

  getOutline() {
    return this.messageHandler.sendWithPromise("GetOutline", null);
  }

  getPermissions() {
    return this.messageHandler.sendWithPromise("GetPermissions", null);
  }

  getMetadata() {
    return this.messageHandler.sendWithPromise("GetMetadata", null).then(results => {
      return {
        info: results[0],
        metadata: results[1] ? new _metadata.Metadata(results[1]) : null,
        contentDispositionFilename: this._fullReader ? this._fullReader.filename : null
      };
    });
  }

  getStats() {
    return this.messageHandler.sendWithPromise("GetStats", null);
  }

  startCleanup() {
    return this.messageHandler.sendWithPromise("Cleanup", null).then(() => {
      for (let i = 0, ii = this.pageCache.length; i < ii; i++) {
        const page = this.pageCache[i];

        if (page) {
          const cleanupSuccessful = page.cleanup();

          if (!cleanupSuccessful) {
            throw new Error(`startCleanup: Page ${i + 1} is currently rendering.`);
          }
        }
      }

      this.commonObjs.clear();
      this.fontLoader.clear();
    });
  }

  get loadingParams() {
    const params = this._params;
    return (0, _util.shadow)(this, "loadingParams", {
      disableAutoFetch: params.disableAutoFetch,
      disableCreateObjectURL: params.disableCreateObjectURL,
      disableFontFace: params.disableFontFace,
      nativeImageDecoderSupport: params.nativeImageDecoderSupport
    });
  }

}

class PDFObjects {
  constructor() {
    this._objs = Object.create(null);
  }

  _ensureObj(objId) {
    if (this._objs[objId]) {
      return this._objs[objId];
    }

    return this._objs[objId] = {
      capability: (0, _util.createPromiseCapability)(),
      data: null,
      resolved: false
    };
  }

  get(objId, callback = null) {
    if (callback) {
      this._ensureObj(objId).capability.promise.then(callback);

      return null;
    }

    const obj = this._objs[objId];

    if (!obj || !obj.resolved) {
      throw new Error(`Requesting object that isn't resolved yet ${objId}.`);
    }

    return obj.data;
  }

  has(objId) {
    const obj = this._objs[objId];
    return obj ? obj.resolved : false;
  }

  resolve(objId, data) {
    const obj = this._ensureObj(objId);

    obj.resolved = true;
    obj.data = data;
    obj.capability.resolve(data);
  }

  clear() {
    for (const objId in this._objs) {
      const {
        data
      } = this._objs[objId];

      if (typeof Image !== "undefined" && data instanceof Image) {
        (0, _display_utils.releaseImageResources)(data);
      }
    }

    this._objs = Object.create(null);
  }

}

class RenderTask {
  constructor(internalRenderTask) {
    this._internalRenderTask = internalRenderTask;
    this.onContinue = null;
  }

  get promise() {
    return this._internalRenderTask.capability.promise;
  }

  cancel() {
    this._internalRenderTask.cancel();
  }

  then(onFulfilled, onRejected) {
    throw new Error("Removed API method: " + "RenderTask.then, use the `promise` getter instead.");
  }

}

const InternalRenderTask = function InternalRenderTaskClosure() {
  const canvasInRendering = new WeakSet();

  class InternalRenderTask {
    constructor({
      callback,
      params,
      objs,
      commonObjs,
      operatorList,
      pageIndex,
      canvasFactory,
      webGLContext,
      useRequestAnimationFrame = false,
      pdfBug = false
    }) {
      this.callback = callback;
      this.params = params;
      this.objs = objs;
      this.commonObjs = commonObjs;
      this.operatorListIdx = null;
      this.operatorList = operatorList;
      this._pageIndex = pageIndex;
      this.canvasFactory = canvasFactory;
      this.webGLContext = webGLContext;
      this._pdfBug = pdfBug;
      this.running = false;
      this.graphicsReadyCallback = null;
      this.graphicsReady = false;
      this._useRequestAnimationFrame = useRequestAnimationFrame === true && typeof window !== "undefined";
      this.cancelled = false;
      this.capability = (0, _util.createPromiseCapability)();
      this.task = new RenderTask(this);
      this._continueBound = this._continue.bind(this);
      this._scheduleNextBound = this._scheduleNext.bind(this);
      this._nextBound = this._next.bind(this);
      this._canvas = params.canvasContext.canvas;
    }

    initializeGraphics(transparency = false) {
      if (this.cancelled) {
        return;
      }

      if (this._canvas) {
        if (canvasInRendering.has(this._canvas)) {
          throw new Error("Cannot use the same canvas during multiple render() operations. " + "Use different canvas or ensure previous operations were " + "cancelled or completed.");
        }

        canvasInRendering.add(this._canvas);
      }

      if (this._pdfBug && globalThis.StepperManager && globalThis.StepperManager.enabled) {
        this.stepper = globalThis.StepperManager.create(this._pageIndex);
        this.stepper.init(this.operatorList);
        this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
      }

      const {
        canvasContext,
        viewport,
        transform,
        imageLayer,
        background
      } = this.params;
      this.gfx = new _canvas.CanvasGraphics(canvasContext, this.commonObjs, this.objs, this.canvasFactory, this.webGLContext, imageLayer);
      this.gfx.beginDrawing({
        transform,
        viewport,
        transparency,
        background
      });
      this.operatorListIdx = 0;
      this.graphicsReady = true;

      if (this.graphicsReadyCallback) {
        this.graphicsReadyCallback();
      }
    }

    cancel(error = null) {
      this.running = false;
      this.cancelled = true;

      if (this.gfx) {
        this.gfx.endDrawing();
      }

      if (this._canvas) {
        canvasInRendering.delete(this._canvas);
      }

      this.callback(error || new _display_utils.RenderingCancelledException(`Rendering cancelled, page ${this._pageIndex + 1}`, "canvas"));
    }

    operatorListChanged() {
      if (!this.graphicsReady) {
        if (!this.graphicsReadyCallback) {
          this.graphicsReadyCallback = this._continueBound;
        }

        return;
      }

      if (this.stepper) {
        this.stepper.updateOperatorList(this.operatorList);
      }

      if (this.running) {
        return;
      }

      this._continue();
    }

    _continue() {
      this.running = true;

      if (this.cancelled) {
        return;
      }

      if (this.task.onContinue) {
        this.task.onContinue(this._scheduleNextBound);
      } else {
        this._scheduleNext();
      }
    }

    _scheduleNext() {
      if (this._useRequestAnimationFrame) {
        window.requestAnimationFrame(() => {
          this._nextBound().catch(this.cancel.bind(this));
        });
      } else {
        Promise.resolve().then(this._nextBound).catch(this.cancel.bind(this));
      }
    }

    async _next() {
      if (this.cancelled) {
        return;
      }

      this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList, this.operatorListIdx, this._continueBound, this.stepper);

      if (this.operatorListIdx === this.operatorList.argsArray.length) {
        this.running = false;

        if (this.operatorList.lastChunk) {
          this.gfx.endDrawing();

          if (this._canvas) {
            canvasInRendering.delete(this._canvas);
          }

          this.callback();
        }
      }
    }

  }

  return InternalRenderTask;
}();

const version = '2.5.32';
exports.version = version;
const build = 'b1e3b21b';
exports.build = build;

/***/ }),
/* 4 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addLinkAttributes = addLinkAttributes;
exports.getFilenameFromUrl = getFilenameFromUrl;
exports.isFetchSupported = isFetchSupported;
exports.isValidFetchUrl = isValidFetchUrl;
exports.loadScript = loadScript;
exports.deprecated = deprecated;
exports.releaseImageResources = releaseImageResources;
exports.PDFDateString = exports.StatTimer = exports.DOMSVGFactory = exports.DOMCMapReaderFactory = exports.DOMCanvasFactory = exports.DEFAULT_LINK_REL = exports.LinkTarget = exports.RenderingCancelledException = exports.PageViewport = void 0;

var _util = __w_pdfjs_require__(1);

const DEFAULT_LINK_REL = "noopener noreferrer nofollow";
exports.DEFAULT_LINK_REL = DEFAULT_LINK_REL;
const SVG_NS = "http://www.w3.org/2000/svg";

class DOMCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    return {
      canvas,
      context
    };
  }

  reset(canvasAndContext, width, height) {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }

    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }

    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }

}

exports.DOMCanvasFactory = DOMCanvasFactory;

class DOMCMapReaderFactory {
  constructor({
    baseUrl = null,
    isCompressed = false
  }) {
    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  async fetch({
    name
  }) {
    if (!this.baseUrl) {
      throw new Error('The CMap "baseUrl" parameter must be specified, ensure that ' + 'the "cMapUrl" and "cMapPacked" API parameters are provided.');
    }

    if (!name) {
      throw new Error("CMap name must be specified.");
    }

    const url = this.baseUrl + name + (this.isCompressed ? ".bcmap" : "");
    const compressionType = this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE;

    if (isFetchSupported() && isValidFetchUrl(url, document.baseURI)) {
      return fetch(url).then(async response => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        let cMapData;

        if (this.isCompressed) {
          cMapData = new Uint8Array((await response.arrayBuffer()));
        } else {
          cMapData = (0, _util.stringToBytes)((await response.text()));
        }

        return {
          cMapData,
          compressionType
        };
      }).catch(reason => {
        throw new Error(`Unable to load ${this.isCompressed ? "binary " : ""}` + `CMap at: ${url}`);
      });
    }

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("GET", url, true);

      if (this.isCompressed) {
        request.responseType = "arraybuffer";
      }

      request.onreadystatechange = () => {
        if (request.readyState !== XMLHttpRequest.DONE) {
          return;
        }

        if (request.status === 200 || request.status === 0) {
          let cMapData;

          if (this.isCompressed && request.response) {
            cMapData = new Uint8Array(request.response);
          } else if (!this.isCompressed && request.responseText) {
            cMapData = (0, _util.stringToBytes)(request.responseText);
          }

          if (cMapData) {
            resolve({
              cMapData,
              compressionType
            });
            return;
          }
        }

        reject(new Error(request.statusText));
      };

      request.send(null);
    }).catch(reason => {
      throw new Error(`Unable to load ${this.isCompressed ? "binary " : ""}` + `CMap at: ${url}`);
    });
  }

}

exports.DOMCMapReaderFactory = DOMCMapReaderFactory;

class DOMSVGFactory {
  create(width, height) {
    (0, _util.assert)(width > 0 && height > 0, "Invalid SVG dimensions");
    const svg = document.createElementNS(SVG_NS, "svg:svg");
    svg.setAttribute("version", "1.1");
    svg.setAttribute("width", width + "px");
    svg.setAttribute("height", height + "px");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    return svg;
  }

  createElement(type) {
    (0, _util.assert)(typeof type === "string", "Invalid SVG element type");
    return document.createElementNS(SVG_NS, type);
  }

}

exports.DOMSVGFactory = DOMSVGFactory;

class PageViewport {
  constructor({
    viewBox,
    scale,
    rotation,
    offsetX = 0,
    offsetY = 0,
    dontFlip = false
  }) {
    this.viewBox = viewBox;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;
    let rotateA, rotateB, rotateC, rotateD;
    rotation = rotation % 360;
    rotation = rotation < 0 ? rotation + 360 : rotation;

    switch (rotation) {
      case 180:
        rotateA = -1;
        rotateB = 0;
        rotateC = 0;
        rotateD = 1;
        break;

      case 90:
        rotateA = 0;
        rotateB = 1;
        rotateC = 1;
        rotateD = 0;
        break;

      case 270:
        rotateA = 0;
        rotateB = -1;
        rotateC = -1;
        rotateD = 0;
        break;

      default:
        rotateA = 1;
        rotateB = 0;
        rotateC = 0;
        rotateD = -1;
        break;
    }

    if (dontFlip) {
      rotateC = -rotateC;
      rotateD = -rotateD;
    }

    let offsetCanvasX, offsetCanvasY;
    let width, height;

    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = Math.abs(viewBox[3] - viewBox[1]) * scale;
      height = Math.abs(viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = Math.abs(viewBox[2] - viewBox[0]) * scale;
      height = Math.abs(viewBox[3] - viewBox[1]) * scale;
    }

    this.transform = [rotateA * scale, rotateB * scale, rotateC * scale, rotateD * scale, offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY, offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY];
    this.width = width;
    this.height = height;
  }

  clone({
    scale = this.scale,
    rotation = this.rotation,
    offsetX = this.offsetX,
    offsetY = this.offsetY,
    dontFlip = false
  } = {}) {
    return new PageViewport({
      viewBox: this.viewBox.slice(),
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip
    });
  }

  convertToViewportPoint(x, y) {
    return _util.Util.applyTransform([x, y], this.transform);
  }

  convertToViewportRectangle(rect) {
    const topLeft = _util.Util.applyTransform([rect[0], rect[1]], this.transform);

    const bottomRight = _util.Util.applyTransform([rect[2], rect[3]], this.transform);

    return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
  }

  convertToPdfPoint(x, y) {
    return _util.Util.applyInverseTransform([x, y], this.transform);
  }

}

exports.PageViewport = PageViewport;

class RenderingCancelledException extends _util.BaseException {
  constructor(msg, type) {
    super(msg);
    this.type = type;
  }

}

exports.RenderingCancelledException = RenderingCancelledException;
const LinkTarget = {
  NONE: 0,
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4
};
exports.LinkTarget = LinkTarget;

function addLinkAttributes(link, {
  url,
  target,
  rel,
  enabled = true
} = {}) {
  (0, _util.assert)(url && typeof url === "string", 'addLinkAttributes: A valid "url" parameter must provided.');
  const urlNullRemoved = (0, _util.removeNullCharacters)(url);

  if (enabled) {
    link.href = link.title = urlNullRemoved;
  } else {
    link.href = "";
    link.title = `Disabled: ${urlNullRemoved}`;

    link.onclick = () => {
      return false;
    };
  }

  let targetStr = "";

  switch (target) {
    case LinkTarget.NONE:
      break;

    case LinkTarget.SELF:
      targetStr = "_self";
      break;

    case LinkTarget.BLANK:
      targetStr = "_blank";
      break;

    case LinkTarget.PARENT:
      targetStr = "_parent";
      break;

    case LinkTarget.TOP:
      targetStr = "_top";
      break;
  }

  link.target = targetStr;
  link.rel = typeof rel === "string" ? rel : DEFAULT_LINK_REL;
}

function getFilenameFromUrl(url) {
  const anchor = url.indexOf("#");
  const query = url.indexOf("?");
  const end = Math.min(anchor > 0 ? anchor : url.length, query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf("/", end) + 1, end);
}

class StatTimer {
  constructor() {
    this.started = Object.create(null);
    this.times = [];
  }

  time(name) {
    if (name in this.started) {
      (0, _util.warn)(`Timer is already running for ${name}`);
    }

    this.started[name] = Date.now();
  }

  timeEnd(name) {
    if (!(name in this.started)) {
      (0, _util.warn)(`Timer has not been started for ${name}`);
    }

    this.times.push({
      name,
      start: this.started[name],
      end: Date.now()
    });
    delete this.started[name];
  }

  toString() {
    const outBuf = [];
    let longest = 0;

    for (const time of this.times) {
      const name = time.name;

      if (name.length > longest) {
        longest = name.length;
      }
    }

    for (const time of this.times) {
      const duration = time.end - time.start;
      outBuf.push(`${time.name.padEnd(longest)} ${duration}ms\n`);
    }

    return outBuf.join("");
  }

}

exports.StatTimer = StatTimer;

function isFetchSupported() {
  return typeof fetch !== "undefined" && typeof Response !== "undefined" && "body" in Response.prototype && typeof ReadableStream !== "undefined";
}

function isValidFetchUrl(url, baseUrl) {
  try {
    const {
      protocol
    } = baseUrl ? new URL(url, baseUrl) : new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch (ex) {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;

    script.onerror = function () {
      reject(new Error(`Cannot load script at: ${script.src}`));
    };

    (document.head || document.documentElement).appendChild(script);
  });
}

function deprecated(details) {
  console.log("Deprecated API usage: " + details);
}

function releaseImageResources(img) {
  (0, _util.assert)(img instanceof Image, "Invalid `img` parameter.");
  const url = img.src;

  if (typeof url === "string" && url.startsWith("blob:") && URL.revokeObjectURL) {
    URL.revokeObjectURL(url);
  }

  img.removeAttribute("src");
}

let pdfDateStringRegex;

class PDFDateString {
  static toDateObject(input) {
    if (!input || !(0, _util.isString)(input)) {
      return null;
    }

    if (!pdfDateStringRegex) {
      pdfDateStringRegex = new RegExp("^D:" + "(\\d{4})" + "(\\d{2})?" + "(\\d{2})?" + "(\\d{2})?" + "(\\d{2})?" + "(\\d{2})?" + "([Z|+|-])?" + "(\\d{2})?" + "'?" + "(\\d{2})?" + "'?");
    }

    const matches = pdfDateStringRegex.exec(input);

    if (!matches) {
      return null;
    }

    const year = parseInt(matches[1], 10);
    let month = parseInt(matches[2], 10);
    month = month >= 1 && month <= 12 ? month - 1 : 0;
    let day = parseInt(matches[3], 10);
    day = day >= 1 && day <= 31 ? day : 1;
    let hour = parseInt(matches[4], 10);
    hour = hour >= 0 && hour <= 23 ? hour : 0;
    let minute = parseInt(matches[5], 10);
    minute = minute >= 0 && minute <= 59 ? minute : 0;
    let second = parseInt(matches[6], 10);
    second = second >= 0 && second <= 59 ? second : 0;
    const universalTimeRelation = matches[7] || "Z";
    let offsetHour = parseInt(matches[8], 10);
    offsetHour = offsetHour >= 0 && offsetHour <= 23 ? offsetHour : 0;
    let offsetMinute = parseInt(matches[9], 10) || 0;
    offsetMinute = offsetMinute >= 0 && offsetMinute <= 59 ? offsetMinute : 0;

    if (universalTimeRelation === "-") {
      hour += offsetHour;
      minute += offsetMinute;
    } else if (universalTimeRelation === "+") {
      hour -= offsetHour;
      minute -= offsetMinute;
    }

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

}

exports.PDFDateString = PDFDateString;

/***/ }),
/* 5 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FontLoader = exports.FontFaceObject = void 0;

var _util = __w_pdfjs_require__(1);

class BaseFontLoader {
  constructor({
    docId,
    onUnsupportedFeature
  }) {
    if (this.constructor === BaseFontLoader) {
      (0, _util.unreachable)("Cannot initialize BaseFontLoader.");
    }

    this.docId = docId;
    this._onUnsupportedFeature = onUnsupportedFeature;
    this.nativeFontFaces = [];
    this.styleElement = null;
  }

  addNativeFontFace(nativeFontFace) {
    this.nativeFontFaces.push(nativeFontFace);
    document.fonts.add(nativeFontFace);
  }

  insertRule(rule) {
    let styleElement = this.styleElement;

    if (!styleElement) {
      styleElement = this.styleElement = document.createElement("style");
      styleElement.id = `PDFJS_FONT_STYLE_TAG_${this.docId}`;
      document.documentElement.getElementsByTagName("head")[0].appendChild(styleElement);
    }

    const styleSheet = styleElement.sheet;
    styleSheet.insertRule(rule, styleSheet.cssRules.length);
  }

  clear() {
    this.nativeFontFaces.forEach(function (nativeFontFace) {
      document.fonts.delete(nativeFontFace);
    });
    this.nativeFontFaces.length = 0;

    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  async bind(font) {
    if (font.attached || font.missingFile) {
      return;
    }

    font.attached = true;

    if (this.isFontLoadingAPISupported) {
      const nativeFontFace = font.createNativeFontFace();

      if (nativeFontFace) {
        this.addNativeFontFace(nativeFontFace);

        try {
          await nativeFontFace.loaded;
        } catch (ex) {
          this._onUnsupportedFeature({
            featureId: _util.UNSUPPORTED_FEATURES.font
          });

          (0, _util.warn)(`Failed to load font '${nativeFontFace.family}': '${ex}'.`);
          font.disableFontFace = true;
          throw ex;
        }
      }

      return;
    }

    const rule = font.createFontFaceRule();

    if (rule) {
      this.insertRule(rule);

      if (this.isSyncFontLoadingSupported) {
        return;
      }

      await new Promise(resolve => {
        const request = this._queueLoadingCallback(resolve);

        this._prepareFontLoadEvent([rule], [font], request);
      });
    }
  }

  _queueLoadingCallback(callback) {
    (0, _util.unreachable)("Abstract method `_queueLoadingCallback`.");
  }

  get isFontLoadingAPISupported() {
    const supported = typeof document !== "undefined" && !!document.fonts;
    return (0, _util.shadow)(this, "isFontLoadingAPISupported", supported);
  }

  get isSyncFontLoadingSupported() {
    (0, _util.unreachable)("Abstract method `isSyncFontLoadingSupported`.");
  }

  get _loadTestFont() {
    (0, _util.unreachable)("Abstract method `_loadTestFont`.");
  }

  _prepareFontLoadEvent(rules, fontsToLoad, request) {
    (0, _util.unreachable)("Abstract method `_prepareFontLoadEvent`.");
  }

}

let FontLoader;
exports.FontLoader = FontLoader;
{
  exports.FontLoader = FontLoader = class GenericFontLoader extends BaseFontLoader {
    constructor(docId) {
      super(docId);
      this.loadingContext = {
        requests: [],
        nextRequestId: 0
      };
      this.loadTestFontId = 0;
    }

    get isSyncFontLoadingSupported() {
      let supported = false;

      if (typeof navigator === "undefined") {
        supported = true;
      } else {
        const m = /Mozilla\/5.0.*?rv:(\d+).*? Gecko/.exec(navigator.userAgent);

        if (m && m[1] >= 14) {
          supported = true;
        }
      }

      return (0, _util.shadow)(this, "isSyncFontLoadingSupported", supported);
    }

    _queueLoadingCallback(callback) {
      function completeRequest() {
        (0, _util.assert)(!request.done, "completeRequest() cannot be called twice.");
        request.done = true;

        while (context.requests.length > 0 && context.requests[0].done) {
          const otherRequest = context.requests.shift();
          setTimeout(otherRequest.callback, 0);
        }
      }

      const context = this.loadingContext;
      const request = {
        id: `pdfjs-font-loading-${context.nextRequestId++}`,
        done: false,
        complete: completeRequest,
        callback
      };
      context.requests.push(request);
      return request;
    }

    get _loadTestFont() {
      const getLoadTestFont = function () {
        return atob("T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQA" + "FQAABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAA" + "ALwAAAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgA" + "AAAGbmFtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1" + "AAsD6AAAAADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD" + "6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACM" + "AooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4D" + "IP84AFoDIQAAAAAAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAA" + "AAEAAQAAAAEAAAAAAAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUA" + "AQAAAAEAAAAAAAYAAQAAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgAB" + "AAMAAQQJAAMAAgABAAMAAQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABY" + "AAAAAAAAAwAAAAMAAAAcAAEAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAA" + "AC7////TAAEAAAAAAAABBgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "AAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAA" + "AAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgcA/gXBIwMAYuL+nz5tQXkD5j3CBLnEQAC" + "AQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYAAABAQAADwACAQEEE/t3" + "Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQAAAAAAAABAAAAAMmJbzEAAAAAzgTj" + "FQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAgABAAAAAAAAAAAD6AAAAAAAAA==");
      };

      return (0, _util.shadow)(this, "_loadTestFont", getLoadTestFont());
    }

    _prepareFontLoadEvent(rules, fonts, request) {
      function int32(data, offset) {
        return data.charCodeAt(offset) << 24 | data.charCodeAt(offset + 1) << 16 | data.charCodeAt(offset + 2) << 8 | data.charCodeAt(offset + 3) & 0xff;
      }

      function spliceString(s, offset, remove, insert) {
        const chunk1 = s.substring(0, offset);
        const chunk2 = s.substring(offset + remove);
        return chunk1 + insert + chunk2;
      }

      let i, ii;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      let called = 0;

      function isFontReady(name, callback) {
        called++;

        if (called > 30) {
          (0, _util.warn)("Load test font never loaded.");
          callback();
          return;
        }

        ctx.font = "30px " + name;
        ctx.fillText(".", 0, 20);
        const imageData = ctx.getImageData(0, 0, 1, 1);

        if (imageData.data[3] > 0) {
          callback();
          return;
        }

        setTimeout(isFontReady.bind(null, name, callback));
      }

      const loadTestFontId = `lt${Date.now()}${this.loadTestFontId++}`;
      let data = this._loadTestFont;
      const COMMENT_OFFSET = 976;
      data = spliceString(data, COMMENT_OFFSET, loadTestFontId.length, loadTestFontId);
      const CFF_CHECKSUM_OFFSET = 16;
      const XXXX_VALUE = 0x58585858;
      let checksum = int32(data, CFF_CHECKSUM_OFFSET);

      for (i = 0, ii = loadTestFontId.length - 3; i < ii; i += 4) {
        checksum = checksum - XXXX_VALUE + int32(loadTestFontId, i) | 0;
      }

      if (i < loadTestFontId.length) {
        checksum = checksum - XXXX_VALUE + int32(loadTestFontId + "XXX", i) | 0;
      }

      data = spliceString(data, CFF_CHECKSUM_OFFSET, 4, (0, _util.string32)(checksum));
      const url = `url(data:font/opentype;base64,${btoa(data)});`;
      const rule = `@font-face {font-family:"${loadTestFontId}";src:${url}}`;
      this.insertRule(rule);
      const names = [];

      for (i = 0, ii = fonts.length; i < ii; i++) {
        names.push(fonts[i].loadedName);
      }

      names.push(loadTestFontId);
      const div = document.createElement("div");
      div.style.visibility = "hidden";
      div.style.width = div.style.height = "10px";
      div.style.position = "absolute";
      div.style.top = div.style.left = "0px";

      for (i = 0, ii = names.length; i < ii; ++i) {
        const span = document.createElement("span");
        span.textContent = "Hi";
        span.style.fontFamily = names[i];
        div.appendChild(span);
      }

      document.body.appendChild(div);
      isFontReady(loadTestFontId, function () {
        document.body.removeChild(div);
        request.complete();
      });
    }

  };
}

class FontFaceObject {
  constructor(translatedData, {
    isEvalSupported = true,
    disableFontFace = false,
    ignoreErrors = false,
    onUnsupportedFeature = null,
    fontRegistry = null
  }) {
    this.compiledGlyphs = Object.create(null);

    for (const i in translatedData) {
      this[i] = translatedData[i];
    }

    this.isEvalSupported = isEvalSupported !== false;
    this.disableFontFace = disableFontFace === true;
    this.ignoreErrors = ignoreErrors === true;
    this._onUnsupportedFeature = onUnsupportedFeature;
    this.fontRegistry = fontRegistry;
  }

  createNativeFontFace() {
    if (!this.data || this.disableFontFace) {
      return null;
    }

    const nativeFontFace = new FontFace(this.loadedName, this.data, {});

    if (this.fontRegistry) {
      this.fontRegistry.registerFont(this);
    }

    return nativeFontFace;
  }

  createFontFaceRule() {
    if (!this.data || this.disableFontFace) {
      return null;
    }

    const data = (0, _util.bytesToString)(new Uint8Array(this.data));
    const url = `url(data:${this.mimetype};base64,${btoa(data)});`;
    const rule = `@font-face {font-family:"${this.loadedName}";src:${url}}`;

    if (this.fontRegistry) {
      this.fontRegistry.registerFont(this, url);
    }

    return rule;
  }

  getPathGenerator(objs, character) {
    if (this.compiledGlyphs[character] !== undefined) {
      return this.compiledGlyphs[character];
    }

    let cmds, current;

    try {
      cmds = objs.get(this.loadedName + "_path_" + character);
    } catch (ex) {
      if (!this.ignoreErrors) {
        throw ex;
      }

      if (this._onUnsupportedFeature) {
        this._onUnsupportedFeature({
          featureId: _util.UNSUPPORTED_FEATURES.font
        });
      }

      (0, _util.warn)(`getPathGenerator - ignoring character: "${ex}".`);
      return this.compiledGlyphs[character] = function (c, size) {};
    }

    if (this.isEvalSupported && _util.IsEvalSupportedCached.value) {
      let args,
          js = "";

      for (let i = 0, ii = cmds.length; i < ii; i++) {
        current = cmds[i];

        if (current.args !== undefined) {
          args = current.args.join(",");
        } else {
          args = "";
        }

        js += "c." + current.cmd + "(" + args + ");\n";
      }

      return this.compiledGlyphs[character] = new Function("c", "size", js);
    }

    return this.compiledGlyphs[character] = function (c, size) {
      for (let i = 0, ii = cmds.length; i < ii; i++) {
        current = cmds[i];

        if (current.cmd === "scale") {
          current.args = [size, -size];
        }

        c[current.cmd].apply(c, current.args);
      }
    };
  }

}

exports.FontFaceObject = FontFaceObject;

/***/ }),
/* 6 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


const compatibilityParams = Object.create(null);
{
  const {
    isNodeJS
  } = __w_pdfjs_require__(7);

  const userAgent = typeof navigator !== "undefined" && navigator.userAgent || "";
  const isIE = /Trident/.test(userAgent);
  const isIOSChrome = /CriOS/.test(userAgent);

  (function checkOnBlobSupport() {
    if (isIE || isIOSChrome) {
      compatibilityParams.disableCreateObjectURL = true;
    }
  })();

  (function checkFontFaceAndImage() {
    if (isNodeJS) {
      compatibilityParams.disableFontFace = true;
      compatibilityParams.nativeImageDecoderSupport = "none";
    }
  })();
}
exports.apiCompatibilityParams = Object.freeze(compatibilityParams);

/***/ }),
/* 7 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isNodeJS = void 0;
const isNodeJS = typeof process === "object" && process + "" === "[object process]" && !process.versions["nw"] && !process.versions["electron"];
exports.isNodeJS = isNodeJS;

/***/ }),
/* 8 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CanvasGraphics = void 0;

var _util = __w_pdfjs_require__(1);

var _pattern_helper = __w_pdfjs_require__(9);

var MIN_FONT_SIZE = 16;
var MAX_FONT_SIZE = 100;
var MAX_GROUP_SIZE = 4096;
var MIN_WIDTH_FACTOR = 0.65;
var COMPILE_TYPE3_GLYPHS = true;
var MAX_SIZE_TO_COMPILE = 1000;
var FULL_CHUNK_HEIGHT = 16;

function addContextCurrentTransform(ctx) {
  if (!ctx.mozCurrentTransform) {
    ctx._originalSave = ctx.save;
    ctx._originalRestore = ctx.restore;
    ctx._originalRotate = ctx.rotate;
    ctx._originalScale = ctx.scale;
    ctx._originalTranslate = ctx.translate;
    ctx._originalTransform = ctx.transform;
    ctx._originalSetTransform = ctx.setTransform;
    ctx._transformMatrix = ctx._transformMatrix || [1, 0, 0, 1, 0, 0];
    ctx._transformStack = [];
    Object.defineProperty(ctx, "mozCurrentTransform", {
      get: function getCurrentTransform() {
        return this._transformMatrix;
      }
    });
    Object.defineProperty(ctx, "mozCurrentTransformInverse", {
      get: function getCurrentTransformInverse() {
        var m = this._transformMatrix;
        var a = m[0],
            b = m[1],
            c = m[2],
            d = m[3],
            e = m[4],
            f = m[5];
        var ad_bc = a * d - b * c;
        var bc_ad = b * c - a * d;
        return [d / ad_bc, b / bc_ad, c / bc_ad, a / ad_bc, (d * e - c * f) / bc_ad, (b * e - a * f) / ad_bc];
      }
    });

    ctx.save = function ctxSave() {
      var old = this._transformMatrix;

      this._transformStack.push(old);

      this._transformMatrix = old.slice(0, 6);

      this._originalSave();
    };

    ctx.restore = function ctxRestore() {
      var prev = this._transformStack.pop();

      if (prev) {
        this._transformMatrix = prev;

        this._originalRestore();
      }
    };

    ctx.translate = function ctxTranslate(x, y) {
      var m = this._transformMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];

      this._originalTranslate(x, y);
    };

    ctx.scale = function ctxScale(x, y) {
      var m = this._transformMatrix;
      m[0] = m[0] * x;
      m[1] = m[1] * x;
      m[2] = m[2] * y;
      m[3] = m[3] * y;

      this._originalScale(x, y);
    };

    ctx.transform = function ctxTransform(a, b, c, d, e, f) {
      var m = this._transformMatrix;
      this._transformMatrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];

      ctx._originalTransform(a, b, c, d, e, f);
    };

    ctx.setTransform = function ctxSetTransform(a, b, c, d, e, f) {
      this._transformMatrix = [a, b, c, d, e, f];

      ctx._originalSetTransform(a, b, c, d, e, f);
    };

    ctx.rotate = function ctxRotate(angle) {
      var cosValue = Math.cos(angle);
      var sinValue = Math.sin(angle);
      var m = this._transformMatrix;
      this._transformMatrix = [m[0] * cosValue + m[2] * sinValue, m[1] * cosValue + m[3] * sinValue, m[0] * -sinValue + m[2] * cosValue, m[1] * -sinValue + m[3] * cosValue, m[4], m[5]];

      this._originalRotate(angle);
    };
  }
}

var CachedCanvases = function CachedCanvasesClosure() {
  function CachedCanvases(canvasFactory) {
    this.canvasFactory = canvasFactory;
    this.cache = Object.create(null);
  }

  CachedCanvases.prototype = {
    getCanvas: function CachedCanvases_getCanvas(id, width, height, trackTransform) {
      var canvasEntry;

      if (this.cache[id] !== undefined) {
        canvasEntry = this.cache[id];
        this.canvasFactory.reset(canvasEntry, width, height);
        canvasEntry.context.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        canvasEntry = this.canvasFactory.create(width, height);
        this.cache[id] = canvasEntry;
      }

      if (trackTransform) {
        addContextCurrentTransform(canvasEntry.context);
      }

      return canvasEntry;
    },

    clear() {
      for (var id in this.cache) {
        var canvasEntry = this.cache[id];
        this.canvasFactory.destroy(canvasEntry);
        delete this.cache[id];
      }
    }

  };
  return CachedCanvases;
}();

function compileType3Glyph(imgData) {
  var POINT_TO_PROCESS_LIMIT = 1000;
  var width = imgData.width,
      height = imgData.height;
  var i,
      j,
      j0,
      width1 = width + 1;
  var points = new Uint8Array(width1 * (height + 1));
  var POINT_TYPES = new Uint8Array([0, 2, 4, 0, 1, 0, 5, 4, 8, 10, 0, 8, 0, 2, 1, 0]);
  var lineSize = width + 7 & ~7,
      data0 = imgData.data;
  var data = new Uint8Array(lineSize * height),
      pos = 0,
      ii;

  for (i = 0, ii = data0.length; i < ii; i++) {
    var mask = 128,
        elem = data0[i];

    while (mask > 0) {
      data[pos++] = elem & mask ? 0 : 255;
      mask >>= 1;
    }
  }

  var count = 0;
  pos = 0;

  if (data[pos] !== 0) {
    points[0] = 1;
    ++count;
  }

  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 1]) {
      points[j] = data[pos] ? 2 : 1;
      ++count;
    }

    pos++;
  }

  if (data[pos] !== 0) {
    points[j] = 2;
    ++count;
  }

  for (i = 1; i < height; i++) {
    pos = i * lineSize;
    j0 = i * width1;

    if (data[pos - lineSize] !== data[pos]) {
      points[j0] = data[pos] ? 1 : 8;
      ++count;
    }

    var sum = (data[pos] ? 4 : 0) + (data[pos - lineSize] ? 8 : 0);

    for (j = 1; j < width; j++) {
      sum = (sum >> 2) + (data[pos + 1] ? 4 : 0) + (data[pos - lineSize + 1] ? 8 : 0);

      if (POINT_TYPES[sum]) {
        points[j0 + j] = POINT_TYPES[sum];
        ++count;
      }

      pos++;
    }

    if (data[pos - lineSize] !== data[pos]) {
      points[j0 + j] = data[pos] ? 2 : 4;
      ++count;
    }

    if (count > POINT_TO_PROCESS_LIMIT) {
      return null;
    }
  }

  pos = lineSize * (height - 1);
  j0 = i * width1;

  if (data[pos] !== 0) {
    points[j0] = 8;
    ++count;
  }

  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 1]) {
      points[j0 + j] = data[pos] ? 4 : 8;
      ++count;
    }

    pos++;
  }

  if (data[pos] !== 0) {
    points[j0 + j] = 4;
    ++count;
  }

  if (count > POINT_TO_PROCESS_LIMIT) {
    return null;
  }

  var steps = new Int32Array([0, width1, -1, 0, -width1, 0, 0, 0, 1]);
  var outlines = [];

  for (i = 0; count && i <= height; i++) {
    var p = i * width1;
    var end = p + width;

    while (p < end && !points[p]) {
      p++;
    }

    if (p === end) {
      continue;
    }

    var coords = [p % width1, i];
    var type = points[p],
        p0 = p,
        pp;

    do {
      var step = steps[type];

      do {
        p += step;
      } while (!points[p]);

      pp = points[p];

      if (pp !== 5 && pp !== 10) {
        type = pp;
        points[p] = 0;
      } else {
        type = pp & 0x33 * type >> 4;
        points[p] &= type >> 2 | type << 2;
      }

      coords.push(p % width1);
      coords.push(p / width1 | 0);

      if (!points[p]) {
        --count;
      }
    } while (p0 !== p);

    outlines.push(coords);
    --i;
  }

  var drawOutline = function (c) {
    c.save();
    c.scale(1 / width, -1 / height);
    c.translate(0, -height);
    c.beginPath();

    for (let k = 0, kk = outlines.length; k < kk; k++) {
      var o = outlines[k];
      c.moveTo(o[0], o[1]);

      for (let l = 2, ll = o.length; l < ll; l += 2) {
        c.lineTo(o[l], o[l + 1]);
      }
    }

    c.fill();
    c.beginPath();
    c.restore();
  };

  return drawOutline;
}

var CanvasExtraState = function CanvasExtraStateClosure() {
  function CanvasExtraState() {
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.fontSizeScale = 1;
    this.textMatrix = _util.IDENTITY_MATRIX;
    this.textMatrixScale = 1;
    this.fontMatrix = _util.FONT_IDENTITY_MATRIX;
    this.leading = 0;
    this.x = 0;
    this.y = 0;
    this.lineX = 0;
    this.lineY = 0;
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.textHScale = 1;
    this.textRenderingMode = _util.TextRenderingMode.FILL;
    this.textRise = 0;
    this.fillColor = "#000000";
    this.strokeColor = "#000000";
    this.patternFill = false;
    this.fillAlpha = 1;
    this.strokeAlpha = 1;
    this.lineWidth = 1;
    this.activeSMask = null;
    this.resumeSMaskCtx = null;
  }

  CanvasExtraState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    },
    setCurrentPoint: function CanvasExtraState_setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }
  };
  return CanvasExtraState;
}();

var CanvasGraphics = function CanvasGraphicsClosure() {
  var EXECUTION_TIME = 15;
  var EXECUTION_STEPS = 10;

  function CanvasGraphics(canvasCtx, commonObjs, objs, canvasFactory, webGLContext, imageLayer) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState();
    this.stateStack = [];
    this.pendingClip = null;
    this.pendingEOFill = false;
    this.res = null;
    this.xobjs = null;
    this.commonObjs = commonObjs;
    this.objs = objs;
    this.canvasFactory = canvasFactory;
    this.webGLContext = webGLContext;
    this.imageLayer = imageLayer;
    this.groupStack = [];
    this.processingType3 = null;
    this.baseTransform = null;
    this.baseTransformStack = [];
    this.groupLevel = 0;
    this.smaskStack = [];
    this.smaskCounter = 0;
    this.tempSMask = null;
    this.cachedCanvases = new CachedCanvases(this.canvasFactory);

    if (canvasCtx) {
      addContextCurrentTransform(canvasCtx);
    }

    this._cachedGetSinglePixelWidth = null;
  }

  function putBinaryImageData(ctx, imgData) {
    if (typeof ImageData !== "undefined" && imgData instanceof ImageData) {
      ctx.putImageData(imgData, 0, 0);
      return;
    }

    var height = imgData.height,
        width = imgData.width;
    var partialChunkHeight = height % FULL_CHUNK_HEIGHT;
    var fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
    var totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;
    var chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
    var srcPos = 0,
        destPos;
    var src = imgData.data;
    var dest = chunkImgData.data;
    var i, j, thisChunkHeight, elemsInThisChunk;

    if (imgData.kind === _util.ImageKind.GRAYSCALE_1BPP) {
      var srcLength = src.byteLength;
      var dest32 = new Uint32Array(dest.buffer, 0, dest.byteLength >> 2);
      var dest32DataLength = dest32.length;
      var fullSrcDiff = width + 7 >> 3;
      var white = 0xffffffff;
      var black = _util.IsLittleEndianCached.value ? 0xff000000 : 0x000000ff;

      for (i = 0; i < totalChunks; i++) {
        thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
        destPos = 0;

        for (j = 0; j < thisChunkHeight; j++) {
          var srcDiff = srcLength - srcPos;
          var k = 0;
          var kEnd = srcDiff > fullSrcDiff ? width : srcDiff * 8 - 7;
          var kEndUnrolled = kEnd & ~7;
          var mask = 0;
          var srcByte = 0;

          for (; k < kEndUnrolled; k += 8) {
            srcByte = src[srcPos++];
            dest32[destPos++] = srcByte & 128 ? white : black;
            dest32[destPos++] = srcByte & 64 ? white : black;
            dest32[destPos++] = srcByte & 32 ? white : black;
            dest32[destPos++] = srcByte & 16 ? white : black;
            dest32[destPos++] = srcByte & 8 ? white : black;
            dest32[destPos++] = srcByte & 4 ? white : black;
            dest32[destPos++] = srcByte & 2 ? white : black;
            dest32[destPos++] = srcByte & 1 ? white : black;
          }

          for (; k < kEnd; k++) {
            if (mask === 0) {
              srcByte = src[srcPos++];
              mask = 128;
            }

            dest32[destPos++] = srcByte & mask ? white : black;
            mask >>= 1;
          }
        }

        while (destPos < dest32DataLength) {
          dest32[destPos++] = 0;
        }

        ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
      }
    } else if (imgData.kind === _util.ImageKind.RGBA_32BPP) {
      j = 0;
      elemsInThisChunk = width * FULL_CHUNK_HEIGHT * 4;

      for (i = 0; i < fullChunks; i++) {
        dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
        srcPos += elemsInThisChunk;
        ctx.putImageData(chunkImgData, 0, j);
        j += FULL_CHUNK_HEIGHT;
      }

      if (i < totalChunks) {
        elemsInThisChunk = width * partialChunkHeight * 4;
        dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
        ctx.putImageData(chunkImgData, 0, j);
      }
    } else if (imgData.kind === _util.ImageKind.RGB_24BPP) {
      thisChunkHeight = FULL_CHUNK_HEIGHT;
      elemsInThisChunk = width * thisChunkHeight;

      for (i = 0; i < totalChunks; i++) {
        if (i >= fullChunks) {
          thisChunkHeight = partialChunkHeight;
          elemsInThisChunk = width * thisChunkHeight;
        }

        destPos = 0;

        for (j = elemsInThisChunk; j--;) {
          dest[destPos++] = src[srcPos++];
          dest[destPos++] = src[srcPos++];
          dest[destPos++] = src[srcPos++];
          dest[destPos++] = 255;
        }

        ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
      }
    } else {
      throw new Error(`bad image kind: ${imgData.kind}`);
    }
  }

  function putBinaryImageMask(ctx, imgData) {
    var height = imgData.height,
        width = imgData.width;
    var partialChunkHeight = height % FULL_CHUNK_HEIGHT;
    var fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
    var totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;
    var chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
    var srcPos = 0;
    var src = imgData.data;
    var dest = chunkImgData.data;

    for (var i = 0; i < totalChunks; i++) {
      var thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
      var destPos = 3;

      for (var j = 0; j < thisChunkHeight; j++) {
        var mask = 0;

        for (var k = 0; k < width; k++) {
          if (!mask) {
            var elem = src[srcPos++];
            mask = 128;
          }

          dest[destPos] = elem & mask ? 0 : 255;
          destPos += 4;
          mask >>= 1;
        }
      }

      ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
    }
  }

  function copyCtxState(sourceCtx, destCtx) {
    var properties = ["strokeStyle", "fillStyle", "fillRule", "globalAlpha", "lineWidth", "lineCap", "lineJoin", "miterLimit", "globalCompositeOperation", "font"];

    for (var i = 0, ii = properties.length; i < ii; i++) {
      var property = properties[i];

      if (sourceCtx[property] !== undefined) {
        destCtx[property] = sourceCtx[property];
      }
    }

    if (sourceCtx.setLineDash !== undefined) {
      destCtx.setLineDash(sourceCtx.getLineDash());
      destCtx.lineDashOffset = sourceCtx.lineDashOffset;
    }
  }

  function resetCtxToDefault(ctx) {
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#000000";
    ctx.fillRule = "nonzero";
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 10;
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "10px sans-serif";

    if (ctx.setLineDash !== undefined) {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  function composeSMaskBackdrop(bytes, r0, g0, b0) {
    var length = bytes.length;

    for (var i = 3; i < length; i += 4) {
      var alpha = bytes[i];

      if (alpha === 0) {
        bytes[i - 3] = r0;
        bytes[i - 2] = g0;
        bytes[i - 1] = b0;
      } else if (alpha < 255) {
        var alpha_ = 255 - alpha;
        bytes[i - 3] = bytes[i - 3] * alpha + r0 * alpha_ >> 8;
        bytes[i - 2] = bytes[i - 2] * alpha + g0 * alpha_ >> 8;
        bytes[i - 1] = bytes[i - 1] * alpha + b0 * alpha_ >> 8;
      }
    }
  }

  function composeSMaskAlpha(maskData, layerData, transferMap) {
    var length = maskData.length;
    var scale = 1 / 255;

    for (var i = 3; i < length; i += 4) {
      var alpha = transferMap ? transferMap[maskData[i]] : maskData[i];
      layerData[i] = layerData[i] * alpha * scale | 0;
    }
  }

  function composeSMaskLuminosity(maskData, layerData, transferMap) {
    var length = maskData.length;

    for (var i = 3; i < length; i += 4) {
      var y = maskData[i - 3] * 77 + maskData[i - 2] * 152 + maskData[i - 1] * 28;
      layerData[i] = transferMap ? layerData[i] * transferMap[y >> 8] >> 8 : layerData[i] * y >> 16;
    }
  }

  function genericComposeSMask(maskCtx, layerCtx, width, height, subtype, backdrop, transferMap) {
    var hasBackdrop = !!backdrop;
    var r0 = hasBackdrop ? backdrop[0] : 0;
    var g0 = hasBackdrop ? backdrop[1] : 0;
    var b0 = hasBackdrop ? backdrop[2] : 0;
    var composeFn;

    if (subtype === "Luminosity") {
      composeFn = composeSMaskLuminosity;
    } else {
      composeFn = composeSMaskAlpha;
    }

    var PIXELS_TO_PROCESS = 1048576;
    var chunkSize = Math.min(height, Math.ceil(PIXELS_TO_PROCESS / width));

    for (var row = 0; row < height; row += chunkSize) {
      var chunkHeight = Math.min(chunkSize, height - row);
      var maskData = maskCtx.getImageData(0, row, width, chunkHeight);
      var layerData = layerCtx.getImageData(0, row, width, chunkHeight);

      if (hasBackdrop) {
        composeSMaskBackdrop(maskData.data, r0, g0, b0);
      }

      composeFn(maskData.data, layerData.data, transferMap);
      maskCtx.putImageData(layerData, 0, row);
    }
  }

  function composeSMask(ctx, smask, layerCtx, webGLContext) {
    var mask = smask.canvas;
    var maskCtx = smask.context;
    ctx.setTransform(smask.scaleX, 0, 0, smask.scaleY, smask.offsetX, smask.offsetY);
    var backdrop = smask.backdrop || null;

    if (!smask.transferMap && webGLContext.isEnabled) {
      const composed = webGLContext.composeSMask({
        layer: layerCtx.canvas,
        mask,
        properties: {
          subtype: smask.subtype,
          backdrop
        }
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(composed, smask.offsetX, smask.offsetY);
      return;
    }

    genericComposeSMask(maskCtx, layerCtx, mask.width, mask.height, smask.subtype, backdrop, smask.transferMap);
    ctx.drawImage(mask, 0, 0);
  }

  var LINE_CAP_STYLES = ["butt", "round", "square"];
  var LINE_JOIN_STYLES = ["miter", "round", "bevel"];
  var NORMAL_CLIP = {};
  var EO_CLIP = {};
  CanvasGraphics.prototype = {
    beginDrawing({
      transform,
      viewport,
      transparency = false,
      background = null
    }) {
      var width = this.ctx.canvas.width;
      var height = this.ctx.canvas.height;
      this.ctx.save();
      this.ctx.fillStyle = background || "rgb(255, 255, 255)";
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.restore();

      if (transparency) {
        var transparentCanvas = this.cachedCanvases.getCanvas("transparent", width, height, true);
        this.compositeCtx = this.ctx;
        this.transparentCanvas = transparentCanvas.canvas;
        this.ctx = transparentCanvas.context;
        this.ctx.save();
        this.ctx.transform.apply(this.ctx, this.compositeCtx.mozCurrentTransform);
      }

      this.ctx.save();
      resetCtxToDefault(this.ctx);

      if (transform) {
        this.ctx.transform.apply(this.ctx, transform);
      }

      this.ctx.transform.apply(this.ctx, viewport.transform);
      this.baseTransform = this.ctx.mozCurrentTransform.slice();

      if (this.imageLayer) {
        this.imageLayer.beginLayout();
      }
    },

    executeOperatorList: function CanvasGraphics_executeOperatorList(operatorList, executionStartIdx, continueCallback, stepper) {
      var argsArray = operatorList.argsArray;
      var fnArray = operatorList.fnArray;
      var i = executionStartIdx || 0;
      var argsArrayLen = argsArray.length;

      if (argsArrayLen === i) {
        return i;
      }

      var chunkOperations = argsArrayLen - i > EXECUTION_STEPS && typeof continueCallback === "function";
      var endTime = chunkOperations ? Date.now() + EXECUTION_TIME : 0;
      var steps = 0;
      var commonObjs = this.commonObjs;
      var objs = this.objs;
      var fnId;

      while (true) {
        if (stepper !== undefined && i === stepper.nextBreakPoint) {
          stepper.breakIt(i, continueCallback);
          return i;
        }

        fnId = fnArray[i];

        if (fnId !== _util.OPS.dependency) {
          this[fnId].apply(this, argsArray[i]);
        } else {
          for (const depObjId of argsArray[i]) {
            const objsPool = depObjId.startsWith("g_") ? commonObjs : objs;

            if (!objsPool.has(depObjId)) {
              objsPool.get(depObjId, continueCallback);
              return i;
            }
          }
        }

        i++;

        if (i === argsArrayLen) {
          return i;
        }

        if (chunkOperations && ++steps > EXECUTION_STEPS) {
          if (Date.now() > endTime) {
            continueCallback();
            return i;
          }

          steps = 0;
        }
      }
    },
    endDrawing: function CanvasGraphics_endDrawing() {
      if (this.current.activeSMask !== null) {
        this.endSMaskGroup();
      }

      this.ctx.restore();

      if (this.transparentCanvas) {
        this.ctx = this.compositeCtx;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.drawImage(this.transparentCanvas, 0, 0);
        this.ctx.restore();
        this.transparentCanvas = null;
      }

      this.cachedCanvases.clear();
      this.webGLContext.clear();

      if (this.imageLayer) {
        this.imageLayer.endLayout();
      }
    },
    setLineWidth: function CanvasGraphics_setLineWidth(width) {
      this.current.lineWidth = width;
      this.ctx.lineWidth = width;
    },
    setLineCap: function CanvasGraphics_setLineCap(style) {
      this.ctx.lineCap = LINE_CAP_STYLES[style];
    },
    setLineJoin: function CanvasGraphics_setLineJoin(style) {
      this.ctx.lineJoin = LINE_JOIN_STYLES[style];
    },
    setMiterLimit: function CanvasGraphics_setMiterLimit(limit) {
      this.ctx.miterLimit = limit;
    },
    setDash: function CanvasGraphics_setDash(dashArray, dashPhase) {
      var ctx = this.ctx;

      if (ctx.setLineDash !== undefined) {
        ctx.setLineDash(dashArray);
        ctx.lineDashOffset = dashPhase;
      }
    },

    setRenderingIntent(intent) {},

    setFlatness(flatness) {},

    setGState: function CanvasGraphics_setGState(states) {
      for (var i = 0, ii = states.length; i < ii; i++) {
        var state = states[i];
        var key = state[0];
        var value = state[1];

        switch (key) {
          case "LW":
            this.setLineWidth(value);
            break;

          case "LC":
            this.setLineCap(value);
            break;

          case "LJ":
            this.setLineJoin(value);
            break;

          case "ML":
            this.setMiterLimit(value);
            break;

          case "D":
            this.setDash(value[0], value[1]);
            break;

          case "RI":
            this.setRenderingIntent(value);
            break;

          case "FL":
            this.setFlatness(value);
            break;

          case "Font":
            this.setFont(value[0], value[1]);
            break;

          case "CA":
            this.current.strokeAlpha = state[1];
            break;

          case "ca":
            this.current.fillAlpha = state[1];
            this.ctx.globalAlpha = state[1];
            break;

          case "BM":
            this.ctx.globalCompositeOperation = value;
            break;

          case "SMask":
            if (this.current.activeSMask) {
              if (this.stateStack.length > 0 && this.stateStack[this.stateStack.length - 1].activeSMask === this.current.activeSMask) {
                this.suspendSMaskGroup();
              } else {
                this.endSMaskGroup();
              }
            }

            this.current.activeSMask = value ? this.tempSMask : null;

            if (this.current.activeSMask) {
              this.beginSMaskGroup();
            }

            this.tempSMask = null;
            break;
        }
      }
    },
    beginSMaskGroup: function CanvasGraphics_beginSMaskGroup() {
      var activeSMask = this.current.activeSMask;
      var drawnWidth = activeSMask.canvas.width;
      var drawnHeight = activeSMask.canvas.height;
      var cacheId = "smaskGroupAt" + this.groupLevel;
      var scratchCanvas = this.cachedCanvases.getCanvas(cacheId, drawnWidth, drawnHeight, true);
      var currentCtx = this.ctx;
      var currentTransform = currentCtx.mozCurrentTransform;
      this.ctx.save();
      var groupCtx = scratchCanvas.context;
      groupCtx.scale(1 / activeSMask.scaleX, 1 / activeSMask.scaleY);
      groupCtx.translate(-activeSMask.offsetX, -activeSMask.offsetY);
      groupCtx.transform.apply(groupCtx, currentTransform);
      activeSMask.startTransformInverse = groupCtx.mozCurrentTransformInverse;
      copyCtxState(currentCtx, groupCtx);
      this.ctx = groupCtx;
      this.setGState([["BM", "source-over"], ["ca", 1], ["CA", 1]]);
      this.groupStack.push(currentCtx);
      this.groupLevel++;
    },
    suspendSMaskGroup: function CanvasGraphics_endSMaskGroup() {
      var groupCtx = this.ctx;
      this.groupLevel--;
      this.ctx = this.groupStack.pop();
      composeSMask(this.ctx, this.current.activeSMask, groupCtx, this.webGLContext);
      this.ctx.restore();
      this.ctx.save();
      copyCtxState(groupCtx, this.ctx);
      this.current.resumeSMaskCtx = groupCtx;

      var deltaTransform = _util.Util.transform(this.current.activeSMask.startTransformInverse, groupCtx.mozCurrentTransform);

      this.ctx.transform.apply(this.ctx, deltaTransform);
      groupCtx.save();
      groupCtx.setTransform(1, 0, 0, 1, 0, 0);
      groupCtx.clearRect(0, 0, groupCtx.canvas.width, groupCtx.canvas.height);
      groupCtx.restore();
    },
    resumeSMaskGroup: function CanvasGraphics_endSMaskGroup() {
      var groupCtx = this.current.resumeSMaskCtx;
      var currentCtx = this.ctx;
      this.ctx = groupCtx;
      this.groupStack.push(currentCtx);
      this.groupLevel++;
    },
    endSMaskGroup: function CanvasGraphics_endSMaskGroup() {
      var groupCtx = this.ctx;
      this.groupLevel--;
      this.ctx = this.groupStack.pop();
      composeSMask(this.ctx, this.current.activeSMask, groupCtx, this.webGLContext);
      this.ctx.restore();
      copyCtxState(groupCtx, this.ctx);

      var deltaTransform = _util.Util.transform(this.current.activeSMask.startTransformInverse, groupCtx.mozCurrentTransform);

      this.ctx.transform.apply(this.ctx, deltaTransform);
    },
    save: function CanvasGraphics_save() {
      this.ctx.save();
      var old = this.current;
      this.stateStack.push(old);
      this.current = old.clone();
      this.current.resumeSMaskCtx = null;
    },
    restore: function CanvasGraphics_restore() {
      if (this.current.resumeSMaskCtx) {
        this.resumeSMaskGroup();
      }

      if (this.current.activeSMask !== null && (this.stateStack.length === 0 || this.stateStack[this.stateStack.length - 1].activeSMask !== this.current.activeSMask)) {
        this.endSMaskGroup();
      }

      if (this.stateStack.length !== 0) {
        this.current = this.stateStack.pop();
        this.ctx.restore();
        this.pendingClip = null;
        this._cachedGetSinglePixelWidth = null;
      }
    },
    transform: function CanvasGraphics_transform(a, b, c, d, e, f) {
      this.ctx.transform(a, b, c, d, e, f);
      this._cachedGetSinglePixelWidth = null;
    },
    constructPath: function CanvasGraphics_constructPath(ops, args) {
      var ctx = this.ctx;
      var current = this.current;
      var x = current.x,
          y = current.y;

      for (var i = 0, j = 0, ii = ops.length; i < ii; i++) {
        switch (ops[i] | 0) {
          case _util.OPS.rectangle:
            x = args[j++];
            y = args[j++];
            var width = args[j++];
            var height = args[j++];

            if (width === 0) {
              width = this.getSinglePixelWidth();
            }

            if (height === 0) {
              height = this.getSinglePixelWidth();
            }

            var xw = x + width;
            var yh = y + height;
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(xw, y);
            this.ctx.lineTo(xw, yh);
            this.ctx.lineTo(x, yh);
            this.ctx.lineTo(x, y);
            this.ctx.closePath();
            break;

          case _util.OPS.moveTo:
            x = args[j++];
            y = args[j++];
            ctx.moveTo(x, y);
            break;

          case _util.OPS.lineTo:
            x = args[j++];
            y = args[j++];
            ctx.lineTo(x, y);
            break;

          case _util.OPS.curveTo:
            x = args[j + 4];
            y = args[j + 5];
            ctx.bezierCurveTo(args[j], args[j + 1], args[j + 2], args[j + 3], x, y);
            j += 6;
            break;

          case _util.OPS.curveTo2:
            ctx.bezierCurveTo(x, y, args[j], args[j + 1], args[j + 2], args[j + 3]);
            x = args[j + 2];
            y = args[j + 3];
            j += 4;
            break;

          case _util.OPS.curveTo3:
            x = args[j + 2];
            y = args[j + 3];
            ctx.bezierCurveTo(args[j], args[j + 1], x, y, x, y);
            j += 4;
            break;

          case _util.OPS.closePath:
            ctx.closePath();
            break;
        }
      }

      current.setCurrentPoint(x, y);
    },
    closePath: function CanvasGraphics_closePath() {
      this.ctx.closePath();
    },
    stroke: function CanvasGraphics_stroke(consumePath) {
      consumePath = typeof consumePath !== "undefined" ? consumePath : true;
      var ctx = this.ctx;
      var strokeColor = this.current.strokeColor;
      ctx.globalAlpha = this.current.strokeAlpha;

      if (strokeColor && strokeColor.hasOwnProperty("type") && strokeColor.type === "Pattern") {
        ctx.save();
        const transform = ctx.mozCurrentTransform;

        const scale = _util.Util.singularValueDecompose2dScale(transform)[0];

        ctx.strokeStyle = strokeColor.getPattern(ctx, this);
        ctx.lineWidth = Math.max(this.getSinglePixelWidth() * MIN_WIDTH_FACTOR, this.current.lineWidth * scale);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.lineWidth = Math.max(this.getSinglePixelWidth() * MIN_WIDTH_FACTOR, this.current.lineWidth);
        ctx.stroke();
      }

      if (consumePath) {
        this.consumePath();
      }

      ctx.globalAlpha = this.current.fillAlpha;
    },
    closeStroke: function CanvasGraphics_closeStroke() {
      this.closePath();
      this.stroke();
    },
    fill: function CanvasGraphics_fill(consumePath) {
      consumePath = typeof consumePath !== "undefined" ? consumePath : true;
      var ctx = this.ctx;
      var fillColor = this.current.fillColor;
      var isPatternFill = this.current.patternFill;
      var needRestore = false;

      if (isPatternFill) {
        ctx.save();

        if (this.baseTransform) {
          ctx.setTransform.apply(ctx, this.baseTransform);
        }

        ctx.fillStyle = fillColor.getPattern(ctx, this);
        needRestore = true;
      }

      if (this.pendingEOFill) {
        ctx.fill("evenodd");
        this.pendingEOFill = false;
      } else {
        ctx.fill();
      }

      if (needRestore) {
        ctx.restore();
      }

      if (consumePath) {
        this.consumePath();
      }
    },
    eoFill: function CanvasGraphics_eoFill() {
      this.pendingEOFill = true;
      this.fill();
    },
    fillStroke: function CanvasGraphics_fillStroke() {
      this.fill(false);
      this.stroke(false);
      this.consumePath();
    },
    eoFillStroke: function CanvasGraphics_eoFillStroke() {
      this.pendingEOFill = true;
      this.fillStroke();
    },
    closeFillStroke: function CanvasGraphics_closeFillStroke() {
      this.closePath();
      this.fillStroke();
    },
    closeEOFillStroke: function CanvasGraphics_closeEOFillStroke() {
      this.pendingEOFill = true;
      this.closePath();
      this.fillStroke();
    },
    endPath: function CanvasGraphics_endPath() {
      this.consumePath();
    },
    clip: function CanvasGraphics_clip() {
      this.pendingClip = NORMAL_CLIP;
    },
    eoClip: function CanvasGraphics_eoClip() {
      this.pendingClip = EO_CLIP;
    },
    beginText: function CanvasGraphics_beginText() {
      this.current.textMatrix = _util.IDENTITY_MATRIX;
      this.current.textMatrixScale = 1;
      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    endText: function CanvasGraphics_endText() {
      var paths = this.pendingTextPaths;
      var ctx = this.ctx;

      if (paths === undefined) {
        ctx.beginPath();
        return;
      }

      ctx.save();
      ctx.beginPath();

      for (var i = 0; i < paths.length; i++) {
        var path = paths[i];
        ctx.setTransform.apply(ctx, path.transform);
        ctx.translate(path.x, path.y);
        path.addToPath(ctx, path.fontSize);
      }

      ctx.restore();
      ctx.clip();
      ctx.beginPath();
      delete this.pendingTextPaths;
    },
    setCharSpacing: function CanvasGraphics_setCharSpacing(spacing) {
      this.current.charSpacing = spacing;
    },
    setWordSpacing: function CanvasGraphics_setWordSpacing(spacing) {
      this.current.wordSpacing = spacing;
    },
    setHScale: function CanvasGraphics_setHScale(scale) {
      this.current.textHScale = scale / 100;
    },
    setLeading: function CanvasGraphics_setLeading(leading) {
      this.current.leading = -leading;
    },
    setFont: function CanvasGraphics_setFont(fontRefName, size) {
      var fontObj = this.commonObjs.get(fontRefName);
      var current = this.current;

      if (!fontObj) {
        throw new Error(`Can't find font for ${fontRefName}`);
      }

      current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix : _util.FONT_IDENTITY_MATRIX;

      if (current.fontMatrix[0] === 0 || current.fontMatrix[3] === 0) {
        (0, _util.warn)("Invalid font matrix for font " + fontRefName);
      }

      if (size < 0) {
        size = -size;
        current.fontDirection = -1;
      } else {
        current.fontDirection = 1;
      }

      this.current.font = fontObj;
      this.current.fontSize = size;

      if (fontObj.isType3Font) {
        return;
      }

      var name = fontObj.loadedName || "sans-serif";
      let bold = "normal";

      if (fontObj.black) {
        bold = "900";
      } else if (fontObj.bold) {
        bold = "bold";
      }

      var italic = fontObj.italic ? "italic" : "normal";
      var typeface = `"${name}", ${fontObj.fallbackName}`;
      let browserFontSize = size;

      if (size < MIN_FONT_SIZE) {
        browserFontSize = MIN_FONT_SIZE;
      } else if (size > MAX_FONT_SIZE) {
        browserFontSize = MAX_FONT_SIZE;
      }

      this.current.fontSizeScale = size / browserFontSize;
      this.ctx.font = `${italic} ${bold} ${browserFontSize}px ${typeface}`;
    },
    setTextRenderingMode: function CanvasGraphics_setTextRenderingMode(mode) {
      this.current.textRenderingMode = mode;
    },
    setTextRise: function CanvasGraphics_setTextRise(rise) {
      this.current.textRise = rise;
    },
    moveText: function CanvasGraphics_moveText(x, y) {
      this.current.x = this.current.lineX += x;
      this.current.y = this.current.lineY += y;
    },
    setLeadingMoveText: function CanvasGraphics_setLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    },
    setTextMatrix: function CanvasGraphics_setTextMatrix(a, b, c, d, e, f) {
      this.current.textMatrix = [a, b, c, d, e, f];
      this.current.textMatrixScale = Math.sqrt(a * a + b * b);
      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    nextLine: function CanvasGraphics_nextLine() {
      this.moveText(0, this.current.leading);
    },

    paintChar(character, x, y, patternTransform) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var textRenderingMode = current.textRenderingMode;
      var fontSize = current.fontSize / current.fontSizeScale;
      var fillStrokeMode = textRenderingMode & _util.TextRenderingMode.FILL_STROKE_MASK;
      var isAddToPathSet = !!(textRenderingMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG);
      const patternFill = current.patternFill && font.data;
      var addToPath;

      if (font.disableFontFace || isAddToPathSet || patternFill) {
        addToPath = font.getPathGenerator(this.commonObjs, character);
      }

      if (font.disableFontFace || patternFill) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        addToPath(ctx, fontSize);

        if (patternTransform) {
          ctx.setTransform.apply(ctx, patternTransform);
        }

        if (fillStrokeMode === _util.TextRenderingMode.FILL || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
          ctx.fill();
        }

        if (fillStrokeMode === _util.TextRenderingMode.STROKE || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
          ctx.stroke();
        }

        ctx.restore();
      } else {
        if (fillStrokeMode === _util.TextRenderingMode.FILL || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
          ctx.fillText(character, x, y);
        }

        if (fillStrokeMode === _util.TextRenderingMode.STROKE || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
          ctx.strokeText(character, x, y);
        }
      }

      if (isAddToPathSet) {
        var paths = this.pendingTextPaths || (this.pendingTextPaths = []);
        paths.push({
          transform: ctx.mozCurrentTransform,
          x,
          y,
          fontSize,
          addToPath
        });
      }
    },

    get isFontSubpixelAAEnabled() {
      const {
        context: ctx
      } = this.cachedCanvases.getCanvas("isFontSubpixelAAEnabled", 10, 10);
      ctx.scale(1.5, 1);
      ctx.fillText("I", 0, 10);
      var data = ctx.getImageData(0, 0, 10, 10).data;
      var enabled = false;

      for (var i = 3; i < data.length; i += 4) {
        if (data[i] > 0 && data[i] < 255) {
          enabled = true;
          break;
        }
      }

      return (0, _util.shadow)(this, "isFontSubpixelAAEnabled", enabled);
    },

    showText: function CanvasGraphics_showText(glyphs) {
      var current = this.current;
      var font = current.font;

      if (font.isType3Font) {
        return this.showType3Text(glyphs);
      }

      var fontSize = current.fontSize;

      if (fontSize === 0) {
        return undefined;
      }

      var ctx = this.ctx;
      var fontSizeScale = current.fontSizeScale;
      var charSpacing = current.charSpacing;
      var wordSpacing = current.wordSpacing;
      var fontDirection = current.fontDirection;
      var textHScale = current.textHScale * fontDirection;
      var glyphsLength = glyphs.length;
      var vertical = font.vertical;
      var spacingDir = vertical ? 1 : -1;
      var defaultVMetrics = font.defaultVMetrics;
      var widthAdvanceScale = fontSize * current.fontMatrix[0];
      var simpleFillText = current.textRenderingMode === _util.TextRenderingMode.FILL && !font.disableFontFace && !current.patternFill;
      ctx.save();
      let patternTransform;

      if (current.patternFill) {
        ctx.save();
        const pattern = current.fillColor.getPattern(ctx, this);
        patternTransform = ctx.mozCurrentTransform;
        ctx.restore();
        ctx.fillStyle = pattern;
      }

      ctx.transform.apply(ctx, current.textMatrix);
      ctx.translate(current.x, current.y + current.textRise);

      if (fontDirection > 0) {
        ctx.scale(textHScale, -1);
      } else {
        ctx.scale(textHScale, 1);
      }

      var lineWidth = current.lineWidth;
      var scale = current.textMatrixScale;

      if (scale === 0 || lineWidth === 0) {
        var fillStrokeMode = current.textRenderingMode & _util.TextRenderingMode.FILL_STROKE_MASK;

        if (fillStrokeMode === _util.TextRenderingMode.STROKE || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
          this._cachedGetSinglePixelWidth = null;
          lineWidth = this.getSinglePixelWidth() * MIN_WIDTH_FACTOR;
        }
      } else {
        lineWidth /= scale;
      }

      if (fontSizeScale !== 1.0) {
        ctx.scale(fontSizeScale, fontSizeScale);
        lineWidth /= fontSizeScale;
      }

      ctx.lineWidth = lineWidth;
      var x = 0,
          i;

      for (i = 0; i < glyphsLength; ++i) {
        var glyph = glyphs[i];

        if ((0, _util.isNum)(glyph)) {
          x += spacingDir * glyph * fontSize / 1000;
          continue;
        }

        var restoreNeeded = false;
        var spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
        var character = glyph.fontChar;
        var accent = glyph.accent;
        var scaledX, scaledY, scaledAccentX, scaledAccentY;
        var width = glyph.width;

        if (vertical) {
          var vmetric, vx, vy;
          vmetric = glyph.vmetric || defaultVMetrics;
          vx = glyph.vmetric ? vmetric[1] : width * 0.5;
          vx = -vx * widthAdvanceScale;
          vy = vmetric[2] * widthAdvanceScale;
          width = vmetric ? -vmetric[0] : width;
          scaledX = vx / fontSizeScale;
          scaledY = (x + vy) / fontSizeScale;
        } else {
          scaledX = x / fontSizeScale;
          scaledY = 0;
        }

        if (font.remeasure && width > 0) {
          var measuredWidth = ctx.measureText(character).width * 1000 / fontSize * fontSizeScale;

          if (width < measuredWidth && this.isFontSubpixelAAEnabled) {
            var characterScaleX = width / measuredWidth;
            restoreNeeded = true;
            ctx.save();
            ctx.scale(characterScaleX, 1);
            scaledX /= characterScaleX;
          } else if (width !== measuredWidth) {
            scaledX += (width - measuredWidth) / 2000 * fontSize / fontSizeScale;
          }
        }

        if (glyph.isInFont || font.missingFile) {
          if (simpleFillText && !accent) {
            ctx.fillText(character, scaledX, scaledY);
          } else {
            this.paintChar(character, scaledX, scaledY, patternTransform);

            if (accent) {
              scaledAccentX = scaledX + accent.offset.x / fontSizeScale;
              scaledAccentY = scaledY - accent.offset.y / fontSizeScale;
              this.paintChar(accent.fontChar, scaledAccentX, scaledAccentY, patternTransform);
            }
          }
        }

        var charWidth;

        if (vertical) {
          charWidth = width * widthAdvanceScale - spacing * fontDirection;
        } else {
          charWidth = width * widthAdvanceScale + spacing * fontDirection;
        }

        x += charWidth;

        if (restoreNeeded) {
          ctx.restore();
        }
      }

      if (vertical) {
        current.y -= x;
      } else {
        current.x += x * textHScale;
      }

      ctx.restore();
    },
    showType3Text: function CanvasGraphics_showType3Text(glyphs) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var fontSize = current.fontSize;
      var fontDirection = current.fontDirection;
      var spacingDir = font.vertical ? 1 : -1;
      var charSpacing = current.charSpacing;
      var wordSpacing = current.wordSpacing;
      var textHScale = current.textHScale * fontDirection;
      var fontMatrix = current.fontMatrix || _util.FONT_IDENTITY_MATRIX;
      var glyphsLength = glyphs.length;
      var isTextInvisible = current.textRenderingMode === _util.TextRenderingMode.INVISIBLE;
      var i, glyph, width, spacingLength;

      if (isTextInvisible || fontSize === 0) {
        return;
      }

      this._cachedGetSinglePixelWidth = null;
      ctx.save();
      ctx.transform.apply(ctx, current.textMatrix);
      ctx.translate(current.x, current.y);
      ctx.scale(textHScale, fontDirection);

      for (i = 0; i < glyphsLength; ++i) {
        glyph = glyphs[i];

        if ((0, _util.isNum)(glyph)) {
          spacingLength = spacingDir * glyph * fontSize / 1000;
          this.ctx.translate(spacingLength, 0);
          current.x += spacingLength * textHScale;
          continue;
        }

        var spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
        var operatorList = font.charProcOperatorList[glyph.operatorListId];

        if (!operatorList) {
          (0, _util.warn)(`Type3 character "${glyph.operatorListId}" is not available.`);
          continue;
        }

        this.processingType3 = glyph;
        this.save();
        ctx.scale(fontSize, fontSize);
        ctx.transform.apply(ctx, fontMatrix);
        this.executeOperatorList(operatorList);
        this.restore();

        var transformed = _util.Util.applyTransform([glyph.width, 0], fontMatrix);

        width = transformed[0] * fontSize + spacing;
        ctx.translate(width, 0);
        current.x += width * textHScale;
      }

      ctx.restore();
      this.processingType3 = null;
    },
    setCharWidth: function CanvasGraphics_setCharWidth(xWidth, yWidth) {},
    setCharWidthAndBounds: function CanvasGraphics_setCharWidthAndBounds(xWidth, yWidth, llx, lly, urx, ury) {
      this.ctx.rect(llx, lly, urx - llx, ury - lly);
      this.clip();
      this.endPath();
    },
    getColorN_Pattern: function CanvasGraphics_getColorN_Pattern(IR) {
      var pattern;

      if (IR[0] === "TilingPattern") {
        var color = IR[1];
        var baseTransform = this.baseTransform || this.ctx.mozCurrentTransform.slice();
        var canvasGraphicsFactory = {
          createCanvasGraphics: ctx => {
            return new CanvasGraphics(ctx, this.commonObjs, this.objs, this.canvasFactory, this.webGLContext);
          }
        };
        pattern = new _pattern_helper.TilingPattern(IR, color, this.ctx, canvasGraphicsFactory, baseTransform);
      } else {
        pattern = (0, _pattern_helper.getShadingPatternFromIR)(IR);
      }

      return pattern;
    },
    setStrokeColorN: function CanvasGraphics_setStrokeColorN() {
      this.current.strokeColor = this.getColorN_Pattern(arguments);
    },
    setFillColorN: function CanvasGraphics_setFillColorN() {
      this.current.fillColor = this.getColorN_Pattern(arguments);
      this.current.patternFill = true;
    },
    setStrokeRGBColor: function CanvasGraphics_setStrokeRGBColor(r, g, b) {
      var color = _util.Util.makeCssRgb(r, g, b);

      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillRGBColor: function CanvasGraphics_setFillRGBColor(r, g, b) {
      var color = _util.Util.makeCssRgb(r, g, b);

      this.ctx.fillStyle = color;
      this.current.fillColor = color;
      this.current.patternFill = false;
    },
    shadingFill: function CanvasGraphics_shadingFill(patternIR) {
      var ctx = this.ctx;
      this.save();
      var pattern = (0, _pattern_helper.getShadingPatternFromIR)(patternIR);
      ctx.fillStyle = pattern.getPattern(ctx, this, true);
      var inv = ctx.mozCurrentTransformInverse;

      if (inv) {
        var canvas = ctx.canvas;
        var width = canvas.width;
        var height = canvas.height;

        var bl = _util.Util.applyTransform([0, 0], inv);

        var br = _util.Util.applyTransform([0, height], inv);

        var ul = _util.Util.applyTransform([width, 0], inv);

        var ur = _util.Util.applyTransform([width, height], inv);

        var x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
        var y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
        var x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
        var y1 = Math.max(bl[1], br[1], ul[1], ur[1]);
        this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
      }

      this.restore();
    },
    beginInlineImage: function CanvasGraphics_beginInlineImage() {
      (0, _util.unreachable)("Should not call beginInlineImage");
    },
    beginImageData: function CanvasGraphics_beginImageData() {
      (0, _util.unreachable)("Should not call beginImageData");
    },
    paintFormXObjectBegin: function CanvasGraphics_paintFormXObjectBegin(matrix, bbox) {
      this.save();
      this.baseTransformStack.push(this.baseTransform);

      if (Array.isArray(matrix) && matrix.length === 6) {
        this.transform.apply(this, matrix);
      }

      this.baseTransform = this.ctx.mozCurrentTransform;

      if (bbox) {
        var width = bbox[2] - bbox[0];
        var height = bbox[3] - bbox[1];
        this.ctx.rect(bbox[0], bbox[1], width, height);
        this.clip();
        this.endPath();
      }
    },
    paintFormXObjectEnd: function CanvasGraphics_paintFormXObjectEnd() {
      this.restore();
      this.baseTransform = this.baseTransformStack.pop();
    },
    beginGroup: function CanvasGraphics_beginGroup(group) {
      this.save();
      var currentCtx = this.ctx;

      if (!group.isolated) {
        (0, _util.info)("TODO: Support non-isolated groups.");
      }

      if (group.knockout) {
        (0, _util.warn)("Knockout groups not supported.");
      }

      var currentTransform = currentCtx.mozCurrentTransform;

      if (group.matrix) {
        currentCtx.transform.apply(currentCtx, group.matrix);
      }

      if (!group.bbox) {
        throw new Error("Bounding box is required.");
      }

      var bounds = _util.Util.getAxialAlignedBoundingBox(group.bbox, currentCtx.mozCurrentTransform);

      var canvasBounds = [0, 0, currentCtx.canvas.width, currentCtx.canvas.height];
      bounds = _util.Util.intersect(bounds, canvasBounds) || [0, 0, 0, 0];
      var offsetX = Math.floor(bounds[0]);
      var offsetY = Math.floor(bounds[1]);
      var drawnWidth = Math.max(Math.ceil(bounds[2]) - offsetX, 1);
      var drawnHeight = Math.max(Math.ceil(bounds[3]) - offsetY, 1);
      var scaleX = 1,
          scaleY = 1;

      if (drawnWidth > MAX_GROUP_SIZE) {
        scaleX = drawnWidth / MAX_GROUP_SIZE;
        drawnWidth = MAX_GROUP_SIZE;
      }

      if (drawnHeight > MAX_GROUP_SIZE) {
        scaleY = drawnHeight / MAX_GROUP_SIZE;
        drawnHeight = MAX_GROUP_SIZE;
      }

      var cacheId = "groupAt" + this.groupLevel;

      if (group.smask) {
        cacheId += "_smask_" + this.smaskCounter++ % 2;
      }

      var scratchCanvas = this.cachedCanvases.getCanvas(cacheId, drawnWidth, drawnHeight, true);
      var groupCtx = scratchCanvas.context;
      groupCtx.scale(1 / scaleX, 1 / scaleY);
      groupCtx.translate(-offsetX, -offsetY);
      groupCtx.transform.apply(groupCtx, currentTransform);

      if (group.smask) {
        this.smaskStack.push({
          canvas: scratchCanvas.canvas,
          context: groupCtx,
          offsetX,
          offsetY,
          scaleX,
          scaleY,
          subtype: group.smask.subtype,
          backdrop: group.smask.backdrop,
          transferMap: group.smask.transferMap || null,
          startTransformInverse: null
        });
      } else {
        currentCtx.setTransform(1, 0, 0, 1, 0, 0);
        currentCtx.translate(offsetX, offsetY);
        currentCtx.scale(scaleX, scaleY);
      }

      copyCtxState(currentCtx, groupCtx);
      this.ctx = groupCtx;
      this.setGState([["BM", "source-over"], ["ca", 1], ["CA", 1]]);
      this.groupStack.push(currentCtx);
      this.groupLevel++;
      this.current.activeSMask = null;
    },
    endGroup: function CanvasGraphics_endGroup(group) {
      this.groupLevel--;
      var groupCtx = this.ctx;
      this.ctx = this.groupStack.pop();

      if (this.ctx.imageSmoothingEnabled !== undefined) {
        this.ctx.imageSmoothingEnabled = false;
      } else {
        this.ctx.mozImageSmoothingEnabled = false;
      }

      if (group.smask) {
        this.tempSMask = this.smaskStack.pop();
      } else {
        this.ctx.drawImage(groupCtx.canvas, 0, 0);
      }

      this.restore();
    },
    beginAnnotations: function CanvasGraphics_beginAnnotations() {
      this.save();

      if (this.baseTransform) {
        this.ctx.setTransform.apply(this.ctx, this.baseTransform);
      }
    },
    endAnnotations: function CanvasGraphics_endAnnotations() {
      this.restore();
    },
    beginAnnotation: function CanvasGraphics_beginAnnotation(rect, transform, matrix) {
      this.save();
      resetCtxToDefault(this.ctx);
      this.current = new CanvasExtraState();

      if (Array.isArray(rect) && rect.length === 4) {
        var width = rect[2] - rect[0];
        var height = rect[3] - rect[1];
        this.ctx.rect(rect[0], rect[1], width, height);
        this.clip();
        this.endPath();
      }

      this.transform.apply(this, transform);
      this.transform.apply(this, matrix);
    },
    endAnnotation: function CanvasGraphics_endAnnotation() {
      this.restore();
    },
    paintJpegXObject: function CanvasGraphics_paintJpegXObject(objId, w, h) {
      const domImage = this.processingType3 ? this.commonObjs.get(objId) : this.objs.get(objId);

      if (!domImage) {
        (0, _util.warn)("Dependent image isn't ready yet");
        return;
      }

      this.save();
      var ctx = this.ctx;
      ctx.scale(1 / w, -1 / h);
      ctx.drawImage(domImage, 0, 0, domImage.width, domImage.height, 0, -h, w, h);

      if (this.imageLayer) {
        var currentTransform = ctx.mozCurrentTransformInverse;
        var position = this.getCanvasPosition(0, 0);
        this.imageLayer.appendImage({
          objId,
          left: position[0],
          top: position[1],
          width: w / currentTransform[0],
          height: h / currentTransform[3]
        });
      }

      this.restore();
    },
    paintImageMaskXObject: function CanvasGraphics_paintImageMaskXObject(img) {
      var ctx = this.ctx;
      var width = img.width,
          height = img.height;
      var fillColor = this.current.fillColor;
      var isPatternFill = this.current.patternFill;
      var glyph = this.processingType3;

      if (COMPILE_TYPE3_GLYPHS && glyph && glyph.compiled === undefined) {
        if (width <= MAX_SIZE_TO_COMPILE && height <= MAX_SIZE_TO_COMPILE) {
          glyph.compiled = compileType3Glyph({
            data: img.data,
            width,
            height
          });
        } else {
          glyph.compiled = null;
        }
      }

      if (glyph && glyph.compiled) {
        glyph.compiled(ctx);
        return;
      }

      var maskCanvas = this.cachedCanvases.getCanvas("maskCanvas", width, height);
      var maskCtx = maskCanvas.context;
      maskCtx.save();
      putBinaryImageMask(maskCtx, img);
      maskCtx.globalCompositeOperation = "source-in";
      maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
      maskCtx.fillRect(0, 0, width, height);
      maskCtx.restore();
      this.paintInlineImageXObject(maskCanvas.canvas);
    },
    paintImageMaskXObjectRepeat: function CanvasGraphics_paintImageMaskXObjectRepeat(imgData, scaleX, scaleY, positions) {
      var width = imgData.width;
      var height = imgData.height;
      var fillColor = this.current.fillColor;
      var isPatternFill = this.current.patternFill;
      var maskCanvas = this.cachedCanvases.getCanvas("maskCanvas", width, height);
      var maskCtx = maskCanvas.context;
      maskCtx.save();
      putBinaryImageMask(maskCtx, imgData);
      maskCtx.globalCompositeOperation = "source-in";
      maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
      maskCtx.fillRect(0, 0, width, height);
      maskCtx.restore();
      var ctx = this.ctx;

      for (var i = 0, ii = positions.length; i < ii; i += 2) {
        ctx.save();
        ctx.transform(scaleX, 0, 0, scaleY, positions[i], positions[i + 1]);
        ctx.scale(1, -1);
        ctx.drawImage(maskCanvas.canvas, 0, 0, width, height, 0, -1, 1, 1);
        ctx.restore();
      }
    },
    paintImageMaskXObjectGroup: function CanvasGraphics_paintImageMaskXObjectGroup(images) {
      var ctx = this.ctx;
      var fillColor = this.current.fillColor;
      var isPatternFill = this.current.patternFill;

      for (var i = 0, ii = images.length; i < ii; i++) {
        var image = images[i];
        var width = image.width,
            height = image.height;
        var maskCanvas = this.cachedCanvases.getCanvas("maskCanvas", width, height);
        var maskCtx = maskCanvas.context;
        maskCtx.save();
        putBinaryImageMask(maskCtx, image);
        maskCtx.globalCompositeOperation = "source-in";
        maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
        maskCtx.fillRect(0, 0, width, height);
        maskCtx.restore();
        ctx.save();
        ctx.transform.apply(ctx, image.transform);
        ctx.scale(1, -1);
        ctx.drawImage(maskCanvas.canvas, 0, 0, width, height, 0, -1, 1, 1);
        ctx.restore();
      }
    },
    paintImageXObject: function CanvasGraphics_paintImageXObject(objId) {
      const imgData = this.processingType3 ? this.commonObjs.get(objId) : this.objs.get(objId);

      if (!imgData) {
        (0, _util.warn)("Dependent image isn't ready yet");
        return;
      }

      this.paintInlineImageXObject(imgData);
    },
    paintImageXObjectRepeat: function CanvasGraphics_paintImageXObjectRepeat(objId, scaleX, scaleY, positions) {
      const imgData = this.processingType3 ? this.commonObjs.get(objId) : this.objs.get(objId);

      if (!imgData) {
        (0, _util.warn)("Dependent image isn't ready yet");
        return;
      }

      var width = imgData.width;
      var height = imgData.height;
      var map = [];

      for (var i = 0, ii = positions.length; i < ii; i += 2) {
        map.push({
          transform: [scaleX, 0, 0, scaleY, positions[i], positions[i + 1]],
          x: 0,
          y: 0,
          w: width,
          h: height
        });
      }

      this.paintInlineImageXObjectGroup(imgData, map);
    },
    paintInlineImageXObject: function CanvasGraphics_paintInlineImageXObject(imgData) {
      var width = imgData.width;
      var height = imgData.height;
      var ctx = this.ctx;
      this.save();
      ctx.scale(1 / width, -1 / height);
      var currentTransform = ctx.mozCurrentTransformInverse;
      var a = currentTransform[0],
          b = currentTransform[1];
      var widthScale = Math.max(Math.sqrt(a * a + b * b), 1);
      var c = currentTransform[2],
          d = currentTransform[3];
      var heightScale = Math.max(Math.sqrt(c * c + d * d), 1);
      var imgToPaint, tmpCanvas;

      if (typeof HTMLElement === "function" && imgData instanceof HTMLElement || !imgData.data) {
        imgToPaint = imgData;
      } else {
        tmpCanvas = this.cachedCanvases.getCanvas("inlineImage", width, height);
        var tmpCtx = tmpCanvas.context;
        putBinaryImageData(tmpCtx, imgData);
        imgToPaint = tmpCanvas.canvas;
      }

      var paintWidth = width,
          paintHeight = height;
      var tmpCanvasId = "prescale1";

      while (widthScale > 2 && paintWidth > 1 || heightScale > 2 && paintHeight > 1) {
        var newWidth = paintWidth,
            newHeight = paintHeight;

        if (widthScale > 2 && paintWidth > 1) {
          newWidth = Math.ceil(paintWidth / 2);
          widthScale /= paintWidth / newWidth;
        }

        if (heightScale > 2 && paintHeight > 1) {
          newHeight = Math.ceil(paintHeight / 2);
          heightScale /= paintHeight / newHeight;
        }

        tmpCanvas = this.cachedCanvases.getCanvas(tmpCanvasId, newWidth, newHeight);
        tmpCtx = tmpCanvas.context;
        tmpCtx.clearRect(0, 0, newWidth, newHeight);
        tmpCtx.drawImage(imgToPaint, 0, 0, paintWidth, paintHeight, 0, 0, newWidth, newHeight);
        imgToPaint = tmpCanvas.canvas;
        paintWidth = newWidth;
        paintHeight = newHeight;
        tmpCanvasId = tmpCanvasId === "prescale1" ? "prescale2" : "prescale1";
      }

      ctx.drawImage(imgToPaint, 0, 0, paintWidth, paintHeight, 0, -height, width, height);

      if (this.imageLayer) {
        var position = this.getCanvasPosition(0, -height);
        this.imageLayer.appendImage({
          imgData,
          left: position[0],
          top: position[1],
          width: width / currentTransform[0],
          height: height / currentTransform[3]
        });
      }

      this.restore();
    },
    paintInlineImageXObjectGroup: function CanvasGraphics_paintInlineImageXObjectGroup(imgData, map) {
      var ctx = this.ctx;
      var w = imgData.width;
      var h = imgData.height;
      var tmpCanvas = this.cachedCanvases.getCanvas("inlineImage", w, h);
      var tmpCtx = tmpCanvas.context;
      putBinaryImageData(tmpCtx, imgData);

      for (var i = 0, ii = map.length; i < ii; i++) {
        var entry = map[i];
        ctx.save();
        ctx.transform.apply(ctx, entry.transform);
        ctx.scale(1, -1);
        ctx.drawImage(tmpCanvas.canvas, entry.x, entry.y, entry.w, entry.h, 0, -1, 1, 1);

        if (this.imageLayer) {
          var position = this.getCanvasPosition(entry.x, entry.y);
          this.imageLayer.appendImage({
            imgData,
            left: position[0],
            top: position[1],
            width: w,
            height: h
          });
        }

        ctx.restore();
      }
    },
    paintSolidColorImageMask: function CanvasGraphics_paintSolidColorImageMask() {
      this.ctx.fillRect(0, 0, 1, 1);
    },
    paintXObject: function CanvasGraphics_paintXObject() {
      (0, _util.warn)("Unsupported 'paintXObject' command.");
    },
    markPoint: function CanvasGraphics_markPoint(tag) {},
    markPointProps: function CanvasGraphics_markPointProps(tag, properties) {},
    beginMarkedContent: function CanvasGraphics_beginMarkedContent(tag) {},
    beginMarkedContentProps: function CanvasGraphics_beginMarkedContentProps(tag, properties) {},
    endMarkedContent: function CanvasGraphics_endMarkedContent() {},
    beginCompat: function CanvasGraphics_beginCompat() {},
    endCompat: function CanvasGraphics_endCompat() {},
    consumePath: function CanvasGraphics_consumePath() {
      var ctx = this.ctx;

      if (this.pendingClip) {
        if (this.pendingClip === EO_CLIP) {
          ctx.clip("evenodd");
        } else {
          ctx.clip();
        }

        this.pendingClip = null;
      }

      ctx.beginPath();
    },

    getSinglePixelWidth(scale) {
      if (this._cachedGetSinglePixelWidth === null) {
        const inverse = this.ctx.mozCurrentTransformInverse;
        this._cachedGetSinglePixelWidth = Math.sqrt(Math.max(inverse[0] * inverse[0] + inverse[1] * inverse[1], inverse[2] * inverse[2] + inverse[3] * inverse[3]));
      }

      return this._cachedGetSinglePixelWidth;
    },

    getCanvasPosition: function CanvasGraphics_getCanvasPosition(x, y) {
      var transform = this.ctx.mozCurrentTransform;
      return [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]];
    }
  };

  for (var op in _util.OPS) {
    CanvasGraphics.prototype[_util.OPS[op]] = CanvasGraphics.prototype[op];
  }

  return CanvasGraphics;
}();

exports.CanvasGraphics = CanvasGraphics;

/***/ }),
/* 9 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getShadingPatternFromIR = getShadingPatternFromIR;
exports.TilingPattern = void 0;

var _util = __w_pdfjs_require__(1);

var ShadingIRs = {};

function applyBoundingBox(ctx, bbox) {
  if (!bbox || typeof Path2D === "undefined") {
    return;
  }

  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const region = new Path2D();
  region.rect(bbox[0], bbox[1], width, height);
  ctx.clip(region);
}

ShadingIRs.RadialAxial = {
  fromIR: function RadialAxial_fromIR(raw) {
    var type = raw[1];
    var bbox = raw[2];
    var colorStops = raw[3];
    var p0 = raw[4];
    var p1 = raw[5];
    var r0 = raw[6];
    var r1 = raw[7];
    return {
      type: "Pattern",
      getPattern: function RadialAxial_getPattern(ctx) {
        applyBoundingBox(ctx, bbox);
        var grad;

        if (type === "axial") {
          grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
        } else if (type === "radial") {
          grad = ctx.createRadialGradient(p0[0], p0[1], r0, p1[0], p1[1], r1);
        }

        for (var i = 0, ii = colorStops.length; i < ii; ++i) {
          var c = colorStops[i];
          grad.addColorStop(c[0], c[1]);
        }

        return grad;
      }
    };
  }
};

var createMeshCanvas = function createMeshCanvasClosure() {
  function drawTriangle(data, context, p1, p2, p3, c1, c2, c3) {
    var coords = context.coords,
        colors = context.colors;
    var bytes = data.data,
        rowSize = data.width * 4;
    var tmp;

    if (coords[p1 + 1] > coords[p2 + 1]) {
      tmp = p1;
      p1 = p2;
      p2 = tmp;
      tmp = c1;
      c1 = c2;
      c2 = tmp;
    }

    if (coords[p2 + 1] > coords[p3 + 1]) {
      tmp = p2;
      p2 = p3;
      p3 = tmp;
      tmp = c2;
      c2 = c3;
      c3 = tmp;
    }

    if (coords[p1 + 1] > coords[p2 + 1]) {
      tmp = p1;
      p1 = p2;
      p2 = tmp;
      tmp = c1;
      c1 = c2;
      c2 = tmp;
    }

    var x1 = (coords[p1] + context.offsetX) * context.scaleX;
    var y1 = (coords[p1 + 1] + context.offsetY) * context.scaleY;
    var x2 = (coords[p2] + context.offsetX) * context.scaleX;
    var y2 = (coords[p2 + 1] + context.offsetY) * context.scaleY;
    var x3 = (coords[p3] + context.offsetX) * context.scaleX;
    var y3 = (coords[p3 + 1] + context.offsetY) * context.scaleY;

    if (y1 >= y3) {
      return;
    }

    var c1r = colors[c1],
        c1g = colors[c1 + 1],
        c1b = colors[c1 + 2];
    var c2r = colors[c2],
        c2g = colors[c2 + 1],
        c2b = colors[c2 + 2];
    var c3r = colors[c3],
        c3g = colors[c3 + 1],
        c3b = colors[c3 + 2];
    var minY = Math.round(y1),
        maxY = Math.round(y3);
    var xa, car, cag, cab;
    var xb, cbr, cbg, cbb;

    for (var y = minY; y <= maxY; y++) {
      if (y < y2) {
        let k;

        if (y < y1) {
          k = 0;
        } else if (y1 === y2) {
          k = 1;
        } else {
          k = (y1 - y) / (y1 - y2);
        }

        xa = x1 - (x1 - x2) * k;
        car = c1r - (c1r - c2r) * k;
        cag = c1g - (c1g - c2g) * k;
        cab = c1b - (c1b - c2b) * k;
      } else {
        let k;

        if (y > y3) {
          k = 1;
        } else if (y2 === y3) {
          k = 0;
        } else {
          k = (y2 - y) / (y2 - y3);
        }

        xa = x2 - (x2 - x3) * k;
        car = c2r - (c2r - c3r) * k;
        cag = c2g - (c2g - c3g) * k;
        cab = c2b - (c2b - c3b) * k;
      }

      let k;

      if (y < y1) {
        k = 0;
      } else if (y > y3) {
        k = 1;
      } else {
        k = (y1 - y) / (y1 - y3);
      }

      xb = x1 - (x1 - x3) * k;
      cbr = c1r - (c1r - c3r) * k;
      cbg = c1g - (c1g - c3g) * k;
      cbb = c1b - (c1b - c3b) * k;
      var x1_ = Math.round(Math.min(xa, xb));
      var x2_ = Math.round(Math.max(xa, xb));
      var j = rowSize * y + x1_ * 4;

      for (var x = x1_; x <= x2_; x++) {
        k = (xa - x) / (xa - xb);

        if (k < 0) {
          k = 0;
        } else if (k > 1) {
          k = 1;
        }

        bytes[j++] = car - (car - cbr) * k | 0;
        bytes[j++] = cag - (cag - cbg) * k | 0;
        bytes[j++] = cab - (cab - cbb) * k | 0;
        bytes[j++] = 255;
      }
    }
  }

  function drawFigure(data, figure, context) {
    var ps = figure.coords;
    var cs = figure.colors;
    var i, ii;

    switch (figure.type) {
      case "lattice":
        var verticesPerRow = figure.verticesPerRow;
        var rows = Math.floor(ps.length / verticesPerRow) - 1;
        var cols = verticesPerRow - 1;

        for (i = 0; i < rows; i++) {
          var q = i * verticesPerRow;

          for (var j = 0; j < cols; j++, q++) {
            drawTriangle(data, context, ps[q], ps[q + 1], ps[q + verticesPerRow], cs[q], cs[q + 1], cs[q + verticesPerRow]);
            drawTriangle(data, context, ps[q + verticesPerRow + 1], ps[q + 1], ps[q + verticesPerRow], cs[q + verticesPerRow + 1], cs[q + 1], cs[q + verticesPerRow]);
          }
        }

        break;

      case "triangles":
        for (i = 0, ii = ps.length; i < ii; i += 3) {
          drawTriangle(data, context, ps[i], ps[i + 1], ps[i + 2], cs[i], cs[i + 1], cs[i + 2]);
        }

        break;

      default:
        throw new Error("illegal figure");
    }
  }

  function createMeshCanvas(bounds, combinesScale, coords, colors, figures, backgroundColor, cachedCanvases, webGLContext) {
    var EXPECTED_SCALE = 1.1;
    var MAX_PATTERN_SIZE = 3000;
    var BORDER_SIZE = 2;
    var offsetX = Math.floor(bounds[0]);
    var offsetY = Math.floor(bounds[1]);
    var boundsWidth = Math.ceil(bounds[2]) - offsetX;
    var boundsHeight = Math.ceil(bounds[3]) - offsetY;
    var width = Math.min(Math.ceil(Math.abs(boundsWidth * combinesScale[0] * EXPECTED_SCALE)), MAX_PATTERN_SIZE);
    var height = Math.min(Math.ceil(Math.abs(boundsHeight * combinesScale[1] * EXPECTED_SCALE)), MAX_PATTERN_SIZE);
    var scaleX = boundsWidth / width;
    var scaleY = boundsHeight / height;
    var context = {
      coords,
      colors,
      offsetX: -offsetX,
      offsetY: -offsetY,
      scaleX: 1 / scaleX,
      scaleY: 1 / scaleY
    };
    var paddedWidth = width + BORDER_SIZE * 2;
    var paddedHeight = height + BORDER_SIZE * 2;
    var canvas, tmpCanvas, i, ii;

    if (webGLContext.isEnabled) {
      canvas = webGLContext.drawFigures({
        width,
        height,
        backgroundColor,
        figures,
        context
      });
      tmpCanvas = cachedCanvases.getCanvas("mesh", paddedWidth, paddedHeight, false);
      tmpCanvas.context.drawImage(canvas, BORDER_SIZE, BORDER_SIZE);
      canvas = tmpCanvas.canvas;
    } else {
      tmpCanvas = cachedCanvases.getCanvas("mesh", paddedWidth, paddedHeight, false);
      var tmpCtx = tmpCanvas.context;
      var data = tmpCtx.createImageData(width, height);

      if (backgroundColor) {
        var bytes = data.data;

        for (i = 0, ii = bytes.length; i < ii; i += 4) {
          bytes[i] = backgroundColor[0];
          bytes[i + 1] = backgroundColor[1];
          bytes[i + 2] = backgroundColor[2];
          bytes[i + 3] = 255;
        }
      }

      for (i = 0; i < figures.length; i++) {
        drawFigure(data, figures[i], context);
      }

      tmpCtx.putImageData(data, BORDER_SIZE, BORDER_SIZE);
      canvas = tmpCanvas.canvas;
    }

    return {
      canvas,
      offsetX: offsetX - BORDER_SIZE * scaleX,
      offsetY: offsetY - BORDER_SIZE * scaleY,
      scaleX,
      scaleY
    };
  }

  return createMeshCanvas;
}();

ShadingIRs.Mesh = {
  fromIR: function Mesh_fromIR(raw) {
    var coords = raw[2];
    var colors = raw[3];
    var figures = raw[4];
    var bounds = raw[5];
    var matrix = raw[6];
    var bbox = raw[7];
    var background = raw[8];
    return {
      type: "Pattern",
      getPattern: function Mesh_getPattern(ctx, owner, shadingFill) {
        applyBoundingBox(ctx, bbox);
        var scale;

        if (shadingFill) {
          scale = _util.Util.singularValueDecompose2dScale(ctx.mozCurrentTransform);
        } else {
          scale = _util.Util.singularValueDecompose2dScale(owner.baseTransform);

          if (matrix) {
            var matrixScale = _util.Util.singularValueDecompose2dScale(matrix);

            scale = [scale[0] * matrixScale[0], scale[1] * matrixScale[1]];
          }
        }

        var temporaryPatternCanvas = createMeshCanvas(bounds, scale, coords, colors, figures, shadingFill ? null : background, owner.cachedCanvases, owner.webGLContext);

        if (!shadingFill) {
          ctx.setTransform.apply(ctx, owner.baseTransform);

          if (matrix) {
            ctx.transform.apply(ctx, matrix);
          }
        }

        ctx.translate(temporaryPatternCanvas.offsetX, temporaryPatternCanvas.offsetY);
        ctx.scale(temporaryPatternCanvas.scaleX, temporaryPatternCanvas.scaleY);
        return ctx.createPattern(temporaryPatternCanvas.canvas, "no-repeat");
      }
    };
  }
};
ShadingIRs.Dummy = {
  fromIR: function Dummy_fromIR() {
    return {
      type: "Pattern",
      getPattern: function Dummy_fromIR_getPattern() {
        return "hotpink";
      }
    };
  }
};

function getShadingPatternFromIR(raw) {
  var shadingIR = ShadingIRs[raw[0]];

  if (!shadingIR) {
    throw new Error(`Unknown IR type: ${raw[0]}`);
  }

  return shadingIR.fromIR(raw);
}

var TilingPattern = function TilingPatternClosure() {
  var PaintType = {
    COLORED: 1,
    UNCOLORED: 2
  };
  var MAX_PATTERN_SIZE = 3000;

  function TilingPattern(IR, color, ctx, canvasGraphicsFactory, baseTransform) {
    this.operatorList = IR[2];
    this.matrix = IR[3] || [1, 0, 0, 1, 0, 0];
    this.bbox = IR[4];
    this.xstep = IR[5];
    this.ystep = IR[6];
    this.paintType = IR[7];
    this.tilingType = IR[8];
    this.color = color;
    this.canvasGraphicsFactory = canvasGraphicsFactory;
    this.baseTransform = baseTransform;
    this.type = "Pattern";
    this.ctx = ctx;
  }

  TilingPattern.prototype = {
    createPatternCanvas: function TilinPattern_createPatternCanvas(owner) {
      var operatorList = this.operatorList;
      var bbox = this.bbox;
      var xstep = this.xstep;
      var ystep = this.ystep;
      var paintType = this.paintType;
      var tilingType = this.tilingType;
      var color = this.color;
      var canvasGraphicsFactory = this.canvasGraphicsFactory;
      (0, _util.info)("TilingType: " + tilingType);
      var x0 = bbox[0],
          y0 = bbox[1],
          x1 = bbox[2],
          y1 = bbox[3];

      var matrixScale = _util.Util.singularValueDecompose2dScale(this.matrix);

      var curMatrixScale = _util.Util.singularValueDecompose2dScale(this.baseTransform);

      var combinedScale = [matrixScale[0] * curMatrixScale[0], matrixScale[1] * curMatrixScale[1]];
      var dimx = this.getSizeAndScale(xstep, this.ctx.canvas.width, combinedScale[0]);
      var dimy = this.getSizeAndScale(ystep, this.ctx.canvas.height, combinedScale[1]);
      var tmpCanvas = owner.cachedCanvases.getCanvas("pattern", dimx.size, dimy.size, true);
      var tmpCtx = tmpCanvas.context;
      var graphics = canvasGraphicsFactory.createCanvasGraphics(tmpCtx);
      graphics.groupLevel = owner.groupLevel;
      this.setFillAndStrokeStyleToContext(graphics, paintType, color);
      graphics.transform(dimx.scale, 0, 0, dimy.scale, 0, 0);
      graphics.transform(1, 0, 0, 1, -x0, -y0);
      this.clipBbox(graphics, bbox, x0, y0, x1, y1);
      graphics.executeOperatorList(operatorList);
      this.ctx.transform(1, 0, 0, 1, x0, y0);
      this.ctx.scale(1 / dimx.scale, 1 / dimy.scale);
      return tmpCanvas.canvas;
    },
    getSizeAndScale: function TilingPattern_getSizeAndScale(step, realOutputSize, scale) {
      step = Math.abs(step);
      var maxSize = Math.max(MAX_PATTERN_SIZE, realOutputSize);
      var size = Math.ceil(step * scale);

      if (size >= maxSize) {
        size = maxSize;
      } else {
        scale = size / step;
      }

      return {
        scale,
        size
      };
    },
    clipBbox: function clipBbox(graphics, bbox, x0, y0, x1, y1) {
      if (Array.isArray(bbox) && bbox.length === 4) {
        var bboxWidth = x1 - x0;
        var bboxHeight = y1 - y0;
        graphics.ctx.rect(x0, y0, bboxWidth, bboxHeight);
        graphics.clip();
        graphics.endPath();
      }
    },
    setFillAndStrokeStyleToContext: function setFillAndStrokeStyleToContext(graphics, paintType, color) {
      const context = graphics.ctx,
            current = graphics.current;

      switch (paintType) {
        case PaintType.COLORED:
          var ctx = this.ctx;
          context.fillStyle = ctx.fillStyle;
          context.strokeStyle = ctx.strokeStyle;
          current.fillColor = ctx.fillStyle;
          current.strokeColor = ctx.strokeStyle;
          break;

        case PaintType.UNCOLORED:
          var cssColor = _util.Util.makeCssRgb(color[0], color[1], color[2]);

          context.fillStyle = cssColor;
          context.strokeStyle = cssColor;
          current.fillColor = cssColor;
          current.strokeColor = cssColor;
          break;

        default:
          throw new _util.FormatError(`Unsupported paint type: ${paintType}`);
      }
    },
    getPattern: function TilingPattern_getPattern(ctx, owner) {
      ctx = this.ctx;
      ctx.setTransform.apply(ctx, this.baseTransform);
      ctx.transform.apply(ctx, this.matrix);
      var temporaryPatternCanvas = this.createPatternCanvas(owner);
      return ctx.createPattern(temporaryPatternCanvas, "repeat");
    }
  };
  return TilingPattern;
}();

exports.TilingPattern = TilingPattern;

/***/ }),
/* 10 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GlobalWorkerOptions = void 0;
const GlobalWorkerOptions = Object.create(null);
exports.GlobalWorkerOptions = GlobalWorkerOptions;
GlobalWorkerOptions.workerPort = GlobalWorkerOptions.workerPort === undefined ? null : GlobalWorkerOptions.workerPort;
GlobalWorkerOptions.workerSrc = GlobalWorkerOptions.workerSrc === undefined ? "" : GlobalWorkerOptions.workerSrc;

/***/ }),
/* 11 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MessageHandler = void 0;

var _util = __w_pdfjs_require__(1);

const CallbackKind = {
  UNKNOWN: 0,
  DATA: 1,
  ERROR: 2
};
const StreamKind = {
  UNKNOWN: 0,
  CANCEL: 1,
  CANCEL_COMPLETE: 2,
  CLOSE: 3,
  ENQUEUE: 4,
  ERROR: 5,
  PULL: 6,
  PULL_COMPLETE: 7,
  START_COMPLETE: 8
};

function wrapReason(reason) {
  if (typeof reason !== "object" || reason === null) {
    return reason;
  }

  switch (reason.name) {
    case "AbortException":
      return new _util.AbortException(reason.message);

    case "MissingPDFException":
      return new _util.MissingPDFException(reason.message);

    case "UnexpectedResponseException":
      return new _util.UnexpectedResponseException(reason.message, reason.status);

    case "UnknownErrorException":
      return new _util.UnknownErrorException(reason.message, reason.details);

    default:
      return new _util.UnknownErrorException(reason.message, reason.toString());
  }
}

class MessageHandler {
  constructor(sourceName, targetName, comObj) {
    this.sourceName = sourceName;
    this.targetName = targetName;
    this.comObj = comObj;
    this.callbackId = 1;
    this.streamId = 1;
    this.postMessageTransfers = true;
    this.streamSinks = Object.create(null);
    this.streamControllers = Object.create(null);
    this.callbackCapabilities = Object.create(null);
    this.actionHandler = Object.create(null);

    this._onComObjOnMessage = event => {
      const data = event.data;

      if (data.targetName !== this.sourceName) {
        return;
      }

      if (data.stream) {
        this._processStreamMessage(data);

        return;
      }

      if (data.callback) {
        const callbackId = data.callbackId;
        const capability = this.callbackCapabilities[callbackId];

        if (!capability) {
          throw new Error(`Cannot resolve callback ${callbackId}`);
        }

        delete this.callbackCapabilities[callbackId];

        if (data.callback === CallbackKind.DATA) {
          capability.resolve(data.data);
        } else if (data.callback === CallbackKind.ERROR) {
          capability.reject(wrapReason(data.reason));
        } else {
          throw new Error("Unexpected callback case");
        }

        return;
      }

      const action = this.actionHandler[data.action];

      if (!action) {
        throw new Error(`Unknown action from worker: ${data.action}`);
      }

      if (data.callbackId) {
        const sourceName = this.sourceName;
        const targetName = data.sourceName;
        new Promise(function (resolve) {
          resolve(action(data.data));
        }).then(function (result) {
          comObj.postMessage({
            sourceName,
            targetName,
            callback: CallbackKind.DATA,
            callbackId: data.callbackId,
            data: result
          });
        }, function (reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            callback: CallbackKind.ERROR,
            callbackId: data.callbackId,
            reason: wrapReason(reason)
          });
        });
        return;
      }

      if (data.streamId) {
        this._createStreamSink(data);

        return;
      }

      action(data.data);
    };

    comObj.addEventListener("message", this._onComObjOnMessage);
  }

  on(actionName, handler) {
    const ah = this.actionHandler;

    if (ah[actionName]) {
      throw new Error(`There is already an actionName called "${actionName}"`);
    }

    ah[actionName] = handler;
  }

  send(actionName, data, transfers) {
    this._postMessage({
      sourceName: this.sourceName,
      targetName: this.targetName,
      action: actionName,
      data
    }, transfers);
  }

  sendWithPromise(actionName, data, transfers) {
    const callbackId = this.callbackId++;
    const capability = (0, _util.createPromiseCapability)();
    this.callbackCapabilities[callbackId] = capability;

    try {
      this._postMessage({
        sourceName: this.sourceName,
        targetName: this.targetName,
        action: actionName,
        callbackId,
        data
      }, transfers);
    } catch (ex) {
      capability.reject(ex);
    }

    return capability.promise;
  }

  sendWithStream(actionName, data, queueingStrategy, transfers) {
    const streamId = this.streamId++;
    const sourceName = this.sourceName;
    const targetName = this.targetName;
    const comObj = this.comObj;
    return new ReadableStream({
      start: controller => {
        const startCapability = (0, _util.createPromiseCapability)();
        this.streamControllers[streamId] = {
          controller,
          startCall: startCapability,
          pullCall: null,
          cancelCall: null,
          isClosed: false
        };

        this._postMessage({
          sourceName,
          targetName,
          action: actionName,
          streamId,
          data,
          desiredSize: controller.desiredSize
        }, transfers);

        return startCapability.promise;
      },
      pull: controller => {
        const pullCapability = (0, _util.createPromiseCapability)();
        this.streamControllers[streamId].pullCall = pullCapability;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.PULL,
          streamId,
          desiredSize: controller.desiredSize
        });
        return pullCapability.promise;
      },
      cancel: reason => {
        (0, _util.assert)(reason instanceof Error, "cancel must have a valid reason");
        const cancelCapability = (0, _util.createPromiseCapability)();
        this.streamControllers[streamId].cancelCall = cancelCapability;
        this.streamControllers[streamId].isClosed = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.CANCEL,
          streamId,
          reason: wrapReason(reason)
        });
        return cancelCapability.promise;
      }
    }, queueingStrategy);
  }

  _createStreamSink(data) {
    const self = this;
    const action = this.actionHandler[data.action];
    const streamId = data.streamId;
    const sourceName = this.sourceName;
    const targetName = data.sourceName;
    const comObj = this.comObj;
    const streamSink = {
      enqueue(chunk, size = 1, transfers) {
        if (this.isCancelled) {
          return;
        }

        const lastDesiredSize = this.desiredSize;
        this.desiredSize -= size;

        if (lastDesiredSize > 0 && this.desiredSize <= 0) {
          this.sinkCapability = (0, _util.createPromiseCapability)();
          this.ready = this.sinkCapability.promise;
        }

        self._postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ENQUEUE,
          streamId,
          chunk
        }, transfers);
      },

      close() {
        if (this.isCancelled) {
          return;
        }

        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.CLOSE,
          streamId
        });
        delete self.streamSinks[streamId];
      },

      error(reason) {
        (0, _util.assert)(reason instanceof Error, "error must have a valid reason");

        if (this.isCancelled) {
          return;
        }

        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ERROR,
          streamId,
          reason: wrapReason(reason)
        });
      },

      sinkCapability: (0, _util.createPromiseCapability)(),
      onPull: null,
      onCancel: null,
      isCancelled: false,
      desiredSize: data.desiredSize,
      ready: null
    };
    streamSink.sinkCapability.resolve();
    streamSink.ready = streamSink.sinkCapability.promise;
    this.streamSinks[streamId] = streamSink;
    new Promise(function (resolve) {
      resolve(action(data.data, streamSink));
    }).then(function () {
      comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        success: true
      });
    }, function (reason) {
      comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        reason: wrapReason(reason)
      });
    });
  }

  _processStreamMessage(data) {
    const streamId = data.streamId;
    const sourceName = this.sourceName;
    const targetName = data.sourceName;
    const comObj = this.comObj;

    switch (data.stream) {
      case StreamKind.START_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].startCall.resolve();
        } else {
          this.streamControllers[streamId].startCall.reject(wrapReason(data.reason));
        }

        break;

      case StreamKind.PULL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].pullCall.resolve();
        } else {
          this.streamControllers[streamId].pullCall.reject(wrapReason(data.reason));
        }

        break;

      case StreamKind.PULL:
        if (!this.streamSinks[streamId]) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            success: true
          });
          break;
        }

        if (this.streamSinks[streamId].desiredSize <= 0 && data.desiredSize > 0) {
          this.streamSinks[streamId].sinkCapability.resolve();
        }

        this.streamSinks[streamId].desiredSize = data.desiredSize;
        const {
          onPull
        } = this.streamSinks[data.streamId];
        new Promise(function (resolve) {
          resolve(onPull && onPull());
        }).then(function () {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            success: true
          });
        }, function (reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            reason: wrapReason(reason)
          });
        });
        break;

      case StreamKind.ENQUEUE:
        (0, _util.assert)(this.streamControllers[streamId], "enqueue should have stream controller");

        if (this.streamControllers[streamId].isClosed) {
          break;
        }

        this.streamControllers[streamId].controller.enqueue(data.chunk);
        break;

      case StreamKind.CLOSE:
        (0, _util.assert)(this.streamControllers[streamId], "close should have stream controller");

        if (this.streamControllers[streamId].isClosed) {
          break;
        }

        this.streamControllers[streamId].isClosed = true;
        this.streamControllers[streamId].controller.close();

        this._deleteStreamController(streamId);

        break;

      case StreamKind.ERROR:
        (0, _util.assert)(this.streamControllers[streamId], "error should have stream controller");
        this.streamControllers[streamId].controller.error(wrapReason(data.reason));

        this._deleteStreamController(streamId);

        break;

      case StreamKind.CANCEL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].cancelCall.resolve();
        } else {
          this.streamControllers[streamId].cancelCall.reject(wrapReason(data.reason));
        }

        this._deleteStreamController(streamId);

        break;

      case StreamKind.CANCEL:
        if (!this.streamSinks[streamId]) {
          break;
        }

        const {
          onCancel
        } = this.streamSinks[data.streamId];
        new Promise(function (resolve) {
          resolve(onCancel && onCancel(wrapReason(data.reason)));
        }).then(function () {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.CANCEL_COMPLETE,
            streamId,
            success: true
          });
        }, function (reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.CANCEL_COMPLETE,
            streamId,
            reason: wrapReason(reason)
          });
        });
        this.streamSinks[streamId].sinkCapability.reject(wrapReason(data.reason));
        this.streamSinks[streamId].isCancelled = true;
        delete this.streamSinks[streamId];
        break;

      default:
        throw new Error("Unexpected stream case");
    }
  }

  async _deleteStreamController(streamId) {
    await Promise.allSettled([this.streamControllers[streamId].startCall, this.streamControllers[streamId].pullCall, this.streamControllers[streamId].cancelCall].map(function (capability) {
      return capability && capability.promise;
    }));
    delete this.streamControllers[streamId];
  }

  _postMessage(message, transfers) {
    if (transfers && this.postMessageTransfers) {
      this.comObj.postMessage(message, transfers);
    } else {
      this.comObj.postMessage(message);
    }
  }

  destroy() {
    this.comObj.removeEventListener("message", this._onComObjOnMessage);
  }

}

exports.MessageHandler = MessageHandler;

/***/ }),
/* 12 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Metadata = void 0;

var _util = __w_pdfjs_require__(1);

var _xml_parser = __w_pdfjs_require__(13);

class Metadata {
  constructor(data) {
    (0, _util.assert)(typeof data === "string", "Metadata: input is not a string");
    data = this._repair(data);
    const parser = new _xml_parser.SimpleXMLParser();
    const xmlDocument = parser.parseFromString(data);
    this._metadataMap = new Map();

    if (xmlDocument) {
      this._parse(xmlDocument);
    }
  }

  _repair(data) {
    return data.replace(/^[^<]+/, "").replace(/>\\376\\377([^<]+)/g, function (all, codes) {
      const bytes = codes.replace(/\\([0-3])([0-7])([0-7])/g, function (code, d1, d2, d3) {
        return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
      }).replace(/&(amp|apos|gt|lt|quot);/g, function (str, name) {
        switch (name) {
          case "amp":
            return "&";

          case "apos":
            return "'";

          case "gt":
            return ">";

          case "lt":
            return "<";

          case "quot":
            return '"';
        }

        throw new Error(`_repair: ${name} isn't defined.`);
      });
      let chars = "";

      for (let i = 0, ii = bytes.length; i < ii; i += 2) {
        const code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);

        if (code >= 32 && code < 127 && code !== 60 && code !== 62 && code !== 38) {
          chars += String.fromCharCode(code);
        } else {
          chars += "&#x" + (0x10000 + code).toString(16).substring(1) + ";";
        }
      }

      return ">" + chars;
    });
  }

  _parse(xmlDocument) {
    let rdf = xmlDocument.documentElement;

    if (rdf.nodeName.toLowerCase() !== "rdf:rdf") {
      rdf = rdf.firstChild;

      while (rdf && rdf.nodeName.toLowerCase() !== "rdf:rdf") {
        rdf = rdf.nextSibling;
      }
    }

    const nodeName = rdf ? rdf.nodeName.toLowerCase() : null;

    if (!rdf || nodeName !== "rdf:rdf" || !rdf.hasChildNodes()) {
      return;
    }

    const children = rdf.childNodes;

    for (let i = 0, ii = children.length; i < ii; i++) {
      const desc = children[i];

      if (desc.nodeName.toLowerCase() !== "rdf:description") {
        continue;
      }

      for (let j = 0, jj = desc.childNodes.length; j < jj; j++) {
        if (desc.childNodes[j].nodeName.toLowerCase() !== "#text") {
          const entry = desc.childNodes[j];
          const name = entry.nodeName.toLowerCase();

          this._metadataMap.set(name, entry.textContent.trim());
        }
      }
    }
  }

  get(name) {
    return this._metadataMap.has(name) ? this._metadataMap.get(name) : null;
  }

  getAll() {
    const obj = Object.create(null);

    for (const [key, value] of this._metadataMap) {
      obj[key] = value;
    }

    return obj;
  }

  has(name) {
    return this._metadataMap.has(name);
  }

}

exports.Metadata = Metadata;

/***/ }),
/* 13 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SimpleXMLParser = void 0;
const XMLParserErrorCode = {
  NoError: 0,
  EndOfDocument: -1,
  UnterminatedCdat: -2,
  UnterminatedXmlDeclaration: -3,
  UnterminatedDoctypeDeclaration: -4,
  UnterminatedComment: -5,
  MalformedElement: -6,
  OutOfMemory: -7,
  UnterminatedAttributeValue: -8,
  UnterminatedElement: -9,
  ElementNeverBegun: -10
};

function isWhitespace(s, index) {
  const ch = s[index];
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}

function isWhitespaceString(s) {
  for (let i = 0, ii = s.length; i < ii; i++) {
    if (!isWhitespace(s, i)) {
      return false;
    }
  }

  return true;
}

class XMLParserBase {
  _resolveEntities(s) {
    return s.replace(/&([^;]+);/g, (all, entity) => {
      if (entity.substring(0, 2) === "#x") {
        return String.fromCharCode(parseInt(entity.substring(2), 16));
      } else if (entity.substring(0, 1) === "#") {
        return String.fromCharCode(parseInt(entity.substring(1), 10));
      }

      switch (entity) {
        case "lt":
          return "<";

        case "gt":
          return ">";

        case "amp":
          return "&";

        case "quot":
          return '"';
      }

      return this.onResolveEntity(entity);
    });
  }

  _parseContent(s, start) {
    const attributes = [];
    let pos = start;

    function skipWs() {
      while (pos < s.length && isWhitespace(s, pos)) {
        ++pos;
      }
    }

    while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== ">" && s[pos] !== "/") {
      ++pos;
    }

    const name = s.substring(start, pos);
    skipWs();

    while (pos < s.length && s[pos] !== ">" && s[pos] !== "/" && s[pos] !== "?") {
      skipWs();
      let attrName = "",
          attrValue = "";

      while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== "=") {
        attrName += s[pos];
        ++pos;
      }

      skipWs();

      if (s[pos] !== "=") {
        return null;
      }

      ++pos;
      skipWs();
      const attrEndChar = s[pos];

      if (attrEndChar !== '"' && attrEndChar !== "'") {
        return null;
      }

      const attrEndIndex = s.indexOf(attrEndChar, ++pos);

      if (attrEndIndex < 0) {
        return null;
      }

      attrValue = s.substring(pos, attrEndIndex);
      attributes.push({
        name: attrName,
        value: this._resolveEntities(attrValue)
      });
      pos = attrEndIndex + 1;
      skipWs();
    }

    return {
      name,
      attributes,
      parsed: pos - start
    };
  }

  _parseProcessingInstruction(s, start) {
    let pos = start;

    function skipWs() {
      while (pos < s.length && isWhitespace(s, pos)) {
        ++pos;
      }
    }

    while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== ">" && s[pos] !== "/") {
      ++pos;
    }

    const name = s.substring(start, pos);
    skipWs();
    const attrStart = pos;

    while (pos < s.length && (s[pos] !== "?" || s[pos + 1] !== ">")) {
      ++pos;
    }

    const value = s.substring(attrStart, pos);
    return {
      name,
      value,
      parsed: pos - start
    };
  }

  parseXml(s) {
    let i = 0;

    while (i < s.length) {
      const ch = s[i];
      let j = i;

      if (ch === "<") {
        ++j;
        const ch2 = s[j];
        let q;

        switch (ch2) {
          case "/":
            ++j;
            q = s.indexOf(">", j);

            if (q < 0) {
              this.onError(XMLParserErrorCode.UnterminatedElement);
              return;
            }

            this.onEndElement(s.substring(j, q));
            j = q + 1;
            break;

          case "?":
            ++j;

            const pi = this._parseProcessingInstruction(s, j);

            if (s.substring(j + pi.parsed, j + pi.parsed + 2) !== "?>") {
              this.onError(XMLParserErrorCode.UnterminatedXmlDeclaration);
              return;
            }

            this.onPi(pi.name, pi.value);
            j += pi.parsed + 2;
            break;

          case "!":
            if (s.substring(j + 1, j + 3) === "--") {
              q = s.indexOf("-->", j + 3);

              if (q < 0) {
                this.onError(XMLParserErrorCode.UnterminatedComment);
                return;
              }

              this.onComment(s.substring(j + 3, q));
              j = q + 3;
            } else if (s.substring(j + 1, j + 8) === "[CDATA[") {
              q = s.indexOf("]]>", j + 8);

              if (q < 0) {
                this.onError(XMLParserErrorCode.UnterminatedCdat);
                return;
              }

              this.onCdata(s.substring(j + 8, q));
              j = q + 3;
            } else if (s.substring(j + 1, j + 8) === "DOCTYPE") {
              const q2 = s.indexOf("[", j + 8);
              let complexDoctype = false;
              q = s.indexOf(">", j + 8);

              if (q < 0) {
                this.onError(XMLParserErrorCode.UnterminatedDoctypeDeclaration);
                return;
              }

              if (q2 > 0 && q > q2) {
                q = s.indexOf("]>", j + 8);

                if (q < 0) {
                  this.onError(XMLParserErrorCode.UnterminatedDoctypeDeclaration);
                  return;
                }

                complexDoctype = true;
              }

              const doctypeContent = s.substring(j + 8, q + (complexDoctype ? 1 : 0));
              this.onDoctype(doctypeContent);
              j = q + (complexDoctype ? 2 : 1);
            } else {
              this.onError(XMLParserErrorCode.MalformedElement);
              return;
            }

            break;

          default:
            const content = this._parseContent(s, j);

            if (content === null) {
              this.onError(XMLParserErrorCode.MalformedElement);
              return;
            }

            let isClosed = false;

            if (s.substring(j + content.parsed, j + content.parsed + 2) === "/>") {
              isClosed = true;
            } else if (s.substring(j + content.parsed, j + content.parsed + 1) !== ">") {
              this.onError(XMLParserErrorCode.UnterminatedElement);
              return;
            }

            this.onBeginElement(content.name, content.attributes, isClosed);
            j += content.parsed + (isClosed ? 2 : 1);
            break;
        }
      } else {
        while (j < s.length && s[j] !== "<") {
          j++;
        }

        const text = s.substring(i, j);
        this.onText(this._resolveEntities(text));
      }

      i = j;
    }
  }

  onResolveEntity(name) {
    return `&${name};`;
  }

  onPi(name, value) {}

  onComment(text) {}

  onCdata(text) {}

  onDoctype(doctypeContent) {}

  onText(text) {}

  onBeginElement(name, attributes, isEmpty) {}

  onEndElement(name) {}

  onError(code) {}

}

class SimpleDOMNode {
  constructor(nodeName, nodeValue) {
    this.nodeName = nodeName;
    this.nodeValue = nodeValue;
    Object.defineProperty(this, "parentNode", {
      value: null,
      writable: true
    });
  }

  get firstChild() {
    return this.childNodes && this.childNodes[0];
  }

  get nextSibling() {
    const childNodes = this.parentNode.childNodes;

    if (!childNodes) {
      return undefined;
    }

    const index = childNodes.indexOf(this);

    if (index === -1) {
      return undefined;
    }

    return childNodes[index + 1];
  }

  get textContent() {
    if (!this.childNodes) {
      return this.nodeValue || "";
    }

    return this.childNodes.map(function (child) {
      return child.textContent;
    }).join("");
  }

  hasChildNodes() {
    return this.childNodes && this.childNodes.length > 0;
  }

}

class SimpleXMLParser extends XMLParserBase {
  constructor() {
    super();
    this._currentFragment = null;
    this._stack = null;
    this._errorCode = XMLParserErrorCode.NoError;
  }

  parseFromString(data) {
    this._currentFragment = [];
    this._stack = [];
    this._errorCode = XMLParserErrorCode.NoError;
    this.parseXml(data);

    if (this._errorCode !== XMLParserErrorCode.NoError) {
      return undefined;
    }

    const [documentElement] = this._currentFragment;

    if (!documentElement) {
      return undefined;
    }

    return {
      documentElement
    };
  }

  onResolveEntity(name) {
    switch (name) {
      case "apos":
        return "'";
    }

    return super.onResolveEntity(name);
  }

  onText(text) {
    if (isWhitespaceString(text)) {
      return;
    }

    const node = new SimpleDOMNode("#text", text);

    this._currentFragment.push(node);
  }

  onCdata(text) {
    const node = new SimpleDOMNode("#text", text);

    this._currentFragment.push(node);
  }

  onBeginElement(name, attributes, isEmpty) {
    const node = new SimpleDOMNode(name);
    node.childNodes = [];

    this._currentFragment.push(node);

    if (isEmpty) {
      return;
    }

    this._stack.push(this._currentFragment);

    this._currentFragment = node.childNodes;
  }

  onEndElement(name) {
    this._currentFragment = this._stack.pop() || [];
    const lastElement = this._currentFragment[this._currentFragment.length - 1];

    if (!lastElement) {
      return;
    }

    for (let i = 0, ii = lastElement.childNodes.length; i < ii; i++) {
      lastElement.childNodes[i].parentNode = lastElement;
    }
  }

  onError(code) {
    this._errorCode = code;
  }

}

exports.SimpleXMLParser = SimpleXMLParser;

/***/ }),
/* 14 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFDataTransportStream = void 0;

var _util = __w_pdfjs_require__(1);

class PDFDataTransportStream {
  constructor(params, pdfDataRangeTransport) {
    (0, _util.assert)(pdfDataRangeTransport);
    this._queuedChunks = [];
    this._progressiveDone = params.progressiveDone || false;
    const initialData = params.initialData;

    if (initialData && initialData.length > 0) {
      const buffer = new Uint8Array(initialData).buffer;

      this._queuedChunks.push(buffer);
    }

    this._pdfDataRangeTransport = pdfDataRangeTransport;
    this._isStreamingSupported = !params.disableStream;
    this._isRangeSupported = !params.disableRange;
    this._contentLength = params.length;
    this._fullRequestReader = null;
    this._rangeReaders = [];

    this._pdfDataRangeTransport.addRangeListener((begin, chunk) => {
      this._onReceiveData({
        begin,
        chunk
      });
    });

    this._pdfDataRangeTransport.addProgressListener((loaded, total) => {
      this._onProgress({
        loaded,
        total
      });
    });

    this._pdfDataRangeTransport.addProgressiveReadListener(chunk => {
      this._onReceiveData({
        chunk
      });
    });

    this._pdfDataRangeTransport.addProgressiveDoneListener(() => {
      this._onProgressiveDone();
    });

    this._pdfDataRangeTransport.transportReady();
  }

  _onReceiveData(args) {
    const buffer = new Uint8Array(args.chunk).buffer;

    if (args.begin === undefined) {
      if (this._fullRequestReader) {
        this._fullRequestReader._enqueue(buffer);
      } else {
        this._queuedChunks.push(buffer);
      }
    } else {
      const found = this._rangeReaders.some(function (rangeReader) {
        if (rangeReader._begin !== args.begin) {
          return false;
        }

        rangeReader._enqueue(buffer);

        return true;
      });

      (0, _util.assert)(found);
    }
  }

  get _progressiveDataLength() {
    return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
  }

  _onProgress(evt) {
    if (evt.total === undefined) {
      const firstReader = this._rangeReaders[0];

      if (firstReader && firstReader.onProgress) {
        firstReader.onProgress({
          loaded: evt.loaded
        });
      }
    } else {
      const fullReader = this._fullRequestReader;

      if (fullReader && fullReader.onProgress) {
        fullReader.onProgress({
          loaded: evt.loaded,
          total: evt.total
        });
      }
    }
  }

  _onProgressiveDone() {
    if (this._fullRequestReader) {
      this._fullRequestReader.progressiveDone();
    }

    this._progressiveDone = true;
  }

  _removeRangeReader(reader) {
    const i = this._rangeReaders.indexOf(reader);

    if (i >= 0) {
      this._rangeReaders.splice(i, 1);
    }
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    const queuedChunks = this._queuedChunks;
    this._queuedChunks = null;
    return new PDFDataTransportStreamReader(this, queuedChunks, this._progressiveDone);
  }

  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }

    const reader = new PDFDataTransportStreamRangeReader(this, begin, end);

    this._pdfDataRangeTransport.requestDataRange(begin, end);

    this._rangeReaders.push(reader);

    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeReaders.slice(0);

    readers.forEach(function (rangeReader) {
      rangeReader.cancel(reason);
    });

    this._pdfDataRangeTransport.abort();
  }

}

exports.PDFDataTransportStream = PDFDataTransportStream;

class PDFDataTransportStreamReader {
  constructor(stream, queuedChunks, progressiveDone = false) {
    this._stream = stream;
    this._done = progressiveDone || false;
    this._filename = null;
    this._queuedChunks = queuedChunks || [];
    this._loaded = 0;

    for (const chunk of this._queuedChunks) {
      this._loaded += chunk.byteLength;
    }

    this._requests = [];
    this._headersReady = Promise.resolve();
    stream._fullRequestReader = this;
    this.onProgress = null;
  }

  _enqueue(chunk) {
    if (this._done) {
      return;
    }

    if (this._requests.length > 0) {
      const requestCapability = this._requests.shift();

      requestCapability.resolve({
        value: chunk,
        done: false
      });
    } else {
      this._queuedChunks.push(chunk);
    }

    this._loaded += chunk.byteLength;
  }

  get headersReady() {
    return this._headersReady;
  }

  get filename() {
    return this._filename;
  }

  get isRangeSupported() {
    return this._stream._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._stream._isStreamingSupported;
  }

  get contentLength() {
    return this._stream._contentLength;
  }

  async read() {
    if (this._queuedChunks.length > 0) {
      const chunk = this._queuedChunks.shift();

      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];
  }

  progressiveDone() {
    if (this._done) {
      return;
    }

    this._done = true;
  }

}

class PDFDataTransportStreamRangeReader {
  constructor(stream, begin, end) {
    this._stream = stream;
    this._begin = begin;
    this._end = end;
    this._queuedChunk = null;
    this._requests = [];
    this._done = false;
    this.onProgress = null;
  }

  _enqueue(chunk) {
    if (this._done) {
      return;
    }

    if (this._requests.length === 0) {
      this._queuedChunk = chunk;
    } else {
      const requestsCapability = this._requests.shift();

      requestsCapability.resolve({
        value: chunk,
        done: false
      });

      this._requests.forEach(function (requestCapability) {
        requestCapability.resolve({
          value: undefined,
          done: true
        });
      });

      this._requests = [];
    }

    this._done = true;

    this._stream._removeRangeReader(this);
  }

  get isStreamingSupported() {
    return false;
  }

  async read() {
    if (this._queuedChunk) {
      const chunk = this._queuedChunk;
      this._queuedChunk = null;
      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];

    this._stream._removeRangeReader(this);
  }

}

/***/ }),
/* 15 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WebGLContext = void 0;

var _util = __w_pdfjs_require__(1);

class WebGLContext {
  constructor({
    enable = false
  }) {
    this._enabled = enable === true;
  }

  get isEnabled() {
    let enabled = this._enabled;

    if (enabled) {
      enabled = WebGLUtils.tryInitGL();
    }

    return (0, _util.shadow)(this, "isEnabled", enabled);
  }

  composeSMask({
    layer,
    mask,
    properties
  }) {
    return WebGLUtils.composeSMask(layer, mask, properties);
  }

  drawFigures({
    width,
    height,
    backgroundColor,
    figures,
    context
  }) {
    return WebGLUtils.drawFigures(width, height, backgroundColor, figures, context);
  }

  clear() {
    WebGLUtils.cleanup();
  }

}

exports.WebGLContext = WebGLContext;

var WebGLUtils = function WebGLUtilsClosure() {
  function loadShader(gl, code, shaderType) {
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

    if (!compiled) {
      var errorMsg = gl.getShaderInfoLog(shader);
      throw new Error("Error during shader compilation: " + errorMsg);
    }

    return shader;
  }

  function createVertexShader(gl, code) {
    return loadShader(gl, code, gl.VERTEX_SHADER);
  }

  function createFragmentShader(gl, code) {
    return loadShader(gl, code, gl.FRAGMENT_SHADER);
  }

  function createProgram(gl, shaders) {
    var program = gl.createProgram();

    for (var i = 0, ii = shaders.length; i < ii; ++i) {
      gl.attachShader(program, shaders[i]);
    }

    gl.linkProgram(program);
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);

    if (!linked) {
      var errorMsg = gl.getProgramInfoLog(program);
      throw new Error("Error during program linking: " + errorMsg);
    }

    return program;
  }

  function createTexture(gl, image, textureId) {
    gl.activeTexture(textureId);
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  var currentGL, currentCanvas;

  function generateGL() {
    if (currentGL) {
      return;
    }

    currentCanvas = document.createElement("canvas");
    currentGL = currentCanvas.getContext("webgl", {
      premultipliedalpha: false
    });
  }

  var smaskVertexShaderCode = "\
  attribute vec2 a_position;                                    \
  attribute vec2 a_texCoord;                                    \
                                                                \
  uniform vec2 u_resolution;                                    \
                                                                \
  varying vec2 v_texCoord;                                      \
                                                                \
  void main() {                                                 \
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;   \
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);          \
                                                                \
    v_texCoord = a_texCoord;                                    \
  }                                                             ";
  var smaskFragmentShaderCode = "\
  precision mediump float;                                      \
                                                                \
  uniform vec4 u_backdrop;                                      \
  uniform int u_subtype;                                        \
  uniform sampler2D u_image;                                    \
  uniform sampler2D u_mask;                                     \
                                                                \
  varying vec2 v_texCoord;                                      \
                                                                \
  void main() {                                                 \
    vec4 imageColor = texture2D(u_image, v_texCoord);           \
    vec4 maskColor = texture2D(u_mask, v_texCoord);             \
    if (u_backdrop.a > 0.0) {                                   \
      maskColor.rgb = maskColor.rgb * maskColor.a +             \
                      u_backdrop.rgb * (1.0 - maskColor.a);     \
    }                                                           \
    float lum;                                                  \
    if (u_subtype == 0) {                                       \
      lum = maskColor.a;                                        \
    } else {                                                    \
      lum = maskColor.r * 0.3 + maskColor.g * 0.59 +            \
            maskColor.b * 0.11;                                 \
    }                                                           \
    imageColor.a *= lum;                                        \
    imageColor.rgb *= imageColor.a;                             \
    gl_FragColor = imageColor;                                  \
  }                                                             ";
  var smaskCache = null;

  function initSmaskGL() {
    var canvas, gl;
    generateGL();
    canvas = currentCanvas;
    currentCanvas = null;
    gl = currentGL;
    currentGL = null;
    var vertexShader = createVertexShader(gl, smaskVertexShaderCode);
    var fragmentShader = createFragmentShader(gl, smaskFragmentShaderCode);
    var program = createProgram(gl, [vertexShader, fragmentShader]);
    gl.useProgram(program);
    var cache = {};
    cache.gl = gl;
    cache.canvas = canvas;
    cache.resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    cache.positionLocation = gl.getAttribLocation(program, "a_position");
    cache.backdropLocation = gl.getUniformLocation(program, "u_backdrop");
    cache.subtypeLocation = gl.getUniformLocation(program, "u_subtype");
    var texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    var texLayerLocation = gl.getUniformLocation(program, "u_image");
    var texMaskLocation = gl.getUniformLocation(program, "u_mask");
    var texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(texLayerLocation, 0);
    gl.uniform1i(texMaskLocation, 1);
    smaskCache = cache;
  }

  function composeSMask(layer, mask, properties) {
    var width = layer.width,
        height = layer.height;

    if (!smaskCache) {
      initSmaskGL();
    }

    var cache = smaskCache,
        canvas = cache.canvas,
        gl = cache.gl;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(cache.resolutionLocation, width, height);

    if (properties.backdrop) {
      gl.uniform4f(cache.resolutionLocation, properties.backdrop[0], properties.backdrop[1], properties.backdrop[2], 1);
    } else {
      gl.uniform4f(cache.resolutionLocation, 0, 0, 0, 0);
    }

    gl.uniform1i(cache.subtypeLocation, properties.subtype === "Luminosity" ? 1 : 0);
    var texture = createTexture(gl, layer, gl.TEXTURE0);
    var maskTexture = createTexture(gl, mask, gl.TEXTURE1);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, width, 0, 0, height, 0, height, width, 0, width, height]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.positionLocation);
    gl.vertexAttribPointer(cache.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    gl.deleteTexture(texture);
    gl.deleteTexture(maskTexture);
    gl.deleteBuffer(buffer);
    return canvas;
  }

  var figuresVertexShaderCode = "\
  attribute vec2 a_position;                                    \
  attribute vec3 a_color;                                       \
                                                                \
  uniform vec2 u_resolution;                                    \
  uniform vec2 u_scale;                                         \
  uniform vec2 u_offset;                                        \
                                                                \
  varying vec4 v_color;                                         \
                                                                \
  void main() {                                                 \
    vec2 position = (a_position + u_offset) * u_scale;          \
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;     \
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);          \
                                                                \
    v_color = vec4(a_color / 255.0, 1.0);                       \
  }                                                             ";
  var figuresFragmentShaderCode = "\
  precision mediump float;                                      \
                                                                \
  varying vec4 v_color;                                         \
                                                                \
  void main() {                                                 \
    gl_FragColor = v_color;                                     \
  }                                                             ";
  var figuresCache = null;

  function initFiguresGL() {
    var canvas, gl;
    generateGL();
    canvas = currentCanvas;
    currentCanvas = null;
    gl = currentGL;
    currentGL = null;
    var vertexShader = createVertexShader(gl, figuresVertexShaderCode);
    var fragmentShader = createFragmentShader(gl, figuresFragmentShaderCode);
    var program = createProgram(gl, [vertexShader, fragmentShader]);
    gl.useProgram(program);
    var cache = {};
    cache.gl = gl;
    cache.canvas = canvas;
    cache.resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    cache.scaleLocation = gl.getUniformLocation(program, "u_scale");
    cache.offsetLocation = gl.getUniformLocation(program, "u_offset");
    cache.positionLocation = gl.getAttribLocation(program, "a_position");
    cache.colorLocation = gl.getAttribLocation(program, "a_color");
    figuresCache = cache;
  }

  function drawFigures(width, height, backgroundColor, figures, context) {
    if (!figuresCache) {
      initFiguresGL();
    }

    var cache = figuresCache,
        canvas = cache.canvas,
        gl = cache.gl;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(cache.resolutionLocation, width, height);
    var count = 0;
    var i, ii, rows;

    for (i = 0, ii = figures.length; i < ii; i++) {
      switch (figures[i].type) {
        case "lattice":
          rows = figures[i].coords.length / figures[i].verticesPerRow | 0;
          count += (rows - 1) * (figures[i].verticesPerRow - 1) * 6;
          break;

        case "triangles":
          count += figures[i].coords.length;
          break;
      }
    }

    var coords = new Float32Array(count * 2);
    var colors = new Uint8Array(count * 3);
    var coordsMap = context.coords,
        colorsMap = context.colors;
    var pIndex = 0,
        cIndex = 0;

    for (i = 0, ii = figures.length; i < ii; i++) {
      var figure = figures[i],
          ps = figure.coords,
          cs = figure.colors;

      switch (figure.type) {
        case "lattice":
          var cols = figure.verticesPerRow;
          rows = ps.length / cols | 0;

          for (var row = 1; row < rows; row++) {
            var offset = row * cols + 1;

            for (var col = 1; col < cols; col++, offset++) {
              coords[pIndex] = coordsMap[ps[offset - cols - 1]];
              coords[pIndex + 1] = coordsMap[ps[offset - cols - 1] + 1];
              coords[pIndex + 2] = coordsMap[ps[offset - cols]];
              coords[pIndex + 3] = coordsMap[ps[offset - cols] + 1];
              coords[pIndex + 4] = coordsMap[ps[offset - 1]];
              coords[pIndex + 5] = coordsMap[ps[offset - 1] + 1];
              colors[cIndex] = colorsMap[cs[offset - cols - 1]];
              colors[cIndex + 1] = colorsMap[cs[offset - cols - 1] + 1];
              colors[cIndex + 2] = colorsMap[cs[offset - cols - 1] + 2];
              colors[cIndex + 3] = colorsMap[cs[offset - cols]];
              colors[cIndex + 4] = colorsMap[cs[offset - cols] + 1];
              colors[cIndex + 5] = colorsMap[cs[offset - cols] + 2];
              colors[cIndex + 6] = colorsMap[cs[offset - 1]];
              colors[cIndex + 7] = colorsMap[cs[offset - 1] + 1];
              colors[cIndex + 8] = colorsMap[cs[offset - 1] + 2];
              coords[pIndex + 6] = coords[pIndex + 2];
              coords[pIndex + 7] = coords[pIndex + 3];
              coords[pIndex + 8] = coords[pIndex + 4];
              coords[pIndex + 9] = coords[pIndex + 5];
              coords[pIndex + 10] = coordsMap[ps[offset]];
              coords[pIndex + 11] = coordsMap[ps[offset] + 1];
              colors[cIndex + 9] = colors[cIndex + 3];
              colors[cIndex + 10] = colors[cIndex + 4];
              colors[cIndex + 11] = colors[cIndex + 5];
              colors[cIndex + 12] = colors[cIndex + 6];
              colors[cIndex + 13] = colors[cIndex + 7];
              colors[cIndex + 14] = colors[cIndex + 8];
              colors[cIndex + 15] = colorsMap[cs[offset]];
              colors[cIndex + 16] = colorsMap[cs[offset] + 1];
              colors[cIndex + 17] = colorsMap[cs[offset] + 2];
              pIndex += 12;
              cIndex += 18;
            }
          }

          break;

        case "triangles":
          for (var j = 0, jj = ps.length; j < jj; j++) {
            coords[pIndex] = coordsMap[ps[j]];
            coords[pIndex + 1] = coordsMap[ps[j] + 1];
            colors[cIndex] = colorsMap[cs[j]];
            colors[cIndex + 1] = colorsMap[cs[j] + 1];
            colors[cIndex + 2] = colorsMap[cs[j] + 2];
            pIndex += 2;
            cIndex += 3;
          }

          break;
      }
    }

    if (backgroundColor) {
      gl.clearColor(backgroundColor[0] / 255, backgroundColor[1] / 255, backgroundColor[2] / 255, 1.0);
    } else {
      gl.clearColor(0, 0, 0, 0);
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    var coordsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, coordsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.positionLocation);
    gl.vertexAttribPointer(cache.positionLocation, 2, gl.FLOAT, false, 0, 0);
    var colorsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.colorLocation);
    gl.vertexAttribPointer(cache.colorLocation, 3, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.uniform2f(cache.scaleLocation, context.scaleX, context.scaleY);
    gl.uniform2f(cache.offsetLocation, context.offsetX, context.offsetY);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.flush();
    gl.deleteBuffer(coordsBuffer);
    gl.deleteBuffer(colorsBuffer);
    return canvas;
  }

  return {
    tryInitGL() {
      try {
        generateGL();
        return !!currentGL;
      } catch (ex) {}

      return false;
    },

    composeSMask,
    drawFigures,

    cleanup() {
      if (smaskCache && smaskCache.canvas) {
        smaskCache.canvas.width = 0;
        smaskCache.canvas.height = 0;
      }

      if (figuresCache && figuresCache.canvas) {
        figuresCache.canvas.width = 0;
        figuresCache.canvas.height = 0;
      }

      smaskCache = null;
      figuresCache = null;
    }

  };
}();

/***/ }),
/* 16 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.renderTextLayer = void 0;

var _util = __w_pdfjs_require__(1);

var renderTextLayer = function renderTextLayerClosure() {
  var MAX_TEXT_DIVS_TO_RENDER = 100000;
  var NonWhitespaceRegexp = /\S/;

  function isAllWhitespace(str) {
    return !NonWhitespaceRegexp.test(str);
  }

  function appendText(task, geom, styles) {
    var textDiv = document.createElement("span");
    var textDivProperties = {
      angle: 0,
      canvasWidth: 0,
      isWhitespace: false,
      originalTransform: null,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      scale: 1
    };

    task._textDivs.push(textDiv);

    if (isAllWhitespace(geom.str)) {
      textDivProperties.isWhitespace = true;

      task._textDivProperties.set(textDiv, textDivProperties);

      return;
    }

    var tx = _util.Util.transform(task._viewport.transform, geom.transform);

    var angle = Math.atan2(tx[1], tx[0]);
    var style = styles[geom.fontName];

    if (style.vertical) {
      angle += Math.PI / 2;
    }

    var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    var fontAscent = fontHeight;

    if (style.ascent) {
      fontAscent = style.ascent * fontAscent;
    } else if (style.descent) {
      fontAscent = (1 + style.descent) * fontAscent;
    }

    let left, top;

    if (angle === 0) {
      left = tx[4];
      top = tx[5] - fontAscent;
    } else {
      left = tx[4] + fontAscent * Math.sin(angle);
      top = tx[5] - fontAscent * Math.cos(angle);
    }

    textDiv.style.left = `${left}px`;
    textDiv.style.top = `${top}px`;
    textDiv.style.fontSize = `${fontHeight}px`;
    textDiv.style.fontFamily = style.fontFamily;
    textDiv.textContent = geom.str;

    if (task._fontInspectorEnabled) {
      textDiv.dataset.fontName = geom.fontName;
    }

    if (angle !== 0) {
      textDivProperties.angle = angle * (180 / Math.PI);
    }

    if (geom.str.length > 1) {
      if (style.vertical) {
        textDivProperties.canvasWidth = geom.height * task._viewport.scale;
      } else {
        textDivProperties.canvasWidth = geom.width * task._viewport.scale;
      }
    }

    task._textDivProperties.set(textDiv, textDivProperties);

    if (task._textContentStream) {
      task._layoutText(textDiv);
    }

    if (task._enhanceTextSelection) {
      var angleCos = 1,
          angleSin = 0;

      if (angle !== 0) {
        angleCos = Math.cos(angle);
        angleSin = Math.sin(angle);
      }

      var divWidth = (style.vertical ? geom.height : geom.width) * task._viewport.scale;
      var divHeight = fontHeight;
      var m, b;

      if (angle !== 0) {
        m = [angleCos, angleSin, -angleSin, angleCos, left, top];
        b = _util.Util.getAxialAlignedBoundingBox([0, 0, divWidth, divHeight], m);
      } else {
        b = [left, top, left + divWidth, top + divHeight];
      }

      task._bounds.push({
        left: b[0],
        top: b[1],
        right: b[2],
        bottom: b[3],
        div: textDiv,
        size: [divWidth, divHeight],
        m
      });
    }
  }

  function render(task) {
    if (task._canceled) {
      return;
    }

    var textDivs = task._textDivs;
    var capability = task._capability;
    var textDivsLength = textDivs.length;

    if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
      task._renderingDone = true;
      capability.resolve();
      return;
    }

    if (!task._textContentStream) {
      for (var i = 0; i < textDivsLength; i++) {
        task._layoutText(textDivs[i]);
      }
    }

    task._renderingDone = true;
    capability.resolve();
  }

  function findPositiveMin(ts, offset, count) {
    let result = 0;

    for (let i = 0; i < count; i++) {
      const t = ts[offset++];

      if (t > 0) {
        result = result ? Math.min(t, result) : t;
      }
    }

    return result;
  }

  function expand(task) {
    var bounds = task._bounds;
    var viewport = task._viewport;
    var expanded = expandBounds(viewport.width, viewport.height, bounds);

    for (var i = 0; i < expanded.length; i++) {
      var div = bounds[i].div;

      var divProperties = task._textDivProperties.get(div);

      if (divProperties.angle === 0) {
        divProperties.paddingLeft = bounds[i].left - expanded[i].left;
        divProperties.paddingTop = bounds[i].top - expanded[i].top;
        divProperties.paddingRight = expanded[i].right - bounds[i].right;
        divProperties.paddingBottom = expanded[i].bottom - bounds[i].bottom;

        task._textDivProperties.set(div, divProperties);

        continue;
      }

      var e = expanded[i],
          b = bounds[i];
      var m = b.m,
          c = m[0],
          s = m[1];
      var points = [[0, 0], [0, b.size[1]], [b.size[0], 0], b.size];
      var ts = new Float64Array(64);
      points.forEach(function (p, j) {
        var t = _util.Util.applyTransform(p, m);

        ts[j + 0] = c && (e.left - t[0]) / c;
        ts[j + 4] = s && (e.top - t[1]) / s;
        ts[j + 8] = c && (e.right - t[0]) / c;
        ts[j + 12] = s && (e.bottom - t[1]) / s;
        ts[j + 16] = s && (e.left - t[0]) / -s;
        ts[j + 20] = c && (e.top - t[1]) / c;
        ts[j + 24] = s && (e.right - t[0]) / -s;
        ts[j + 28] = c && (e.bottom - t[1]) / c;
        ts[j + 32] = c && (e.left - t[0]) / -c;
        ts[j + 36] = s && (e.top - t[1]) / -s;
        ts[j + 40] = c && (e.right - t[0]) / -c;
        ts[j + 44] = s && (e.bottom - t[1]) / -s;
        ts[j + 48] = s && (e.left - t[0]) / s;
        ts[j + 52] = c && (e.top - t[1]) / -c;
        ts[j + 56] = s && (e.right - t[0]) / s;
        ts[j + 60] = c && (e.bottom - t[1]) / -c;
      });
      var boxScale = 1 + Math.min(Math.abs(c), Math.abs(s));
      divProperties.paddingLeft = findPositiveMin(ts, 32, 16) / boxScale;
      divProperties.paddingTop = findPositiveMin(ts, 48, 16) / boxScale;
      divProperties.paddingRight = findPositiveMin(ts, 0, 16) / boxScale;
      divProperties.paddingBottom = findPositiveMin(ts, 16, 16) / boxScale;

      task._textDivProperties.set(div, divProperties);
    }
  }

  function expandBounds(width, height, boxes) {
    var bounds = boxes.map(function (box, i) {
      return {
        x1: box.left,
        y1: box.top,
        x2: box.right,
        y2: box.bottom,
        index: i,
        x1New: undefined,
        x2New: undefined
      };
    });
    expandBoundsLTR(width, bounds);
    var expanded = new Array(boxes.length);
    bounds.forEach(function (b) {
      var i = b.index;
      expanded[i] = {
        left: b.x1New,
        top: 0,
        right: b.x2New,
        bottom: 0
      };
    });
    boxes.map(function (box, i) {
      var e = expanded[i],
          b = bounds[i];
      b.x1 = box.top;
      b.y1 = width - e.right;
      b.x2 = box.bottom;
      b.y2 = width - e.left;
      b.index = i;
      b.x1New = undefined;
      b.x2New = undefined;
    });
    expandBoundsLTR(height, bounds);
    bounds.forEach(function (b) {
      var i = b.index;
      expanded[i].top = b.x1New;
      expanded[i].bottom = b.x2New;
    });
    return expanded;
  }

  function expandBoundsLTR(width, bounds) {
    bounds.sort(function (a, b) {
      return a.x1 - b.x1 || a.index - b.index;
    });
    var fakeBoundary = {
      x1: -Infinity,
      y1: -Infinity,
      x2: 0,
      y2: Infinity,
      index: -1,
      x1New: 0,
      x2New: 0
    };
    var horizon = [{
      start: -Infinity,
      end: Infinity,
      boundary: fakeBoundary
    }];
    bounds.forEach(function (boundary) {
      var i = 0;

      while (i < horizon.length && horizon[i].end <= boundary.y1) {
        i++;
      }

      var j = horizon.length - 1;

      while (j >= 0 && horizon[j].start >= boundary.y2) {
        j--;
      }

      var horizonPart, affectedBoundary;
      var q,
          k,
          maxXNew = -Infinity;

      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        var xNew;

        if (affectedBoundary.x2 > boundary.x1) {
          xNew = affectedBoundary.index > boundary.index ? affectedBoundary.x1New : boundary.x1;
        } else if (affectedBoundary.x2New === undefined) {
          xNew = (affectedBoundary.x2 + boundary.x1) / 2;
        } else {
          xNew = affectedBoundary.x2New;
        }

        if (xNew > maxXNew) {
          maxXNew = xNew;
        }
      }

      boundary.x1New = maxXNew;

      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;

        if (affectedBoundary.x2New === undefined) {
          if (affectedBoundary.x2 > boundary.x1) {
            if (affectedBoundary.index > boundary.index) {
              affectedBoundary.x2New = affectedBoundary.x2;
            }
          } else {
            affectedBoundary.x2New = maxXNew;
          }
        } else if (affectedBoundary.x2New > maxXNew) {
          affectedBoundary.x2New = Math.max(maxXNew, affectedBoundary.x2);
        }
      }

      var changedHorizon = [],
          lastBoundary = null;

      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        var useBoundary = affectedBoundary.x2 > boundary.x2 ? affectedBoundary : boundary;

        if (lastBoundary === useBoundary) {
          changedHorizon[changedHorizon.length - 1].end = horizonPart.end;
        } else {
          changedHorizon.push({
            start: horizonPart.start,
            end: horizonPart.end,
            boundary: useBoundary
          });
          lastBoundary = useBoundary;
        }
      }

      if (horizon[i].start < boundary.y1) {
        changedHorizon[0].start = boundary.y1;
        changedHorizon.unshift({
          start: horizon[i].start,
          end: boundary.y1,
          boundary: horizon[i].boundary
        });
      }

      if (boundary.y2 < horizon[j].end) {
        changedHorizon[changedHorizon.length - 1].end = boundary.y2;
        changedHorizon.push({
          start: boundary.y2,
          end: horizon[j].end,
          boundary: horizon[j].boundary
        });
      }

      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;

        if (affectedBoundary.x2New !== undefined) {
          continue;
        }

        var used = false;

        for (k = i - 1; !used && k >= 0 && horizon[k].start >= affectedBoundary.y1; k--) {
          used = horizon[k].boundary === affectedBoundary;
        }

        for (k = j + 1; !used && k < horizon.length && horizon[k].end <= affectedBoundary.y2; k++) {
          used = horizon[k].boundary === affectedBoundary;
        }

        for (k = 0; !used && k < changedHorizon.length; k++) {
          used = changedHorizon[k].boundary === affectedBoundary;
        }

        if (!used) {
          affectedBoundary.x2New = maxXNew;
        }
      }

      Array.prototype.splice.apply(horizon, [i, j - i + 1].concat(changedHorizon));
    });
    horizon.forEach(function (horizonPart) {
      var affectedBoundary = horizonPart.boundary;

      if (affectedBoundary.x2New === undefined) {
        affectedBoundary.x2New = Math.max(width, affectedBoundary.x2);
      }
    });
  }

  function TextLayerRenderTask({
    textContent,
    textContentStream,
    container,
    viewport,
    textDivs,
    textContentItemsStr,
    enhanceTextSelection
  }) {
    this._textContent = textContent;
    this._textContentStream = textContentStream;
    this._container = container;
    this._viewport = viewport;
    this._textDivs = textDivs || [];
    this._textContentItemsStr = textContentItemsStr || [];
    this._enhanceTextSelection = !!enhanceTextSelection;
    this._fontInspectorEnabled = !!(globalThis.FontInspector && globalThis.FontInspector.enabled);
    this._reader = null;
    this._layoutTextLastFontSize = null;
    this._layoutTextLastFontFamily = null;
    this._layoutTextCtx = null;
    this._textDivProperties = new WeakMap();
    this._renderingDone = false;
    this._canceled = false;
    this._capability = (0, _util.createPromiseCapability)();
    this._renderTimer = null;
    this._bounds = [];

    this._capability.promise.finally(() => {
      if (this._layoutTextCtx) {
        this._layoutTextCtx.canvas.width = 0;
        this._layoutTextCtx.canvas.height = 0;
        this._layoutTextCtx = null;
      }
    }).catch(() => {});
  }

  TextLayerRenderTask.prototype = {
    get promise() {
      return this._capability.promise;
    },

    cancel: function TextLayer_cancel() {
      this._canceled = true;

      if (this._reader) {
        this._reader.cancel(new _util.AbortException("TextLayer task cancelled."));

        this._reader = null;
      }

      if (this._renderTimer !== null) {
        clearTimeout(this._renderTimer);
        this._renderTimer = null;
      }

      this._capability.reject(new Error("TextLayer task cancelled."));
    },

    _processItems(items, styleCache) {
      for (let i = 0, len = items.length; i < len; i++) {
        this._textContentItemsStr.push(items[i].str);

        appendText(this, items[i], styleCache);
      }
    },

    _layoutText(textDiv) {
      const textDivProperties = this._textDivProperties.get(textDiv);

      if (textDivProperties.isWhitespace) {
        return;
      }

      let transform = "";

      if (textDivProperties.canvasWidth !== 0) {
        const {
          fontSize,
          fontFamily
        } = textDiv.style;

        if (fontSize !== this._layoutTextLastFontSize || fontFamily !== this._layoutTextLastFontFamily) {
          this._layoutTextCtx.font = `${fontSize} ${fontFamily}`;
          this._layoutTextLastFontSize = fontSize;
          this._layoutTextLastFontFamily = fontFamily;
        }

        const {
          width
        } = this._layoutTextCtx.measureText(textDiv.textContent);

        if (width > 0) {
          textDivProperties.scale = textDivProperties.canvasWidth / width;
          transform = `scaleX(${textDivProperties.scale})`;
        }
      }

      if (textDivProperties.angle !== 0) {
        transform = `rotate(${textDivProperties.angle}deg) ${transform}`;
      }

      if (transform.length > 0) {
        if (this._enhanceTextSelection) {
          textDivProperties.originalTransform = transform;
        }

        textDiv.style.transform = transform;
      }

      this._textDivProperties.set(textDiv, textDivProperties);

      this._container.appendChild(textDiv);
    },

    _render: function TextLayer_render(timeout) {
      const capability = (0, _util.createPromiseCapability)();
      let styleCache = Object.create(null);
      const canvas = document.createElement("canvas");
      canvas.mozOpaque = true;
      this._layoutTextCtx = canvas.getContext("2d", {
        alpha: false
      });

      if (this._textContent) {
        const textItems = this._textContent.items;
        const textStyles = this._textContent.styles;

        this._processItems(textItems, textStyles);

        capability.resolve();
      } else if (this._textContentStream) {
        const pump = () => {
          this._reader.read().then(({
            value,
            done
          }) => {
            if (done) {
              capability.resolve();
              return;
            }

            Object.assign(styleCache, value.styles);

            this._processItems(value.items, styleCache);

            pump();
          }, capability.reject);
        };

        this._reader = this._textContentStream.getReader();
        pump();
      } else {
        throw new Error('Neither "textContent" nor "textContentStream"' + " parameters specified.");
      }

      capability.promise.then(() => {
        styleCache = null;

        if (!timeout) {
          render(this);
        } else {
          this._renderTimer = setTimeout(() => {
            render(this);
            this._renderTimer = null;
          }, timeout);
        }
      }, this._capability.reject);
    },
    expandTextDivs: function TextLayer_expandTextDivs(expandDivs) {
      if (!this._enhanceTextSelection || !this._renderingDone) {
        return;
      }

      if (this._bounds !== null) {
        expand(this);
        this._bounds = null;
      }

      const transformBuf = [],
            paddingBuf = [];

      for (var i = 0, ii = this._textDivs.length; i < ii; i++) {
        const div = this._textDivs[i];

        const divProps = this._textDivProperties.get(div);

        if (divProps.isWhitespace) {
          continue;
        }

        if (expandDivs) {
          transformBuf.length = 0;
          paddingBuf.length = 0;

          if (divProps.originalTransform) {
            transformBuf.push(divProps.originalTransform);
          }

          if (divProps.paddingTop > 0) {
            paddingBuf.push(`${divProps.paddingTop}px`);
            transformBuf.push(`translateY(${-divProps.paddingTop}px)`);
          } else {
            paddingBuf.push(0);
          }

          if (divProps.paddingRight > 0) {
            paddingBuf.push(`${divProps.paddingRight / divProps.scale}px`);
          } else {
            paddingBuf.push(0);
          }

          if (divProps.paddingBottom > 0) {
            paddingBuf.push(`${divProps.paddingBottom}px`);
          } else {
            paddingBuf.push(0);
          }

          if (divProps.paddingLeft > 0) {
            paddingBuf.push(`${divProps.paddingLeft / divProps.scale}px`);
            transformBuf.push(`translateX(${-divProps.paddingLeft / divProps.scale}px)`);
          } else {
            paddingBuf.push(0);
          }

          div.style.padding = paddingBuf.join(" ");

          if (transformBuf.length) {
            div.style.transform = transformBuf.join(" ");
          }
        } else {
          div.style.padding = null;
          div.style.transform = divProps.originalTransform;
        }
      }
    }
  };

  function renderTextLayer(renderParameters) {
    var task = new TextLayerRenderTask({
      textContent: renderParameters.textContent,
      textContentStream: renderParameters.textContentStream,
      container: renderParameters.container,
      viewport: renderParameters.viewport,
      textDivs: renderParameters.textDivs,
      textContentItemsStr: renderParameters.textContentItemsStr,
      enhanceTextSelection: renderParameters.enhanceTextSelection
    });

    task._render(renderParameters.timeout);

    return task;
  }

  return renderTextLayer;
}();

exports.renderTextLayer = renderTextLayer;

/***/ }),
/* 17 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnnotationLayer = void 0;

var _display_utils = __w_pdfjs_require__(4);

var _util = __w_pdfjs_require__(1);

class AnnotationElementFactory {
  static create(parameters) {
    const subtype = parameters.data.annotationType;

    switch (subtype) {
      case _util.AnnotationType.LINK:
        return new LinkAnnotationElement(parameters);

      case _util.AnnotationType.TEXT:
        return new TextAnnotationElement(parameters);

      case _util.AnnotationType.WIDGET:
        const fieldType = parameters.data.fieldType;

        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotationElement(parameters);

          case "Btn":
            if (parameters.data.radioButton) {
              return new RadioButtonWidgetAnnotationElement(parameters);
            } else if (parameters.data.checkBox) {
              return new CheckboxWidgetAnnotationElement(parameters);
            }

            return new PushButtonWidgetAnnotationElement(parameters);

          case "Ch":
            return new ChoiceWidgetAnnotationElement(parameters);
        }

        return new WidgetAnnotationElement(parameters);

      case _util.AnnotationType.POPUP:
        return new PopupAnnotationElement(parameters);

      case _util.AnnotationType.FREETEXT:
        return new FreeTextAnnotationElement(parameters);

      case _util.AnnotationType.LINE:
        return new LineAnnotationElement(parameters);

      case _util.AnnotationType.SQUARE:
        return new SquareAnnotationElement(parameters);

      case _util.AnnotationType.CIRCLE:
        return new CircleAnnotationElement(parameters);

      case _util.AnnotationType.POLYLINE:
        return new PolylineAnnotationElement(parameters);

      case _util.AnnotationType.CARET:
        return new CaretAnnotationElement(parameters);

      case _util.AnnotationType.INK:
        return new InkAnnotationElement(parameters);

      case _util.AnnotationType.POLYGON:
        return new PolygonAnnotationElement(parameters);

      case _util.AnnotationType.HIGHLIGHT:
        return new HighlightAnnotationElement(parameters);

      case _util.AnnotationType.UNDERLINE:
        return new UnderlineAnnotationElement(parameters);

      case _util.AnnotationType.SQUIGGLY:
        return new SquigglyAnnotationElement(parameters);

      case _util.AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotationElement(parameters);

      case _util.AnnotationType.STAMP:
        return new StampAnnotationElement(parameters);

      case _util.AnnotationType.FILEATTACHMENT:
        return new FileAttachmentAnnotationElement(parameters);

      default:
        return new AnnotationElement(parameters);
    }
  }

}

class AnnotationElement {
  constructor(parameters, isRenderable = false, ignoreBorder = false) {
    this.isRenderable = isRenderable;
    this.data = parameters.data;
    this.layer = parameters.layer;
    this.page = parameters.page;
    this.viewport = parameters.viewport;
    this.linkService = parameters.linkService;
    this.downloadManager = parameters.downloadManager;
    this.imageResourcesPath = parameters.imageResourcesPath;
    this.renderInteractiveForms = parameters.renderInteractiveForms;
    this.svgFactory = parameters.svgFactory;

    if (isRenderable) {
      this.container = this._createContainer(ignoreBorder);
    }
  }

  _createContainer(ignoreBorder = false) {
    const data = this.data,
          page = this.page,
          viewport = this.viewport;
    const container = document.createElement("section");
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    container.setAttribute("data-annotation-id", data.id);

    const rect = _util.Util.normalizeRect([data.rect[0], page.view[3] - data.rect[1] + page.view[1], data.rect[2], page.view[3] - data.rect[3] + page.view[1]]);

    container.style.transform = `matrix(${viewport.transform.join(",")})`;
    container.style.transformOrigin = `-${rect[0]}px -${rect[1]}px`;

    if (!ignoreBorder && data.borderStyle.width > 0) {
      container.style.borderWidth = `${data.borderStyle.width}px`;

      if (data.borderStyle.style !== _util.AnnotationBorderStyleType.UNDERLINE) {
        width = width - 2 * data.borderStyle.width;
        height = height - 2 * data.borderStyle.width;
      }

      const horizontalRadius = data.borderStyle.horizontalCornerRadius;
      const verticalRadius = data.borderStyle.verticalCornerRadius;

      if (horizontalRadius > 0 || verticalRadius > 0) {
        const radius = `${horizontalRadius}px / ${verticalRadius}px`;
        container.style.borderRadius = radius;
      }

      switch (data.borderStyle.style) {
        case _util.AnnotationBorderStyleType.SOLID:
          container.style.borderStyle = "solid";
          break;

        case _util.AnnotationBorderStyleType.DASHED:
          container.style.borderStyle = "dashed";
          break;

        case _util.AnnotationBorderStyleType.BEVELED:
          (0, _util.warn)("Unimplemented border style: beveled");
          break;

        case _util.AnnotationBorderStyleType.INSET:
          (0, _util.warn)("Unimplemented border style: inset");
          break;

        case _util.AnnotationBorderStyleType.UNDERLINE:
          container.style.borderBottomStyle = "solid";
          break;

        default:
          break;
      }

      if (data.color) {
        container.style.borderColor = _util.Util.makeCssRgb(data.color[0] | 0, data.color[1] | 0, data.color[2] | 0);
      } else {
        container.style.borderWidth = 0;
      }
    }

    container.style.left = `${rect[0]}px`;
    container.style.top = `${rect[1]}px`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    return container;
  }

  _createPopup(container, trigger, data) {
    if (!trigger) {
      trigger = document.createElement("div");
      trigger.style.height = container.style.height;
      trigger.style.width = container.style.width;
      container.appendChild(trigger);
    }

    const popupElement = new PopupElement({
      container,
      trigger,
      color: data.color,
      title: data.title,
      modificationDate: data.modificationDate,
      contents: data.contents,
      hideWrapper: true
    });
    const popup = popupElement.render();
    popup.style.left = container.style.width;
    container.appendChild(popup);
  }

  render() {
    (0, _util.unreachable)("Abstract method `AnnotationElement.render` called");
  }

}

class LinkAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.url || parameters.data.dest || parameters.data.action);
    super(parameters, isRenderable);
  }

  render() {
    this.container.className = "linkAnnotation";
    const {
      data,
      linkService
    } = this;
    const link = document.createElement("a");

    if (data.url) {
      (0, _display_utils.addLinkAttributes)(link, {
        url: data.url,
        target: data.newWindow ? _display_utils.LinkTarget.BLANK : linkService.externalLinkTarget,
        rel: linkService.externalLinkRel,
        enabled: linkService.externalLinkEnabled
      });
    } else if (data.action) {
      this._bindNamedAction(link, data.action);
    } else {
      this._bindLink(link, data.dest);
    }

    this.container.appendChild(link);
    return this.container;
  }

  _bindLink(link, destination) {
    link.href = this.linkService.getDestinationHash(destination);

    link.onclick = () => {
      if (destination) {
        this.linkService.navigateTo(destination);
      }

      return false;
    };

    if (destination) {
      link.className = "internalLink";
    }
  }

  _bindNamedAction(link, action) {
    link.href = this.linkService.getAnchorUrl("");

    link.onclick = () => {
      this.linkService.executeNamedAction(action);
      return false;
    };

    link.className = "internalLink";
  }

}

class TextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  render() {
    this.container.className = "textAnnotation";
    const image = document.createElement("img");
    image.style.height = this.container.style.height;
    image.style.width = this.container.style.width;
    image.src = this.imageResourcesPath + "annotation-" + this.data.name.toLowerCase() + ".svg";
    image.alt = "[{{type}} Annotation]";
    image.dataset.l10nId = "text_annotation_type";
    image.dataset.l10nArgs = JSON.stringify({
      type: this.data.name
    });

    if (!this.data.hasPopup) {
      this._createPopup(this.container, image, this.data);
    }

    this.container.appendChild(image);
    return this.container;
  }

}

class WidgetAnnotationElement extends AnnotationElement {
  render() {
    return this.container;
  }

}

class TextWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    const isRenderable = parameters.renderInteractiveForms || !parameters.data.hasAppearance && !!parameters.data.fieldValue;
    super(parameters, isRenderable);
  }

  render() {
    const TEXT_ALIGNMENT = ["left", "center", "right"];
    this.container.className = "textWidgetAnnotation";
    let element = null;

    if (this.renderInteractiveForms) {
      if (this.data.multiLine) {
        element = document.createElement("textarea");
        element.textContent = this.data.fieldValue;
      } else {
        element = document.createElement("input");
        element.type = "text";
        element.setAttribute("value", this.data.fieldValue);
      }

      element.disabled = this.data.readOnly;

      if (this.data.maxLen !== null) {
        element.maxLength = this.data.maxLen;
      }

      if (this.data.comb) {
        const fieldWidth = this.data.rect[2] - this.data.rect[0];
        const combWidth = fieldWidth / this.data.maxLen;
        element.classList.add("comb");
        element.style.letterSpacing = `calc(${combWidth}px - 1ch)`;
      }
    } else {
      element = document.createElement("div");
      element.textContent = this.data.fieldValue;
      element.style.verticalAlign = "middle";
      element.style.display = "table-cell";
      let font = null;

      if (this.data.fontRefName && this.page.commonObjs.has(this.data.fontRefName)) {
        font = this.page.commonObjs.get(this.data.fontRefName);
      }

      this._setTextStyle(element, font);
    }

    if (this.data.textAlignment !== null) {
      element.style.textAlign = TEXT_ALIGNMENT[this.data.textAlignment];
    }

    this.container.appendChild(element);
    return this.container;
  }

  _setTextStyle(element, font) {
    const style = element.style;
    style.fontSize = `${this.data.fontSize}px`;
    style.direction = this.data.fontDirection < 0 ? "rtl" : "ltr";

    if (!font) {
      return;
    }

    let bold = "normal";

    if (font.black) {
      bold = "900";
    } else if (font.bold) {
      bold = "bold";
    }

    style.fontWeight = bold;
    style.fontStyle = font.italic ? "italic" : "normal";
    const fontFamily = font.loadedName ? `"${font.loadedName}", ` : "";
    const fallbackName = font.fallbackName || "Helvetica, sans-serif";
    style.fontFamily = fontFamily + fallbackName;
  }

}

class CheckboxWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = "buttonWidgetAnnotation checkBox";
    const element = document.createElement("input");
    element.disabled = this.data.readOnly;
    element.type = "checkbox";

    if (this.data.fieldValue && this.data.fieldValue !== "Off") {
      element.setAttribute("checked", true);
    }

    this.container.appendChild(element);
    return this.container;
  }

}

class RadioButtonWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = "buttonWidgetAnnotation radioButton";
    const element = document.createElement("input");
    element.disabled = this.data.readOnly;
    element.type = "radio";
    element.name = this.data.fieldName;

    if (this.data.fieldValue === this.data.buttonValue) {
      element.setAttribute("checked", true);
    }

    this.container.appendChild(element);
    return this.container;
  }

}

class PushButtonWidgetAnnotationElement extends LinkAnnotationElement {
  render() {
    const container = super.render();
    container.className = "buttonWidgetAnnotation pushButton";
    return container;
  }

}

class ChoiceWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = "choiceWidgetAnnotation";
    const selectElement = document.createElement("select");
    selectElement.disabled = this.data.readOnly;

    if (!this.data.combo) {
      selectElement.size = this.data.options.length;

      if (this.data.multiSelect) {
        selectElement.multiple = true;
      }
    }

    for (const option of this.data.options) {
      const optionElement = document.createElement("option");
      optionElement.textContent = option.displayValue;
      optionElement.value = option.exportValue;

      if (this.data.fieldValue.includes(option.displayValue)) {
        optionElement.setAttribute("selected", true);
      }

      selectElement.appendChild(optionElement);
    }

    this.container.appendChild(selectElement);
    return this.container;
  }

}

class PopupAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  render() {
    const IGNORE_TYPES = ["Line", "Square", "Circle", "PolyLine", "Polygon", "Ink"];
    this.container.className = "popupAnnotation";

    if (IGNORE_TYPES.includes(this.data.parentType)) {
      return this.container;
    }

    const selector = `[data-annotation-id="${this.data.parentId}"]`;
    const parentElement = this.layer.querySelector(selector);

    if (!parentElement) {
      return this.container;
    }

    const popup = new PopupElement({
      container: this.container,
      trigger: parentElement,
      color: this.data.color,
      title: this.data.title,
      modificationDate: this.data.modificationDate,
      contents: this.data.contents
    });
    const parentLeft = parseFloat(parentElement.style.left);
    const parentWidth = parseFloat(parentElement.style.width);
    this.container.style.transformOrigin = `-${parentLeft + parentWidth}px -${parentElement.style.top}`;
    this.container.style.left = `${parentLeft + parentWidth}px`;
    this.container.appendChild(popup.render());
    return this.container;
  }

}

class PopupElement {
  constructor(parameters) {
    this.container = parameters.container;
    this.trigger = parameters.trigger;
    this.color = parameters.color;
    this.title = parameters.title;
    this.modificationDate = parameters.modificationDate;
    this.contents = parameters.contents;
    this.hideWrapper = parameters.hideWrapper || false;
    this.pinned = false;
  }

  render() {
    const BACKGROUND_ENLIGHT = 0.7;
    const wrapper = document.createElement("div");
    wrapper.className = "popupWrapper";
    this.hideElement = this.hideWrapper ? wrapper : this.container;
    this.hideElement.setAttribute("hidden", true);
    const popup = document.createElement("div");
    popup.className = "popup";
    const color = this.color;

    if (color) {
      const r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
      const g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
      const b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
      popup.style.backgroundColor = _util.Util.makeCssRgb(r | 0, g | 0, b | 0);
    }

    const title = document.createElement("h1");
    title.textContent = this.title;
    popup.appendChild(title);

    const dateObject = _display_utils.PDFDateString.toDateObject(this.modificationDate);

    if (dateObject) {
      const modificationDate = document.createElement("span");
      modificationDate.textContent = "{{date}}, {{time}}";
      modificationDate.dataset.l10nId = "annotation_date_string";
      modificationDate.dataset.l10nArgs = JSON.stringify({
        date: dateObject.toLocaleDateString(),
        time: dateObject.toLocaleTimeString()
      });
      popup.appendChild(modificationDate);
    }

    const contents = this._formatContents(this.contents);

    popup.appendChild(contents);
    this.trigger.addEventListener("click", this._toggle.bind(this));
    this.trigger.addEventListener("mouseover", this._show.bind(this, false));
    this.trigger.addEventListener("mouseout", this._hide.bind(this, false));
    popup.addEventListener("click", this._hide.bind(this, true));
    wrapper.appendChild(popup);
    return wrapper;
  }

  _formatContents(contents) {
    const p = document.createElement("p");
    const lines = contents.split(/(?:\r\n?|\n)/);

    for (let i = 0, ii = lines.length; i < ii; ++i) {
      const line = lines[i];
      p.appendChild(document.createTextNode(line));

      if (i < ii - 1) {
        p.appendChild(document.createElement("br"));
      }
    }

    return p;
  }

  _toggle() {
    if (this.pinned) {
      this._hide(true);
    } else {
      this._show(true);
    }
  }

  _show(pin = false) {
    if (pin) {
      this.pinned = true;
    }

    if (this.hideElement.hasAttribute("hidden")) {
      this.hideElement.removeAttribute("hidden");
      this.container.style.zIndex += 1;
    }
  }

  _hide(unpin = true) {
    if (unpin) {
      this.pinned = false;
    }

    if (!this.hideElement.hasAttribute("hidden") && !this.pinned) {
      this.hideElement.setAttribute("hidden", true);
      this.container.style.zIndex -= 1;
    }
  }

}

class FreeTextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "freeTextAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class LineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "lineAnnotation";
    const data = this.data;
    const width = data.rect[2] - data.rect[0];
    const height = data.rect[3] - data.rect[1];
    const svg = this.svgFactory.create(width, height);
    const line = this.svgFactory.createElement("svg:line");
    line.setAttribute("x1", data.rect[2] - data.lineCoordinates[0]);
    line.setAttribute("y1", data.rect[3] - data.lineCoordinates[1]);
    line.setAttribute("x2", data.rect[2] - data.lineCoordinates[2]);
    line.setAttribute("y2", data.rect[3] - data.lineCoordinates[3]);
    line.setAttribute("stroke-width", data.borderStyle.width || 1);
    line.setAttribute("stroke", "transparent");
    svg.appendChild(line);
    this.container.append(svg);

    this._createPopup(this.container, line, data);

    return this.container;
  }

}

class SquareAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "squareAnnotation";
    const data = this.data;
    const width = data.rect[2] - data.rect[0];
    const height = data.rect[3] - data.rect[1];
    const svg = this.svgFactory.create(width, height);
    const borderWidth = data.borderStyle.width;
    const square = this.svgFactory.createElement("svg:rect");
    square.setAttribute("x", borderWidth / 2);
    square.setAttribute("y", borderWidth / 2);
    square.setAttribute("width", width - borderWidth);
    square.setAttribute("height", height - borderWidth);
    square.setAttribute("stroke-width", borderWidth || 1);
    square.setAttribute("stroke", "transparent");
    square.setAttribute("fill", "none");
    svg.appendChild(square);
    this.container.append(svg);

    this._createPopup(this.container, square, data);

    return this.container;
  }

}

class CircleAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "circleAnnotation";
    const data = this.data;
    const width = data.rect[2] - data.rect[0];
    const height = data.rect[3] - data.rect[1];
    const svg = this.svgFactory.create(width, height);
    const borderWidth = data.borderStyle.width;
    const circle = this.svgFactory.createElement("svg:ellipse");
    circle.setAttribute("cx", width / 2);
    circle.setAttribute("cy", height / 2);
    circle.setAttribute("rx", width / 2 - borderWidth / 2);
    circle.setAttribute("ry", height / 2 - borderWidth / 2);
    circle.setAttribute("stroke-width", borderWidth || 1);
    circle.setAttribute("stroke", "transparent");
    circle.setAttribute("fill", "none");
    svg.appendChild(circle);
    this.container.append(svg);

    this._createPopup(this.container, circle, data);

    return this.container;
  }

}

class PolylineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
    this.containerClassName = "polylineAnnotation";
    this.svgElementName = "svg:polyline";
  }

  render() {
    this.container.className = this.containerClassName;
    const data = this.data;
    const width = data.rect[2] - data.rect[0];
    const height = data.rect[3] - data.rect[1];
    const svg = this.svgFactory.create(width, height);
    let points = [];

    for (const coordinate of data.vertices) {
      const x = coordinate.x - data.rect[0];
      const y = data.rect[3] - coordinate.y;
      points.push(x + "," + y);
    }

    points = points.join(" ");
    const polyline = this.svgFactory.createElement(this.svgElementName);
    polyline.setAttribute("points", points);
    polyline.setAttribute("stroke-width", data.borderStyle.width || 1);
    polyline.setAttribute("stroke", "transparent");
    polyline.setAttribute("fill", "none");
    svg.appendChild(polyline);
    this.container.append(svg);

    this._createPopup(this.container, polyline, data);

    return this.container;
  }

}

class PolygonAnnotationElement extends PolylineAnnotationElement {
  constructor(parameters) {
    super(parameters);
    this.containerClassName = "polygonAnnotation";
    this.svgElementName = "svg:polygon";
  }

}

class CaretAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "caretAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class InkAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
    this.containerClassName = "inkAnnotation";
    this.svgElementName = "svg:polyline";
  }

  render() {
    this.container.className = this.containerClassName;
    const data = this.data;
    const width = data.rect[2] - data.rect[0];
    const height = data.rect[3] - data.rect[1];
    const svg = this.svgFactory.create(width, height);

    for (const inkList of data.inkLists) {
      let points = [];

      for (const coordinate of inkList) {
        const x = coordinate.x - data.rect[0];
        const y = data.rect[3] - coordinate.y;
        points.push(`${x},${y}`);
      }

      points = points.join(" ");
      const polyline = this.svgFactory.createElement(this.svgElementName);
      polyline.setAttribute("points", points);
      polyline.setAttribute("stroke-width", data.borderStyle.width || 1);
      polyline.setAttribute("stroke", "transparent");
      polyline.setAttribute("fill", "none");

      this._createPopup(this.container, polyline, data);

      svg.appendChild(polyline);
    }

    this.container.append(svg);
    return this.container;
  }

}

class HighlightAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "highlightAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class UnderlineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "underlineAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class SquigglyAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "squigglyAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class StrikeOutAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "strikeoutAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class StampAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = "stampAnnotation";

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class FileAttachmentAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, true);
    const {
      filename,
      content
    } = this.data.file;
    this.filename = (0, _display_utils.getFilenameFromUrl)(filename);
    this.content = content;

    if (this.linkService.eventBus) {
      this.linkService.eventBus.dispatch("fileattachmentannotation", {
        source: this,
        id: (0, _util.stringToPDFString)(filename),
        filename,
        content
      });
    }
  }

  render() {
    this.container.className = "fileAttachmentAnnotation";
    const trigger = document.createElement("div");
    trigger.style.height = this.container.style.height;
    trigger.style.width = this.container.style.width;
    trigger.addEventListener("dblclick", this._download.bind(this));

    if (!this.data.hasPopup && (this.data.title || this.data.contents)) {
      this._createPopup(this.container, trigger, this.data);
    }

    this.container.appendChild(trigger);
    return this.container;
  }

  _download() {
    if (!this.downloadManager) {
      (0, _util.warn)("Download cannot be started due to unavailable download manager");
      return;
    }

    this.downloadManager.downloadData(this.content, this.filename, "");
  }

}

class AnnotationLayer {
  static render(parameters) {
    const sortedAnnotations = [],
          popupAnnotations = [];

    for (const data of parameters.annotations) {
      if (!data) {
        continue;
      }

      if (data.annotationType === _util.AnnotationType.POPUP) {
        popupAnnotations.push(data);
        continue;
      }

      sortedAnnotations.push(data);
    }

    if (popupAnnotations.length) {
      sortedAnnotations.push(...popupAnnotations);
    }

    for (const data of sortedAnnotations) {
      const element = AnnotationElementFactory.create({
        data,
        layer: parameters.div,
        page: parameters.page,
        viewport: parameters.viewport,
        linkService: parameters.linkService,
        downloadManager: parameters.downloadManager,
        imageResourcesPath: parameters.imageResourcesPath || "",
        renderInteractiveForms: parameters.renderInteractiveForms || false,
        svgFactory: new _display_utils.DOMSVGFactory()
      });

      if (element.isRenderable) {
        parameters.div.appendChild(element.render());
      }
    }
  }

  static update(parameters) {
    for (const data of parameters.annotations) {
      const element = parameters.div.querySelector(`[data-annotation-id="${data.id}"]`);

      if (element) {
        element.style.transform = `matrix(${parameters.viewport.transform.join(",")})`;
      }
    }

    parameters.div.removeAttribute("hidden");
  }

}

exports.AnnotationLayer = AnnotationLayer;

/***/ }),
/* 18 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SVGGraphics = void 0;

var _util = __w_pdfjs_require__(1);

var _display_utils = __w_pdfjs_require__(4);

var _is_node = __w_pdfjs_require__(7);

let SVGGraphics = function () {
  throw new Error("Not implemented: SVGGraphics");
};

exports.SVGGraphics = SVGGraphics;
{
  const SVG_DEFAULTS = {
    fontStyle: "normal",
    fontWeight: "normal",
    fillColor: "#000000"
  };
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const LINE_CAP_STYLES = ["butt", "round", "square"];
  const LINE_JOIN_STYLES = ["miter", "round", "bevel"];

  const convertImgDataToPng = function () {
    const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const CHUNK_WRAPPER_SIZE = 12;
    const crcTable = new Int32Array(256);

    for (let i = 0; i < 256; i++) {
      let c = i;

      for (let h = 0; h < 8; h++) {
        if (c & 1) {
          c = 0xedb88320 ^ c >> 1 & 0x7fffffff;
        } else {
          c = c >> 1 & 0x7fffffff;
        }
      }

      crcTable[i] = c;
    }

    function crc32(data, start, end) {
      let crc = -1;

      for (let i = start; i < end; i++) {
        const a = (crc ^ data[i]) & 0xff;
        const b = crcTable[a];
        crc = crc >>> 8 ^ b;
      }

      return crc ^ -1;
    }

    function writePngChunk(type, body, data, offset) {
      let p = offset;
      const len = body.length;
      data[p] = len >> 24 & 0xff;
      data[p + 1] = len >> 16 & 0xff;
      data[p + 2] = len >> 8 & 0xff;
      data[p + 3] = len & 0xff;
      p += 4;
      data[p] = type.charCodeAt(0) & 0xff;
      data[p + 1] = type.charCodeAt(1) & 0xff;
      data[p + 2] = type.charCodeAt(2) & 0xff;
      data[p + 3] = type.charCodeAt(3) & 0xff;
      p += 4;
      data.set(body, p);
      p += body.length;
      const crc = crc32(data, offset + 4, p);
      data[p] = crc >> 24 & 0xff;
      data[p + 1] = crc >> 16 & 0xff;
      data[p + 2] = crc >> 8 & 0xff;
      data[p + 3] = crc & 0xff;
    }

    function adler32(data, start, end) {
      let a = 1;
      let b = 0;

      for (let i = start; i < end; ++i) {
        a = (a + (data[i] & 0xff)) % 65521;
        b = (b + a) % 65521;
      }

      return b << 16 | a;
    }

    function deflateSync(literals) {
      if (!_is_node.isNodeJS) {
        return deflateSyncUncompressed(literals);
      }

      try {
        let input;

        if (parseInt(process.versions.node) >= 8) {
          input = literals;
        } else {
          input = Buffer.from(literals);
        }

        const output = require("zlib").deflateSync(input, {
          level: 9
        });

        return output instanceof Uint8Array ? output : new Uint8Array(output);
      } catch (e) {
        (0, _util.warn)("Not compressing PNG because zlib.deflateSync is unavailable: " + e);
      }

      return deflateSyncUncompressed(literals);
    }

    function deflateSyncUncompressed(literals) {
      let len = literals.length;
      const maxBlockLength = 0xffff;
      const deflateBlocks = Math.ceil(len / maxBlockLength);
      const idat = new Uint8Array(2 + len + deflateBlocks * 5 + 4);
      let pi = 0;
      idat[pi++] = 0x78;
      idat[pi++] = 0x9c;
      let pos = 0;

      while (len > maxBlockLength) {
        idat[pi++] = 0x00;
        idat[pi++] = 0xff;
        idat[pi++] = 0xff;
        idat[pi++] = 0x00;
        idat[pi++] = 0x00;
        idat.set(literals.subarray(pos, pos + maxBlockLength), pi);
        pi += maxBlockLength;
        pos += maxBlockLength;
        len -= maxBlockLength;
      }

      idat[pi++] = 0x01;
      idat[pi++] = len & 0xff;
      idat[pi++] = len >> 8 & 0xff;
      idat[pi++] = ~len & 0xffff & 0xff;
      idat[pi++] = (~len & 0xffff) >> 8 & 0xff;
      idat.set(literals.subarray(pos), pi);
      pi += literals.length - pos;
      const adler = adler32(literals, 0, literals.length);
      idat[pi++] = adler >> 24 & 0xff;
      idat[pi++] = adler >> 16 & 0xff;
      idat[pi++] = adler >> 8 & 0xff;
      idat[pi++] = adler & 0xff;
      return idat;
    }

    function encode(imgData, kind, forceDataSchema, isMask) {
      const width = imgData.width;
      const height = imgData.height;
      let bitDepth, colorType, lineSize;
      const bytes = imgData.data;

      switch (kind) {
        case _util.ImageKind.GRAYSCALE_1BPP:
          colorType = 0;
          bitDepth = 1;
          lineSize = width + 7 >> 3;
          break;

        case _util.ImageKind.RGB_24BPP:
          colorType = 2;
          bitDepth = 8;
          lineSize = width * 3;
          break;

        case _util.ImageKind.RGBA_32BPP:
          colorType = 6;
          bitDepth = 8;
          lineSize = width * 4;
          break;

        default:
          throw new Error("invalid format");
      }

      const literals = new Uint8Array((1 + lineSize) * height);
      let offsetLiterals = 0,
          offsetBytes = 0;

      for (let y = 0; y < height; ++y) {
        literals[offsetLiterals++] = 0;
        literals.set(bytes.subarray(offsetBytes, offsetBytes + lineSize), offsetLiterals);
        offsetBytes += lineSize;
        offsetLiterals += lineSize;
      }

      if (kind === _util.ImageKind.GRAYSCALE_1BPP && isMask) {
        offsetLiterals = 0;

        for (let y = 0; y < height; y++) {
          offsetLiterals++;

          for (let i = 0; i < lineSize; i++) {
            literals[offsetLiterals++] ^= 0xff;
          }
        }
      }

      const ihdr = new Uint8Array([width >> 24 & 0xff, width >> 16 & 0xff, width >> 8 & 0xff, width & 0xff, height >> 24 & 0xff, height >> 16 & 0xff, height >> 8 & 0xff, height & 0xff, bitDepth, colorType, 0x00, 0x00, 0x00]);
      const idat = deflateSync(literals);
      const pngLength = PNG_HEADER.length + CHUNK_WRAPPER_SIZE * 3 + ihdr.length + idat.length;
      const data = new Uint8Array(pngLength);
      let offset = 0;
      data.set(PNG_HEADER, offset);
      offset += PNG_HEADER.length;
      writePngChunk("IHDR", ihdr, data, offset);
      offset += CHUNK_WRAPPER_SIZE + ihdr.length;
      writePngChunk("IDATA", idat, data, offset);
      offset += CHUNK_WRAPPER_SIZE + idat.length;
      writePngChunk("IEND", new Uint8Array(0), data, offset);
      return (0, _util.createObjectURL)(data, "image/png", forceDataSchema);
    }

    return function convertImgDataToPng(imgData, forceDataSchema, isMask) {
      const kind = imgData.kind === undefined ? _util.ImageKind.GRAYSCALE_1BPP : imgData.kind;
      return encode(imgData, kind, forceDataSchema, isMask);
    };
  }();

  class SVGExtraState {
    constructor() {
      this.fontSizeScale = 1;
      this.fontWeight = SVG_DEFAULTS.fontWeight;
      this.fontSize = 0;
      this.textMatrix = _util.IDENTITY_MATRIX;
      this.fontMatrix = _util.FONT_IDENTITY_MATRIX;
      this.leading = 0;
      this.textRenderingMode = _util.TextRenderingMode.FILL;
      this.textMatrixScale = 1;
      this.x = 0;
      this.y = 0;
      this.lineX = 0;
      this.lineY = 0;
      this.charSpacing = 0;
      this.wordSpacing = 0;
      this.textHScale = 1;
      this.textRise = 0;
      this.fillColor = SVG_DEFAULTS.fillColor;
      this.strokeColor = "#000000";
      this.fillAlpha = 1;
      this.strokeAlpha = 1;
      this.lineWidth = 1;
      this.lineJoin = "";
      this.lineCap = "";
      this.miterLimit = 0;
      this.dashArray = [];
      this.dashPhase = 0;
      this.dependencies = [];
      this.activeClipUrl = null;
      this.clipGroup = null;
      this.maskId = "";
    }

    clone() {
      return Object.create(this);
    }

    setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }

  }

  function opListToTree(opList) {
    let opTree = [];
    const tmp = [];

    for (const opListElement of opList) {
      if (opListElement.fn === "save") {
        opTree.push({
          fnId: 92,
          fn: "group",
          items: []
        });
        tmp.push(opTree);
        opTree = opTree[opTree.length - 1].items;
        continue;
      }

      if (opListElement.fn === "restore") {
        opTree = tmp.pop();
      } else {
        opTree.push(opListElement);
      }
    }

    return opTree;
  }

  function pf(value) {
    if (Number.isInteger(value)) {
      return value.toString();
    }

    const s = value.toFixed(10);
    let i = s.length - 1;

    if (s[i] !== "0") {
      return s;
    }

    do {
      i--;
    } while (s[i] === "0");

    return s.substring(0, s[i] === "." ? i : i + 1);
  }

  function pm(m) {
    if (m[4] === 0 && m[5] === 0) {
      if (m[1] === 0 && m[2] === 0) {
        if (m[0] === 1 && m[3] === 1) {
          return "";
        }

        return `scale(${pf(m[0])} ${pf(m[3])})`;
      }

      if (m[0] === m[3] && m[1] === -m[2]) {
        const a = Math.acos(m[0]) * 180 / Math.PI;
        return `rotate(${pf(a)})`;
      }
    } else {
      if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
        return `translate(${pf(m[4])} ${pf(m[5])})`;
      }
    }

    return `matrix(${pf(m[0])} ${pf(m[1])} ${pf(m[2])} ${pf(m[3])} ${pf(m[4])} ` + `${pf(m[5])})`;
  }

  let clipCount = 0;
  let maskCount = 0;
  let shadingCount = 0;
  exports.SVGGraphics = SVGGraphics = class SVGGraphics {
    constructor(commonObjs, objs, forceDataSchema) {
      this.svgFactory = new _display_utils.DOMSVGFactory();
      this.current = new SVGExtraState();
      this.transformMatrix = _util.IDENTITY_MATRIX;
      this.transformStack = [];
      this.extraStack = [];
      this.commonObjs = commonObjs;
      this.objs = objs;
      this.pendingClip = null;
      this.pendingEOFill = false;
      this.embedFonts = false;
      this.embeddedFonts = Object.create(null);
      this.cssStyle = null;
      this.forceDataSchema = !!forceDataSchema;
      this._operatorIdMapping = [];

      for (const op in _util.OPS) {
        this._operatorIdMapping[_util.OPS[op]] = op;
      }
    }

    save() {
      this.transformStack.push(this.transformMatrix);
      const old = this.current;
      this.extraStack.push(old);
      this.current = old.clone();
    }

    restore() {
      this.transformMatrix = this.transformStack.pop();
      this.current = this.extraStack.pop();
      this.pendingClip = null;
      this.tgrp = null;
    }

    group(items) {
      this.save();
      this.executeOpTree(items);
      this.restore();
    }

    loadDependencies(operatorList) {
      const fnArray = operatorList.fnArray;
      const argsArray = operatorList.argsArray;

      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        if (fnArray[i] !== _util.OPS.dependency) {
          continue;
        }

        for (const obj of argsArray[i]) {
          const objsPool = obj.startsWith("g_") ? this.commonObjs : this.objs;
          const promise = new Promise(resolve => {
            objsPool.get(obj, resolve);
          });
          this.current.dependencies.push(promise);
        }
      }

      return Promise.all(this.current.dependencies);
    }

    transform(a, b, c, d, e, f) {
      const transformMatrix = [a, b, c, d, e, f];
      this.transformMatrix = _util.Util.transform(this.transformMatrix, transformMatrix);
      this.tgrp = null;
    }

    getSVG(operatorList, viewport) {
      this.viewport = viewport;

      const svgElement = this._initialize(viewport);

      return this.loadDependencies(operatorList).then(() => {
        this.transformMatrix = _util.IDENTITY_MATRIX;
        this.executeOpTree(this.convertOpList(operatorList));
        return svgElement;
      });
    }

    convertOpList(operatorList) {
      const operatorIdMapping = this._operatorIdMapping;
      const argsArray = operatorList.argsArray;
      const fnArray = operatorList.fnArray;
      const opList = [];

      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        const fnId = fnArray[i];
        opList.push({
          fnId,
          fn: operatorIdMapping[fnId],
          args: argsArray[i]
        });
      }

      return opListToTree(opList);
    }

    executeOpTree(opTree) {
      for (const opTreeElement of opTree) {
        const fn = opTreeElement.fn;
        const fnId = opTreeElement.fnId;
        const args = opTreeElement.args;

        switch (fnId | 0) {
          case _util.OPS.beginText:
            this.beginText();
            break;

          case _util.OPS.dependency:
            break;

          case _util.OPS.setLeading:
            this.setLeading(args);
            break;

          case _util.OPS.setLeadingMoveText:
            this.setLeadingMoveText(args[0], args[1]);
            break;

          case _util.OPS.setFont:
            this.setFont(args);
            break;

          case _util.OPS.showText:
            this.showText(args[0]);
            break;

          case _util.OPS.showSpacedText:
            this.showText(args[0]);
            break;

          case _util.OPS.endText:
            this.endText();
            break;

          case _util.OPS.moveText:
            this.moveText(args[0], args[1]);
            break;

          case _util.OPS.setCharSpacing:
            this.setCharSpacing(args[0]);
            break;

          case _util.OPS.setWordSpacing:
            this.setWordSpacing(args[0]);
            break;

          case _util.OPS.setHScale:
            this.setHScale(args[0]);
            break;

          case _util.OPS.setTextMatrix:
            this.setTextMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
            break;

          case _util.OPS.setTextRise:
            this.setTextRise(args[0]);
            break;

          case _util.OPS.setTextRenderingMode:
            this.setTextRenderingMode(args[0]);
            break;

          case _util.OPS.setLineWidth:
            this.setLineWidth(args[0]);
            break;

          case _util.OPS.setLineJoin:
            this.setLineJoin(args[0]);
            break;

          case _util.OPS.setLineCap:
            this.setLineCap(args[0]);
            break;

          case _util.OPS.setMiterLimit:
            this.setMiterLimit(args[0]);
            break;

          case _util.OPS.setFillRGBColor:
            this.setFillRGBColor(args[0], args[1], args[2]);
            break;

          case _util.OPS.setStrokeRGBColor:
            this.setStrokeRGBColor(args[0], args[1], args[2]);
            break;

          case _util.OPS.setStrokeColorN:
            this.setStrokeColorN(args);
            break;

          case _util.OPS.setFillColorN:
            this.setFillColorN(args);
            break;

          case _util.OPS.shadingFill:
            this.shadingFill(args[0]);
            break;

          case _util.OPS.setDash:
            this.setDash(args[0], args[1]);
            break;

          case _util.OPS.setRenderingIntent:
            this.setRenderingIntent(args[0]);
            break;

          case _util.OPS.setFlatness:
            this.setFlatness(args[0]);
            break;

          case _util.OPS.setGState:
            this.setGState(args[0]);
            break;

          case _util.OPS.fill:
            this.fill();
            break;

          case _util.OPS.eoFill:
            this.eoFill();
            break;

          case _util.OPS.stroke:
            this.stroke();
            break;

          case _util.OPS.fillStroke:
            this.fillStroke();
            break;

          case _util.OPS.eoFillStroke:
            this.eoFillStroke();
            break;

          case _util.OPS.clip:
            this.clip("nonzero");
            break;

          case _util.OPS.eoClip:
            this.clip("evenodd");
            break;

          case _util.OPS.paintSolidColorImageMask:
            this.paintSolidColorImageMask();
            break;

          case _util.OPS.paintJpegXObject:
            this.paintJpegXObject(args[0], args[1], args[2]);
            break;

          case _util.OPS.paintImageXObject:
            this.paintImageXObject(args[0]);
            break;

          case _util.OPS.paintInlineImageXObject:
            this.paintInlineImageXObject(args[0]);
            break;

          case _util.OPS.paintImageMaskXObject:
            this.paintImageMaskXObject(args[0]);
            break;

          case _util.OPS.paintFormXObjectBegin:
            this.paintFormXObjectBegin(args[0], args[1]);
            break;

          case _util.OPS.paintFormXObjectEnd:
            this.paintFormXObjectEnd();
            break;

          case _util.OPS.closePath:
            this.closePath();
            break;

          case _util.OPS.closeStroke:
            this.closeStroke();
            break;

          case _util.OPS.closeFillStroke:
            this.closeFillStroke();
            break;

          case _util.OPS.closeEOFillStroke:
            this.closeEOFillStroke();
            break;

          case _util.OPS.nextLine:
            this.nextLine();
            break;

          case _util.OPS.transform:
            this.transform(args[0], args[1], args[2], args[3], args[4], args[5]);
            break;

          case _util.OPS.constructPath:
            this.constructPath(args[0], args[1]);
            break;

          case _util.OPS.endPath:
            this.endPath();
            break;

          case 92:
            this.group(opTreeElement.items);
            break;

          default:
            (0, _util.warn)(`Unimplemented operator ${fn}`);
            break;
        }
      }
    }

    setWordSpacing(wordSpacing) {
      this.current.wordSpacing = wordSpacing;
    }

    setCharSpacing(charSpacing) {
      this.current.charSpacing = charSpacing;
    }

    nextLine() {
      this.moveText(0, this.current.leading);
    }

    setTextMatrix(a, b, c, d, e, f) {
      const current = this.current;
      current.textMatrix = current.lineMatrix = [a, b, c, d, e, f];
      current.textMatrixScale = Math.sqrt(a * a + b * b);
      current.x = current.lineX = 0;
      current.y = current.lineY = 0;
      current.xcoords = [];
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(null, "font-size", `${pf(current.fontSize)}px`);
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
      current.txtElement = this.svgFactory.createElement("svg:text");
      current.txtElement.appendChild(current.tspan);
    }

    beginText() {
      const current = this.current;
      current.x = current.lineX = 0;
      current.y = current.lineY = 0;
      current.textMatrix = _util.IDENTITY_MATRIX;
      current.lineMatrix = _util.IDENTITY_MATRIX;
      current.textMatrixScale = 1;
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.txtElement = this.svgFactory.createElement("svg:text");
      current.txtgrp = this.svgFactory.createElement("svg:g");
      current.xcoords = [];
    }

    moveText(x, y) {
      const current = this.current;
      current.x = current.lineX += x;
      current.y = current.lineY += y;
      current.xcoords = [];
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(null, "font-size", `${pf(current.fontSize)}px`);
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
    }

    showText(glyphs) {
      const current = this.current;
      const font = current.font;
      const fontSize = current.fontSize;

      if (fontSize === 0) {
        return;
      }

      const charSpacing = current.charSpacing;
      const wordSpacing = current.wordSpacing;
      const fontDirection = current.fontDirection;
      const textHScale = current.textHScale * fontDirection;
      const vertical = font.vertical;
      const widthAdvanceScale = fontSize * current.fontMatrix[0];
      let x = 0;

      for (const glyph of glyphs) {
        if (glyph === null) {
          x += fontDirection * wordSpacing;
          continue;
        } else if ((0, _util.isNum)(glyph)) {
          x += -glyph * fontSize * 0.001;
          continue;
        }

        const width = glyph.width;
        const character = glyph.fontChar;
        const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
        const charWidth = width * widthAdvanceScale + spacing * fontDirection;

        if (!glyph.isInFont && !font.missingFile) {
          x += charWidth;
          continue;
        }

        current.xcoords.push(current.x + x);
        current.tspan.textContent += character;
        x += charWidth;
      }

      if (vertical) {
        current.y -= x * textHScale;
      } else {
        current.x += x * textHScale;
      }

      current.tspan.setAttributeNS(null, "x", current.xcoords.map(pf).join(" "));
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(null, "font-size", `${pf(current.fontSize)}px`);

      if (current.fontStyle !== SVG_DEFAULTS.fontStyle) {
        current.tspan.setAttributeNS(null, "font-style", current.fontStyle);
      }

      if (current.fontWeight !== SVG_DEFAULTS.fontWeight) {
        current.tspan.setAttributeNS(null, "font-weight", current.fontWeight);
      }

      const fillStrokeMode = current.textRenderingMode & _util.TextRenderingMode.FILL_STROKE_MASK;

      if (fillStrokeMode === _util.TextRenderingMode.FILL || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
        if (current.fillColor !== SVG_DEFAULTS.fillColor) {
          current.tspan.setAttributeNS(null, "fill", current.fillColor);
        }

        if (current.fillAlpha < 1) {
          current.tspan.setAttributeNS(null, "fill-opacity", current.fillAlpha);
        }
      } else if (current.textRenderingMode === _util.TextRenderingMode.ADD_TO_PATH) {
        current.tspan.setAttributeNS(null, "fill", "transparent");
      } else {
        current.tspan.setAttributeNS(null, "fill", "none");
      }

      if (fillStrokeMode === _util.TextRenderingMode.STROKE || fillStrokeMode === _util.TextRenderingMode.FILL_STROKE) {
        const lineWidthScale = 1 / (current.textMatrixScale || 1);

        this._setStrokeAttributes(current.tspan, lineWidthScale);
      }

      let textMatrix = current.textMatrix;

      if (current.textRise !== 0) {
        textMatrix = textMatrix.slice();
        textMatrix[5] += current.textRise;
      }

      current.txtElement.setAttributeNS(null, "transform", `${pm(textMatrix)} scale(${pf(textHScale)}, -1)`);
      current.txtElement.setAttributeNS(XML_NS, "xml:space", "preserve");
      current.txtElement.appendChild(current.tspan);
      current.txtgrp.appendChild(current.txtElement);

      this._ensureTransformGroup().appendChild(current.txtElement);
    }

    setLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    }

    addFontStyle(fontObj) {
      if (!this.cssStyle) {
        this.cssStyle = this.svgFactory.createElement("svg:style");
        this.cssStyle.setAttributeNS(null, "type", "text/css");
        this.defs.appendChild(this.cssStyle);
      }

      const url = (0, _util.createObjectURL)(fontObj.data, fontObj.mimetype, this.forceDataSchema);
      this.cssStyle.textContent += `@font-face { font-family: "${fontObj.loadedName}";` + ` src: url(${url}); }\n`;
    }

    setFont(details) {
      const current = this.current;
      const fontObj = this.commonObjs.get(details[0]);
      let size = details[1];
      current.font = fontObj;

      if (this.embedFonts && fontObj.data && !this.embeddedFonts[fontObj.loadedName]) {
        this.addFontStyle(fontObj);
        this.embeddedFonts[fontObj.loadedName] = fontObj;
      }

      current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix : _util.FONT_IDENTITY_MATRIX;
      let bold = "normal";

      if (fontObj.black) {
        bold = "900";
      } else if (fontObj.bold) {
        bold = "bold";
      }

      const italic = fontObj.italic ? "italic" : "normal";

      if (size < 0) {
        size = -size;
        current.fontDirection = -1;
      } else {
        current.fontDirection = 1;
      }

      current.fontSize = size;
      current.fontFamily = fontObj.loadedName;
      current.fontWeight = bold;
      current.fontStyle = italic;
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
      current.xcoords = [];
    }

    endText() {
      const current = this.current;

      if (current.textRenderingMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG && current.txtElement && current.txtElement.hasChildNodes()) {
        current.element = current.txtElement;
        this.clip("nonzero");
        this.endPath();
      }
    }

    setLineWidth(width) {
      if (width > 0) {
        this.current.lineWidth = width;
      }
    }

    setLineCap(style) {
      this.current.lineCap = LINE_CAP_STYLES[style];
    }

    setLineJoin(style) {
      this.current.lineJoin = LINE_JOIN_STYLES[style];
    }

    setMiterLimit(limit) {
      this.current.miterLimit = limit;
    }

    setStrokeAlpha(strokeAlpha) {
      this.current.strokeAlpha = strokeAlpha;
    }

    setStrokeRGBColor(r, g, b) {
      this.current.strokeColor = _util.Util.makeCssRgb(r, g, b);
    }

    setFillAlpha(fillAlpha) {
      this.current.fillAlpha = fillAlpha;
    }

    setFillRGBColor(r, g, b) {
      this.current.fillColor = _util.Util.makeCssRgb(r, g, b);
      this.current.tspan = this.svgFactory.createElement("svg:tspan");
      this.current.xcoords = [];
    }

    setStrokeColorN(args) {
      this.current.strokeColor = this._makeColorN_Pattern(args);
    }

    setFillColorN(args) {
      this.current.fillColor = this._makeColorN_Pattern(args);
    }

    shadingFill(args) {
      const width = this.viewport.width;
      const height = this.viewport.height;

      const inv = _util.Util.inverseTransform(this.transformMatrix);

      const bl = _util.Util.applyTransform([0, 0], inv);

      const br = _util.Util.applyTransform([0, height], inv);

      const ul = _util.Util.applyTransform([width, 0], inv);

      const ur = _util.Util.applyTransform([width, height], inv);

      const x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
      const y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
      const x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
      const y1 = Math.max(bl[1], br[1], ul[1], ur[1]);
      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", x0);
      rect.setAttributeNS(null, "y", y0);
      rect.setAttributeNS(null, "width", x1 - x0);
      rect.setAttributeNS(null, "height", y1 - y0);
      rect.setAttributeNS(null, "fill", this._makeShadingPattern(args));

      this._ensureTransformGroup().appendChild(rect);
    }

    _makeColorN_Pattern(args) {
      if (args[0] === "TilingPattern") {
        return this._makeTilingPattern(args);
      }

      return this._makeShadingPattern(args);
    }

    _makeTilingPattern(args) {
      const color = args[1];
      const operatorList = args[2];
      const matrix = args[3] || _util.IDENTITY_MATRIX;
      const [x0, y0, x1, y1] = args[4];
      const xstep = args[5];
      const ystep = args[6];
      const paintType = args[7];
      const tilingId = `shading${shadingCount++}`;

      const [tx0, ty0] = _util.Util.applyTransform([x0, y0], matrix);

      const [tx1, ty1] = _util.Util.applyTransform([x1, y1], matrix);

      const [xscale, yscale] = _util.Util.singularValueDecompose2dScale(matrix);

      const txstep = xstep * xscale;
      const tystep = ystep * yscale;
      const tiling = this.svgFactory.createElement("svg:pattern");
      tiling.setAttributeNS(null, "id", tilingId);
      tiling.setAttributeNS(null, "patternUnits", "userSpaceOnUse");
      tiling.setAttributeNS(null, "width", txstep);
      tiling.setAttributeNS(null, "height", tystep);
      tiling.setAttributeNS(null, "x", `${tx0}`);
      tiling.setAttributeNS(null, "y", `${ty0}`);
      const svg = this.svg;
      const transformMatrix = this.transformMatrix;
      const fillColor = this.current.fillColor;
      const strokeColor = this.current.strokeColor;
      const bbox = this.svgFactory.create(tx1 - tx0, ty1 - ty0);
      this.svg = bbox;
      this.transformMatrix = matrix;

      if (paintType === 2) {
        const cssColor = _util.Util.makeCssRgb(...color);

        this.current.fillColor = cssColor;
        this.current.strokeColor = cssColor;
      }

      this.executeOpTree(this.convertOpList(operatorList));
      this.svg = svg;
      this.transformMatrix = transformMatrix;
      this.current.fillColor = fillColor;
      this.current.strokeColor = strokeColor;
      tiling.appendChild(bbox.childNodes[0]);
      this.defs.appendChild(tiling);
      return `url(#${tilingId})`;
    }

    _makeShadingPattern(args) {
      switch (args[0]) {
        case "RadialAxial":
          const shadingId = `shading${shadingCount++}`;
          const colorStops = args[3];
          let gradient;

          switch (args[1]) {
            case "axial":
              const point0 = args[4];
              const point1 = args[5];
              gradient = this.svgFactory.createElement("svg:linearGradient");
              gradient.setAttributeNS(null, "id", shadingId);
              gradient.setAttributeNS(null, "gradientUnits", "userSpaceOnUse");
              gradient.setAttributeNS(null, "x1", point0[0]);
              gradient.setAttributeNS(null, "y1", point0[1]);
              gradient.setAttributeNS(null, "x2", point1[0]);
              gradient.setAttributeNS(null, "y2", point1[1]);
              break;

            case "radial":
              const focalPoint = args[4];
              const circlePoint = args[5];
              const focalRadius = args[6];
              const circleRadius = args[7];
              gradient = this.svgFactory.createElement("svg:radialGradient");
              gradient.setAttributeNS(null, "id", shadingId);
              gradient.setAttributeNS(null, "gradientUnits", "userSpaceOnUse");
              gradient.setAttributeNS(null, "cx", circlePoint[0]);
              gradient.setAttributeNS(null, "cy", circlePoint[1]);
              gradient.setAttributeNS(null, "r", circleRadius);
              gradient.setAttributeNS(null, "fx", focalPoint[0]);
              gradient.setAttributeNS(null, "fy", focalPoint[1]);
              gradient.setAttributeNS(null, "fr", focalRadius);
              break;

            default:
              throw new Error(`Unknown RadialAxial type: ${args[1]}`);
          }

          for (const colorStop of colorStops) {
            const stop = this.svgFactory.createElement("svg:stop");
            stop.setAttributeNS(null, "offset", colorStop[0]);
            stop.setAttributeNS(null, "stop-color", colorStop[1]);
            gradient.appendChild(stop);
          }

          this.defs.appendChild(gradient);
          return `url(#${shadingId})`;

        case "Mesh":
          (0, _util.warn)("Unimplemented pattern Mesh");
          return null;

        case "Dummy":
          return "hotpink";

        default:
          throw new Error(`Unknown IR type: ${args[0]}`);
      }
    }

    setDash(dashArray, dashPhase) {
      this.current.dashArray = dashArray;
      this.current.dashPhase = dashPhase;
    }

    constructPath(ops, args) {
      const current = this.current;
      let x = current.x,
          y = current.y;
      let d = [];
      let j = 0;

      for (const op of ops) {
        switch (op | 0) {
          case _util.OPS.rectangle:
            x = args[j++];
            y = args[j++];
            const width = args[j++];
            const height = args[j++];
            const xw = x + width;
            const yh = y + height;
            d.push("M", pf(x), pf(y), "L", pf(xw), pf(y), "L", pf(xw), pf(yh), "L", pf(x), pf(yh), "Z");
            break;

          case _util.OPS.moveTo:
            x = args[j++];
            y = args[j++];
            d.push("M", pf(x), pf(y));
            break;

          case _util.OPS.lineTo:
            x = args[j++];
            y = args[j++];
            d.push("L", pf(x), pf(y));
            break;

          case _util.OPS.curveTo:
            x = args[j + 4];
            y = args[j + 5];
            d.push("C", pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]), pf(x), pf(y));
            j += 6;
            break;

          case _util.OPS.curveTo2:
            d.push("C", pf(x), pf(y), pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]));
            x = args[j + 2];
            y = args[j + 3];
            j += 4;
            break;

          case _util.OPS.curveTo3:
            x = args[j + 2];
            y = args[j + 3];
            d.push("C", pf(args[j]), pf(args[j + 1]), pf(x), pf(y), pf(x), pf(y));
            j += 4;
            break;

          case _util.OPS.closePath:
            d.push("Z");
            break;
        }
      }

      d = d.join(" ");

      if (current.path && ops.length > 0 && ops[0] !== _util.OPS.rectangle && ops[0] !== _util.OPS.moveTo) {
        d = current.path.getAttributeNS(null, "d") + d;
      } else {
        current.path = this.svgFactory.createElement("svg:path");

        this._ensureTransformGroup().appendChild(current.path);
      }

      current.path.setAttributeNS(null, "d", d);
      current.path.setAttributeNS(null, "fill", "none");
      current.element = current.path;
      current.setCurrentPoint(x, y);
    }

    endPath() {
      const current = this.current;
      current.path = null;

      if (!this.pendingClip) {
        return;
      }

      if (!current.element) {
        this.pendingClip = null;
        return;
      }

      const clipId = `clippath${clipCount++}`;
      const clipPath = this.svgFactory.createElement("svg:clipPath");
      clipPath.setAttributeNS(null, "id", clipId);
      clipPath.setAttributeNS(null, "transform", pm(this.transformMatrix));
      const clipElement = current.element.cloneNode(true);

      if (this.pendingClip === "evenodd") {
        clipElement.setAttributeNS(null, "clip-rule", "evenodd");
      } else {
        clipElement.setAttributeNS(null, "clip-rule", "nonzero");
      }

      this.pendingClip = null;
      clipPath.appendChild(clipElement);
      this.defs.appendChild(clipPath);

      if (current.activeClipUrl) {
        current.clipGroup = null;
        this.extraStack.forEach(function (prev) {
          prev.clipGroup = null;
        });
        clipPath.setAttributeNS(null, "clip-path", current.activeClipUrl);
      }

      current.activeClipUrl = `url(#${clipId})`;
      this.tgrp = null;
    }

    clip(type) {
      this.pendingClip = type;
    }

    closePath() {
      const current = this.current;

      if (current.path) {
        const d = `${current.path.getAttributeNS(null, "d")}Z`;
        current.path.setAttributeNS(null, "d", d);
      }
    }

    setLeading(leading) {
      this.current.leading = -leading;
    }

    setTextRise(textRise) {
      this.current.textRise = textRise;
    }

    setTextRenderingMode(textRenderingMode) {
      this.current.textRenderingMode = textRenderingMode;
    }

    setHScale(scale) {
      this.current.textHScale = scale / 100;
    }

    setRenderingIntent(intent) {}

    setFlatness(flatness) {}

    setGState(states) {
      for (const [key, value] of states) {
        switch (key) {
          case "LW":
            this.setLineWidth(value);
            break;

          case "LC":
            this.setLineCap(value);
            break;

          case "LJ":
            this.setLineJoin(value);
            break;

          case "ML":
            this.setMiterLimit(value);
            break;

          case "D":
            this.setDash(value[0], value[1]);
            break;

          case "RI":
            this.setRenderingIntent(value);
            break;

          case "FL":
            this.setFlatness(value);
            break;

          case "Font":
            this.setFont(value);
            break;

          case "CA":
            this.setStrokeAlpha(value);
            break;

          case "ca":
            this.setFillAlpha(value);
            break;

          default:
            (0, _util.warn)(`Unimplemented graphic state operator ${key}`);
            break;
        }
      }
    }

    fill() {
      const current = this.current;

      if (current.element) {
        current.element.setAttributeNS(null, "fill", current.fillColor);
        current.element.setAttributeNS(null, "fill-opacity", current.fillAlpha);
        this.endPath();
      }
    }

    stroke() {
      const current = this.current;

      if (current.element) {
        this._setStrokeAttributes(current.element);

        current.element.setAttributeNS(null, "fill", "none");
        this.endPath();
      }
    }

    _setStrokeAttributes(element, lineWidthScale = 1) {
      const current = this.current;
      let dashArray = current.dashArray;

      if (lineWidthScale !== 1 && dashArray.length > 0) {
        dashArray = dashArray.map(function (value) {
          return lineWidthScale * value;
        });
      }

      element.setAttributeNS(null, "stroke", current.strokeColor);
      element.setAttributeNS(null, "stroke-opacity", current.strokeAlpha);
      element.setAttributeNS(null, "stroke-miterlimit", pf(current.miterLimit));
      element.setAttributeNS(null, "stroke-linecap", current.lineCap);
      element.setAttributeNS(null, "stroke-linejoin", current.lineJoin);
      element.setAttributeNS(null, "stroke-width", pf(lineWidthScale * current.lineWidth) + "px");
      element.setAttributeNS(null, "stroke-dasharray", dashArray.map(pf).join(" "));
      element.setAttributeNS(null, "stroke-dashoffset", pf(lineWidthScale * current.dashPhase) + "px");
    }

    eoFill() {
      if (this.current.element) {
        this.current.element.setAttributeNS(null, "fill-rule", "evenodd");
      }

      this.fill();
    }

    fillStroke() {
      this.stroke();
      this.fill();
    }

    eoFillStroke() {
      if (this.current.element) {
        this.current.element.setAttributeNS(null, "fill-rule", "evenodd");
      }

      this.fillStroke();
    }

    closeStroke() {
      this.closePath();
      this.stroke();
    }

    closeFillStroke() {
      this.closePath();
      this.fillStroke();
    }

    closeEOFillStroke() {
      this.closePath();
      this.eoFillStroke();
    }

    paintSolidColorImageMask() {
      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", "0");
      rect.setAttributeNS(null, "y", "0");
      rect.setAttributeNS(null, "width", "1px");
      rect.setAttributeNS(null, "height", "1px");
      rect.setAttributeNS(null, "fill", this.current.fillColor);

      this._ensureTransformGroup().appendChild(rect);
    }

    paintJpegXObject(objId, w, h) {
      const imgObj = this.objs.get(objId);
      const imgEl = this.svgFactory.createElement("svg:image");
      imgEl.setAttributeNS(XLINK_NS, "xlink:href", imgObj.src);
      imgEl.setAttributeNS(null, "width", pf(w));
      imgEl.setAttributeNS(null, "height", pf(h));
      imgEl.setAttributeNS(null, "x", "0");
      imgEl.setAttributeNS(null, "y", pf(-h));
      imgEl.setAttributeNS(null, "transform", `scale(${pf(1 / w)} ${pf(-1 / h)})`);

      this._ensureTransformGroup().appendChild(imgEl);
    }

    paintImageXObject(objId) {
      const imgData = this.objs.get(objId);

      if (!imgData) {
        (0, _util.warn)(`Dependent image with object ID ${objId} is not ready yet`);
        return;
      }

      this.paintInlineImageXObject(imgData);
    }

    paintInlineImageXObject(imgData, mask) {
      const width = imgData.width;
      const height = imgData.height;
      const imgSrc = convertImgDataToPng(imgData, this.forceDataSchema, !!mask);
      const cliprect = this.svgFactory.createElement("svg:rect");
      cliprect.setAttributeNS(null, "x", "0");
      cliprect.setAttributeNS(null, "y", "0");
      cliprect.setAttributeNS(null, "width", pf(width));
      cliprect.setAttributeNS(null, "height", pf(height));
      this.current.element = cliprect;
      this.clip("nonzero");
      const imgEl = this.svgFactory.createElement("svg:image");
      imgEl.setAttributeNS(XLINK_NS, "xlink:href", imgSrc);
      imgEl.setAttributeNS(null, "x", "0");
      imgEl.setAttributeNS(null, "y", pf(-height));
      imgEl.setAttributeNS(null, "width", pf(width) + "px");
      imgEl.setAttributeNS(null, "height", pf(height) + "px");
      imgEl.setAttributeNS(null, "transform", `scale(${pf(1 / width)} ${pf(-1 / height)})`);

      if (mask) {
        mask.appendChild(imgEl);
      } else {
        this._ensureTransformGroup().appendChild(imgEl);
      }
    }

    paintImageMaskXObject(imgData) {
      const current = this.current;
      const width = imgData.width;
      const height = imgData.height;
      const fillColor = current.fillColor;
      current.maskId = `mask${maskCount++}`;
      const mask = this.svgFactory.createElement("svg:mask");
      mask.setAttributeNS(null, "id", current.maskId);
      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", "0");
      rect.setAttributeNS(null, "y", "0");
      rect.setAttributeNS(null, "width", pf(width));
      rect.setAttributeNS(null, "height", pf(height));
      rect.setAttributeNS(null, "fill", fillColor);
      rect.setAttributeNS(null, "mask", `url(#${current.maskId})`);
      this.defs.appendChild(mask);

      this._ensureTransformGroup().appendChild(rect);

      this.paintInlineImageXObject(imgData, mask);
    }

    paintFormXObjectBegin(matrix, bbox) {
      if (Array.isArray(matrix) && matrix.length === 6) {
        this.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
      }

      if (bbox) {
        const width = bbox[2] - bbox[0];
        const height = bbox[3] - bbox[1];
        const cliprect = this.svgFactory.createElement("svg:rect");
        cliprect.setAttributeNS(null, "x", bbox[0]);
        cliprect.setAttributeNS(null, "y", bbox[1]);
        cliprect.setAttributeNS(null, "width", pf(width));
        cliprect.setAttributeNS(null, "height", pf(height));
        this.current.element = cliprect;
        this.clip("nonzero");
        this.endPath();
      }
    }

    paintFormXObjectEnd() {}

    _initialize(viewport) {
      const svg = this.svgFactory.create(viewport.width, viewport.height);
      const definitions = this.svgFactory.createElement("svg:defs");
      svg.appendChild(definitions);
      this.defs = definitions;
      const rootGroup = this.svgFactory.createElement("svg:g");
      rootGroup.setAttributeNS(null, "transform", pm(viewport.transform));
      svg.appendChild(rootGroup);
      this.svg = rootGroup;
      return svg;
    }

    _ensureClipGroup() {
      if (!this.current.clipGroup) {
        const clipGroup = this.svgFactory.createElement("svg:g");
        clipGroup.setAttributeNS(null, "clip-path", this.current.activeClipUrl);
        this.svg.appendChild(clipGroup);
        this.current.clipGroup = clipGroup;
      }

      return this.current.clipGroup;
    }

    _ensureTransformGroup() {
      if (!this.tgrp) {
        this.tgrp = this.svgFactory.createElement("svg:g");
        this.tgrp.setAttributeNS(null, "transform", pm(this.transformMatrix));

        if (this.current.activeClipUrl) {
          this._ensureClipGroup().appendChild(this.tgrp);
        } else {
          this.svg.appendChild(this.tgrp);
        }
      }

      return this.tgrp;
    }

  };
}

/***/ }),
/* 19 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFNodeStream = void 0;

var _util = __w_pdfjs_require__(1);

var _network_utils = __w_pdfjs_require__(20);

const fs = require("fs");

const http = require("http");

const https = require("https");

const url = require("url");

const fileUriRegex = /^file:\/\/\/[a-zA-Z]:\//;

function parseUrl(sourceUrl) {
  const parsedUrl = url.parse(sourceUrl);

  if (parsedUrl.protocol === "file:" || parsedUrl.host) {
    return parsedUrl;
  }

  if (/^[a-z]:[/\\]/i.test(sourceUrl)) {
    return url.parse(`file:///${sourceUrl}`);
  }

  if (!parsedUrl.host) {
    parsedUrl.protocol = "file:";
  }

  return parsedUrl;
}

class PDFNodeStream {
  constructor(source) {
    this.source = source;
    this.url = parseUrl(source.url);
    this.isHttp = this.url.protocol === "http:" || this.url.protocol === "https:";
    this.isFsUrl = this.url.protocol === "file:";
    this.httpHeaders = this.isHttp && source.httpHeaders || {};
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  get _progressiveDataLength() {
    return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    this._fullRequestReader = this.isFsUrl ? new PDFNodeStreamFsFullReader(this) : new PDFNodeStreamFullReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(start, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }

    const rangeReader = this.isFsUrl ? new PDFNodeStreamFsRangeReader(this, start, end) : new PDFNodeStreamRangeReader(this, start, end);

    this._rangeRequestReaders.push(rangeReader);

    return rangeReader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeRequestReaders.slice(0);

    readers.forEach(function (reader) {
      reader.cancel(reason);
    });
  }

}

exports.PDFNodeStream = PDFNodeStream;

class BaseFullReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    const source = stream.source;
    this._contentLength = source.length;
    this._loaded = 0;
    this._filename = null;
    this._disableRange = source.disableRange || false;
    this._rangeChunkSize = source.rangeChunkSize;

    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = !source.disableStream;
    this._isRangeSupported = !source.disableRange;
    this._readableStream = null;
    this._readCapability = (0, _util.createPromiseCapability)();
    this._headersCapability = (0, _util.createPromiseCapability)();
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get filename() {
    return this._filename;
  }

  get contentLength() {
    return this._contentLength;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();

    if (chunk === null) {
      this._readCapability = (0, _util.createPromiseCapability)();
      return this.read();
    }

    this._loaded += chunk.length;

    if (this.onProgress) {
      this.onProgress({
        loaded: this._loaded,
        total: this._contentLength
      });
    }

    const buffer = new Uint8Array(chunk).buffer;
    return {
      value: buffer,
      done: false
    };
  }

  cancel(reason) {
    if (!this._readableStream) {
      this._error(reason);

      return;
    }

    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;

    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });
    readableStream.on("end", () => {
      readableStream.destroy();
      this._done = true;

      this._readCapability.resolve();
    });
    readableStream.on("error", reason => {
      this._error(reason);
    });

    if (!this._isStreamingSupported && this._isRangeSupported) {
      this._error(new _util.AbortException("streaming is disabled"));
    }

    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }

}

class BaseRangeReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    this._loaded = 0;
    this._readableStream = null;
    this._readCapability = (0, _util.createPromiseCapability)();
    const source = stream.source;
    this._isStreamingSupported = !source.disableStream;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();

    if (chunk === null) {
      this._readCapability = (0, _util.createPromiseCapability)();
      return this.read();
    }

    this._loaded += chunk.length;

    if (this.onProgress) {
      this.onProgress({
        loaded: this._loaded
      });
    }

    const buffer = new Uint8Array(chunk).buffer;
    return {
      value: buffer,
      done: false
    };
  }

  cancel(reason) {
    if (!this._readableStream) {
      this._error(reason);

      return;
    }

    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;

    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });
    readableStream.on("end", () => {
      readableStream.destroy();
      this._done = true;

      this._readCapability.resolve();
    });
    readableStream.on("error", reason => {
      this._error(reason);
    });

    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }

}

function createRequestOptions(parsedUrl, headers) {
  return {
    protocol: parsedUrl.protocol,
    auth: parsedUrl.auth,
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    method: "GET",
    headers
  };
}

class PDFNodeStreamFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);

    const handleResponse = response => {
      if (response.statusCode === 404) {
        const error = new _util.MissingPDFException(`Missing PDF "${this._url}".`);
        this._storedError = error;

        this._headersCapability.reject(error);

        return;
      }

      this._headersCapability.resolve();

      this._setReadableStream(response);

      const getResponseHeader = name => {
        return this._readableStream.headers[name.toLowerCase()];
      };

      const {
        allowRangeRequests,
        suggestedLength
      } = (0, _network_utils.validateRangeRequestCapabilities)({
        getResponseHeader,
        isHttp: stream.isHttp,
        rangeChunkSize: this._rangeChunkSize,
        disableRange: this._disableRange
      });
      this._isRangeSupported = allowRangeRequests;
      this._contentLength = suggestedLength || this._contentLength;
      this._filename = (0, _network_utils.extractFilenameFromHeader)(getResponseHeader);
    };

    this._request = null;

    if (this._url.protocol === "http:") {
      this._request = http.request(createRequestOptions(this._url, stream.httpHeaders), handleResponse);
    } else {
      this._request = https.request(createRequestOptions(this._url, stream.httpHeaders), handleResponse);
    }

    this._request.on("error", reason => {
      this._storedError = reason;

      this._headersCapability.reject(reason);
    });

    this._request.end();
  }

}

class PDFNodeStreamRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);
    this._httpHeaders = {};

    for (const property in stream.httpHeaders) {
      const value = stream.httpHeaders[property];

      if (typeof value === "undefined") {
        continue;
      }

      this._httpHeaders[property] = value;
    }

    this._httpHeaders["Range"] = `bytes=${start}-${end - 1}`;

    const handleResponse = response => {
      if (response.statusCode === 404) {
        const error = new _util.MissingPDFException(`Missing PDF "${this._url}".`);
        this._storedError = error;
        return;
      }

      this._setReadableStream(response);
    };

    this._request = null;

    if (this._url.protocol === "http:") {
      this._request = http.request(createRequestOptions(this._url, this._httpHeaders), handleResponse);
    } else {
      this._request = https.request(createRequestOptions(this._url, this._httpHeaders), handleResponse);
    }

    this._request.on("error", reason => {
      this._storedError = reason;
    });

    this._request.end();
  }

}

class PDFNodeStreamFsFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);
    let path = decodeURIComponent(this._url.path);

    if (fileUriRegex.test(this._url.href)) {
      path = path.replace(/^\//, "");
    }

    fs.lstat(path, (error, stat) => {
      if (error) {
        if (error.code === "ENOENT") {
          error = new _util.MissingPDFException(`Missing PDF "${path}".`);
        }

        this._storedError = error;

        this._headersCapability.reject(error);

        return;
      }

      this._contentLength = stat.size;

      this._setReadableStream(fs.createReadStream(path));

      this._headersCapability.resolve();
    });
  }

}

class PDFNodeStreamFsRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);
    let path = decodeURIComponent(this._url.path);

    if (fileUriRegex.test(this._url.href)) {
      path = path.replace(/^\//, "");
    }

    this._setReadableStream(fs.createReadStream(path, {
      start,
      end: end - 1
    }));
  }

}

/***/ }),
/* 20 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createResponseStatusError = createResponseStatusError;
exports.extractFilenameFromHeader = extractFilenameFromHeader;
exports.validateRangeRequestCapabilities = validateRangeRequestCapabilities;
exports.validateResponseStatus = validateResponseStatus;

var _util = __w_pdfjs_require__(1);

var _content_disposition = __w_pdfjs_require__(21);

function validateRangeRequestCapabilities({
  getResponseHeader,
  isHttp,
  rangeChunkSize,
  disableRange
}) {
  (0, _util.assert)(rangeChunkSize > 0, "Range chunk size must be larger than zero");
  const returnValues = {
    allowRangeRequests: false,
    suggestedLength: undefined
  };
  const length = parseInt(getResponseHeader("Content-Length"), 10);

  if (!Number.isInteger(length)) {
    return returnValues;
  }

  returnValues.suggestedLength = length;

  if (length <= 2 * rangeChunkSize) {
    return returnValues;
  }

  if (disableRange || !isHttp) {
    return returnValues;
  }

  if (getResponseHeader("Accept-Ranges") !== "bytes") {
    return returnValues;
  }

  const contentEncoding = getResponseHeader("Content-Encoding") || "identity";

  if (contentEncoding !== "identity") {
    return returnValues;
  }

  returnValues.allowRangeRequests = true;
  return returnValues;
}

function extractFilenameFromHeader(getResponseHeader) {
  const contentDisposition = getResponseHeader("Content-Disposition");

  if (contentDisposition) {
    let filename = (0, _content_disposition.getFilenameFromContentDispositionHeader)(contentDisposition);

    if (filename.includes("%")) {
      try {
        filename = decodeURIComponent(filename);
      } catch (ex) {}
    }

    if (/\.pdf$/i.test(filename)) {
      return filename;
    }
  }

  return null;
}

function createResponseStatusError(status, url) {
  if (status === 404 || status === 0 && url.startsWith("file:")) {
    return new _util.MissingPDFException('Missing PDF "' + url + '".');
  }

  return new _util.UnexpectedResponseException("Unexpected server response (" + status + ') while retrieving PDF "' + url + '".', status);
}

function validateResponseStatus(status) {
  return status === 200 || status === 206;
}

/***/ }),
/* 21 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getFilenameFromContentDispositionHeader = getFilenameFromContentDispositionHeader;

function getFilenameFromContentDispositionHeader(contentDisposition) {
  let needsEncodingFixup = true;
  let tmp = toParamRegExp("filename\\*", "i").exec(contentDisposition);

  if (tmp) {
    tmp = tmp[1];
    let filename = rfc2616unquote(tmp);
    filename = unescape(filename);
    filename = rfc5987decode(filename);
    filename = rfc2047decode(filename);
    return fixupEncoding(filename);
  }

  tmp = rfc2231getparam(contentDisposition);

  if (tmp) {
    const filename = rfc2047decode(tmp);
    return fixupEncoding(filename);
  }

  tmp = toParamRegExp("filename", "i").exec(contentDisposition);

  if (tmp) {
    tmp = tmp[1];
    let filename = rfc2616unquote(tmp);
    filename = rfc2047decode(filename);
    return fixupEncoding(filename);
  }

  function toParamRegExp(attributePattern, flags) {
    return new RegExp("(?:^|;)\\s*" + attributePattern + "\\s*=\\s*" + "(" + '[^";\\s][^;\\s]*' + "|" + '"(?:[^"\\\\]|\\\\"?)+"?' + ")", flags);
  }

  function textdecode(encoding, value) {
    if (encoding) {
      if (!/^[\x00-\xFF]+$/.test(value)) {
        return value;
      }

      try {
        const decoder = new TextDecoder(encoding, {
          fatal: true
        });
        const bytes = Array.from(value, function (ch) {
          return ch.charCodeAt(0) & 0xff;
        });
        value = decoder.decode(new Uint8Array(bytes));
        needsEncodingFixup = false;
      } catch (e) {
        if (/^utf-?8$/i.test(encoding)) {
          try {
            value = decodeURIComponent(escape(value));
            needsEncodingFixup = false;
          } catch (err) {}
        }
      }
    }

    return value;
  }

  function fixupEncoding(value) {
    if (needsEncodingFixup && /[\x80-\xff]/.test(value)) {
      value = textdecode("utf-8", value);

      if (needsEncodingFixup) {
        value = textdecode("iso-8859-1", value);
      }
    }

    return value;
  }

  function rfc2231getparam(contentDispositionStr) {
    const matches = [];
    let match;
    const iter = toParamRegExp("filename\\*((?!0\\d)\\d+)(\\*?)", "ig");

    while ((match = iter.exec(contentDispositionStr)) !== null) {
      let [, n, quot, part] = match;
      n = parseInt(n, 10);

      if (n in matches) {
        if (n === 0) {
          break;
        }

        continue;
      }

      matches[n] = [quot, part];
    }

    const parts = [];

    for (let n = 0; n < matches.length; ++n) {
      if (!(n in matches)) {
        break;
      }

      let [quot, part] = matches[n];
      part = rfc2616unquote(part);

      if (quot) {
        part = unescape(part);

        if (n === 0) {
          part = rfc5987decode(part);
        }
      }

      parts.push(part);
    }

    return parts.join("");
  }

  function rfc2616unquote(value) {
    if (value.startsWith('"')) {
      const parts = value.slice(1).split('\\"');

      for (let i = 0; i < parts.length; ++i) {
        const quotindex = parts[i].indexOf('"');

        if (quotindex !== -1) {
          parts[i] = parts[i].slice(0, quotindex);
          parts.length = i + 1;
        }

        parts[i] = parts[i].replace(/\\(.)/g, "$1");
      }

      value = parts.join('"');
    }

    return value;
  }

  function rfc5987decode(extvalue) {
    const encodingend = extvalue.indexOf("'");

    if (encodingend === -1) {
      return extvalue;
    }

    const encoding = extvalue.slice(0, encodingend);
    const langvalue = extvalue.slice(encodingend + 1);
    const value = langvalue.replace(/^[^']*'/, "");
    return textdecode(encoding, value);
  }

  function rfc2047decode(value) {
    if (!value.startsWith("=?") || /[\x00-\x19\x80-\xff]/.test(value)) {
      return value;
    }

    return value.replace(/=\?([\w-]*)\?([QqBb])\?((?:[^?]|\?(?!=))*)\?=/g, function (matches, charset, encoding, text) {
      if (encoding === "q" || encoding === "Q") {
        text = text.replace(/_/g, " ");
        text = text.replace(/=([0-9a-fA-F]{2})/g, function (match, hex) {
          return String.fromCharCode(parseInt(hex, 16));
        });
        return textdecode(charset, text);
      }

      try {
        text = atob(text);
      } catch (e) {}

      return textdecode(charset, text);
    });
  }

  return "";
}

/***/ }),
/* 22 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFNetworkStream = void 0;

var _util = __w_pdfjs_require__(1);

var _network_utils = __w_pdfjs_require__(20);

;
const OK_RESPONSE = 200;
const PARTIAL_CONTENT_RESPONSE = 206;

function getArrayBuffer(xhr) {
  const data = xhr.response;

  if (typeof data !== "string") {
    return data;
  }

  const array = (0, _util.stringToBytes)(data);
  return array.buffer;
}

class NetworkManager {
  constructor(url, args) {
    this.url = url;
    args = args || {};
    this.isHttp = /^https?:/i.test(url);
    this.httpHeaders = this.isHttp && args.httpHeaders || {};
    this.withCredentials = args.withCredentials || false;

    this.getXhr = args.getXhr || function NetworkManager_getXhr() {
      return new XMLHttpRequest();
    };

    this.currXhrId = 0;
    this.pendingRequests = Object.create(null);
  }

  requestRange(begin, end, listeners) {
    const args = {
      begin,
      end
    };

    for (const prop in listeners) {
      args[prop] = listeners[prop];
    }

    return this.request(args);
  }

  requestFull(listeners) {
    return this.request(listeners);
  }

  request(args) {
    const xhr = this.getXhr();
    const xhrId = this.currXhrId++;
    const pendingRequest = this.pendingRequests[xhrId] = {
      xhr
    };
    xhr.open("GET", this.url);
    xhr.withCredentials = this.withCredentials;

    for (const property in this.httpHeaders) {
      const value = this.httpHeaders[property];

      if (typeof value === "undefined") {
        continue;
      }

      xhr.setRequestHeader(property, value);
    }

    if (this.isHttp && "begin" in args && "end" in args) {
      xhr.setRequestHeader("Range", `bytes=${args.begin}-${args.end - 1}`);
      pendingRequest.expectedStatus = PARTIAL_CONTENT_RESPONSE;
    } else {
      pendingRequest.expectedStatus = OK_RESPONSE;
    }

    xhr.responseType = "arraybuffer";

    if (args.onError) {
      xhr.onerror = function (evt) {
        args.onError(xhr.status);
      };
    }

    xhr.onreadystatechange = this.onStateChange.bind(this, xhrId);
    xhr.onprogress = this.onProgress.bind(this, xhrId);
    pendingRequest.onHeadersReceived = args.onHeadersReceived;
    pendingRequest.onDone = args.onDone;
    pendingRequest.onError = args.onError;
    pendingRequest.onProgress = args.onProgress;
    xhr.send(null);
    return xhrId;
  }

  onProgress(xhrId, evt) {
    const pendingRequest = this.pendingRequests[xhrId];

    if (!pendingRequest) {
      return;
    }

    if (pendingRequest.onProgress) {
      pendingRequest.onProgress(evt);
    }
  }

  onStateChange(xhrId, evt) {
    const pendingRequest = this.pendingRequests[xhrId];

    if (!pendingRequest) {
      return;
    }

    const xhr = pendingRequest.xhr;

    if (xhr.readyState >= 2 && pendingRequest.onHeadersReceived) {
      pendingRequest.onHeadersReceived();
      delete pendingRequest.onHeadersReceived;
    }

    if (xhr.readyState !== 4) {
      return;
    }

    if (!(xhrId in this.pendingRequests)) {
      return;
    }

    delete this.pendingRequests[xhrId];

    if (xhr.status === 0 && this.isHttp) {
      if (pendingRequest.onError) {
        pendingRequest.onError(xhr.status);
      }

      return;
    }

    const xhrStatus = xhr.status || OK_RESPONSE;
    const ok_response_on_range_request = xhrStatus === OK_RESPONSE && pendingRequest.expectedStatus === PARTIAL_CONTENT_RESPONSE;

    if (!ok_response_on_range_request && xhrStatus !== pendingRequest.expectedStatus) {
      if (pendingRequest.onError) {
        pendingRequest.onError(xhr.status);
      }

      return;
    }

    const chunk = getArrayBuffer(xhr);

    if (xhrStatus === PARTIAL_CONTENT_RESPONSE) {
      const rangeHeader = xhr.getResponseHeader("Content-Range");
      const matches = /bytes (\d+)-(\d+)\/(\d+)/.exec(rangeHeader);
      pendingRequest.onDone({
        begin: parseInt(matches[1], 10),
        chunk
      });
    } else if (chunk) {
      pendingRequest.onDone({
        begin: 0,
        chunk
      });
    } else if (pendingRequest.onError) {
      pendingRequest.onError(xhr.status);
    }
  }

  hasPendingRequests() {
    for (const xhrId in this.pendingRequests) {
      return true;
    }

    return false;
  }

  getRequestXhr(xhrId) {
    return this.pendingRequests[xhrId].xhr;
  }

  isPendingRequest(xhrId) {
    return xhrId in this.pendingRequests;
  }

  abortAllRequests() {
    for (const xhrId in this.pendingRequests) {
      this.abortRequest(xhrId | 0);
    }
  }

  abortRequest(xhrId) {
    const xhr = this.pendingRequests[xhrId].xhr;
    delete this.pendingRequests[xhrId];
    xhr.abort();
  }

}

class PDFNetworkStream {
  constructor(source) {
    this._source = source;
    this._manager = new NetworkManager(source.url, {
      httpHeaders: source.httpHeaders,
      withCredentials: source.withCredentials
    });
    this._rangeChunkSize = source.rangeChunkSize;
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  _onRangeRequestReaderClosed(reader) {
    const i = this._rangeRequestReaders.indexOf(reader);

    if (i >= 0) {
      this._rangeRequestReaders.splice(i, 1);
    }
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    this._fullRequestReader = new PDFNetworkStreamFullRequestReader(this._manager, this._source);
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    const reader = new PDFNetworkStreamRangeRequestReader(this._manager, begin, end);
    reader.onClosed = this._onRangeRequestReaderClosed.bind(this);

    this._rangeRequestReaders.push(reader);

    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeRequestReaders.slice(0);

    readers.forEach(function (reader) {
      reader.cancel(reason);
    });
  }

}

exports.PDFNetworkStream = PDFNetworkStream;

class PDFNetworkStreamFullRequestReader {
  constructor(manager, source) {
    this._manager = manager;
    const args = {
      onHeadersReceived: this._onHeadersReceived.bind(this),
      onDone: this._onDone.bind(this),
      onError: this._onError.bind(this),
      onProgress: this._onProgress.bind(this)
    };
    this._url = source.url;
    this._fullRequestId = manager.requestFull(args);
    this._headersReceivedCapability = (0, _util.createPromiseCapability)();
    this._disableRange = source.disableRange || false;
    this._contentLength = source.length;
    this._rangeChunkSize = source.rangeChunkSize;

    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = false;
    this._isRangeSupported = false;
    this._cachedChunks = [];
    this._requests = [];
    this._done = false;
    this._storedError = undefined;
    this._filename = null;
    this.onProgress = null;
  }

  _onHeadersReceived() {
    const fullRequestXhrId = this._fullRequestId;

    const fullRequestXhr = this._manager.getRequestXhr(fullRequestXhrId);

    const getResponseHeader = name => {
      return fullRequestXhr.getResponseHeader(name);
    };

    const {
      allowRangeRequests,
      suggestedLength
    } = (0, _network_utils.validateRangeRequestCapabilities)({
      getResponseHeader,
      isHttp: this._manager.isHttp,
      rangeChunkSize: this._rangeChunkSize,
      disableRange: this._disableRange
    });

    if (allowRangeRequests) {
      this._isRangeSupported = true;
    }

    this._contentLength = suggestedLength || this._contentLength;
    this._filename = (0, _network_utils.extractFilenameFromHeader)(getResponseHeader);

    if (this._isRangeSupported) {
      this._manager.abortRequest(fullRequestXhrId);
    }

    this._headersReceivedCapability.resolve();
  }

  _onDone(args) {
    if (args) {
      if (this._requests.length > 0) {
        const requestCapability = this._requests.shift();

        requestCapability.resolve({
          value: args.chunk,
          done: false
        });
      } else {
        this._cachedChunks.push(args.chunk);
      }
    }

    this._done = true;

    if (this._cachedChunks.length > 0) {
      return;
    }

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];
  }

  _onError(status) {
    const url = this._url;
    const exception = (0, _network_utils.createResponseStatusError)(status, url);
    this._storedError = exception;

    this._headersReceivedCapability.reject(exception);

    this._requests.forEach(function (requestCapability) {
      requestCapability.reject(exception);
    });

    this._requests = [];
    this._cachedChunks = [];
  }

  _onProgress(data) {
    if (this.onProgress) {
      this.onProgress({
        loaded: data.loaded,
        total: data.lengthComputable ? data.total : this._contentLength
      });
    }
  }

  get filename() {
    return this._filename;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  get contentLength() {
    return this._contentLength;
  }

  get headersReady() {
    return this._headersReceivedCapability.promise;
  }

  async read() {
    if (this._storedError) {
      throw this._storedError;
    }

    if (this._cachedChunks.length > 0) {
      const chunk = this._cachedChunks.shift();

      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;

    this._headersReceivedCapability.reject(reason);

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];

    if (this._manager.isPendingRequest(this._fullRequestId)) {
      this._manager.abortRequest(this._fullRequestId);
    }

    this._fullRequestReader = null;
  }

}

class PDFNetworkStreamRangeRequestReader {
  constructor(manager, begin, end) {
    this._manager = manager;
    const args = {
      onDone: this._onDone.bind(this),
      onProgress: this._onProgress.bind(this)
    };
    this._requestId = manager.requestRange(begin, end, args);
    this._requests = [];
    this._queuedChunk = null;
    this._done = false;
    this.onProgress = null;
    this.onClosed = null;
  }

  _close() {
    if (this.onClosed) {
      this.onClosed(this);
    }
  }

  _onDone(data) {
    const chunk = data.chunk;

    if (this._requests.length > 0) {
      const requestCapability = this._requests.shift();

      requestCapability.resolve({
        value: chunk,
        done: false
      });
    } else {
      this._queuedChunk = chunk;
    }

    this._done = true;

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];

    this._close();
  }

  _onProgress(evt) {
    if (!this.isStreamingSupported && this.onProgress) {
      this.onProgress({
        loaded: evt.loaded
      });
    }
  }

  get isStreamingSupported() {
    return false;
  }

  async read() {
    if (this._queuedChunk !== null) {
      const chunk = this._queuedChunk;
      this._queuedChunk = null;
      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];

    if (this._manager.isPendingRequest(this._requestId)) {
      this._manager.abortRequest(this._requestId);
    }

    this._close();
  }

}

/***/ }),
/* 23 */
/***/ (function(module, exports, __w_pdfjs_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFFetchStream = void 0;

var _util = __w_pdfjs_require__(1);

var _network_utils = __w_pdfjs_require__(20);

function createFetchOptions(headers, withCredentials, abortController) {
  return {
    method: "GET",
    headers,
    signal: abortController && abortController.signal,
    mode: "cors",
    credentials: withCredentials ? "include" : "same-origin",
    redirect: "follow"
  };
}

function createHeaders(httpHeaders) {
  const headers = new Headers();

  for (const property in httpHeaders) {
    const value = httpHeaders[property];

    if (typeof value === "undefined") {
      continue;
    }

    headers.append(property, value);
  }

  return headers;
}

class PDFFetchStream {
  constructor(source) {
    this.source = source;
    this.isHttp = /^https?:/i.test(source.url);
    this.httpHeaders = this.isHttp && source.httpHeaders || {};
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  get _progressiveDataLength() {
    return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    this._fullRequestReader = new PDFFetchStreamReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }

    const reader = new PDFFetchStreamRangeReader(this, begin, end);

    this._rangeRequestReaders.push(reader);

    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeRequestReaders.slice(0);

    readers.forEach(function (reader) {
      reader.cancel(reason);
    });
  }

}

exports.PDFFetchStream = PDFFetchStream;

class PDFFetchStreamReader {
  constructor(stream) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._filename = null;
    const source = stream.source;
    this._withCredentials = source.withCredentials || false;
    this._contentLength = source.length;
    this._headersCapability = (0, _util.createPromiseCapability)();
    this._disableRange = source.disableRange || false;
    this._rangeChunkSize = source.rangeChunkSize;

    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    if (typeof AbortController !== "undefined") {
      this._abortController = new AbortController();
    }

    this._isStreamingSupported = !source.disableStream;
    this._isRangeSupported = !source.disableRange;
    this._headers = createHeaders(this._stream.httpHeaders);
    const url = source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials, this._abortController)).then(response => {
      if (!(0, _network_utils.validateResponseStatus)(response.status)) {
        throw (0, _network_utils.createResponseStatusError)(response.status, url);
      }

      this._reader = response.body.getReader();

      this._headersCapability.resolve();

      const getResponseHeader = name => {
        return response.headers.get(name);
      };

      const {
        allowRangeRequests,
        suggestedLength
      } = (0, _network_utils.validateRangeRequestCapabilities)({
        getResponseHeader,
        isHttp: this._stream.isHttp,
        rangeChunkSize: this._rangeChunkSize,
        disableRange: this._disableRange
      });
      this._isRangeSupported = allowRangeRequests;
      this._contentLength = suggestedLength || this._contentLength;
      this._filename = (0, _network_utils.extractFilenameFromHeader)(getResponseHeader);

      if (!this._isStreamingSupported && this._isRangeSupported) {
        this.cancel(new _util.AbortException("Streaming is disabled."));
      }
    }).catch(this._headersCapability.reject);
    this.onProgress = null;
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get filename() {
    return this._filename;
  }

  get contentLength() {
    return this._contentLength;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._headersCapability.promise;
    const {
      value,
      done
    } = await this._reader.read();

    if (done) {
      return {
        value,
        done
      };
    }

    this._loaded += value.byteLength;

    if (this.onProgress) {
      this.onProgress({
        loaded: this._loaded,
        total: this._contentLength
      });
    }

    const buffer = new Uint8Array(value).buffer;
    return {
      value: buffer,
      done: false
    };
  }

  cancel(reason) {
    if (this._reader) {
      this._reader.cancel(reason);
    }

    if (this._abortController) {
      this._abortController.abort();
    }
  }

}

class PDFFetchStreamRangeReader {
  constructor(stream, begin, end) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    const source = stream.source;
    this._withCredentials = source.withCredentials || false;
    this._readCapability = (0, _util.createPromiseCapability)();
    this._isStreamingSupported = !source.disableStream;

    if (typeof AbortController !== "undefined") {
      this._abortController = new AbortController();
    }

    this._headers = createHeaders(this._stream.httpHeaders);

    this._headers.append("Range", `bytes=${begin}-${end - 1}`);

    const url = source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials, this._abortController)).then(response => {
      if (!(0, _network_utils.validateResponseStatus)(response.status)) {
        throw (0, _network_utils.createResponseStatusError)(response.status, url);
      }

      this._readCapability.resolve();

      this._reader = response.body.getReader();
    });
    this.onProgress = null;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    const {
      value,
      done
    } = await this._reader.read();

    if (done) {
      return {
        value,
        done
      };
    }

    this._loaded += value.byteLength;

    if (this.onProgress) {
      this.onProgress({
        loaded: this._loaded
      });
    }

    const buffer = new Uint8Array(value).buffer;
    return {
      value: buffer,
      done: false
    };
  }

  cancel(reason) {
    if (this._reader) {
      this._reader.cancel(reason);
    }

    if (this._abortController) {
      this._abortController.abort();
    }
  }

}

/***/ })
/******/ ]);
});
//# sourceMappingURL=pdf.js.map