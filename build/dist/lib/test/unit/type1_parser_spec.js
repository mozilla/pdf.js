/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _fonts = require("../../core/fonts.js");

var _stream = require("../../core/stream.js");

var _type1_parser = require("../../core/type1_parser.js");

describe("Type1Parser", function () {
  it("splits tokens", function () {
    var stream = new _stream.StringStream("/BlueValues[-17 0]noaccess def");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
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
    var stream = new _stream.StringStream("dup/CharStrings");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("dup");
    expect(parser.getToken()).toEqual("/");
    expect(parser.getToken()).toEqual("CharStrings");
  });
  it("ignores whitespace", function () {
    var stream = new _stream.StringStream("\nab   c\t");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("ab");
    expect(parser.getToken()).toEqual("c");
  });
  it("parses numbers", function () {
    var stream = new _stream.StringStream("123");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumber()).toEqual(123);
  });
  it("parses booleans", function () {
    var stream = new _stream.StringStream("true false");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.readBoolean()).toEqual(1);
    expect(parser.readBoolean()).toEqual(0);
  });
  it("parses number arrays", function () {
    var stream = new _stream.StringStream("[1 2]");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumberArray()).toEqual([1, 2]);
    stream = new _stream.StringStream("[ 1 2 ]");
    parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.readNumberArray()).toEqual([1, 2]);
  });
  it("skips comments", function () {
    var stream = new _stream.StringStream("%!PS-AdobeFont-1.0: CMSY10 003.002\n" + "%%Title: CMSY10\n" + "%Version: 003.002\n" + "FontDirectory");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    expect(parser.getToken()).toEqual("FontDirectory");
  });
  it("parses font program", function () {
    var stream = new _stream.StringStream("/ExpansionFactor  99\n" + "/Subrs 1 array\n" + "dup 0 1 RD x noaccess put\n" + "end\n" + "/CharStrings 46 dict dup begin\n" + "/.notdef 1 RD x ND\n" + "end");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    var program = parser.extractFontProgram({});
    expect(program.charstrings.length).toEqual(1);
    expect(program.properties.privateData.ExpansionFactor).toEqual(99);
  });
  it("parses font header font matrix", function () {
    var stream = new _stream.StringStream("/FontMatrix [0.001 0 0 0.001 0 0 ]readonly def\n");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    var props = {};
    parser.extractFontHeader(props);
    expect(props.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);
  });
  it("parses font header encoding", function () {
    var stream = new _stream.StringStream("/Encoding 256 array\n" + "0 1 255 {1 index exch /.notdef put} for\n" + "dup 33 /arrowright put\n" + "readonly def\n");
    var parser = new _type1_parser.Type1Parser(stream, false, _fonts.SEAC_ANALYSIS_ENABLED);
    var props = {
      overridableEncoding: true
    };
    parser.extractFontHeader(props);
    expect(props.builtInEncoding[33]).toEqual("arrowright");
  });
});