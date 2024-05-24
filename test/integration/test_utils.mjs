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

import os from "os";
const isMac = os.platform() === "darwin";

function loadAndWait(filename, selector, zoom, pageSetup, options) {
  return Promise.all(
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

      let app_options = "";
      if (options) {
        // Options must be handled in app.js::_parseHashParams.
        for (const [key, value] of Object.entries(options)) {
          app_options += `&${key}=${encodeURIComponent(value)}`;
        }
      }
      const url = `${
        global.integrationBaseUrl
      }?file=/test/pdfs/${filename}#zoom=${zoom ?? "page-fit"}${app_options}`;

      await page.goto(url);
      if (pageSetup) {
        await pageSetup(page);
      }

      await page.bringToFront();
      if (selector) {
        await page.waitForSelector(selector, {
          timeout: 0,
        });
      }
      return [session.name, page];
    })
  );
}

function createPromise(page, callback) {
  return page.evaluateHandle(
    // eslint-disable-next-line no-eval
    cb => [new Promise(eval(`(${cb})`))],
    callback.toString()
  );
}

function awaitPromise(promise) {
  return promise.evaluate(([p]) => p);
}

function closePages(pages) {
  return Promise.all(
    pages.map(async ([_, page]) => {
      // Avoid to keep something from a previous test.
      await page.evaluate(() => window.localStorage.clear());
      await page.close({ runBeforeUnload: false });
    })
  );
}

async function waitForSandboxTrip(page) {
  const handle = await page.evaluateHandle(() => [
    new Promise(resolve => {
      window.addEventListener("sandboxtripend", resolve, { once: true });
      window.PDFViewerApplication.pdfScriptingManager.sandboxTrip();
    }),
  ]);
  await awaitPromise(handle);
}

function waitForTimeout(milliseconds) {
  /**
   * Wait for the given number of milliseconds.
   *
   * Note that waiting for an arbitrary time in tests is discouraged because it
   * can easily cause intermittent failures, which is why this functionality is
   * no longer provided by Puppeteer 22+ and we have to implement it ourselves
   * for the remaining callers in the integration tests. We should avoid
   * creating new usages of this function; instead please refer to the better
   * alternatives at https://github.com/puppeteer/puppeteer/pull/11780.
   */
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function clearInput(page, selector) {
  await page.click(selector);
  await kbSelectAll(page);
  await page.keyboard.press("Backspace");
  await page.waitForFunction(
    `document.querySelector('${selector}').value === ""`
  );
}

function getSelector(id) {
  return `[data-element-id="${id}"]`;
}

async function getRect(page, selector) {
  // In Chrome something is wrong when serializing a `DomRect`,
  // so we extract the values and return them ourselves.
  return page.$eval(selector, el => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  });
}

function getQuerySelector(id) {
  return `document.querySelector('${getSelector(id)}')`;
}

function getComputedStyleSelector(id) {
  return `getComputedStyle(${getQuerySelector(id)})`;
}

function getEditorSelector(n) {
  return `#pdfjs_internal_editor_${n}`;
}

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

async function getSpanRectFromText(page, pageNumber, text) {
  await page.waitForSelector(
    `.page[data-page-number="${pageNumber}"] > .textLayer .endOfContent`
  );
  return page.evaluate(
    (number, content) => {
      for (const el of document.querySelectorAll(
        `.page[data-page-number="${number}"] > .textLayer > span`
      )) {
        if (el.textContent === content) {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }
      }
      return null;
    },
    pageNumber,
    text
  );
}

async function waitForEvent(page, eventName, timeout = 5000) {
  const handle = await page.evaluateHandle(
    (name, timeOut) => {
      let callback = null;
      return [
        Promise.race([
          new Promise(resolve => {
            // add event listener and wait for event to fire before returning
            callback = () => resolve(false);
            document.addEventListener(name, callback, { once: true });
          }),
          new Promise(resolve => {
            setTimeout(() => {
              document.removeEventListener(name, callback);
              resolve(true);
            }, timeOut);
          }),
        ]),
      ];
    },
    eventName,
    timeout
  );
  const hasTimedout = await awaitPromise(handle);
  if (hasTimedout === true) {
    console.log(`waitForEvent: timeout waiting for ${eventName}`);
  }
}

async function waitForStorageEntries(page, nEntries) {
  return page.waitForFunction(
    n => window.PDFViewerApplication.pdfDocument.annotationStorage.size === n,
    {},
    nEntries
  );
}

async function waitForSerialized(page, nEntries) {
  return page.waitForFunction(
    n =>
      (window.PDFViewerApplication.pdfDocument.annotationStorage.serializable
        .map?.size ?? 0) === n,
    {},
    nEntries
  );
}

async function waitForSelectedEditor(page, selector) {
  return page.waitForSelector(`${selector}.selectedEditor`);
}

async function waitForUnselectedEditor(page, selector) {
  return page.waitForSelector(`${selector}:not(.selectedEditor)`);
}

async function mockClipboard(pages) {
  return Promise.all(
    pages.map(async ([_, page]) => {
      await page.evaluate(() => {
        let data = null;
        const clipboard = {
          writeText: async text => (data = text),
          readText: async () => data,
        };
        Object.defineProperty(navigator, "clipboard", { value: clipboard });
      });
    })
  );
}

async function pasteFromClipboard(page, data, selector, timeout = 100) {
  await page.evaluate(async dat => {
    const items = Object.create(null);
    for (const [type, value] of Object.entries(dat)) {
      if (value.startsWith("data:")) {
        const resp = await fetch(value);
        items[type] = await resp.blob();
      } else {
        items[type] = new Blob([value], { type });
      }
    }
    await navigator.clipboard.write([new ClipboardItem(items)]);
  }, data);

  let hasPasteEvent = false;
  while (!hasPasteEvent) {
    // We retry to paste if nothing has been pasted before the timeout.
    const handle = await page.evaluateHandle(
      (sel, timeOut) => {
        let callback = null;
        return [
          Promise.race([
            new Promise(resolve => {
              callback = e => resolve(e.clipboardData.items.length !== 0);
              (sel ? document.querySelector(sel) : document).addEventListener(
                "paste",
                callback,
                {
                  once: true,
                }
              );
            }),
            new Promise(resolve => {
              setTimeout(() => {
                document
                  .querySelector(sel)
                  .removeEventListener("paste", callback);
                resolve(false);
              }, timeOut);
            }),
          ]),
        ];
      },
      selector,
      timeout
    );
    await kbPaste(page);
    hasPasteEvent = await awaitPromise(handle);
  }
}

async function getSerialized(page, filter = undefined) {
  const values = await page.evaluate(() => {
    const { map } =
      window.PDFViewerApplication.pdfDocument.annotationStorage.serializable;
    if (!map) {
      return [];
    }
    const vals = Array.from(map.values());
    for (const value of vals) {
      for (const [k, v] of Object.entries(value)) {
        // Puppeteer don't serialize typed array correctly, so we convert them
        // to arrays.
        if (ArrayBuffer.isView(v)) {
          value[k] = Array.from(v);
        }
      }
    }
    return vals;
  });
  return filter ? values.map(filter) : values;
}

async function getFirstSerialized(page, filter = undefined) {
  return (await getSerialized(page, filter))[0];
}

function getAnnotationStorage(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.map?.entries() ||
        []
    )
  );
}

function waitForEntryInStorage(page, key, value, checker = (x, y) => x === y) {
  return page.waitForFunction(
    (k, v, c) => {
      const { map } =
        window.PDFViewerApplication.pdfDocument.annotationStorage.serializable;
      // eslint-disable-next-line no-eval
      return map && eval(`(${c})`)(JSON.stringify(map.get(k)), v);
    },
    {},
    key,
    JSON.stringify(value),
    checker.toString()
  );
}

function getEditors(page, kind) {
  return page.evaluate(aKind => {
    const elements = document.querySelectorAll(`.${aKind}Editor`);
    const results = [];
    for (const { id } of elements) {
      results.push(id);
    }
    return results;
  }, kind);
}

function getEditorDimensions(page, id) {
  return page.evaluate(n => {
    const element = document.getElementById(`pdfjs_internal_editor_${n}`);
    const { style } = element;
    return {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
    };
  }, id);
}

async function serializeBitmapDimensions(page) {
  await page.waitForFunction(() => {
    try {
      const map =
        window.PDFViewerApplication.pdfDocument.annotationStorage.serializable
          .map;
      return !!map;
    } catch {
      return false;
    }
  });

  return page.evaluate(() => {
    const { map } =
      window.PDFViewerApplication.pdfDocument.annotationStorage.serializable;
    return map
      ? Array.from(map.values(), x => ({
          width: x.bitmap.width,
          height: x.bitmap.height,
        }))
      : [];
  });
}

async function dragAndDropAnnotation(page, startX, startY, tX, tY) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + tX, startY + tY);
  await page.mouse.up();
  await page.waitForSelector("#viewer:not(.noUserSelect)");
}

function waitForAnnotationEditorLayer(page) {
  return createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "annotationeditorlayerrendered",
      resolve
    );
  });
}

async function scrollIntoView(page, selector) {
  const handle = await page.evaluateHandle(
    sel => [
      new Promise(resolve => {
        const container = document.getElementById("viewerContainer");
        if (container.scrollHeight <= container.clientHeight) {
          resolve();
          return;
        }
        container.addEventListener("scrollend", resolve, { once: true });
        const element = document.querySelector(sel);
        element.scrollIntoView({ behavior: "instant", block: "start" });
      }),
    ],
    selector
  );
  return awaitPromise(handle);
}

async function firstPageOnTop(page) {
  const handle = await page.evaluateHandle(() => [
    new Promise(resolve => {
      const container = document.getElementById("viewerContainer");
      if (container.scrollTop === 0 && container.scrollLeft === 0) {
        resolve();
        return;
      }
      container.addEventListener("scrollend", resolve, { once: true });
      container.scrollTo(0, 0);
    }),
  ]);
  return awaitPromise(handle);
}

async function hover(page, selector) {
  const rect = await getRect(page, selector);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

const modifier = isMac ? "Meta" : "Control";
async function kbCopy(page) {
  await page.keyboard.down(modifier);
  await page.keyboard.press("c", { commands: ["Copy"] });
  await page.keyboard.up(modifier);
}
async function kbPaste(page) {
  await page.keyboard.down(modifier);
  await page.keyboard.press("v", { commands: ["Paste"] });
  await page.keyboard.up(modifier);
}
async function kbUndo(page) {
  await page.keyboard.down(modifier);
  await page.keyboard.press("z");
  await page.keyboard.up(modifier);
}
async function kbRedo(page) {
  if (isMac) {
    await page.keyboard.down("Meta");
    await page.keyboard.down("Shift");
    await page.keyboard.press("z");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Meta");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("y");
    await page.keyboard.up("Control");
  }
}
async function kbSelectAll(page) {
  await page.keyboard.down(modifier);
  await page.keyboard.press("a", { commands: ["SelectAll"] });
  await page.keyboard.up(modifier);
}
async function kbModifierDown(page) {
  await page.keyboard.down(modifier);
}
async function kbModifierUp(page) {
  await page.keyboard.up(modifier);
}
async function kbGoToEnd(page) {
  if (isMac) {
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowDown", {
      commands: ["MoveToEndOfDocument"],
    });
    await page.keyboard.up("Meta");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("End");
    await page.keyboard.up("Control");
  }
}
async function kbGoToBegin(page) {
  if (isMac) {
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowUp", {
      commands: ["MoveToBeginningOfDocument"],
    });
    await page.keyboard.up("Meta");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("Home");
    await page.keyboard.up("Control");
  }
}
async function kbBigMoveLeft(page) {
  if (isMac) {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Control");
  }
}
async function kbBigMoveRight(page) {
  if (isMac) {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Control");
  }
}
async function kbBigMoveUp(page) {
  if (isMac) {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Shift");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Control");
  }
}
async function kbBigMoveDown(page) {
  if (isMac) {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Shift");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Control");
  }
}

async function kbDeleteLastWord(page) {
  if (isMac) {
    await page.keyboard.down("Alt");
    await page.keyboard.press("Backspace");
    await page.keyboard.up("Alt");
  } else {
    await page.keyboard.down("Control");
    await page.keyboard.press("Backspace");
    await page.keyboard.up("Control");
  }
}

async function kbFocusNext(page) {
  const handle = await createPromise(page, resolve => {
    window.addEventListener("focusin", resolve, { once: true });
  });
  await page.keyboard.press("Tab");
  await awaitPromise(handle);
}

async function kbFocusPrevious(page) {
  const handle = await createPromise(page, resolve => {
    window.addEventListener("focusin", resolve, { once: true });
  });
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  await awaitPromise(handle);
}

async function switchToEditor(name, page, disable = false) {
  const modeChangedHandle = await createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "annotationeditormodechanged",
      resolve,
      { once: true }
    );
  });
  await page.click(`#editor${name}`);
  name = name.toLowerCase();
  await page.waitForSelector(
    ".annotationEditorLayer" +
      (disable ? `:not(.${name}Editing)` : `.${name}Editing`)
  );
  await awaitPromise(modeChangedHandle);
}

export {
  awaitPromise,
  clearInput,
  closePages,
  createPromise,
  dragAndDropAnnotation,
  firstPageOnTop,
  getAnnotationStorage,
  getComputedStyleSelector,
  getEditorDimensions,
  getEditors,
  getEditorSelector,
  getFirstSerialized,
  getQuerySelector,
  getRect,
  getSelectedEditors,
  getSelector,
  getSerialized,
  getSpanRectFromText,
  hover,
  kbBigMoveDown,
  kbBigMoveLeft,
  kbBigMoveRight,
  kbBigMoveUp,
  kbCopy,
  kbDeleteLastWord,
  kbFocusNext,
  kbFocusPrevious,
  kbGoToBegin,
  kbGoToEnd,
  kbModifierDown,
  kbModifierUp,
  kbPaste,
  kbRedo,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  mockClipboard,
  pasteFromClipboard,
  scrollIntoView,
  serializeBitmapDimensions,
  switchToEditor,
  waitForAnnotationEditorLayer,
  waitForEntryInStorage,
  waitForEvent,
  waitForSandboxTrip,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
  waitForUnselectedEditor,
};
