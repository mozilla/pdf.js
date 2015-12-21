/*
 * Copyright 2013 Mozilla Foundation
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

var base64alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function decodeFontData(base64) {
  var result = [];

  var bits = 0, bitsLength = 0;
  for (var i = 0, ii = base64.length; i < ii; i++) {
    var ch = base64[i];
    if (ch <= ' ') {
      continue;
    }
    var index = base64alphabet.indexOf(ch);
    if (index < 0) {
      throw new Error('Invalid character');
    }
    if (index >= 64) {
      break;
    }
    bits = (bits << 6) | index;
    bitsLength += 6;
    if (bitsLength >= 8) {
      bitsLength -= 8;
      var code = (bits >> bitsLength) & 0xFF;
      result.push(code);
    }
  }
  return new Uint8Array(result);
}

function encodeFontData(data) {
  var buffer = '';
  var i, n;
  for (i = 0, n = data.length; i < n; i += 3) {
    var b1 = data[i] & 0xFF;
    var b2 = data[i + 1] & 0xFF;
    var b3 = data[i + 2] & 0xFF;
    var d1 = b1 >> 2, d2 = ((b1 & 3) << 4) | (b2 >> 4);
    var d3 = i + 1 < n ? ((b2 & 0xF) << 2) | (b3 >> 6) : 64;
    var d4 = i + 2 < n ? (b3 & 0x3F) : 64;
    buffer += (base64alphabet.charAt(d1) + base64alphabet.charAt(d2) +
                base64alphabet.charAt(d3) + base64alphabet.charAt(d4));
  }
  return buffer;
}

function ttx(data, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/ttx');

  var encodedData = encodeFontData(data);
  xhr.setRequestHeader('Content-type', 'text/plain');
  xhr.setRequestHeader('Content-length', encodedData.length);

  xhr.onreadystatechange = function getPdfOnreadystatechange(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(xhr.responseText);
      } else {
        callback('<error>Transport error: ' + xhr.statusText + '</error>');
      }
    }
  };
  xhr.send(encodedData);
}

function verifyTtxOutput(output) {
  var m = /^<error>(.*?)<\/error>/.exec(output);
  if (m) {
    throw m[1];
  }
}
