/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// Checking if the typed arrays are supported
(function() {
  if (typeof Uint8Array !== 'undefined')
    return;

  function subarray(start, end) {
    return this.slice(start, end);
  }

  function set_(array, offset) {
    if (arguments.length < 2) offset = 0;
    for (var i = 0, n = array.length; i < n; ++i, ++offset)
      this[offset] = array[i] & 0xFF;
  }

  function TypedArray(arg1) {
    var result;
    if (typeof arg1 === 'number') {
       result = new Array(arg1);
       for (var i = 0; i < arg1; ++i)
         result[i] = 0;
    } else
       result = arg1.slice(0);
    result.subarray = subarray;
    result.buffer = result;
    result.byteLength = result.length;
    result.set = set_;
    if (typeof arg1 === 'object' && arg1.buffer)
      result.buffer = arg1.buffer;

    return result;
  }

  window.Uint8Array = TypedArray;

  // we don't need support for set, byteLength for 32-bit array
  // so we can use the TypedArray as well
  window.Uint32Array = TypedArray;
  window.Int32Array = TypedArray;
})();

// Object.create() ?
(function() {
  if (typeof Object.create !== 'undefined')
    return;

  Object.create = function(proto) {
    var constructor = function() {};
    constructor.prototype = proto;
    return new constructor();
  };
})();

// Object.defineProperty() ?
(function() {
  if (typeof Object.defineProperty !== 'undefined')
    return;

  Object.defineProperty = function(obj, name, def) {
    delete obj[name];
    if ('get' in def)
      obj.__defineGetter__(name, def['get']);
    if ('set' in def)
      obj.__defineSetter__(name, def['set']);
    if ('value' in def) {
      obj.__defineSetter__(name, function(value) {
        this.__defineGetter__(name, function() {
          return value;
        });
        return value;
      });
      obj[name] = def.value;
    }
  };
})();

// No XMLHttpRequest.response ?
(function() {
  var xhrPrototype = XMLHttpRequest.prototype;
  if ('response' in xhrPrototype ||
      'mozResponseArrayBuffer' in xhrPrototype ||
      'mozResponse' in xhrPrototype ||
      'responseArrayBuffer' in xhrPrototype)
    return;
  // IE ?
  if (typeof VBArray !== 'undefined') {
    Object.defineProperty(xhrPrototype, 'response', {
      get: function() {
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
(function() {
  if ('btoa' in window)
    return;

  var digits =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  window.btoa = function(chars) {
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
(function() {
  if (typeof Function.prototype.bind !== 'undefined')
    return;

  Function.prototype.bind = function(obj) {
    var fn = this, headArgs = Array.prototype.slice.call(arguments, 1);
    var binded = function(tailArgs) {
      var args = headArgs.concat(tailArgs);
      return fn.apply(obj, args);
    };
    return binded;
  };
})();
