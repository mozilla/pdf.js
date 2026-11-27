/* Copyright 2022 Mozilla Foundation
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

import { AbortException, isNodeJS } from "../../src/shared/util.js";
import { DEFAULT_FONT_SIZE, TextLayer } from "../../src/display/text_layer.js";
import { buildGetDocumentParams } from "./test_utils.js";
import { buildTextLayerFont } from "../../src/core/text_layer_font.js";
import { getDocument } from "../../src/display/api.js";
import { OutputScale } from "../../src/display/output_scale.js";
import { PageViewport } from "../../src/display/page_viewport.js";

describe("textLayer", function () {
  it("creates textLayer from ReadableStream", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport({ scale: 1 }),
    });
    await textLayer.render();

    expect(textLayer.textContentItemsStr).toEqual([
      "Table Of Content",
      "Chapter 1",
      " ",
      "..........................................................",
      " ",
      "2",
      "Paragraph 1.1",
      " ",
      "......................................................",
      " ",
      "3",
      "page 1 / 3",
    ]);

    await loadingTask.destroy();
  });

  it("creates textLayer from TextContent", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    const textLayer = new TextLayer({
      textContentSource: await page.getTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport({ scale: 1 }),
    });
    await textLayer.render();

    expect(textLayer.textContentItemsStr).toEqual([
      "Table Of Content",
      "Chapter 1",
      " ",
      "..........................................................",
      " ",
      "2",
      "Paragraph 1.1",
      " ",
      "......................................................",
      " ",
      "3",
      "page 1 / 3",
    ]);

    await loadingTask.destroy();
  });

  it("creates textLayers in parallel, from ReadableStream", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    if (typeof ReadableStream.from !== "function") {
      pending("ReadableStream.from is not supported.");
    }
    const getTransform = container => {
      const transform = [];

      for (const { style } of container.childNodes) {
        transform.push({
          fontHeight: style.getPropertyValue("--font-height"),
          scaleX: style.getPropertyValue("--scale-x"),
          rotate: style.getPropertyValue("--rotate"),
        });
      }
      return transform;
    };

    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const [page1, page2] = await Promise.all([
      pdfDocument.getPage(1),
      pdfDocument.getPage(2),
    ]);

    // Create text-content streams with dummy content.
    const items1 = [
      {
        str: "Chapter A",
        dir: "ltr",
        width: 100,
        height: 20,
        transform: [20, 0, 0, 20, 45, 744],
        fontName: "g_d0_f1",
        hasEOL: false,
      },
      {
        str: "page 1",
        dir: "ltr",
        width: 50,
        height: 20,
        transform: [20, 0, 0, 20, 45, 744],
        fontName: "g_d0_f1",
        hasEOL: false,
      },
    ];
    const items2 = [
      {
        str: "Chapter B",
        dir: "ltr",
        width: 120,
        height: 10,
        transform: [10, 0, 0, 10, 492, 16],
        fontName: "g_d0_f2",
        hasEOL: false,
      },
      {
        str: "page 2",
        dir: "ltr",
        width: 60,
        height: 10,
        transform: [10, 0, 0, 10, 492, 16],
        fontName: "g_d0_f2",
        hasEOL: false,
      },
    ];

    const styles = {
      g_d0_f1: {
        ascent: 0.75,
        descent: -0.25,
        fontFamily: "serif",
        vertical: false,
      },
      g_d0_f2: {
        ascent: 0.5,
        descent: -0.5,
        fontFamily: "sans-serif",
        vertical: false,
      },
    };
    const lang = "en";

    // Render the textLayers serially, to have something to compare against.
    const serialContainer1 = document.createElement("div"),
      serialContainer2 = document.createElement("div");

    const serialTextLayer1 = new TextLayer({
      textContentSource: { items: items1, styles, lang },
      container: serialContainer1,
      viewport: page1.getViewport({ scale: 1 }),
    });
    await serialTextLayer1.render();

    const serialTextLayer2 = new TextLayer({
      textContentSource: { items: items2, styles, lang },
      container: serialContainer2,
      viewport: page2.getViewport({ scale: 1 }),
    });
    await serialTextLayer2.render();

    const serialTransform1 = getTransform(serialContainer1),
      serialTransform2 = getTransform(serialContainer2);

    expect(serialTransform1.length).toEqual(2);
    expect(serialTransform2.length).toEqual(2);

    // Reset any global textLayer-state before rendering in parallel.
    TextLayer.cleanup();

    const container1 = document.createElement("div"),
      container2 = document.createElement("div");
    const waitCapability1 = Promise.withResolvers();

    const streamGenerator1 = (async function* () {
      for (const item of items1) {
        yield { items: [item], styles, lang };
        await waitCapability1.promise;
      }
    })();
    const streamGenerator2 = (async function* () {
      for (const item of items2) {
        yield { items: [item], styles, lang };
      }
    })();

    const textLayer1 = new TextLayer({
      textContentSource: ReadableStream.from(streamGenerator1),
      container: container1,
      viewport: page1.getViewport({ scale: 1 }),
    });
    const textLayer1Promise = textLayer1.render();

    const textLayer2 = new TextLayer({
      textContentSource: ReadableStream.from(streamGenerator2),
      container: container2,
      viewport: page2.getViewport({ scale: 1 }),
    });
    await textLayer2.render();

    // Ensure that the first textLayer has its rendering "paused" while
    // the second textLayer renders.
    waitCapability1.resolve();
    await textLayer1Promise;

    // Sanity check to make sure that all text was parsed.
    expect(textLayer1.textContentItemsStr).toEqual(["Chapter A", "page 1"]);
    expect(textLayer2.textContentItemsStr).toEqual(["Chapter B", "page 2"]);

    // Ensure that the transforms are identical when parsing in series/parallel.
    const transform1 = getTransform(container1),
      transform2 = getTransform(container2);

    expect(transform1).toEqual(serialTransform1);
    expect(transform2).toEqual(serialTransform2);

    await loadingTask.destroy();
  });

  it("fits a single glyph of a font with scaled advances", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const container = document.createElement("div");
    container.className = "textLayer";
    container.style.setProperty("--total-scale-factor", "1");
    document.body.append(container);
    // The 80 em advance of A is encoded with a scale in the font.
    const textLayer = new TextLayer({
      textContentSource: {
        items: [
          {
            str: "A",
            dir: "ltr",
            width: 40,
            height: 0.5,
            transform: [0.5, 0, 0, 0.5, 50, 700],
            fontName: "f1",
            hasEOL: false,
          },
        ],
        styles: {
          f1: {
            fontFamily: "sans-serif",
            vertical: false,
            textLayerFont: {
              name: "scaled_advances",
              data: buildTextLayerFont(new Map([[0x41, 80000]]), 1, false, 4),
              ascent: 1,
              advanceScale: 4,
            },
          },
        },
      },
      container,
      viewport: new PageViewport({
        viewBox: [0, 0, 800, 800],
        userUnit: 1,
        scale: 1,
        rotation: 0,
      }),
    });
    try {
      await textLayer.render();
      expect(textLayer.textDivs[0].getBoundingClientRect().width).toBeCloseTo(
        40,
        0
      );
    } finally {
      textLayer.cancel();
      container.remove();
    }
  });

  describe("with text layer fonts", function () {
    let loadingTask, textContent, viewport, textLayers;

    const hasFont = (name, ownerDocument = document) =>
      [...ownerDocument.fonts].some(
        ({ family }) => family.replaceAll('"', "") === name
      );

    function createTextLayer(container = document.createElement("div")) {
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      textLayers.push(textLayer);
      return textLayer;
    }

    beforeEach(async function () {
      if (isNodeJS) {
        pending("document.createElement is not supported in Node.js.");
      }
      textLayers = [];
      loadingTask = getDocument(buildGetDocumentParams("tracemonkey.pdf"));
      const pdfDocument = await loadingTask.promise;
      const page = await pdfDocument.getPage(1);
      textContent = await page.getTextContent({
        enableNormalization: false,
      });
      viewport = page.getViewport({ scale: 1 });
    });

    afterEach(async function () {
      for (const textLayer of textLayers || []) {
        textLayer.cancel();
      }
      await loadingTask?.destroy();
    });

    it("fits isolated glyphs with the same text and different PDF widths", async function () {
      const item = textContent.items.find(({ str }) => /^[A-Z]/i.test(str));
      const widths = [3, 12];
      textContent.items = widths.map(width => ({
        ...item,
        str: item.str[0],
        width,
        textLayerAdvance: undefined,
      }));
      const container = document.createElement("div");
      container.className = "textLayer";
      container.style.setProperty("--total-scale-factor", "1");
      document.body.append(container);
      try {
        const layer = createTextLayer(container);
        await layer.render();
        for (const [i, span] of layer.textDivs.entries()) {
          expect(span.getBoundingClientRect().width).toBeCloseTo(widths[i], 1);
        }
      } finally {
        container.remove();
      }
    });

    it("lays out the text and shares the fonts until the last cancellation", async function () {
      const first = createTextLayer();
      const second = createTextLayer();
      await Promise.all(textLayers.map(textLayer => textLayer.render()));

      const { pageHeight, pageY } = viewport.rawDims;
      const { items, styles } = textContent;
      const names = new Set();
      expect(first.textDivs.length).toEqual(items.length);
      for (const [i, { style }] of first.textDivs.entries()) {
        const { name, ascent } = styles[items[i].fontName].textLayerFont;
        names.add(name);
        expect(style.fontFamily.replaceAll('"', "")).toBe(name);
        // The span is moved up by the ascent of the font.
        const [, , , d, , f] = items[i].transform;
        expect(parseFloat(style.top)).toBeCloseTo(
          (100 * (pageY + pageHeight - f - ascent * d)) / pageHeight,
          2
        );
      }
      expect([...names].every(name => hasFont(name))).toBeTrue();
      const spaces = first.textDivs.filter(
        ({ textContent: str }) => str === " "
      );
      expect(spaces.length).toBeGreaterThan(0);
      expect(
        spaces.every(({ style }) => !style.getPropertyValue("--scale-x"))
      ).toBeTrue();

      first.cancel();
      expect([...names].every(name => hasFont(name))).toBeTrue();
      second.cancel();
      expect([...names].some(name => hasFont(name))).toBeFalse();
    });

    it("loads and measures fonts in the container's document", async function () {
      const iframe = document.createElement("iframe");
      document.body.append(iframe);
      const { contentDocument } = iframe;
      const inner = createTextLayer(contentDocument.createElement("div"));
      const outer = createTextLayer();
      const { name } =
        textContent.styles[textContent.items[0].fontName].textLayerFont;

      try {
        await inner.render();
        expect(hasFont(name, contentDocument)).toBeTrue();
        expect(hasFont(name)).toBeFalse();

        await outer.render();
        expect(hasFont(name)).toBeTrue();
        const getScales = ({ textDivs }) =>
          textDivs.map(({ style }) => style.getPropertyValue("--scale-x"));
        expect(getScales(inner)).toEqual(getScales(outer));

        inner.cancel();
        expect(hasFont(name, contentDocument)).toBeFalse();
        expect(hasFont(name)).toBeTrue();
      } finally {
        inner.cancel();
        TextLayer.cleanup();
        iframe.remove();
      }
    });

    it("doesn't load fonts when cancelled before rendering starts", async function () {
      const { name } =
        textContent.styles[textContent.items[0].fontName].textLayerFont;
      const textLayer = createTextLayer();
      const promise = textLayer.render();
      textLayer.cancel();
      await expectAsync(promise).toBeRejectedWith(jasmine.any(AbortException));
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
      expect(textLayer.textDivs).toEqual([]);
      expect(hasFont(name)).toBeFalse();
    });

    it("cancels rendering while the fonts are still loading", async function () {
      const loading = Promise.withResolvers();
      const started = Promise.withResolvers();
      spyOnProperty(FontFace.prototype, "loaded", "get").and.callFake(() => {
        started.resolve();
        return loading.promise;
      });

      const textLayer = createTextLayer();
      const promise = textLayer.render();
      try {
        await started.promise;
        textLayer.cancel();
        await expectAsync(promise).toBeRejectedWith(
          jasmine.any(AbortException)
        );
        expect(textLayer.textDivs).toEqual([]);
      } finally {
        loading.resolve();
      }
    });

    it("removes a failed font and renders with the fallback font", async function () {
      const { fontFamily, textLayerFont } =
        textContent.styles[textContent.items[0].fontName];
      textLayerFont.data = new Uint8Array(1);
      const textLayer = createTextLayer();
      await textLayer.render();

      expect(hasFont(textLayerFont.name)).toBeFalse();
      expect(textLayer.textDivs[0].style.fontFamily).toBe(
        TextLayer.fontFamilyMap.get(fontFamily) || fontFamily
      );
    });
  });

  it("measures the text with the correct font after computing the ascent", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    // Proportional widths should produce the same horizontal scale.
    const items = [10, 11].map(fontSize => ({
      str: "Hello World",
      dir: "ltr",
      width: 5 * fontSize,
      height: fontSize,
      transform: [fontSize, 0, 0, fontSize, 50, 700],
      fontName: "g_d0_f1",
      hasEOL: false,
    }));
    const styles = {
      g_d0_f1: {
        ascent: 0.75,
        descent: -0.25,
        fontFamily: "sans-serif",
        vertical: false,
      },
    };

    // Force the ascent to be computed for this font.
    TextLayer.cleanup();

    // Use DPR 1 to avoid rounding the first measurement away from 30px.
    spyOnProperty(OutputScale, "pixelRatio", "get").and.returnValue(1);
    // Ensure that 30px is still the font size used to compute the ascent.
    expect(DEFAULT_FONT_SIZE).toEqual(30);

    const textLayer = new TextLayer({
      textContentSource: { items, styles, lang: "en" },
      container: document.createElement("div"),
      // Measure the first run at the 30px size used to compute the ascent.
      viewport: page.getViewport({ scale: 3 }),
    });
    await textLayer.render();

    const [scaleX1, scaleX2] = textLayer.textDivs.map(({ style }) =>
      parseFloat(style.getPropertyValue("--scale-x"))
    );
    expect(scaleX1 / scaleX2).toBeCloseTo(1, 1);

    await loadingTask.destroy();
  });

  it("positions the text precisely", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const { pageWidth, pageX } = viewport.rawDims;
    // Badly rounded with two decimals: 10.00% instead of 10.0045%.
    const left = (pageWidth * 10.0045) / 100;

    const textLayer = new TextLayer({
      textContentSource: {
        items: [
          {
            str: "Hello",
            dir: "ltr",
            width: 30,
            height: 10,
            transform: [10, 0, 0, 10, pageX + left, 100],
            fontName: "f1",
            hasEOL: false,
          },
        ],
        styles: {
          f1: {
            fontFamily: "sans-serif",
            ascent: 0.8,
            descent: -0.2,
            vertical: false,
          },
        },
        lang: "en",
      },
      container: document.createElement("div"),
      viewport,
    });
    await textLayer.render();

    const { style } = textLayer.textDivs[0];
    expect(
      Math.abs((parseFloat(style.left) * pageWidth) / 100 - left)
    ).toBeLessThan(5e-3);

    await loadingTask.destroy();
  });
});
