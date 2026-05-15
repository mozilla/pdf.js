/* Copyright 2019 Mozilla Foundation
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

import { Util } from "../shared/util.js";

function isAscii(str) {
  if (typeof str !== "string") {
    return false;
  }
  return !str || /^[\x00-\x7F]*$/.test(str);
}

// If the string is null or undefined then it is returned as is.
function stringToAsciiOrUTF16BE(str) {
  if (str === null || str === undefined) {
    return str;
  }
  return isAscii(str) ? str : stringToUTF16String(str, /* bigEndian = */ true);
}

function stringToUTF16HexString(str) {
  const buf = [];
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push(Util.hexNums[(char >> 8) & 0xff], Util.hexNums[char & 0xff]);
  }
  return buf.join("");
}

function stringToUTF16String(str, bigEndian = false) {
  const buf = [];
  if (bigEndian) {
    buf.push("\xFE\xFF");
  }
  for (let i = 0, ii = str.length; i < ii; i++) {
    const char = str.charCodeAt(i);
    buf.push(
      String.fromCharCode((char >> 8) & 0xff),
      String.fromCharCode(char & 0xff)
    );
  }
  return buf.join("");
}

export {
  isAscii,
  stringToAsciiOrUTF16BE,
  stringToUTF16HexString,
  stringToUTF16String,
};
