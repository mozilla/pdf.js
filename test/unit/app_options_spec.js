/* Copyright 2024 Mozilla Foundation
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

import { AppOptions, OptionKind } from "../../web/app_options.js";
import { objectSize } from "../../src/shared/util.js";

describe("AppOptions", function () {
  it("checks that getAll returns data, for every OptionKind", function () {
    const KIND_NAMES = ["BROWSER", "VIEWER", "API", "WORKER", "PREFERENCE"];

    for (const name of KIND_NAMES) {
      const kind = OptionKind[name];
      expect(typeof kind).toEqual("number");

      const options = AppOptions.getAll(kind);
      expect(objectSize(options)).toBeGreaterThan(0);
    }
  });

  it('checks that the number of "PREFERENCE" options does *not* exceed the maximum in mozilla-central', function () {
    // If the following constant is updated then you *MUST* make the same change
    // in mozilla-central as well to ensure that preference-fetching works; see
    // https://searchfox.org/mozilla-central/source/toolkit/components/pdfjs/content/PdfStreamConverter.sys.mjs
    const MAX_NUMBER_OF_PREFS = 50;

    const options = AppOptions.getAll(OptionKind.PREFERENCE);
    expect(objectSize(options)).toBeLessThanOrEqual(MAX_NUMBER_OF_PREFS);
  });
});
