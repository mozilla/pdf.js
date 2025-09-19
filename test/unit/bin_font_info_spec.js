/* Copyright 2025 Mozilla Foundation
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
  CssFontInfo,
  FontInfo,
  SystemFontInfo,
} from "../../src/shared/obj-bin-transform.js";

const cssFontInfo = {
  fontFamily: "Sample Family",
  fontWeight: "not a number",
  italicAngle: "angle",
  uselessProp: "doesn't matter",
};

const systemFontInfo = {
  guessFallback: false,
  css: "some string",
  loadedName: "another string",
  baseFontName: "base name",
  src: "source",
  style: {
    style: "normal",
    weight: "400",
    uselessProp: "doesn't matter",
  },
  uselessProp: "doesn't matter",
};

const fontInfo = {
  black: true,
  bold: true,
  disableFontFace: true,
  fontExtraProperties: true,
  isInvalidPDFjsFont: true,
  isType3Font: true,
  italic: true,
  missingFile: true,
  remeasure: true,
  vertical: true,
  ascent: 1,
  defaultWidth: 1,
  descent: 1,
  bbox: [1, 1, 1, 1],
  fontMatrix: [1, 1, 1, 1, 1, 1],
  defaultVMetrics: [1, 1, 1],
  fallbackName: "string",
  loadedName: "string",
  mimetype: "string",
  name: "string",
  data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  uselessProp: "something",
};

describe("font data serialization and deserialization", function () {
  describe("CssFontInfo", function () {
    it("must roundtrip correctly for CssFontInfo", function () {
      const encoder = new TextEncoder();
      let sizeEstimate = 0;
      for (const string of ["Sample Family", "not a number", "angle"]) {
        sizeEstimate += 4 + encoder.encode(string).length;
      }
      const buffer = CssFontInfo.write(cssFontInfo);
      expect(buffer.byteLength).toEqual(sizeEstimate);
      const deserialized = new CssFontInfo(buffer);
      expect(deserialized.fontFamily).toEqual("Sample Family");
      expect(deserialized.fontWeight).toEqual("not a number");
      expect(deserialized.italicAngle).toEqual("angle");
      expect(deserialized.uselessProp).toBeUndefined();
    });
  });

  describe("SystemFontInfo", function () {
    it("must roundtrip correctly for SystemFontInfo", function () {
      const encoder = new TextEncoder();
      let sizeEstimate = 1 + 4;
      for (const string of [
        "some string",
        "another string",
        "base name",
        "source",
        "normal",
        "400",
      ]) {
        sizeEstimate += 4 + encoder.encode(string).length;
      }
      const buffer = SystemFontInfo.write(systemFontInfo);
      expect(buffer.byteLength).toEqual(sizeEstimate);
      const deserialized = new SystemFontInfo(buffer);
      expect(deserialized.guessFallback).toEqual(false);
      expect(deserialized.css).toEqual("some string");
      expect(deserialized.loadedName).toEqual("another string");
      expect(deserialized.baseFontName).toEqual("base name");
      expect(deserialized.src).toEqual("source");
      expect(deserialized.style.style).toEqual("normal");
      expect(deserialized.style.weight).toEqual("400");
      expect(deserialized.style.uselessProp).toBeUndefined();
      expect(deserialized.uselessProp).toBeUndefined();
    });
  });

  describe("FontInfo", function () {
    it("must roundtrip correctly for FontInfo", function () {
      let sizeEstimate = 92; // fixed offset until the strings
      const encoder = new TextEncoder();
      sizeEstimate += 4 + 4 * (4 + encoder.encode("string").length);
      sizeEstimate += 4 + 4; // cssFontInfo and systemFontInfo
      sizeEstimate += 4 + fontInfo.data.length;
      const buffer = FontInfo.write(fontInfo);
      expect(buffer.byteLength).toEqual(sizeEstimate);
      const deserialized = new FontInfo({ data: buffer });
      expect(deserialized.black).toEqual(true);
      expect(deserialized.bold).toEqual(true);
      expect(deserialized.disableFontFace).toEqual(true);
      expect(deserialized.fontExtraProperties).toEqual(true);
      expect(deserialized.isInvalidPDFjsFont).toEqual(true);
      expect(deserialized.isType3Font).toEqual(true);
      expect(deserialized.italic).toEqual(true);
      expect(deserialized.missingFile).toEqual(true);
      expect(deserialized.remeasure).toEqual(true);
      expect(deserialized.vertical).toEqual(true);
      expect(deserialized.ascent).toEqual(1);
      expect(deserialized.defaultWidth).toEqual(1);
      expect(deserialized.descent).toEqual(1);
      expect(deserialized.bbox).toEqual([1, 1, 1, 1]);
      expect(deserialized.fontMatrix).toEqual([1, 1, 1, 1, 1, 1]);
      expect(deserialized.defaultVMetrics).toEqual([1, 1, 1]);
      expect(deserialized.fallbackName).toEqual("string");
      expect(deserialized.loadedName).toEqual("string");
      expect(deserialized.mimetype).toEqual("string");
      expect(deserialized.name).toEqual("string");
      expect(Array.from(deserialized.data)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(deserialized.uselessProp).toBeUndefined();
      expect(deserialized.cssFontInfo).toBeNull();
      expect(deserialized.systemFontInfo).toBeNull();
    });

    it("nesting should work as expected", function () {
      const buffer = FontInfo.write({
        ...fontInfo,
        cssFontInfo,
        systemFontInfo,
      });
      const deserialized = new FontInfo({ data: buffer });
      expect(deserialized.cssFontInfo.fontWeight).toEqual("not a number");
      expect(deserialized.systemFontInfo.src).toEqual("source");
    });
  });
});
