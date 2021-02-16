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
