/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getFilenameFromContentDispositionHeader = getFilenameFromContentDispositionHeader;

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function getFilenameFromContentDispositionHeader(contentDisposition) {
  var needsEncodingFixup = true;
  var tmp = toParamRegExp('filename\\*', 'i').exec(contentDisposition);

  if (tmp) {
    tmp = tmp[1];
    var filename = rfc2616unquote(tmp);
    filename = unescape(filename);
    filename = rfc5987decode(filename);
    filename = rfc2047decode(filename);
    return fixupEncoding(filename);
  }

  tmp = rfc2231getparam(contentDisposition);

  if (tmp) {
    var _filename = rfc2047decode(tmp);

    return fixupEncoding(_filename);
  }

  tmp = toParamRegExp('filename', 'i').exec(contentDisposition);

  if (tmp) {
    tmp = tmp[1];

    var _filename2 = rfc2616unquote(tmp);

    _filename2 = rfc2047decode(_filename2);
    return fixupEncoding(_filename2);
  }

  function toParamRegExp(attributePattern, flags) {
    return new RegExp('(?:^|;)\\s*' + attributePattern + '\\s*=\\s*' + '(' + '[^";\\s][^;\\s]*' + '|' + '"(?:[^"\\\\]|\\\\"?)+"?' + ')', flags);
  }

  function textdecode(encoding, value) {
    if (encoding) {
      if (!/^[\x00-\xFF]+$/.test(value)) {
        return value;
      }

      try {
        var decoder = new TextDecoder(encoding, {
          fatal: true
        });
        var bytes = Array.from(value, function (ch) {
          return ch.charCodeAt(0) & 0xFF;
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
      value = textdecode('utf-8', value);

      if (needsEncodingFixup) {
        value = textdecode('iso-8859-1', value);
      }
    }

    return value;
  }

  function rfc2231getparam(contentDisposition) {
    var matches = [],
        match;
    var iter = toParamRegExp('filename\\*((?!0\\d)\\d+)(\\*?)', 'ig');

    while ((match = iter.exec(contentDisposition)) !== null) {
      var _match = match,
          _match2 = _slicedToArray(_match, 4),
          n = _match2[1],
          quot = _match2[2],
          part = _match2[3];

      n = parseInt(n, 10);

      if (n in matches) {
        if (n === 0) {
          break;
        }

        continue;
      }

      matches[n] = [quot, part];
    }

    var parts = [];

    for (var n = 0; n < matches.length; ++n) {
      if (!(n in matches)) {
        break;
      }

      var _matches$n = _slicedToArray(matches[n], 2),
          quot = _matches$n[0],
          part = _matches$n[1];

      part = rfc2616unquote(part);

      if (quot) {
        part = unescape(part);

        if (n === 0) {
          part = rfc5987decode(part);
        }
      }

      parts.push(part);
    }

    return parts.join('');
  }

  function rfc2616unquote(value) {
    if (value.startsWith('"')) {
      var parts = value.slice(1).split('\\"');

      for (var i = 0; i < parts.length; ++i) {
        var quotindex = parts[i].indexOf('"');

        if (quotindex !== -1) {
          parts[i] = parts[i].slice(0, quotindex);
          parts.length = i + 1;
        }

        parts[i] = parts[i].replace(/\\(.)/g, '$1');
      }

      value = parts.join('"');
    }

    return value;
  }

  function rfc5987decode(extvalue) {
    var encodingend = extvalue.indexOf('\'');

    if (encodingend === -1) {
      return extvalue;
    }

    var encoding = extvalue.slice(0, encodingend);
    var langvalue = extvalue.slice(encodingend + 1);
    var value = langvalue.replace(/^[^']*'/, '');
    return textdecode(encoding, value);
  }

  function rfc2047decode(value) {
    if (!value.startsWith('=?') || /[\x00-\x19\x80-\xff]/.test(value)) {
      return value;
    }

    return value.replace(/=\?([\w-]*)\?([QqBb])\?((?:[^?]|\?(?!=))*)\?=/g, function (_, charset, encoding, text) {
      if (encoding === 'q' || encoding === 'Q') {
        text = text.replace(/_/g, ' ');
        text = text.replace(/=([0-9a-fA-F]{2})/g, function (_, hex) {
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

  return '';
}