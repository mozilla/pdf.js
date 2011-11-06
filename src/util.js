/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

function log(msg) {
  if (console && console.log)
    console.log(msg);
  else if (print)
    print(msg);
}

function warn(msg) {
  if (verbosity >= WARNINGS)
    log('Warning: ' + msg);
}

function backtrace() {
  try {
    throw new Error();
  } catch (e) {
    return e.stack ? e.stack.split('\n').slice(2).join('\n') : '';
  }
}

function error(msg) {
  log('Error: ' + msg);
  log(backtrace());
  throw new Error(msg);
}

function TODO(what) {
  if (verbosity >= TODOS)
    log('TODO: ' + what);
}

function malformed(msg) {
  error('Malformed PDF: ' + msg);
}

function assert(cond, msg) {
  if (!cond)
    error(msg);
}

// In a well-formed PDF, |cond| holds.  If it doesn't, subsequent
// behavior is undefined.
function assertWellFormed(cond, msg) {
  if (!cond)
    malformed(msg);
}

function shadow(obj, prop, value) {
  Object.defineProperty(obj, prop, { value: value,
                                     enumerable: true,
                                     configurable: true,
                                     writable: false });
  return value;
}

function bytesToString(bytes) {
  var str = '';
  var length = bytes.length;
  for (var n = 0; n < length; ++n)
    str += String.fromCharCode(bytes[n]);
  return str;
}

function stringToBytes(str) {
  var length = str.length;
  var bytes = new Uint8Array(length);
  for (var n = 0; n < length; ++n)
    bytes[n] = str.charCodeAt(n) & 0xFF;
  return bytes;
}

var IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];

var Util = (function utilUtil() {
  function constructor() {}
  constructor.makeCssRgb = function makergb(r, g, b) {
    var ri = (255 * r) | 0, gi = (255 * g) | 0, bi = (255 * b) | 0;
    return 'rgb(' + ri + ',' + gi + ',' + bi + ')';
  };
  constructor.makeCssCmyk = function makecmyk(c, m, y, k) {
    c = (new DeviceCmykCS()).getRgb([c, m, y, k]);
    var ri = (255 * c[0]) | 0, gi = (255 * c[1]) | 0, bi = (255 * c[2]) | 0;
    return 'rgb(' + ri + ',' + gi + ',' + bi + ')';
  };
  constructor.applyTransform = function apply(p, m) {
    var xt = p[0] * m[0] + p[1] * m[2] + m[4];
    var yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  };

  return constructor;
})();

var PDFStringTranslateTable = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014,
  0x2013, 0x192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C,
  0x201D, 0x2018, 0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x141, 0x152, 0x160,
  0x178, 0x17D, 0x131, 0x142, 0x153, 0x161, 0x17E, 0, 0x20AC
];

function stringToPDFString(str) {
  var i, n = str.length, str2 = '';
  if (str[0] === '\xFE' && str[1] === '\xFF') {
    // UTF16BE BOM
    for (i = 2; i < n; i += 2)
      str2 += String.fromCharCode(
        (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1));
  } else {
    for (i = 0; i < n; ++i) {
      var code = PDFStringTranslateTable[str.charCodeAt(i)];
      str2 += code ? String.fromCharCode(code) : str.charAt(i);
    }
  }
  return str2;
}

function isBool(v) {
  return typeof v == 'boolean';
}

function isInt(v) {
  return typeof v == 'number' && ((v | 0) == v);
}

function isNum(v) {
  return typeof v == 'number';
}

function isString(v) {
  return typeof v == 'string';
}

function isNull(v) {
  return v === null;
}

function isName(v) {
  return v instanceof Name;
}

function isCmd(v, cmd) {
  return v instanceof Cmd && (!cmd || v.cmd == cmd);
}

function isDict(v, type) {
  return v instanceof Dict && (!type || v.get('Type').name == type);
}

function isArray(v) {
  return v instanceof Array;
}

function isStream(v) {
  return typeof v == 'object' && v != null && ('getChar' in v);
}

function isArrayBuffer(v) {
  return typeof v == 'object' && v != null && ('byteLength' in v);
}

function isRef(v) {
  return v instanceof Ref;
}

function isPDFFunction(v) {
  var fnDict;
  if (typeof v != 'object')
    return false;
  else if (isDict(v))
    fnDict = v;
  else if (isStream(v))
    fnDict = v.dict;
  else
    return false;
  return fnDict.has('FunctionType');
}

/**
 * 'Promise' object.
 * Each object that is stored in PDFObjects is based on a Promise object that
 * contains the status of the object and the data. There migth be situations,
 * where a function want to use the value of an object, but it isn't ready at
 * that time. To get a notification, once the object is ready to be used, s.o.
 * can add a callback using the `then` method on the promise that then calls
 * the callback once the object gets resolved.
 * A promise can get resolved only once and only once the data of the promise
 * can be set. If any of these happens twice or the data is required before
 * it was set, an exception is throw.
 */
var Promise = (function promise() {
  var EMPTY_PROMISE = {};

  /**
   * If `data` is passed in this constructor, the promise is created resolved.
   * If there isn't data, it isn't resolved at the beginning.
   */
  function Promise(name, data) {
    this.name = name;
    // If you build a promise and pass in some data it's already resolved.
    if (data != null) {
      this.isResolved = true;
      this._data = data;
      this.hasData = true;
    } else {
      this.isResolved = false;
      this._data = EMPTY_PROMISE;
    }
    this.callbacks = [];
  };

  Promise.prototype = {
    hasData: false,

    set data(value) {
      if (value === undefined) {
        return;
      }
      if (this._data !== EMPTY_PROMISE) {
        throw 'Promise ' + this.name +
                                ': Cannot set the data of a promise twice';
      }
      this._data = value;
      this.hasData = true;

      if (this.onDataCallback) {
        this.onDataCallback(value);
      }
    },

    get data() {
      if (this._data === EMPTY_PROMISE) {
        throw 'Promise ' + this.name + ': Cannot get data that isn\'t set';
      }
      return this._data;
    },

    onData: function promiseOnData(callback) {
      if (this._data !== EMPTY_PROMISE) {
        callback(this._data);
      } else {
        this.onDataCallback = callback;
      }
    },

    resolve: function promiseResolve(data) {
      if (this.isResolved) {
        throw 'A Promise can be resolved only once ' + this.name;
      }

      this.isResolved = true;
      this.data = data;
      var callbacks = this.callbacks;

      for (var i = 0, ii = callbacks.length; i < ii; i++) {
        callbacks[i].call(null, data);
      }
    },

    then: function promiseThen(callback) {
      if (!callback) {
        throw 'Requiring callback' + this.name;
      }

      // If the promise is already resolved, call the callback directly.
      if (this.isResolved) {
        var data = this.data;
        callback.call(null, data);
      } else {
        this.callbacks.push(callback);
      }
    }
  };

  return Promise;
})();

