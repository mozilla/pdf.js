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
  async function actAndWaitForInput(page, selector, action, clear = true) {
    if (clear) {
      await clearInput(page, selector);
    }
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

          await page.waitForFunction(
            `getComputedStyle(document.querySelector("#\\\\34 27R")).visibility !== "hidden"`
          );

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

          await page.waitForFunction(
            `getComputedStyle(document.querySelector("#\\\\34 27R")).visibility !== "visible"`
          );

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
          // click on a radio button
          await page.click("[data-annotation-id='449R']");

          // this field has no actions but it must be cleared on reset
          await page.type("#\\34 05R", "employee", { delay: 200 });

          let checked = await page.$eval("#\\34 49R", el => el.checked);
          expect(checked).toEqual(true);

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

          checked = await page.$eval("#\\34 49R", el => el.checked);
          expect(checked).toEqual(false);
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
            ["#\\38 1R", "Group1=Choice1::1"],
            ["#\\38 2R", "Group1=Choice2::2"],
            ["#\\38 3R", "Group1=Choice3::3"],
            ["#\\38 4R", "Group1=Choice4::4"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\38 0R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\38 0R").value !== ""`
            );
            const text = await page.$eval("#\\38 0R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const expected = [
            ["#\\38 5R", "Check1=Yes::5"],
            ["#\\38 7R", "Check2=Yes::6"],
            ["#\\38 8R", "Check3=Yes::7"],
            ["#\\38 9R", "Check4=Yes::8"],
            ["#\\38 5R", "Check1=Off::5"],
            ["#\\38 7R", "Check2=Off::6"],
            ["#\\38 8R", "Check3=Off::7"],
            ["#\\38 9R", "Check4=Off::8"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\38 0R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\38 0R").value !== ""`
            );
            const text = await page.$eval("#\\38 0R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes in a group", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const expected = [
            ["#\\39 0R", "Check5=Yes1::9"],
            ["#\\39 1R", "Check5=Yes2::10"],
            ["#\\39 2R", "Check5=Yes3::11"],
            ["#\\39 3R", "Check5=Yes4::12"],
            ["#\\39 3R", "Check5=Off::12"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\38 0R");

            await page.click(selector);
            await page.waitForFunction(
              `document.querySelector("#\\\\38 0R").value !== ""`
            );
            const text = await page.$eval("#\\38 0R", el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes or radio with no actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const expected = [
            ["", "Off;Off"],
            ["#\\39 4R", "Yes;Off"],
            ["#\\39 5R", "Yes;NoAct2"],
            ["#\\39 6R", "Yes;NoAct3"],
            ["#\\39 4R", "Off;NoAct3"],
            ["#\\39 5R", "Off;NoAct2"],
          ];
          for (const [selector, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, "#\\38 0R");

            if (selector) {
              await page.click(selector);
            }

            await page.click("[data-annotation-id='97R']");
            await page.waitForFunction(
              `document.querySelector("#\\\\38 0R").value !== ""`
            );
            const text = await page.$eval("#\\38 0R", el => el.value);
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
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          await clearInput(page, "#\\34 7R");
          await page.evaluate(_ => {
            window.document.activeElement.blur();
          });
          await page.waitForFunction(
            `document.querySelector("#\\\\34 7R").value === ""`
          );

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
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          try {
            // Disable download in chrome
            // (it leads to an error in firefox so the try...)
            await page._client.send("Page.setDownloadBehavior", {
              behavior: "deny",
            });
          } catch (_) {}
          await clearInput(page, "#\\34 7R");
          await page.evaluate(_ => {
            window.document.activeElement.blur();
          });
          await page.waitForFunction(
            `document.querySelector("#\\\\34 7R").value === ""`
          );

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

  describe("in doc_actions.pdf for page actions", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", "#\\34 7R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must execute PageOpen and PageClose actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          let text = await page.$eval("#\\34 7R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("PageOpen 1");

          for (let run = 0; run < 5; run++) {
            for (const ref of [18, 19, 20, 21, 47, 50]) {
              await page.evaluate(refElem => {
                const element = window.document.getElementById(`${refElem}R`);
                if (element) {
                  element.value = "";
                }
              }, ref);
            }

            for (const [refOpen, refClose, pageNumOpen, pageNumClose] of [
              [18, 50, 2, 1],
              [21, 19, 3, 2],
              [47, 20, 1, 3],
            ]) {
              text = await actAndWaitForInput(
                page,
                `#\\3${Math.floor(refOpen / 10)} ${refOpen % 10}R`,
                async () => {
                  await page.evaluate(refElem => {
                    window.document
                      .getElementById(`${refElem}R`)
                      .scrollIntoView();
                  }, refOpen);
                },
                false
              );
              expect(text)
                .withContext(`In ${browserName}`)
                .toEqual(`PageOpen ${pageNumOpen}`);

              text = await page.$eval(
                `#\\3${Math.floor(refClose / 10)} ${refClose % 10}R`,
                el => el.value
              );
              expect(text)
                .withContext(`In ${browserName}`)
                .toEqual(`PageClose ${pageNumClose}`);
            }
          }
        })
      );
    });
  });

  describe("in js-authors.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("js-authors.pdf", "#\\32 5R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must print authors in a text field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const text = await actAndWaitForInput(page, "#\\32 5R", async () => {
            await page.click("[data-annotation-id='26R']");
          });
          expect(text)
            .withContext(`In ${browserName}`)
            .toEqual("author1::author2::author3::author4::author5");
        })
      );
    });
  });

  describe("in listbox_actions.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("listbox_actions.pdf", "#\\33 3R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must print selected value in a text field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const num of [7, 6, 4, 3, 2, 1]) {
            await clearInput(page, "#\\33 3R");
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `document.querySelector("#\\\\33 3R").value !== ""`
            );
            const text = await page.$eval("#\\33 3R", el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(`Item${num},Export${num}`);
          }
        })
      );
    });

    it("must clear and restore list elements", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Click on ClearItems button.
          await page.click("[data-annotation-id='34R']");
          await page.waitForFunction(
            `document.querySelector("#\\\\33 0R").children.length === 0`
          );

          // Click on Restore button.
          await page.click("[data-annotation-id='37R']");
          await page.waitForFunction(
            `document.querySelector("#\\\\33 0R").children.length !== 0`
          );

          for (const num of [7, 6, 4, 3, 2, 1]) {
            await clearInput(page, "#\\33 3R");
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `document.querySelector("#\\\\33 3R").value !== ""`
            );
            const text = await page.$eval("#\\33 3R", el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(`Item${num},Export${num}`);
          }
        })
      );
    });

    it("must insert new elements", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let len = 6;
          for (const num of [1, 3, 5, 6, 431, -1, 0]) {
            ++len;
            await clearInput(page, "#\\33 3R");
            await clearInput(page, "#\\33 9R");
            await page.type("#\\33 9R", `${num},Insert${num},Tresni${num}`, {
              delay: 10,
            });

            // Click on AddItem button.
            await page.click("[data-annotation-id='38R']");

            await page.waitForFunction(
              `document.querySelector("#\\\\33 0R").children.length === ${len}`
            );

            // Click on newly added option.
            await page.select("#\\33 0R", `Tresni${num}`);

            await page.waitForFunction(
              `document.querySelector("#\\\\33 3R").value !== ""`
            );
            const text = await page.$eval("#\\33 3R", el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(`Insert${num},Tresni${num}`);
          }
        })
      );
    });

    it("must delete some element", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let len = 6;
          // Click on Restore button.
          await clearInput(page, "#\\33 3R");
          await page.click("[data-annotation-id='37R']");
          await page.waitForFunction(
            `document.querySelector("#\\\\33 0R").children.length === ${len}`
          );

          for (const num of [2, 5]) {
            --len;
            await clearInput(page, "#\\33 9R");
            await page.type("#\\33 9R", `${num}`);

            // Click on DeleteItem button.
            await page.click("[data-annotation-id='36R']");

            await page.waitForFunction(
              `document.querySelector("#\\\\33 0R").children.length === ${len}`
            );
          }

          for (const num of [6, 4, 2, 1]) {
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `document.querySelector("#\\\\33 3R").value !== ""`
            );
            const text = await page.$eval("#\\33 3R", el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(`Item${num},Export${num}`);
          }
        })
      );
    });
  });

  describe("in js-colors.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("js-colors.pdf", "#\\33 4R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must change colors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const [name, ref] of [
            ["Text1", "#\\33 4R"],
            ["Check1", "#\\33 5R"],
            ["Radio1", "#\\33 7R"],
            ["Choice1", "#\\33 8R"],
          ]) {
            await clearInput(page, "#\\33 4R");
            await page.type("#\\33 4R", `${name}`, {
              delay: 10,
            });

            for (const [id, propName, expected] of [
              [41, "backgroundColor", "rgb(255, 0, 0)"],
              [43, "color", "rgb(0, 255, 0)"],
              [44, "border-top-color", "rgb(0, 0, 255)"],
            ]) {
              const current = await page.$eval(
                ref,
                (el, _propName) => getComputedStyle(el)[_propName],
                propName
              );

              await page.click(`[data-annotation-id='${id}R']`);
              await page.waitForFunction(
                (_ref, _current, _propName) =>
                  getComputedStyle(document.querySelector(_ref))[_propName] !==
                  _current,
                {},
                ref,
                current,
                propName
              );

              const color = await page.$eval(
                ref,
                (el, _propName) => getComputedStyle(el)[_propName],
                propName
              );
              expect(color).withContext(`In ${browserName}`).toEqual(expected);
            }
          }
        })
      );
    });
  });

  describe("in issue13132.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue13132.pdf", "#\\31 71R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must compute sum of fields", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          await page.evaluate(() => {
            window.document.getElementById("171R").scrollIntoView();
          });

          let sum = 0;
          for (const [id, val] of [
            ["#\\31 38R", 1],
            ["#\\37 7R", 2],
            ["#\\39 3R", 3],
            ["#\\31 51R", 4],
            ["#\\37 9R", 5],
          ]) {
            const prev = await page.$eval("#\\31 71R", el => el.value);

            await page.type(id, val.toString(), { delay: 100 });
            await page.keyboard.press("Tab");

            await page.waitForFunction(
              _prev =>
                getComputedStyle(document.querySelector("#\\31 71R")).value !==
                _prev,
              {},
              prev
            );

            sum += val;

            const total = await page.$eval("#\\31 71R", el => el.value);
            expect(total).withContext(`In ${browserName}`).toEqual(`£${sum}`);
          }

          // Some unrendered annotations have been updated, so check
          // that they've the correct value when rendered.
          await page.evaluate(() => {
            window.document
              .querySelectorAll('[data-page-number="4"][class="page"]')[0]
              .scrollIntoView();
          });
          await page.waitForSelector("#\\32 99R", {
            timeout: 0,
          });

          const total = await page.$eval("#\\32 99R", el => el.value);
          expect(total).withContext(`In ${browserName}`).toEqual(`£${sum}`);
        })
      );
    });
  });

  describe("Check field properties", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("evaljs.pdf", "#\\35 5R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check page index", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          await clearInput(page, "#\\35 5R");
          await page.type(
            "#\\35 5R",
            `
            ['Text1', 'Text2', 'Text4',
             'List Box7', 'Group6'].map(x => this.getField(x).page).join(',')
            `
          );

          // Click on execute button to eval the above code.
          await page.click("[data-annotation-id='57R']");
          await page.waitForFunction(
            `document.querySelector("#\\\\35 6R").value !== ""`
          );

          const text = await page.$eval("#\\35 6R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0,0,1,1,1");
        })
      );
    });

    it("must check display", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const [type, vis] of [
            ["hidden", "hidden"],
            ["noPrint", "visible"],
            ["noView", "hidden"],
            ["visible", "visible"],
          ]) {
            let visibility = await page.$eval(
              "#\\35 6R",
              el => getComputedStyle(el).visibility
            );

            await clearInput(page, "#\\35 5R");
            await page.type(
              "#\\35 5R",
              `this.getField("Text2").display = display.${type};`
            );

            await page.click("[data-annotation-id='57R']");
            await page.waitForFunction(
              `getComputedStyle(document.querySelector("#\\\\35 6R")).visibility !== "${visibility}"`
            );

            visibility = await page.$eval(
              "#\\35 6R",
              el => getComputedStyle(el).visibility
            );
            expect(visibility).withContext(`In ${browserName}`).toEqual(vis);
          }
        })
      );
    });
  });

  describe("in issue13269.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue13269.pdf", "#\\32 7R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must update fields with the same name from JS", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForFunction(
            "window.PDFViewerApplication.scriptingReady === true"
          );

          await page.type("#\\32 7R", "hello");
          await page.keyboard.press("Enter");

          await Promise.all(
            [4, 5, 6].map(async n =>
              page.waitForFunction(
                `document.querySelector("#\\\\32 ${n}R").value !== ""`
              )
            )
          );

          const expected = "hello world";
          for (const n of [4, 5, 6]) {
            const text = await page.$eval(`#\\32 ${n}R`, el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expected);
          }
        })
      );
    });
  });
});
