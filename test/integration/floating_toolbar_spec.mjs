/* Copyright 2026 Mozilla Foundation
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
  closePages,
  getRect,
  getSpanRectFromText,
  loadAndWait,
} from "./test_utils.mjs";

async function selectTextAndShowToolbar(page, pageNumber, text) {
  const rect = await getSpanRectFromText(page, pageNumber, text);
  const x = rect.x + rect.width * 0.5;
  const y = rect.y + rect.height * 0.5;
  await page.mouse.click(x, y, { count: 2, delay: 400 });
  await page.waitForSelector(".editToolbar", { timeout: 2000 });
  return rect;
}

function expectToolbarWithinPage(browserName, toolbarBounds, pageBounds) {
  expect(toolbarBounds.x)
    .withContext(
      `In ${browserName}: Toolbar should not be cut off at the left of the page`
    )
    .toBeGreaterThanOrEqual(pageBounds.x);

  expect(toolbarBounds.x + toolbarBounds.width)
    .withContext(
      `In ${browserName}: Toolbar should not be cut off at the right of the page`
    )
    .toBeLessThanOrEqual(pageBounds.x + pageBounds.width);

  expect(toolbarBounds.y)
    .withContext(
      `In ${browserName}: Toolbar should not be cut off at the top of the page`
    )
    .toBeGreaterThanOrEqual(pageBounds.y);

  expect(toolbarBounds.y + toolbarBounds.height)
    .withContext(
      `In ${browserName}: Toolbar should not be cut off at the bottom of the page`
    )
    .toBeLessThanOrEqual(pageBounds.y + pageBounds.height);
}

function expectToolbarBelowText(browserName, toolbarBounds, textRect) {
  expect(toolbarBounds.y)
    .withContext(`In ${browserName}: Toolbar should be shown below the text`)
    .toBeGreaterThanOrEqual(textRect.y + textRect.height);
}

function expectToolbarAboveText(browserName, toolbarBounds, textRect) {
  expect(toolbarBounds.y + toolbarBounds.height)
    .withContext(`In ${browserName}: Toolbar should be shown above the text`)
    .toBeLessThanOrEqual(textRect.y);
}

describe("Floating Toolbar Positioning", () => {
  describe("Toolbar positioning with text selection", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "floating-toolbar-positioning.pdf",
        ".textLayer"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must show the toolbar below the text and inside the page when selecting BR", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const textRect = await selectTextAndShowToolbar(page, 1, "BR");
          const toolbarBounds = await getRect(page, ".editToolbar");
          const pageBounds = await getRect(page, '.page[data-page-number="1"]');

          expectToolbarWithinPage(browserName, toolbarBounds, pageBounds);
          expectToolbarBelowText(browserName, toolbarBounds, textRect);
        })
      );
    });

    it("must show the toolbar below the text and inside the page when selecting BL", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const textRect = await selectTextAndShowToolbar(page, 1, "BL");
          const toolbarBounds = await getRect(page, ".editToolbar");
          const pageBounds = await getRect(page, '.page[data-page-number="1"]');

          expectToolbarWithinPage(browserName, toolbarBounds, pageBounds);
          expectToolbarBelowText(browserName, toolbarBounds, textRect);
        })
      );
    });

    it("must show the toolbar above the text and inside the page when selecting TR", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const textRect = await selectTextAndShowToolbar(page, 1, "TR");
          const toolbarBounds = await getRect(page, ".editToolbar");
          const pageBounds = await getRect(page, '.page[data-page-number="1"]');

          expectToolbarWithinPage(browserName, toolbarBounds, pageBounds);
          expectToolbarAboveText(browserName, toolbarBounds, textRect);
        })
      );
    });

    it("must show the toolbar above the text and inside the page when selecting TL", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const textRect = await selectTextAndShowToolbar(page, 1, "TL");
          const toolbarBounds = await getRect(page, ".editToolbar");
          const pageBounds = await getRect(page, '.page[data-page-number="1"]');

          expectToolbarWithinPage(browserName, toolbarBounds, pageBounds);
          expectToolbarAboveText(browserName, toolbarBounds, textRect);
        })
      );
    });
  });
});
