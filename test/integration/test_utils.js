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

exports.loadAndWait = (filename, selector, zoom, pageSetup) =>
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

      let url = `${global.integrationBaseUrl}?file=/test/pdfs/${filename}`;
      if (zoom) {
        url += `#zoom=${zoom}`;
      }
      await page.goto(url);
      if (pageSetup) {
        await pageSetup(page);
      }

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
      // Avoid to keep something from a previous test.
      await page.evaluate(() => window.localStorage.clear());
      await page.close();
    })
  );

exports.clearInput = async (page, selector) => {
  await page.click(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(10);
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

async function waitForEvent(page, eventName, timeout = 5000) {
  const hasTimedout = await Promise.race([
    // add event listener and wait for event to fire before returning
    page.evaluate(
      name =>
        new Promise(resolve => {
          document.addEventListener(name, () => resolve(false), { once: true });
        }),
      eventName
    ),
    page.evaluate(
      timeOut =>
        new Promise(resolve => {
          setTimeout(() => resolve(true), timeOut);
        }),
      timeout
    ),
  ]);
  if (hasTimedout === true) {
    console.log(`waitForEvent: timeout waiting for ${eventName}`);
  }
}
exports.waitForEvent = waitForEvent;

const waitForStorageEntries = async (page, nEntries) => {
  await page.waitForFunction(
    n => window.PDFViewerApplication.pdfDocument.annotationStorage.size === n,
    {},
    nEntries
  );
};
exports.waitForStorageEntries = waitForStorageEntries;

const waitForSerialized = async (page, nEntries) => {
  await page.waitForFunction(
    n =>
      (window.PDFViewerApplication.pdfDocument.annotationStorage.serializable
        .map?.size ?? 0) === n,
    {},
    nEntries
  );
};
exports.waitForSerialized = waitForSerialized;

const waitForSelectedEditor = async (page, selector) => {
  await page.waitForSelector(`${selector}.selectedEditor`);
};
exports.waitForSelectedEditor = waitForSelectedEditor;

const waitForUnselectedEditor = async (page, selector) => {
  await page.waitForSelector(`${selector}:not(.selectedEditor)`);
};
exports.waitForUnselectedEditor = waitForUnselectedEditor;

const mockClipboard = async pages => {
  await Promise.all(
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
};
exports.mockClipboard = mockClipboard;

async function getSerialized(page, filter = undefined) {
  const values = await page.evaluate(() => {
    const { map } =
      window.PDFViewerApplication.pdfDocument.annotationStorage.serializable;
    return map ? [...map.values()] : [];
  });
  return filter ? values.map(filter) : values;
}
exports.getSerialized = getSerialized;

const getFirstSerialized = async (page, filter = undefined) =>
  (await getSerialized(page, filter))[0];
exports.getFirstSerialized = getFirstSerialized;

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
exports.getEditors = getEditors;

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
exports.getEditorDimensions = getEditorDimensions;

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
      ? Array.from(map.values(), x => {
          return { width: x.bitmap.width, height: x.bitmap.height };
        })
      : [];
  });
}
exports.serializeBitmapDimensions = serializeBitmapDimensions;

async function dragAndDropAnnotation(page, startX, startY, tX, tY) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(10);
  await page.mouse.move(startX + tX, startY + tY);
  await page.mouse.up();
  await page.waitForSelector("#viewer:not(.noUserSelect)");
}
exports.dragAndDropAnnotation = dragAndDropAnnotation;

async function waitForAnnotationEditorLayer(page) {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.PDFViewerApplication.eventBus.on(
        "annotationeditorlayerrendered",
        resolve
      );
    });
  });
}
exports.waitForAnnotationEditorLayer = waitForAnnotationEditorLayer;

async function scrollIntoView(page, selector) {
  const promise = page.evaluate(
    sel =>
      new Promise(resolve => {
        const el = document.querySelector(sel);
        const observer = new IntersectionObserver(
          () => {
            observer.disconnect();
            resolve();
          },
          {
            root: document.querySelector("#viewerContainer"),
            threshold: 0.1,
          }
        );
        observer.observe(el);
      }),
    selector
  );
  await page.evaluate(sel => {
    const element = document.querySelector(sel);
    element.scrollIntoView({ behavior: "instant", block: "start" });
  }, selector);
  await promise;
  await page.waitForFunction(
    sel => {
      const element = document.querySelector(sel);
      const { top, bottom } = element.getBoundingClientRect();
      return Math.abs(top) < 100 || Math.abs(bottom - window.innerHeight) < 100;
    },
    {},
    selector
  );
}
exports.scrollIntoView = scrollIntoView;
