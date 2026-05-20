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

import { closePages, loadAndWait } from "./test_utils.mjs";

async function dispatchRequestTextContent(page, id) {
  return page.evaluate(requestId => {
    const event = new CustomEvent("requestTextContent", {
      bubbles: true,
      cancelable: true,
      detail: { requestId },
    });
    window.dispatchEvent(event);
  }, id);
}

async function getReportTextData(page) {
  await page.waitForFunction(() => window._reportTextData !== undefined);
  return page.evaluate(() => {
    const data = window._reportTextData;
    delete window._reportTextData;
    return data;
  });
}

describe("PdfTextExtractor", () => {
  describe("Simple multi-page document", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("basicapi.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that all text is extracted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await dispatchRequestTextContent(page, 1);

          const { text, requestId } = await getReportTextData(page);

          expect(text).toEqual(
            [
              "Table Of Content",
              "Chapter 1 .......................................................... 2",
              "Paragraph 1.1 ...................................................... 3",
              "page 1 / 3",
              "Chapter 1",
              "page 2 / 3",
              "Paragraph 1.1",
              "Powered by TCPDF (www.tcpdf.org)",
              "page 3 / 3",
            ].join("\n")
          );
          expect(requestId).toEqual(1);
        })
      );
    });
  });

  describe("Multi-page document, with disableAutoFetch=true set", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        null,
        null,
        {
          disableAutoFetch: true,
          disableStream: true,
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that all text is extracted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await dispatchRequestTextContent(page, 2);

          const { text, requestId } = await getReportTextData(page);

          expect(
            text.startsWith(
              "Trace-based Just-in-Time Type Specialization for Dynamic\nLanguages"
            )
          ).toBeTrue();
          expect(
            text.endsWith(
              "Conference on Virtual Execution Environments, pages 83–93. ACM\nPress, 2007."
            )
          ).toBeTrue();
          expect(text.length).toEqual(82804);
          expect(requestId).toEqual(2);
        })
      );
    });
  });
});
