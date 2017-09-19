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
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

if (typeof PDFJS === 'undefined' || !PDFJS.compatibilityChecked) {
  var globalScope = require('./global_scope');
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
      globalScope.Uint8ClampedArray = require('core-js/fn/typed/uint8-clamped-array');
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