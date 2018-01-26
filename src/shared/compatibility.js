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
/* eslint-disable no-extend-native */
/* globals PDFJS */

// Skip compatibility checks for the extensions and if we already ran
// this module.
if ((typeof PDFJSDev === 'undefined' ||
     !PDFJSDev.test('FIREFOX || MOZCENTRAL')) &&
    (typeof PDFJS === 'undefined' || !PDFJS.compatibilityChecked)) {

// In the Chrome extension, most of the polyfills are unnecessary.
// We support down to Chrome 49, because it's still commonly used by Windows XP
// users - https://github.com/mozilla/pdf.js/issues/9397
if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('CHROME')) {

var globalScope = require('./global_scope');

const isNodeJS = require('./is_node');

var userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
var isAndroid = /Android/.test(userAgent);
var isIOSChrome = userAgent.indexOf('CriOS') >= 0;
var isIE = userAgent.indexOf('Trident') >= 0;
var isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent);
var isSafari = /Safari\//.test(userAgent) &&
               !/(Chrome\/|Android\s)/.test(userAgent);

var hasDOM = typeof window === 'object' && typeof document === 'object';

// Initializing PDFJS global object here, it case if we need to change/disable
// some PDF.js features, e.g. range requests
if (typeof PDFJS === 'undefined') {
  globalScope.PDFJS = {};
}

PDFJS.compatibilityChecked = true;

// Support: Node.js
(function checkNodeBtoa() {
  if (globalScope.btoa || !isNodeJS()) {
    return;
  }
  globalScope.btoa = function(chars) {
    // eslint-disable-next-line no-undef
    return Buffer.from(chars, 'binary').toString('base64');
  };
})();

// Support: Node.js
(function checkNodeAtob() {
  if (globalScope.atob || !isNodeJS()) {
    return;
  }
  globalScope.atob = function(input) {
    // eslint-disable-next-line no-undef
    return Buffer.from(input, 'base64').toString('binary');
  };
})();

// Checks if possible to use URL.createObjectURL()
// Support: IE, Chrome on iOS
(function checkOnBlobSupport() {
  // sometimes IE and Chrome on iOS loosing the data created with
  // createObjectURL(), see #3977 and #8081
  if (isIE || isIOSChrome) {
    PDFJS.disableCreateObjectURL = true;
  }
})();

// Checks if navigator.language is supported
// Support: IE<11
(function checkNavigatorLanguage() {
  if (typeof navigator === 'undefined') {
    return;
  }
  if ('language' in navigator) {
    return;
  }
  PDFJS.locale = navigator.userLanguage || 'en-US';
})();

// Support: Safari 6.0+, iOS
(function checkRangeRequests() {
  // Safari has issues with cached range requests see:
  // https://github.com/mozilla/pdf.js/issues/3260
  // Last tested with version 6.0.4.
  if (isSafari || isIOS) {
    PDFJS.disableRange = true;
    PDFJS.disableStream = true;
  }
})();

// Support: Android, iOS
(function checkCanvasSizeLimitation() {
  if (isIOS || isAndroid) {
    // 5MP
    PDFJS.maxCanvasPixels = 5242880;
  }
})();

// Disable fullscreen support for certain problematic configurations.
// Support: IE11+ (when embedded).
(function checkFullscreenSupport() {
  if (!hasDOM) {
    return;
  }
  if (isIE && window.parent !== window) {
    PDFJS.disableFullscreen = true;
  }
})();

// Provides document.currentScript support
// Support: IE, Chrome<29.
(function checkCurrentScript() {
  if (!hasDOM) {
    return;
  }
  if ('currentScript' in document) {
    return;
  }
  Object.defineProperty(document, 'currentScript', {
    get() {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    },
    enumerable: true,
    configurable: true,
  });
})();

// Provides support for ChildNode.remove in legacy browsers.
// Support: IE.
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

// Provides support for Array.prototype.includes in legacy browsers.
// Support: IE, Chrome<47
(function checkArrayIncludes() {
  if (Array.prototype.includes) {
    return;
  }
  Array.prototype.includes = require('core-js/fn/array/includes');
})();

// Provides support for Math.log2 in legacy browsers.
// Support: IE, Chrome<38
(function checkMathLog2() {
  if (Math.log2) {
    return;
  }
  Math.log2 = require('core-js/fn/math/log2');
})();

// Provides support for Number.isNaN in legacy browsers.
// Support: IE.
(function checkNumberIsNaN() {
  if (Number.isNaN) {
    return;
  }
  Number.isNaN = require('core-js/fn/number/is-nan');
})();

// Provides support for Number.isInteger in legacy browsers.
// Support: IE, Chrome<34
(function checkNumberIsInteger() {
  if (Number.isInteger) {
    return;
  }
  Number.isInteger = require('core-js/fn/number/is-integer');
})();

// Support: IE, Safari<8, Chrome<32
(function checkPromise() {
  if (globalScope.Promise) {
    return;
  }
  globalScope.Promise = require('core-js/fn/promise');
})();

// Support: IE<11, Safari<8, Chrome<36
(function checkWeakMap() {
  if (globalScope.WeakMap) {
    return;
  }
  globalScope.WeakMap = require('core-js/fn/weak-map');
})();

// Support: IE, Chrome<32
// Polyfill from https://github.com/Polymer/URL
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
(function checkURLConstructor() {
  // feature detect for URL constructor
  var hasWorkingUrl = false;
  try {
    if (typeof URL === 'function' &&
        typeof URL.prototype === 'object' &&
        ('origin' in URL.prototype)) {
      var u = new URL('b', 'http://a');
      u.pathname = 'c%20d';
      hasWorkingUrl = u.href === 'http://a/c%20d';
    }
  } catch (e) { }

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
    // XXX
    return h.toLowerCase();
  }

  function percentEscape(c) {
    var unicode = c.charCodeAt(0);
    if (unicode > 0x20 &&
       unicode < 0x7F &&
       // " # < > ? `
       [0x22, 0x23, 0x3C, 0x3E, 0x3F, 0x60].indexOf(unicode) === -1
      ) {
      return c;
    }
    return encodeURIComponent(c);
  }

  function percentEscapeQuery(c) {
    // XXX This actually needs to encode c using encoding and then
    // convert the bytes one-by-one.

    var unicode = c.charCodeAt(0);
    if (unicode > 0x20 &&
       unicode < 0x7F &&
       // " # < > ` (do not escape '?')
       [0x22, 0x23, 0x3C, 0x3E, 0x60].indexOf(unicode) === -1
      ) {
      return c;
    }
    return encodeURIComponent(c);
  }

  var EOF, ALPHA = /[a-zA-Z]/,
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

    loop: while ((input[cursor - 1] !== EOF || cursor === 0) &&
                 !this._isInvalid) {
      var c = input[cursor];
      switch (state) {
        case 'scheme start':
          if (c && ALPHA.test(c)) {
            buffer += c.toLowerCase(); // ASCII-safe
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
            buffer += c.toLowerCase(); // ASCII-safe
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
            } else if (this._isRelative && base &&
                       base._scheme === this._scheme) {
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
            // XXX error handling
            if (c !== EOF && c !== '\t' && c !== '\n' && c !== '\r') {
              this._schemeData += percentEscape(c);
            }
          }
          break;

        case 'no scheme':
          if (!base || !(isRelativeScheme(base._scheme))) {
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
            if (this._scheme !== 'file' || !ALPHA.test(c) ||
                (nextC !== ':' && nextC !== '|') ||
                (nextNextC !== EOF && nextNextC !== '/' && nextNextC !== '\\' &&
                 nextNextC !== '?' && nextNextC !== '#')) {
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
              // XXX check URL code points
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
          } else if (c === EOF || c === '/' || c === '\\' ||
                     c === '?' || c === '#') {
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
            if (buffer.length === 2 && ALPHA.test(buffer[0]) &&
                (buffer[1] === ':' || buffer[1] === '|')) {
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
            // XXX host parsing
            this._host = IDNAToASCII.call(this, buffer);
            buffer = '';
            state = 'port';
            if (stateOverride === 'hostname') {
              break loop;
            }
          } else if (c === EOF || c === '/' ||
                     c === '\\' || c === '?' || c === '#') {
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
          } else if (c === EOF || c === '/' || c === '\\' ||
                     c === '?' || c === '#' || stateOverride) {
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
          if (c === EOF || c === '/' || c === '\\' ||
              (!stateOverride && (c === '?' || c === '#'))) {
            if (c === '\\') {
              err('\\ not allowed in relative path.');
            }
            var tmp;
            if ((tmp = relativePathDotMapping[buffer.toLowerCase()])) {
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
              if (this._scheme === 'file' && this._path.length === 0 &&
                  buffer.length === 2 && ALPHA.test(buffer[0]) &&
                  buffer[1] === '|') {
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

  // Does not process domain names or IP addresses.
  // Does not handle encoding for the query parameter.
  function JURL(url, base /* , encoding */) {
    if (base !== undefined && !(base instanceof JURL)) {
      base = new JURL(String(base));
    }

    this._url = url;
    clear.call(this);

    var input = url.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');
    // encoding = encoding || 'utf-8'

    parse.call(this, input, null, base);
  }

  JURL.prototype = {
    toString() {
      return this.href;
    },
    get href() {
      if (this._isInvalid) {
        return this._url;
      }
      var authority = '';
      if (this._username !== '' || this._password !== null) {
        authority = this._username +
          (this._password !== null ? ':' + this._password : '') + '@';
      }

      return this.protocol +
          (this._isRelative ? '//' + authority + this.host : '') +
          this.pathname + this._query + this._fragment;
    },
    // The named parameter should be different from the setter's function name.
    // Otherwise Safari 5 will throw an error (see issue 8541)
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
      return this._isInvalid ? '' : this._port ?
          this._host + ':' + this._port : this._host;
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
      return this._isInvalid ? '' : this._isRelative ?
          '/' + this._path.join('/') : this._schemeData;
    },
    set pathname(value) {
      if (this._isInvalid || !this._isRelative) {
        return;
      }
      this._path = [];
      parse.call(this, value, 'relative path start');
    },

    get search() {
      return this._isInvalid || !this._query || this._query === '?' ?
          '' : this._query;
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
      return this._isInvalid || !this._fragment || this._fragment === '#' ?
          '' : this._fragment;
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
      // javascript: Gecko returns String(""), WebKit/Blink String("null")
      // Gecko throws error for "data://"
      // data: Gecko returns "", Blink returns "data://", WebKit returns "null"
      // Gecko returns String("") for file: mailto:
      // WebKit/Blink returns String("SCHEME://") for file: mailto:
      switch (this._scheme) {
        case 'data':
        case 'file':
        case 'javascript':
        case 'mailto':
          return 'null';
        case 'blob':
          // Special case of blob: -- returns valid origin of _schemeData.
          try {
            return new JURL(this._schemeData).origin || 'null';
          } catch (_) {
            // Invalid _schemeData origin -- ignoring errors.
          }
          return 'null';
      }
      host = this.host;
      if (!host) {
        return '';
      }
      return this._scheme + '://' + host;
    },
  };

  // Copy over the static methods
  var OriginalURL = globalScope.URL;
  if (OriginalURL) {
    JURL.createObjectURL = function(blob) {
      // IE extension allows a second optional options argument.
      // http://msdn.microsoft.com/en-us/library/ie/hh772302(v=vs.85).aspx
      return OriginalURL.createObjectURL.apply(OriginalURL, arguments);
    };
    JURL.revokeObjectURL = function(url) {
      OriginalURL.revokeObjectURL(url);
    };
  }

  globalScope.URL = JURL;
})();

} // End of !PDFJSDev.test('CHROME')

// Provides support for Object.values in legacy browsers.
// Support: IE, Chrome<54
(function checkObjectValues() {
  if (Object.values) {
    return;
  }
  Object.values = require('core-js/fn/object/values');
})();

}
