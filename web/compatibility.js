/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Checking if the typed arrays are supported
(function checkTypedArrayCompatibility() {
  if (typeof Uint8Array !== 'undefined') {
    // some mobile version might not support Float64Array
    if (typeof Float64Array === 'undefined')
      window.Float64Array = Float32Array;

    return;
  }

  function subarray(start, end) {
    return new TypedArray(this.slice(start, end));
  }

  function setArrayOffset(array, offset) {
    if (arguments.length < 2)
      offset = 0;
    for (var i = 0, n = array.length; i < n; ++i, ++offset)
      this[offset] = array[i] & 0xFF;
  }

  function TypedArray(arg1) {
    var result;
    if (typeof arg1 === 'number') {
      result = [];
      for (var i = 0; i < arg1; ++i)
        result[i] = 0;
    } else
      result = arg1.slice(0);

    result.subarray = subarray;
    result.buffer = result;
    result.byteLength = result.length;
    result.set = setArrayOffset;

    if (typeof arg1 === 'object' && arg1.buffer)
      result.buffer = arg1.buffer;

    return result;
  }

  window.Uint8Array = TypedArray;

  // we don't need support for set, byteLength for 32-bit array
  // so we can use the TypedArray as well
  window.Uint32Array = TypedArray;
  window.Int32Array = TypedArray;
  window.Uint16Array = TypedArray;
  window.Float32Array = TypedArray;
  window.Float64Array = TypedArray;
})();

// Object.create() ?
(function checkObjectCreateCompatibility() {
  if (typeof Object.create !== 'undefined')
    return;

  Object.create = function objectCreate(proto) {
    var constructor = function objectCreateConstructor() {};
    constructor.prototype = proto;
    return new constructor();
  };
})();

// Object.defineProperty() ?
(function checkObjectDefinePropertyCompatibility() {
  if (typeof Object.defineProperty !== 'undefined')
    return;

  Object.defineProperty = function objectDefineProperty(obj, name, def) {
    delete obj[name];
    if ('get' in def)
      obj.__defineGetter__(name, def['get']);
    if ('set' in def)
      obj.__defineSetter__(name, def['set']);
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

// Object.keys() ?
(function checkObjectKeysCompatibility() {
  if (typeof Object.keys !== 'undefined')
    return;

  Object.keys = function objectKeys(obj) {
    var result = [];
    for (var i in obj) {
      if (obj.hasOwnProperty(i))
        result.push(i);
    }
    return result;
  };
})();

// No XMLHttpRequest.response ?
(function checkXMLHttpRequestResponseCompatibility() {
  var xhrPrototype = XMLHttpRequest.prototype;
  if ('response' in xhrPrototype ||
      'mozResponseArrayBuffer' in xhrPrototype ||
      'mozResponse' in xhrPrototype ||
      'responseArrayBuffer' in xhrPrototype)
    return;
  // IE ?
  if (typeof VBArray !== 'undefined') {
    Object.defineProperty(xhrPrototype, 'response', {
      get: function xmlHttpRequestResponseGet() {
        return new Uint8Array(new VBArray(this.responseBody).toArray());
      }
    });
    return;
  }

  // other browsers
  function responseTypeSetter() {
    // will be only called to set "arraybuffer"
    this.overrideMimeType('text/plain; charset=x-user-defined');
  }
  if (typeof xhrPrototype.overrideMimeType === 'function') {
    Object.defineProperty(xhrPrototype, 'responseType',
                          { set: responseTypeSetter });
  }
  function responseGetter() {
    var text = this.responseText;
    var i, n = text.length;
    var result = new Uint8Array(n);
    for (i = 0; i < n; ++i)
      result[i] = text.charCodeAt(i) & 0xFF;
    return result;
  }
  Object.defineProperty(xhrPrototype, 'response', { get: responseGetter });
})();

// window.btoa (base64 encode function) ?
(function checkWindowBtoaCompatibility() {
  if ('btoa' in window)
    return;

  var digits =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  window.btoa = function windowBtoa(chars) {
    var buffer = '';
    var i, n;
    for (i = 0, n = chars.length; i < n; i += 3) {
      var b1 = chars.charCodeAt(i) & 0xFF;
      var b2 = chars.charCodeAt(i + 1) & 0xFF;
      var b3 = chars.charCodeAt(i + 2) & 0xFF;
      var d1 = b1 >> 2, d2 = ((b1 & 3) << 4) | (b2 >> 4);
      var d3 = i + 1 < n ? ((b2 & 0xF) << 2) | (b3 >> 6) : 64;
      var d4 = i + 2 < n ? (b3 & 0x3F) : 64;
      buffer += (digits.charAt(d1) + digits.charAt(d2) +
                 digits.charAt(d3) + digits.charAt(d4));
    }
    return buffer;
  };
})();

// Function.prototype.bind ?
(function checkFunctionPrototypeBindCompatibility() {
  if (typeof Function.prototype.bind !== 'undefined')
    return;

  Function.prototype.bind = function functionPrototypeBind(obj) {
    var fn = this, headArgs = Array.prototype.slice.call(arguments, 1);
    var bound = function functionPrototypeBindBound() {
      var args = Array.prototype.concat.apply(headArgs, arguments);
      return fn.apply(obj, args);
    };
    return bound;
  };
})();

// IE9 text/html data URI
(function checkDocumentDocumentModeCompatibility() {
  if (!('documentMode' in document) || document.documentMode !== 9)
    return;
  // overriding the src property
  var originalSrcDescriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype, 'src');
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    get: function htmlIFrameElementPrototypeSrcGet() { return this.$src; },
    set: function htmlIFrameElementPrototypeSrcSet(src) {
      this.$src = src;
      if (src.substr(0, 14) != 'data:text/html') {
        originalSrcDescriptor.set.call(this, src);
        return;
      }
      // for text/html, using blank document and then
      // document's open, write, and close operations
      originalSrcDescriptor.set.call(this, 'about:blank');
      setTimeout((function htmlIFrameElementPrototypeSrcOpenWriteClose() {
        var doc = this.contentDocument;
        doc.open('text/html');
        doc.write(src.substr(src.indexOf(',') + 1));
        doc.close();
      }).bind(this), 0);
    },
    enumerable: true
  });
})();

// HTMLElement dataset property
(function checkDatasetProperty() {
  var div = document.createElement('div');
  if ('dataset' in div)
    return; // dataset property exists
  var oldCreateElement = document.createElement;
  document.createElement = function newCreateElement() {
    var result = oldCreateElement.apply(document, arguments);
    if (arguments[0] === 'div') {
      // creating dataset property for the div elements
      result.dataset = {};
    }
    return result;
  };
})();

// Check console compatability
(function checkConsoleCompatibility() {
  if (typeof console == 'undefined') {
    console = {log: function() {}};
  }
})();
