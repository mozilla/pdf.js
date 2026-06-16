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
  getUuid,
  stringToBytes,
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
      expect(exception).toBeInstanceOf(DerivedException);
      expect(exception).toBeInstanceOf(BaseException);
      expect(exception.message).toEqual("Something went wrong");
      expect(exception.name).toEqual("DerivedException");
      expect(exception.foo).toEqual("bar");
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

  describe("getUuid", function () {
    it("should get uuid string", function () {
      const uuid = getUuid();
      expect(typeof uuid).toEqual("string");
      expect(uuid.length).toBeGreaterThanOrEqual(32);
    });
  });
});
