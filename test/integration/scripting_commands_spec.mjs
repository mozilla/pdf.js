/* Copyright 2026 Mozilla Foundation
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
  closePages,
  getSelector,
  loadAndWait,
  waitForSandboxTrip,
  waitForScripting,
} from "./test_utils.mjs";

async function clickAndWait(page, id, options) {
  await page.click(getSelector(id), options);
  await waitForSandboxTrip(page);
}

describe("Scripting commands", () => {
  describe("in doc_actions.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
      await Promise.all(pages.map(([, page]) => waitForScripting(page)));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("coalesces concurrent downloads and allows another after completion", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForSandboxTrip(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { promise, resolve } = Promise.withResolvers();
            let downloads = 0;
            app._downloadOrSave = () => {
              downloads++;
              return promise;
            };
            const first = app.downloadOrSave();
            const second = app.downloadOrSave();
            const concurrentDownloads = downloads;
            resolve();
            await Promise.all([first, second]);
            await app.downloadOrSave();
            return {
              concurrentDownloads,
              sharedPromise: first === second,
              downloads,
            };
          });

          expect(result).withContext(`In ${browserName}`).toEqual({
            concurrentDownloads: 1,
            sharedPromise: true,
            downloads: 2,
          });
        })
      );
    });
  });

  describe("in scripting_user_activation.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "scripting_user_activation.pdf",
        getSelector("7R")
      );
      await Promise.all(pages.map(([, page]) => waitForScripting(page)));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("only shows a dialog for events allowed by the viewer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(() => {
            window.alerts = [];
            window.alert = msg => window.alerts.push(msg);
          });

          // Mouse Enter.
          await page.hover(getSelector("21R"));
          await waitForSandboxTrip(page);
          // A timer.
          await clickAndWait(page, "22R");
          await waitForSandboxTrip(page);
          expect(await page.evaluate(() => window.alerts))
            .withContext(`In ${browserName}`)
            .toEqual([]);

          // Validate, when committing a value.
          await page.type(getSelector("20R"), "abc");
          await page.keyboard.press("Tab");
          await waitForSandboxTrip(page);
          expect(await page.evaluate(() => window.alerts))
            .withContext(`In ${browserName}`)
            .toEqual(["validate"]);
        })
      );
    });
  });
});
