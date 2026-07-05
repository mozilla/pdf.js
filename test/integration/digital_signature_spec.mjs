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

import { closePages, FSI, loadAndWait, PDI } from "./test_utils.mjs";

describe("Digital signatures", () => {
  describe("Document without signatures", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the signatureProperties button is hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const buttonHidden = await page.$eval(
            "#signatureProperties",
            el => el.hidden
          );
          expect(buttonHidden).withContext(`In ${browserName}`).toBeTrue();

          const separatorHidden = await page.$eval(
            "#signaturePropertiesSeparator",
            el => el.hidden
          );
          expect(separatorHidden).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });
  });

  describe("Document with signatures", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue20433.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the signatureProperties button is visible", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const buttonHidden = await page.$eval(
            "#signatureProperties",
            el => el.hidden
          );
          expect(buttonHidden).withContext(`In ${browserName}`).toBeFalse();

          const separatorHidden = await page.$eval(
            "#signaturePropertiesSeparator",
            el => el.hidden
          );
          expect(separatorHidden).withContext(`In ${browserName}`).toBeFalse();
        })
      );
    });

    it("check that the signatureProperties panel contains two signatures", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#signatureProperties");
          await page.waitForSelector("#signaturePropertiesPanel", {
            hidden: false,
          });

          await page.waitForFunction(
            `document.getElementById("signaturePropertiesBanner").textContent !== ""`
          );
          const bannerMsg = await page.$eval(
            "#signaturePropertiesBanner",
            el => el.textContent
          );
          expect(bannerMsg)
            .withContext(`In ${browserName}`)
            .toEqual(
              `Document signed but ${FSI}2${PDI} digital signatures could not be verified`
            );

          await page.keyboard.press("Escape");
          await page.waitForSelector("#signaturePropertiesPanel", {
            hidden: true,
          });
        })
      );
    });
  });
});
