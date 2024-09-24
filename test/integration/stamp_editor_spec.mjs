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
  clearInput,
  closePages,
  copy,
  copyToClipboard,
  getEditorDimensions,
  getEditorSelector,
  getFirstSerialized,
  getRect,
  getSerialized,
  isVisible,
  kbBigMoveDown,
  kbBigMoveRight,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  paste,
  pasteFromClipboard,
  scrollIntoView,
  serializeBitmapDimensions,
  switchToEditor,
  waitForAnnotationEditorLayer,
  waitForEntryInStorage,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
  waitForUnselectedEditor,
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

  await copyToClipboard(page, { "image/png": `data:image/png;base64,${data}` });
  await pasteFromClipboard(page);

  await waitForImage(page, getEditorSelector(number));
};

const switchToStamp = switchToEditor.bind(null, "Stamp");

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
          await switchToStamp(page);
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
          expect(Math.abs(bitmap.width - 242 * ratio) < 1).toBeTrue();
          expect(Math.abs(bitmap.height - 80 * ratio) < 1).toBeTrue();

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

        await copyImage(page1, "../images/firefox_logo.png", 0);
        await copy(page1);

        const [, page2] = pages2[i];
        await page2.bringToFront();
        await switchToStamp(page2);

        await paste(page2);

        await waitForImage(page2, getEditorSelector(0));
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
        const selector = getEditorSelector(0);

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(selector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${selector} button.delete`);
        await page.click(`${selector} button.delete`);
        await waitForSerialized(page, 0);

        await kbUndo(page);
        await waitForSerialized(page, 1);
        await page.waitForSelector(`${selector} canvas`);
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
        const selector = getEditorSelector(0);

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(selector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${selector} button.delete`);
        await page.click(`${selector} button.delete`);
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

        await page.waitForSelector(`${selector} canvas`);
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
        const selector = getEditorSelector(0);

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(selector);
        await waitForSerialized(page, 1);

        await page.waitForSelector(`${selector} button.delete`);
        await page.click(`${selector} button.delete`);
        await waitForSerialized(page, 0);

        const twoToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
          Array.from(new Array(13).keys(), n => 13 - n)
        );
        for (const pageNumber of twoToOne) {
          const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
          await scrollIntoView(page, pageSelector);
        }

        await kbUndo(page);
        await waitForSerialized(page, 1);
        await page.waitForSelector(`${selector} canvas`);
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

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(getEditorSelector(0));
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

        const canvasRect = await getRect(
          page,
          `${getEditorSelector(0)} canvas`
        );
        const stampRect = await getRect(page, getEditorSelector(0));

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

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(getEditorSelector(0));
        await waitForSerialized(page, 1);

        const canvasRect = await getRect(
          page,
          `${getEditorSelector(0)} canvas`
        );
        const stampRect = await getRect(page, getEditorSelector(0));

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

        await copyImage(page, "../images/firefox_logo.png", 0);
        await page.waitForSelector(getEditorSelector(0));
        await waitForSerialized(page, 1);
        await applyFunctionToEditor(page, "pdfjs_internal_editor_0", editor => {
          editor.altTextData = {
            altText: "Hello World",
            decorative: false,
          };
        });
        await page.waitForSelector(`${getEditorSelector(0)} .altText.done`);

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
        await copyImage(page, "../images/firefox_logo.png", 0);
        const editorSelector = getEditorSelector(0);
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
            "Fake alt text"`
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
        await page.keyboard.press("Escape");
        await waitForUnselectedEditor(page, editorSelector);
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
        await page.keyboard.press("Escape");
        await waitForUnselectedEditor(page, editorSelector);
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
        await copyImage(page, "../images/firefox_logo.png", 0);
        const editorSelector = getEditorSelector(0);
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
        await copyImage(page, "../images/firefox_logo.png", 0);
        const editorSelector = getEditorSelector(0);
        await page.waitForSelector(editorSelector);
        await waitForSerialized(page, 1);

        // Wait for the dialog to be visible.
        await page.waitForSelector("#newAltTextDialog", { visible: true });

        // Check we haven't the disclaimer.
        await page.waitForSelector("#newAltTextDisclaimer[hidden]");
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
        await copyImage(page, "../images/firefox_logo.png", 0);
        const editorSelector = getEditorSelector(0);
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

        await copyImage(page, "../images/firefox_logo.png", 0);
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
});
