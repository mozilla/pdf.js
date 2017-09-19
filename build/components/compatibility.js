/* Copyright 2017 Mozilla Foundation
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

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("pdfjs-dist/web/compatibility", [], factory);
	else if(typeof exports === 'object')
		exports["pdfjs-dist/web/compatibility"] = factory();
	else
		root["pdfjs-dist/web/compatibility"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
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
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
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
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 44);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var store = __webpack_require__(39)('wks');
var uid = __webpack_require__(8);
var _Symbol = __webpack_require__(1).Symbol;
var USE_SYMBOL = typeof _Symbol == 'function';
var $exports = module.exports = function (name) {
  return store[name] || (store[name] = USE_SYMBOL && _Symbol[name] || (USE_SYMBOL ? _Symbol : uid)('Symbol.' + name));
};
$exports.store = store;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = module.exports = typeof window != 'undefined' && window.Math == Math ? window : typeof self != 'undefined' && self.Math == Math ? self : Function('return this')();
if (typeof __g == 'number') __g = global;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = !__webpack_require__(12)(function () {
  return Object.defineProperty({}, 'a', {
    get: function get() {
      return 7;
    }
  }).a != 7;
});

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var dP = __webpack_require__(6);
var createDesc = __webpack_require__(15);
module.exports = __webpack_require__(2) ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var hasOwnProperty = {}.hasOwnProperty;
module.exports = function (it, key) {
  return hasOwnProperty.call(it, key);
};

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toInteger = __webpack_require__(9);
var min = Math.min;
module.exports = function (it) {
  return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
};

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var anObject = __webpack_require__(14);
var IE8_DOM_DEFINE = __webpack_require__(27);
var toPrimitive = __webpack_require__(19);
var dP = Object.defineProperty;
exports.f = __webpack_require__(2) ? Object.defineProperty : function defineProperty(O, P, Attributes) {
  anObject(O);
  P = toPrimitive(P, true);
  anObject(Attributes);
  if (IE8_DOM_DEFINE) try {
    return dP(O, P, Attributes);
  } catch (e) {}
  if ('get' in Attributes || 'set' in Attributes) throw TypeError('Accessors not supported!');
  if ('value' in Attributes) O[P] = Attributes.value;
  return O;
};

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function (it) {
  return (typeof it === 'undefined' ? 'undefined' : _typeof(it)) === 'object' ? it !== null : typeof it === 'function';
};

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var id = 0;
var px = Math.random();
module.exports = function (key) {
  return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
};

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var ceil = Math.ceil;
var floor = Math.floor;
module.exports = function (it) {
  return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
};

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var defined = __webpack_require__(37);
module.exports = function (it) {
  return Object(defined(it));
};

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = {};

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (exec) {
  try {
    return !!exec();
  } catch (e) {
    return true;
  }
};

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var core = module.exports = { version: '2.5.1' };
if (typeof __e == 'number') __e = core;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var isObject = __webpack_require__(7);
module.exports = function (it) {
  if (!isObject(it)) throw TypeError(it + ' is not an object!');
  return it;
};

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var IObject = __webpack_require__(36);
var defined = __webpack_require__(37);
module.exports = function (it) {
  return IObject(defined(it));
};

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toInteger = __webpack_require__(9);
var max = Math.max;
var min = Math.min;
module.exports = function (index, length) {
  index = toInteger(index);
  return index < 0 ? max(index + length, 0) : min(index, length);
};

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = false;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var isObject = __webpack_require__(7);
module.exports = function (it, S) {
  if (!isObject(it)) return it;
  var fn, val;
  if (S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  if (typeof (fn = it.valueOf) == 'function' && !isObject(val = fn.call(it))) return val;
  if (!S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  throw TypeError("Can't convert object to primitive value");
};

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var hide = __webpack_require__(3);
var has = __webpack_require__(4);
var SRC = __webpack_require__(8)('src');
var TO_STRING = 'toString';
var $toString = Function[TO_STRING];
var TPL = ('' + $toString).split(TO_STRING);
__webpack_require__(13).inspectSource = function (it) {
  return $toString.call(it);
};
(module.exports = function (O, key, val, safe) {
  var isFunction = typeof val == 'function';
  if (isFunction) has(val, 'name') || hide(val, 'name', key);
  if (O[key] === val) return;
  if (isFunction) has(val, SRC) || hide(val, SRC, O[key] ? '' + O[key] : TPL.join(String(key)));
  if (O === global) {
    O[key] = val;
  } else if (!safe) {
    delete O[key];
    hide(O, key, val);
  } else if (O[key]) {
    O[key] = val;
  } else {
    hide(O, key, val);
  }
})(Function.prototype, TO_STRING, function toString() {
  return typeof this == 'function' && this[SRC] || $toString.call(this);
});

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var aFunction = __webpack_require__(29);
module.exports = function (fn, that, length) {
  aFunction(fn);
  if (that === undefined) return fn;
  switch (length) {
    case 1:
      return function (a) {
        return fn.call(that, a);
      };
    case 2:
      return function (a, b) {
        return fn.call(that, a, b);
      };
    case 3:
      return function (a, b, c) {
        return fn.call(that, a, b, c);
      };
  }
  return function () {
    return fn.apply(that, arguments);
  };
};

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toString = {}.toString;
module.exports = function (it) {
  return toString.call(it).slice(8, -1);
};

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var shared = __webpack_require__(39)('keys');
var uid = __webpack_require__(8);
module.exports = function (key) {
  return shared[key] || (shared[key] = uid(key));
};

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = 'constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf'.split(',');

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var def = __webpack_require__(6).f;
var has = __webpack_require__(4);
var TAG = __webpack_require__(0)('toStringTag');
module.exports = function (it, tag, stat) {
  if (it && !has(it = stat ? it : it.prototype, TAG)) def(it, TAG, {
    configurable: true,
    value: tag
  });
};

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var core = __webpack_require__(13);
var hide = __webpack_require__(3);
var redefine = __webpack_require__(20);
var ctx = __webpack_require__(21);
var PROTOTYPE = 'prototype';
var $export = function $export(type, name, source) {
  var IS_FORCED = type & $export.F;
  var IS_GLOBAL = type & $export.G;
  var IS_STATIC = type & $export.S;
  var IS_PROTO = type & $export.P;
  var IS_BIND = type & $export.B;
  var target = IS_GLOBAL ? global : IS_STATIC ? global[name] || (global[name] = {}) : (global[name] || {})[PROTOTYPE];
  var exports = IS_GLOBAL ? core : core[name] || (core[name] = {});
  var expProto = exports[PROTOTYPE] || (exports[PROTOTYPE] = {});
  var key, own, out, exp;
  if (IS_GLOBAL) source = name;
  for (key in source) {
    own = !IS_FORCED && target && target[key] !== undefined;
    out = (own ? target : source)[key];
    exp = IS_BIND && own ? ctx(out, global) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
    if (target) redefine(target, key, out, type & $export.U);
    if (exports[key] != out) hide(exports, key, exp);
    if (IS_PROTO && expProto[key] != out) expProto[key] = out;
  }
};
global.core = core;
$export.F = 1;
$export.G = 2;
$export.S = 4;
$export.P = 8;
$export.B = 16;
$export.W = 32;
$export.U = 64;
$export.R = 128;
module.exports = $export;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = !__webpack_require__(2) && !__webpack_require__(12)(function () {
  return Object.defineProperty(__webpack_require__(28)('div'), 'a', {
    get: function get() {
      return 7;
    }
  }).a != 7;
});

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var isObject = __webpack_require__(7);
var document = __webpack_require__(1).document;
var is = isObject(document) && isObject(document.createElement);
module.exports = function (it) {
  return is ? document.createElement(it) : {};
};

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (it) {
  if (typeof it != 'function') throw TypeError(it + ' is not a function!');
  return it;
};

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var hide = __webpack_require__(3);
var uid = __webpack_require__(8);
var TYPED = uid('typed_array');
var VIEW = uid('view');
var ABV = !!(global.ArrayBuffer && global.DataView);
var CONSTR = ABV;
var i = 0;
var l = 9;
var Typed;
var TypedArrayConstructors = 'Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array'.split(',');
while (i < l) {
  if (Typed = global[TypedArrayConstructors[i++]]) {
    hide(Typed.prototype, TYPED, true);
    hide(Typed.prototype, VIEW, true);
  } else CONSTR = false;
}
module.exports = {
  ABV: ABV,
  CONSTR: CONSTR,
  TYPED: TYPED,
  VIEW: VIEW
};

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var redefine = __webpack_require__(20);
module.exports = function (target, src, safe) {
  for (var key in src) {
    redefine(target, key, src[key], safe);
  }return target;
};

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (it, Constructor, name, forbiddenField) {
  if (!(it instanceof Constructor) || forbiddenField !== undefined && forbiddenField in it) {
    throw TypeError(name + ': incorrect invocation!');
  }
  return it;
};

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toInteger = __webpack_require__(9);
var toLength = __webpack_require__(5);
module.exports = function (it) {
  if (it === undefined) return 0;
  var number = toInteger(it);
  var length = toLength(number);
  if (number !== length) throw RangeError('Wrong length!');
  return length;
};

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var $keys = __webpack_require__(35);
var hiddenKeys = __webpack_require__(24).concat('length', 'prototype');
exports.f = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
  return $keys(O, hiddenKeys);
};

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var has = __webpack_require__(4);
var toIObject = __webpack_require__(16);
var arrayIndexOf = __webpack_require__(38)(false);
var IE_PROTO = __webpack_require__(23)('IE_PROTO');
module.exports = function (object, names) {
  var O = toIObject(object);
  var i = 0;
  var result = [];
  var key;
  for (key in O) {
    if (key != IE_PROTO) has(O, key) && result.push(key);
  }while (names.length > i) {
    if (has(O, key = names[i++])) {
      ~arrayIndexOf(result, key) || result.push(key);
    }
  }return result;
};

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var cof = __webpack_require__(22);
module.exports = Object('z').propertyIsEnumerable(0) ? Object : function (it) {
  return cof(it) == 'String' ? it.split('') : Object(it);
};

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (it) {
  if (it == undefined) throw TypeError("Can't call method on  " + it);
  return it;
};

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toIObject = __webpack_require__(16);
var toLength = __webpack_require__(5);
var toAbsoluteIndex = __webpack_require__(17);
module.exports = function (IS_INCLUDES) {
  return function ($this, el, fromIndex) {
    var O = toIObject($this);
    var length = toLength(O.length);
    var index = toAbsoluteIndex(fromIndex, length);
    var value;
    if (IS_INCLUDES && el != el) while (length > index) {
      value = O[index++];
      if (value != value) return true;
    } else for (; length > index; index++) {
      if (IS_INCLUDES || index in O) {
        if (O[index] === el) return IS_INCLUDES || index || 0;
      }
    }return !IS_INCLUDES && -1;
  };
};

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var SHARED = '__core-js_shared__';
var store = global[SHARED] || (global[SHARED] = {});
module.exports = function (key) {
  return store[key] || (store[key] = {});
};

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toObject = __webpack_require__(10);
var toAbsoluteIndex = __webpack_require__(17);
var toLength = __webpack_require__(5);
module.exports = function fill(value) {
  var O = toObject(this);
  var length = toLength(O.length);
  var aLen = arguments.length;
  var index = toAbsoluteIndex(aLen > 1 ? arguments[1] : undefined, length);
  var end = aLen > 2 ? arguments[2] : undefined;
  var endPos = end === undefined ? length : toAbsoluteIndex(end, length);
  while (endPos > index) {
    O[index++] = value;
  }return O;
};

/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var cof = __webpack_require__(22);
var TAG = __webpack_require__(0)('toStringTag');
var ARG = cof(function () {
  return arguments;
}()) == 'Arguments';
var tryGet = function tryGet(it, key) {
  try {
    return it[key];
  } catch (e) {}
};
module.exports = function (it) {
  var O, T, B;
  return it === undefined ? 'Undefined' : it === null ? 'Null' : typeof (T = tryGet(O = Object(it), TAG)) == 'string' ? T : ARG ? cof(O) : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
};

/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var anObject = __webpack_require__(14);
var dPs = __webpack_require__(52);
var enumBugKeys = __webpack_require__(24);
var IE_PROTO = __webpack_require__(23)('IE_PROTO');
var Empty = function Empty() {};
var PROTOTYPE = 'prototype';
var _createDict = function createDict() {
  var iframe = __webpack_require__(28)('iframe');
  var i = enumBugKeys.length;
  var lt = '<';
  var gt = '>';
  var iframeDocument;
  iframe.style.display = 'none';
  __webpack_require__(54).appendChild(iframe);
  iframe.src = 'javascript:';
  iframeDocument = iframe.contentWindow.document;
  iframeDocument.open();
  iframeDocument.write(lt + 'script' + gt + 'document.F=Object' + lt + '/script' + gt);
  iframeDocument.close();
  _createDict = iframeDocument.F;
  while (i--) {
    delete _createDict[PROTOTYPE][enumBugKeys[i]];
  }return _createDict();
};
module.exports = Object.create || function create(O, Properties) {
  var result;
  if (O !== null) {
    Empty[PROTOTYPE] = anObject(O);
    result = new Empty();
    Empty[PROTOTYPE] = null;
    result[IE_PROTO] = O;
  } else result = _createDict();
  return Properties === undefined ? result : dPs(result, Properties);
};

/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var has = __webpack_require__(4);
var toObject = __webpack_require__(10);
var IE_PROTO = __webpack_require__(23)('IE_PROTO');
var ObjectProto = Object.prototype;
module.exports = Object.getPrototypeOf || function (O) {
  O = toObject(O);
  if (has(O, IE_PROTO)) return O[IE_PROTO];
  if (typeof O.constructor == 'function' && O instanceof O.constructor) {
    return O.constructor.prototype;
  }
  return O instanceof Object ? ObjectProto : null;
};

/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


__webpack_require__(45);

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

if (typeof PDFJS === 'undefined' || !PDFJS.compatibilityChecked) {
  var globalScope = __webpack_require__(46);
  var userAgent = typeof navigator !== 'undefined' && navigator.userAgent || '';
  var isAndroid = /Android/.test(userAgent);
  var isAndroidPre3 = /Android\s[0-2][^\d]/.test(userAgent);
  var isAndroidPre5 = /Android\s[0-4][^\d]/.test(userAgent);
  var isChrome = userAgent.indexOf('Chrom') >= 0;
  var isChromeWithRangeBug = /Chrome\/(39|40)\./.test(userAgent);
  var isIOSChrome = userAgent.indexOf('CriOS') >= 0;
  var isIE = userAgent.indexOf('Trident') >= 0;
  var isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent);
  var isOpera = userAgent.indexOf('Opera') >= 0;
  var isSafari = /Safari\//.test(userAgent) && !/(Chrome\/|Android\s)/.test(userAgent);
  var hasDOM = (typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object' && (typeof document === 'undefined' ? 'undefined' : _typeof(document)) === 'object';
  if (typeof PDFJS === 'undefined') {
    globalScope.PDFJS = {};
  }
  PDFJS.compatibilityChecked = true;
  (function checkTypedArrayCompatibility() {
    if (typeof Uint8ClampedArray === 'undefined') {
      globalScope.Uint8ClampedArray = __webpack_require__(47);
    }
    if (typeof Uint8Array !== 'undefined') {
      if (typeof Uint8Array.prototype.subarray === 'undefined') {
        Uint8Array.prototype.subarray = function subarray(start, end) {
          return new Uint8Array(this.slice(start, end));
        };
        Float32Array.prototype.subarray = function subarray(start, end) {
          return new Float32Array(this.slice(start, end));
        };
      }
      if (typeof Float64Array === 'undefined') {
        globalScope.Float64Array = Float32Array;
      }
      return;
    }
    function subarray(start, end) {
      return new TypedArray(this.slice(start, end));
    }
    function setArrayOffset(array, offset) {
      if (arguments.length < 2) {
        offset = 0;
      }
      for (var i = 0, n = array.length; i < n; ++i, ++offset) {
        this[offset] = array[i] & 0xFF;
      }
    }
    function Uint32ArrayView(buffer, length) {
      this.buffer = buffer;
      this.byteLength = buffer.length;
      this.length = length;
      ensureUint32ArrayViewProps(this.length);
    }
    Uint32ArrayView.prototype = Object.create(null);
    var uint32ArrayViewSetters = 0;
    function createUint32ArrayProp(index) {
      return {
        get: function get() {
          var buffer = this.buffer,
              offset = index << 2;
          return (buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16 | buffer[offset + 3] << 24) >>> 0;
        },
        set: function set(value) {
          var buffer = this.buffer,
              offset = index << 2;
          buffer[offset] = value & 255;
          buffer[offset + 1] = value >> 8 & 255;
          buffer[offset + 2] = value >> 16 & 255;
          buffer[offset + 3] = value >>> 24 & 255;
        }
      };
    }
    function ensureUint32ArrayViewProps(length) {
      while (uint32ArrayViewSetters < length) {
        Object.defineProperty(Uint32ArrayView.prototype, uint32ArrayViewSetters, createUint32ArrayProp(uint32ArrayViewSetters));
        uint32ArrayViewSetters++;
      }
    }
    function TypedArray(arg1) {
      var result, i, n;
      if (typeof arg1 === 'number') {
        result = [];
        for (i = 0; i < arg1; ++i) {
          result[i] = 0;
        }
      } else if ('slice' in arg1) {
        result = arg1.slice(0);
      } else {
        result = [];
        for (i = 0, n = arg1.length; i < n; ++i) {
          result[i] = arg1[i];
        }
      }
      result.subarray = subarray;
      result.buffer = result;
      result.byteLength = result.length;
      result.set = setArrayOffset;
      if ((typeof arg1 === 'undefined' ? 'undefined' : _typeof(arg1)) === 'object' && arg1.buffer) {
        result.buffer = arg1.buffer;
      }
      return result;
    }
    globalScope.Uint8Array = TypedArray;
    globalScope.Int8Array = TypedArray;
    globalScope.Int32Array = TypedArray;
    globalScope.Uint16Array = TypedArray;
    globalScope.Float32Array = TypedArray;
    globalScope.Float64Array = TypedArray;
    globalScope.Uint32Array = function () {
      if (arguments.length === 3) {
        if (arguments[1] !== 0) {
          throw new Error('offset !== 0 is not supported');
        }
        return new Uint32ArrayView(arguments[0], arguments[2]);
      }
      return TypedArray.apply(this, arguments);
    };
  })();
  (function canvasPixelArrayBuffer() {
    if (!hasDOM || !window.CanvasPixelArray) {
      return;
    }
    var cpaProto = window.CanvasPixelArray.prototype;
    if ('buffer' in cpaProto) {
      return;
    }
    Object.defineProperty(cpaProto, 'buffer', {
      get: function get() {
        return this;
      },

      enumerable: false,
      configurable: true
    });
    Object.defineProperty(cpaProto, 'byteLength', {
      get: function get() {
        return this.length;
      },

      enumerable: false,
      configurable: true
    });
  })();
  (function normalizeURLObject() {
    if (!globalScope.URL) {
      globalScope.URL = globalScope.webkitURL;
    }
  })();
  (function checkObjectDefinePropertyCompatibility() {
    if (typeof Object.defineProperty !== 'undefined') {
      var definePropertyPossible = true;
      try {
        if (hasDOM) {
          Object.defineProperty(new Image(), 'id', { value: 'test' });
        }
        var Test = function Test() {};
        Test.prototype = {
          get id() {}
        };
        Object.defineProperty(new Test(), 'id', {
          value: '',
          configurable: true,
          enumerable: true,
          writable: false
        });
      } catch (e) {
        definePropertyPossible = false;
      }
      if (definePropertyPossible) {
        return;
      }
    }
    Object.defineProperty = function objectDefineProperty(obj, name, def) {
      delete obj[name];
      if ('get' in def) {
        obj.__defineGetter__(name, def['get']);
      }
      if ('set' in def) {
        obj.__defineSetter__(name, def['set']);
      }
      if ('value' in def) {
        obj.__defineSetter__(name, function objectDefinePropertySetter(value) {
          this.__defineGetter__(name, function objectDefinePropertyGetter() {
            return value;
          });
          return value;
        });
        obj[name] = def.value;
      }
    };
  })();
  (function checkXMLHttpRequestResponseCompatibility() {
    if (typeof XMLHttpRequest === 'undefined') {
      return;
    }
    var xhrPrototype = XMLHttpRequest.prototype;
    var xhr = new XMLHttpRequest();
    if (!('overrideMimeType' in xhr)) {
      Object.defineProperty(xhrPrototype, 'overrideMimeType', {
        value: function xmlHttpRequestOverrideMimeType(mimeType) {}
      });
    }
    if ('responseType' in xhr) {
      return;
    }
    Object.defineProperty(xhrPrototype, 'responseType', {
      get: function xmlHttpRequestGetResponseType() {
        return this._responseType || 'text';
      },
      set: function xmlHttpRequestSetResponseType(value) {
        if (value === 'text' || value === 'arraybuffer') {
          this._responseType = value;
          if (value === 'arraybuffer' && typeof this.overrideMimeType === 'function') {
            this.overrideMimeType('text/plain; charset=x-user-defined');
          }
        }
      }
    });
    if (typeof VBArray !== 'undefined') {
      Object.defineProperty(xhrPrototype, 'response', {
        get: function xmlHttpRequestResponseGet() {
          if (this.responseType === 'arraybuffer') {
            return new Uint8Array(new VBArray(this.responseBody).toArray());
          }
          return this.responseText;
        }
      });
      return;
    }
    Object.defineProperty(xhrPrototype, 'response', {
      get: function xmlHttpRequestResponseGet() {
        if (this.responseType !== 'arraybuffer') {
          return this.responseText;
        }
        var text = this.responseText;
        var i,
            n = text.length;
        var result = new Uint8Array(n);
        for (i = 0; i < n; ++i) {
          result[i] = text.charCodeAt(i) & 0xFF;
        }
        return result.buffer;
      }
    });
  })();
  (function checkWindowBtoaCompatibility() {
    if ('btoa' in globalScope) {
      return;
    }
    var digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    globalScope.btoa = function (chars) {
      var buffer = '';
      var i, n;
      for (i = 0, n = chars.length; i < n; i += 3) {
        var b1 = chars.charCodeAt(i) & 0xFF;
        var b2 = chars.charCodeAt(i + 1) & 0xFF;
        var b3 = chars.charCodeAt(i + 2) & 0xFF;
        var d1 = b1 >> 2,
            d2 = (b1 & 3) << 4 | b2 >> 4;
        var d3 = i + 1 < n ? (b2 & 0xF) << 2 | b3 >> 6 : 64;
        var d4 = i + 2 < n ? b3 & 0x3F : 64;
        buffer += digits.charAt(d1) + digits.charAt(d2) + digits.charAt(d3) + digits.charAt(d4);
      }
      return buffer;
    };
  })();
  (function checkWindowAtobCompatibility() {
    if ('atob' in globalScope) {
      return;
    }
    var digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    globalScope.atob = function (input) {
      input = input.replace(/=+$/, '');
      if (input.length % 4 === 1) {
        throw new Error('bad atob input');
      }
      for (var bc = 0, bs, buffer, idx = 0, output = ''; buffer = input.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = digits.indexOf(buffer);
      }
      return output;
    };
  })();
  (function checkFunctionPrototypeBindCompatibility() {
    if (typeof Function.prototype.bind !== 'undefined') {
      return;
    }
    Function.prototype.bind = function functionPrototypeBind(obj) {
      var fn = this,
          headArgs = Array.prototype.slice.call(arguments, 1);
      var bound = function functionPrototypeBindBound() {
        var args = headArgs.concat(Array.prototype.slice.call(arguments));
        return fn.apply(obj, args);
      };
      return bound;
    };
  })();
  (function checkDatasetProperty() {
    if (!hasDOM) {
      return;
    }
    var div = document.createElement('div');
    if ('dataset' in div) {
      return;
    }
    Object.defineProperty(HTMLElement.prototype, 'dataset', {
      get: function get() {
        if (this._dataset) {
          return this._dataset;
        }
        var dataset = {};
        for (var j = 0, jj = this.attributes.length; j < jj; j++) {
          var attribute = this.attributes[j];
          if (attribute.name.substring(0, 5) !== 'data-') {
            continue;
          }
          var key = attribute.name.substring(5).replace(/\-([a-z])/g, function (all, ch) {
            return ch.toUpperCase();
          });
          dataset[key] = attribute.value;
        }
        Object.defineProperty(this, '_dataset', {
          value: dataset,
          writable: false,
          enumerable: false
        });
        return dataset;
      },

      enumerable: true
    });
  })();
  (function checkClassListProperty() {
    function changeList(element, itemName, add, remove) {
      var s = element.className || '';
      var list = s.split(/\s+/g);
      if (list[0] === '') {
        list.shift();
      }
      var index = list.indexOf(itemName);
      if (index < 0 && add) {
        list.push(itemName);
      }
      if (index >= 0 && remove) {
        list.splice(index, 1);
      }
      element.className = list.join(' ');
      return index >= 0;
    }
    if (!hasDOM) {
      return;
    }
    var div = document.createElement('div');
    if ('classList' in div) {
      return;
    }
    var classListPrototype = {
      add: function add(name) {
        changeList(this.element, name, true, false);
      },
      contains: function contains(name) {
        return changeList(this.element, name, false, false);
      },
      remove: function remove(name) {
        changeList(this.element, name, false, true);
      },
      toggle: function toggle(name) {
        changeList(this.element, name, true, true);
      }
    };
    Object.defineProperty(HTMLElement.prototype, 'classList', {
      get: function get() {
        if (this._classList) {
          return this._classList;
        }
        var classList = Object.create(classListPrototype, {
          element: {
            value: this,
            writable: false,
            enumerable: true
          }
        });
        Object.defineProperty(this, '_classList', {
          value: classList,
          writable: false,
          enumerable: false
        });
        return classList;
      },

      enumerable: true
    });
  })();
  (function checkWorkerConsoleCompatibility() {
    if (typeof importScripts === 'undefined' || 'console' in globalScope) {
      return;
    }
    var consoleTimer = {};
    var workerConsole = {
      log: function log() {
        var args = Array.prototype.slice.call(arguments);
        globalScope.postMessage({
          targetName: 'main',
          action: 'console_log',
          data: args
        });
      },
      error: function error() {
        var args = Array.prototype.slice.call(arguments);
        globalScope.postMessage({
          targetName: 'main',
          action: 'console_error',
          data: args
        });
      },
      time: function time(name) {
        consoleTimer[name] = Date.now();
      },
      timeEnd: function timeEnd(name) {
        var time = consoleTimer[name];
        if (!time) {
          throw new Error('Unknown timer name ' + name);
        }
        this.log('Timer:', name, Date.now() - time);
      }
    };
    globalScope.console = workerConsole;
  })();
  (function checkConsoleCompatibility() {
    if (!hasDOM) {
      return;
    }
    if (!('console' in window)) {
      window.console = {
        log: function log() {},
        error: function error() {},
        warn: function warn() {}
      };
      return;
    }
    if (!('bind' in console.log)) {
      console.log = function (fn) {
        return function (msg) {
          return fn(msg);
        };
      }(console.log);
      console.error = function (fn) {
        return function (msg) {
          return fn(msg);
        };
      }(console.error);
      console.warn = function (fn) {
        return function (msg) {
          return fn(msg);
        };
      }(console.warn);
      return;
    }
  })();
  (function checkOnClickCompatibility() {
    function ignoreIfTargetDisabled(event) {
      if (isDisabled(event.target)) {
        event.stopPropagation();
      }
    }
    function isDisabled(node) {
      return node.disabled || node.parentNode && isDisabled(node.parentNode);
    }
    if (isOpera) {
      document.addEventListener('click', ignoreIfTargetDisabled, true);
    }
  })();
  (function checkOnBlobSupport() {
    if (isIE || isIOSChrome) {
      PDFJS.disableCreateObjectURL = true;
    }
  })();
  (function checkNavigatorLanguage() {
    if (typeof navigator === 'undefined') {
      return;
    }
    if ('language' in navigator) {
      return;
    }
    PDFJS.locale = navigator.userLanguage || 'en-US';
  })();
  (function checkRangeRequests() {
    if (isSafari || isAndroidPre3 || isChromeWithRangeBug || isIOS) {
      PDFJS.disableRange = true;
      PDFJS.disableStream = true;
    }
  })();
  (function checkHistoryManipulation() {
    if (!hasDOM) {
      return;
    }
    if (!history.pushState || isAndroidPre3) {
      PDFJS.disableHistory = true;
    }
  })();
  (function checkSetPresenceInImageData() {
    if (!hasDOM) {
      return;
    }
    if (window.CanvasPixelArray) {
      if (typeof window.CanvasPixelArray.prototype.set !== 'function') {
        window.CanvasPixelArray.prototype.set = function (arr) {
          for (var i = 0, ii = this.length; i < ii; i++) {
            this[i] = arr[i];
          }
        };
      }
    } else {
      var polyfill = false,
          versionMatch;
      if (isChrome) {
        versionMatch = userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
        polyfill = versionMatch && parseInt(versionMatch[2]) < 21;
      } else if (isAndroid) {
        polyfill = isAndroidPre5;
      } else if (isSafari) {
        versionMatch = userAgent.match(/Version\/([0-9]+)\.([0-9]+)\.([0-9]+) Safari\//);
        polyfill = versionMatch && parseInt(versionMatch[1]) < 6;
      }
      if (polyfill) {
        var contextPrototype = window.CanvasRenderingContext2D.prototype;
        var createImageData = contextPrototype.createImageData;
        contextPrototype.createImageData = function (w, h) {
          var imageData = createImageData.call(this, w, h);
          imageData.data.set = function (arr) {
            for (var i = 0, ii = this.length; i < ii; i++) {
              this[i] = arr[i];
            }
          };
          return imageData;
        };
        contextPrototype = null;
      }
    }
  })();
  (function checkRequestAnimationFrame() {
    function installFakeAnimationFrameFunctions() {
      window.requestAnimationFrame = function (callback) {
        return window.setTimeout(callback, 20);
      };
      window.cancelAnimationFrame = function (timeoutID) {
        window.clearTimeout(timeoutID);
      };
    }
    if (!hasDOM) {
      return;
    }
    if (isIOS) {
      installFakeAnimationFrameFunctions();
      return;
    }
    if ('requestAnimationFrame' in window) {
      return;
    }
    window.requestAnimationFrame = window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame;
    if (window.requestAnimationFrame) {
      return;
    }
    installFakeAnimationFrameFunctions();
  })();
  (function checkCanvasSizeLimitation() {
    if (isIOS || isAndroid) {
      PDFJS.maxCanvasPixels = 5242880;
    }
  })();
  (function checkFullscreenSupport() {
    if (!hasDOM) {
      return;
    }
    if (isIE && window.parent !== window) {
      PDFJS.disableFullscreen = true;
    }
  })();
  (function checkCurrentScript() {
    if (!hasDOM) {
      return;
    }
    if ('currentScript' in document) {
      return;
    }
    Object.defineProperty(document, 'currentScript', {
      get: function get() {
        var scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
      },

      enumerable: true,
      configurable: true
    });
  })();
  (function checkInputTypeNumberAssign() {
    if (!hasDOM) {
      return;
    }
    var el = document.createElement('input');
    try {
      el.type = 'number';
    } catch (ex) {
      var inputProto = el.constructor.prototype;
      var typeProperty = Object.getOwnPropertyDescriptor(inputProto, 'type');
      Object.defineProperty(inputProto, 'type', {
        get: function get() {
          return typeProperty.get.call(this);
        },
        set: function set(value) {
          typeProperty.set.call(this, value === 'number' ? 'text' : value);
        },

        enumerable: true,
        configurable: true
      });
    }
  })();
  (function checkDocumentReadyState() {
    if (!hasDOM) {
      return;
    }
    if (!document.attachEvent) {
      return;
    }
    var documentProto = document.constructor.prototype;
    var readyStateProto = Object.getOwnPropertyDescriptor(documentProto, 'readyState');
    Object.defineProperty(documentProto, 'readyState', {
      get: function get() {
        var value = readyStateProto.get.call(this);
        return value === 'interactive' ? 'loading' : value;
      },
      set: function set(value) {
        readyStateProto.set.call(this, value);
      },

      enumerable: true,
      configurable: true
    });
  })();
  (function checkChildNodeRemove() {
    if (!hasDOM) {
      return;
    }
    if (typeof Element.prototype.remove !== 'undefined') {
      return;
    }
    Element.prototype.remove = function () {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
  })();
  (function checkNumberIsNaN() {
    if (Number.isNaN) {
      return;
    }
    Number.isNaN = function (value) {
      return typeof value === 'number' && isNaN(value);
    };
  })();
  (function checkNumberIsInteger() {
    if (Number.isInteger) {
      return;
    }
    Number.isInteger = function (value) {
      return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
    };
  })();
  (function checkPromise() {
    if (globalScope.Promise) {
      if (typeof globalScope.Promise.all !== 'function') {
        globalScope.Promise.all = function (iterable) {
          var count = 0,
              results = [],
              resolve,
              reject;
          var promise = new globalScope.Promise(function (resolve_, reject_) {
            resolve = resolve_;
            reject = reject_;
          });
          iterable.forEach(function (p, i) {
            count++;
            p.then(function (result) {
              results[i] = result;
              count--;
              if (count === 0) {
                resolve(results);
              }
            }, reject);
          });
          if (count === 0) {
            resolve(results);
          }
          return promise;
        };
      }
      if (typeof globalScope.Promise.resolve !== 'function') {
        globalScope.Promise.resolve = function (value) {
          return new globalScope.Promise(function (resolve) {
            resolve(value);
          });
        };
      }
      if (typeof globalScope.Promise.reject !== 'function') {
        globalScope.Promise.reject = function (reason) {
          return new globalScope.Promise(function (resolve, reject) {
            reject(reason);
          });
        };
      }
      if (typeof globalScope.Promise.prototype.catch !== 'function') {
        globalScope.Promise.prototype.catch = function (onReject) {
          return globalScope.Promise.prototype.then(undefined, onReject);
        };
      }
      return;
    }
    var STATUS_PENDING = 0;
    var STATUS_RESOLVED = 1;
    var STATUS_REJECTED = 2;
    var REJECTION_TIMEOUT = 500;
    var HandlerManager = {
      handlers: [],
      running: false,
      unhandledRejections: [],
      pendingRejectionCheck: false,
      scheduleHandlers: function scheduleHandlers(promise) {
        if (promise._status === STATUS_PENDING) {
          return;
        }
        this.handlers = this.handlers.concat(promise._handlers);
        promise._handlers = [];
        if (this.running) {
          return;
        }
        this.running = true;
        setTimeout(this.runHandlers.bind(this), 0);
      },
      runHandlers: function runHandlers() {
        var RUN_TIMEOUT = 1;
        var timeoutAt = Date.now() + RUN_TIMEOUT;
        while (this.handlers.length > 0) {
          var handler = this.handlers.shift();
          var nextStatus = handler.thisPromise._status;
          var nextValue = handler.thisPromise._value;
          try {
            if (nextStatus === STATUS_RESOLVED) {
              if (typeof handler.onResolve === 'function') {
                nextValue = handler.onResolve(nextValue);
              }
            } else if (typeof handler.onReject === 'function') {
              nextValue = handler.onReject(nextValue);
              nextStatus = STATUS_RESOLVED;
              if (handler.thisPromise._unhandledRejection) {
                this.removeUnhandeledRejection(handler.thisPromise);
              }
            }
          } catch (ex) {
            nextStatus = STATUS_REJECTED;
            nextValue = ex;
          }
          handler.nextPromise._updateStatus(nextStatus, nextValue);
          if (Date.now() >= timeoutAt) {
            break;
          }
        }
        if (this.handlers.length > 0) {
          setTimeout(this.runHandlers.bind(this), 0);
          return;
        }
        this.running = false;
      },
      addUnhandledRejection: function addUnhandledRejection(promise) {
        this.unhandledRejections.push({
          promise: promise,
          time: Date.now()
        });
        this.scheduleRejectionCheck();
      },
      removeUnhandeledRejection: function removeUnhandeledRejection(promise) {
        promise._unhandledRejection = false;
        for (var i = 0; i < this.unhandledRejections.length; i++) {
          if (this.unhandledRejections[i].promise === promise) {
            this.unhandledRejections.splice(i);
            i--;
          }
        }
      },
      scheduleRejectionCheck: function scheduleRejectionCheck() {
        var _this = this;

        if (this.pendingRejectionCheck) {
          return;
        }
        this.pendingRejectionCheck = true;
        setTimeout(function () {
          _this.pendingRejectionCheck = false;
          var now = Date.now();
          for (var i = 0; i < _this.unhandledRejections.length; i++) {
            if (now - _this.unhandledRejections[i].time > REJECTION_TIMEOUT) {
              var unhandled = _this.unhandledRejections[i].promise._value;
              var msg = 'Unhandled rejection: ' + unhandled;
              if (unhandled.stack) {
                msg += '\n' + unhandled.stack;
              }
              try {
                throw new Error(msg);
              } catch (_) {
                console.warn(msg);
              }
              _this.unhandledRejections.splice(i);
              i--;
            }
          }
          if (_this.unhandledRejections.length) {
            _this.scheduleRejectionCheck();
          }
        }, REJECTION_TIMEOUT);
      }
    };
    var Promise = function Promise(resolver) {
      this._status = STATUS_PENDING;
      this._handlers = [];
      try {
        resolver.call(this, this._resolve.bind(this), this._reject.bind(this));
      } catch (e) {
        this._reject(e);
      }
    };
    Promise.all = function Promise_all(promises) {
      var resolveAll, rejectAll;
      var deferred = new Promise(function (resolve, reject) {
        resolveAll = resolve;
        rejectAll = reject;
      });
      var unresolved = promises.length;
      var results = [];
      if (unresolved === 0) {
        resolveAll(results);
        return deferred;
      }
      function reject(reason) {
        if (deferred._status === STATUS_REJECTED) {
          return;
        }
        results = [];
        rejectAll(reason);
      }
      for (var i = 0, ii = promises.length; i < ii; ++i) {
        var promise = promises[i];
        var resolve = function (i) {
          return function (value) {
            if (deferred._status === STATUS_REJECTED) {
              return;
            }
            results[i] = value;
            unresolved--;
            if (unresolved === 0) {
              resolveAll(results);
            }
          };
        }(i);
        if (Promise.isPromise(promise)) {
          promise.then(resolve, reject);
        } else {
          resolve(promise);
        }
      }
      return deferred;
    };
    Promise.isPromise = function Promise_isPromise(value) {
      return value && typeof value.then === 'function';
    };
    Promise.resolve = function Promise_resolve(value) {
      return new Promise(function (resolve) {
        resolve(value);
      });
    };
    Promise.reject = function Promise_reject(reason) {
      return new Promise(function (resolve, reject) {
        reject(reason);
      });
    };
    Promise.prototype = {
      _status: null,
      _value: null,
      _handlers: null,
      _unhandledRejection: null,
      _updateStatus: function Promise__updateStatus(status, value) {
        if (this._status === STATUS_RESOLVED || this._status === STATUS_REJECTED) {
          return;
        }
        if (status === STATUS_RESOLVED && Promise.isPromise(value)) {
          value.then(this._updateStatus.bind(this, STATUS_RESOLVED), this._updateStatus.bind(this, STATUS_REJECTED));
          return;
        }
        this._status = status;
        this._value = value;
        if (status === STATUS_REJECTED && this._handlers.length === 0) {
          this._unhandledRejection = true;
          HandlerManager.addUnhandledRejection(this);
        }
        HandlerManager.scheduleHandlers(this);
      },
      _resolve: function Promise_resolve(value) {
        this._updateStatus(STATUS_RESOLVED, value);
      },
      _reject: function Promise_reject(reason) {
        this._updateStatus(STATUS_REJECTED, reason);
      },
      then: function Promise_then(onResolve, onReject) {
        var nextPromise = new Promise(function (resolve, reject) {
          this.resolve = resolve;
          this.reject = reject;
        });
        this._handlers.push({
          thisPromise: this,
          onResolve: onResolve,
          onReject: onReject,
          nextPromise: nextPromise
        });
        HandlerManager.scheduleHandlers(this);
        return nextPromise;
      },
      catch: function Promise_catch(onReject) {
        return this.then(undefined, onReject);
      }
    };
    globalScope.Promise = Promise;
  })();
  (function checkWeakMap() {
    if (globalScope.WeakMap) {
      return;
    }
    var id = 0;
    function WeakMap() {
      this.id = '$weakmap' + id++;
    }
    WeakMap.prototype = {
      has: function has(obj) {
        if ((typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) !== 'object' && typeof obj !== 'function' || obj === null) {
          return false;
        }
        return !!Object.getOwnPropertyDescriptor(obj, this.id);
      },
      get: function get(obj) {
        return this.has(obj) ? obj[this.id] : undefined;
      },
      set: function set(obj, value) {
        Object.defineProperty(obj, this.id, {
          value: value,
          enumerable: false,
          configurable: true
        });
      },
      delete: function _delete(obj) {
        delete obj[this.id];
      }
    };
    globalScope.WeakMap = WeakMap;
  })();
  (function checkURLConstructor() {
    var hasWorkingUrl = false;
    try {
      if (typeof URL === 'function' && _typeof(URL.prototype) === 'object' && 'origin' in URL.prototype) {
        var u = new URL('b', 'http://a');
        u.pathname = 'c%20d';
        hasWorkingUrl = u.href === 'http://a/c%20d';
      }
    } catch (e) {}
    if (hasWorkingUrl) {
      return;
    }
    var relative = Object.create(null);
    relative['ftp'] = 21;
    relative['file'] = 0;
    relative['gopher'] = 70;
    relative['http'] = 80;
    relative['https'] = 443;
    relative['ws'] = 80;
    relative['wss'] = 443;
    var relativePathDotMapping = Object.create(null);
    relativePathDotMapping['%2e'] = '.';
    relativePathDotMapping['.%2e'] = '..';
    relativePathDotMapping['%2e.'] = '..';
    relativePathDotMapping['%2e%2e'] = '..';
    function isRelativeScheme(scheme) {
      return relative[scheme] !== undefined;
    }
    function invalid() {
      clear.call(this);
      this._isInvalid = true;
    }
    function IDNAToASCII(h) {
      if (h === '') {
        invalid.call(this);
      }
      return h.toLowerCase();
    }
    function percentEscape(c) {
      var unicode = c.charCodeAt(0);
      if (unicode > 0x20 && unicode < 0x7F && [0x22, 0x23, 0x3C, 0x3E, 0x3F, 0x60].indexOf(unicode) === -1) {
        return c;
      }
      return encodeURIComponent(c);
    }
    function percentEscapeQuery(c) {
      var unicode = c.charCodeAt(0);
      if (unicode > 0x20 && unicode < 0x7F && [0x22, 0x23, 0x3C, 0x3E, 0x60].indexOf(unicode) === -1) {
        return c;
      }
      return encodeURIComponent(c);
    }
    var EOF,
        ALPHA = /[a-zA-Z]/,
        ALPHANUMERIC = /[a-zA-Z0-9\+\-\.]/;
    function parse(input, stateOverride, base) {
      function err(message) {
        errors.push(message);
      }
      var state = stateOverride || 'scheme start',
          cursor = 0,
          buffer = '',
          seenAt = false,
          seenBracket = false,
          errors = [];
      loop: while ((input[cursor - 1] !== EOF || cursor === 0) && !this._isInvalid) {
        var c = input[cursor];
        switch (state) {
          case 'scheme start':
            if (c && ALPHA.test(c)) {
              buffer += c.toLowerCase();
              state = 'scheme';
            } else if (!stateOverride) {
              buffer = '';
              state = 'no scheme';
              continue;
            } else {
              err('Invalid scheme.');
              break loop;
            }
            break;
          case 'scheme':
            if (c && ALPHANUMERIC.test(c)) {
              buffer += c.toLowerCase();
            } else if (c === ':') {
              this._scheme = buffer;
              buffer = '';
              if (stateOverride) {
                break loop;
              }
              if (isRelativeScheme(this._scheme)) {
                this._isRelative = true;
              }
              if (this._scheme === 'file') {
                state = 'relative';
              } else if (this._isRelative && base && base._scheme === this._scheme) {
                state = 'relative or authority';
              } else if (this._isRelative) {
                state = 'authority first slash';
              } else {
                state = 'scheme data';
              }
            } else if (!stateOverride) {
              buffer = '';
              cursor = 0;
              state = 'no scheme';
              continue;
            } else if (c === EOF) {
              break loop;
            } else {
              err('Code point not allowed in scheme: ' + c);
              break loop;
            }
            break;
          case 'scheme data':
            if (c === '?') {
              this._query = '?';
              state = 'query';
            } else if (c === '#') {
              this._fragment = '#';
              state = 'fragment';
            } else {
              if (c !== EOF && c !== '\t' && c !== '\n' && c !== '\r') {
                this._schemeData += percentEscape(c);
              }
            }
            break;
          case 'no scheme':
            if (!base || !isRelativeScheme(base._scheme)) {
              err('Missing scheme.');
              invalid.call(this);
            } else {
              state = 'relative';
              continue;
            }
            break;
          case 'relative or authority':
            if (c === '/' && input[cursor + 1] === '/') {
              state = 'authority ignore slashes';
            } else {
              err('Expected /, got: ' + c);
              state = 'relative';
              continue;
            }
            break;
          case 'relative':
            this._isRelative = true;
            if (this._scheme !== 'file') {
              this._scheme = base._scheme;
            }
            if (c === EOF) {
              this._host = base._host;
              this._port = base._port;
              this._path = base._path.slice();
              this._query = base._query;
              this._username = base._username;
              this._password = base._password;
              break loop;
            } else if (c === '/' || c === '\\') {
              if (c === '\\') {
                err('\\ is an invalid code point.');
              }
              state = 'relative slash';
            } else if (c === '?') {
              this._host = base._host;
              this._port = base._port;
              this._path = base._path.slice();
              this._query = '?';
              this._username = base._username;
              this._password = base._password;
              state = 'query';
            } else if (c === '#') {
              this._host = base._host;
              this._port = base._port;
              this._path = base._path.slice();
              this._query = base._query;
              this._fragment = '#';
              this._username = base._username;
              this._password = base._password;
              state = 'fragment';
            } else {
              var nextC = input[cursor + 1];
              var nextNextC = input[cursor + 2];
              if (this._scheme !== 'file' || !ALPHA.test(c) || nextC !== ':' && nextC !== '|' || nextNextC !== EOF && nextNextC !== '/' && nextNextC !== '\\' && nextNextC !== '?' && nextNextC !== '#') {
                this._host = base._host;
                this._port = base._port;
                this._username = base._username;
                this._password = base._password;
                this._path = base._path.slice();
                this._path.pop();
              }
              state = 'relative path';
              continue;
            }
            break;
          case 'relative slash':
            if (c === '/' || c === '\\') {
              if (c === '\\') {
                err('\\ is an invalid code point.');
              }
              if (this._scheme === 'file') {
                state = 'file host';
              } else {
                state = 'authority ignore slashes';
              }
            } else {
              if (this._scheme !== 'file') {
                this._host = base._host;
                this._port = base._port;
                this._username = base._username;
                this._password = base._password;
              }
              state = 'relative path';
              continue;
            }
            break;
          case 'authority first slash':
            if (c === '/') {
              state = 'authority second slash';
            } else {
              err('Expected \'/\', got: ' + c);
              state = 'authority ignore slashes';
              continue;
            }
            break;
          case 'authority second slash':
            state = 'authority ignore slashes';
            if (c !== '/') {
              err('Expected \'/\', got: ' + c);
              continue;
            }
            break;
          case 'authority ignore slashes':
            if (c !== '/' && c !== '\\') {
              state = 'authority';
              continue;
            } else {
              err('Expected authority, got: ' + c);
            }
            break;
          case 'authority':
            if (c === '@') {
              if (seenAt) {
                err('@ already seen.');
                buffer += '%40';
              }
              seenAt = true;
              for (var i = 0; i < buffer.length; i++) {
                var cp = buffer[i];
                if (cp === '\t' || cp === '\n' || cp === '\r') {
                  err('Invalid whitespace in authority.');
                  continue;
                }
                if (cp === ':' && this._password === null) {
                  this._password = '';
                  continue;
                }
                var tempC = percentEscape(cp);
                if (this._password !== null) {
                  this._password += tempC;
                } else {
                  this._username += tempC;
                }
              }
              buffer = '';
            } else if (c === EOF || c === '/' || c === '\\' || c === '?' || c === '#') {
              cursor -= buffer.length;
              buffer = '';
              state = 'host';
              continue;
            } else {
              buffer += c;
            }
            break;
          case 'file host':
            if (c === EOF || c === '/' || c === '\\' || c === '?' || c === '#') {
              if (buffer.length === 2 && ALPHA.test(buffer[0]) && (buffer[1] === ':' || buffer[1] === '|')) {
                state = 'relative path';
              } else if (buffer.length === 0) {
                state = 'relative path start';
              } else {
                this._host = IDNAToASCII.call(this, buffer);
                buffer = '';
                state = 'relative path start';
              }
              continue;
            } else if (c === '\t' || c === '\n' || c === '\r') {
              err('Invalid whitespace in file host.');
            } else {
              buffer += c;
            }
            break;
          case 'host':
          case 'hostname':
            if (c === ':' && !seenBracket) {
              this._host = IDNAToASCII.call(this, buffer);
              buffer = '';
              state = 'port';
              if (stateOverride === 'hostname') {
                break loop;
              }
            } else if (c === EOF || c === '/' || c === '\\' || c === '?' || c === '#') {
              this._host = IDNAToASCII.call(this, buffer);
              buffer = '';
              state = 'relative path start';
              if (stateOverride) {
                break loop;
              }
              continue;
            } else if (c !== '\t' && c !== '\n' && c !== '\r') {
              if (c === '[') {
                seenBracket = true;
              } else if (c === ']') {
                seenBracket = false;
              }
              buffer += c;
            } else {
              err('Invalid code point in host/hostname: ' + c);
            }
            break;
          case 'port':
            if (/[0-9]/.test(c)) {
              buffer += c;
            } else if (c === EOF || c === '/' || c === '\\' || c === '?' || c === '#' || stateOverride) {
              if (buffer !== '') {
                var temp = parseInt(buffer, 10);
                if (temp !== relative[this._scheme]) {
                  this._port = temp + '';
                }
                buffer = '';
              }
              if (stateOverride) {
                break loop;
              }
              state = 'relative path start';
              continue;
            } else if (c === '\t' || c === '\n' || c === '\r') {
              err('Invalid code point in port: ' + c);
            } else {
              invalid.call(this);
            }
            break;
          case 'relative path start':
            if (c === '\\') {
              err('\'\\\' not allowed in path.');
            }
            state = 'relative path';
            if (c !== '/' && c !== '\\') {
              continue;
            }
            break;
          case 'relative path':
            if (c === EOF || c === '/' || c === '\\' || !stateOverride && (c === '?' || c === '#')) {
              if (c === '\\') {
                err('\\ not allowed in relative path.');
              }
              var tmp;
              if (tmp = relativePathDotMapping[buffer.toLowerCase()]) {
                buffer = tmp;
              }
              if (buffer === '..') {
                this._path.pop();
                if (c !== '/' && c !== '\\') {
                  this._path.push('');
                }
              } else if (buffer === '.' && c !== '/' && c !== '\\') {
                this._path.push('');
              } else if (buffer !== '.') {
                if (this._scheme === 'file' && this._path.length === 0 && buffer.length === 2 && ALPHA.test(buffer[0]) && buffer[1] === '|') {
                  buffer = buffer[0] + ':';
                }
                this._path.push(buffer);
              }
              buffer = '';
              if (c === '?') {
                this._query = '?';
                state = 'query';
              } else if (c === '#') {
                this._fragment = '#';
                state = 'fragment';
              }
            } else if (c !== '\t' && c !== '\n' && c !== '\r') {
              buffer += percentEscape(c);
            }
            break;
          case 'query':
            if (!stateOverride && c === '#') {
              this._fragment = '#';
              state = 'fragment';
            } else if (c !== EOF && c !== '\t' && c !== '\n' && c !== '\r') {
              this._query += percentEscapeQuery(c);
            }
            break;
          case 'fragment':
            if (c !== EOF && c !== '\t' && c !== '\n' && c !== '\r') {
              this._fragment += c;
            }
            break;
        }
        cursor++;
      }
    }
    function clear() {
      this._scheme = '';
      this._schemeData = '';
      this._username = '';
      this._password = null;
      this._host = '';
      this._port = '';
      this._path = [];
      this._query = '';
      this._fragment = '';
      this._isInvalid = false;
      this._isRelative = false;
    }
    function JURL(url, base) {
      if (base !== undefined && !(base instanceof JURL)) {
        base = new JURL(String(base));
      }
      this._url = url;
      clear.call(this);
      var input = url.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');
      parse.call(this, input, null, base);
    }
    JURL.prototype = {
      toString: function toString() {
        return this.href;
      },

      get href() {
        if (this._isInvalid) {
          return this._url;
        }
        var authority = '';
        if (this._username !== '' || this._password !== null) {
          authority = this._username + (this._password !== null ? ':' + this._password : '') + '@';
        }
        return this.protocol + (this._isRelative ? '//' + authority + this.host : '') + this.pathname + this._query + this._fragment;
      },
      set href(value) {
        clear.call(this);
        parse.call(this, value);
      },
      get protocol() {
        return this._scheme + ':';
      },
      set protocol(value) {
        if (this._isInvalid) {
          return;
        }
        parse.call(this, value + ':', 'scheme start');
      },
      get host() {
        return this._isInvalid ? '' : this._port ? this._host + ':' + this._port : this._host;
      },
      set host(value) {
        if (this._isInvalid || !this._isRelative) {
          return;
        }
        parse.call(this, value, 'host');
      },
      get hostname() {
        return this._host;
      },
      set hostname(value) {
        if (this._isInvalid || !this._isRelative) {
          return;
        }
        parse.call(this, value, 'hostname');
      },
      get port() {
        return this._port;
      },
      set port(value) {
        if (this._isInvalid || !this._isRelative) {
          return;
        }
        parse.call(this, value, 'port');
      },
      get pathname() {
        return this._isInvalid ? '' : this._isRelative ? '/' + this._path.join('/') : this._schemeData;
      },
      set pathname(value) {
        if (this._isInvalid || !this._isRelative) {
          return;
        }
        this._path = [];
        parse.call(this, value, 'relative path start');
      },
      get search() {
        return this._isInvalid || !this._query || this._query === '?' ? '' : this._query;
      },
      set search(value) {
        if (this._isInvalid || !this._isRelative) {
          return;
        }
        this._query = '?';
        if (value[0] === '?') {
          value = value.slice(1);
        }
        parse.call(this, value, 'query');
      },
      get hash() {
        return this._isInvalid || !this._fragment || this._fragment === '#' ? '' : this._fragment;
      },
      set hash(value) {
        if (this._isInvalid) {
          return;
        }
        this._fragment = '#';
        if (value[0] === '#') {
          value = value.slice(1);
        }
        parse.call(this, value, 'fragment');
      },
      get origin() {
        var host;
        if (this._isInvalid || !this._scheme) {
          return '';
        }
        switch (this._scheme) {
          case 'data':
          case 'file':
          case 'javascript':
          case 'mailto':
            return 'null';
          case 'blob':
            try {
              return new JURL(this._schemeData).origin || 'null';
            } catch (_) {}
            return 'null';
        }
        host = this.host;
        if (!host) {
          return '';
        }
        return this._scheme + '://' + host;
      }
    };
    var OriginalURL = globalScope.URL;
    if (OriginalURL) {
      JURL.createObjectURL = function (blob) {
        return OriginalURL.createObjectURL.apply(OriginalURL, arguments);
      };
      JURL.revokeObjectURL = function (url) {
        OriginalURL.revokeObjectURL(url);
      };
    }
    globalScope.URL = JURL;
  })();
}

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = typeof window !== 'undefined' && window.Math === Math ? window : typeof global !== 'undefined' && global.Math === Math ? global : typeof self !== 'undefined' && self.Math === Math ? self : {};

/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


__webpack_require__(48);
module.exports = __webpack_require__(13).Uint8ClampedArray;

/***/ }),
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


__webpack_require__(49)('Uint8', 1, function (init) {
  return function Uint8ClampedArray(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
}, true);

/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

if (__webpack_require__(2)) {
  var LIBRARY = __webpack_require__(18);
  var global = __webpack_require__(1);
  var fails = __webpack_require__(12);
  var $export = __webpack_require__(26);
  var $typed = __webpack_require__(30);
  var $buffer = __webpack_require__(50);
  var ctx = __webpack_require__(21);
  var anInstance = __webpack_require__(32);
  var propertyDesc = __webpack_require__(15);
  var hide = __webpack_require__(3);
  var redefineAll = __webpack_require__(31);
  var toInteger = __webpack_require__(9);
  var toLength = __webpack_require__(5);
  var toIndex = __webpack_require__(33);
  var toAbsoluteIndex = __webpack_require__(17);
  var toPrimitive = __webpack_require__(19);
  var has = __webpack_require__(4);
  var classof = __webpack_require__(41);
  var isObject = __webpack_require__(7);
  var toObject = __webpack_require__(10);
  var isArrayIter = __webpack_require__(51);
  var create = __webpack_require__(42);
  var getPrototypeOf = __webpack_require__(43);
  var gOPN = __webpack_require__(34).f;
  var getIterFn = __webpack_require__(55);
  var uid = __webpack_require__(8);
  var wks = __webpack_require__(0);
  var createArrayMethod = __webpack_require__(56);
  var createArrayIncludes = __webpack_require__(38);
  var speciesConstructor = __webpack_require__(60);
  var ArrayIterators = __webpack_require__(61);
  var Iterators = __webpack_require__(11);
  var $iterDetect = __webpack_require__(66);
  var setSpecies = __webpack_require__(67);
  var arrayFill = __webpack_require__(40);
  var arrayCopyWithin = __webpack_require__(68);
  var $DP = __webpack_require__(6);
  var $GOPD = __webpack_require__(69);
  var dP = $DP.f;
  var gOPD = $GOPD.f;
  var RangeError = global.RangeError;
  var TypeError = global.TypeError;
  var Uint8Array = global.Uint8Array;
  var ARRAY_BUFFER = 'ArrayBuffer';
  var SHARED_BUFFER = 'Shared' + ARRAY_BUFFER;
  var BYTES_PER_ELEMENT = 'BYTES_PER_ELEMENT';
  var PROTOTYPE = 'prototype';
  var ArrayProto = Array[PROTOTYPE];
  var $ArrayBuffer = $buffer.ArrayBuffer;
  var $DataView = $buffer.DataView;
  var arrayForEach = createArrayMethod(0);
  var arrayFilter = createArrayMethod(2);
  var arraySome = createArrayMethod(3);
  var arrayEvery = createArrayMethod(4);
  var arrayFind = createArrayMethod(5);
  var arrayFindIndex = createArrayMethod(6);
  var arrayIncludes = createArrayIncludes(true);
  var arrayIndexOf = createArrayIncludes(false);
  var arrayValues = ArrayIterators.values;
  var arrayKeys = ArrayIterators.keys;
  var arrayEntries = ArrayIterators.entries;
  var arrayLastIndexOf = ArrayProto.lastIndexOf;
  var arrayReduce = ArrayProto.reduce;
  var arrayReduceRight = ArrayProto.reduceRight;
  var arrayJoin = ArrayProto.join;
  var arraySort = ArrayProto.sort;
  var arraySlice = ArrayProto.slice;
  var arrayToString = ArrayProto.toString;
  var arrayToLocaleString = ArrayProto.toLocaleString;
  var ITERATOR = wks('iterator');
  var TAG = wks('toStringTag');
  var TYPED_CONSTRUCTOR = uid('typed_constructor');
  var DEF_CONSTRUCTOR = uid('def_constructor');
  var ALL_CONSTRUCTORS = $typed.CONSTR;
  var TYPED_ARRAY = $typed.TYPED;
  var VIEW = $typed.VIEW;
  var WRONG_LENGTH = 'Wrong length!';
  var $map = createArrayMethod(1, function (O, length) {
    return allocate(speciesConstructor(O, O[DEF_CONSTRUCTOR]), length);
  });
  var LITTLE_ENDIAN = fails(function () {
    return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  });
  var FORCED_SET = !!Uint8Array && !!Uint8Array[PROTOTYPE].set && fails(function () {
    new Uint8Array(1).set({});
  });
  var toOffset = function toOffset(it, BYTES) {
    var offset = toInteger(it);
    if (offset < 0 || offset % BYTES) throw RangeError('Wrong offset!');
    return offset;
  };
  var validate = function validate(it) {
    if (isObject(it) && TYPED_ARRAY in it) return it;
    throw TypeError(it + ' is not a typed array!');
  };
  var allocate = function allocate(C, length) {
    if (!(isObject(C) && TYPED_CONSTRUCTOR in C)) {
      throw TypeError('It is not a typed array constructor!');
    }
    return new C(length);
  };
  var speciesFromList = function speciesFromList(O, list) {
    return fromList(speciesConstructor(O, O[DEF_CONSTRUCTOR]), list);
  };
  var fromList = function fromList(C, list) {
    var index = 0;
    var length = list.length;
    var result = allocate(C, length);
    while (length > index) {
      result[index] = list[index++];
    }return result;
  };
  var addGetter = function addGetter(it, key, internal) {
    dP(it, key, {
      get: function get() {
        return this._d[internal];
      }
    });
  };
  var $from = function from(source) {
    var O = toObject(source);
    var aLen = arguments.length;
    var mapfn = aLen > 1 ? arguments[1] : undefined;
    var mapping = mapfn !== undefined;
    var iterFn = getIterFn(O);
    var i, length, values, result, step, iterator;
    if (iterFn != undefined && !isArrayIter(iterFn)) {
      for (iterator = iterFn.call(O), values = [], i = 0; !(step = iterator.next()).done; i++) {
        values.push(step.value);
      }
      O = values;
    }
    if (mapping && aLen > 2) mapfn = ctx(mapfn, arguments[2], 2);
    for (i = 0, length = toLength(O.length), result = allocate(this, length); length > i; i++) {
      result[i] = mapping ? mapfn(O[i], i) : O[i];
    }
    return result;
  };
  var $of = function of() {
    var index = 0;
    var length = arguments.length;
    var result = allocate(this, length);
    while (length > index) {
      result[index] = arguments[index++];
    }return result;
  };
  var TO_LOCALE_BUG = !!Uint8Array && fails(function () {
    arrayToLocaleString.call(new Uint8Array(1));
  });
  var $toLocaleString = function toLocaleString() {
    return arrayToLocaleString.apply(TO_LOCALE_BUG ? arraySlice.call(validate(this)) : validate(this), arguments);
  };
  var proto = {
    copyWithin: function copyWithin(target, start) {
      return arrayCopyWithin.call(validate(this), target, start, arguments.length > 2 ? arguments[2] : undefined);
    },
    every: function every(callbackfn) {
      return arrayEvery(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    fill: function fill(value) {
      return arrayFill.apply(validate(this), arguments);
    },
    filter: function filter(callbackfn) {
      return speciesFromList(this, arrayFilter(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined));
    },
    find: function find(predicate) {
      return arrayFind(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    findIndex: function findIndex(predicate) {
      return arrayFindIndex(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    forEach: function forEach(callbackfn) {
      arrayForEach(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    indexOf: function indexOf(searchElement) {
      return arrayIndexOf(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    includes: function includes(searchElement) {
      return arrayIncludes(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    join: function join(separator) {
      return arrayJoin.apply(validate(this), arguments);
    },
    lastIndexOf: function lastIndexOf(searchElement) {
      return arrayLastIndexOf.apply(validate(this), arguments);
    },
    map: function map(mapfn) {
      return $map(validate(this), mapfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    reduce: function reduce(callbackfn) {
      return arrayReduce.apply(validate(this), arguments);
    },
    reduceRight: function reduceRight(callbackfn) {
      return arrayReduceRight.apply(validate(this), arguments);
    },
    reverse: function reverse() {
      var that = this;
      var length = validate(that).length;
      var middle = Math.floor(length / 2);
      var index = 0;
      var value;
      while (index < middle) {
        value = that[index];
        that[index++] = that[--length];
        that[length] = value;
      }
      return that;
    },
    some: function some(callbackfn) {
      return arraySome(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    sort: function sort(comparefn) {
      return arraySort.call(validate(this), comparefn);
    },
    subarray: function subarray(begin, end) {
      var O = validate(this);
      var length = O.length;
      var $begin = toAbsoluteIndex(begin, length);
      return new (speciesConstructor(O, O[DEF_CONSTRUCTOR]))(O.buffer, O.byteOffset + $begin * O.BYTES_PER_ELEMENT, toLength((end === undefined ? length : toAbsoluteIndex(end, length)) - $begin));
    }
  };
  var $slice = function slice(start, end) {
    return speciesFromList(this, arraySlice.call(validate(this), start, end));
  };
  var $set = function set(arrayLike) {
    validate(this);
    var offset = toOffset(arguments[1], 1);
    var length = this.length;
    var src = toObject(arrayLike);
    var len = toLength(src.length);
    var index = 0;
    if (len + offset > length) throw RangeError(WRONG_LENGTH);
    while (index < len) {
      this[offset + index] = src[index++];
    }
  };
  var $iterators = {
    entries: function entries() {
      return arrayEntries.call(validate(this));
    },
    keys: function keys() {
      return arrayKeys.call(validate(this));
    },
    values: function values() {
      return arrayValues.call(validate(this));
    }
  };
  var isTAIndex = function isTAIndex(target, key) {
    return isObject(target) && target[TYPED_ARRAY] && (typeof key === 'undefined' ? 'undefined' : _typeof(key)) != 'symbol' && key in target && String(+key) == String(key);
  };
  var $getDesc = function getOwnPropertyDescriptor(target, key) {
    return isTAIndex(target, key = toPrimitive(key, true)) ? propertyDesc(2, target[key]) : gOPD(target, key);
  };
  var $setDesc = function defineProperty(target, key, desc) {
    if (isTAIndex(target, key = toPrimitive(key, true)) && isObject(desc) && has(desc, 'value') && !has(desc, 'get') && !has(desc, 'set') && !desc.configurable && (!has(desc, 'writable') || desc.writable) && (!has(desc, 'enumerable') || desc.enumerable)) {
      target[key] = desc.value;
      return target;
    }
    return dP(target, key, desc);
  };
  if (!ALL_CONSTRUCTORS) {
    $GOPD.f = $getDesc;
    $DP.f = $setDesc;
  }
  $export($export.S + $export.F * !ALL_CONSTRUCTORS, 'Object', {
    getOwnPropertyDescriptor: $getDesc,
    defineProperty: $setDesc
  });
  if (fails(function () {
    arrayToString.call({});
  })) {
    arrayToString = arrayToLocaleString = function toString() {
      return arrayJoin.call(this);
    };
  }
  var $TypedArrayPrototype$ = redefineAll({}, proto);
  redefineAll($TypedArrayPrototype$, $iterators);
  hide($TypedArrayPrototype$, ITERATOR, $iterators.values);
  redefineAll($TypedArrayPrototype$, {
    slice: $slice,
    set: $set,
    constructor: function constructor() {},
    toString: arrayToString,
    toLocaleString: $toLocaleString
  });
  addGetter($TypedArrayPrototype$, 'buffer', 'b');
  addGetter($TypedArrayPrototype$, 'byteOffset', 'o');
  addGetter($TypedArrayPrototype$, 'byteLength', 'l');
  addGetter($TypedArrayPrototype$, 'length', 'e');
  dP($TypedArrayPrototype$, TAG, {
    get: function get() {
      return this[TYPED_ARRAY];
    }
  });
  module.exports = function (KEY, BYTES, wrapper, CLAMPED) {
    CLAMPED = !!CLAMPED;
    var NAME = KEY + (CLAMPED ? 'Clamped' : '') + 'Array';
    var GETTER = 'get' + KEY;
    var SETTER = 'set' + KEY;
    var TypedArray = global[NAME];
    var Base = TypedArray || {};
    var TAC = TypedArray && getPrototypeOf(TypedArray);
    var FORCED = !TypedArray || !$typed.ABV;
    var O = {};
    var TypedArrayPrototype = TypedArray && TypedArray[PROTOTYPE];
    var getter = function getter(that, index) {
      var data = that._d;
      return data.v[GETTER](index * BYTES + data.o, LITTLE_ENDIAN);
    };
    var setter = function setter(that, index, value) {
      var data = that._d;
      if (CLAMPED) value = (value = Math.round(value)) < 0 ? 0 : value > 0xff ? 0xff : value & 0xff;
      data.v[SETTER](index * BYTES + data.o, value, LITTLE_ENDIAN);
    };
    var addElement = function addElement(that, index) {
      dP(that, index, {
        get: function get() {
          return getter(this, index);
        },
        set: function set(value) {
          return setter(this, index, value);
        },
        enumerable: true
      });
    };
    if (FORCED) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME, '_d');
        var index = 0;
        var offset = 0;
        var buffer, byteLength, length, klass;
        if (!isObject(data)) {
          length = toIndex(data);
          byteLength = length * BYTES;
          buffer = new $ArrayBuffer(byteLength);
        } else if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          buffer = data;
          offset = toOffset($offset, BYTES);
          var $len = data.byteLength;
          if ($length === undefined) {
            if ($len % BYTES) throw RangeError(WRONG_LENGTH);
            byteLength = $len - offset;
            if (byteLength < 0) throw RangeError(WRONG_LENGTH);
          } else {
            byteLength = toLength($length) * BYTES;
            if (byteLength + offset > $len) throw RangeError(WRONG_LENGTH);
          }
          length = byteLength / BYTES;
        } else if (TYPED_ARRAY in data) {
          return fromList(TypedArray, data);
        } else {
          return $from.call(TypedArray, data);
        }
        hide(that, '_d', {
          b: buffer,
          o: offset,
          l: byteLength,
          e: length,
          v: new $DataView(buffer)
        });
        while (index < length) {
          addElement(that, index++);
        }
      });
      TypedArrayPrototype = TypedArray[PROTOTYPE] = create($TypedArrayPrototype$);
      hide(TypedArrayPrototype, 'constructor', TypedArray);
    } else if (!fails(function () {
      TypedArray(1);
    }) || !fails(function () {
      new TypedArray(-1);
    }) || !$iterDetect(function (iter) {
      new TypedArray();
      new TypedArray(null);
      new TypedArray(1.5);
      new TypedArray(iter);
    }, true)) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME);
        var klass;
        if (!isObject(data)) return new Base(toIndex(data));
        if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          return $length !== undefined ? new Base(data, toOffset($offset, BYTES), $length) : $offset !== undefined ? new Base(data, toOffset($offset, BYTES)) : new Base(data);
        }
        if (TYPED_ARRAY in data) return fromList(TypedArray, data);
        return $from.call(TypedArray, data);
      });
      arrayForEach(TAC !== Function.prototype ? gOPN(Base).concat(gOPN(TAC)) : gOPN(Base), function (key) {
        if (!(key in TypedArray)) hide(TypedArray, key, Base[key]);
      });
      TypedArray[PROTOTYPE] = TypedArrayPrototype;
      if (!LIBRARY) TypedArrayPrototype.constructor = TypedArray;
    }
    var $nativeIterator = TypedArrayPrototype[ITERATOR];
    var CORRECT_ITER_NAME = !!$nativeIterator && ($nativeIterator.name == 'values' || $nativeIterator.name == undefined);
    var $iterator = $iterators.values;
    hide(TypedArray, TYPED_CONSTRUCTOR, true);
    hide(TypedArrayPrototype, TYPED_ARRAY, NAME);
    hide(TypedArrayPrototype, VIEW, true);
    hide(TypedArrayPrototype, DEF_CONSTRUCTOR, TypedArray);
    if (CLAMPED ? new TypedArray(1)[TAG] != NAME : !(TAG in TypedArrayPrototype)) {
      dP(TypedArrayPrototype, TAG, {
        get: function get() {
          return NAME;
        }
      });
    }
    O[NAME] = TypedArray;
    $export($export.G + $export.W + $export.F * (TypedArray != Base), O);
    $export($export.S, NAME, { BYTES_PER_ELEMENT: BYTES });
    $export($export.S + $export.F * fails(function () {
      Base.of.call(TypedArray, 1);
    }), NAME, {
      from: $from,
      of: $of
    });
    if (!(BYTES_PER_ELEMENT in TypedArrayPrototype)) hide(TypedArrayPrototype, BYTES_PER_ELEMENT, BYTES);
    $export($export.P, NAME, proto);
    setSpecies(NAME);
    $export($export.P + $export.F * FORCED_SET, NAME, { set: $set });
    $export($export.P + $export.F * !CORRECT_ITER_NAME, NAME, $iterators);
    if (!LIBRARY && TypedArrayPrototype.toString != arrayToString) TypedArrayPrototype.toString = arrayToString;
    $export($export.P + $export.F * fails(function () {
      new TypedArray(1).slice();
    }), NAME, { slice: $slice });
    $export($export.P + $export.F * (fails(function () {
      return [1, 2].toLocaleString() != new TypedArray([1, 2]).toLocaleString();
    }) || !fails(function () {
      TypedArrayPrototype.toLocaleString.call([1, 2]);
    })), NAME, { toLocaleString: $toLocaleString });
    Iterators[NAME] = CORRECT_ITER_NAME ? $nativeIterator : $iterator;
    if (!LIBRARY && !CORRECT_ITER_NAME) hide(TypedArrayPrototype, ITERATOR, $iterator);
  };
} else module.exports = function () {};

/***/ }),
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var DESCRIPTORS = __webpack_require__(2);
var LIBRARY = __webpack_require__(18);
var $typed = __webpack_require__(30);
var hide = __webpack_require__(3);
var redefineAll = __webpack_require__(31);
var fails = __webpack_require__(12);
var anInstance = __webpack_require__(32);
var toInteger = __webpack_require__(9);
var toLength = __webpack_require__(5);
var toIndex = __webpack_require__(33);
var gOPN = __webpack_require__(34).f;
var dP = __webpack_require__(6).f;
var arrayFill = __webpack_require__(40);
var setToStringTag = __webpack_require__(25);
var ARRAY_BUFFER = 'ArrayBuffer';
var DATA_VIEW = 'DataView';
var PROTOTYPE = 'prototype';
var WRONG_LENGTH = 'Wrong length!';
var WRONG_INDEX = 'Wrong index!';
var $ArrayBuffer = global[ARRAY_BUFFER];
var $DataView = global[DATA_VIEW];
var Math = global.Math;
var RangeError = global.RangeError;
var Infinity = global.Infinity;
var BaseBuffer = $ArrayBuffer;
var abs = Math.abs;
var pow = Math.pow;
var floor = Math.floor;
var log = Math.log;
var LN2 = Math.LN2;
var BUFFER = 'buffer';
var BYTE_LENGTH = 'byteLength';
var BYTE_OFFSET = 'byteOffset';
var $BUFFER = DESCRIPTORS ? '_b' : BUFFER;
var $LENGTH = DESCRIPTORS ? '_l' : BYTE_LENGTH;
var $OFFSET = DESCRIPTORS ? '_o' : BYTE_OFFSET;
function packIEEE754(value, mLen, nBytes) {
  var buffer = Array(nBytes);
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? pow(2, -24) - pow(2, -77) : 0;
  var i = 0;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
  var e, m, c;
  value = abs(value);
  if (value != value || value === Infinity) {
    m = value != value ? 1 : 0;
    e = eMax;
  } else {
    e = floor(log(value) / LN2);
    if (value * (c = pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }
    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * pow(2, eBias - 1) * pow(2, mLen);
      e = 0;
    }
  }
  for (; mLen >= 8; buffer[i++] = m & 255, m /= 256, mLen -= 8) {}
  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[i++] = e & 255, e /= 256, eLen -= 8) {}
  buffer[--i] |= s * 128;
  return buffer;
}
function unpackIEEE754(buffer, mLen, nBytes) {
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = eLen - 7;
  var i = nBytes - 1;
  var s = buffer[i--];
  var e = s & 127;
  var m;
  s >>= 7;
  for (; nBits > 0; e = e * 256 + buffer[i], i--, nBits -= 8) {}
  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[i], i--, nBits -= 8) {}
  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : s ? -Infinity : Infinity;
  } else {
    m = m + pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * pow(2, e - mLen);
}
function unpackI32(bytes) {
  return bytes[3] << 24 | bytes[2] << 16 | bytes[1] << 8 | bytes[0];
}
function packI8(it) {
  return [it & 0xff];
}
function packI16(it) {
  return [it & 0xff, it >> 8 & 0xff];
}
function packI32(it) {
  return [it & 0xff, it >> 8 & 0xff, it >> 16 & 0xff, it >> 24 & 0xff];
}
function packF64(it) {
  return packIEEE754(it, 52, 8);
}
function packF32(it) {
  return packIEEE754(it, 23, 4);
}
function addGetter(C, key, internal) {
  dP(C[PROTOTYPE], key, {
    get: function get() {
      return this[internal];
    }
  });
}
function get(view, bytes, index, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = store.slice(start, start + bytes);
  return isLittleEndian ? pack : pack.reverse();
}
function set(view, bytes, index, conversion, value, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = conversion(+value);
  for (var i = 0; i < bytes; i++) {
    store[start + i] = pack[isLittleEndian ? i : bytes - i - 1];
  }
}
if (!$typed.ABV) {
  $ArrayBuffer = function ArrayBuffer(length) {
    anInstance(this, $ArrayBuffer, ARRAY_BUFFER);
    var byteLength = toIndex(length);
    this._b = arrayFill.call(Array(byteLength), 0);
    this[$LENGTH] = byteLength;
  };
  $DataView = function DataView(buffer, byteOffset, byteLength) {
    anInstance(this, $DataView, DATA_VIEW);
    anInstance(buffer, $ArrayBuffer, DATA_VIEW);
    var bufferLength = buffer[$LENGTH];
    var offset = toInteger(byteOffset);
    if (offset < 0 || offset > bufferLength) throw RangeError('Wrong offset!');
    byteLength = byteLength === undefined ? bufferLength - offset : toLength(byteLength);
    if (offset + byteLength > bufferLength) throw RangeError(WRONG_LENGTH);
    this[$BUFFER] = buffer;
    this[$OFFSET] = offset;
    this[$LENGTH] = byteLength;
  };
  if (DESCRIPTORS) {
    addGetter($ArrayBuffer, BYTE_LENGTH, '_l');
    addGetter($DataView, BUFFER, '_b');
    addGetter($DataView, BYTE_LENGTH, '_l');
    addGetter($DataView, BYTE_OFFSET, '_o');
  }
  redefineAll($DataView[PROTOTYPE], {
    getInt8: function getInt8(byteOffset) {
      return get(this, 1, byteOffset)[0] << 24 >> 24;
    },
    getUint8: function getUint8(byteOffset) {
      return get(this, 1, byteOffset)[0];
    },
    getInt16: function getInt16(byteOffset) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return (bytes[1] << 8 | bytes[0]) << 16 >> 16;
    },
    getUint16: function getUint16(byteOffset) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return bytes[1] << 8 | bytes[0];
    },
    getInt32: function getInt32(byteOffset) {
      return unpackI32(get(this, 4, byteOffset, arguments[1]));
    },
    getUint32: function getUint32(byteOffset) {
      return unpackI32(get(this, 4, byteOffset, arguments[1])) >>> 0;
    },
    getFloat32: function getFloat32(byteOffset) {
      return unpackIEEE754(get(this, 4, byteOffset, arguments[1]), 23, 4);
    },
    getFloat64: function getFloat64(byteOffset) {
      return unpackIEEE754(get(this, 8, byteOffset, arguments[1]), 52, 8);
    },
    setInt8: function setInt8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setUint8: function setUint8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setInt16: function setInt16(byteOffset, value) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setUint16: function setUint16(byteOffset, value) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setInt32: function setInt32(byteOffset, value) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setUint32: function setUint32(byteOffset, value) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setFloat32: function setFloat32(byteOffset, value) {
      set(this, 4, byteOffset, packF32, value, arguments[2]);
    },
    setFloat64: function setFloat64(byteOffset, value) {
      set(this, 8, byteOffset, packF64, value, arguments[2]);
    }
  });
} else {
  if (!fails(function () {
    $ArrayBuffer(1);
  }) || !fails(function () {
    new $ArrayBuffer(-1);
  }) || fails(function () {
    new $ArrayBuffer();
    new $ArrayBuffer(1.5);
    new $ArrayBuffer(NaN);
    return $ArrayBuffer.name != ARRAY_BUFFER;
  })) {
    $ArrayBuffer = function ArrayBuffer(length) {
      anInstance(this, $ArrayBuffer);
      return new BaseBuffer(toIndex(length));
    };
    var ArrayBufferProto = $ArrayBuffer[PROTOTYPE] = BaseBuffer[PROTOTYPE];
    for (var keys = gOPN(BaseBuffer), j = 0, key; keys.length > j;) {
      if (!((key = keys[j++]) in $ArrayBuffer)) hide($ArrayBuffer, key, BaseBuffer[key]);
    }
    if (!LIBRARY) ArrayBufferProto.constructor = $ArrayBuffer;
  }
  var view = new $DataView(new $ArrayBuffer(2));
  var $setInt8 = $DataView[PROTOTYPE].setInt8;
  view.setInt8(0, 2147483648);
  view.setInt8(1, 2147483649);
  if (view.getInt8(0) || !view.getInt8(1)) redefineAll($DataView[PROTOTYPE], {
    setInt8: function setInt8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    },
    setUint8: function setUint8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    }
  }, true);
}
setToStringTag($ArrayBuffer, ARRAY_BUFFER);
setToStringTag($DataView, DATA_VIEW);
hide($DataView[PROTOTYPE], $typed.VIEW, true);
exports[ARRAY_BUFFER] = $ArrayBuffer;
exports[DATA_VIEW] = $DataView;

/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var Iterators = __webpack_require__(11);
var ITERATOR = __webpack_require__(0)('iterator');
var ArrayProto = Array.prototype;
module.exports = function (it) {
  return it !== undefined && (Iterators.Array === it || ArrayProto[ITERATOR] === it);
};

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var dP = __webpack_require__(6);
var anObject = __webpack_require__(14);
var getKeys = __webpack_require__(53);
module.exports = __webpack_require__(2) ? Object.defineProperties : function defineProperties(O, Properties) {
  anObject(O);
  var keys = getKeys(Properties);
  var length = keys.length;
  var i = 0;
  var P;
  while (length > i) {
    dP.f(O, P = keys[i++], Properties[P]);
  }return O;
};

/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var $keys = __webpack_require__(35);
var enumBugKeys = __webpack_require__(24);
module.exports = Object.keys || function keys(O) {
  return $keys(O, enumBugKeys);
};

/***/ }),
/* 54 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var document = __webpack_require__(1).document;
module.exports = document && document.documentElement;

/***/ }),
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var classof = __webpack_require__(41);
var ITERATOR = __webpack_require__(0)('iterator');
var Iterators = __webpack_require__(11);
module.exports = __webpack_require__(13).getIteratorMethod = function (it) {
  if (it != undefined) return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
};

/***/ }),
/* 56 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var ctx = __webpack_require__(21);
var IObject = __webpack_require__(36);
var toObject = __webpack_require__(10);
var toLength = __webpack_require__(5);
var asc = __webpack_require__(57);
module.exports = function (TYPE, $create) {
  var IS_MAP = TYPE == 1;
  var IS_FILTER = TYPE == 2;
  var IS_SOME = TYPE == 3;
  var IS_EVERY = TYPE == 4;
  var IS_FIND_INDEX = TYPE == 6;
  var NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
  var create = $create || asc;
  return function ($this, callbackfn, that) {
    var O = toObject($this);
    var self = IObject(O);
    var f = ctx(callbackfn, that, 3);
    var length = toLength(self.length);
    var index = 0;
    var result = IS_MAP ? create($this, length) : IS_FILTER ? create($this, 0) : undefined;
    var val, res;
    for (; length > index; index++) {
      if (NO_HOLES || index in self) {
        val = self[index];
        res = f(val, index, O);
        if (TYPE) {
          if (IS_MAP) result[index] = res;else if (res) switch (TYPE) {
            case 3:
              return true;
            case 5:
              return val;
            case 6:
              return index;
            case 2:
              result.push(val);
          } else if (IS_EVERY) return false;
        }
      }
    }return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : result;
  };
};

/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var speciesConstructor = __webpack_require__(58);
module.exports = function (original, length) {
  return new (speciesConstructor(original))(length);
};

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var isObject = __webpack_require__(7);
var isArray = __webpack_require__(59);
var SPECIES = __webpack_require__(0)('species');
module.exports = function (original) {
  var C;
  if (isArray(original)) {
    C = original.constructor;
    if (typeof C == 'function' && (C === Array || isArray(C.prototype))) C = undefined;
    if (isObject(C)) {
      C = C[SPECIES];
      if (C === null) C = undefined;
    }
  }
  return C === undefined ? Array : C;
};

/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var cof = __webpack_require__(22);
module.exports = Array.isArray || function isArray(arg) {
  return cof(arg) == 'Array';
};

/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var anObject = __webpack_require__(14);
var aFunction = __webpack_require__(29);
var SPECIES = __webpack_require__(0)('species');
module.exports = function (O, D) {
  var C = anObject(O).constructor;
  var S;
  return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? D : aFunction(S);
};

/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var addToUnscopables = __webpack_require__(62);
var step = __webpack_require__(63);
var Iterators = __webpack_require__(11);
var toIObject = __webpack_require__(16);
module.exports = __webpack_require__(64)(Array, 'Array', function (iterated, kind) {
  this._t = toIObject(iterated);
  this._i = 0;
  this._k = kind;
}, function () {
  var O = this._t;
  var kind = this._k;
  var index = this._i++;
  if (!O || index >= O.length) {
    this._t = undefined;
    return step(1);
  }
  if (kind == 'keys') return step(0, index);
  if (kind == 'values') return step(0, O[index]);
  return step(0, [index, O[index]]);
}, 'values');
Iterators.Arguments = Iterators.Array;
addToUnscopables('keys');
addToUnscopables('values');
addToUnscopables('entries');

/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var UNSCOPABLES = __webpack_require__(0)('unscopables');
var ArrayProto = Array.prototype;
if (ArrayProto[UNSCOPABLES] == undefined) __webpack_require__(3)(ArrayProto, UNSCOPABLES, {});
module.exports = function (key) {
  ArrayProto[UNSCOPABLES][key] = true;
};

/***/ }),
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function (done, value) {
  return {
    value: value,
    done: !!done
  };
};

/***/ }),
/* 64 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var LIBRARY = __webpack_require__(18);
var $export = __webpack_require__(26);
var redefine = __webpack_require__(20);
var hide = __webpack_require__(3);
var has = __webpack_require__(4);
var Iterators = __webpack_require__(11);
var $iterCreate = __webpack_require__(65);
var setToStringTag = __webpack_require__(25);
var getPrototypeOf = __webpack_require__(43);
var ITERATOR = __webpack_require__(0)('iterator');
var BUGGY = !([].keys && 'next' in [].keys());
var FF_ITERATOR = '@@iterator';
var KEYS = 'keys';
var VALUES = 'values';
var returnThis = function returnThis() {
  return this;
};
module.exports = function (Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCED) {
  $iterCreate(Constructor, NAME, next);
  var getMethod = function getMethod(kind) {
    if (!BUGGY && kind in proto) return proto[kind];
    switch (kind) {
      case KEYS:
        return function keys() {
          return new Constructor(this, kind);
        };
      case VALUES:
        return function values() {
          return new Constructor(this, kind);
        };
    }
    return function entries() {
      return new Constructor(this, kind);
    };
  };
  var TAG = NAME + ' Iterator';
  var DEF_VALUES = DEFAULT == VALUES;
  var VALUES_BUG = false;
  var proto = Base.prototype;
  var $native = proto[ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT];
  var $default = $native || getMethod(DEFAULT);
  var $entries = DEFAULT ? !DEF_VALUES ? $default : getMethod('entries') : undefined;
  var $anyNative = NAME == 'Array' ? proto.entries || $native : $native;
  var methods, key, IteratorPrototype;
  if ($anyNative) {
    IteratorPrototype = getPrototypeOf($anyNative.call(new Base()));
    if (IteratorPrototype !== Object.prototype && IteratorPrototype.next) {
      setToStringTag(IteratorPrototype, TAG, true);
      if (!LIBRARY && !has(IteratorPrototype, ITERATOR)) hide(IteratorPrototype, ITERATOR, returnThis);
    }
  }
  if (DEF_VALUES && $native && $native.name !== VALUES) {
    VALUES_BUG = true;
    $default = function values() {
      return $native.call(this);
    };
  }
  if ((!LIBRARY || FORCED) && (BUGGY || VALUES_BUG || !proto[ITERATOR])) {
    hide(proto, ITERATOR, $default);
  }
  Iterators[NAME] = $default;
  Iterators[TAG] = returnThis;
  if (DEFAULT) {
    methods = {
      values: DEF_VALUES ? $default : getMethod(VALUES),
      keys: IS_SET ? $default : getMethod(KEYS),
      entries: $entries
    };
    if (FORCED) for (key in methods) {
      if (!(key in proto)) redefine(proto, key, methods[key]);
    } else $export($export.P + $export.F * (BUGGY || VALUES_BUG), NAME, methods);
  }
  return methods;
};

/***/ }),
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var create = __webpack_require__(42);
var descriptor = __webpack_require__(15);
var setToStringTag = __webpack_require__(25);
var IteratorPrototype = {};
__webpack_require__(3)(IteratorPrototype, __webpack_require__(0)('iterator'), function () {
  return this;
});
module.exports = function (Constructor, NAME, next) {
  Constructor.prototype = create(IteratorPrototype, { next: descriptor(1, next) });
  setToStringTag(Constructor, NAME + ' Iterator');
};

/***/ }),
/* 66 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var ITERATOR = __webpack_require__(0)('iterator');
var SAFE_CLOSING = false;
try {
  var riter = [7][ITERATOR]();
  riter['return'] = function () {
    SAFE_CLOSING = true;
  };
  Array.from(riter, function () {
    throw 2;
  });
} catch (e) {}
module.exports = function (exec, skipClosing) {
  if (!skipClosing && !SAFE_CLOSING) return false;
  var safe = false;
  try {
    var arr = [7];
    var iter = arr[ITERATOR]();
    iter.next = function () {
      return { done: safe = true };
    };
    arr[ITERATOR] = function () {
      return iter;
    };
    exec(arr);
  } catch (e) {}
  return safe;
};

/***/ }),
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var global = __webpack_require__(1);
var dP = __webpack_require__(6);
var DESCRIPTORS = __webpack_require__(2);
var SPECIES = __webpack_require__(0)('species');
module.exports = function (KEY) {
  var C = global[KEY];
  if (DESCRIPTORS && C && !C[SPECIES]) dP.f(C, SPECIES, {
    configurable: true,
    get: function get() {
      return this;
    }
  });
};

/***/ }),
/* 68 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var toObject = __webpack_require__(10);
var toAbsoluteIndex = __webpack_require__(17);
var toLength = __webpack_require__(5);
module.exports = [].copyWithin || function copyWithin(target, start) {
  var O = toObject(this);
  var len = toLength(O.length);
  var to = toAbsoluteIndex(target, len);
  var from = toAbsoluteIndex(start, len);
  var end = arguments.length > 2 ? arguments[2] : undefined;
  var count = Math.min((end === undefined ? len : toAbsoluteIndex(end, len)) - from, len - to);
  var inc = 1;
  if (from < to && to < from + count) {
    inc = -1;
    from += count - 1;
    to += count - 1;
  }
  while (count-- > 0) {
    if (from in O) O[to] = O[from];else delete O[to];
    to += inc;
    from += inc;
  }
  return O;
};

/***/ }),
/* 69 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var pIE = __webpack_require__(70);
var createDesc = __webpack_require__(15);
var toIObject = __webpack_require__(16);
var toPrimitive = __webpack_require__(19);
var has = __webpack_require__(4);
var IE8_DOM_DEFINE = __webpack_require__(27);
var gOPD = Object.getOwnPropertyDescriptor;
exports.f = __webpack_require__(2) ? gOPD : function getOwnPropertyDescriptor(O, P) {
  O = toIObject(O);
  P = toPrimitive(P, true);
  if (IE8_DOM_DEFINE) try {
    return gOPD(O, P);
  } catch (e) {}
  if (has(O, P)) return createDesc(!pIE.f.call(O, P), O[P]);
};

/***/ }),
/* 70 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.f = {}.propertyIsEnumerable;

/***/ })
/******/ ]);
});
//# sourceMappingURL=compatibility.js.map