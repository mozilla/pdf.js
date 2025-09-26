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
  createPromise,
  dragAndDrop,
  getEditorSelector,
  getRect,
  getSpanRectFromText,
  loadAndWait,
  scrollIntoView,
  selectEditor,
  switchToEditor,
  waitAndClick,
  waitForSerialized,
} from "./test_utils.mjs";

const switchToHighlight = switchToEditor.bind(null, "Highlight");
const switchToStamp = switchToEditor.bind(null, "Stamp");
const switchToComment = switchToEditor.bind(null, "Comment");

const highlightSpan = async (page, pageIndex, text) => {
  const rect = await getSpanRectFromText(page, pageIndex, text);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await page.mouse.click(x, y, { count: 2, delay: 100 });
  await page.waitForSelector(getEditorSelector(0));
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
          const rect = await getSpanRectFromText(page, 1, "...");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          // Here and elsewhere, we add a small delay between press and release
          // to make sure that a pointerup event is triggered after
          // selectionchange.
          // It works with a value of 1ms, but we use 100ms to be sure.
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

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
            .toBeLessThanOrEqual(viewport.width);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height);
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
          const rect = await getSpanRectFromText(page, 1, "World");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerDialog", {
            visible: true,
          });
          const dialogRect = await getRect(page, "#commentManagerDialog");
          const viewport = await page.evaluate(() => ({
            height: document.documentElement.clientHeight,
          }));
          expect(dialogRect.x + dialogRect.width)
            .withContext(`In ${browserName}`)
            .toBeGreaterThanOrEqual(0);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height);
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
        "page-width",
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

          const rect = await getSpanRectFromText(page, 1, "Languages");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

          let commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await page.waitForSelector(commentButtonSelector, { visible: true });
          let title = await page.evaluate(
            selector => document.querySelector(selector).title,
            commentButtonSelector
          );
          expect(title)
            .withContext(`In ${browserName}`)
            .toEqual("Edit comment");
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

          const rect = await getSpanRectFromText(page, 1, "Languages");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

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
        "page-width",
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
          await page.waitForSelector(editorSelector);
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
  });
});
