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
  clearInput,
  closePages,
  createPromise,
  dragAndDrop,
  getEditorSelector,
  getRect,
  highlightSpan,
  kbModifierDown,
  kbModifierUp,
  loadAndWait,
  scrollIntoView,
  selectEditor,
  switchToEditor,
  waitAndClick,
  waitForSerialized,
  waitForTimeout,
} from "./test_utils.mjs";

const switchToHighlight = switchToEditor.bind(null, "Highlight");
const switchToStamp = switchToEditor.bind(null, "Stamp");
const switchToComment = switchToEditor.bind(null, "Comment");
const switchToFreeText = switchToEditor.bind(null, "FreeText");

const editComment = async (page, editorSelector, comment) => {
  const commentButtonSelector = `${editorSelector} button.comment`;
  await waitAndClick(page, commentButtonSelector);

  const textInputSelector = "#commentManagerTextInput";
  await page.waitForSelector(textInputSelector, {
    visible: true,
  });
  await page.type(textInputSelector, comment);
  await waitAndClick(page, "#commentManagerSaveButton");
  await page.waitForSelector("#commentManagerDialog", {
    visible: false,
  });
};

describe("Comment", () => {
  describe("Comment edit dialog must be visible in ltr", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1989304.pdf",
        ".annotationEditorLayer",
        "page-width",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must set the comment dialog in the viewport (LTR)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          await scrollIntoView(page, ".textLayer span:last-of-type");
          await highlightSpan(page, 1, "...");
          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerDialog", {
            visible: true,
          });
          const dialogRect = await getRect(page, "#commentManagerDialog");
          const viewport = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          }));
          expect(dialogRect.x + dialogRect.width)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.width + 1);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height + 1);
        })
      );
    });
  });

  describe("Comment edit dialog must be visible in rtl", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1989304.pdf",
        ".annotationEditorLayer",
        "page-width",
        null,
        { enableComment: true, localeProperties: "ar" }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must set the comment dialog in the viewport (RTL)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          await scrollIntoView(page, ".textLayer span:nth-of-type(4)");
          await highlightSpan(page, 1, "World");
          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerDialog", {
            visible: true,
          });
          const dialogRect = await getRect(page, "#commentManagerDialog");
          const viewport = await page.evaluate(() => ({
            height: window.innerHeight,
          }));
          expect(dialogRect.x + dialogRect.width)
            .withContext(`In ${browserName}`)
            .toBeGreaterThanOrEqual(-1);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height + 1);
        })
      );
    });
  });

  describe("Update comment position and color in reading mode", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "comments.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        {
          enableComment: true,
          highlightEditorColors:
            "yellow=#FFFF00,green=#00FF00,blue=#0000FF,pink=#FF00FF,red=#FF0000",
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must set the comment button at the right place", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToStamp(page);

          const stampSelector = getEditorSelector(8);
          await selectEditor(page, stampSelector);
          await dragAndDrop(page, stampSelector, [[100, 100]]);
          await waitForSerialized(page, 1);
          const rectCommentButton = await getRect(
            page,
            `${stampSelector} .annotationCommentButton`
          );

          await switchToStamp(page, /* disable = */ true);
          const rectCommentButtonAfter = await getRect(
            page,
            `#pdfjs_internal_id_713R + .annotationCommentButton`
          );

          expect(Math.abs(rectCommentButtonAfter.x - rectCommentButton.x))
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(1);
          expect(Math.abs(rectCommentButtonAfter.y - rectCommentButton.y))
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(1);
          expect(
            Math.abs(rectCommentButtonAfter.width - rectCommentButton.width)
          )
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(1);
          expect(
            Math.abs(rectCommentButtonAfter.height - rectCommentButton.height)
          )
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(1);
        })
      );
    });

    it("must set the right color to the comment button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const highlightSelector = getEditorSelector(0);
          await selectEditor(page, highlightSelector);
          const colorButtonSelector = `${highlightSelector} .editToolbar button`;
          await page.waitForSelector(`${colorButtonSelector}.colorPicker`);
          await page.click(`${colorButtonSelector}.colorPicker`);
          await page.waitForSelector(`${colorButtonSelector}[title = "Red"]`);
          await page.click(`${colorButtonSelector}[title = "Red"]`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FF0000"]`
          );

          const commentButtonColor = await page.evaluate(selector => {
            const button = document.querySelector(
              `${selector} .annotationCommentButton`
            );
            return window.getComputedStyle(button).backgroundColor;
          }, highlightSelector);

          await switchToHighlight(page, /* disable = */ true);

          const commentButtonColorAfter = await page.evaluate(() => {
            const button = document.querySelector(
              "section[data-annotation-id='612R'] + .annotationCommentButton"
            );
            return window.getComputedStyle(button).backgroundColor;
          });

          expect(commentButtonColorAfter)
            .withContext(`In ${browserName}`)
            .toEqual(commentButtonColor);
        })
      );
    });
  });

  describe("Comment buttons", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the comment button has a title", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Languages");

          let commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await page.waitForSelector(commentButtonSelector, { visible: true });
          let title = await page.evaluate(
            selector => document.querySelector(selector).title,
            commentButtonSelector
          );
          expect(title).withContext(`In ${browserName}`).toEqual("Add comment");
          await page.click(commentButtonSelector);

          const textInputSelector = "#commentManagerTextInput";
          await page.waitForSelector(textInputSelector, {
            visible: true,
          });
          await page.type(textInputSelector, "Hello world!");

          await page.click("#commentManagerSaveButton");

          commentButtonSelector = `${getEditorSelector(0)} button.annotationCommentButton`;
          await page.waitForSelector(commentButtonSelector, {
            visible: true,
          });
          title = await page.evaluate(selector => {
            const button = document.querySelector(selector);
            return button.title;
          }, commentButtonSelector);
          expect(title)
            .withContext(`In ${browserName}`)
            .toEqual("Show comment");
        })
      );
    });

    it("must check that the comment button is added in the annotation layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");

          const comment = "Hello world!";
          await editComment(page, getEditorSelector(0), comment);
          await page.hover("#editorHighlightButton");
          let buttonSelector =
            ".annotationEditorLayer .annotationCommentButton";
          await page.waitForSelector(buttonSelector, { visible: true });
          await page.hover(buttonSelector);
          const popupSelector = "#commentPopup";
          await page.waitForSelector(popupSelector, {
            visible: true,
          });
          let popupText = await page.evaluate(
            selector => document.querySelector(selector).textContent,
            `${popupSelector} .commentPopupText`
          );
          expect(popupText).withContext(`In ${browserName}`).toEqual(comment);

          await page.hover("#editorHighlightButton");
          await switchToHighlight(page, /* disable = */ true);

          buttonSelector = ".annotationLayer .annotationCommentButton";
          await page.waitForSelector(buttonSelector, {
            visible: true,
          });
          await page.hover(buttonSelector);

          await page.waitForSelector(popupSelector, {
            visible: true,
          });
          popupText = await page.evaluate(
            selector => document.querySelector(selector).textContent,
            `${popupSelector} .commentPopupText`
          );
          expect(popupText).withContext(`In ${browserName}`).toEqual(comment);
        })
      );
    });

    it("must check that the button is removed in the annotation layer", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await switchToHighlight(page);

          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Hello world!");

          await switchToHighlight(page, /* disable = */ true);
          const buttonSelector = ".annotationLayer .annotationCommentButton";
          await page.waitForSelector(buttonSelector, {
            visible: true,
          });

          await switchToHighlight(page);
          await selectEditor(page, editorSelector);
          await waitAndClick(page, `${editorSelector} button.deleteButton`);
          await waitForSerialized(page, 0);

          await switchToHighlight(page, /* disable = */ true);
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            buttonSelector
          );
        })
      );
    });
  });

  describe("Focused element after editing", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        "page-width",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the focus is moved on the comment button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Languages");

          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerCancelButton", {
            visible: true,
          });
          const handle = await createPromise(page, resolve => {
            document
              .querySelector("button.comment")
              .addEventListener("focus", resolve, { once: true });
          });
          await page.click("#commentManagerCancelButton");
          await awaitPromise(handle);

          await waitAndClick(page, commentButtonSelector);

          const textInputSelector = "#commentManagerTextInput";
          await page.waitForSelector(textInputSelector, {
            visible: true,
          });
          await page.type(textInputSelector, "Hello world!");

          await page.click("#commentManagerSaveButton");
          await page.waitForSelector("button.annotationCommentButton", {
            visible: true,
          });

          await page.waitForFunction(
            sel => document.activeElement === document.querySelector(sel),
            {},
            "button.annotationCommentButton"
          );
        })
      );
    });
  });

  describe("Focused element after editing in reading mode", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "comments.pdf",
        ".annotationLayer",
        "page-width",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the focus is moved on the comment button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const commentButtonSelector = `[data-annotation-id="612R"] + button.annotationCommentButton`;
          await waitAndClick(page, commentButtonSelector);
          const commentPopupSelector = "#commentPopup";
          const editButtonSelector = `${commentPopupSelector} button.commentPopupEdit`;
          await waitAndClick(page, editButtonSelector);

          await page.waitForSelector("#commentManagerCancelButton", {
            visible: true,
          });
          let handle = await createPromise(page, resolve => {
            document
              .querySelector(
                `[data-annotation-id="612R"] + button.annotationCommentButton`
              )
              .addEventListener("focus", resolve, { once: true });
          });
          await page.click("#commentManagerCancelButton");
          await awaitPromise(handle);

          await waitAndClick(page, commentButtonSelector);
          await waitAndClick(page, editButtonSelector);

          const textInputSelector = "#commentManagerTextInput";
          await page.waitForSelector(textInputSelector, {
            visible: true,
          });
          await page.type(textInputSelector, "Hello world!");

          handle = await createPromise(page, resolve => {
            document
              .querySelector(
                `[data-annotation-id="612R"] + button.annotationCommentButton`
              )
              .addEventListener("focus", resolve, { once: true });
          });
          await page.click("#commentManagerSaveButton");
          await awaitPromise(handle);
        })
      );
    });
  });

  describe("Comment sidebar", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "comments.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the comment sidebar is resizable", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToComment(page);

          const sidebarSelector = "#editorCommentParamsToolbar";
          for (const extraWidth of [100, -100]) {
            const rect = await getRect(page, sidebarSelector);
            const resizerRect = await getRect(
              page,
              "#editorCommentsSidebarResizer"
            );
            const startX = resizerRect.x + resizerRect.width / 2;
            const startY = resizerRect.y + 2;
            await page.mouse.move(startX, startY);
            await page.mouse.down();

            const steps = 20;
            await page.mouse.move(startX - extraWidth, startY, { steps });
            await page.mouse.up();

            const rectAfter = await getRect(page, sidebarSelector);
            expect(Math.abs(rectAfter.width - (rect.width + extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
            expect(Math.abs(rectAfter.x - (rect.x - extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
          }
        })
      );
    });

    it("must check that the comment sidebar is resizable with the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToComment(page);

          const sidebarSelector = "#editorCommentParamsToolbar";
          const handle = await createPromise(page, resolve => {
            document
              .getElementById("editorCommentsSidebarResizer")
              .addEventListener("focus", () => resolve(), { once: true });
          });
          await page.focus(`${sidebarSelector} #editorCommentsSidebarResizer`);
          await awaitPromise(handle);

          // Use Ctrl+ArrowLeft/Right to resize the sidebar.
          for (const extraWidth of [10, -10]) {
            const rect = await getRect(page, sidebarSelector);
            const arrowKey = extraWidth > 0 ? "ArrowLeft" : "ArrowRight";
            for (let i = 0; i < Math.abs(extraWidth); i++) {
              await kbModifierDown(page);
              await page.keyboard.press(arrowKey);
              await kbModifierUp(page);
            }

            const rectAfter = await getRect(page, sidebarSelector);
            expect(Math.abs(rectAfter.width - (rect.width + 10 * extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
            expect(Math.abs(rectAfter.x - (rect.x - 10 * extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
          }

          // Use ArrowLeft/Right to resize the sidebar.
          for (const extraWidth of [10, -10]) {
            const rect = await getRect(page, sidebarSelector);
            const arrowKey = extraWidth > 0 ? "ArrowLeft" : "ArrowRight";
            for (let i = 0; i < Math.abs(extraWidth); i++) {
              await page.keyboard.press(arrowKey);
            }

            const rectAfter = await getRect(page, sidebarSelector);
            expect(Math.abs(rectAfter.width - (rect.width + extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
            expect(Math.abs(rectAfter.x - (rect.x - extraWidth)))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
          }
        })
      );
    });

    it("must check that comments are in chronological order", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToComment(page);

          const checkDates = async () => {
            const dates = await page.evaluate(() =>
              Array.from(
                document.querySelectorAll(
                  `#editorCommentParamsToolbar ul > li > time`
                )
              ).map(time => new Date(time.getAttribute("datetime")))
            );
            for (let i = 0; i < dates.length - 1; i++) {
              expect(dates[i])
                .withContext(`In ${browserName}`)
                .toBeGreaterThanOrEqual(dates[i + 1]);
            }
          };
          await checkDates();

          // Add an highlight with a comment and check the order again.
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Languages");
          const editorSelector = getEditorSelector(9);
          const commentButtonSelector = `${editorSelector} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          const textInputSelector = "#commentManagerTextInput";
          await page.waitForSelector(textInputSelector, {
            visible: true,
          });
          await page.type(textInputSelector, "Hello world!");
          await page.click("#commentManagerSaveButton");
          await waitForSerialized(page, 1);

          await switchToComment(page);
          await checkDates();
        })
      );
    });

    it("must check that comments can be selected/unselected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToComment(page);

          const firstElementSelector =
            "#editorCommentsSidebarList li:first-child";
          await waitAndClick(page, firstElementSelector);
          const popupSelector = "#commentPopup";
          await page.waitForSelector(popupSelector, { visible: true });
          const popupTextSelector = `${popupSelector} .commentPopupText`;
          await page.waitForSelector(popupTextSelector, {
            visible: true,
          });
          const popupText = await page.evaluate(
            selector => document.querySelector(selector).textContent,
            popupTextSelector
          );
          expect(popupText)
            .withContext(`In ${browserName}`)
            .toEqual("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

          // Click again to unselect the comment.
          await waitAndClick(page, firstElementSelector);
          await page.waitForSelector(popupSelector, { visible: false });
        })
      );
    });
  });

  describe("Comment popup", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the popup is deleted when the editor is", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await switchToHighlight(page);

          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Hello world!");

          await waitAndClick(
            page,
            `${editorSelector} button.annotationCommentButton`
          );

          const popupSelector = "#commentPopup";
          await page.waitForSelector(popupSelector, { visible: true });
          await waitAndClick(page, `${editorSelector} button.deleteButton`);

          // Check that the popup is removed from the DOM.
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            popupSelector
          );
        })
      );
    });

    it("must check that the focus is moved on the editor once the popup is deleted", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await switchToHighlight(page);

          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Hello world!");

          await waitAndClick(
            page,
            `${editorSelector} button.annotationCommentButton`
          );

          const popupSelector = "#commentPopup";
          await page.waitForSelector(popupSelector, { visible: true });
          const handle = await page.evaluateHandle(
            sel => [
              new Promise(resolve => {
                document
                  .querySelector(sel)
                  .addEventListener("focusin", resolve, {
                    once: true,
                  });
              }),
            ],
            editorSelector
          );
          await waitAndClick(
            page,
            `${popupSelector} button.commentPopupDelete`
          );
          await awaitPromise(handle);
        })
      );
    });
  });

  describe("Annotations order in reading mode", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "comments.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the annotations are in the right order", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(
            page,
            1,
            "method provides cheap inter-procedural type specialization, and an"
          );
          await editComment(page, getEditorSelector(9), "Hello world!");

          await highlightSpan(page, 1, "Andreas Gal");
          await editComment(page, getEditorSelector(10), "Hello world!");

          await switchToHighlight(page, /* disable = */ true);
          await page.waitForSelector(
            ".annotationLayer section:nth-child(4).editorAnnotation"
          );

          const sectionIds = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                ".page[data-page-number='1'] .annotationLayer > section:not(.popupAnnotation)"
              ),
            ].map(el => el.id.split("_").pop())
          );
          expect(sectionIds).withContext(`In ${browserName}`).toEqual([
            "612R",
            "693R",
            "10", // shortcut for pdfjs_internal_id_pdfjs_internal_editor_10
            "687R",
            "690R",
            "713R",
            "9", // shortcut for pdfjs_internal_id_pdfjs_internal_editor_9
            "673R",
            "613R",
            "680R",
            "661R",
          ]);
        })
      );
    });
  });

  describe("Focus annotation after comment has been deleted (bug 1994738)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the annotation is focused", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Hello world!");

          await switchToHighlight(page, /* disable = */ true);
          await waitAndClick(page, ".annotationLayer .annotationCommentButton");

          const handle = await createPromise(page, resolve => {
            document
              .querySelector(".annotationLayer section.editorAnnotation")
              .addEventListener("focus", resolve, { once: true });
          });
          await waitAndClick(page, "button.commentPopupDelete");
          await awaitPromise(handle);
        })
      );
    });
  });

  describe("FreeText annotation doesn't have a popup (bug 1995028)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that comment button isn't in the annotation toolbar", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await page.keyboard.press("Escape");

          await page.waitForSelector(`${editorSelector} .editToolbar`, {
            visible: true,
          });

          // We want to be sure that the comment button isn't rendered.
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);

          const hasCommentButton = await page.evaluate(
            selector =>
              !!document.querySelector(
                `${selector} .editToolbar button.comment`
              ),
            editorSelector
          );
          expect(hasCommentButton).withContext(`In ${browserName}`).toBe(false);
        })
      );
    });
  });

  describe("Save a comment in using CTRL+Enter", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "comments.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the comment is saved", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const commentButtonSelector = `[data-annotation-id="612R"] + button.annotationCommentButton`;
          await waitAndClick(page, commentButtonSelector);
          const commentPopupSelector = "#commentPopup";
          const editButtonSelector = `${commentPopupSelector} button.commentPopupEdit`;
          await waitAndClick(page, editButtonSelector);

          const textInputSelector = "#commentManagerTextInput";
          await page.waitForSelector(textInputSelector, {
            visible: true,
          });
          await clearInput(page, textInputSelector, true);
          const comment = "Comment saved using CTRL+Enter";
          await page.type(textInputSelector, comment);
          await page.focus(textInputSelector);

          await page.keyboard.down("Control");
          await page.keyboard.press("Enter");
          await page.keyboard.up("Control");

          await page.waitForSelector("#commentManagerDialog", {
            visible: false,
          });

          await page.hover(commentButtonSelector);
          await page.waitForSelector(commentPopupSelector, {
            visible: true,
          });
          const popupTextSelector = `${commentPopupSelector} .commentPopupText`;
          const popupText = await page.evaluate(
            selector => document.querySelector(selector).textContent,
            popupTextSelector
          );
          expect(popupText).withContext(`In ${browserName}`).toEqual(comment);
        })
      );
    });
  });

  describe("Undo deletion popup for comments (bug 1999154)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        "page-fit",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that deleting a comment can be undone using the undo button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          const comment = "Test comment for undo";
          await editComment(page, editorSelector, comment);

          // Stay in highlight mode - don't disable it
          await waitAndClick(
            page,
            `${editorSelector} .annotationCommentButton`
          );

          await page.waitForSelector("#commentPopup", { visible: true });

          // Capture the date before deletion
          const dateBefore = await page.evaluate(
            () =>
              document.querySelector("#commentPopup .commentPopupTime")
                ?.textContent
          );

          await waitAndClick(page, "button.commentPopupDelete");

          await page.waitForSelector("#editorUndoBar", { visible: true });
          await page.waitForSelector("#editorUndoBarUndoButton", {
            visible: true,
          });
          await page.click("#editorUndoBarUndoButton");

          // Check that the comment is restored by hovering to show the popup
          await page.hover(`${editorSelector} .annotationCommentButton`);
          await page.waitForSelector("#commentPopup", { visible: true });
          const popupText = await page.evaluate(
            () =>
              document.querySelector("#commentPopup .commentPopupText")
                ?.textContent
          );
          expect(popupText).withContext(`In ${browserName}`).toEqual(comment);

          // Check that the date is preserved
          const dateAfter = await page.evaluate(
            () =>
              document.querySelector("#commentPopup .commentPopupTime")
                ?.textContent
          );
          expect(dateAfter)
            .withContext(`In ${browserName}`)
            .toEqual(dateBefore);
        })
      );
    });

    it("must check that the undo deletion popup displays 'Comment removed' message", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Test comment");

          // Stay in highlight mode - don't disable it
          await waitAndClick(
            page,
            `${editorSelector} .annotationCommentButton`
          );

          await page.waitForSelector("#commentPopup", { visible: true });
          await waitAndClick(page, "button.commentPopupDelete");

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
          expect(messageText)
            .withContext(`In ${browserName}`)
            .toContain("Comment removed");
        })
      );
    });

    it("must check that the undo bar closes when clicking the close button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          await editComment(page, editorSelector, "Test comment");

          // Stay in highlight mode - don't disable it
          await waitAndClick(
            page,
            `${editorSelector} .annotationCommentButton`
          );

          await page.waitForSelector("#commentPopup", { visible: true });
          await waitAndClick(page, "button.commentPopupDelete");

          await page.waitForSelector("#editorUndoBar", { visible: true });
          await waitAndClick(page, "#editorUndoBarCloseButton");
          await page.waitForSelector("#editorUndoBar", { hidden: true });
        })
      );
    });

    it("must check that deleting a comment can be undone using Ctrl+Z", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          await highlightSpan(page, 1, "Abstract");
          const editorSelector = getEditorSelector(0);
          const comment = "Test comment for Ctrl+Z undo";
          await editComment(page, editorSelector, comment);

          // Stay in highlight mode - don't disable it
          await waitAndClick(
            page,
            `${editorSelector} .annotationCommentButton`
          );

          await page.waitForSelector("#commentPopup", { visible: true });
          await waitAndClick(page, "button.commentPopupDelete");

          await page.waitForSelector("#editorUndoBar", { visible: true });

          // Use Ctrl+Z to undo
          await kbModifierDown(page);
          await page.keyboard.press("z");
          await kbModifierUp(page);

          // The undo bar should be hidden after undo
          await page.waitForSelector("#editorUndoBar", { hidden: true });

          // Check that the comment is restored by hovering to show the popup
          await page.hover(`${editorSelector} .annotationCommentButton`);
          await page.waitForSelector("#commentPopup", { visible: true });
          const popupText = await page.evaluate(
            () =>
              document.querySelector("#commentPopup .commentPopupText")
                ?.textContent
          );
          expect(popupText).withContext(`In ${browserName}`).toEqual(comment);
        })
      );
    });
  });
});
