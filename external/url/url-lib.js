/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Polyfill obtained from: https://github.com/Polymer/URL

(function URLConstructorClosure() {
  'use strict';

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

  exports.URL = JURL;
})();
