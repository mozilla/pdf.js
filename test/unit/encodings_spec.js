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

import { getEncoding } from "../../src/core/encodings.js";

describe("encodings", function () {
  describe("getEncoding", function () {
    it("fetches a valid array for known encoding names", function () {
      const knownEncodingNames = [
        "ExpertEncoding",
        "MacExpertEncoding",
        "MacRomanEncoding",
        "StandardEncoding",
        "SymbolSetEncoding",
        "WinAnsiEncoding",
        "ZapfDingbatsEncoding",
      ];

      for (const knownEncodingName of knownEncodingNames) {
        const encoding = getEncoding(knownEncodingName);
        expect(Array.isArray(encoding)).toEqual(true);
        expect(encoding.length).toEqual(256);

        for (const item of encoding) {
          expect(typeof item).toEqual("string");
        }
      }
    });

    it("fetches `null` for unknown encoding names", function () {
      expect(getEncoding("FooBarEncoding")).toEqual(null);
    });
  });
});
