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

import { isDestArraysEqual, isDestHashesEqual } from "../../web/pdf_history.js";

describe("pdf_history", function () {
  describe("isDestHashesEqual", function () {
    it("should reject non-equal destination hashes", function () {
      expect(isDestHashesEqual(null, "page.157")).toEqual(false);
      expect(isDestHashesEqual("title.0", "page.157")).toEqual(false);
      expect(isDestHashesEqual("page=1&zoom=auto", "page.157")).toEqual(false);

      expect(isDestHashesEqual("nameddest-page.157", "page.157")).toEqual(
        false
      );
      expect(isDestHashesEqual("page.157", "nameddest=page.157")).toEqual(
        false
      );

      const destArrayString = JSON.stringify([
        { num: 3757, gen: 0 },
        { name: "XYZ" },
        92.918,
        748.972,
        null,
      ]);
      expect(isDestHashesEqual(destArrayString, "page.157")).toEqual(false);
      expect(isDestHashesEqual("page.157", destArrayString)).toEqual(false);
    });

    it("should accept equal destination hashes", function () {
      expect(isDestHashesEqual("page.157", "page.157")).toEqual(true);
      expect(isDestHashesEqual("nameddest=page.157", "page.157")).toEqual(true);

      expect(
        isDestHashesEqual("nameddest=page.157&zoom=100", "page.157")
      ).toEqual(true);
    });
  });

  describe("isDestArraysEqual", function () {
    const firstDest = [{ num: 1, gen: 0 }, { name: "XYZ" }, 0, 375, null];
    const secondDest = [{ num: 5, gen: 0 }, { name: "XYZ" }, 0, 375, null];
    const thirdDest = [{ num: 1, gen: 0 }, { name: "XYZ" }, 750, 0, null];
    const fourthDest = [{ num: 1, gen: 0 }, { name: "XYZ" }, 0, 375, 1.0];
    const fifthDest = [{ gen: 0, num: 1 }, { name: "XYZ" }, 0, 375, null];

    it("should reject non-equal destination arrays", function () {
      expect(isDestArraysEqual(firstDest, undefined)).toEqual(false);
      expect(isDestArraysEqual(firstDest, [1, 2, 3, 4, 5])).toEqual(false);

      expect(isDestArraysEqual(firstDest, secondDest)).toEqual(false);
      expect(isDestArraysEqual(firstDest, thirdDest)).toEqual(false);
      expect(isDestArraysEqual(firstDest, fourthDest)).toEqual(false);
    });

    it("should accept equal destination arrays", function () {
      expect(isDestArraysEqual(firstDest, firstDest)).toEqual(true);
      expect(isDestArraysEqual(firstDest, fifthDest)).toEqual(true);

      const firstDestCopy = firstDest.slice();
      expect(firstDest).not.toBe(firstDestCopy);

      expect(isDestArraysEqual(firstDest, firstDestCopy)).toEqual(true);
    });
  });
});
