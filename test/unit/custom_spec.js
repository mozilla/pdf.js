/* Copyright 2017 Mozilla Foundation
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

import { buildGetDocumentParams } from "./test_utils.js";
import { DOMCanvasFactory } from "../../src/display/display_utils.js";
import { getDocument } from "../../src/display/api.js";
import { isNodeJS } from "../../src/shared/is_node.js";
import { NodeCanvasFactory } from "../../src/display/node_utils.js";

function getTopLeftPixel(canvasContext) {
  const imgData = canvasContext.getImageData(0, 0, 1, 1);
  return {
    r: imgData.data[0],
    g: imgData.data[1],
    b: imgData.data[2],
    a: imgData.data[3],
  };
}

describe("custom canvas rendering", function () {
  const transparentGetDocumentParams = buildGetDocumentParams(
    "transparent.pdf"
  );

  let CanvasFactory;
  let loadingTask;
  let page;

  beforeAll(function (done) {
    if (isNodeJS) {
      CanvasFactory = new NodeCanvasFactory();
    } else {
      CanvasFactory = new DOMCanvasFactory();
    }
    loadingTask = getDocument(transparentGetDocumentParams);
    loadingTask.promise
      .then(function (doc) {
        return doc.getPage(1);
      })
      .then(function (data) {
        page = data;
        done();
      })
      .catch(done.fail);
  });

  afterAll(function (done) {
    CanvasFactory = null;
    page = null;
    loadingTask.destroy().then(done);
  });

  it("renders to canvas with a default white background", function (done) {
    var viewport = page.getViewport({ scale: 1 });
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
    });
    renderTask.promise
      .then(function () {
        expect(getTopLeftPixel(canvasAndCtx.context)).toEqual({
          r: 255,
          g: 255,
          b: 255,
          a: 255,
        });
        CanvasFactory.destroy(canvasAndCtx);
        done();
      })
      .catch(done.fail);
  });

  it("renders to canvas with a custom background", function (done) {
    var viewport = page.getViewport({ scale: 1 });
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
      background: "rgba(255,0,0,1.0)",
    });
    renderTask.promise
      .then(function () {
        expect(getTopLeftPixel(canvasAndCtx.context)).toEqual({
          r: 255,
          g: 0,
          b: 0,
          a: 255,
        });
        CanvasFactory.destroy(canvasAndCtx);
        done();
      })
      .catch(done.fail);
  });
});

describe("alternate document context", function () {
  const FontFace = global.FontFace;

  let altDocument;
  let CanvasFactory;
  let elements;

  beforeEach(() => {
    global.FontFace = function MockFontFace(name) {
      this.family = name;
    };

    elements = [];
    const createElement = name => {
      const element = {
        tagName: name,
        remove() {
          this.remove.called = true;
        },
      };
      if (name === "style") {
        element.sheet = {
          cssRules: [],
          insertRule(rule) {
            this.cssRules.push(rule);
          },
        };
      }
      elements.push(element);
      return element;
    };
    altDocument = {
      fonts: new Set(),
      createElement,
      documentElement: {
        getElementsByTagName: () => [{ appendChild: () => {} }],
      },
    };

    CanvasFactory = isNodeJS
      ? new NodeCanvasFactory()
      : new DOMCanvasFactory({ ownerDocument: altDocument });
  });

  afterEach(() => {
    global.FontFace = FontFace;
    CanvasFactory = null;
    elements = null;
  });

  it("should use given document for loading fonts (with Font Loading API)", async function () {
    const getDocumentParams = buildGetDocumentParams(
      "TrueType_without_cmap.pdf",
      {
        disableFontFace: false,
        ownerDocument: altDocument,
      }
    );

    const loadingTask = getDocument(getDocumentParams);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
    }).promise;

    expect(elements).toEqual([]);
    expect(altDocument.fonts.size).toBe(1);
    const [font] = Array.from(altDocument.fonts);
    expect(font.family).toMatch(/g_d\d+_f1/);

    await doc.destroy();
    await loadingTask.destroy();
    CanvasFactory.destroy(canvasAndCtx);
    expect(altDocument.fonts.size).toBe(0);
  });

  it("should use given document for loading fonts (with CSS rules)", async function () {
    altDocument.fonts = null;
    const getDocumentParams = buildGetDocumentParams(
      "TrueType_without_cmap.pdf",
      {
        disableFontFace: false,
        ownerDocument: altDocument,
      }
    );

    const loadingTask = getDocument(getDocumentParams);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
    }).promise;

    const style = elements.find(element => element.tagName === "style");
    expect(style.sheet.cssRules.length).toBe(1);
    expect(style.sheet.cssRules[0]).toMatch(
      /^@font-face {font-family:"g_d\d+_f1";src:/
    );
    await doc.destroy();
    await loadingTask.destroy();
    CanvasFactory.destroy(canvasAndCtx);
    expect(style.remove.called).toBe(true);
  });
});
