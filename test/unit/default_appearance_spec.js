/* Copyright 2020 Mozilla Foundation
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
  createDefaultAppearance,
  parseDefaultAppearance,
} from "../../src/core/default_appearance.js";

describe("Default appearance", function () {
  describe("parseDefaultAppearance and createDefaultAppearance", function () {
    it("should parse and create default appearance", function () {
      const da = "/F1 12 Tf 0.10 0.20 0.30 rg";
      const result = {
        fontSize: 12,
        fontName: "F1",
        fontColor: new Uint8ClampedArray([26, 51, 76]),
      };
      expect(parseDefaultAppearance(da)).toEqual(result);
      expect(createDefaultAppearance(result)).toEqual(da);

      expect(
        parseDefaultAppearance(
          "0.1 0.2 0.3 rg /F1 12 Tf 0.3 0.2 0.1 rg /F2 13 Tf"
        )
      ).toEqual({
        fontSize: 13,
        fontName: "F2",
        fontColor: new Uint8ClampedArray([76, 51, 26]),
      });
    });

    it("should parse default appearance with save/restore", function () {
      const da =
        "q Q 0.10 0.20 0.30 rg /F1 12 Tf q 0.30 0.20 0.10 rg /F2 13 Tf Q";
      expect(parseDefaultAppearance(da)).toEqual({
        fontSize: 12,
        fontName: "F1",
        fontColor: new Uint8ClampedArray([26, 51, 76]),
      });
    });
  });
});
