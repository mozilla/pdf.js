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

import {
  awaitPromise,
  closePages,
  copy,
  getEditorSelector,
  getRect,
  loadAndWait,
  paste,
  switchToEditor,
  waitForPointerUp,
  waitForTimeout,
} from "./test_utils.mjs";

import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const switchToSignature = switchToEditor.bind(null, "Signature");

describe("Signature Editor", () => {
  const descriptionInputSelector = "#addSignatureDescription > input";
  const addButtonSelector = "#addSignatureAddButton";

  describe("Basic operations", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the editor has been removed when the dialog is cancelled", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });

          // An invisible editor is created but invisible.
          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: false });

          await page.click("#addSignatureCancelButton");

          // The editor should have been removed.
          await page.waitForSelector(`:not(${editorSelector})`);
        })
      );
    });

    it("must check that the basic and common elements are working as expected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });

          await page.waitForSelector(
            "#addSignatureTypeButton[aria-selected=true]"
          );
          await page.click("#addSignatureTypeInput");
          await page.waitForSelector(
            "#addSignatureSaveContainer[disabled=true]"
          );
          let description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("");
          await page.waitForSelector(`${addButtonSelector}:disabled`);

          await page.type("#addSignatureTypeInput", "PDF.js");
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);

          // The save button should be enabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer:not([disabled])"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox[checked=true]");

          // The description has been filled in automatically.
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value !== ""`
          );
          description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("PDF.js");

          // Clear the description.
          await page.click("#addSignatureDescription > button");
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value === ""`
          );

          // Clear the text for the signature.
          await page.click("#clearSignatureButton");
          await page.waitForFunction(
            `document.querySelector("#addSignatureTypeInput").value === ""`
          );
          // The save button should be disabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer[disabled=true]"
          );
          await page.waitForSelector(`${addButtonSelector}:disabled`);

          await page.type("#addSignatureTypeInput", "PDF.js");
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value !== ""`
          );

          // Clearing the signature type should clear the description.
          await page.click("#clearSignatureButton");
          await page.waitForFunction(
            `document.querySelector("#addSignatureTypeInput").value === ""`
          );
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value === ""`
          );

          // Add a signature and change the description.
          await page.type("#addSignatureTypeInput", "PDF.js");
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value !== ""`
          );
          await page.click("#addSignatureDescription > button");
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value === ""`
          );
          await page.type(descriptionInputSelector, "Hello World");
          await page.type("#addSignatureTypeInput", "Hello");

          // The description mustn't be changed.
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);
          description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("Hello World");

          await page.click("#addSignatureAddButton");
          await page.waitForSelector("#addSignatureDialog", {
            visible: false,
          });

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(
            `.canvasWrapper > svg use[href="#path_p1_0"]`,
            { visible: true }
          );

          // Check the tooltip.
          await page.waitForSelector(
            `.altText.editDescription[title="Hello World"]`
          );

          // Edit the description.
          await page.click(`.altText.editDescription`);

          await page.waitForSelector("#editSignatureDescriptionDialog", {
            visible: true,
          });
          await page.waitForSelector("#editSignatureUpdateButton:disabled");
          await page.waitForSelector(
            `#editSignatureDescriptionDialog svg[aria-label="Hello World"]`
          );
          const editDescriptionInput = "#editSignatureDescription > input";
          description = await page.$eval(editDescriptionInput, el => el.value);
          expect(description).withContext(browserName).toEqual("Hello World");
          await page.click("#editSignatureDescription > button");
          await page.waitForFunction(
            `document.querySelector("${editDescriptionInput}").value === ""`
          );
          await page.waitForSelector(
            "#editSignatureUpdateButton:not(:disabled)"
          );
          await page.type(editDescriptionInput, "Hello PDF.js World");
          await page.waitForSelector(
            "#editSignatureUpdateButton:not(:disabled)"
          );

          await page.click("#editSignatureUpdateButton");

          // Check the tooltip.
          await page.waitForSelector(
            `.altText.editDescription[title="Hello PDF.js World"]`
          );
        })
      );
    });

    it("must check drawing with the mouse", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });

          await page.click("#addSignatureDrawButton");
          const drawSelector = "#addSignatureDraw";
          await page.waitForSelector(drawSelector, { visible: true });

          let description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("");
          await page.waitForSelector(`${addButtonSelector}:disabled`);

          const { x, y, width, height } = await getRect(page, drawSelector);
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x + 0.1 * width, y + 0.1 * height);
          await page.mouse.down();
          await page.mouse.move(x + 0.3 * width, y + 0.3 * height);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);

          // The save button should be enabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer:not([disabled])"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox[checked=true]");

          // The description has been filled in automatically.
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value !== ""`
          );
          description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("Signature");

          await page.click("#addSignatureAddButton");
          await page.waitForSelector("#addSignatureDialog", {
            visible: false,
          });

          await page.waitForSelector(
            ".canvasWrapper > svg use[href='#path_p1_0']"
          );
        })
      );
    });

    it("must check adding an image", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });

          await page.click("#addSignatureImageButton");
          await page.waitForSelector("#addSignatureImagePlaceholder", {
            visible: true,
          });

          let description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("");
          await page.waitForSelector(`${addButtonSelector}:disabled`);

          const input = await page.$("#addSignatureFilePicker");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );
          await page.waitForSelector(`#addSignatureImage > path:not([d=""])`);

          // The save button should be enabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer:not([disabled])"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox[checked=true]");

          // The description has been filled in automatically.
          await page.waitForFunction(
            `document.querySelector("${descriptionInputSelector}").value !== ""`
          );
          description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description)
            .withContext(browserName)
            .toEqual("firefox_logo.png");

          await page.click("#addSignatureAddButton");
          await page.waitForSelector("#addSignatureDialog", {
            visible: false,
          });

          await page.waitForSelector(
            ".canvasWrapper > svg use[href='#path_p1_0']"
          );
        })
      );
    });

    it("must check copy and paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });
          await page.type("#addSignatureTypeInput", "Hello");
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);
          await page.click("#addSignatureAddButton");

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          const originalRect = await getRect(page, editorSelector);
          const originalDescription = await page.$eval(
            `${editorSelector} .altText.editDescription`,
            el => el.title
          );

          await copy(page);
          await paste(page);

          const pastedEditorSelector = getEditorSelector(1);
          await page.waitForSelector(pastedEditorSelector, { visible: true });
          const pastedRect = await getRect(page, pastedEditorSelector);
          const pastedDescription = await page.$eval(
            `${pastedEditorSelector} .altText.editDescription`,
            el => el.title
          );

          expect(pastedRect)
            .withContext(`In ${browserName}`)
            .not.toEqual(originalRect);
          expect(pastedDescription)
            .withContext(`In ${browserName}`)
            .toEqual(originalDescription);
        })
      );
    });
  });

  describe("Bug 1948741", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the editor isn't too large", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });
          await page.type(
            "#addSignatureTypeInput",
            "[18:50:03] asset pdf.scripting.mjs 105 KiB [emitted] [javascript module] (name: main)"
          );
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);
          await page.click("#addSignatureAddButton");

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(
            `.canvasWrapper > svg use[href="#path_p1_0"]`,
            { visible: true }
          );

          const { width } = await getRect(page, editorSelector);
          const { width: pageWidth } = await getRect(page, ".page");
          expect(width).toBeLessThanOrEqual(pageWidth);
        })
      );
    });
  });

  describe("Bug 1949201", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the error panel is correctly removed", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });
          await page.click("#addSignatureImageButton");
          await page.waitForSelector("#addSignatureImagePlaceholder", {
            visible: true,
          });
          const input = await page.$("#addSignatureFilePicker");
          await input.uploadFile(
            `${path.join(__dirname, "./signature_editor_spec.mjs")}`
          );
          await page.waitForSelector("#addSignatureError", { visible: true });
          await page.click("#addSignatureErrorCloseButton");
          await page.waitForSelector("#addSignatureError", { visible: false });

          await input.uploadFile(
            `${path.join(__dirname, "./stamp_editor_spec.mjs")}`
          );
          await page.waitForSelector("#addSignatureError", { visible: true });

          await page.click("#addSignatureTypeButton");
          await page.waitForSelector(
            "#addSignatureTypeButton[aria-selected=true]"
          );
          await page.waitForSelector("#addSignatureError", { visible: false });
          await page.click("#addSignatureCancelButton");
        })
      );
    });
  });
});
