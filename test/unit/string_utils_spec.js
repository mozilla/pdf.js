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

import {
  isAscii,
  stringToUTF16HexString,
  stringToUTF16String,
} from "../../src/core/string_utils.js";

describe("string_utils", function () {
  describe("isAscii", function () {
    it("handles ascii/non-ascii strings", function () {
      expect(isAscii("hello world")).toEqual(true);
      expect(isAscii("こんにちは世界の")).toEqual(false);
      expect(isAscii("hello world in Japanese is こんにちは世界の")).toEqual(
        false
      );
      expect(isAscii("")).toEqual(true);
      expect(isAscii(123)).toEqual(false);
      expect(isAscii(null)).toEqual(false);
      expect(isAscii(undefined)).toEqual(false);
    });
  });

  describe("stringToUTF16HexString", function () {
    it("should encode a string in UTF16 hexadecimal format", function () {
      expect(stringToUTF16HexString("hello world")).toEqual(
        "00680065006c006c006f00200077006f0072006c0064"
      );

      expect(stringToUTF16HexString("こんにちは世界の")).toEqual(
        "30533093306b3061306f4e16754c306e"
      );
    });
  });

  describe("stringToUTF16String", function () {
    it("should encode a string in UTF16", function () {
      expect(stringToUTF16String("hello world")).toEqual(
        "\0h\0e\0l\0l\0o\0 \0w\0o\0r\0l\0d"
      );

      expect(stringToUTF16String("こんにちは世界の")).toEqual(
        "\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f\x4e\x16\x75\x4c\x30\x6e"
      );
    });

    it("should encode a string in UTF16BE with a BOM", function () {
      expect(
        stringToUTF16String("hello world", /* bigEndian = */ true)
      ).toEqual("\xfe\xff\0h\0e\0l\0l\0o\0 \0w\0o\0r\0l\0d");

      expect(
        stringToUTF16String("こんにちは世界の", /* bigEndian = */ true)
      ).toEqual(
        "\xfe\xff\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f\x4e\x16\x75\x4c\x30\x6e"
      );
    });
  });
});
