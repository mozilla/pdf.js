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

function loadAndWait(filename, selector, zoom, setups, options, viewport) {
  return Promise.all(
    global.integrationSessions.map(async session => {
      const page = await session.browser.newPage();

      if (viewport) {
        await page.setViewport(viewport);
      }

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
        const optionsObject =
          typeof options === "function"
            ? await options(page, session.name)
            : options;

        // Options must be handled in app.js::_parseHashParams.
        for (const [key, value] of Object.entries(optionsObject)) {
          app_options += `&${key}=${encodeURIComponent(value)}`;
        }
      }
      const url = `${
        global.integrationBaseUrl
      }?file=/test/pdfs/${filename}#zoom=${zoom ?? "page-fit"}${app_options}`;

      if (setups) {
        // page.evaluateOnNewDocument allows us to run code before the
        // first js script is executed.
        // The idea here is to set up some setters for PDFViewerApplication
        // and EventBus, so we can inject some code to do whatever we want
        // soon enough especially before the first event in the eventBus is
        // dispatched.
        const { prePageSetup, appSetup, earlySetup, eventBusSetup } = setups;
        await prePageSetup?.(page);
        if (earlySetup || appSetup || eventBusSetup) {
          await page.evaluateOnNewDocument(
            (eaSetup, aSetup, evSetup) => {
              if (eaSetup) {
                // eslint-disable-next-line no-eval
                eval(`(${eaSetup})`)();
              }
              let app;
              let eventBus;
              Object.defineProperty(window, "PDFViewerApplication", {
                get() {
                  return app;
                },
                set(newValue) {
                  app = newValue;
                  if (aSetup) {
                    // eslint-disable-next-line no-eval
                    eval(`(${aSetup})`)(app);
                  }
                  Object.defineProperty(app, "eventBus", {
                    get() {
                      return eventBus;
                    },
                    set(newV) {
                      eventBus = newV;
                      if (evSetup) {
                        // eslint-disable-next-line no-eval
                        eval(`(${evSetup})`)(eventBus);
                      }
                    },
                  });
                },
              });
            },
            earlySetup?.toString(),
            appSetup?.toString(),
            eventBusSetup?.toString()
          );
        }
      }

      await page.goto(url);
      await setups?.postPageSetup?.(page);

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
  return Promise.all(pages.map(([_, page]) => closeSinglePage(page)));
}

function isVisible(page, selector) {
  return page.evaluate(
    sel => document.querySelector(sel)?.checkVisibility(),
    selector
  );
}

async function closeSinglePage(page) {
  // Avoid to keep something from a previous test.
  await page.evaluate(async () => {
    await window.PDFViewerApplication.testingClose();
    window.localStorage.clear();
  });
  await page.close({ runBeforeUnload: false });
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

async function clearInput(page, selector, waitForInputEvent = false) {
  const action = async () => {
    await page.click(selector);
    await kbSelectAll(page);
    await page.keyboard.press("Backspace");
    await page.waitForFunction(
      `document.querySelector('${selector}').value === ""`
    );
  };
  return waitForInputEvent
    ? waitForEvent({
        page,
        eventName: "input",
        action,
        selector,
      })
    : action();
}

async function waitAndClick(page, selector, clickOptions = {}) {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector, clickOptions);
}

function waitForPointerUp(page) {
  return createPromise(page, resolve => {
    window.addEventListener("pointerup", resolve, { once: true });
  });
}

function getSelector(id) {
  return `[data-element-id="${id}"]`;
}

async function getRect(page, selector) {
  // In Chrome something is wrong when serializing a `DomRect`,
  // so we extract the values and return them ourselves.
  await page.waitForSelector(selector, { visible: true });
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

function getAnnotationSelector(id) {
  return `[data-annotation-id="${id}"]`;
}

async function getSpanRectFromText(page, pageNumber, text) {
  await page.waitForSelector(
    `.page[data-page-number="${pageNumber}"] > .textLayer .endOfContent`
  );
  return page.evaluate(
    (number, content) => {
      for (const el of document.querySelectorAll(
        `.page[data-page-number="${number}"] > .textLayer span:not(:has(> span))`
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

async function waitForEvent({
  page,
  eventName,
  action,
  selector = null,
  validator = null,
  timeout = 5000,
}) {
  const handle = await page.evaluateHandle(
    (name, sel, validate, timeOut) => {
      let callback = null,
        timeoutId = null;
      const element = sel ? document.querySelector(sel) : document;
      return [
        Promise.race([
          new Promise(resolve => {
            // The promise is resolved if the event fired in the context of the
            // selector and, if a validator is defined, the event data satisfies
            // the conditions of the validator function.
            callback = e => {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              // eslint-disable-next-line no-eval
              resolve(validate ? eval(`(${validate})`)(e) : true);
            };
            element.addEventListener(name, callback, { once: true });
          }),
          new Promise(resolve => {
            timeoutId = setTimeout(() => {
              element.removeEventListener(name, callback);
              resolve(null);
            }, timeOut);
          }),
        ]),
      ];
    },
    eventName,
    selector,
    validator ? validator.toString() : null,
    timeout
  );

  await action();

  const success = await awaitPromise(handle);
  if (success === null) {
    console.warn(
      `waitForEvent: ${eventName} didn't trigger within the timeout`
    );
  } else if (!success) {
    console.warn(`waitForEvent: ${eventName} triggered, but validation failed`);
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
    n => {
      try {
        return (
          (window.PDFViewerApplication.pdfDocument.annotationStorage
            .serializable.map?.size ?? 0) === n
        );
      } catch {
        // When serializing a stamp annotation with a SVG, the transfer
        // can fail because of the SVG, so we just retry.
        return false;
      }
    },
    {},
    nEntries
  );
}

async function applyFunctionToEditor(page, editorId, func) {
  return page.evaluate(
    (id, f) => {
      const editor =
        window.PDFViewerApplication.pdfDocument.annotationStorage.getRawValue(
          id
        );
      // eslint-disable-next-line no-eval
      eval(`(${f})`)(editor);
    },
    editorId,
    func.toString()
  );
}

async function selectEditor(page, selector, count = 1) {
  const editorRect = await getRect(page, selector);
  await page.mouse.click(
    editorRect.x + editorRect.width / 2,
    editorRect.y + editorRect.height / 2,
    { count }
  );
  await waitForSelectedEditor(page, selector);
}

async function waitForSelectedEditor(page, selector) {
  return page.waitForSelector(`${selector}.selectedEditor`);
}

async function unselectEditor(page, selector) {
  await page.keyboard.press("Escape");
  await waitForUnselectedEditor(page, selector);
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

async function copy(page) {
  await waitForEvent({
    page,
    eventName: "copy",
    action: () => kbCopy(page),
  });
}

async function copyToClipboard(page, data) {
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
}

async function paste(page) {
  await waitForEvent({
    page,
    eventName: "paste",
    action: () => kbPaste(page),
  });
}

async function pasteFromClipboard(page, selector = null) {
  const validator = e => e.clipboardData.items.length !== 0;
  await waitForEvent({
    page,
    eventName: "paste",
    action: () => kbPaste(page),
    selector,
    validator,
  });
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
      results.push(parseInt(id.split("_").at(-1)));
    }
    results.sort();
    return results;
  }, kind);
}

function getEditorDimensions(page, selector) {
  return page.evaluate(sel => {
    const { style } = document.querySelector(sel);
    return {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
    };
  }, selector);
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

async function dragAndDrop(page, selector, translations, steps = 1) {
  const rect = await getRect(page, selector);
  const startX = rect.x + rect.width / 2;
  const startY = rect.y + rect.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (const [tX, tY] of translations) {
    await page.mouse.move(startX + tX, startY + tY, { steps });
  }
  await page.mouse.up();
  await page.waitForSelector("#viewer:not(.noUserSelect)");
}

function waitForAnnotationEditorLayer(page) {
  return createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "annotationeditorlayerrendered",
      resolve,
      { once: true }
    );
  });
}

function waitForAnnotationModeChanged(page) {
  return createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "annotationeditormodechanged",
      resolve,
      { once: true }
    );
  });
}

function waitForPageRendered(page) {
  return createPromise(page, resolve => {
    const { eventBus } = window.PDFViewerApplication;
    eventBus.on("pagerendered", function handler(e) {
      if (!e.isDetailView) {
        resolve();
        eventBus.off("pagerendered", handler);
      }
    });
  });
}

function waitForEditorMovedInDOM(page) {
  return createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on("editormovedindom", resolve, {
      once: true,
    });
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

async function setCaretAt(page, pageNumber, text, position) {
  await page.evaluate(
    (pageN, string, pos) => {
      for (const el of document.querySelectorAll(
        `.page[data-page-number="${pageN}"] > .textLayer > span`
      )) {
        if (el.textContent === string) {
          window.getSelection().setPosition(el.firstChild, pos);
          break;
        }
      }
    },
    pageNumber,
    text,
    position
  );
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

async function kbSave(page) {
  await page.keyboard.down(modifier);
  await page.keyboard.press("s");
  await page.keyboard.up(modifier);
}

async function switchToEditor(name, page, disable = false) {
  const modeChangedHandle = await createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "annotationeditormodechanged",
      resolve,
      { once: true }
    );
  });
  await page.click(`#editor${name}Button`);
  name = name.toLowerCase();
  await page.waitForSelector(
    ".annotationEditorLayer" +
      (disable ? `:not(.${name}Editing)` : `.${name}Editing`)
  );
  await awaitPromise(modeChangedHandle);
}

async function selectEditors(name, page) {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(`.${name}Editor:not(.selectedEditor)`)
  );
}

async function clearEditors(name, page) {
  await selectEditors(name, page);
  await page.keyboard.press("Backspace");
  await waitForStorageEntries(page, 0);
}

function waitForNoElement(page, selector) {
  return page.waitForFunction(
    sel => !document.querySelector(sel),
    {},
    selector
  );
}

function isCanvasWhite(page, pageNumber, rectangle) {
  return page.evaluate(
    (rect, pageN) => {
      const canvas = document.querySelector(
        `.page[data-page-number = "${pageN}"] .canvasWrapper canvas`
      );
      const canvasRect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d");
      rect ||= canvasRect;
      const { data } = ctx.getImageData(
        rect.x - canvasRect.x,
        rect.y - canvasRect.y,
        rect.width,
        rect.height
      );
      return new Uint32Array(data.buffer).every(x => x === 0xffffffff);
    },
    rectangle,
    pageNumber
  );
}

async function cleanupEditing(pages, switcher) {
  for (const [, page] of pages) {
    await page.evaluate(() => {
      window.uiManager.reset();
    });
    // Disable editing mode.
    await switcher(page, /* disable */ true);
  }
}

async function getXY(page, selector) {
  const rect = await getRect(page, selector);
  return `${rect.x}::${rect.y}`;
}

function waitForPositionChange(page, selector, xy) {
  return page.waitForFunction(
    (sel, currentXY) => {
      const bbox = document.querySelector(sel).getBoundingClientRect();
      return `${bbox.x}::${bbox.y}` !== currentXY;
    },
    {},
    selector,
    xy
  );
}

async function moveEditor(page, selector, n, pressKey) {
  let xy = await getXY(page, selector);
  for (let i = 0; i < n; i++) {
    const handle = await waitForEditorMovedInDOM(page);
    await pressKey();
    await awaitPromise(handle);
    await waitForPositionChange(page, selector, xy);
    xy = await getXY(page, selector);
  }
}

export {
  applyFunctionToEditor,
  awaitPromise,
  cleanupEditing,
  clearEditors,
  clearInput,
  closePages,
  closeSinglePage,
  copy,
  copyToClipboard,
  createPromise,
  dragAndDrop,
  firstPageOnTop,
  getAnnotationSelector,
  getAnnotationStorage,
  getComputedStyleSelector,
  getEditorDimensions,
  getEditors,
  getEditorSelector,
  getFirstSerialized,
  getQuerySelector,
  getRect,
  getSelector,
  getSerialized,
  getSpanRectFromText,
  getXY,
  hover,
  isCanvasWhite,
  isVisible,
  kbBigMoveDown,
  kbBigMoveLeft,
  kbBigMoveRight,
  kbBigMoveUp,
  kbDeleteLastWord,
  kbFocusNext,
  kbFocusPrevious,
  kbGoToBegin,
  kbGoToEnd,
  kbModifierDown,
  kbModifierUp,
  kbRedo,
  kbSave,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  mockClipboard,
  moveEditor,
  paste,
  pasteFromClipboard,
  scrollIntoView,
  selectEditor,
  selectEditors,
  serializeBitmapDimensions,
  setCaretAt,
  switchToEditor,
  unselectEditor,
  waitAndClick,
  waitForAnnotationEditorLayer,
  waitForAnnotationModeChanged,
  waitForEntryInStorage,
  waitForEvent,
  waitForNoElement,
  waitForPageRendered,
  waitForPointerUp,
  waitForSandboxTrip,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
  waitForUnselectedEditor,
};
