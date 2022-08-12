/* Copyright 2020 Mozilla Foundation
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

exports.loadAndWait = (filename, selector) =>
  Promise.all(
    global.integrationSessions.map(async session => {
      const page = await session.browser.newPage();

      // In order to avoid errors because of checks which depend on
      // a locale.
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "language", {
          get() {
            return "en-US";
          },
        });
        Object.defineProperty(navigator, "languages", {
          get() {
            return ["en-US", "en"];
          },
        });
      });

      await page.goto(
        `${global.integrationBaseUrl}?file=/test/pdfs/${filename}`
      );
      await page.bringToFront();
      await page.waitForSelector(selector, {
        timeout: 0,
      });
      return [session.name, page];
    })
  );

exports.closePages = pages =>
  Promise.all(
    pages.map(async ([_, page]) => {
      await page.close();
    })
  );

exports.clearInput = async (page, selector) => {
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
};

function getSelector(id) {
  return `[data-element-id="${id}"]`;
}
exports.getSelector = getSelector;

function getQuerySelector(id) {
  return `document.querySelector('${getSelector(id)}')`;
}
exports.getQuerySelector = getQuerySelector;

function getComputedStyleSelector(id) {
  return `getComputedStyle(${getQuerySelector(id)})`;
}
exports.getComputedStyleSelector = getComputedStyleSelector;
exports.getEditorSelector = n => `#pdfjs_internal_editor_${n}`;

function getSelectedEditors(page) {
  return page.evaluate(() => {
    const elements = document.querySelectorAll(".selectedEditor");
    const results = [];
    for (const { id } of elements) {
      results.push(parseInt(id.split("_").at(-1)));
    }
    results.sort();
    return results;
  });
}
exports.getSelectedEditors = getSelectedEditors;
