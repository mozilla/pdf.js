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

import { closePages, getSelector, loadAndWait } from "./test_utils.mjs";

describe("Text field", () => {
  describe("Empty text field", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("file_pdfjs_form.pdf", getSelector("7R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the field is empty although its appearance contains a white space", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const text = await page.$eval(getSelector("7R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("");
        })
      );
    });
  });
});
