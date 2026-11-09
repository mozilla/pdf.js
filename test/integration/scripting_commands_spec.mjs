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
  getAnnotationSelector,
  getSelector,
  loadAndWait,
  waitForSandboxTrip,
  waitForScripting,
} from "./test_utils.mjs";

// Must be larger than LAYOUT_CHANGE_DELAY in web/pdf_scripting_manager.js.
const LAYOUT_CHANGE_DELAY = 600;

// Count the prints and downloads, whether they come from the sandbox or from
// a named action, without printing or downloading.
async function countPrivilegedCommands(page) {
  await page.evaluate(() => {
    const app = window.PDFViewerApplication;
    window.counts = { print: 0, download: 0 };
    window.print = () => {
      window.counts.print++;
    };
    app._downloadOrSave = async () => {
      window.counts.download++;
    };
  });
}

async function expectCounts(page, browserName, print, download = 0) {
  expect(await page.evaluate(() => window.counts))
    .withContext(`In ${browserName}`)
    .toEqual({ print, download });
}

function getLog(page) {
  return page.$eval(getSelector("4R"), el => el.value);
}

async function clickAndWait(page, id, options) {
  await page.click(getSelector(id), options);
  await waitForSandboxTrip(page);
}

async function pressEnterAndWait(page) {
  await page.keyboard.press("Enter");
  await waitForSandboxTrip(page);
}

function waitForFocus(page, id) {
  return page.waitForFunction(
    sel => document.activeElement === document.querySelector(sel),
    {},
    getSelector(id)
  );
}

function waitForVisible(page, id) {
  return page.waitForFunction(
    sel => document.querySelector(sel).style.visibility === "visible",
    {},
    getAnnotationSelector(id)
  );
}

function waitForLayoutChangeDelay(page) {
  return page.evaluate(
    delay =>
      new Promise(resolve => {
        setTimeout(resolve, delay);
      }),
    LAYOUT_CHANGE_DELAY
  );
}

// Click on the element which makes a script focus the target, then press
// Enter on it once the layout change delay has elapsed.
async function pressEnterOnScriptFocused(page, scriptId, targetId) {
  await page.click(getSelector(scriptId));
  await waitForFocus(page, targetId);
  await waitForLayoutChangeDelay(page);
  await pressEnterAndWait(page);
}

// Print with a click, then save with the keyboard.
async function printAndSave(page, printId, saveId) {
  await clickAndWait(page, printId);
  await page.focus(getSelector(saveId));
  await pressEnterAndWait(page);
}

// A click on the print button is ignored right after a layout change, but not
// once the delay has elapsed.
async function checkClickAfterLayoutChange(page, browserName, id) {
  await clickAndWait(page, id);
  await expectCounts(page, browserName, 0);

  await waitForLayoutChangeDelay(page);
  await clickAndWait(page, id);
  await expectCounts(page, browserName, 1);
}

function dispatchFromSandbox(page, details) {
  return page.evaluate(list => {
    for (const detail of list) {
      window.dispatchEvent(new CustomEvent("updatefromsandbox", { detail }));
    }
  }, details);
}

describe("Scripting commands", () => {
  describe("in doc_actions.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
      await Promise.all(pages.map(([, page]) => waitForScripting(page)));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("coalesces concurrent downloads and allows another after completion", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForSandboxTrip(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { promise, resolve } = Promise.withResolvers();
            let downloads = 0;
            app._downloadOrSave = () => {
              downloads++;
              return promise;
            };
            const first = app.downloadOrSave();
            const second = app.downloadOrSave();
            const concurrentDownloads = downloads;
            resolve();
            await Promise.all([first, second]);
            await app.downloadOrSave();
            return {
              concurrentDownloads,
              sharedPromise: first === second,
              downloads,
            };
          });

          expect(result).withContext(`In ${browserName}`).toEqual({
            concurrentDownloads: 1,
            sharedPromise: true,
            downloads: 2,
          });
        })
      );
    });
  });

  describe("in scripting_user_activation.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "scripting_user_activation.pdf",
        getSelector("7R")
      );
      await Promise.all(
        pages.map(async ([, page]) => {
          await waitForScripting(page);
          await countPrivilegedCommands(page);
        })
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("prints and saves from push buttons, with the mouse or the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await printAndSave(page, "7R", "8R");
          await expectCounts(page, browserName, 1, 1);
        })
      );
    });

    it("prints and saves from named actions, with the mouse or the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await printAndSave(page, "14R", "15R");
          await expectCounts(page, browserName, 1, 1);
        })
      );
    });

    it("ignores the commands without a valid activation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Puppeteer's evaluate gives the page a transient user activation,
          // which mustn't be enough.
          expect(await page.evaluate(() => navigator.userActivation.isActive))
            .withContext(`In ${browserName}`)
            .toBeTrue();
          await dispatchFromSandbox(page, [
            { command: "print" },
            { command: "SaveAs" },
            { command: "print", activation: "bogus" },
            { command: "SaveAs", activation: "bogus" },
          ]);
          await waitForSandboxTrip(page);

          await expectCounts(page, browserName, 0);
        })
      );
    });

    it("doesn't let a compromised sandbox reuse an activation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Intercept what the sandbox sends to the viewer.
          await page.evaluate(() => {
            const dispatchEvent = window.dispatchEvent.bind(window);
            const replay = (command, activation) =>
              dispatchEvent(
                new CustomEvent("updatefromsandbox", {
                  detail: { command, activation },
                })
              );
            window.dispatchEvent = event => {
              const { command, activation } = event.detail || {};
              if (event.type === "updatefromsandbox" && activation) {
                if (command === "SaveAs") {
                  // Keep the activation for later.
                  setTimeout(() => {
                    replay("SaveAs", activation);
                    replay("print", activation);
                  }, 0);
                  return true;
                }
                if (command === "print") {
                  replay("print", activation);
                  replay("SaveAs", activation);
                }
              }
              return dispatchEvent(event);
            };
          });

          // A replay from a later timer must be rejected.
          await clickAndWait(page, "8R");
          await waitForSandboxTrip(page);
          await expectCounts(page, browserName, 0);

          // And can only be used once.
          await clickAndWait(page, "7R");
          await expectCounts(page, browserName, 1);
        })
      );
    });

    it("allows only one privileged command per user gesture", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Mouse Down prints and Action saves.
          await clickAndWait(page, "13R");
          await expectCounts(page, browserName, 1);
        })
      );
    });

    it("doesn't print from focus changes made by a timer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(() => {
            window.focusCount = 0;
            const fields = new Set(["5R", "6R"]);
            document.addEventListener("focusin", ({ target }) => {
              if (fields.has(target.getAttribute("data-element-id"))) {
                window.focusCount++;
              }
            });
            window.focusEvents = { scripted: 0, user: 0 };
            window.PDFViewerApplication.eventBus.on(
              "dispatcheventinsandbox",
              ({ detail, scripted }) => {
                if (detail.name === "Focus") {
                  window.focusEvents[scripted ? "scripted" : "user"]++;
                }
              }
            );
          });

          // Start a timer which moves the focus between two fields which
          // print on focus.
          await page.click(getSelector("9R"));
          await page.waitForFunction(() => window.focusCount >= 4);
          // An unrelated user gesture.
          await page.click("#zoomInButton");
          await page.waitForFunction(() => window.focusCount >= 8);
          await waitForSandboxTrip(page);

          await expectCounts(page, browserName, 0);
          const { scripted, user } = await page.evaluate(
            () => window.focusEvents
          );
          expect(scripted)
            .withContext(`In ${browserName}`)
            .toBeGreaterThanOrEqual(8);
          expect(user).withContext(`In ${browserName}`).toEqual(0);
        })
      );
    });

    it("doesn't print with the keyboard on a button focused by a script", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await pressEnterOnScriptFocused(page, "10R", "7R");
          expect(await getLog(page))
            .withContext(`In ${browserName}`)
            .toEqual("print");
          await expectCounts(page, browserName, 0);

          // A click is fine.
          await clickAndWait(page, "7R");
          await expectCounts(page, browserName, 1);
        })
      );
    });

    it("doesn't print with the keyboard on a button focused by any focus request", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(() => {
            window.actions = 0;
            window.PDFViewerApplication.eventBus.on(
              "dispatcheventinsandbox",
              ({ detail }) => {
                if (detail.id === "7R" && detail.name === "Action") {
                  window.actions++;
                }
              }
            );
          });

          // The annotation layer gives the focus whatever the value is, hence
          // the protection mustn't depend on it.
          for (const focus of [false, null, 0, ""]) {
            await page.focus(getSelector("4R"));
            await dispatchFromSandbox(page, [{ id: "7R", focus }]);
            await waitForFocus(page, "7R");
            await waitForLayoutChangeDelay(page);
            await pressEnterAndWait(page);
          }

          expect(await page.evaluate(() => window.actions))
            .withContext(`In ${browserName}`)
            .toEqual(4);
          await expectCounts(page, browserName, 0);
        })
      );
    });

    it("doesn't print when a script shows the button under the pointer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const { x, y } = await page.$eval(getSelector("11R"), el => {
            const { left, top, width, height } = el.getBoundingClientRect();
            return { x: left + width / 2, y: top + height / 2 };
          });
          // Mouse Down on the cover shows the button which prints on Mouse Up.
          await page.mouse.move(x, y);
          await page.mouse.down();
          await waitForVisible(page, "12R");
          await page.mouse.up();
          await waitForSandboxTrip(page);

          expect(await getLog(page))
            .withContext(`In ${browserName}`)
            .toEqual("coverPrint");
          await expectCounts(page, browserName, 0);

          // Once the button has been visible long enough, it can be used.
          await waitForLayoutChangeDelay(page);
          await clickAndWait(page, "12R");
          await expectCounts(page, browserName, 1);
        })
      );
    });

    it("doesn't run a named action with the keyboard on a button focused by a script", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await pressEnterOnScriptFocused(page, "16R", "14R");
          await expectCounts(page, browserName, 0);

          // A click is fine.
          await clickAndWait(page, "14R");
          await expectCounts(page, browserName, 1);
        })
      );
    });

    it("doesn't run a named action right after a script changed the layout", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // The script shows a hidden button.
          await page.click(getSelector("18R"));
          await waitForVisible(page, "17R");
          await checkClickAfterLayoutChange(page, browserName, "17R");
        })
      );
    });

    it("doesn't count time spent in the script toward the layout change delay", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Focus is requested before a long script finishes.
          const focused = waitForFocus(page, "7R");
          await page.click(getSelector("19R"));
          await focused;
          await checkClickAfterLayoutChange(page, browserName, "7R");
        })
      );
    });

    it("starts the layout change delay once a deferred change is applied", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // A busy 0ms timer, queued before the focus request, runs before the
          // deferred focus, which is hence applied long after the request.
          const focused = waitForFocus(page, "7R");
          await page.click(getSelector("23R"));
          await focused;
          await checkClickAfterLayoutChange(page, browserName, "7R");
        })
      );
    });

    it("only shows a dialog for events allowed by the viewer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(() => {
            window.alerts = [];
            window.alert = msg => window.alerts.push(msg);
          });

          // Mouse Enter.
          await page.hover(getSelector("21R"));
          await waitForSandboxTrip(page);
          // A timer.
          await clickAndWait(page, "22R");
          await waitForSandboxTrip(page);
          expect(await page.evaluate(() => window.alerts))
            .withContext(`In ${browserName}`)
            .toEqual([]);

          // Validate, when committing a value.
          await page.type(getSelector("20R"), "abc");
          await page.keyboard.press("Tab");
          await waitForSandboxTrip(page);
          expect(await page.evaluate(() => window.alerts))
            .withContext(`In ${browserName}`)
            .toEqual(["validate"]);
        })
      );
    });

    // Record whether the annotation handler canceled the click, then prevent
    // navigation in the test.
    async function recordLinkClicks(page, selector) {
      await page.evaluate(sel => {
        window.linkClicks = [];
        for (const type of ["click", "auxclick"]) {
          document.addEventListener(type, event => {
            if (event.target.closest(sel)) {
              window.linkClicks.push(!event.defaultPrevented);
              event.preventDefault();
            }
          });
        }
      }, selector);
    }

    function getLinkClicks(page) {
      return page.evaluate(() => window.linkClicks);
    }

    it("doesn't follow a link with the keyboard on a button focused by a script", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await recordLinkClicks(page, getSelector("24R"));

          await pressEnterOnScriptFocused(page, "25R", "24R");
          expect(await getLinkClicks(page))
            .withContext(`In ${browserName}`)
            .toEqual([false]);

          // A click is fine.
          await clickAndWait(page, "24R");
          expect(await getLinkClicks(page))
            .withContext(`In ${browserName}`)
            .toEqual([false, true]);
        })
      );
    });

    it("doesn't open a link with a middle click right after a script changed the layout", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await recordLinkClicks(page, getSelector("24R"));

          // A script's focus request triggers the layout-change guard.
          await page.click(getSelector("25R"));
          await waitForFocus(page, "24R");
          await clickAndWait(page, "24R", { button: "middle" });
          expect(await getLinkClicks(page))
            .withContext(`In ${browserName}`)
            .toEqual([false]);

          await waitForLayoutChangeDelay(page);
          await clickAndWait(page, "24R", { button: "middle" });
          expect(await getLinkClicks(page))
            .withContext(`In ${browserName}`)
            .toEqual([false, true]);
        })
      );
    });

    it("resets the form and runs the chained script of a reset button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type(getSelector("26R"), "abc");
          await page.keyboard.press("Tab");
          await waitForSandboxTrip(page);
          await clickAndWait(page, "27R");

          expect(await page.$eval(getSelector("26R"), el => el.value))
            .withContext(`In ${browserName}`)
            .toEqual("");
          expect(await getLog(page))
            .withContext(`In ${browserName}`)
            .toEqual("resetJs");
        })
      );
    });
  });
});
