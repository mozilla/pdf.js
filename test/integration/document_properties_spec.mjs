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

import { closePages, FSI, loadAndWait, PDI } from "./test_utils.mjs";
import fs from "fs/promises";

const FIELDS = [
  "fileName",
  "fileSize",
  "title",
  "author",
  "subject",
  "keywords",
  "creationDate",
  "modificationDate",
  "creator",
  "producer",
  "version",
  "pageCount",
  "pageSize",
  "linearized",
];

describe("PDFDocumentProperties", () => {
  async function getFieldProperties(page) {
    const promises = [];

    for (const name of FIELDS) {
      promises.push(
        page.evaluate(
          n => [n, document.getElementById(`${n}Field`).textContent],
          name
        )
      );
    }
    return Object.fromEntries(await Promise.all(promises));
  }

  describe("Document with both /Info and /Metadata", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("basicapi.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar", { hidden: false });

          await page.click("#documentProperties");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: false,
          });

          await page.waitForFunction(
            `document.getElementById("fileSizeField").textContent !== "-"`
          );
          const props = await getFieldProperties(page);

          expect(props).toEqual({
            fileName: "basicapi.pdf",
            fileSize: `${FSI}103${PDI} KB (${FSI}105,779${PDI} bytes)`,
            title: "Basic API Test",
            author: "Brendan Dahl",
            subject: "-",
            keywords: "TCPDF",
            creationDate: "4/10/12, 7:30:26 AM",
            modificationDate: "4/10/12, 7:30:26 AM",
            creator: "TCPDF",
            producer: "TCPDF 5.9.133 (http://www.tcpdf.org)",
            version: "1.7",
            pageCount: "3",
            pageSize: `${FSI}8.27${PDI} × ${FSI}11.69${PDI} ${FSI}in${PDI} (${FSI}A4${PDI}, ${FSI}portrait${PDI})`,
            linearized: "No",
          });

          await page.click("#documentPropertiesClose");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: true,
          });
        })
      );
    });
  });

  describe("Document with approximately A4-sized page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "arial_unicode_en_cidfont.pdf",
        ".textLayer .endOfContent"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar", { hidden: false });

          await page.click("#documentProperties");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: false,
          });

          await page.waitForFunction(
            `document.getElementById("fileSizeField").textContent !== "-"`
          );
          const props = await getFieldProperties(page);

          expect(props).toEqual({
            fileName: "arial_unicode_en_cidfont.pdf",
            fileSize: `${FSI}15.4${PDI} KB (${FSI}15,779${PDI} bytes)`,
            title: "-",
            author: "Adil Allawi",
            subject: "-",
            keywords: "-",
            creationDate: "7/10/11, 7:17:28 PM",
            modificationDate: "-",
            creator: "Writer",
            producer: "NeoOffice 3.2 Beta",
            version: "1.4",
            pageCount: "1",
            pageSize: `${FSI}8.27${PDI} × ${FSI}11.69${PDI} ${FSI}in${PDI} (${FSI}A4${PDI}, ${FSI}portrait${PDI})`,
            linearized: "No",
          });

          await page.click("#documentPropertiesClose");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: true,
          });
        })
      );
    });
  });

  describe("Document without contentLength", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Open a binary PDF document, such that `contentLength` is undefined.
          const base64 = await fs.readFile("./pdfs/clippath.pdf", {
            encoding: "base64",
          });

          await page.evaluate(async b64 => {
            await window.PDFViewerApplication.open({
              data: Uint8Array.fromBase64(b64),
            });
          }, base64);

          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar", { hidden: false });

          await page.click("#documentProperties");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: false,
          });

          await page.waitForFunction(
            `document.getElementById("fileSizeField").textContent !== "-"`
          );
          const props = await getFieldProperties(page);

          expect(props).toEqual({
            fileName: "document.pdf",
            fileSize: `${FSI}0.448${PDI} KB (${FSI}459${PDI} bytes)`,
            title: "-",
            author: "-",
            subject: "-",
            keywords: "-",
            creationDate: "-",
            modificationDate: "-",
            creator: "-",
            producer: "-",
            version: "1.1",
            pageCount: "1",
            pageSize: `${FSI}2.78${PDI} × ${FSI}1.39${PDI} ${FSI}in${PDI} (${FSI}landscape${PDI})`,
            linearized: "No",
          });

          await page.click("#documentPropertiesClose");
          await page.waitForSelector("#documentPropertiesDialog", {
            hidden: true,
          });
        })
      );
    });
  });
});
