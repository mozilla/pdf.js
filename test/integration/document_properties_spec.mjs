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

async function openDocumentProperties(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  await page.click("#documentProperties");
  await page.waitForSelector("#documentPropertiesDialog", {
    hidden: false,
  });
}

async function closeDocumentProperties(page) {
  await page.click("#documentPropertiesClose");
  await page.waitForSelector("#documentPropertiesDialog", {
    hidden: true,
  });
}

async function checkFieldProperties(page, expectedProps) {
  await page.waitForFunction(
    `document.getElementById("fileSizeField").textContent !== "-"`
  );
  const promises = [];

  for (const name of FIELDS) {
    promises.push(
      page.evaluate(
        n => [n, document.getElementById(`${n}Field`).textContent],
        name
      )
    );
  }
  const props = Object.fromEntries(await Promise.all(promises));
  expect(props).toEqual(expectedProps);
}

function getFieldDataLastUpdated(page) {
  return page.evaluate(
    () =>
      document.getElementById("documentPropertiesDialog").dataset
        .fieldDataLastUpdated
  );
}

describe("PDFDocumentProperties", () => {
  describe("Document with both /Info and /Metadata", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("basicapi.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await openDocumentProperties(page);

          await checkFieldProperties(page, {
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

          await closeDocumentProperties(page);
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

    it("check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await openDocumentProperties(page);

          await checkFieldProperties(page, {
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

          await closeDocumentProperties(page);
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

    it("check that the document properties dialog has the correct information", async () => {
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

          await openDocumentProperties(page);

          await checkFieldProperties(page, {
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

          await closeDocumentProperties(page);
        })
      );
    });
  });

  describe("Document with multiple pages, and changed viewer page/rotation", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("basicapi.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await openDocumentProperties(page);

          await checkFieldProperties(page, {
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
          const fieldDataLastUpdated = await getFieldDataLastUpdated(page);

          await closeDocumentProperties(page);

          // Ensure that immediately re-opening the dialog doesn't cause
          // the field-data to be fetched and parsed again.
          await openDocumentProperties(page);

          expect(await getFieldDataLastUpdated(page)).toEqual(
            fieldDataLastUpdated
          );

          await closeDocumentProperties(page);

          // Goto the second page, and rotate the document.
          await page.click("#next");
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
          await page.keyboard.press("r");
          await page.waitForFunction(
            () => window.PDFViewerApplication.pdfViewer.pagesRotation === 90
          );

          await openDocumentProperties(page);

          await checkFieldProperties(page, {
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
            pageSize: `${FSI}11.69${PDI} × ${FSI}8.27${PDI} ${FSI}in${PDI} (${FSI}A4${PDI}, ${FSI}landscape${PDI})`,
            linearized: "No",
          });

          await closeDocumentProperties(page);
        })
      );
    });
  });

  describe("Document with different page sizes", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("sizes.pdf", ".textLayer .endOfContent");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await openDocumentProperties(page);

          await checkFieldProperties(page, {
            fileName: "sizes.pdf",
            fileSize: `${FSI}13.4${PDI} KB (${FSI}13,739${PDI} bytes)`,
            title: "-",
            author: "Yury ",
            subject: "-",
            keywords: "-",
            creationDate: "6/26/11, 1:26:03 PM",
            modificationDate: "-",
            creator: "Writer",
            producer: "OpenOffice.org 3.3",
            version: "1.4",
            pageCount: "3",
            pageSize: `${FSI}8.5${PDI} × ${FSI}11${PDI} ${FSI}in${PDI} (${FSI}Letter${PDI}, ${FSI}portrait${PDI})`,
            linearized: "No",
          });

          await closeDocumentProperties(page);

          // Goto the second page.
          await page.click("#next");
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );

          await openDocumentProperties(page);

          await checkFieldProperties(page, {
            fileName: "sizes.pdf",
            fileSize: `${FSI}13.4${PDI} KB (${FSI}13,739${PDI} bytes)`,
            title: "-",
            author: "Yury ",
            subject: "-",
            keywords: "-",
            creationDate: "6/26/11, 1:26:03 PM",
            modificationDate: "-",
            creator: "Writer",
            producer: "OpenOffice.org 3.3",
            version: "1.4",
            pageCount: "3",
            pageSize: `${FSI}9.01${PDI} × ${FSI}4.49${PDI} ${FSI}in${PDI} (${FSI}landscape${PDI})`,
            linearized: "No",
          });

          await closeDocumentProperties(page);
        })
      );
    });
  });

  describe("Document with corrupt page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "Pages-tree-refs.pdf",
        ".textLayer .endOfContent",
        null,
        null,
        { page: 2 }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that the document properties dialog has the correct information", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await openDocumentProperties(page);

          await checkFieldProperties(page, {
            fileName: "Pages-tree-refs.pdf",
            fileSize: `${FSI}1.07${PDI} KB (${FSI}1,098${PDI} bytes)`,
            title: "-",
            author: "-",
            subject: "-",
            keywords: "-",
            creationDate: "-",
            modificationDate: "-",
            creator: "-",
            producer: "-",
            version: "1.7",
            pageCount: "2",
            pageSize: "-",
            linearized: "No",
          });

          await closeDocumentProperties(page);

          // Goto the first page (which is *not* corrupt).
          await page.click("#previous");
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 1
          );

          await openDocumentProperties(page);

          await checkFieldProperties(page, {
            fileName: "Pages-tree-refs.pdf",
            fileSize: `${FSI}1.07${PDI} KB (${FSI}1,098${PDI} bytes)`,
            title: "-",
            author: "-",
            subject: "-",
            keywords: "-",
            creationDate: "-",
            modificationDate: "-",
            creator: "-",
            producer: "-",
            version: "1.7",
            pageCount: "2",
            pageSize: `${FSI}8.27${PDI} × ${FSI}11.69${PDI} ${FSI}in${PDI} (${FSI}A4${PDI}, ${FSI}portrait${PDI})`,
            linearized: "No",
          });

          await closeDocumentProperties(page);
        })
      );
    });
  });
});
