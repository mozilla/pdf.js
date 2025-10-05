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

import {
  awaitPromise,
  clearInput,
  closePages,
  getAnnotationSelector,
  getAnnotationStorage,
  getComputedStyleSelector,
  getFirstSerialized,
  getQuerySelector,
  getSelector,
  kbDeleteLastWord,
  kbSelectAll,
  loadAndWait,
  scrollIntoView,
  waitForEntryInStorage,
  waitForSandboxTrip,
  waitForTimeout,
} from "./test_utils.mjs";

async function waitForScripting(page) {
  await page.waitForFunction(
    "window.PDFViewerApplication.scriptingReady === true"
  );
}

async function typeAndWaitForSandbox(page, selector, value) {
  /**
   * Type the given value in a text field, indicated by the given selector on
   * the given page, that triggers the sandbox after every character insertion.
   *
   * Text fields can either dispatch a sandbox event on e.g. focus loss or after
   * every character insertion. The latter is problematic because Puppeteer can
   * only insert the next character correctly if the sandbox is fully done
   * processing the sandbox event that was issued for the previous character.
   * This helper function fixes the issue by typing each character individually
   * and waiting for the sandbox to finish before continuing with the next one.
   */
  for (const character of value) {
    await page.type(selector, character);
    await waitForSandboxTrip(page);
  }
}

describe("Interaction", () => {
  async function actAndWaitForInput(page, selector, action, clear = true) {
    await page.waitForSelector(selector, {
      timeout: 0,
    });
    if (clear) {
      await clearInput(page, selector);
    }
    await action();
    await page.waitForFunction(
      `document.querySelector('${selector}').value !== ""`
    );
    return page.$eval(selector, el => el.value);
  }

  describe("in 160F-2019.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("160F-2019.pdf", getSelector("416R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that first text field has focus", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.waitForFunction(`window.document.activeElement !== null`);

          // The document has an open action in order to give the focus to 401R.
          const id = await page.evaluate(() => {
            const element = window.document.activeElement;
            return element.getAttribute("data-element-id");
          });
          expect(id).withContext(`In ${browserName}`).toEqual("401R");
        })
      );
    });

    it("must show a text field and then make in invisible when content is removed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let visibility = await page.$eval(
            getSelector("427R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          await page.type(getSelector("416R"), "3.14159");
          await page.click(getSelector("419R"));

          await page.waitForFunction(
            `${getComputedStyleSelector("427R")}.visibility !== "hidden"`
          );

          visibility = await page.$eval(
            getSelector("427R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          // Clear the textfield
          await clearInput(page, getSelector("416R"));
          // and leave it
          await page.click(getSelector("419R"));

          await page.waitForFunction(
            `${getComputedStyleSelector("427R")}.visibility !== "visible"`
          );

          visibility = await page.$eval(
            getSelector("427R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a click", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("416R"), "3.14159");
          await page.click(getSelector("419R"));
          await page.waitForFunction(
            `${getQuerySelector("416R")}.value === "3,14"`
          );
          await page.waitForFunction(
            `${getQuerySelector("427R")}.value === "3,14"`
          );
        })
      );
    });

    it("must format the field with 2 digits, leave field with a click and again", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("448R"), "61803");
          await page.click(getSelector("419R"));
          await page.waitForFunction(
            `${getQuerySelector("448R")}.value === "61.803,00"`
          );

          await page.click(getSelector("448R"));
          await page.waitForFunction(
            `${getQuerySelector("448R")}.value === "61803"`
          );

          // Clear the textfield
          await clearInput(page, getSelector("448R"));

          await page.type(getSelector("448R"), "1.61803");
          await page.click(getSelector("419R"));
          await page.waitForFunction(
            `${getQuerySelector("448R")}.value === "1,62"`
          );
        })
      );
    });

    it("must format the field with 2 digits and leave field with a TAB", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("422R"), "2.7182818");
          await page.keyboard.press("Tab");
          await page.waitForFunction(
            `${getQuerySelector("422R")}.value === "2,72"`
          );
          await page.waitForFunction(
            `${getQuerySelector("427R")}.value === "2,72"`
          );
        })
      );
    });

    it("must format the field with 2 digits and hit ESC", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("436R"), "0.69314");
          await page.keyboard.press("Escape");
          await page.waitForFunction(
            `${getQuerySelector("436R")}.value === "0.69314"`
          );
          await page.waitForFunction(
            `${getQuerySelector("471R")}.value === "0,69"`
          );
        })
      );
    });

    it("must format the field with 2 digits on key ENTER", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("419R"), "0.577215");
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            `${getQuerySelector("419R")}.value === "0.577215"`
          );
          await page.waitForFunction(
            `${getQuerySelector("427R")}.value === "0,58"`
          );
        })
      );
    });

    it("must reset all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          // click on a radio button
          await page.click(getAnnotationSelector("449R"));

          // this field has no actions but it must be cleared on reset
          await page.type(getSelector("405R"), "employee");

          let checked = await page.$eval(getSelector("449R"), el => el.checked);
          expect(checked).toEqual(true);

          // click on reset button
          await page.click(getAnnotationSelector("402R"));

          await Promise.all(
            ["416R", "422R", "419R", "405R"].map(id => {
              const querySelector = getQuerySelector(id);
              return page.waitForFunction(`${querySelector}.value === ""`);
            })
          );

          let text = await page.$eval(getSelector("416R"), el => el.value);
          expect(text).toEqual("");

          text = await page.$eval(getSelector("422R"), el => el.value);
          expect(text).toEqual("");

          text = await page.$eval(getSelector("419R"), el => el.value);
          expect(text).toEqual("");

          text = await page.$eval(getSelector("405R"), el => el.value);
          expect(text).toEqual("");

          checked = await page.$eval(getSelector("449R"), el => el.checked);
          expect(checked).toEqual(false);

          const visibility = await page.$eval(
            getSelector("427R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility).toEqual("hidden");
        })
      );
    });
  });

  describe("in js-buttons.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("js-buttons.pdf", getSelector("80R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must show values in a text input when clicking on radio buttons", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const expected = [
            ["81R", "Group1=Choice1::1"],
            ["82R", "Group1=Choice2::2"],
            ["83R", "Group1=Choice3::3"],
            ["84R", "Group1=Choice4::4"],
          ];
          for (const [id, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, getSelector("80R"));

            await page.click(getSelector(id));
            await page.waitForFunction(
              `${getQuerySelector("80R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("80R"), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const expected = [
            ["85R", "Check1=Yes::5"],
            ["87R", "Check2=Yes::6"],
            ["88R", "Check3=Yes::7"],
            ["89R", "Check4=Yes::8"],
            ["85R", "Check1=Off::5"],
            ["87R", "Check2=Off::6"],
            ["88R", "Check3=Off::7"],
            ["89R", "Check4=Off::8"],
          ];
          for (const [id, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, getSelector("80R"));

            await page.click(getSelector(id));
            await page.waitForFunction(
              `${getQuerySelector("80R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("80R"), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes in a group", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const expected = [
            ["90R", "Check5=Yes1::9"],
            ["91R", "Check5=Yes2::10"],
            ["92R", "Check5=Yes3::11"],
            ["93R", "Check5=Yes4::12"],
            ["93R", "Check5=Off::12"],
          ];
          for (const [id, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, getSelector("80R"));

            await page.click(getSelector(id));
            await page.waitForFunction(
              `${getQuerySelector("80R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("80R"), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });

    it("must show values in a text input when clicking on checkboxes or radio with no actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const expected = [
            ["", "Off;Off"],
            ["94R", "Yes;Off"],
            ["95R", "Yes;NoAct2"],
            ["96R", "Yes;NoAct3"],
            ["94R", "Off;NoAct3"],
            ["95R", "Off;NoAct2"],
          ];
          for (const [id, expectedText] of expected) {
            // Clear the textfield
            await clearInput(page, getSelector("80R"));

            if (id) {
              await page.click(getSelector(id));
            }

            await page.click(getAnnotationSelector("97R"));
            await page.waitForFunction(
              `${getQuerySelector("80R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("80R"), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expectedText);
          }
        })
      );
    });
  });

  describe("in doc_actions.pdf for printing", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"), null, {
        earlySetup: () => {
          // No need to trigger the print dialog.
          window.print = () => {};
        },
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must execute WillPrint and DidPrint actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await clearInput(page, getSelector("47R"));
          await page.evaluate(_ => {
            window.document.activeElement.blur();
          });
          await page.waitForFunction(`${getQuerySelector("47R")}.value === ""`);

          const text = await actAndWaitForInput(
            page,
            getSelector("47R"),
            async () => {
              await page.click("#printButton");
            }
          );
          expect(text).withContext(`In ${browserName}`).toEqual("WillPrint");

          await page.waitForFunction(
            `${getQuerySelector("50R")}.value === "DidPrint"`
          );
        })
      );
    });
  });

  describe("in doc_actions.pdf for saving", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must execute WillSave and DidSave actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          try {
            // Disable download in chrome
            // (it leads to an error in firefox so the try...)
            await page._client.send("Page.setDownloadBehavior", {
              behavior: "deny",
            });
          } catch {}
          await clearInput(page, getSelector("47R"));
          await page.evaluate(_ => {
            window.document.activeElement.blur();
          });
          await page.waitForFunction(`${getQuerySelector("47R")}.value === ""`);

          let text = await actAndWaitForInput(
            page,
            getSelector("47R"),
            async () => {
              await page.click("#downloadButton");
            }
          );
          expect(text).withContext(`In ${browserName}`).toEqual("WillSave");

          await page.waitForFunction(`${getQuerySelector("50R")}.value !== ""`);

          text = await page.$eval(getSelector("50R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("DidSave");
        })
      );
    });
  });

  describe("in doc_actions.pdf for page actions", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must execute PageOpen and PageClose actions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.waitForFunction(`${getQuerySelector("47R")}.value !== ""`);

          let text = await page.$eval(getSelector("47R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("PageOpen 1");

          for (let run = 0; run < 5; run++) {
            for (const ref of ["18R", "19R", "20R", "21R", "47R", "50R"]) {
              await page.evaluate(selector => {
                const element = window.document.querySelector(selector);
                if (element) {
                  element.value = "";
                }
              }, getSelector(ref));
            }

            for (const [refOpen, refClose, pageNumOpen, pageNumClose] of [
              ["18R", "50R", 2, 1],
              ["21R", "19R", 3, 2],
              ["47R", "20R", 1, 3],
            ]) {
              text = await actAndWaitForInput(
                page,
                getSelector(refOpen),
                () => scrollIntoView(page, getSelector(refOpen)),
                false
              );
              expect(text)
                .withContext(`In ${browserName}`)
                .toEqual(`PageOpen ${pageNumOpen}`);

              text = await page.$eval(getSelector(refClose), el => el.value);
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

    beforeEach(async () => {
      pages = await loadAndWait("js-authors.pdf", getSelector("25R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must print authors in a text field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const text = await actAndWaitForInput(
            page,
            getSelector("25R"),
            async () => {
              await page.click(getAnnotationSelector("26R"));
            }
          );
          expect(text)
            .withContext(`In ${browserName}`)
            .toEqual("author1::author2::author3::author4::author5");
        })
      );
    });
  });

  describe("in listbox_actions.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("listbox_actions.pdf", getSelector("33R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must print selected value in a text field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          for (const num of [7, 6, 4, 3, 2, 1]) {
            await clearInput(page, getSelector("33R"));
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `${getQuerySelector("33R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("33R"), el => el.value);
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
          await waitForScripting(page);

          // Click on ClearItems button.
          await page.click(getAnnotationSelector("34R"));
          await page.waitForFunction(
            `${getQuerySelector("30R")}.children.length === 0`
          );

          // Click on Restore button.
          await page.click(getAnnotationSelector("37R"));
          await page.waitForFunction(
            `${getQuerySelector("30R")}.children.length !== 0`
          );

          for (const num of [7, 6, 4, 3, 2, 1]) {
            await clearInput(page, getSelector("33R"));
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `${getQuerySelector("33R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("33R"), el => el.value);
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
          await waitForScripting(page);

          let len = 6;
          for (const num of [1, 3, 5, 6, 431, -1, 0]) {
            ++len;
            await clearInput(page, getSelector("33R"));
            await clearInput(page, getSelector("39R"));
            await page.type(
              getSelector("39R"),
              `${num},Insert${num},Tresni${num}`
            );

            // Click on AddItem button.
            await page.click(getAnnotationSelector("38R"));

            await page.waitForFunction(
              `${getQuerySelector("30R")}.children.length === ${len}`
            );

            // Click on newly added option.
            await page.select(getSelector("30R"), `Tresni${num}`);

            await page.waitForFunction(
              `${getQuerySelector("33R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("33R"), el => el.value);
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
          await waitForScripting(page);

          let len = 6;
          // Click on Restore button.
          await clearInput(page, getSelector("33R"));
          await page.click(getAnnotationSelector("37R"));
          await page.waitForFunction(
            `${getQuerySelector("30R")}.children.length === ${len}`
          );

          for (const num of [2, 5]) {
            --len;
            await clearInput(page, getSelector("39R"));
            await page.type(getSelector("39R"), `${num}`);

            // Click on DeleteItem button.
            await page.click(getAnnotationSelector("36R"));

            await page.waitForFunction(
              `${getQuerySelector("30R")}.children.length === ${len}`
            );
          }

          for (const num of [6, 4, 2, 1]) {
            await clearInput(page, getSelector("33R"));
            await page.click(`option[value=Export${num}]`);
            await page.waitForFunction(
              `${getQuerySelector("33R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("33R"), el => el.value);
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

    beforeEach(async () => {
      pages = await loadAndWait("js-colors.pdf", getSelector("34R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must change colors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          for (const [name, ref] of [
            ["Text1", "34R"],
            ["Check1", "35R"],
            ["Radio1", "37R"],
            ["Choice1", "38R"],
          ]) {
            await clearInput(page, getSelector("34R"));
            await page.type(getSelector("34R"), `${name}`);

            for (const [id, propName, storedName, expected, storedExpected] of [
              [
                41,
                "backgroundColor",
                "backgroundColor",
                "rgb(255, 0, 0)",
                [255, 0, 0],
              ],
              [43, "color", "color", "rgb(0, 255, 0)", [0, 255, 0]],
              [
                44,
                "border-top-color",
                "borderColor",
                "rgb(0, 0, 255)",
                [0, 0, 255],
              ],
            ]) {
              const current = await page.$eval(
                getSelector(ref),
                (el, _propName) => getComputedStyle(el)[_propName],
                propName
              );

              await page.click(getAnnotationSelector(`${id}R`));
              await page.waitForFunction(
                `${getComputedStyleSelector(
                  ref
                )}["${propName}"] !== "${current}"`
              );

              const color = await page.$eval(
                getSelector(ref),
                (el, _propName) => getComputedStyle(el)[_propName],
                propName
              );
              expect(color).withContext(`In ${browserName}`).toEqual(expected);

              const storedValue = (await getFirstSerialized(page))[storedName];
              expect(storedValue)
                .withContext(`In ${browserName}`)
                .toEqual(storedExpected);
            }
          }
        })
      );
    });
  });

  describe("in issue13132.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue13132.pdf", getSelector("171R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must compute sum of fields", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await scrollIntoView(page, getSelector("138R"));

          let sum = 0;
          for (const [id, val] of [
            ["138R", 1],
            ["77R", 2],
            ["93R", 3],
            ["151R", 4],
            ["79R", 5],
          ]) {
            const prev = await page.$eval(getSelector("171R"), el => el.value);

            await typeAndWaitForSandbox(page, getSelector(id), val.toString());
            await page.keyboard.press("Tab");

            await page.waitForFunction(
              `${getQuerySelector("171R")}.value !== "${prev}"`
            );

            sum += val;

            const total = await page.$eval(getSelector("171R"), el => el.value);
            expect(total).withContext(`In ${browserName}`).toEqual(`£${sum}`);
          }

          await page.waitForSelector('.page[data-page-number = "4"]', {
            timeout: 0,
          });

          // Some unrendered annotations have been updated, so check
          // that they've the correct value when rendered.
          await scrollIntoView(page, '.page[data-page-number = "4"]');
          await page.waitForSelector(getSelector("299R"), {
            timeout: 0,
          });

          const total = await page.$eval(getSelector("299R"), el => el.value);
          expect(total).withContext(`In ${browserName}`).toEqual(`£${sum}`);
        })
      );
    });
  });

  describe("Check field properties", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("evaljs.pdf", getSelector("55R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check page index", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await clearInput(page, getSelector("55R"));
          await page.type(
            getSelector("55R"),
            `
            ['Text1', 'Text2', 'Text4',
             'List Box7', 'Group6'].map(x => this.getField(x).page).join(',')
            `
          );

          // Click on execute button to eval the above code.
          await page.click(getAnnotationSelector("57R"));
          await page.waitForFunction(`${getQuerySelector("56R")}.value !== ""`);

          const text = await page.$eval(getSelector("56R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0,0,1,1,1");
        })
      );
    });

    it("must check display", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          for (const [type, vis] of [
            ["hidden", "hidden"],
            ["noPrint", "visible"],
            ["noView", "hidden"],
            ["visible", "visible"],
          ]) {
            let visibility = await page.$eval(
              getSelector("56R"),
              el => getComputedStyle(el).visibility
            );

            await clearInput(page, getSelector("55R"));
            await page.type(
              getSelector("55R"),
              `this.getField("Text2").display = display.${type};`
            );

            await page.click(getAnnotationSelector("57R"));
            await page.waitForFunction(
              `${getComputedStyleSelector(
                "56R"
              )}.visibility !== "${visibility}"`
            );

            visibility = await page.$eval(
              getSelector("56R"),
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

    beforeEach(async () => {
      pages = await loadAndWait("issue13269.pdf", getSelector("27R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update fields with the same name from JS", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("27R"), "hello");
          await page.keyboard.press("Enter");

          await Promise.all(
            ["24R", "25R", "26R"].map(async id =>
              page.waitForFunction(`${getQuerySelector(id)}.value !== ""`)
            )
          );

          const expected = "hello world";
          for (const id of ["24R", "25R", "26R"]) {
            const text = await page.$eval(getSelector(id), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expected);
          }
        })
      );
    });
  });

  describe("in secHandler.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("secHandler.pdf", getSelector("25R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must print securityHandler value in a text field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const text = await actAndWaitForInput(
            page,
            getSelector("25R"),
            async () => {
              await page.click(getAnnotationSelector("26R"));
            }
          );
          expect(text).withContext(`In ${browserName}`).toEqual("Standard");
        })
      );
    });
  });

  describe("in issue14307.pdf (1)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check input for US zip format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [, page] of pages) {
        await waitForScripting(page);

        await page.focus(getSelector("29R"));
        await typeAndWaitForSandbox(page, getSelector("29R"), "12A");
        await page.waitForFunction(`${getQuerySelector("29R")}.value === "12"`);

        await page.focus(getSelector("29R"));
        await typeAndWaitForSandbox(page, getSelector("29R"), "34");
        await page.click(getAnnotationSelector("30R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(`${getQuerySelector("29R")}.value === ""`);

        await page.focus(getSelector("29R"));
        await typeAndWaitForSandbox(page, getSelector("29R"), "12345");
        await page.click(getAnnotationSelector("30R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(
          `${getQuerySelector("29R")}.value === "12345"`
        );
      }
    });
  });

  describe("in issue14307.pdf (2)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check input for US phone number (long) format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [, page] of pages) {
        await waitForScripting(page);

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "(123) 456A");
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value === "(123) 456"`
        );

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "-789");
        await page.click(getAnnotationSelector("29R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(`${getQuerySelector("30R")}.value === ""`);

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "(123) 456-7890");
        await page.click(getAnnotationSelector("29R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value === "(123) 456-7890"`
        );
      }
    });
  });

  describe("in issue14307.pdf (3)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check input for US phone number (short) format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [, page] of pages) {
        await waitForScripting(page);

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "123A");
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value === "123"`
        );

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "-456");
        await page.click(getAnnotationSelector("29R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(`${getQuerySelector("30R")}.value === ""`);

        await page.focus(getSelector("30R"));
        await typeAndWaitForSandbox(page, getSelector("30R"), "123-4567");
        await page.click(getAnnotationSelector("29R"));
        await waitForSandboxTrip(page);
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value === "123-4567"`
        );
      }
    });
  });

  describe("in issue14862.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14862.pdf", getSelector("27R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must convert input to uppercase", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await typeAndWaitForSandbox(page, getSelector("27R"), "Hello");
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HELLO"`
          );

          await typeAndWaitForSandbox(page, getSelector("27R"), " world");
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HELLO WORLD"`
          );

          await page.keyboard.press("Backspace");
          await waitForSandboxTrip(page);
          await page.keyboard.press("Backspace");
          await waitForSandboxTrip(page);
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HELLO WOR"`
          );

          await typeAndWaitForSandbox(page, getSelector("27R"), "12.dL");
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HELLO WORDL"`
          );

          await typeAndWaitForSandbox(page, getSelector("27R"), " ");
          await kbDeleteLastWord(page);
          await waitForSandboxTrip(page);
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HELLO "`
          );

          await page.$eval(getSelector("27R"), el => {
            // Select LL
            el.selectionStart = 2;
            el.selectionEnd = 4;
          });
          await typeAndWaitForSandbox(page, getSelector("27R"), "a");
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value === "HEAO "`
          );
        })
      );
    });

    it("must check that an infinite loop is not triggered", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.click(getSelector("28R"));
          await page.keyboard.press("Home");
          await page.type(getSelector("28R"), "Hello");
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value === "Hello123"`
          );

          // The action triggers a `calculateNow` which in turn triggers a
          // `resetForm (inducing a `calculateNow`) and a `calculateNow`.
          // Without infinite loop prevention the field would be empty.
          await page.click(getAnnotationSelector("31R"));
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value === "123"`
          );
        })
      );
    });
  });

  describe("in issue14705.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14705.pdf", getSelector("29R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that field value is correctly updated", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("29R"), "Hello World");
          await page.click(getSelector("27R"));

          await page.waitForFunction(
            `${getQuerySelector("29R")}.value !== "Hello World"`
          );

          let text = await page.$eval(getSelector("29R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("checked");

          await page.click(getSelector("27R"));

          await page.waitForFunction(
            `${getQuerySelector("29R")}.value !== "checked"`
          );

          text = await page.$eval(getSelector("29R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("unchecked");
        })
      );
    });
  });

  describe("in bug1766987.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1766987.pdf", getSelector("75R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that field value is correctly formatted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let text = await page.$eval(getSelector("75R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("150.32 €");

          text = await page.$eval(getSelector("82R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("12.74 Kwh");

          text = await page.$eval(getSelector("91R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("352.19 Kwh");

          text = await page.$eval(getSelector("101R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("20.57 €");
        })
      );
    });
  });

  describe("in issue15053.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15053.pdf", getSelector("44R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a button and text field with a border are hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const textWidgetSelector = getAnnotationSelector("35R");
          const pushButtonSelector = getAnnotationSelector("51R");

          let visibility = await page.$eval(
            textWidgetSelector,
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          visibility = await page.$eval(
            pushButtonSelector,
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          await page.click(getSelector("44R"));
          await page.waitForFunction(
            `document.querySelector('${textWidgetSelector}').style.visibility === "hidden"`
          );

          visibility = await page.$eval(
            textWidgetSelector,
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          visibility = await page.$eval(
            pushButtonSelector,
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");
        })
      );
    });
  });

  describe("in bug1675139.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1675139.pdf", getSelector("48R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that data-main-rotation is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let base = 0;

          while (base !== 360) {
            for (const [ref, angle] of [
              [47, 0],
              [42, 90],
              [45, 180],
              [46, 270],
            ]) {
              await page.waitForFunction(
                (sel, b, a) => {
                  const el = document.querySelector(sel);
                  const rotation =
                    parseInt(el.getAttribute("data-main-rotation")) || 0;
                  return rotation === (360 + ((360 - (b + a)) % 360)) % 360;
                },
                {},
                getAnnotationSelector(`${ref}R`),
                base,
                angle
              );
            }
            base += 90;
            await page.click(getSelector("48R"));
          }
        })
      );
    });
  });

  describe("in issue15092.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15092.pdf", getSelector("39R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a value is correctly updated on a field and its siblings", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await clearInput(page, getSelector("39R"));
          await typeAndWaitForSandbox(page, getSelector("39R"), "123");

          await clearInput(page, getSelector("42R"));
          await typeAndWaitForSandbox(page, getSelector("42R"), "456");

          await page.click(getSelector("45R"));

          await page.waitForFunction(
            `${getQuerySelector("43R")}.value === "579.00"`
          );
          await page.waitForFunction(
            `${getQuerySelector("46R")}.value === "579.00"`
          );
        })
      );
    });
  });

  describe("in bug1782564.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1782564.pdf", getSelector("7R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that charLimit is correctly set", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await waitForScripting(page);

          // The default charLimit is 0, which indicates unlimited text length.
          await page.type(getSelector("7R"), "abcdefghij");
          await page.waitForFunction(
            `${getQuerySelector("7R")}.value === "abcdefghij"`
          );

          // Increase the charLimit to 1 (this truncates the existing text).
          await page.click(getSelector("9R"));
          await waitForSandboxTrip(page);
          await page.waitForFunction(`${getQuerySelector("7R")}.value === "a"`);

          await clearInput(page, getSelector("7R"));
          await page.type(getSelector("7R"), "xyz");
          await page.waitForFunction(`${getQuerySelector("7R")}.value === "x"`);

          // Increase the charLimit to 2.
          await page.click(getSelector("9R"));
          await waitForSandboxTrip(page);

          await clearInput(page, getSelector("7R"));
          await page.type(getSelector("7R"), "xyz");
          await page.waitForFunction(
            `${getQuerySelector("7R")}.value === "xy"`
          );
        })
      );
    });
  });

  describe("in bug1802888.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1802888.pdf", getSelector("30R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check field value is treated by default as a number", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await typeAndWaitForSandbox(page, getSelector("30R"), "123");
          await page.click(getSelector("31R"));
          await page.type(getSelector("31R"), "456");
          await page.click(getSelector("26R"));
          await page.click(getSelector("27R"));
          await page.waitForFunction(`${getQuerySelector("26R")}.value !== ""`);

          const value = await page.$eval(getSelector("26R"), el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("579");
        })
      );
    });
  });

  describe("in issue15753.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15753.pdf", getSelector("27R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check field value is correctly updated when committed with ENTER key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("27R"), "abc");
          await page.keyboard.press("Enter");
          await page.waitForFunction(`${getQuerySelector("28R")}.value !== ""`);
          let value = await page.$eval(getSelector("28R"), el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("abc");

          await page.type(getSelector("27R"), "def");

          await page.keyboard.press("Enter");
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value !== "abc"`
          );
          value = await page.$eval(getSelector("28R"), el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("abcdef");

          await kbSelectAll(page);
          await page.keyboard.press("Backspace");

          await page.keyboard.press("Enter");
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value !== "abcdef"`
          );
          value = await page.$eval(getSelector("28R"), el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("");
        })
      );
    });
  });

  describe("in issue15815.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15815.pdf", getSelector("24R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check field value is correctly updated when committed with ENTER key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let value = "A";
          for (const [displayValue, exportValue] of [
            ["B", "x2"],
            ["C", "x3"],
            ["A", "x1"],
          ]) {
            await clearInput(page, getSelector("27R"));
            await page.select(getSelector("24R"), exportValue);
            await page.waitForFunction(
              `${getQuerySelector("27R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("27R"), el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(`value=${value}, changeEx=${exportValue}`);
            value = displayValue;
          }

          for (const exportValue of ["x3", "x2", "x1"]) {
            await clearInput(page, getSelector("27R"));
            await page.type(getSelector("27R"), exportValue);
            await page.click(getAnnotationSelector("28R"));
            await page.waitForFunction(
              `${getQuerySelector("24R")}.value === "${exportValue}"`
            );
          }
        })
      );
    });
  });

  describe("in issue15818.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15818.pdf", getSelector("27R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the field value set when the document is open", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.waitForFunction(`${getQuerySelector("27R")}.value !== ""`);

          const text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("hello world");
        })
      );
    });

    it("must check the format action is called when setFocus is used", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await typeAndWaitForSandbox(page, getSelector("30R"), "abc");
          await page.waitForFunction(
            `${getQuerySelector("30R")}.value !== "abc"`
          );

          await page.waitForFunction(
            `window.document.activeElement.getAttribute("data-element-id") !== "30R"`
          );
          const focusedId = await page.evaluate(_ =>
            window.document.activeElement.getAttribute("data-element-id")
          );

          expect(focusedId).withContext(`In ${browserName}`).toEqual("31R");
        })
      );
    });
  });

  describe("in autoprint.pdf", () => {
    let pages;

    beforeEach(async () => {
      // Autoprinting is triggered by the `Open` event, which is one of the
      // first events to be dispatched to the sandbox, even before scripting
      // is reported to be ready. It's therefore important that `loadAndWait`
      // returns control as soon as possible after opening the PDF document.
      // Note that the `autoprint.pdf` file is very small, so printing
      // it is usually very fast and therefore activating the selector check
      // too late will cause it to never resolve because printing is already
      // done (and the printed page div removed) before we even get to it.
      pages = await loadAndWait("autoprint.pdf", "", null /* zoom = */, {
        earlySetup: () => {
          // No need to trigger the print dialog.
          window.print = () => {};
        },
        appSetup: app => {
          app._testPrintResolver = Promise.withResolvers();
        },
        eventBusSetup: eventBus => {
          eventBus.on(
            "afterprint",
            () => {
              window.PDFViewerApplication._testPrintResolver.resolve();
            },
            { once: true }
          );
        },
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check if printing is triggered when the document is open", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await awaitPromise(
            await page.evaluateHandle(() => [
              window.PDFViewerApplication._testPrintResolver.promise,
            ])
          );
        })
      );
    });
  });

  describe("in bug1811694.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1811694.pdf", getSelector("25R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a field value with a number isn't changed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.click(getSelector("25R"));
          await page.type(getSelector("25R"), "00000000123");

          let text = await page.$eval(getSelector("25R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("00000000123");

          await page.click(getSelector("26R"));
          await waitForSandboxTrip(page);

          text = await page.$eval(getSelector("25R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("00000000123");
        })
      );
    });
  });

  describe("in bug1811510.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1811510.pdf", getSelector("22R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a field value with a number with a comma has the correct value", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let text = await page.$eval(getSelector("22R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("5,25");

          await page.$eval(getSelector("31R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("5,25");

          await page.click(getSelector("22R"));
          await waitForSandboxTrip(page);

          text = await page.$eval(getSelector("22R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("5,25");

          await page.click(getSelector("31R"));
          await page.waitForFunction(
            `${getQuerySelector("31R")}.value !== "5,25"`
          );

          text = await page.$eval(getSelector("31R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("5.25");
        })
      );
    });
  });

  describe("in issue16067.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue16067.pdf", getSelector("6R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a field has the correct value when a choice is changed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let text = await page.$eval(getSelector("44R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("");

          await page.select(getSelector("6R"), "Yes");
          await page.waitForFunction(`${getQuerySelector("44R")}.value !== ""`);
          text = await page.$eval(getSelector("44R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("Yes");

          await clearInput(page, getSelector("44R"));

          await page.select(getSelector("6R"), "No");
          await page.waitForFunction(`${getQuerySelector("44R")}.value !== ""`);
          text = await page.$eval(getSelector("44R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("No");
        })
      );
    });
  });

  describe("in bug1825002.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1825002.pdf", getSelector("23R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a field has the correct formatted value", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let text = await page.$eval(getSelector("23R"), el => el.value);
          expect(text)
            .withContext(`In ${browserName}`)
            .toEqual("ABCDEFGHIJKLMN");

          await page.click(getSelector("23R"));
          await page.waitForFunction(
            `${getQuerySelector("23R")}.value !== "ABCDEFGHIJKLMN"`
          );

          text = await page.$eval(getSelector("23R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("123,45.7A");
        })
      );
    });

    it("must check that a field is empty", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let text = await page.$eval(getSelector("26R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("");

          await page.click(getSelector("26R"));
          await page.type(getSelector("26R"), "abcde");
          await page.click(getSelector("23R"));
          await clearInput(page, getSelector("26R"));
          await page.click(getSelector("23R"));
          await waitForSandboxTrip(page);

          text = await page.$eval(getSelector("26R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("");
        })
      );
    });
  });

  describe("in bug1844576.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1844576.pdf", getSelector("9R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a field has the correct formatted value", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const selector = getAnnotationSelector("9R");
          const hasVisibleCanvas = await page.$eval(
            `${selector} > canvas`,
            elem => elem && !elem.hasAttribute("hidden")
          );
          expect(hasVisibleCanvas)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          const hasHiddenInput = await page.$eval(`${selector} > input`, elem =>
            elem?.hasAttribute("hidden")
          );
          expect(hasHiddenInput).withContext(`In ${browserName}`).toEqual(true);

          await page.click(getSelector("12R"));
          await page.waitForSelector(`${selector} > canvas[hidden]`);

          const hasHiddenCanvas = await page.$eval(
            `${selector} > canvas`,
            elem => elem?.hasAttribute("hidden")
          );
          expect(hasHiddenCanvas)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          const hasVisibleInput = await page.$eval(
            `${selector} > input`,
            elem => elem && !elem.hasAttribute("hidden")
          );
          expect(hasVisibleInput)
            .withContext(`In ${browserName}`)
            .toEqual(true);
        })
      );
    });
  });

  describe("in annotation_hidden_noview.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "annotation_hidden_noview.pdf",
        getSelector("11R")
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that invisible fields are made visible", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let visibility = await page.$eval(
            getSelector("7R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          visibility = await page.$eval(
            getSelector("8R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          await page.click(getSelector("11R"));

          await page.waitForFunction(
            `${getComputedStyleSelector("7R")}.visibility !== "hidden"`
          );
          visibility = await page.$eval(
            getSelector("7R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          await page.waitForFunction(
            `${getComputedStyleSelector("8R")}.visibility !== "hidden"`
          );
          visibility = await page.$eval(
            getSelector("8R"),
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");
        })
      );
    });
  });

  describe("in issue16863.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue16863.pdf", getSelector("334R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that checkboxes are correctly resetted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let readonly = await page.$eval(
            getSelector("353R"),
            el => el.disabled
          );
          expect(readonly).withContext(`In ${browserName}`).toEqual(true);
          await page.click(getSelector("334R"));
          await waitForSandboxTrip(page);

          readonly = await page.$eval(getSelector("353R"), el => el.disabled);
          expect(readonly).withContext(`In ${browserName}`).toEqual(true);
          await page.click(getSelector("351R"));
          await waitForSandboxTrip(page);

          readonly = await page.$eval(getSelector("353R"), el => el.disabled);
          expect(readonly).withContext(`In ${browserName}`).toEqual(true);
          await page.click(getSelector("352R"));
          await page.waitForFunction(
            `${getQuerySelector("353R")}.disabled !== true`
          );

          readonly = await page.$eval(getSelector("353R"), el => el.disabled);
          expect(readonly).withContext(`In ${browserName}`).toEqual(false);

          await page.click(getSelector("353R"));
          await page.waitForFunction(
            `${getQuerySelector("353R")}.checked !== false`
          );

          let checked = await page.$eval(getSelector("353R"), el => el.checked);
          expect(checked).withContext(`In ${browserName}`).toEqual(true);
          await page.click(getSelector("334R"));
          await page.waitForFunction(
            `${getQuerySelector("353R")}.disabled !== false`
          );
          await page.waitForFunction(
            `${getQuerySelector("353R")}.checked !== true`
          );

          readonly = await page.$eval(getSelector("353R"), el => el.disabled);
          expect(readonly).withContext(`In ${browserName}`).toEqual(true);
          checked = await page.$eval(getSelector("353R"), el => el.checked);
          expect(checked).withContext(`In ${browserName}`).toEqual(false);
        })
      );
    });
  });

  describe("Textfields and focus", () => {
    let pages;
    let otherPages;

    beforeEach(async () => {
      otherPages = await Promise.all(
        global.integrationSessions.map(async session =>
          session.browser.newPage()
        )
      );
      pages = await loadAndWait("evaljs.pdf", getSelector("55R"));
    });

    afterEach(async () => {
      await closePages(pages);
      await Promise.all(otherPages.map(page => page.close()));
    });

    it("must check that focus/blur callbacks aren't called", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("55R"));
          await page.type(getSelector("55R"), "Hello");
          await page.click(getSelector("56R"));

          await page.click(getSelector("55R"));
          await page.type(getSelector("55R"), " World");

          await otherPages[i].bringToFront();
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);
          await page.bringToFront();
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);

          const text = await page.$eval(getSelector("55R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("Hello World");
        })
      );
    });
  });

  describe("Textfield with a Blur callback", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1863910.pdf", getSelector("25R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that blur callback is called", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("25R"));
          await page.click(getSelector("26R"));

          await page.waitForFunction(
            sel => document.querySelector(sel).value !== "",
            {},
            getSelector("26R")
          );

          const text = await page.$eval(getSelector("26R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("hello");
        })
      );
    });
  });

  describe("Radio button without T value", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1860602.pdf", getSelector("22R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that only one radio is selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await scrollIntoView(page, getSelector("22R"));
          await page.click(getSelector("25R"));
          await waitForEntryInStorage(page, "25R", { value: true });

          let storage = await getAnnotationStorage(page);
          expect(storage)
            .withContext(`In ${browserName}`)
            .toEqual({
              "25R": { value: true },
              "28R": { value: false },
              "35R": { value: false },
              "38R": { value: false },
              "41R": { value: false },
              "44R": { value: false },
              "47R": { value: false },
              "50R": { value: false },
              "22R": { value: false },
            });

          await page.click(getSelector("22R"));
          await waitForEntryInStorage(page, "22R", { value: true });

          storage = await getAnnotationStorage(page);
          expect(storage)
            .withContext(`In ${browserName}`)
            .toEqual({
              "25R": { value: false },
              "28R": { value: false },
              "35R": { value: false },
              "38R": { value: false },
              "41R": { value: false },
              "44R": { value: false },
              "47R": { value: false },
              "50R": { value: false },
              "22R": { value: true },
            });
        })
      );
    });
  });

  describe("Textfield with a number and some decimals", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue17540.pdf", getSelector("15R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the number has the correct number of decimals", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("15R"));
          await page.type(getSelector("15R"), "3");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            sel => document.querySelector(sel).value !== "",
            {},
            getSelector("16R")
          );

          const text = await page.$eval(getSelector("16R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0.900");
        })
      );
    });
  });

  describe("Textfield with a zip code starting with 0", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1889122.pdf", getSelector("24R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the zip code is correctly formatted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("24R"));
          await typeAndWaitForSandbox(page, getSelector("24R"), "01234");
          await page.keyboard.press("Tab");
          await waitForSandboxTrip(page);

          const text = await page.$eval(getSelector("24R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("01234");
        })
      );
    });
  });

  describe("Value of event.change when a choice list is modified", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue17998.pdf", getSelector("7R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the properties of the event", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          for (const [value, expected] of [
            ["b", "change=B,changeEx=b,value=A"],
            ["c", "change=C,changeEx=c,value=B"],
            ["a", "change=A,changeEx=a,value=C"],
          ]) {
            await page.select(getSelector("7R"), value);
            await page.waitForFunction(
              `${getQuerySelector("10R")}.value !== ""`
            );
            const text = await page.$eval(getSelector("10R"), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expected);
            await clearInput(page, getSelector("10R"));
          }
        })
      );
    });
  });

  describe("PageOpen and PageClose actions in fields", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue18305.pdf", getSelector("7R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that PageOpen/PageClose actions are correctly executed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          const buttonSelector = getAnnotationSelector("25R");
          await page.waitForSelector(buttonSelector, {
            timeout: 0,
          });

          const inputSelector = getSelector("7R");
          let text = await page.$eval(inputSelector, el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("");

          text = await actAndWaitForInput(
            page,
            inputSelector,
            () => scrollIntoView(page, buttonSelector),
            false
          );
          expect(text).withContext(`In ${browserName}`).toEqual("PageOpen");

          text = await actAndWaitForInput(
            page,
            inputSelector,
            () => scrollIntoView(page, inputSelector),
            false
          );
          expect(text).withContext(`In ${browserName}`).toEqual("PageClose");
        })
      );
    });
  });

  describe("Compute product of different fields", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue18536.pdf", getSelector("34R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the product are null", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          const inputSelector = getSelector("34R");
          await page.click(inputSelector);
          await page.type(inputSelector, "123");
          await page.click(getSelector("28R"));
          await page.waitForFunction(
            `${getQuerySelector("36R")}.value !== "0"`
          );

          let text = await page.$eval(getSelector("30R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0");

          text = await page.$eval(getSelector("35R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0");

          text = await page.$eval(getSelector("36R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("123");
        })
      );
    });
  });

  describe("Calculate field value even if one callback throws", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue18561.pdf", getSelector("24R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the product is computed although a callback threw", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          const inputSelector = getSelector("24R");
          await page.click(inputSelector);
          await page.type(inputSelector, "123");
          await page.click(getSelector("25R"));
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value === "12300"`
          );
        })
      );
    });
  });

  describe("Correctly format numbers", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1918115.pdf", getSelector("33R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the computed value is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await typeAndWaitForSandbox(page, getSelector("33R"), "7");
          await page.click(getSelector("34R"));
          await page.waitForFunction(
            `${getQuerySelector("35R")}.value === "324,00"`
          );
        })
      );
    });
  });

  describe("Change radio property", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1922766.pdf", getAnnotationSelector("44R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a change on a radio implies the change on all the radio in the group", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const checkColor = async color => {
            await waitForSandboxTrip(page);
            for (const i of [40, 41, 42, 43]) {
              const bgColor = await page.$eval(
                `[data-element-id='${i}R']`,
                el => getComputedStyle(el).backgroundColor
              );
              expect(bgColor)
                .withContext(`In ${browserName}`)
                .toEqual(`rgb(${color.join(", ")})`);
            }
          };
          await checkColor([255, 0, 0]);
          await page.click(getAnnotationSelector("44R"));
          await checkColor([0, 0, 255]);
          await page.click(getAnnotationSelector("44R"));
          await checkColor([255, 0, 0]);

          await page.click(getAnnotationSelector("43R"));
          await waitForSandboxTrip(page);
          await page.click(getAnnotationSelector("44R"));
          await checkColor([0, 0, 255]);
        })
      );
    });
  });

  describe("Date creation must be timezone consistent", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1934157.pdf", getAnnotationSelector("24R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that date entered by the user is consistent", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.emulateTimezone("Pacific/Honolulu");

          const expectedDate = "02/01/2000";
          await page.type(getSelector("24R"), expectedDate);
          await page.click(getSelector("25R"));
          await waitForSandboxTrip(page);

          const date = await page.$eval(getSelector("24R"), el => el.value);
          expect(date).withContext(`In ${browserName}`).toEqual(expectedDate);
        })
      );
    });
  });

  describe("Skip throwing actions (issue 19505)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue19505.pdf", getAnnotationSelector("24R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that date entered are in the input", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const fieldSelector = getSelector("24R");
          for (const c of "Hello World") {
            await page.type(fieldSelector, c);
            await waitForSandboxTrip(page);
          }

          const value = await page.$eval(fieldSelector, el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("Hello World");
        })
      );
    });
  });

  describe("Date HTML element", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("dates.pdf", getAnnotationSelector("26R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the inputs are correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const firstInputSelector = `${getAnnotationSelector("26R")} > input`;
          await page.waitForSelector(`${firstInputSelector}[type="text"]`);
          await page.click(firstInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(`${firstInputSelector}[type="date"]`);
          await page.$eval(firstInputSelector, el => {
            el.value = "1975-03-16";
          });

          const secondInputSelector = `${getAnnotationSelector("27R")} > input`;
          await page.waitForSelector(`${secondInputSelector}[type="text"]`);
          await page.click(secondInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(`${secondInputSelector}[type="time"]`);
          await page.$eval(secondInputSelector, el => {
            el.value = "01:23:45";
          });

          const thirdInputSelector = `${getAnnotationSelector("28R")} > input`;
          await page.waitForSelector(`${thirdInputSelector}[type="text"]`);
          await page.click(thirdInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(
            `${thirdInputSelector}[type="datetime-local"]`
          );
          await page.$eval(thirdInputSelector, el => {
            el.value = "1975-03-16T01:23:45";
          });

          const firstInputValue = await page.$eval(
            firstInputSelector,
            el => el.value
          );
          expect(firstInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("16-Mar-75");

          const secondInputValue = await page.$eval(
            secondInputSelector,
            el => el.value
          );
          expect(secondInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("01:23:45");

          await page.click(firstInputSelector);
          await waitForSandboxTrip(page);

          const thirdInputValue = await page.$eval(
            thirdInputSelector,
            el => el.value
          );
          expect(thirdInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("3/16/1975 01:23");
        })
      );
    });
  });

  describe("Date HTML element in different timezone", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "dates.pdf",
        getAnnotationSelector("26R"),
        null,
        null,
        async page => {
          // Make sure that 00:00 UTC is the day before in the local timezone.
          await page.emulateTimezone("Pacific/Niue");
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the inputs are correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const firstInputSelector = `${getAnnotationSelector("26R")} > input`;
          await page.waitForSelector(`${firstInputSelector}[type="text"]`);
          await page.click(firstInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(`${firstInputSelector}[type="date"]`);
          await page.$eval(firstInputSelector, el => {
            el.value = "2025-10-05";
          });
          const secondInputSelector = `${getAnnotationSelector("27R")} > input`;
          await page.waitForSelector(`${secondInputSelector}[type="text"]`);
          await page.click(secondInputSelector);
          await waitForSandboxTrip(page);
          const firstInputValue = await page.$eval(
            firstInputSelector,
            el => el.value
          );
          expect(firstInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("05-Oct-25");
        })
      );
    });
  });

  describe("Date HTML element with initial values", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("dates_save.pdf", getAnnotationSelector("26R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the inputs are correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const firstInputSelector = `${getAnnotationSelector("26R")} > input`;
          await page.waitForSelector(`${firstInputSelector}[type="text"]`);
          await page.click(firstInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(`${firstInputSelector}[type="date"]`);
          const firstInputValue = await page.$eval(
            firstInputSelector,
            el => el.value
          );
          expect(firstInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("2025-07-01");

          const secondInputSelector = `${getAnnotationSelector("27R")} > input`;
          await page.waitForSelector(`${secondInputSelector}[type="text"]`);
          await page.click(secondInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(`${secondInputSelector}[type="time"]`);
          const secondInputValue = await page.$eval(
            secondInputSelector,
            el => el.value
          );
          expect(secondInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("00:34:56");

          const thirdInputSelector = `${getAnnotationSelector("28R")} > input`;
          await page.waitForSelector(`${thirdInputSelector}[type="text"]`);
          await page.click(thirdInputSelector);
          await waitForSandboxTrip(page);
          await page.waitForSelector(
            `${thirdInputSelector}[type="datetime-local"]`
          );
          const thirdInputValue = await page.$eval(
            thirdInputSelector,
            el => el.value
          );
          expect(thirdInputValue)
            .withContext(`In ${browserName}`)
            .toEqual("2025-07-02T12:34");
        })
      );
    });
  });
});
