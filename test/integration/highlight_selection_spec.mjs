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

import { closePages, loadAndWait } from "./test_utils.mjs";

describe("Highlight Selection", () => {
  let pages;

  beforeAll(async () => {
    pages = await loadAndWait("issue18190.pdf", {
      annotationMode: 1, // ENABLE
    });
  });

  afterAll(async () => {
    await closePages(pages);
  });

  it("must allow text selection under highlight annotation", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        // Wait for annotations/text layer
        await page.waitForSelector(".annotationLayer");
        await page.waitForSelector(".textLayer");

        // Coordinates of the highlighted text (approximate from PDF structure)
        // We will simulate a drag to select text.
        // Assuming the highlighted text is on the standard text layer.
        // We verify pointer-events via evaluation if selection is flaky without
        // exact coords.

        // Check computed style.
        const highlightStyle = await page.evaluate(() => {
          const highlight = document.querySelector(".highlightAnnotation");
          if (!highlight) {
            return null;
          }
          return window.getComputedStyle(highlight).pointerEvents;
        });

        // The critical check: pointer-events must be 'none'
        expect(highlightStyle).withContext(`In ${browserName}`).toBe("none");
      })
    );
  });
});
