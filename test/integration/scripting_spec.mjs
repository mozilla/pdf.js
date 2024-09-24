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
  closeSinglePage,
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

    beforeAll(async () => {
      pages = await loadAndWait("160F-2019.pdf", getSelector("416R"));
    });

    afterAll(async () => {
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

          await page.type(getSelector("416R"), "3.14159", { delay: 200 });
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

          await page.type(getSelector("416R"), "3.14159", { delay: 200 });
          await page.click(getSelector("419R"));

          const valueFnStr = `${getQuerySelector("416R")}.value !== "3.14159"`;
          await page.waitForFunction(valueFnStr);

          const text = await page.$eval(getSelector("416R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("3,14");

          const sum = await page.$eval(getSelector("427R"), el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,14");
        })
      );
    });

    it("must format the field with 2 digits, leave field with a click and again", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("448R"), "61803", { delay: 200 });
          await page.click(getSelector("419R"));

          const valueOneFnStr = `${getQuerySelector("448R")}.value !== "61803"`;
          await page.waitForFunction(valueOneFnStr);

          let text = await page.$eval(getSelector("448R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61.803,00");

          await page.click(getSelector("448R"));

          const valueTwoFnStr = `${getQuerySelector(
            "448R"
          )}.value !== "61.803,00"`;
          await page.waitForFunction(valueTwoFnStr);

          text = await page.$eval(getSelector("448R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61803");

          // Clear the textfield
          await clearInput(page, getSelector("448R"));

          await page.type(getSelector("448R"), "1.61803", { delay: 200 });
          await page.click(getSelector("419R"));

          const valueThreeFnStr = `${getQuerySelector(
            "448R"
          )}.value !== "1.61803"`;
          await page.waitForFunction(valueThreeFnStr);

          text = await page.$eval(getSelector("448R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("1,62");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a TAB", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const prevSum = await page.$eval(getSelector("427R"), el => el.value);

          await page.type(getSelector("422R"), "2.7182818", { delay: 200 });
          await page.keyboard.press("Tab");

          await page.waitForFunction(
            `${getQuerySelector("422R")}.value !== "2.7182818"`
          );

          const text = await page.$eval(getSelector("422R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("2,72");

          await page.waitForFunction(
            `${getQuerySelector("427R")}.value !== "${prevSum}"`
          );

          const sum = await page.$eval(getSelector("427R"), el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("5,86");
        })
      );
    });

    it("must format the field with 2 digits and hit ESC", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let sum = await page.$eval(getSelector("471R"), el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("4,24");

          await page.type(getSelector("436R"), "0.69314", { delay: 200 });
          await page.keyboard.press("Escape");

          const text = await page.$eval(getSelector("436R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0.69314");

          await page.waitForFunction(
            `${getQuerySelector("471R")}.value !== "${sum}"`
          );

          sum = await page.$eval(getSelector("471R"), el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,55");
        })
      );
    });

    it("must format the field with 2 digits on key ENTER", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const prevSum = await page.$eval(getSelector("427R"), el => el.value);

          await page.type(getSelector("419R"), "0.577215", { delay: 200 });
          await page.keyboard.press("Enter");
          const text = await page.$eval(getSelector("419R"), el => el.value);
          expect(text).toEqual("0.577215");

          await page.waitForFunction(
            `${getQuerySelector("427R")}.value !== "${prevSum}"`
          );

          const sum = await page.$eval(getSelector("427R"), el => el.value);
          expect(sum).toEqual("6,44");
        })
      );
    });

    it("must reset all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          // click on a radio button
          await page.click("[data-annotation-id='449R']");

          // this field has no actions but it must be cleared on reset
          await page.type(getSelector("405R"), "employee", { delay: 200 });

          let checked = await page.$eval(getSelector("449R"), el => el.checked);
          expect(checked).toEqual(true);

          // click on reset button
          await page.click("[data-annotation-id='402R']");

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

    beforeAll(async () => {
      pages = await loadAndWait("js-buttons.pdf", getSelector("80R"));
    });

    afterAll(async () => {
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

            await page.click("[data-annotation-id='97R']");
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

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"), null, {
        earlySetup: () => {
          // No need to trigger the print dialog.
          window.print = () => {};
        },
      });
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
          await closeSinglePage(page);
        })
      );
    });
  });

  describe("in doc_actions.pdf for saving", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("js-authors.pdf", getSelector("25R"));
    });

    afterAll(async () => {
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
              await page.click("[data-annotation-id='26R']");
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

    beforeAll(async () => {
      pages = await loadAndWait("listbox_actions.pdf", getSelector("33R"));
    });

    afterAll(async () => {
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
          await page.click("[data-annotation-id='34R']");
          await page.waitForFunction(
            `${getQuerySelector("30R")}.children.length === 0`
          );

          // Click on Restore button.
          await page.click("[data-annotation-id='37R']");
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
              `${num},Insert${num},Tresni${num}`,
              {
                delay: 10,
              }
            );

            // Click on AddItem button.
            await page.click("[data-annotation-id='38R']");

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
          await page.click("[data-annotation-id='37R']");
          await page.waitForFunction(
            `${getQuerySelector("30R")}.children.length === ${len}`
          );

          for (const num of [2, 5]) {
            --len;
            await clearInput(page, getSelector("39R"));
            await page.type(getSelector("39R"), `${num}`);

            // Click on DeleteItem button.
            await page.click("[data-annotation-id='36R']");

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

    beforeAll(async () => {
      pages = await loadAndWait("js-colors.pdf", getSelector("34R"));
    });

    afterAll(async () => {
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
            await page.type(getSelector("34R"), `${name}`, {
              delay: 10,
            });

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

              await page.click(`[data-annotation-id='${id}R']`);
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

    beforeAll(async () => {
      pages = await loadAndWait("issue13132.pdf", getSelector("171R"));
    });

    afterAll(async () => {
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

            await page.type(getSelector(id), val.toString(), {
              delay: 200,
            });
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

    beforeAll(async () => {
      pages = await loadAndWait("evaljs.pdf", getSelector("55R"));
    });

    afterAll(async () => {
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
          await page.click("[data-annotation-id='57R']");
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

            await page.click("[data-annotation-id='57R']");
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

    beforeAll(async () => {
      pages = await loadAndWait("issue13269.pdf", getSelector("27R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("secHandler.pdf", getSelector("25R"));
    });

    afterAll(async () => {
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
              await page.click("[data-annotation-id='26R']");
            }
          );
          expect(text).withContext(`In ${browserName}`).toEqual("Standard");
        })
      );
    });
  });

  describe("in issue14307.pdf (1)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check input for US zip format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [browserName, page] of pages) {
        await waitForScripting(page);

        await clearInput(page, getSelector("29R"));
        await clearInput(page, getSelector("30R"));

        await page.focus(getSelector("29R"));
        await page.type(getSelector("29R"), "12A", { delay: 200 });
        await page.waitForFunction(
          `${getQuerySelector("29R")}.value !== "12A"`
        );

        let text = await page.$eval(getSelector(`29R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("12");

        await page.focus(getSelector("29R"));
        await page.type(getSelector("29R"), "34", { delay: 200 });
        await page.click("[data-annotation-id='30R']");

        await page.waitForFunction(
          `${getQuerySelector("29R")}.value !== "1234"`
        );

        text = await page.$eval(getSelector(`29R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("");

        await page.focus(getSelector("29R"));
        await page.type(getSelector("29R"), "12345", { delay: 200 });
        await page.click("[data-annotation-id='30R']");

        text = await page.$eval(getSelector(`29R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("12345");
      }
    });
  });

  describe("in issue14307.pdf (2)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check input for US phone number (long) format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [browserName, page] of pages) {
        await waitForScripting(page);

        await clearInput(page, getSelector("29R"));
        await clearInput(page, getSelector("30R"));

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "(123) 456A", { delay: 200 });
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value !== "(123) 456A"`
        );

        let text = await page.$eval(getSelector(`30R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("(123) 456");

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "-789", { delay: 200 });
        await page.click("[data-annotation-id='29R']");

        await page.waitForFunction(
          `${getQuerySelector("30R")}.value !== "(123) 456-789"`
        );

        text = await page.$eval(getSelector(`30R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("");

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "(123) 456-7890", { delay: 200 });
        await page.click("[data-annotation-id='29R']");

        text = await page.$eval(getSelector("30R"), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("(123) 456-7890");
      }
    });
  });

  describe("in issue14307.pdf (3)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14307.pdf", getSelector("30R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check input for US phone number (short) format", async () => {
      // Run the tests sequentially to avoid any focus issues between the two
      // browsers when an alert is displayed.
      for (const [browserName, page] of pages) {
        await waitForScripting(page);

        await clearInput(page, getSelector("29R"));
        await clearInput(page, getSelector("30R"));

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "123A", { delay: 200 });
        await page.waitForFunction(
          `${getQuerySelector("30R")}.value !== "123A"`
        );

        let text = await page.$eval(getSelector(`30R`), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("123");

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "-456", { delay: 200 });
        await page.click("[data-annotation-id='29R']");

        await page.waitForFunction(
          `${getQuerySelector("30R")}.value !== "123-456"`
        );

        text = await page.$eval(getSelector("30R"), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("");

        await page.focus(getSelector("30R"));
        await page.type(getSelector("30R"), "123-4567", { delay: 200 });
        await page.click("[data-annotation-id='29R']");

        text = await page.$eval(getSelector("30R"), el => el.value);
        expect(text).withContext(`In ${browserName}`).toEqual("123-4567");
      }
    });
  });

  describe("in issue14862.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14862.pdf", getSelector("27R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must convert input to uppercase", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("27R"), "Hello", { delay: 200 });
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value !== "Hello"`
          );

          let text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HELLO");

          await page.type(getSelector("27R"), " world", { delay: 200 });
          await page.waitForFunction(
            `${getQuerySelector("27R")}.value !== "HELLO world"`
          );

          text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HELLO WORLD");

          await page.keyboard.press("Backspace");
          await page.keyboard.press("Backspace");

          await page.waitForFunction(
            `${getQuerySelector("27R")}.value !== "HELLO WORLD"`
          );

          text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HELLO WOR");

          await page.type(getSelector("27R"), "12.dL", { delay: 200 });

          await page.waitForFunction(
            `${getQuerySelector("27R")}.value !== "HELLO WOR"`
          );

          text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HELLO WORDL");

          await page.type(getSelector("27R"), " ", { delay: 200 });

          await kbDeleteLastWord(page);

          await page.waitForFunction(
            `${getQuerySelector("27R")}.value !== "HELLO WORDL "`
          );

          text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HELLO ");

          await page.$eval(getSelector("27R"), el => {
            // Select LL
            el.selectionStart = 2;
            el.selectionEnd = 4;
          });

          await page.keyboard.press("a");
          text = await page.$eval(getSelector("27R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("HEAO ");
        })
      );
    });

    it("must check that an infinite loop is not triggered", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.click(getSelector("28R"));
          await page.$eval(getSelector("28R"), el =>
            el.setSelectionRange(0, 0)
          );

          await page.type(getSelector("28R"), "Hello", { delay: 200 });
          await page.waitForFunction(
            `${getQuerySelector("28R")}.value !== "123"`
          );

          let text = await page.$eval(getSelector("28R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("Hello123");

          // The action will trigger a calculateNow which itself
          // will trigger a resetForm (inducing a calculateNow) and a
          // calculateNow.
          await page.click("[data-annotation-id='31R']");

          await page.waitForFunction(
            `${getQuerySelector("28R")}.value !== "Hello123"`
          );

          // Without preventing against infinite loop the field is empty.
          text = await page.$eval(getSelector("28R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("123");
        })
      );
    });
  });

  describe("in issue14705.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14705.pdf", getSelector("29R"));
      pages.map(async ([, page]) => {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
        });
      });
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that field value is correctly updated", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("29R"), "Hello World", { delay: 200 });
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1766987.pdf", getSelector("75R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue15053.pdf", getSelector("44R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a button and text field with a border are hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          let visibility = await page.$eval(
            "[data-annotation-id='35R']",
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          visibility = await page.$eval(
            "[data-annotation-id='51R']",
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          await page.click(getSelector("44R"));
          await page.waitForFunction(
            `document.querySelector("[data-annotation-id='35R']").style.visibility === "hidden"`
          );

          visibility = await page.$eval(
            "[data-annotation-id='35R']",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          visibility = await page.$eval(
            "[data-annotation-id='51R']",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");
        })
      );
    });
  });

  describe("in bug1675139.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("bug1675139.pdf", getSelector("48R"));
    });

    afterAll(async () => {
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
                `[data-annotation-id='${ref}R']`,
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

    beforeAll(async () => {
      pages = await loadAndWait("issue15092.pdf", getSelector("39R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a value is correctly updated on a field and its siblings", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await clearInput(page, getSelector("39R"));
          await page.type(getSelector("39R"), "123", { delay: 10 });

          await clearInput(page, getSelector("42R"));
          await page.type(getSelector("42R"), "456", { delay: 10 });

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

    beforeAll(async () => {
      pages = await loadAndWait("bug1782564.pdf", getSelector("7R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that charLimit is correctly set", async () => {
      await Promise.all(
        pages.map(async ([, page]) => {
          await waitForScripting(page);

          // The default charLimit is 0, which indicates unlimited text length.
          await page.type(getSelector("7R"), "abcdefghij", { delay: 10 });
          await page.waitForFunction(
            `${getQuerySelector("7R")}.value === "abcdefghij"`
          );

          // Increase the charLimit to 1 (this truncates the existing text).
          await page.click(getSelector("9R"));
          await waitForSandboxTrip(page);
          await page.waitForFunction(`${getQuerySelector("7R")}.value === "a"`);

          await clearInput(page, getSelector("7R"));
          await page.type(getSelector("7R"), "xyz", { delay: 10 });
          await page.waitForFunction(`${getQuerySelector("7R")}.value === "x"`);

          // Increase the charLimit to 2.
          await page.click(getSelector("9R"));
          await waitForSandboxTrip(page);

          await clearInput(page, getSelector("7R"));
          await page.type(getSelector("7R"), "xyz", { delay: 10 });
          await page.waitForFunction(
            `${getQuerySelector("7R")}.value === "xy"`
          );
        })
      );
    });
  });

  describe("in bug1802888.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("bug1802888.pdf", getSelector("30R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check field value is treated by default as a number", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("30R"), "123", {
            delay: 10,
          });
          await page.click(getSelector("31R"));
          await page.type(getSelector("31R"), "456", {
            delay: 10,
          });
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

    beforeAll(async () => {
      pages = await loadAndWait("issue15753.pdf", getSelector("27R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check field value is correctly updated when committed with ENTER key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.type(getSelector("27R"), "abc", {
            delay: 10,
          });
          await page.keyboard.press("Enter");
          await page.waitForFunction(`${getQuerySelector("28R")}.value !== ""`);
          let value = await page.$eval(getSelector("28R"), el => el.value);
          expect(value).withContext(`In ${browserName}`).toEqual("abc");

          await page.type(getSelector("27R"), "def", {
            delay: 10,
          });

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

    beforeAll(async () => {
      pages = await loadAndWait("issue15815.pdf", getSelector("24R"));
    });

    afterAll(async () => {
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
            await page.click("[data-annotation-id='28R']");
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

    beforeAll(async () => {
      pages = await loadAndWait("issue15818.pdf", getSelector("27R"));
    });

    afterAll(async () => {
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

          await page.type(getSelector("30R"), "abc", { delay: 200 });
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

    beforeAll(async () => {
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

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1811694.pdf", getSelector("25R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a field value with a number isn't changed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          await page.click(getSelector("25R"));
          await page.type(getSelector("25R"), "00000000123", { delay: 10 });

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

    beforeAll(async () => {
      pages = await loadAndWait("bug1811510.pdf", getSelector("22R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue16067.pdf", getSelector("6R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1825002.pdf", getSelector("23R"));
    });

    afterAll(async () => {
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
          await page.type(getSelector("26R"), "abcde", { delay: 10 });
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1844576.pdf", getSelector("9R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a field has the correct formatted value", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const hasVisibleCanvas = await page.$eval(
            `[data-annotation-id="9R"] > canvas`,
            elem => elem && !elem.hasAttribute("hidden")
          );
          expect(hasVisibleCanvas)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          const hasHiddenInput = await page.$eval(
            `[data-annotation-id="9R"] > input`,
            elem => elem?.hasAttribute("hidden")
          );
          expect(hasHiddenInput).withContext(`In ${browserName}`).toEqual(true);

          await page.click(getSelector("12R"));
          await page.waitForSelector(
            `[data-annotation-id="9R"] > canvas[hidden]`
          );

          const hasHiddenCanvas = await page.$eval(
            `[data-annotation-id="9R"] > canvas`,
            elem => elem?.hasAttribute("hidden")
          );
          expect(hasHiddenCanvas)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          const hasVisibleInput = await page.$eval(
            `[data-annotation-id="9R"] > input`,
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

    beforeAll(async () => {
      pages = await loadAndWait(
        "annotation_hidden_noview.pdf",
        getSelector("11R")
      );
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue16863.pdf", getSelector("334R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      otherPages = await Promise.all(
        global.integrationSessions.map(async session =>
          session.browser.newPage()
        )
      );
      pages = await loadAndWait("evaljs.pdf", getSelector("55R"));
    });

    afterAll(async () => {
      await closePages(pages);
      await Promise.all(otherPages.map(page => page.close()));
    });

    it("must check that focus/blur callbacks aren't called", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("55R"));
          await page.type(getSelector("55R"), "Hello", { delay: 10 });
          await page.click(getSelector("56R"));

          await page.click(getSelector("55R"));
          await page.type(getSelector("55R"), " World", { delay: 10 });

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

    beforeAll(async () => {
      pages = await loadAndWait("bug1863910.pdf", getSelector("25R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1860602.pdf", getSelector("22R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue17540.pdf", getSelector("15R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1889122.pdf", getSelector("24R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the zip code is correctly formatted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          await page.click(getSelector("24R"));
          await page.type(getSelector("24R"), "01234", { delay: 10 });
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

    beforeAll(async () => {
      pages = await loadAndWait("issue17998.pdf", getSelector("7R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue18305.pdf", getSelector("7R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that PageOpen/PageClose actions are correctly executed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          const buttonSelector = `[data-annotation-id="25R"`;
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

    beforeAll(async () => {
      pages = await loadAndWait("issue18536.pdf", getSelector("34R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue18561.pdf", getSelector("24R"));
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("bug1918115.pdf", getSelector("33R"));
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the computed value is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page], i) => {
          await waitForScripting(page);

          const inputSelector = getSelector("33R");
          await page.click(inputSelector);
          await page.type(inputSelector, "7");
          await page.click(getSelector("34R"));
          await page.waitForFunction(
            `${getQuerySelector("35R")}.value === "324,00"`
          );
        })
      );
    });
  });
});
