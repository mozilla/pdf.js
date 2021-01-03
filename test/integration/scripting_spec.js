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

const { clearInput, closePages, loadAndWait } = require("./test_utils.js");

describe("Interaction", () => {
  async function actAndWaitForInput(page, selector, action) {
    await clearInput(page, selector);
    await action();
    await page.waitForFunction(
      `document.querySelector("${selector.replace("\\", "\\\\")}").value !== ""`
    );
    return page.$eval(selector, el => el.value);
  }

  describe("in 160F-2019.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("160F-2019.pdf", "#\\34 16R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that first text field has focus", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          // The document has an open action in order to give
          // the focus to 401R.
          const id = await page.evaluate(
            () => window.document.activeElement.id
          );
          expect(id).withContext(`In ${browserName}`).toEqual("401R");
        })
      );
    });

    it("must show a text field and then make in invisible when content is removed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          await page.type("#\\34 16R", "3.14159", { delay: 200 });
          await page.click("#\\34 19R");

          visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          // Clear the textfield
          await clearInput(page, "#\\34 16R");
          // and leave it
          await page.click("#\\34 19R");

          visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a click", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 16R", "3.14159", { delay: 200 });
          await page.click("#\\34 19R");
          const text = await page.$eval("#\\34 16R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("3,14");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,14");
        })
      );
    });

    it("must format the field with 2 digits, leave field with a click and again", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 48R", "61803", { delay: 200 });
          await page.click("#\\34 19R");
          let text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61.803,00");

          await page.click("#\\34 48R");
          text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61803");

          // Clear the textfield
          await clearInput(page, "#\\34 48R");

          await page.type("#\\34 48R", "1.61803", { delay: 200 });
          await page.click("#\\34 19R");
          text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("1,62");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a TAB", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 22R", "2.7182818", { delay: 200 });
          await page.keyboard.press("Tab");
          const text = await page.$eval("#\\34 22R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("2,72");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("5,86");
        })
      );
    });

    it("must format the field with 2 digits and hit ESC", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let sum = await page.$eval("#\\34 71R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("4,24");

          await page.type("#\\34 36R", "0.69314", { delay: 200 });
          await page.keyboard.press("Escape");
          const text = await page.$eval("#\\34 36R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0.69314");

          sum = await page.$eval("#\\34 71R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,55");
        })
      );
    });

    it("must format the field with 2 digits on key ENTER", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 19R", "0.577215", { delay: 200 });
          await page.keyboard.press("Enter");
          const text = await page.$eval("#\\34 19R", el => el.value);
          expect(text).toEqual("0.577215");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).toEqual("6,44");
        })
      );
    });

    it("must reset all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // this field has no actions but it must be cleared on reset
          await page.type("#\\34 05R", "employee", { delay: 200 });

          // click on reset button
          await page.click("[data-annotation-id='402R']");

          let text = await page.$eval("#\\34 16R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 22R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 19R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 05R", el => el.value);
          expect(text).toEqual("");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).toEqual("");
        })
      );
    });
  });

  describe("in js-buttons.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("js-buttons.pdf", "#\\38 0R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must show values in a text input when clicking on radio buttons", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          const expected = [
            ["#\\36 8R", "Group1=Choice1::1"],
            ["#\\36 9R", "Group1=Choice2::2"],
            ["#\\37 0R", "Group1=Choice3::3"],
            ["#\\37 1R", "Group1=Choice4::4"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\36 7R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\36 7R").value !== ""`
            );
            const text = await page.$eval("#\\36 7R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const expected = [
            ["#\\37 2R", "Check1=Yes::5"],
            ["#\\37 4R", "Check2=Yes::6"],
            ["#\\37 5R", "Check3=Yes::7"],
            ["#\\37 6R", "Check4=Yes::8"],
            ["#\\37 2R", "Check1=Off::5"],
            ["#\\37 4R", "Check2=Off::6"],
            ["#\\37 5R", "Check3=Off::7"],
            ["#\\37 6R", "Check4=Off::8"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\36 7R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\36 7R").value !== ""`
            );
            const text = await page.$eval("#\\36 7R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes in a group", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const expected = [
            ["#\\37 7R", "Check5=Yes1::9"],
            ["#\\37 8R", "Check5=Yes2::10"],
            ["#\\37 9R", "Check5=Yes3::11"],
            ["#\\38 0R", "Check5=Yes4::12"],
            ["#\\38 0R", "Check5=Off::12"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\36 7R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\36 7R").value !== ""`
            );
            const text = await page.$eval("#\\36 7R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });
  });

  describe("in doc_actions.pdf for printing", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", "#\\34 7R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must execute WillPrint and DidPrint actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (process.platform === "win32" && browserName === "firefox") {
            pending("Disabled in Firefox on Windows, because of bug 1662471.");
          }
          let text = await actAndWaitForInput(page, "#\\34 7R", async () => {
            await page.click("#print");
          });
          expect(text).withContext(`In ${browserName}`).toEqual("WillPrint");

          await page.waitForFunction(
            `document.querySelector("#\\\\35 0R").value !== ""`
          );

          text = await page.$eval("#\\35 0R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("DidPrint");
        })
      );
    });
  });

  describe("in doc_actions.pdf for saving", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", "#\\34 7R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must execute WillSave and DidSave actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          try {
            // Disable download in chrome
            // (it leads to an error in firefox so the try...)
            await page._client.send("Page.setDownloadBehavior", {
              behavior: "deny",
            });
          } catch (_) {}
          await clearInput(page, "#\\34 7R");
          let text = await actAndWaitForInput(page, "#\\34 7R", async () => {
            await page.click("#download");
          });
          expect(text).withContext(`In ${browserName}`).toEqual("WillSave");

          await page.waitForFunction(
            `document.querySelector("#\\\\35 0R").value !== ""`
          );

          text = await page.$eval("#\\35 0R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("DidSave");
        })
      );
    });
  });
});
