/* Copyright 2022 Mozilla Foundation
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

const {
  closePages,
  getEditorDimensions,
  getEditorSelector,
  loadAndWait,
  serializeBitmapDimensions,
  waitForAnnotationEditorLayer,
  waitForStorageEntries,
  waitForSelectedEditor,
} = require("./test_utils.js");
const path = require("path");
const fs = require("fs");

const selectAll = async page => {
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.waitForFunction(
    () => !document.querySelector(".stampEditor:not(.selectedEditor)")
  );
};

const clearAll = async page => {
  await selectAll(page);
  await page.keyboard.down("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.up("Control");
  await waitForStorageEntries(page, 0);
};

describe("Stamp Editor", () => {
  describe("Basic operations", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must load a PNG which is bigger than a page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            // Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847.
            return;
          }

          await page.click("#editorStamp");
          await page.click("#editorStampAddImage");

          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );
          await page.waitForSelector(`${getEditorSelector(0)} .altText`);

          const { width } = await getEditorDimensions(page, 0);

          // The image is bigger than the page, so it has been scaled down to
          // 75% of the page width.
          expect(width).toEqual("75%");

          const [bitmap] = await serializeBitmapDimensions(page);
          expect(bitmap.width).toEqual(512);
          expect(bitmap.height).toEqual(543);

          await clearAll(page);
        })
      );
    });

    it("must load a SVG", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            // Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847.
            return;
          }

          await page.click("#editorStampAddImage");
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.svg")}`
          );
          await page.waitForSelector(`${getEditorSelector(1)} .altText`);

          const { width } = await getEditorDimensions(page, 1);

          expect(Math.round(parseFloat(width))).toEqual(40);

          const [bitmap] = await serializeBitmapDimensions(page);
          // The original size is 80x242 but to increase the resolution when it
          // is rasterized we scale it up by 96 / 72
          const ratio = await page.evaluate(
            () => window.pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
          );
          expect(bitmap.width).toEqual(Math.round(242 * ratio));
          expect(bitmap.height).toEqual(Math.round(80 * ratio));

          await clearAll(page);
        })
      );
    });
  });

  describe("Resize", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 50);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that an added image stay within the page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            // Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847.
            return;
          }

          await page.click("#editorStamp");
          const names = ["bottomLeft", "bottomRight", "topRight", "topLeft"];

          for (let i = 0; i < 4; i++) {
            if (i !== 0) {
              await clearAll(page);
            }

            await page.click("#editorStampAddImage");
            const input = await page.$("#stampEditorFileInput");
            await input.uploadFile(
              `${path.join(__dirname, "../images/firefox_logo.png")}`
            );
            await page.waitForSelector(`${getEditorSelector(i)} .altText`);

            for (let j = 0; j < 4; j++) {
              await page.keyboard.press("Escape");
              await page.waitForSelector(
                `${getEditorSelector(i)} .resizers.hidden`
              );

              const promise = waitForAnnotationEditorLayer(page);
              await page.evaluate(() => {
                window.PDFViewerApplication.rotatePages(90);
              });
              await promise;

              await page.focus(".stampEditor");
              await waitForSelectedEditor(page, getEditorSelector(i));

              await page.waitForSelector(
                `${getEditorSelector(i)} .resizers:not(.hidden)`
              );

              const [name, cursor] = await page.evaluate(() => {
                const { x, y } = document
                  .querySelector(".stampEditor")
                  .getBoundingClientRect();
                const el = document.elementFromPoint(x, y);
                const cornerName = Array.from(el.classList).find(
                  c => c !== "resizer"
                );
                return [cornerName, window.getComputedStyle(el).cursor];
              });

              expect(name).withContext(`In ${browserName}`).toEqual(names[j]);
              expect(cursor)
                .withContext(`In ${browserName}`)
                .toEqual("nwse-resize");
            }

            const promise = waitForAnnotationEditorLayer(page);
            await page.evaluate(() => {
              window.PDFViewerApplication.rotatePages(90);
            });
            await promise;
          }
        })
      );
    });
  });

  describe("Alt text dialog", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 50);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the alt-text flow is correctly implemented", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorStamp");

          const data = fs
            .readFileSync(path.join(__dirname, "../images/firefox_logo.png"))
            .toString("base64");
          await page.evaluate(async imageData => {
            const resp = await fetch(`data:image/png;base64,${imageData}`);
            const blob = await resp.blob();

            await navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
              }),
            ]);
          }, data);

          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");

          // Wait for the alt-text button to be visible.
          const buttonSelector = "#pdfjs_internal_editor_0 button.altText";
          await page.waitForSelector(buttonSelector);

          // Click on the alt-text button.
          await page.click(buttonSelector);

          // Wait for the alt-text dialog to be visible.
          await page.waitForSelector("#altTextDialog", { visible: true });

          // Click on the alt-text editor.
          const textareaSelector = "#altTextDialog textarea";
          await page.click(textareaSelector);
          await page.type(textareaSelector, "Hello World");

          // Click on save button.
          const saveButtonSelector = "#altTextDialog #altTextSave";
          await page.click(saveButtonSelector);

          // Wait for the alt-text button to have the correct icon.
          await page.waitForSelector(`${buttonSelector}.done`);

          // Hover the button.
          await page.hover(buttonSelector);

          // Wait for the tooltip to be visible.
          const tooltipSelector = `${buttonSelector} .tooltip`;
          await page.waitForSelector(tooltipSelector, { visible: true });

          let tooltipText = await page.evaluate(
            sel => document.querySelector(`${sel}`).innerText,
            tooltipSelector
          );
          expect(tooltipText).toEqual("Hello World");

          // Now we change the alt-text and check that the tooltip is updated.
          await page.click(buttonSelector);
          await page.waitForSelector("#altTextDialog", { visible: true });
          await page.evaluate(sel => {
            document.querySelector(`${sel}`).value = "";
          }, textareaSelector);
          await page.click(textareaSelector);
          await page.type(textareaSelector, "Dlrow Olleh");
          await page.click(saveButtonSelector);
          await page.waitForSelector(`${buttonSelector}.done`);
          await page.hover(buttonSelector);
          await page.waitForSelector(tooltipSelector, { visible: true });
          tooltipText = await page.evaluate(
            sel => document.querySelector(`${sel}`).innerText,
            tooltipSelector
          );
          expect(tooltipText).toEqual("Dlrow Olleh");

          // Now we just check that cancel didn't change anything.
          await page.click(buttonSelector);
          await page.waitForSelector("#altTextDialog", { visible: true });
          await page.evaluate(sel => {
            document.querySelector(`${sel}`).value = "";
          }, textareaSelector);
          await page.click(textareaSelector);
          await page.type(textareaSelector, "Hello PDF.js");
          const cancelButtonSelector = "#altTextDialog #altTextCancel";
          await page.click(cancelButtonSelector);
          await page.waitForSelector(`${buttonSelector}.done`);
          await page.hover(buttonSelector);
          await page.waitForSelector(tooltipSelector, { visible: true });
          tooltipText = await page.evaluate(
            sel => document.querySelector(`${sel}`).innerText,
            tooltipSelector
          );
          // The tooltip should still be "Dlrow Olleh".
          expect(tooltipText).toEqual("Dlrow Olleh");

          // Now we switch to decorative.
          await page.click(buttonSelector);
          await page.waitForSelector("#altTextDialog", { visible: true });
          const decorativeSelector = "#altTextDialog #decorativeButton";
          await page.click(decorativeSelector);
          await page.click(saveButtonSelector);
          await page.waitForSelector(`${buttonSelector}.done`);
          await page.hover(buttonSelector);
          await page.waitForSelector(tooltipSelector, { visible: true });
          tooltipText = await page.evaluate(
            sel => document.querySelector(`${sel}`).innerText,
            tooltipSelector
          );
          expect(tooltipText).toEqual("Marked as decorative");

          // Now we switch back to non-decorative.
          await page.click(buttonSelector);
          await page.waitForSelector("#altTextDialog", { visible: true });
          const descriptionSelector = "#altTextDialog #descriptionButton";
          await page.click(descriptionSelector);
          await page.click(saveButtonSelector);
          await page.waitForSelector(`${buttonSelector}.done`);
          await page.hover(buttonSelector);
          await page.waitForSelector(tooltipSelector, { visible: true });
          tooltipText = await page.evaluate(
            sel => document.querySelector(`${sel}`).innerText,
            tooltipSelector
          );
          expect(tooltipText).toEqual("Dlrow Olleh");

          // Now we remove the alt-text and check that the tooltip is removed.
          await page.click(buttonSelector);
          await page.waitForSelector("#altTextDialog", { visible: true });
          await page.evaluate(sel => {
            document.querySelector(`${sel}`).value = "";
          }, textareaSelector);
          await page.click(saveButtonSelector);
          await page.waitForSelector(`${buttonSelector}:not(.done)`);
          await page.hover(buttonSelector);
          await page.evaluate(
            sel => document.querySelector(sel) === null,
            tooltipSelector
          );
        })
      );
    });
  });
});
