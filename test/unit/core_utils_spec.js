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
  arrayBuffersToBytes,
  encodeToXmlString,
  escapePDFName,
  escapeString,
  getInheritableProperty,
  getSizeInBytes,
  isAscii,
  isWhiteSpace,
  log2,
  numberToString,
  parseXFAPath,
  recoverJsURL,
  stringToUTF16HexString,
  stringToUTF16String,
  toRomanNumerals,
  validateCSSFont,
} from "../../src/core/core_utils.js";
import { Dict, Ref } from "../../src/core/primitives.js";
import { XRefMock } from "./test_utils.js";

describe("core_utils", function () {
  describe("arrayBuffersToBytes", function () {
    it("handles zero ArrayBuffers", function () {
      const bytes = arrayBuffersToBytes([]);

      expect(bytes).toEqual(new Uint8Array(0));
    });

    it("handles one ArrayBuffer", function () {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const bytes = arrayBuffersToBytes([buffer]);

      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
      // Ensure that the fast-path works correctly.
      expect(bytes.buffer).toBe(buffer);
    });

    it("handles multiple ArrayBuffers", function () {
      const buffer1 = new Uint8Array([1, 2, 3]).buffer,
        buffer2 = new Uint8Array(0).buffer,
        buffer3 = new Uint8Array([4, 5]).buffer;
      const bytes = arrayBuffersToBytes([buffer1, buffer2, buffer3]);

      expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });

  describe("getInheritableProperty", function () {
    it("handles non-dictionary arguments", function () {
      expect(getInheritableProperty({ dict: null, key: "foo" })).toEqual(
        undefined
      );
      expect(getInheritableProperty({ dict: undefined, key: "foo" })).toEqual(
        undefined
      );
    });

    it("handles dictionaries that do not contain the property", function () {
      // Empty dictionary.
      const emptyDict = new Dict();
      expect(getInheritableProperty({ dict: emptyDict, key: "foo" })).toEqual(
        undefined
      );

      // Filled dictionary with a different property.
      const filledDict = new Dict();
      filledDict.set("bar", "baz");
      expect(getInheritableProperty({ dict: filledDict, key: "foo" })).toEqual(
        undefined
      );
    });

    it("fetches the property if it is not inherited", function () {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: "quux" }]);
      const dict = new Dict(xref);

      // Regular values should be fetched.
      dict.set("foo", "bar");
      expect(getInheritableProperty({ dict, key: "foo" })).toEqual("bar");

      // Array value should be fetched (with references resolved).
      dict.set("baz", ["qux", ref]);
      expect(
        getInheritableProperty({ dict, key: "baz", getArray: true })
      ).toEqual(["qux", "quux"]);
    });

    it("fetches the property if it is inherited and present on one level", function () {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: "quux" }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set("Parent", secondDict);

      // Regular values should be fetched.
      secondDict.set("foo", "bar");
      expect(getInheritableProperty({ dict: firstDict, key: "foo" })).toEqual(
        "bar"
      );

      // Array value should be fetched (with references resolved).
      secondDict.set("baz", ["qux", ref]);
      expect(
        getInheritableProperty({ dict: firstDict, key: "baz", getArray: true })
      ).toEqual(["qux", "quux"]);
    });

    it("fetches the property if it is inherited and present on multiple levels", function () {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: "quux" }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set("Parent", secondDict);

      // Regular values should be fetched.
      firstDict.set("foo", "bar1");
      secondDict.set("foo", "bar2");
      expect(getInheritableProperty({ dict: firstDict, key: "foo" })).toEqual(
        "bar1"
      );
      expect(
        getInheritableProperty({
          dict: firstDict,
          key: "foo",
          getArray: false,
          stopWhenFound: false,
        })
      ).toEqual(["bar1", "bar2"]);

      // Array value should be fetched (with references resolved).
      firstDict.set("baz", ["qux1", ref]);
      secondDict.set("baz", ["qux2", ref]);
      expect(
        getInheritableProperty({
          dict: firstDict,
          key: "baz",
          getArray: true,
          stopWhenFound: false,
        })
      ).toEqual([
        ["qux1", "quux"],
        ["qux2", "quux"],
      ]);
    });
  });

  describe("toRomanNumerals", function () {
    it("handles invalid arguments", function () {
      for (const input of ["foo", -1, 0]) {
        expect(function () {
          toRomanNumerals(input);
        }).toThrow(new Error("The number should be a positive integer."));
      }
    });

    it("converts numbers to uppercase Roman numerals", function () {
      expect(toRomanNumerals(1)).toEqual("I");
      expect(toRomanNumerals(6)).toEqual("VI");
      expect(toRomanNumerals(7)).toEqual("VII");
      expect(toRomanNumerals(8)).toEqual("VIII");
      expect(toRomanNumerals(10)).toEqual("X");
      expect(toRomanNumerals(40)).toEqual("XL");
      expect(toRomanNumerals(100)).toEqual("C");
      expect(toRomanNumerals(500)).toEqual("D");
      expect(toRomanNumerals(1000)).toEqual("M");
      expect(toRomanNumerals(2019)).toEqual("MMXIX");
    });

    it("converts numbers to lowercase Roman numerals", function () {
      expect(toRomanNumerals(1, /* lowercase = */ true)).toEqual("i");
      expect(toRomanNumerals(6, /* lowercase = */ true)).toEqual("vi");
      expect(toRomanNumerals(7, /* lowercase = */ true)).toEqual("vii");
      expect(toRomanNumerals(8, /* lowercase = */ true)).toEqual("viii");
      expect(toRomanNumerals(10, /* lowercase = */ true)).toEqual("x");
      expect(toRomanNumerals(40, /* lowercase = */ true)).toEqual("xl");
      expect(toRomanNumerals(100, /* lowercase = */ true)).toEqual("c");
      expect(toRomanNumerals(500, /* lowercase = */ true)).toEqual("d");
      expect(toRomanNumerals(1000, /* lowercase = */ true)).toEqual("m");
      expect(toRomanNumerals(2019, /* lowercase = */ true)).toEqual("mmxix");
    });
  });

  describe("log2", function () {
    it("handles values smaller than/equal to zero", function () {
      expect(log2(0)).toEqual(0);
      expect(log2(-1)).toEqual(0);
    });

    it("handles values larger than zero", function () {
      expect(log2(1)).toEqual(0);
      expect(log2(2)).toEqual(1);
      expect(log2(3)).toEqual(2);
      expect(log2(3.14)).toEqual(2);
    });
  });

  describe("numberToString", function () {
    it("should stringify integers", function () {
      expect(numberToString(1)).toEqual("1");
      expect(numberToString(0)).toEqual("0");
      expect(numberToString(-1)).toEqual("-1");
    });

    it("should stringify floats", function () {
      expect(numberToString(1.0)).toEqual("1");
      expect(numberToString(1.2)).toEqual("1.2");
      expect(numberToString(1.23)).toEqual("1.23");
      expect(numberToString(1.234)).toEqual("1.23");
    });
  });

  describe("isWhiteSpace", function () {
    it("handles space characters", function () {
      expect(isWhiteSpace(0x20)).toEqual(true);
      expect(isWhiteSpace(0x09)).toEqual(true);
      expect(isWhiteSpace(0x0d)).toEqual(true);
      expect(isWhiteSpace(0x0a)).toEqual(true);
    });

    it("handles non-space characters", function () {
      expect(isWhiteSpace(0x0b)).toEqual(false);
      expect(isWhiteSpace(null)).toEqual(false);
      expect(isWhiteSpace(undefined)).toEqual(false);
    });
  });

  describe("parseXFAPath", function () {
    it("should get a correctly parsed path", function () {
      const path = "foo.bar[12].oof[3].rab.FOO[123].BAR[456]";
      expect(parseXFAPath(path)).toEqual([
        { name: "foo", pos: 0 },
        { name: "bar", pos: 12 },
        { name: "oof", pos: 3 },
        { name: "rab", pos: 0 },
        { name: "FOO", pos: 123 },
        { name: "BAR", pos: 456 },
      ]);
    });
  });

  describe("recoverJsURL", function () {
    it("should get valid URLs without `newWindow` property", function () {
      const inputs = [
        "window.open('https://test.local')",
        "window.open('https://test.local', true)",
        "app.launchURL('https://test.local')",
        "app.launchURL('https://test.local', false)",
        "xfa.host.gotoURL('https://test.local')",
        "xfa.host.gotoURL('https://test.local', true)",
      ];

      for (const input of inputs) {
        expect(recoverJsURL(input)).toEqual({
          url: "https://test.local",
          newWindow: false,
        });
      }
    });

    it("should get valid URLs with `newWindow` property", function () {
      const input = "app.launchURL('https://test.local', true)";
      expect(recoverJsURL(input)).toEqual({
        url: "https://test.local",
        newWindow: true,
      });
    });

    it("should not get invalid URLs", function () {
      const input = "navigateToUrl('https://test.local')";
      expect(recoverJsURL(input)).toBeNull();
    });
  });

  describe("escapePDFName", function () {
    it("should escape PDF name", function () {
      expect(escapePDFName("hello")).toEqual("hello");
      expect(escapePDFName("\xfehello")).toEqual("#fehello");
      expect(escapePDFName("he\xfell\xffo")).toEqual("he#fell#ffo");
      expect(escapePDFName("\xfehe\xfell\xffo\xff")).toEqual(
        "#fehe#fell#ffo#ff"
      );
      expect(escapePDFName("#h#e#l#l#o")).toEqual("#23h#23e#23l#23l#23o");
      expect(escapePDFName("#()<>[]{}/%")).toEqual(
        "#23#28#29#3c#3e#5b#5d#7b#7d#2f#25"
      );
    });
  });

  describe("escapeString", function () {
    it("should escape (, ), \\n, \\r, and \\", function () {
      expect(escapeString("((a\\a))\n(b(b\\b)\rb)")).toEqual(
        "\\(\\(a\\\\a\\)\\)\\n\\(b\\(b\\\\b\\)\\rb\\)"
      );
    });
  });

  describe("encodeToXmlString", function () {
    it("should get a correctly encoded string with some entities", function () {
      const str = "\"\u0397ell😂' & <W😂rld>";
      expect(encodeToXmlString(str)).toEqual(
        "&quot;&#x397;ell&#x1F602;&apos; &amp; &lt;W&#x1F602;rld&gt;"
      );
    });

    it("should get a correctly encoded basic ascii string", function () {
      const str = "hello world";
      expect(encodeToXmlString(str)).toEqual(str);
    });
  });

  describe("validateCSSFont", function () {
    it("Check font family", function () {
      const cssFontInfo = {
        fontFamily: `"blah blah " blah blah"`,
        fontWeight: 0,
        italicAngle: 0,
      };

      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = `"blah blah \\" blah blah"`;
      expect(validateCSSFont(cssFontInfo)).toEqual(true);

      cssFontInfo.fontFamily = `'blah blah ' blah blah'`;
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = `'blah blah \\' blah blah'`;
      expect(validateCSSFont(cssFontInfo)).toEqual(true);

      cssFontInfo.fontFamily = `"blah blah `;
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = `blah blah"`;
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = `'blah blah `;
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = `blah blah'`;
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = "blah blah blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(true);

      cssFontInfo.fontFamily = "blah 0blah blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = "blah blah -0blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = "blah blah --blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(false);

      cssFontInfo.fontFamily = "blah blah -blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(true);

      cssFontInfo.fontFamily = "blah fdqAJqjHJK23kl23__--Kj blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(true);

      cssFontInfo.fontFamily = "blah fdqAJqjH$JK23kl23__--Kj blah";
      expect(validateCSSFont(cssFontInfo)).toEqual(false);
    });

    it("Check font weight", function () {
      const cssFontInfo = {
        fontFamily: "blah",
        fontWeight: 100,
        italicAngle: 0,
      };

      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.fontWeight).toEqual("100");

      cssFontInfo.fontWeight = "700";
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.fontWeight).toEqual("700");

      cssFontInfo.fontWeight = "normal";
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.fontWeight).toEqual("normal");

      cssFontInfo.fontWeight = 314;
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.fontWeight).toEqual("400");
    });

    it("Check italic angle", function () {
      const cssFontInfo = {
        fontFamily: "blah",
        fontWeight: 100,
        italicAngle: 10,
      };
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.italicAngle).toEqual("10");

      cssFontInfo.italicAngle = -123;
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.italicAngle).toEqual("14");

      cssFontInfo.italicAngle = "91";
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.italicAngle).toEqual("14");

      cssFontInfo.italicAngle = 2.718;
      validateCSSFont(cssFontInfo);
      expect(cssFontInfo.italicAngle).toEqual("2.718");
    });
  });

  describe("isAscii", function () {
    it("handles ascii/non-ascii strings", function () {
      expect(isAscii("hello world")).toEqual(true);
      expect(isAscii("こんにちは世界の")).toEqual(false);
      expect(isAscii("hello world in Japanese is こんにちは世界の")).toEqual(
        false
      );
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

  describe("getSizeInBytes", function () {
    it("should get the size in bytes to use to represent a positive integer", function () {
      expect(getSizeInBytes(0)).toEqual(0);
      for (let i = 1; i <= 0xff; i++) {
        expect(getSizeInBytes(i)).toEqual(1);
      }

      for (let i = 0x100; i <= 0xffff; i += 0x100) {
        expect(getSizeInBytes(i)).toEqual(2);
      }

      for (let i = 0x10000; i <= 0xffffff; i += 0x10000) {
        expect(getSizeInBytes(i)).toEqual(3);
      }
    });
  });
});
