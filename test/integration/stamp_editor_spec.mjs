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
  applyFunctionToEditor,
  awaitPromise,
  cleanupEditing,
  clearEditors,
  clearInput,
  closePages,
  copy,
  copyToClipboard,
  dragAndDrop,
  getAnnotationSelector,
  getEditorDimensions,
  getEditors,
  getEditorSelector,
  getFirstSerialized,
  getRect,
  getSerialized,
  isVisible,
  kbBigMoveDown,
  kbBigMoveRight,
  kbUndo,
  loadAndWait,
  paste,
  pasteFromClipboard,
  scrollIntoView,
  selectEditor,
  serializeBitmapDimensions,
  switchToEditor,
  unselectEditor,
  waitForAnnotationEditorLayer,
  waitForAnnotationModeChanged,
  waitForEntryInStorage,
  waitForSelectedEditor,
  waitForSerialized,
  waitForTimeout,
} from "./test_utils.mjs";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const clearAll = clearEditors.bind(null, "stamp");

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

const copyImage = async (page, imagePath, selector) => {
  const data = fs
    .readFileSync(path.join(__dirname, imagePath))
    .toString("base64");

  await copyToClipboard(page, { "image/png": `data:image/png;base64,${data}` });
  await pasteFromClipboard(page);

  await waitForImage(page, selector);
};

async function waitForTranslation(page) {
  return page.evaluate(async () => {
    await new Promise(resolve => {
      window.requestAnimationFrame(resolve);
    });
  });
}

const switchToStamp = switchToEditor.bind(null, "Stamp");

describe("Stamp Editor", () => {
  describe("Basic operations", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", null, {
        eventBusSetup: eventBus => {
          eventBus.on("annotationeditoruimanager", ({ uiManager }) => {
            window.uiManager = uiManager;
          });
        },
      });
    });

    afterEach(async () => {
      await cleanupEditing(pages, switchToStamp);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must load a PNG which is bigger than a page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);
          await page.click("#editorStampAddImage");

          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );
          const editorSelector = getEditorSelector(0);
          await waitForImage(page, editorSelector);

          const { width } = await getEditorDimensions(page, editorSelector);

          // The image is bigger than the page, so it has been scaled down to
          // 75% of the page width.
          expect(width).toEqual("75%");

          const [bitmap] = await serializeBitmapDimensions(page);
          expect(bitmap.width).toEqual(512);
          expect(bitmap.height).toEqual(543);
        })
      );
    });

    it("must load a SVG", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);
          await page.click("#editorStampAddImage");
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.svg")}`
          );
          const editorSelector = getEditorSelector(0);
          await waitForImage(page, editorSelector);

          const { width } = await getEditorDimensions(page, editorSelector);

          expect(Math.round(parseFloat(width))).toEqual(40);

          const [bitmap] = await serializeBitmapDimensions(page);
          // The original size is 80x242 but to increase the resolution when it
          // is rasterized we scale it up by 96 / 72
          const ratio = await page.evaluate(
            () => window.pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
          );
          expect(Math.abs(bitmap.width - 242 * ratio) < 1).toBeTrue();
          expect(Math.abs(bitmap.height - 80 * ratio) < 1).toBeTrue();
        })
      );
    });

    it("must load a SVG, delete it and undo", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);
          await page.click("#editorStampAddImage");
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.svg")}`
          );
          const editorSelector = getEditorSelector(0);
          await waitForImage(page, editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await kbUndo(page);
          await waitForImage(page, editorSelector);
          await waitForSerialized(page, 1);

          await waitForSelectedEditor(page, editorSelector);
        })
      );
    });
  });

  describe("Resize", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 50, {
        eventBusSetup: eventBus => {
          eventBus.on("annotationeditoruimanager", ({ uiManager }) => {
            window.uiManager = uiManager;
          });
        },
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    afterEach(async () => {
      await cleanupEditing(pages, switchToStamp);
    });

    it("must check that an added image stay within the page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);
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
            const editorSelector = getEditorSelector(i);
            await waitForImage(page, editorSelector);
            await page.waitForSelector(`${editorSelector} .altText`);

            for (let j = 0; j < 4; j++) {
              await page.keyboard.press("Escape");
              await page.waitForSelector(`${editorSelector} .resizers.hidden`);

              const handle = await waitForAnnotationEditorLayer(page);
              await page.evaluate(() => {
                window.PDFViewerApplication.rotatePages(90);
              });
              await awaitPromise(handle);

              await page.focus(".stampEditor");
              await waitForSelectedEditor(page, editorSelector);

              await page.waitForSelector(
                `${editorSelector} .resizers:not(.hidden)`
              );

              const stampRect = await getRect(page, ".stampEditor");
              const [name, cursor] = await page.evaluate(rect => {
                const el = document.elementFromPoint(rect.x, rect.y);
                const cornerName = Array.from(el.classList).find(
                  c => c !== "resizer"
                );
                return [cornerName, window.getComputedStyle(el).cursor];
              }, stampRect);

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

    it("must check that the opposite corner doesn't move", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);

          await page.click("#editorStampAddImage");
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );
          const editorSelector = getEditorSelector(0);
          await waitForImage(page, editorSelector);
          await page.waitForSelector(`${editorSelector} .resizer.topLeft`);
          const baseRect = await getRect(page, editorSelector);
          const bRX = baseRect.x + baseRect.width;
          const bRY = baseRect.y + baseRect.height;

          await dragAndDrop(page, `${editorSelector} .resizer.topLeft`, [
            [-10, -10],
            [20, 20],
            [-10, -10],
            [20, 20],
          ]);

          const newRect = await getRect(page, editorSelector);
          const newBRX = newRect.x + newRect.width;
          const newBRY = newRect.y + newRect.height;

          expect(Math.abs(bRX - newBRX) <= 1)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(Math.abs(bRY - newBRY) <= 1)
            .withContext(`In ${browserName}`)
            .toBeTrue();
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
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);

        // Wait for the alt-text button to be visible.
        const buttonSelector = `${editorSelector} button.altText`;
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
          `${editorSelector} canvas[aria-describedby]`
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
        const longString = "a".repeat(512);
        await page.click(buttonSelector);
        await page.waitForSelector("#altTextDialog", { visible: true });
        await page.evaluate(sel => {
          document.querySelector(`${sel}`).value = "";
        }, textareaSelector);
        await page.click(textareaSelector);
        await page.type(textareaSelector, longString);
        await page.click(saveButtonSelector);
        await page.waitForSelector(`${buttonSelector}.done`);
        await page.hover(buttonSelector);
        await page.waitForSelector(tooltipSelector, { visible: true });
        tooltipText = await page.evaluate(
          sel => document.querySelector(`${sel}`).innerText,
          tooltipSelector
        );
        expect(tooltipText).toEqual(longString);
        const dims = await page.evaluate(sel => {
          const { width, height } = document
            .querySelector(`${sel}`)
            .getBoundingClientRect();
          return { width, height };
        }, tooltipSelector);
        expect(dims.width / dims.height).toBeLessThan(2);

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
        // The tooltip should still be longString.
        expect(tooltipText).toEqual(longString);

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
        expect(tooltipText).toEqual(longString);

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
      }
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
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);

        await selectEditor(page, editorSelector);

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
      }
    });
  });

  describe("Copy/paste from a tab to an other", () => {
    let pages1, pages2;

    beforeAll(async () => {
      pages1 = await loadAndWait("empty.pdf", ".annotationEditorLayer");
      pages2 = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages1);
      await closePages(pages2);
    });

    it("must check that the alt-text button is here when pasting in the second tab", async () => {
      for (let i = 0; i < pages1.length; i++) {
        const [, page1] = pages1[i];
        await page1.bringToFront();
        await switchToStamp(page1);

        const editorSelector = getEditorSelector(0);
        await copyImage(page1, "../images/firefox_logo.png", editorSelector);
        await copy(page1);

        const [, page2] = pages2[i];
        await page2.bringToFront();
        await switchToStamp(page2);

        await paste(page2);

        await waitForImage(page2, editorSelector);
      }
    });
  });

  describe("Undo a stamp", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a stamp can be undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${editorSelector} button.delete`);
        await page.click(`${editorSelector} button.delete`);
        await waitForSerialized(page, 0);

        await kbUndo(page);
        await waitForImage(page, editorSelector);
        await waitForSerialized(page, 1);
      }
    });
  });

  describe("Delete a stamp and undo it on another page", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a stamp can be undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${editorSelector} button.delete`);
        await page.click(`${editorSelector} button.delete`);
        await waitForSerialized(page, 0);

        const twoToFourteen = Array.from(new Array(13).keys(), n => n + 2);
        for (const pageNumber of twoToFourteen) {
          const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
          await scrollIntoView(page, pageSelector);
        }

        await kbUndo(page);
        await waitForSerialized(page, 1);

        const thirteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
        for (const pageNumber of thirteenToOne) {
          const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
          await scrollIntoView(page, pageSelector);
        }

        await page.waitForSelector(`${editorSelector} canvas`);
      }
    });
  });

  describe("Delete a stamp, scroll and undo it", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a stamp can be undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${editorSelector} button.delete`);
        await page.click(`${editorSelector} button.delete`);
        await waitForSerialized(page, 0);

        const twoToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
          Array.from(new Array(13).keys(), n => 13 - n)
        );
        for (const pageNumber of twoToOne) {
          const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
          await scrollIntoView(page, pageSelector);
        }

        await kbUndo(page);
        await waitForImage(page, editorSelector);
        await waitForSerialized(page, 1);
      }
    });
  });

  describe("Resize a stamp", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a resized stamp has its canvas at the right position", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        const serializedRect = await getFirstSerialized(page, x => x.rect);
        const rect = await getRect(page, ".resizer.bottomRight");
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX - 500, centerY - 500);
        await page.mouse.up();

        await waitForEntryInStorage(
          page,
          "rect",
          serializedRect,
          (x, y) => x !== y
        );

        const canvasRect = await getRect(page, `${editorSelector} canvas`);
        const stampRect = await getRect(page, editorSelector);

        expect(
          ["x", "y", "width", "height"].every(
            key => Math.abs(canvasRect[key] - stampRect[key]) <= 10
          )
        ).toBeTrue();
      }
    });
  });

  describe("Add a stamp in odd spread mode", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        null,
        {
          spreadModeOnLoad: 1,
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the stamp has its canvas at the right position", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        const canvasRect = await getRect(page, `${editorSelector} canvas`);
        const stampRect = await getRect(page, editorSelector);

        expect(
          ["x", "y", "width", "height"].every(
            key => Math.abs(canvasRect[key] - stampRect[key]) <= 10
          )
        ).toBeTrue();
      }
    });
  });

  describe("Copy and paste a stamp with an alt text", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the pasted image has an alt text", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);
        await applyFunctionToEditor(page, "pdfjs_internal_editor_0", editor => {
          editor.altTextData = {
            altText: "Hello World",
            decorative: false,
          };
        });
        await page.waitForSelector(`${editorSelector} .altText.done`);

        await copy(page);
        await paste(page);
        await page.waitForSelector(`${getEditorSelector(1)} .altText.done`);
        await waitForSerialized(page, 2);

        const serialized = await getSerialized(
          page,
          x => x.accessibilityData?.alt
        );

        expect(serialized)
          .withContext(`In ${browserName}`)
          .toEqual(["Hello World", "Hello World"]);
      }
    });
  });

  describe("New alt-text flow", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        {
          eventBusSetup: eventBus => {
            eventBus.on("annotationeditoruimanager", ({ uiManager }) => {
              window.uiManager = uiManager;
            });
            eventBus.on("reporttelemetry", ({ details }) => {
              (window.telemetry ||= []).push(structuredClone(details));
            });
          },
        },
        {
          enableAltText: true,
          enableUpdatedAddImage: true,
          enableGuessAltText: true,
        }
      );
    });

    afterEach(async () => {
      for (const [, page] of pages) {
        if (await isVisible(page, "#newAltTextDialog")) {
          await page.keyboard.press("Escape");
          await page.waitForSelector("#newAltTextDisclaimer", {
            visible: false,
          });
        }
        await page.evaluate(() => {
          window.uiManager.reset();
          window.telemetry = [];
        });
        // Disable editing mode.
        await switchToStamp(page, /* disable */ true);
      }
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the new alt text flow (part 1)", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToStamp(page);

        // Add an image.
        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog", { visible: true });
        // Wait for the spinner to be visible.
        await page.waitForSelector("#newAltTextDescriptionContainer.loading");
        // Check we've the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: true });

        // Check that the dialog has the correct title: "Edit..."
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Edit')"
        );

        // Check that AI guessed the correct alt text.
        await page.waitForFunction(
          `document.getElementById("newAltTextDescriptionTextarea").value ===
            "Fake alt text."`
        );

        // Check that the dialog has the correct title: "Edit..."
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Edit')"
        );

        // Check we've the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: true });

        // Clear the input and check that the title changes to "Add..."
        await clearInput(
          page,
          "#newAltTextDescriptionTextarea",
          /* waitForInputEvent = */ true
        );
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Add')"
        );

        // Check we haven't the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: false });

        // Add a new alt text and check that the title changes to "Edit..."
        await page.type("#newAltTextDescriptionTextarea", "Hello World");
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Edit')"
        );

        // Check we haven't the disclaimer after the modification.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: false });

        // Click on the Not Now button.
        await page.click("#newAltTextNotNow");
        await page.waitForSelector("#newAltTextDialog", { visible: false });
        await waitForSelectedEditor(page, editorSelector);

        // Wait for the alt-text button to be visible.
        const buttonSelector = `${editorSelector} button.altText.new`;
        await page.waitForSelector(buttonSelector, { visible: true });

        await waitForTranslation(page);
        // Check the text in the button.
        let text = await page.evaluate(
          sel => document.querySelector(sel).textContent,
          buttonSelector
        );
        let ariaLabel = await page.evaluate(
          sel => document.querySelector(sel).getAttribute("aria-label"),
          buttonSelector
        );
        expect(text === ariaLabel && text)
          .withContext(`In ${browserName}`)
          .toEqual("Review alt text");

        // Unselect and select the editor and check that the badge is visible.
        await unselectEditor(page, editorSelector);
        await page.waitForSelector(".editToolbar", { visible: false });
        await page.waitForSelector(".noAltTextBadge", { visible: true });

        await page.evaluate(() => {
          window.uiManager.selectAll();
        });
        await waitForSelectedEditor(page, editorSelector);
        await page.waitForSelector(".editToolbar", { visible: true });
        await page.waitForSelector(".noAltTextBadge", { visible: false });

        // Click on the Review button.
        await page.click(buttonSelector);
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Check that the dialog has the correct title: "Edit..."
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Edit')"
        );

        // Click on create automatically toggle button.
        await page.click("#newAltTextCreateAutomaticallyButton");
        await clearInput(
          page,
          "#newAltTextDescriptionTextarea",
          /* waitForInputEvent = */ true
        );

        // Save the empty text.
        await page.click("#newAltTextSave");
        await page.waitForSelector("#newAltTextDialog", { visible: false });
        await waitForSelectedEditor(page, editorSelector);
        await page.waitForSelector(buttonSelector, { visible: true });

        await waitForTranslation(page);
        // Check the text in the button.
        text = await page.evaluate(
          sel => document.querySelector(sel).textContent,
          buttonSelector
        );
        ariaLabel = await page.evaluate(
          sel => document.querySelector(sel).getAttribute("aria-label"),
          buttonSelector
        );
        expect(text === ariaLabel && text)
          .withContext(`In ${browserName}`)
          .toEqual("Missing alt text");

        // Unselect and select the editor and check that the badge is visible.
        await unselectEditor(page, editorSelector);
        await page.waitForSelector(".editToolbar", { visible: false });
        await page.waitForSelector(".noAltTextBadge", { visible: true });
        await page.evaluate(() => {
          window.uiManager.selectAll();
        });
        await waitForSelectedEditor(page, editorSelector);
        await page.waitForSelector(".editToolbar", { visible: true });
        await page.waitForSelector(".noAltTextBadge", { visible: false });

        // Click on the Review button.
        await page.click(buttonSelector);
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Add')"
        );
        // Add a new alt text and check that the title changes to "Edit..."
        await page.type("#newAltTextDescriptionTextarea", "Hello World");
        await page.waitForFunction(
          "document.getElementById('newAltTextTitle').textContent.startsWith('Edit')"
        );

        // Click on the Save button.
        await page.click("#newAltTextSave");
        await page.waitForSelector("#newAltTextDialog", { visible: false });

        await waitForTranslation(page);
        // Check the text in the button.
        text = await page.evaluate(
          sel => document.querySelector(sel).firstChild.textContent,
          buttonSelector
        );
        ariaLabel = await page.evaluate(
          sel => document.querySelector(sel).getAttribute("aria-label"),
          buttonSelector
        );
        expect(text === ariaLabel && text)
          .withContext(`In ${browserName}`)
          .toEqual("Alt text added");

        await page.hover(buttonSelector);

        // Wait for the tooltip to be visible.
        const tooltipSelector = `${buttonSelector} .tooltip`;
        await page.waitForSelector(tooltipSelector, { visible: true });

        const tooltipText = await page.evaluate(
          sel => document.querySelector(`${sel}`).textContent,
          tooltipSelector
        );
        expect(tooltipText).toEqual("Hello World");

        // Click on the Review button.
        await page.click(buttonSelector);
        await page.waitForSelector("#newAltTextDialog", { visible: true });
        await page.click("#newAltTextCreateAutomaticallyButton");
        await page.click("#newAltTextCancel");
        await page.waitForSelector("#newAltTextDialog", { visible: false });
      }
    });

    it("must check the new alt text flow (part 2)", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        // Add an image.
        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Wait for the spinner to be visible.
        await page.waitForSelector("#newAltTextDescriptionContainer.loading");

        // Check we've the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: true });

        // Click in the textarea in order to stop the guessing.
        await page.click("#newAltTextDescriptionTextarea");
        await page.waitForFunction(() =>
          document
            .getElementById("newAltTextTitle")
            .textContent.startsWith("Add ")
        );

        // Check we haven't the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer", { visible: false });

        // Click on the Not Now button.
        await page.click("#newAltTextNotNow");
        await page.waitForSelector("#newAltTextDialog", { visible: false });
      }
    });

    it("must check the new alt text flow (part 3)", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await page.evaluate(() => {
          window.PDFViewerApplication.mlManager.enableAltTextModelDownload = false;
        });

        await switchToStamp(page);

        // Add an image.
        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Check we haven't the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer[hidden]");
      }
    });

    it("must check that the data in telemetry are correct", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await page.evaluate(() => {
          window.PDFViewerApplication.mlManager.enableAltTextModelDownload = true;
        });
        await switchToStamp(page);

        // Add an image.
        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Check that AI guessed the correct alt text.
        await page.waitForFunction(
          `document.getElementById("newAltTextDescriptionTextarea").value ===
                    "Fake alt text."`
        );
        // Clear the input and check that the title changes to "Add..."
        await clearInput(
          page,
          "#newAltTextDescriptionTextarea",
          /* waitForInputEvent = */ true
        );
        // Save the empty text.
        await page.click("#newAltTextSave");
        await page.waitForSelector("#newAltTextDialog", { visible: false });

        // Get the telemetry data and clean.
        let telemetry = await page.evaluate(() => {
          const tel = window.telemetry;
          window.telemetry = [];
          return tel;
        });
        let saveTelemetry = telemetry.find(
          details => details.data.action === "pdfjs.image.alt_text.user_edit"
        );
        expect(saveTelemetry.data.data)
          .withContext(`In ${browserName}`)
          .toEqual({
            total_words: 3,
            words_removed: 3,
            words_added: 0,
          });

        // Click on the Review button.
        const buttonSelector = `${editorSelector} button.altText.new`;
        await page.waitForSelector(buttonSelector, { visible: true });
        await page.click(buttonSelector);
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Add a new alt text and check that the title changes to "Edit..."
        await page.type("#newAltTextDescriptionTextarea", "Fake text alt foo.");

        // Save the empty text.
        await page.click("#newAltTextSave");
        await page.waitForSelector("#newAltTextDialog", { visible: false });

        telemetry = await page.evaluate(() => window.telemetry);
        saveTelemetry = telemetry.find(
          details => details.data.action === "pdfjs.image.alt_text.user_edit"
        );
        expect(saveTelemetry.data.data)
          .withContext(`In ${browserName}`)
          .toEqual({
            total_words: 3,
            words_removed: 0,
            words_added: 1,
          });
      }
    });
  });

  describe("New alt-text flow (bug 1920515)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        {
          eventBusSetup: eventBus => {
            eventBus.on("annotationeditoruimanager", ({ uiManager }) => {
              window.uiManager = uiManager;
            });
          },
        },
        {
          enableAltText: false,
          enableFakeMLManager: false,
          enableUpdatedAddImage: true,
          enableGuessAltText: true,
        }
      );
    });

    afterEach(async () => {
      for (const [, page] of pages) {
        if (await isVisible(page, "#newAltTextDialog")) {
          await page.keyboard.press("Escape");
          await page.waitForSelector("#newAltTextDisclaimer", {
            visible: false,
          });
        }
        await page.evaluate(() => {
          window.uiManager.reset();
        });
        // Disable editing mode.
        await switchToStamp(page, /* disable */ true);
      }
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the toggle button isn't displayed when there is no AI", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        // Add an image.
        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog.noAi", { visible: true });

        // enableFakeMLManager is false, so it means that we don't have ML but
        // we're using the new flow, hence we don't want to have the toggle
        // button.
        await page.waitForSelector("#newAltTextCreateAutomatically", {
          hidden: true,
        });
      }
    });
  });

  describe("No auto-resize", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 67);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a stamp editor isn't resizing itself", async () => {
      // Run sequentially to avoid clipboard issues.
      const editorSelector = getEditorSelector(0);

      for (const [, page] of pages) {
        await switchToStamp(page);

        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);
      }

      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const getDims = () =>
            page.evaluate(sel => {
              const bbox = document.querySelector(sel).getBoundingClientRect();
              return `${bbox.width}::${bbox.height}`;
            }, editorSelector);
          const initialDims = await getDims();
          for (let i = 0; i < 50; i++) {
            // We want to make sure that the editor doesn't resize itself, so we
            // check every 10ms that the dimensions are the same.

            // eslint-disable-next-line no-restricted-syntax
            await waitForTimeout(10);

            const dims = await getDims();
            expect(dims).withContext(`In ${browserName}`).toEqual(initialDims);
          }
        })
      );
    });
  });

  describe("A stamp musn't be on top of the secondary toolbar", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 600);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a stamp editor isn't on top of the secondary toolbar", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/red.png", editorSelector);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);
      }

      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const debug = false;

          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar", { visible: true });
          const secondary = await page.$("#secondaryToolbar");
          const png = await secondary.screenshot({
            type: "png",
            path: debug ? `foo.png` : "",
          });
          const secondaryImage = PNG.sync.read(Buffer.from(png));
          const buffer = new Uint32Array(secondaryImage.data.buffer);
          expect(buffer.every(x => x === 0xff0000ff))
            .withContext(`In ${browserName}`)
            .toBeFalse();
        })
      );
    });
  });

  describe("Stamp (move existing)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("stamps.pdf", getAnnotationSelector("25R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move an annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const modeChangedHandle = await waitForAnnotationModeChanged(page);
          await page.click(getAnnotationSelector("25R"), { count: 2 });
          await awaitPromise(modeChangedHandle);
          const editorSelector = getEditorSelector(0);
          await waitForSelectedEditor(page, editorSelector);

          const editorIds = await getEditors(page, "stamp");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(5);

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          const serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          // Select the annotation we want to move.
          await selectEditor(page, editorSelector);

          await dragAndDrop(page, editorSelector, [[100, 100]]);
          await waitForSerialized(page, 1);
        })
      );
    });
  });

  describe("Stamp (change alt-text)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("stamps.pdf", getAnnotationSelector("58R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must update an existing alt-text", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const modeChangedHandle = await waitForAnnotationModeChanged(page);
          await page.click(getAnnotationSelector("58R"), { count: 2 });
          await awaitPromise(modeChangedHandle);
          const editorSelector = getEditorSelector(4);
          await waitForSelectedEditor(page, editorSelector);

          const editorIds = await getEditors(page, "stamp");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(5);

          await page.click(`${editorSelector} button.altText`);
          await page.waitForSelector("#altTextDialog", { visible: true });

          const textareaSelector = "#altTextDialog textarea";
          await page.waitForFunction(
            sel => document.querySelector(sel).value !== "",
            {},
            textareaSelector
          );

          const altText = await page.evaluate(
            sel => document.querySelector(sel).value,
            textareaSelector
          );
          expect(altText).toEqual("An elephant");

          await page.evaluate(sel => {
            document.querySelector(sel).value = "";
          }, textareaSelector);

          await page.click(textareaSelector);
          await page.type(textareaSelector, "Hello World");

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          const serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          const saveButtonSelector = "#altTextDialog #altTextSave";
          await page.click(saveButtonSelector);

          await waitForSerialized(page, 1);
        })
      );
    });
  });

  describe("Stamp (delete existing and undo)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("stamps.pdf", getAnnotationSelector("37R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the annotation is correctly restored", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const modeChangedHandle = await waitForAnnotationModeChanged(page);
          await page.click(getAnnotationSelector("37R"), { count: 2 });
          await awaitPromise(modeChangedHandle);
          const editorSelector = getEditorSelector(2);
          await waitForSelectedEditor(page, editorSelector);

          const editorIds = await getEditors(page, "stamp");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(5);

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          let serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);

          await waitForSerialized(page, 1);
          serialized = await getSerialized(page);
          expect(serialized)
            .withContext(`In ${browserName}`)
            .toEqual([
              { id: "37R", deleted: true, pageIndex: 0, popupRef: "44R" },
            ]);

          await kbUndo(page);
          await waitForSerialized(page, 0);

          await waitForSelectedEditor(page, editorSelector);
        })
      );
    });
  });

  describe("Drag a stamp annotation and click on a touchscreen", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the annotation isn't unselected when an other finger taps on the screen", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToStamp(page);

        const editorSelector = getEditorSelector(0);
        await copyImage(page, "../images/firefox_logo.png", editorSelector);
        const stampRect = await getRect(page, editorSelector);

        await page.touchscreen.tap(stampRect.x + 10, stampRect.y + 10);
        await waitForSelectedEditor(page, editorSelector);

        await page.touchscreen.touchStart(stampRect.x + 10, stampRect.y + 10);
        await page.touchscreen.touchMove(stampRect.x + 20, stampRect.y + 20);
        await page.touchscreen.tap(stampRect.x - 10, stampRect.y - 10);
        await page.touchscreen.touchEnd();

        await waitForSelectedEditor(page, editorSelector);
      }
    });
  });

  describe("Undo deletion popup has the expected behaviour", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that deleting an image can be undone using the undo button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);

          const editorSelector = getEditorSelector(0);
          await copyImage(page, "../images/firefox_logo.png", editorSelector);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForSelector("#editorUndoBar:not([hidden])");

          await page.click("#editorUndoBarUndoButton");
          await waitForSerialized(page, 1);
          await page.waitForSelector(editorSelector);
          await page.waitForSelector(`${editorSelector} canvas`);
        })
      );
    });

    it("must check that the undo deletion popup displays the correct message", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);

          const editorSelector = getEditorSelector(0);
          await copyImage(page, "../images/firefox_logo.png", editorSelector);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForFunction(() => {
            const messageElement = document.querySelector(
              "#editorUndoBarMessage"
            );
            return messageElement && messageElement.textContent.trim() !== "";
          });
          const message = await page.waitForSelector("#editorUndoBarMessage");
          const messageText = await page.evaluate(
            el => el.textContent,
            message
          );
          expect(messageText).toContain("Image removed");
        })
      );
    });

    it("must check that the popup disappears when a new image is inserted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);

          const editorSelector = getEditorSelector(0);
          await copyImage(page, "../images/firefox_logo.png", editorSelector);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForSelector("#editorUndoBar:not([hidden])");
          await page.click("#editorStampAddImage");
          const newInput = await page.$("#stampEditorFileInput");
          await newInput.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );
          await waitForImage(page, getEditorSelector(1));
          await waitForSerialized(page, 1);
          await page.waitForSelector("#editorUndoBar", { hidden: true });
        })
      );
    });
  });

  describe("Switch to edit mode a pdf with an existing stamp annotation on an invisible and rendered page", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue19239.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move on the second page", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          const pageOneSelector = `.page[data-page-number = "1"]`;
          const pageTwoSelector = `.page[data-page-number = "2"]`;
          await scrollIntoView(page, pageTwoSelector);
          await page.waitForSelector(pageOneSelector, { visible: false });

          await switchToStamp(page);
          await scrollIntoView(page, pageOneSelector);
          await page.waitForSelector(
            `${pageOneSelector} .annotationEditorLayer canvas`,
            { visible: true }
          );
        })
      );
    });
  });

  describe("Switch to edit mode a pdf with an existing stamp annotation on an invisible and unrendered page", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue19239.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move on the last page", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          const twoToFourteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of twoToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
          }

          await switchToStamp(page);

          const thirteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
          for (const pageNumber of thirteenToOne) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] .annotationEditorLayer canvas`,
            { visible: true }
          );
        })
      );
    });
  });

  describe("Switch to edit mode by double clicking on an existing stamp annotation", () => {
    const annotationSelector = getAnnotationSelector("999R");

    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue19239.pdf", annotationSelector);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must switch to edit mode", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await page.waitForSelector(annotationSelector);
          await scrollIntoView(page, annotationSelector);

          await page.click(annotationSelector, { count: 2 });

          await page.waitForFunction(() =>
            document
              .querySelector(".annotationEditorLayer")
              .classList.contains("stampEditing")
          );
        })
      );
    });
  });
});
