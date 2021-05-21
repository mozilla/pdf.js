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
  CFFCharset,
  CFFCompiler,
  CFFFDSelect,
  CFFParser,
  CFFStrings,
} from "../../src/core/cff_parser.js";
import { SEAC_ANALYSIS_ENABLED } from "../../src/core/fonts_utils.js";
import { Stream } from "../../src/core/stream.js";

describe("CFFParser", function () {
  function createWithNullProto(obj) {
    const result = Object.create(null);
    for (const i in obj) {
      result[i] = obj[i];
    }
    return result;
  }

  // Stub that returns `0` for any privateDict key.
  const privateDictStub = {
    getByName(name) {
      return 0;
    },
  };

  let fontData, parser, cff;

  beforeAll(function () {
    // This example font comes from the CFF spec:
    // http://www.adobe.com/content/dam/Adobe/en/devnet/font/pdfs/5176.CFF.pdf
    const exampleFont =
      "0100040100010101134142434445462b" +
      "54696d65732d526f6d616e000101011f" +
      "f81b00f81c02f81d03f819041c6f000d" +
      "fb3cfb6efa7cfa1605e911b8f1120003" +
      "01010813183030312e30303754696d65" +
      "7320526f6d616e54696d657300000002" +
      "010102030e0e7d99f92a99fb7695f773" +
      "8b06f79a93fc7c8c077d99f85695f75e" +
      "9908fb6e8cf87393f7108b09a70adf0b" +
      "f78e14";
    const fontArr = [];
    for (let i = 0, ii = exampleFont.length; i < ii; i += 2) {
      const hex = exampleFont.substring(i, i + 2);
      fontArr.push(parseInt(hex, 16));
    }
    fontData = new Stream(fontArr);
  });

  afterAll(function () {
    fontData = null;
  });

  beforeEach(function () {
    parser = new CFFParser(fontData, {}, SEAC_ANALYSIS_ENABLED);
    cff = parser.parse();
  });

  afterEach(function () {
    parser = cff = null;
  });

  it("parses header", function () {
    const header = cff.header;
    expect(header.major).toEqual(1);
    expect(header.minor).toEqual(0);
    expect(header.hdrSize).toEqual(4);
    expect(header.offSize).toEqual(1);
  });

  it("parses name index", function () {
    const names = cff.names;
    expect(names.length).toEqual(1);
    expect(names[0]).toEqual("ABCDEF+Times-Roman");
  });

  it("parses string index", function () {
    const strings = cff.strings;
    expect(strings.count).toEqual(3);
    expect(strings.get(0)).toEqual(".notdef");
    expect(strings.get(391)).toEqual("001.007");
  });

  it("parses top dict", function () {
    const topDict = cff.topDict;
    // 391 version 392 FullName 393 FamilyName 389 Weight 28416 UniqueID
    // -168 -218 1000 898 FontBBox 94 CharStrings 45 102 Private
    expect(topDict.getByName("version")).toEqual(391);
    expect(topDict.getByName("FullName")).toEqual(392);
    expect(topDict.getByName("FamilyName")).toEqual(393);
    expect(topDict.getByName("Weight")).toEqual(389);
    expect(topDict.getByName("UniqueID")).toEqual(28416);
    expect(topDict.getByName("FontBBox")).toEqual([-168, -218, 1000, 898]);
    expect(topDict.getByName("CharStrings")).toEqual(94);
    expect(topDict.getByName("Private")).toEqual([45, 102]);
  });

  it("refuses to add topDict key with invalid value (bug 1068432)", function () {
    const topDict = cff.topDict;
    const defaultValue = topDict.getByName("UnderlinePosition");

    topDict.setByKey(/* [12, 3] = */ 3075, [NaN]);
    expect(topDict.getByName("UnderlinePosition")).toEqual(defaultValue);
  });

  it(
    "ignores reserved commands in parseDict, and refuses to add privateDict " +
      "keys with invalid values (bug 1308536)",
    function () {
      const bytes = new Uint8Array([
        64, 39, 31, 30, 252, 114, 137, 115, 79, 30, 197, 119, 2, 99, 127, 6,
      ]);
      parser.bytes = bytes;
      const topDict = cff.topDict;
      topDict.setByName("Private", [bytes.length, 0]);

      const parsePrivateDict = function () {
        parser.parsePrivateDict(topDict);
      };
      expect(parsePrivateDict).not.toThrow();

      const privateDict = topDict.privateDict;
      expect(privateDict.getByName("BlueValues")).toBeNull();
    }
  );

  it("parses a CharString having cntrmask", function () {
    // prettier-ignore
    const bytes = new Uint8Array([0, 1, // count
                                1,  // offsetSize
                                0,  // offset[0]
                                38, // end
                                149, 149, 149, 149, 149, 149, 149, 149,
                                149, 149, 149, 149, 149, 149, 149, 149,
                                1,  // hstem
                                149, 149, 149, 149, 149, 149, 149, 149,
                                149, 149, 149, 149, 149, 149, 149, 149,
                                3,  // vstem
                                20, // cntrmask
                                22, 22, // fail if misparsed as hmoveto
                                14  // endchar
                              ]);
    parser.bytes = bytes;
    const charStringsIndex = parser.parseIndex(0).obj;
    const charStrings = parser.parseCharStrings({
      charStrings: charStringsIndex,
      privateDict: privateDictStub,
    }).charStrings;
    expect(charStrings.count).toEqual(1);
    // shoudn't be sanitized
    expect(charStrings.get(0).length).toEqual(38);
  });

  it("parses a CharString endchar with 4 args w/seac enabled", function () {
    const cffParser = new CFFParser(
      fontData,
      {},
      /* seacAnalysisEnabled = */ true
    );
    cffParser.parse(); // cff

    // prettier-ignore
    const bytes = new Uint8Array([0, 1, // count
                                1,  // offsetSize
                                0,  // offset[0]
                                237, 247, 22, 247, 72, 204, 247, 86, 14]);
    cffParser.bytes = bytes;
    const charStringsIndex = cffParser.parseIndex(0).obj;
    const result = cffParser.parseCharStrings({
      charStrings: charStringsIndex,
      privateDict: privateDictStub,
    });
    expect(result.charStrings.count).toEqual(1);
    expect(result.charStrings.get(0).length).toEqual(1);
    expect(result.seacs.length).toEqual(1);
    expect(result.seacs[0].length).toEqual(4);
    expect(result.seacs[0][0]).toEqual(130);
    expect(result.seacs[0][1]).toEqual(180);
    expect(result.seacs[0][2]).toEqual(65);
    expect(result.seacs[0][3]).toEqual(194);
  });

  it("parses a CharString endchar with 4 args w/seac disabled", function () {
    const cffParser = new CFFParser(
      fontData,
      {},
      /* seacAnalysisEnabled = */ false
    );
    cffParser.parse(); // cff

    // prettier-ignore
    const bytes = new Uint8Array([0, 1, // count
                                1,  // offsetSize
                                0,  // offset[0]
                                237, 247, 22, 247, 72, 204, 247, 86, 14]);
    cffParser.bytes = bytes;
    const charStringsIndex = cffParser.parseIndex(0).obj;
    const result = cffParser.parseCharStrings({
      charStrings: charStringsIndex,
      privateDict: privateDictStub,
    });
    expect(result.charStrings.count).toEqual(1);
    expect(result.charStrings.get(0).length).toEqual(9);
    expect(result.seacs.length).toEqual(0);
  });

  it("parses a CharString endchar no args", function () {
    // prettier-ignore
    const bytes = new Uint8Array([0, 1, // count
                                1,  // offsetSize
                                0,  // offset[0]
                                14]);
    parser.bytes = bytes;
    const charStringsIndex = parser.parseIndex(0).obj;
    const result = parser.parseCharStrings({
      charStrings: charStringsIndex,
      privateDict: privateDictStub,
    });
    expect(result.charStrings.count).toEqual(1);
    expect(result.charStrings.get(0)[0]).toEqual(14);
    expect(result.seacs.length).toEqual(0);
  });

  it("parses predefined charsets", function () {
    const charset = parser.parseCharsets(0, 0, null, true);
    expect(charset.predefined).toEqual(true);
  });

  it("parses charset format 0", function () {
    // The first three bytes make the offset large enough to skip predefined.
    // prettier-ignore
    const bytes = new Uint8Array([0x00, 0x00, 0x00,
                                0x00, // format
                                0x00, 0x02 // sid/cid
                              ]);
    parser.bytes = bytes;
    let charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
    expect(charset.charset[1]).toEqual("exclam");

    // CID font
    charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
    expect(charset.charset[1]).toEqual(2);
  });

  it("parses charset format 1", function () {
    // The first three bytes make the offset large enough to skip predefined.
    // prettier-ignore
    const bytes = new Uint8Array([0x00, 0x00, 0x00,
                                0x01, // format
                                0x00, 0x08, // sid/cid start
                                0x01 // sid/cid left
                              ]);
    parser.bytes = bytes;
    let charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
    expect(charset.charset).toEqual([".notdef", "quoteright", "parenleft"]);

    // CID font
    charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
    expect(charset.charset).toEqual([0, 8, 9]);
  });

  it("parses charset format 2", function () {
    // format 2 is the same as format 1 but the left is card16
    // The first three bytes make the offset large enough to skip predefined.
    // prettier-ignore
    const bytes = new Uint8Array([0x00, 0x00, 0x00,
                                0x02, // format
                                0x00, 0x08, // sid/cid start
                                0x00, 0x01 // sid/cid left
                              ]);
    parser.bytes = bytes;
    let charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
    expect(charset.charset).toEqual([".notdef", "quoteright", "parenleft"]);

    // CID font
    charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
    expect(charset.charset).toEqual([0, 8, 9]);
  });

  it("parses encoding format 0", function () {
    // The first two bytes make the offset large enough to skip predefined.
    // prettier-ignore
    const bytes = new Uint8Array([0x00, 0x00,
                                0x00, // format
                                0x01, // count
                                0x08  // start
                              ]);
    parser.bytes = bytes;
    const encoding = parser.parseEncoding(2, {}, new CFFStrings(), null);
    expect(encoding.encoding).toEqual(createWithNullProto({ 0x8: 1 }));
  });

  it("parses encoding format 1", function () {
    // The first two bytes make the offset large enough to skip predefined.
    // prettier-ignore
    const bytes = new Uint8Array([0x00, 0x00,
                                0x01, // format
                                0x01, // num ranges
                                0x07, // range1 start
                                0x01 // range2 left
                              ]);
    parser.bytes = bytes;
    const encoding = parser.parseEncoding(2, {}, new CFFStrings(), null);
    expect(encoding.encoding).toEqual(
      createWithNullProto({ 0x7: 0x01, 0x08: 0x02 })
    );
  });

  it("parses fdselect format 0", function () {
    // prettier-ignore
    const bytes = new Uint8Array([0x00, // format
                                0x00, // gid: 0 fd: 0
                                0x01 // gid: 1 fd: 1
                               ]);
    parser.bytes = bytes.slice();
    const fdSelect = parser.parseFDSelect(0, 2);

    expect(fdSelect.fdSelect).toEqual([0, 1]);
    expect(fdSelect.format).toEqual(0);
  });

  it("parses fdselect format 3", function () {
    // prettier-ignore
    const bytes = new Uint8Array([0x03, // format
                                0x00, 0x02, // range count
                                0x00, 0x00, // first gid
                                0x09, // font dict 1 id
                                0x00, 0x02, // next gid
                                0x0a, // font dict 2 id
                                0x00, 0x04 // sentinel (last gid)
                               ]);
    parser.bytes = bytes.slice();
    const fdSelect = parser.parseFDSelect(0, 4);

    expect(fdSelect.fdSelect).toEqual([9, 9, 0xa, 0xa]);
    expect(fdSelect.format).toEqual(3);
  });

  it("parses invalid fdselect format 3 (bug 1146106)", function () {
    // prettier-ignore
    const bytes = new Uint8Array([0x03, // format
                                0x00, 0x02, // range count
                                0x00, 0x01, // first gid (invalid)
                                0x09, // font dict 1 id
                                0x00, 0x02, // next gid
                                0x0a, // font dict 2 id
                                0x00, 0x04 // sentinel (last gid)
                               ]);
    parser.bytes = bytes.slice();
    const fdSelect = parser.parseFDSelect(0, 4);

    expect(fdSelect.fdSelect).toEqual([9, 9, 0xa, 0xa]);
    expect(fdSelect.format).toEqual(3);
  });

  // TODO fdArray
});

describe("CFFCompiler", function () {
  function testParser(bytes) {
    bytes = new Uint8Array(bytes);
    return new CFFParser(
      {
        getBytes: () => {
          return bytes;
        },
      },
      {},
      SEAC_ANALYSIS_ENABLED
    );
  }

  it("encodes integers", function () {
    const c = new CFFCompiler();
    // all the examples from the spec
    expect(c.encodeInteger(0)).toEqual([0x8b]);
    expect(c.encodeInteger(100)).toEqual([0xef]);
    expect(c.encodeInteger(-100)).toEqual([0x27]);
    expect(c.encodeInteger(1000)).toEqual([0xfa, 0x7c]);
    expect(c.encodeInteger(-1000)).toEqual([0xfe, 0x7c]);
    expect(c.encodeInteger(10000)).toEqual([0x1c, 0x27, 0x10]);
    expect(c.encodeInteger(-10000)).toEqual([0x1c, 0xd8, 0xf0]);
    expect(c.encodeInteger(100000)).toEqual([0x1d, 0x00, 0x01, 0x86, 0xa0]);
    expect(c.encodeInteger(-100000)).toEqual([0x1d, 0xff, 0xfe, 0x79, 0x60]);
  });

  it("encodes floats", function () {
    const c = new CFFCompiler();
    expect(c.encodeFloat(-2.25)).toEqual([0x1e, 0xe2, 0xa2, 0x5f]);
    expect(c.encodeFloat(5e-11)).toEqual([0x1e, 0x5c, 0x11, 0xff]);
  });

  it("sanitizes name index", function () {
    const c = new CFFCompiler();
    let nameIndexCompiled = c.compileNameIndex(["[a"]);
    let parser = testParser(nameIndexCompiled);
    let nameIndex = parser.parseIndex(0);
    let names = parser.parseNameIndex(nameIndex.obj);
    expect(names).toEqual(["_a"]);

    let longName = "";
    for (let i = 0; i < 129; i++) {
      longName += "_";
    }
    nameIndexCompiled = c.compileNameIndex([longName]);
    parser = testParser(nameIndexCompiled);
    nameIndex = parser.parseIndex(0);
    names = parser.parseNameIndex(nameIndex.obj);
    expect(names[0].length).toEqual(127);
  });

  it("compiles fdselect format 0", function () {
    const fdSelect = new CFFFDSelect(0, [3, 2, 1]);
    const c = new CFFCompiler();
    const out = c.compileFDSelect(fdSelect);
    expect(out).toEqual([
      0, // format
      3, // gid: 0 fd 3
      2, // gid: 1 fd 3
      1, // gid: 2 fd 3
    ]);
  });

  it("compiles fdselect format 3", function () {
    const fdSelect = new CFFFDSelect(3, [0, 0, 1, 1]);
    const c = new CFFCompiler();
    const out = c.compileFDSelect(fdSelect);
    expect(out).toEqual([
      3, // format
      0, // nRanges (high)
      2, // nRanges (low)
      0, // range struct 0 - first (high)
      0, // range struct 0 - first (low)
      0, // range struct 0 - fd
      0, // range struct 0 - first (high)
      2, // range struct 0 - first (low)
      1, // range struct 0 - fd
      0, // sentinel (high)
      4, // sentinel (low)
    ]);
  });

  it("compiles fdselect format 3, single range", function () {
    const fdSelect = new CFFFDSelect(3, [0, 0]);
    const c = new CFFCompiler();
    const out = c.compileFDSelect(fdSelect);
    expect(out).toEqual([
      3, // format
      0, // nRanges (high)
      1, // nRanges (low)
      0, // range struct 0 - first (high)
      0, // range struct 0 - first (low)
      0, // range struct 0 - fd
      0, // sentinel (high)
      2, // sentinel (low)
    ]);
  });

  it("compiles charset of CID font", function () {
    const charset = new CFFCharset();
    const c = new CFFCompiler();
    const numGlyphs = 7;
    const out = c.compileCharset(charset, numGlyphs, new CFFStrings(), true);
    // All CID charsets get turned into a simple format 2.
    expect(out).toEqual([
      2, // format
      0, // cid (high)
      0, // cid (low)
      0, // nLeft (high)
      numGlyphs - 1, // nLeft (low)
    ]);
  });

  it("compiles charset of non CID font", function () {
    const charset = new CFFCharset(false, 0, ["space", "exclam"]);
    const c = new CFFCompiler();
    const numGlyphs = 3;
    const out = c.compileCharset(charset, numGlyphs, new CFFStrings(), false);
    // All non-CID fonts use a format 0 charset.
    expect(out).toEqual([
      0, // format
      0, // sid of 'space' (high)
      1, // sid of 'space' (low)
      0, // sid of 'exclam' (high)
      2, // sid of 'exclam' (low)
    ]);
  });

  // TODO a lot more compiler tests
});
