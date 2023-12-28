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

import {
  awaitPromise,
  closePages,
  getEditorDimensions,
  getEditorSelector,
  getFirstSerialized,
  kbBigMoveDown,
  kbBigMoveRight,
  kbPaste,
  kbSelectAll,
  loadAndWait,
  serializeBitmapDimensions,
  waitForAnnotationEditorLayer,
  waitForSelectedEditor,
  waitForStorageEntries,
} from "./test_utils.mjs";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".stampEditor:not(.selectedEditor)")
  );
};

const clearAll = async page => {
  await selectAll(page);
  await page.keyboard.press("Backspace");
  await waitForStorageEntries(page, 0);
};

const waitForImage = async (page, selector) => {
  await page.waitForSelector(`${selector} canvas`);
  await page.waitForFunction(
    sel => {
      const canvas = document.querySelector(sel);
      const data = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height);
      return data.data.some(x => x !== 0);
    },
    {},
    `${selector} canvas`
  );
  await page.waitForSelector(`${selector} .altText`);
};

const copyImage = async (page, imagePath, number) => {
  const data = fs
    .readFileSync(path.join(__dirname, imagePath))
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

  let hasPasteEvent = false;
  while (!hasPasteEvent) {
    // We retry to paste if nothing has been pasted before 500ms.
    const handle = await page.evaluateHandle(() => {
      let callback = null;
      return [
        Promise.race([
          new Promise(resolve => {
            callback = e => resolve(e.clipboardData.items.length !== 0);
            document.addEventListener("paste", callback, {
              once: true,
            });
          }),
          new Promise(resolve => {
            setTimeout(() => {
              document.removeEventListener("paste", callback);
              resolve(false);
            }, 500);
          }),
        ]),
      ];
    });
    await kbPaste(page);
    hasPasteEvent = await awaitPromise(handle);
  }

  await waitForImage(page, getEditorSelector(number));
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
          await waitForImage(page, getEditorSelector(0));

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
          await waitForImage(page, getEditorSelector(1));

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
            await waitForImage(page, getEditorSelector(i));
            await page.waitForSelector(`${getEditorSelector(i)} .altText`);

            for (let j = 0; j < 4; j++) {
              await page.keyboard.press("Escape");
              await page.waitForSelector(
                `${getEditorSelector(i)} .resizers.hidden`
              );

              const handle = await waitForAnnotationEditorLayer(page);
              await page.evaluate(() => {
                window.PDFViewerApplication.rotatePages(90);
              });
              await awaitPromise(handle);

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

            const handle = await waitForAnnotationEditorLayer(page);
            await page.evaluate(() => {
              window.PDFViewerApplication.rotatePages(90);
            });
            await awaitPromise(handle);
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

          await copyImage(page, "../images/firefox_logo.png", 0);

          // Wait for the alt-text button to be visible.
          const buttonSelector = `${getEditorSelector(0)} button.altText`;
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

          // Check that the canvas has an aria-describedby attribute.
          await page.waitForSelector(
            `${getEditorSelector(0)} canvas[aria-describedby]`
          );

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

          // We check that the alt-text button works correctly with the
          // keyboard.
          const handle = await page.evaluateHandle(sel => {
            document.getElementById("viewerContainer").focus();
            return [
              new Promise(resolve => {
                setTimeout(() => {
                  const el = document.querySelector(sel);
                  el.addEventListener("focus", resolve, { once: true });
                  el.focus({ focusVisible: true });
                }, 0);
              }),
            ];
          }, buttonSelector);
          await awaitPromise(handle);
          await (browserName === "chrome"
            ? page.waitForSelector(`${buttonSelector}:focus`)
            : page.waitForSelector(`${buttonSelector}:focus-visible`));
          await page.keyboard.press("Enter");
          await page.waitForSelector("#altTextDialog", { visible: true });
          await page.keyboard.press("Escape");
          await (browserName === "chrome"
            ? page.waitForSelector(`${buttonSelector}:focus`)
            : page.waitForSelector(`${buttonSelector}:focus-visible`));
        })
      );
    });
  });

  describe("Resize an image with the keyboard", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 50);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the dimensions change", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorStamp");

          await copyImage(page, "../images/firefox_logo.png", 0);

          const editorSelector = getEditorSelector(0);

          await page.click(editorSelector);
          await waitForSelectedEditor(page, editorSelector);

          await page.waitForSelector(
            `${editorSelector} .resizer.topLeft[tabindex="-1"]`
          );

          const getDims = async () => {
            const [blX, blY, trX, trY] = await getFirstSerialized(
              page,
              x => x.rect
            );
            return [trX - blX, trY - blY];
          };

          const [width, height] = await getDims();

          // Press Enter to enter in resize-with-keyboard mode.
          await page.keyboard.press("Enter");

          // The resizer must become keyboard focusable.
          await page.waitForSelector(
            `${editorSelector} .resizer.topLeft[tabindex="0"]`
          );

          let prevWidth = width;
          let prevHeight = height;

          const waitForDimsChange = async (w, h) => {
            await page.waitForFunction(
              (prevW, prevH) => {
                const [x1, y1, x2, y2] =
                  window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.map
                    .values()
                    .next().value.rect;
                const newWidth = x2 - x1;
                const newHeight = y2 - y1;
                return newWidth !== prevW || newHeight !== prevH;
              },
              {},
              w,
              h
            );
          };

          for (let i = 0; i < 40; i++) {
            await page.keyboard.press("ArrowLeft");
            await waitForDimsChange(prevWidth, prevHeight);
            [prevWidth, prevHeight] = await getDims();
          }

          let [newWidth, newHeight] = await getDims();
          expect(newWidth > width + 30)
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(newHeight > height + 30)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          for (let i = 0; i < 4; i++) {
            await kbBigMoveRight(page);
            await waitForDimsChange(prevWidth, prevHeight);
            [prevWidth, prevHeight] = await getDims();
          }

          [newWidth, newHeight] = await getDims();
          expect(Math.abs(newWidth - width) < 2)
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(Math.abs(newHeight - height) < 2)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          // Move the focus to the next resizer.
          await page.keyboard.press("Tab");
          await page.waitForFunction(
            () => !!document.activeElement?.classList.contains("topMiddle")
          );

          for (let i = 0; i < 40; i++) {
            await page.keyboard.press("ArrowUp");
            await waitForDimsChange(prevWidth, prevHeight);
            [prevWidth, prevHeight] = await getDims();
          }

          [, newHeight] = await getDims();
          expect(newHeight > height + 50)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          for (let i = 0; i < 4; i++) {
            await kbBigMoveDown(page);
            await waitForDimsChange(prevWidth, prevHeight);
            [prevWidth, prevHeight] = await getDims();
          }

          [, newHeight] = await getDims();
          expect(Math.abs(newHeight - height) < 2)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          // Escape should remove the focus from the resizer.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${editorSelector} .resizer.topLeft[tabindex="-1"]`
          );
          await page.waitForFunction(
            () => !document.activeElement?.classList.contains("resizer")
          );
        })
      );
    });
  });
});
