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
  stringToPDFString,
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

  describe("stringToPDFString", function () {
    it("handles ISO Latin 1 strings", function () {
      const str = "\x8Dstring\x8E";
      expect(stringToPDFString(str)).toEqual("\u201Cstring\u201D");
    });

    it("handles UTF-16 big-endian strings", function () {
      const str = "\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67";
      expect(stringToPDFString(str)).toEqual("string");
    });

    it("handles incomplete UTF-16 big-endian strings", function () {
      const str = "\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00";
      expect(stringToPDFString(str)).toEqual("strin");
    });

    it("handles UTF-16 little-endian strings", function () {
      const str = "\xFF\xFE\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67\x00";
      expect(stringToPDFString(str)).toEqual("string");
    });

    it("handles incomplete UTF-16 little-endian strings", function () {
      const str = "\xFF\xFE\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67";
      expect(stringToPDFString(str)).toEqual("strin");
    });

    it("handles UTF-8 strings", function () {
      const simpleStr = "\xEF\xBB\xBF\x73\x74\x72\x69\x6E\x67";
      expect(stringToPDFString(simpleStr)).toEqual("string");

      const complexStr =
        "\xEF\xBB\xBF\xE8\xA1\xA8\xE3\x83\x9D\xE3\x81\x82\x41\xE9\xB7\x97" +
        "\xC5\x92\xC3\xA9\xEF\xBC\xA2\xE9\x80\x8D\xC3\x9C\xC3\x9F\xC2\xAA" +
        "\xC4\x85\xC3\xB1\xE4\xB8\x82\xE3\x90\x80\xF0\xA0\x80\x80";
      expect(stringToPDFString(complexStr)).toEqual(
        "表ポあA鷗ŒéＢ逍Üßªąñ丂㐀𠀀"
      );
    });

    it("handles empty strings", function () {
      // ISO Latin 1
      const str1 = "";
      expect(stringToPDFString(str1)).toEqual("");

      // UTF-16BE
      const str2 = "\xFE\xFF";
      expect(stringToPDFString(str2)).toEqual("");

      // UTF-16LE
      const str3 = "\xFF\xFE";
      expect(stringToPDFString(str3)).toEqual("");

      // UTF-8
      const str4 = "\xEF\xBB\xBF";
      expect(stringToPDFString(str4)).toEqual("");
    });

    it("handles strings with language code", function () {
      // ISO Latin 1
      const str1 = "hello \x1benUS\x1bworld";
      expect(stringToPDFString(str1)).toEqual("hello world");

      // UTF-16BE
      const str2 =
        "\xFE\xFF\x00h\x00e\x00l\x00l\x00o\x00 \x00\x1b\x00e\x00n\x00U\x00S\x00\x1b\x00w\x00o\x00r\x00l\x00d";
      expect(stringToPDFString(str2)).toEqual("hello world");

      // UTF-16LE
      const str3 =
        "\xFF\xFEh\x00e\x00l\x00l\x00o\x00 \x00\x1b\x00e\x00n\x00U\x00S\x00\x1b\x00w\x00o\x00r\x00l\x00d\x00";
      expect(stringToPDFString(str3)).toEqual("hello world");
    });
  });
});
