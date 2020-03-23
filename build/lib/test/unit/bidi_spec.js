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

var _bidi = require("../../core/bidi.js");

describe("bidi", function () {
  it("should mark text as RTL if more than 30% of text is RTL", function () {
    var test = "\u0645\u0635\u0631 Egypt";
    var result = "Egypt \u0631\u0635\u0645";
    var bidiText = (0, _bidi.bidi)(test, -1, false);
    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("rtl");
  });
  it("should mark text as LTR if less than 30% of text is RTL", function () {
    var test = "Egypt is known as \u0645\u0635\u0631 in Arabic.";
    var result = "Egypt is known as \u0631\u0635\u0645 in Arabic.";
    var bidiText = (0, _bidi.bidi)(test, -1, false);
    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("ltr");
  });
});