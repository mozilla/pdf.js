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

import { SEAC_ANALYSIS_ENABLED } from "../../src/core/fonts_utils.js";
import { StringStream } from "../../src/core/stream.js";
import { Type1Parser } from "../../src/core/type1_parser.js";

describe("Type1Parser", function () {
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
    expect(program.properties.privateData.ExpansionFactor).toEqual(99);
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
