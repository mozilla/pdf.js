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
  FSI,
  getEditorSelector,
  getRect,
  loadAndWait,
  paste,
  PDI,
  switchToEditor,
  waitForPointerUp,
  waitForTimeout,
} from "./test_utils.mjs";
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const __dirname = import.meta.dirname;

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
            "#addSignatureSaveContainer > input:disabled"
          );
          let description = await page.$eval(
            descriptionInputSelector,
            el => el.value
          );
          expect(description).withContext(browserName).toEqual("");
          await page.waitForSelector(`${addButtonSelector}:disabled`);
          await page.waitForSelector("#addSignatureDescInput:disabled");

          await page.type("#addSignatureTypeInput", "PDF.js");
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);
          await page.waitForSelector("#addSignatureDescInput:not(:disabled)");

          // The save button should be enabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer > input:not(:disabled)"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox:checked");

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
            "#addSignatureSaveContainer > input:disabled"
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

          const alert = await page.$eval("#viewer-alert", el => el.textContent);
          expect(alert).toEqual("Signature added");

          // Check the tooltip.
          await page.waitForSelector(
            `.altText.editDescription[title="Hello World"]`
          );

          // Check the aria description.
          await page.waitForSelector(
            `${editorSelector}[aria-description="Signature editor: ${FSI}Hello World${PDI}"]`
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
            "#addSignatureSaveContainer > input:not(:disabled)"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox:checked");

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
            "#addSignatureSaveContainer > input:not(:disabled)"
          );
          await page.waitForSelector("#addSignatureSaveCheckbox:checked");

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
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
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
        const originalL10nParameter = await page.$eval(editorSelector, el =>
          el.getAttribute("data-l10n-args")
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
        const pastedL10nParameter = await page.$eval(pastedEditorSelector, el =>
          el.getAttribute("data-l10n-args")
        );

        expect(pastedRect)
          .withContext(`In ${browserName}`)
          .not.toEqual(originalRect);
        expect(pastedDescription)
          .withContext(`In ${browserName}`)
          .toEqual(originalDescription);
        expect(pastedL10nParameter)
          .withContext(`In ${browserName}`)
          .toEqual(originalL10nParameter);
      }
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

  describe("viewerCssTheme (light)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { viewerCssTheme: "1" }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the signature has the correct color with the light theme", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          const colorTheme = await page.evaluate(() => {
            const html = document.querySelector("html");
            const style = getComputedStyle(html);
            return style.getPropertyValue("color-scheme");
          });
          expect(colorTheme).toEqual("light");

          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });
          await page.type("#addSignatureTypeInput", "Should be black.");
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);
          await page.click("#addSignatureAddButton");

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(
            `.canvasWrapper > svg use[href="#path_p1_0"]`,
            { visible: true }
          );

          const color = await page.evaluate(() => {
            const use = document.querySelector(
              `.canvasWrapper > svg use[href="#path_p1_0"]`
            );
            return use.parentNode.getAttribute("fill");
          });
          expect(color).toEqual("#000000");
        })
      );
    });
  });

  describe("viewerCssTheme (dark)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { viewerCssTheme: "2" }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the signature has the correct color with the dark theme", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          const colorTheme = await page.evaluate(() => {
            const html = document.querySelector("html");
            const style = getComputedStyle(html);
            return style.getPropertyValue("color-scheme");
          });
          expect(colorTheme).toEqual("dark");

          await switchToSignature(page);
          await page.click("#editorSignatureAddSignature");

          await page.waitForSelector("#addSignatureDialog", {
            visible: true,
          });
          await page.type("#addSignatureTypeInput", "Should be black.");
          await page.waitForSelector(`${addButtonSelector}:not(:disabled)`);
          await page.click("#addSignatureAddButton");

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(
            `.canvasWrapper > svg use[href="#path_p1_0"]`,
            { visible: true }
          );

          const color = await page.evaluate(() => {
            const use = document.querySelector(
              `.canvasWrapper > svg use[href="#path_p1_0"]`
            );
            return use.parentNode.getAttribute("fill");
          });
          expect(color).toEqual("#000000");
        })
      );
    });
  });

  describe("Check the aspect ratio (bug 1962819)", () => {
    let pages, contentWidth, contentHeight;

    function getContentAspectRatio(png) {
      const { width, height } = png;
      const buffer = new Uint32Array(png.data.buffer);
      let x0 = width;
      let y0 = height;
      let x1 = 0;
      let y1 = 0;
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          if (buffer[width * i + j] !== 0) {
            x0 = Math.min(x0, j);
            y0 = Math.min(y0, i);
            x1 = Math.max(x1, j);
            y1 = Math.max(y1, i);
          }
        }
      }

      contentWidth = x1 - x0;
      contentHeight = y1 - y0;
    }

    beforeAll(() => {
      const data = fs.readFileSync(
        path.join(__dirname, "../images/samplesignature.png")
      );
      const png = PNG.sync.read(data);
      getContentAspectRatio(png);
    });

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the signature has the correct aspect ratio", async () => {
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
          await page.waitForSelector(`${addButtonSelector}:disabled`);

          const input = await page.$("#addSignatureFilePicker");
          await input.uploadFile(
            `${path.join(__dirname, "../images/samplesignature.png")}`
          );
          await page.waitForSelector(`#addSignatureImage > path:not([d=""])`);

          // The save button should be enabled now.
          await page.waitForSelector(
            "#addSignatureSaveContainer > input:not(:disabled)"
          );
          await page.click("#addSignatureAddButton");
          await page.waitForSelector("#addSignatureDialog", {
            visible: false,
          });
          const { width, height } = await getRect(
            page,
            ".canvasWrapper > svg use[href='#path_p1_0']"
          );

          expect(Math.abs(contentWidth / width - contentHeight / height))
            .withContext(
              `In ${browserName} (${contentWidth}x${contentHeight} vs ${width}x${height})`
            )
            .toBeLessThan(0.25);
        })
      );
    });
  });

  describe("Bug 1974257", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the signature save checkbox is disabled if storage is full", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          await switchToSignature(page);

          for (let i = 0; i < 6; i++) {
            await page.click("#editorSignatureAddSignature");
            await page.waitForSelector("#addSignatureDialog", {
              visible: true,
            });
            await page.click("#addSignatureTypeInput");
            await page.type("#addSignatureTypeInput", `PDF.js ${i}`);
            if (i === 5) {
              await page.waitForSelector(
                "#addSignatureSaveCheckbox:not(checked)"
              );
              await page.waitForSelector("#addSignatureSaveCheckbox:disabled");
            } else {
              await page.waitForSelector("#addSignatureSaveCheckbox:checked");
              await page.waitForSelector(
                "#addSignatureSaveCheckbox:not(:disabled)"
              );
            }
            await page.click("#addSignatureAddButton");
            await page.waitForSelector("#addSignatureDialog", {
              visible: false,
            });
          }
        })
      );
    });
  });

  describe("Bug 1975719", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that an error is displayed with a monochrome image", async () => {
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
            `${path.join(__dirname, "../images/red.png")}`
          );
          await page.waitForSelector("#addSignatureError", { visible: true });
          await page.waitForSelector(
            "#addSignatureErrorTitle[data-l10n-id='pdfjs-editor-add-signature-image-no-data-error-title']"
          );
          await page.waitForSelector(
            "#addSignatureErrorDescription[data-l10n-id='pdfjs-editor-add-signature-image-no-data-error-description']"
          );
          await page.click("#addSignatureErrorCloseButton");
          await page.waitForSelector("#addSignatureError", { visible: false });
        })
      );
    });
  });
});
