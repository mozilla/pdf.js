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

// This getFilenameFromContentDispositionHeader function is adapted from
// https://github.com/Rob--W/open-in-browser/blob/7e2e35a38b8b4e981b11da7b2f01df0149049e92/extension/content-disposition.js
// with the following changes:
// - Modified to conform to PDF.js's coding style.
// - Support UTF-8 decoding when TextDecoder is unsupported.
// - Move return to the end of the function to prevent Babel from dropping the
//   function declarations.

/**
 * Extract file name from the Content-Disposition HTTP response header.
 *
 * @param {string} contentDisposition
 * @returns {string} Filename, if found in the Content-Disposition header.
 */
function getFilenameFromContentDispositionHeader(contentDisposition) {
  let needsEncodingFixup = true;

  // filename*=ext-value ("ext-value" from RFC 5987, referenced by RFC 6266).
  let tmp = toParamRegExp('filename\\*', 'i').exec(contentDisposition);
  if (tmp) {
    tmp = tmp[1];
    let filename = rfc2616unquote(tmp);
    filename = unescape(filename);
    filename = rfc5987decode(filename);
    filename = rfc2047decode(filename);
    return fixupEncoding(filename);
  }

  // Continuations (RFC 2231 section 3, referenced by RFC 5987 section 3.1).
  // filename*n*=part
  // filename*n=part
  tmp = rfc2231getparam(contentDisposition);
  if (tmp) {
    // RFC 2047, section
    let filename = rfc2047decode(tmp);
    return fixupEncoding(filename);
  }

  // filename=value (RFC 5987, section 4.1).
  tmp = toParamRegExp('filename', 'i').exec(contentDisposition);
  if (tmp) {
    tmp = tmp[1];
    let filename = rfc2616unquote(tmp);
    filename = rfc2047decode(filename);
    return fixupEncoding(filename);
  }

  // After this line there are only function declarations. We cannot put
  // "return" here for readability because babel would then drop the function
  // declarations...
  function toParamRegExp(attributePattern, flags) {
    return new RegExp(
      '(?:^|;)\\s*' + attributePattern + '\\s*=\\s*' +
      // Captures: value = token | quoted-string
      // (RFC 2616, section 3.6 and referenced by RFC 6266 4.1)
      '(' +
        '[^";\\s][^;\\s]*' +
      '|' +
        '"(?:[^"\\\\]|\\\\"?)+"?' +
      ')', flags);
  }
  function textdecode(encoding, value) {
    if (encoding) {
      if (!/^[\x00-\xFF]+$/.test(value)) {
        return value;
      }
      try {
        let decoder = new TextDecoder(encoding, { fatal: true, });
        let bytes = Array.from(value, function(ch) {
          return ch.charCodeAt(0) & 0xFF;
        });
        value = decoder.decode(new Uint8Array(bytes));
        needsEncodingFixup = false;
      } catch (e) {
        // TextDecoder constructor threw - unrecognized encoding.
        // Or TextDecoder API is not available (in IE / Edge).
        if (/^utf-?8$/i.test(encoding)) {
          // UTF-8 is commonly used, try to support it in another way:
          try {
            value = decodeURIComponent(escape(value));
            needsEncodingFixup = false;
          } catch (err) {
          }
        }
      }
    }
    return value;
  }
  function fixupEncoding(value) {
    if (needsEncodingFixup && /[\x80-\xff]/.test(value)) {
      // Maybe multi-byte UTF-8.
      value = textdecode('utf-8', value);
      if (needsEncodingFixup) {
        // Try iso-8859-1 encoding.
        value = textdecode('iso-8859-1', value);
      }
    }
    return value;
  }
  function rfc2231getparam(contentDisposition) {
    let matches = [], match;
    // Iterate over all filename*n= and filename*n*= with n being an integer
    // of at least zero. Any non-zero number must not start with '0'.
    let iter = toParamRegExp('filename\\*((?!0\\d)\\d+)(\\*?)', 'ig');
    while ((match = iter.exec(contentDisposition)) !== null) {
      let [, n, quot, part] = match;
      n = parseInt(n, 10);
      if (n in matches) {
        // Ignore anything after the invalid second filename*0.
        if (n === 0) {
          break;
        }
        continue;
      }
      matches[n] = [quot, part];
    }
    let parts = [];
    for (let n = 0; n < matches.length; ++n) {
      if (!(n in matches)) {
        // Numbers must be consecutive. Truncate when there is a hole.
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
    return parts.join('');
  }
  function rfc2616unquote(value) {
    if (value.startsWith('"')) {
      let parts = value.slice(1).split('\\"');
      // Find the first unescaped " and terminate there.
      for (let i = 0; i < parts.length; ++i) {
        let quotindex = parts[i].indexOf('"');
        if (quotindex !== -1) {
          parts[i] = parts[i].slice(0, quotindex);
          parts.length = i + 1; // Truncates and stop the iteration.
        }
        parts[i] = parts[i].replace(/\\(.)/g, '$1');
      }
      value = parts.join('"');
    }
    return value;
  }
  function rfc5987decode(extvalue) {
    // Decodes "ext-value" from RFC 5987.
    let encodingend = extvalue.indexOf('\'');
    if (encodingend === -1) {
      // Some servers send "filename*=" without encoding 'language' prefix,
      // e.g. in https://github.com/Rob--W/open-in-browser/issues/26
      // Let's accept the value like Firefox (57) (Chrome 62 rejects it).
      return extvalue;
    }
    let encoding = extvalue.slice(0, encodingend);
    let langvalue = extvalue.slice(encodingend + 1);
    // Ignore language (RFC 5987 section 3.2.1, and RFC 6266 section 4.1 ).
    let value = langvalue.replace(/^[^']*'/, '');
    return textdecode(encoding, value);
  }
  function rfc2047decode(value) {
    // RFC 2047-decode the result. Firefox tried to drop support for it, but
    // backed out because some servers use it - https://bugzil.la/875615
    // Firefox's condition for decoding is here: https://searchfox.org/mozilla-central/rev/4a590a5a15e35d88a3b23dd6ac3c471cf85b04a8/netwerk/mime/nsMIMEHeaderParamImpl.cpp#742-748

    // We are more strict and only recognize RFC 2047-encoding if the value
    // starts with "=?", since then it is likely that the full value is
    // RFC 2047-encoded.

    // Firefox also decodes words even where RFC 2047 section 5 states:
    // "An 'encoded-word' MUST NOT appear within a 'quoted-string'."
    if (!value.startsWith('=?') || /[\x00-\x19\x80-\xff]/.test(value)) {
      return value;
    }
    // RFC 2047, section 2.4
    // encoded-word = "=?" charset "?" encoding "?" encoded-text "?="
    // charset = token (but let's restrict to characters that denote a
    //       possibly valid encoding).
    // encoding = q or b
    // encoded-text = any printable ASCII character other than ? or space.
    //        ... but Firefox permits ? and space.
    return value.replace(/=\?([\w-]*)\?([QqBb])\?((?:[^?]|\?(?!=))*)\?=/g,
      function(_, charset, encoding, text) {
        if (encoding === 'q' || encoding === 'Q') {
          // RFC 2047 section 4.2.
          text = text.replace(/_/g, ' ');
          text = text.replace(/=([0-9a-fA-F]{2})/g, function(_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
          });
          return textdecode(charset, text);
        } // else encoding is b or B - base64 (RFC 2047 section 4.1)
        try {
          text = atob(text);
        } catch (e) {
        }
        return textdecode(charset, text);
      });
  }

  return '';
}

export {
  getFilenameFromContentDispositionHeader,
};
