/* Copyright 2025 Mozilla Foundation
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
import path from "path";

const __dirname = import.meta.dirname;

describe("Push button icon picker", () => {
  describe("pushbutton-icon-example.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "pushbutton-icon-example.pdf",
        ".pushButtonIconInput"
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must let the user pick a replacement icon and embed it on save", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const paintImageXObject = await page.evaluate(
            () => window.pdfjsLib.OPS.paintImageXObject
          );

          // The appearance hasn't been replaced yet, so the button's only
          // drawing operation is for its placeholder text, not an image.
          const beforeFnArray = await page.evaluate(async () => {
            const pdfPage =
              await window.PDFViewerApplication.pdfDocument.getPage(1);
            const { fnArray } = await pdfPage.getOperatorList();
            return fnArray;
          });
          expect(beforeFnArray)
            .withContext(`In ${browserName}`)
            .not.toContain(paintImageXObject);

          const input = await page.$(".pushButtonIconInput");
          await input.uploadFile(
            path.join(__dirname, "../images/firefox_logo.png")
          );

          await page.waitForSelector(".pushButtonIconPreview:not([hidden])");
          const previewSrc = await page.$eval(
            ".pushButtonIconPreview",
            el => el.src
          );
          expect(previewSrc)
            .withContext(`In ${browserName}`)
            .toMatch(/^blob:/);

          // Saving must replace the appearance with one that paints the
          // picked image.
          const afterSaveFnArray = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { downloadManager } = app;
            const { download } = downloadManager;
            let savedData = null;
            downloadManager.download = data => {
              savedData = data;
            };
            try {
              await app.downloadOrSave();
            } finally {
              downloadManager.download = download;
            }

            const loadingTask = window.pdfjsLib.getDocument({
              data: savedData,
            });
            try {
              const pdf = await loadingTask.promise;
              const pdfPage = await pdf.getPage(1);
              const { fnArray } = await pdfPage.getOperatorList();
              return fnArray;
            } finally {
              await loadingTask.destroy();
            }
          });
          expect(afterSaveFnArray)
            .withContext(`In ${browserName}`)
            .toContain(paintImageXObject);
        })
      );
    });
  });
});
