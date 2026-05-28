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

import { bytesToString } from "../../src/shared/util.js";
import { SEAC_ANALYSIS_ENABLED } from "../../src/core/fonts_utils.js";
import { StringStream } from "../../src/core/stream.js";
import { Type1Parser } from "../../src/core/type1_parser.js";

describe("Type1Parser", function () {
  function createCidKeyedFontStream({
    binary,
    cidCount = 3,
    fdBytes = 0,
    dataFormat = "Binary",
    declaredLength = binary.length,
    lenIV = -1,
    subrMapOffset = 0,
    subrCount = 0,
    sdBytes = 0,
    trailer = "",
  }) {
    const data = dataFormat === "Hex" ? binary.toHex() : bytesToString(binary);
    return new StringStream(
      "%!PS-Adobe-3.0 Resource-CIDFont\n" +
        "/CIDMapOffset 0 def\n" +
        `/FDBytes ${fdBytes} def\n` +
        "/GDBytes 1 def\n" +
        `/CIDCount ${cidCount} def\n` +
        `/SubrMapOffset ${subrMapOffset} def\n` +
        `/SDBytes ${sdBytes} def\n` +
        `/SubrCount ${subrCount} def\n` +
        "/Private 5 dict dup begin\n" +
        `/lenIV ${lenIV} def\n` +
        "end def\n" +
        `(${dataFormat}) ${declaredLength} StartData ${data}${trailer}`
    );
  }

  // Inverse of the Type 1 charstring cipher: produces ciphertext that
  // `Type1Parser.readCharStrings` (with matching lenIV) decodes back to
  // `plain`. The leading `lenIV` plaintext bytes are zero padding.
  function encryptCharString(plain, lenIV) {
    const c1 = 52845,
      c2 = 22719;
    let r = 4330;
    const out = new Uint8Array(plain.length + lenIV);
    for (let i = 0; i < out.length; i++) {
      const src = i < lenIV ? 0 : plain[i - lenIV];
      const cipher = (src ^ (r >> 8)) & 0xff;
      out[i] = cipher;
      r = ((cipher + r) * c1 + c2) & 0xffff;
    }
    return out;
  }

  it("splits tokens", function () {
    const stream = new StringStream("/BlueValues[-17 0]noaccess def");
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("/");
    expect(parser.getToken()).toEqual("BlueValues");
    expect(parser.getToken()).toEqual("[");
    expect(parser.getToken()).toEqual("-17");
    expect(parser.getToken()).toEqual("0");
    expect(parser.getToken()).toEqual("]");
    expect(parser.getToken()).toEqual("noaccess");
    expect(parser.getToken()).toEqual("def");
    expect(parser.getToken()).toEqual(null);
  });

  it("handles glued tokens", function () {
    const stream = new StringStream("dup/CharStrings");
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("dup");
    expect(parser.getToken()).toEqual("/");
    expect(parser.getToken()).toEqual("CharStrings");
  });

  it("ignores whitespace", function () {
    const stream = new StringStream("\nab   c\t");
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("ab");
    expect(parser.getToken()).toEqual("c");
  });

  it("parses numbers", function () {
    const stream = new StringStream("123");
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumber()).toEqual(123);
  });

  it("parses booleans", function () {
    const stream = new StringStream("true false");
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.readBoolean()).toEqual(1);
    expect(parser.readBoolean()).toEqual(0);
  });

  it("parses number arrays", function () {
    let stream = new StringStream("[1 2]");
    let parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumberArray()).toEqual([1, 2]);
    // Variation on spacing.
    stream = new StringStream("[ 1 2 ]");
    parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumberArray()).toEqual([1, 2]);
  });

  it("skips comments", function () {
    const stream = new StringStream(
      "%!PS-AdobeFont-1.0: CMSY10 003.002\n" +
        "%%Title: CMSY10\n" +
        "%Version: 003.002\n" +
        "FontDirectory"
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("FontDirectory");
  });

  it("parses font program", function () {
    const stream = new StringStream(
      "/ExpansionFactor  99\n" +
        "/Subrs 1 array\n" +
        "dup 0 1 RD x noaccess put\n" +
        "end\n" +
        "/CharStrings 46 dict dup begin\n" +
        "/.notdef 1 RD x ND\n" +
        "end"
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractFontProgram({});
    expect(program.charstrings.length).toEqual(1);
    expect(program.properties.privateData.get("ExpansionFactor")).toEqual(99);
  });

  it("parses a CID-keyed Type 1 font program", function () {
    // 0 500 hsbw endchar
    const notdefCharString = [0x8b, 0xf8, 0x88, 0x0d, 0x0e];
    // 0 250 hsbw endchar
    const cid2CharString = [0x8b, 0xf7, 0x8e, 0x0d, 0x0e];
    const binary = Uint8Array.of(
      // CIDMap: CID 0 has data, CID 1 is empty, CID 2 has data.
      4,
      9,
      9,
      14,
      ...notdefCharString,
      ...cid2CharString
    );
    const stream = createCidKeyedFontStream({ binary });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractCidKeyedFontProgram({});

    expect(program.subrs.length).toEqual(0);
    expect(program.charstrings.map(({ glyphName }) => glyphName)).toEqual([
      ".notdef",
      "cid1",
      "cid2",
    ]);
    expect(program.charstrings[0].width).toEqual(500);
    expect(program.charstrings[1].width).toEqual(500);
    expect(program.charstrings[1].charstring).toEqual(
      program.charstrings[0].charstring
    );
    expect(program.charstrings[2].width).toEqual(250);
  });

  it("parses a hex-encoded CID-keyed Type 1 data section", function () {
    const binary = Uint8Array.of(
      4,
      9,
      9,
      14,
      0x8b,
      0xf8,
      0x88,
      0x0d,
      0x0e,
      0x8b,
      0xf7,
      0x8e,
      0x0d,
      0x0e
    );
    const stream = createCidKeyedFontStream({ binary, dataFormat: "Hex" });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractCidKeyedFontProgram({});

    expect(program.charstrings[2].width).toEqual(250);
  });

  it("rejects CID-keyed Type 1 fonts with multiple FD indices", function () {
    const binary = Uint8Array.of(
      // CIDMap: CID 0 selects FD index 1, which is unsupported.
      1,
      4,
      0,
      9,
      0x8b,
      0xf8,
      0x88,
      0x0d,
      0x0e
    );
    const stream = createCidKeyedFontStream({
      binary,
      cidCount: 1,
      fdBytes: 1,
    });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);

    expect(parser.extractCidKeyedFontProgram({})).toEqual(null);
  });

  it("uses subrs when parsing a CID-keyed Type 1 font", function () {
    // 0 333 hsbw return -- callable subroutine.
    const subr0 = [0x8b, 0xf7, 0xe1, 0x0d, 0x0b];
    // 0 500 hsbw endchar.
    const cid0 = [0x8b, 0xf8, 0x88, 0x0d, 0x0e];
    // 0 callsubr endchar -- delegates the width to subr 0.
    const cid1 = [0x8b, 0x0a, 0x0e];
    // Layout: CIDMap(3) || SubrMap(2) || subr0 || cid0 || cid1.
    const subrStart = 5;
    const cid0Start = subrStart + subr0.length;
    const cid1Start = cid0Start + cid0.length;
    const binary = Uint8Array.of(
      cid0Start, // CID 0
      cid1Start, // CID 1
      cid1Start + cid1.length, // CIDMap sentinel
      subrStart, // subr 0
      cid0Start, // SubrMap sentinel
      ...subr0,
      ...cid0,
      ...cid1
    );
    const stream = createCidKeyedFontStream({
      binary,
      cidCount: 2,
      subrMapOffset: 3,
      subrCount: 1,
      sdBytes: 1,
    });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractCidKeyedFontProgram({});

    expect(program.subrs.length).toEqual(1);
    expect(program.charstrings[0].width).toEqual(500);
    expect(program.charstrings[1].width).toEqual(333);
  });

  it("decrypts charstrings when lenIV > 0", function () {
    const cid0Plain = [0x8b, 0xf8, 0x88, 0x0d, 0x0e]; // 0 500 hsbw endchar
    const cid0Cipher = encryptCharString(cid0Plain, 4);
    const binary = Uint8Array.of(
      // CIDMap: 2 entries (CIDCount + 1).
      2,
      2 + cid0Cipher.length,
      ...cid0Cipher
    );
    const stream = createCidKeyedFontStream({
      binary,
      cidCount: 1,
      lenIV: 4,
    });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractCidKeyedFontProgram({});

    expect(program.charstrings[0].width).toEqual(500);
  });

  it("decodes hex CID-keyed data with whitespace between digits", function () {
    const binary = Uint8Array.of(4, 9, 9, 14, 0x8b, 0xf8, 0x88, 0x0d, 0x0e);
    const hexWithSpaces = binary
      .toHex()
      .match(/.{1,2}/g)
      .join(" ");
    const stream = new StringStream(
      "%!PS-Adobe-3.0 Resource-CIDFont\n" +
        "/CIDMapOffset 0 def\n" +
        "/FDBytes 0 def\n" +
        "/GDBytes 1 def\n" +
        "/CIDCount 1 def\n" +
        "/Private 5 dict dup begin /lenIV -1 def end def\n" +
        `(Hex) ${binary.length} StartData ${hexWithSpaces}`
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const program = parser.extractCidKeyedFontProgram({});

    expect(program.charstrings[0].width).toEqual(500);
  });

  it("rejects truncated CID-keyed binary data", function () {
    // CIDMap declares 3 CIDs (4 entries x 1 byte = 4 bytes) but only 2 bytes
    // of binary follow, so the CIDMap read goes past the end.
    const binary = Uint8Array.of(0, 0);
    const stream = createCidKeyedFontStream({ binary, cidCount: 3 });
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);

    expect(parser.extractCidKeyedFontProgram({})).toEqual(null);
  });

  it("rejects malformed StartData token sequences", function () {
    const cases = [
      // Missing the "(Binary)" / "(Hex)" parenthesised tag.
      "Binary 4 StartData \x00\x00\x00\x00",
      // Non-numeric length.
      "(Binary) abc StartData \x00\x00\x00\x00",
      // Unsupported data type.
      "(Ascii) 4 StartData \x00\x00\x00\x00",
      // Zero length.
      "(Binary) 0 StartData",
    ];
    for (const tail of cases) {
      const stream = new StringStream(
        "%!PS-Adobe-3.0 Resource-CIDFont\n" +
          "/CIDMapOffset 0 def /FDBytes 0 def /GDBytes 1 def\n" +
          "/CIDCount 1 def\n" +
          "/Private 5 dict dup begin /lenIV -1 def end def\n" +
          tail
      );
      const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
      expect(parser.extractCidKeyedFontProgram({})).toEqual(null);
    }
  });

  it("rejects oversized hex StartData lengths", function () {
    // Declares 1 GiB of hex data; must be rejected before any allocation.
    const stream = new StringStream(
      "%!PS-Adobe-3.0 Resource-CIDFont\n" +
        "/CIDMapOffset 0 def /FDBytes 0 def /GDBytes 1 def\n" +
        "/CIDCount 1 def\n" +
        "/Private 5 dict dup begin /lenIV -1 def end def\n" +
        "(Hex) 1073741824 StartData 00"
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);

    expect(parser.extractCidKeyedFontProgram({})).toEqual(null);
  });

  it("parses font header font matrix", function () {
    const stream = new StringStream(
      "/FontMatrix [0.001 0 0 0.001 0 0 ]readonly def\n"
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const props = {};
    parser.extractFontHeader(props);
    expect(props.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
  });

  it("parses font header encoding", function () {
    const stream = new StringStream(
      "/Encoding 256 array\n" +
        "0 1 255 {1 index exch /.notdef put} for\n" +
        "dup 33 /arrowright put\n" +
        "readonly def\n"
    );
    const parser = new Type1Parser(stream, false, SEAC_ANALYSIS_ENABLED);
    const props = { overridableEncoding: true };
    parser.extractFontHeader(props);
    expect(props.builtInEncoding[33]).toEqual("arrowright");
  });
});
