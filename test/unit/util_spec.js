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

import {
  BaseException,
  bytesToString,
  createValidAbsoluteUrl,
  getModificationDate,
  getUuid,
  string32,
  stringToBytes,
  stringToPDFString,
} from "../../src/shared/util.js";

describe("util", function () {
  describe("BaseException", function () {
    it("can initialize exception classes derived from BaseException", function () {
      class DerivedException extends BaseException {
        constructor(message) {
          super(message, "DerivedException");
          this.foo = "bar";
        }
      }

      const exception = new DerivedException("Something went wrong");
      expect(exception instanceof DerivedException).toEqual(true);
      expect(exception instanceof BaseException).toEqual(true);
      expect(exception.message).toEqual("Something went wrong");
      expect(exception.name).toEqual("DerivedException");
      expect(exception.foo).toEqual("bar");
      expect(exception.stack).toContain("BaseExceptionClosure");
    });
  });

  describe("bytesToString", function () {
    it("handles non-array arguments", function () {
      expect(function () {
        bytesToString(null);
      }).toThrow(new Error("Invalid argument for bytesToString"));
    });

    it("handles array arguments with a length not exceeding the maximum", function () {
      expect(bytesToString(new Uint8Array([]))).toEqual("");
      expect(bytesToString(new Uint8Array([102, 111, 111]))).toEqual("foo");
    });

    it("handles array arguments with a length exceeding the maximum", function () {
      const length = 10000; // Larger than MAX_ARGUMENT_COUNT = 8192.

      // Create an array with `length` 'a' character codes.
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = "a".charCodeAt(0);
      }

      // Create a string with `length` 'a' characters.
      const string = "a".repeat(length);

      expect(bytesToString(bytes)).toEqual(string);
    });
  });

  describe("string32", function () {
    it("converts unsigned 32-bit integers to strings", function () {
      expect(string32(0x74727565)).toEqual("true");
      expect(string32(0x74797031)).toEqual("typ1");
      expect(string32(0x4f54544f)).toEqual("OTTO");
    });
  });

  describe("stringToBytes", function () {
    it("handles non-string arguments", function () {
      expect(function () {
        stringToBytes(null);
      }).toThrow(new Error("Invalid argument for stringToBytes"));
    });

    it("handles string arguments", function () {
      expect(stringToBytes("")).toEqual(new Uint8Array([]));
      expect(stringToBytes("foo")).toEqual(new Uint8Array([102, 111, 111]));
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

  describe("ReadableStream", function () {
    it("should return an Object", function () {
      const readable = new ReadableStream();
      expect(typeof readable).toEqual("object");
    });

    it("should have property getReader", function () {
      const readable = new ReadableStream();
      expect(typeof readable.getReader).toEqual("function");
    });
  });

  describe("URL", function () {
    it("should return an Object", function () {
      const url = new URL("https://example.com");
      expect(typeof url).toEqual("object");
    });

    it("should have property `href`", function () {
      const url = new URL("https://example.com");
      expect(typeof url.href).toEqual("string");
    });
  });

  describe("createValidAbsoluteUrl", function () {
    it("handles invalid URLs", function () {
      expect(createValidAbsoluteUrl(undefined, undefined)).toEqual(null);
      expect(createValidAbsoluteUrl(null, null)).toEqual(null);
      expect(createValidAbsoluteUrl("/foo", "/bar")).toEqual(null);
    });

    it("handles URLs that do not use an allowed protocol", function () {
      expect(createValidAbsoluteUrl("magnet:?foo", null)).toEqual(null);
    });

    it("correctly creates a valid URL for allowed protocols", function () {
      // `http` protocol
      expect(
        createValidAbsoluteUrl("http://www.mozilla.org/foo", null)
      ).toEqual(new URL("http://www.mozilla.org/foo"));
      expect(createValidAbsoluteUrl("/foo", "http://www.mozilla.org")).toEqual(
        new URL("http://www.mozilla.org/foo")
      );

      // `https` protocol
      expect(
        createValidAbsoluteUrl("https://www.mozilla.org/foo", null)
      ).toEqual(new URL("https://www.mozilla.org/foo"));
      expect(createValidAbsoluteUrl("/foo", "https://www.mozilla.org")).toEqual(
        new URL("https://www.mozilla.org/foo")
      );

      // `ftp` protocol
      expect(createValidAbsoluteUrl("ftp://www.mozilla.org/foo", null)).toEqual(
        new URL("ftp://www.mozilla.org/foo")
      );
      expect(createValidAbsoluteUrl("/foo", "ftp://www.mozilla.org")).toEqual(
        new URL("ftp://www.mozilla.org/foo")
      );

      // `mailto` protocol (base URLs have no meaning and should yield `null`)
      expect(createValidAbsoluteUrl("mailto:foo@bar.baz", null)).toEqual(
        new URL("mailto:foo@bar.baz")
      );
      expect(createValidAbsoluteUrl("/foo", "mailto:foo@bar.baz")).toEqual(
        null
      );

      // `tel` protocol (base URLs have no meaning and should yield `null`)
      expect(createValidAbsoluteUrl("tel:+0123456789", null)).toEqual(
        new URL("tel:+0123456789")
      );
      expect(createValidAbsoluteUrl("/foo", "tel:0123456789")).toEqual(null);
    });
  });

  describe("getModificationDate", function () {
    it("should get a correctly formatted date", function () {
      const date = new Date(Date.UTC(3141, 5, 9, 2, 6, 53));
      expect(getModificationDate(date)).toEqual("31410609020653");
    });
  });

  describe("getUuid", function () {
    it("should get uuid string", function () {
      const uuid = getUuid();
      expect(typeof uuid).toEqual("string");
      expect(uuid.length).toBeGreaterThanOrEqual(32);
    });
  });
});
