/* Copyright 2012 Mozilla Foundation
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
/* globals pdfjsLib, pdfjsTestingUtils, pdfjsViewer */

const {
  AnnotationLayer,
  AnnotationMode,
  DrawLayer,
  getDocument,
  GlobalWorkerOptions,
  PixelsPerInch,
  shadow,
  TextLayer,
  XfaLayer,
} = pdfjsLib;
const { HighlightOutliner } = pdfjsTestingUtils;
const { GenericL10n, parseQueryString, SimpleLinkService } = pdfjsViewer;

const WAITING_TIME = 100; // ms
const CMAP_URL = "/build/generic/web/cmaps/";
const STANDARD_FONT_DATA_URL = "/build/generic/web/standard_fonts/";
const WASM_URL = "/build/generic/web/wasm/";
const IMAGE_RESOURCES_PATH = "/web/images/";
const VIEWER_CSS = "../build/components/pdf_viewer.css";
const VIEWER_LOCALE = "en-US";
const WORKER_SRC = "../build/generic/build/pdf.worker.mjs";
const RENDER_TASK_ON_CONTINUE_DELAY = 5; // ms
const SVG_NS = "http://www.w3.org/2000/svg";

const md5FileMap = new Map();

function loadStyles(styles) {
  const promises = [];

  for (const file of styles) {
    promises.push(
      fetch(file)
        .then(response => {
          if (!response.ok) {
            throw new Error(response.statusText);
          }
          return response.text();
        })
        .catch(reason => {
          throw new Error(`Error fetching style (${file}): ${reason}`);
        })
    );
  }

  return Promise.all(promises);
}

function loadImage(svg_xml, ctx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svg_xml);
    img.onload = function () {
      ctx?.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = function (e) {
      reject(new Error(`Error rasterizing SVG: ${e}`));
    };
  });
}

async function writeSVG(svgElement, ctx) {
  // We need to have UTF-8 encoded XML.
  const svg_xml = unescape(
    encodeURIComponent(new XMLSerializer().serializeToString(svgElement))
  );
  if (svg_xml.includes("background-image: url(&quot;data:image")) {
    // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1844414
    // we load the image two times.
    await loadImage(svg_xml, null);
    await new Promise(resolve => {
      setTimeout(resolve, 10);
    });
  }
  return loadImage(svg_xml, ctx);
}

async function inlineImages(node, silentErrors = false) {
  const promises = [];

  for (const image of node.getElementsByTagName("img")) {
    const url = image.src;

    promises.push(
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(response.statusText);
          }
          return response.blob();
        })
        .then(
          blob =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(reader.result);
              };
              reader.onerror = reject;

              reader.readAsDataURL(blob);
            })
        )
        .then(
          dataUrl =>
            new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = evt => {
                if (silentErrors) {
                  resolve();
                  return;
                }
                reject(evt);
              };

              image.src = dataUrl;
            })
        )
        .catch(reason => {
          throw new Error(`Error inlining image (${url}): ${reason}`);
        })
    );
  }

  await Promise.all(promises);
}

async function convertCanvasesToImages(annotationCanvasMap, outputScale) {
  const results = new Map();
  const promises = [];
  for (const [key, canvas] of annotationCanvasMap) {
    promises.push(
      new Promise(resolve => {
        canvas.toBlob(blob => {
          const image = document.createElement("img");
          image.classList.add("wasCanvas");
          image.onload = function () {
            image.style.width = Math.floor(image.width / outputScale) + "px";
            resolve();
          };
          results.set(key, image);
          image.src = URL.createObjectURL(blob);
        });
      })
    );
  }
  await Promise.all(promises);
  return results;
}

class Rasterize {
  /**
   * For the reference tests, the full content of the various layers must be
   * visible. To achieve this, we load the common styles as used by the viewer
   * and extend them with a set of overrides to make all elements visible.
   *
   * Note that we cannot simply use `@import` to import the common styles in
   * the overrides file because the browser does not resolve that when the
   * styles are inserted via XHR. Therefore, we load and combine them here.
   */
  static get annotationStylePromise() {
    const styles = [VIEWER_CSS, "./annotation_layer_builder_overrides.css"];
    return shadow(this, "annotationStylePromise", loadStyles(styles));
  }

  static get textStylePromise() {
    const styles = [VIEWER_CSS, "./text_layer_test.css"];
    return shadow(this, "textStylePromise", loadStyles(styles));
  }

  static get drawLayerStylePromise() {
    const styles = [VIEWER_CSS, "./draw_layer_test.css"];
    return shadow(this, "drawLayerStylePromise", loadStyles(styles));
  }

  static get xfaStylePromise() {
    const styles = [VIEWER_CSS, "./xfa_layer_builder_overrides.css"];
    return shadow(this, "xfaStylePromise", loadStyles(styles));
  }

  static createContainer(viewport) {
    const svg = document.createElementNS(SVG_NS, "svg:svg");
    svg.setAttribute("width", `${viewport.width}px`);
    svg.setAttribute("height", `${viewport.height}px`);

    const foreignObject = document.createElementNS(SVG_NS, "svg:foreignObject");
    foreignObject.setAttribute("x", "0");
    foreignObject.setAttribute("y", "0");
    foreignObject.setAttribute("width", `${viewport.width}px`);
    foreignObject.setAttribute("height", `${viewport.height}px`);

    const style = document.createElement("style");
    foreignObject.append(style);

    const div = document.createElement("div");
    foreignObject.append(div);

    return { svg, foreignObject, style, div };
  }

  static createRootCSS(viewport) {
    const { scale, userUnit } = viewport;
    return [
      ":root {",
      "  --scale-round-x: 1px; --scale-round-y: 1px;",
      `  --scale-factor: ${scale};`,
      `  --user-unit: ${userUnit};`,
      `  --total-scale-factor: ${scale * userUnit};`,
      "}",
    ].join("\n");
  }

  static async annotationLayer(
    ctx,
    viewport,
    outputScale,
    annotations,
    annotationCanvasMap,
    annotationStorage,
    fieldObjects,
    page,
    imageResourcesPath,
    renderForms = false
  ) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);
      div.className = "annotationLayer";

      const [common, overrides] = await this.annotationStylePromise;
      style.textContent = `${common}\n${overrides}\n${this.createRootCSS(viewport)}`;

      const annotationViewport = viewport.clone({ dontFlip: true });
      const annotationImageMap = await convertCanvasesToImages(
        annotationCanvasMap,
        outputScale
      );

      // Rendering annotation layer as HTML.
      const parameters = {
        annotations,
        linkService: new SimpleLinkService(),
        imageResourcesPath,
        renderForms,
        annotationStorage,
        fieldObjects,
      };

      // Ensure that the annotationLayer gets translated.
      document.l10n.connectRoot(div);

      const annotationLayer = new AnnotationLayer({
        div,
        annotationCanvasMap: annotationImageMap,
        page,
        viewport: annotationViewport,
      });
      await annotationLayer.render(parameters);
      await annotationLayer.showPopups();

      // With Fluent, the translations are triggered by the MutationObserver
      // hence the translations could be not finished when we rasterize the div.
      // So in order to be sure that all translations are done, we wait for
      // them here.
      await document.l10n.translateRoots();

      // All translation should be complete here.
      document.l10n.disconnectRoot(div);

      // Inline SVG images from text annotations.
      await inlineImages(div);
      foreignObject.append(div);
      svg.append(foreignObject);

      await writeSVG(svg, ctx);
    } catch (reason) {
      throw new Error(`Rasterize.annotationLayer: "${reason?.message}".`);
    }
  }

  static async textLayer(ctx, viewport, textContent) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);
      div.className = "textLayer";

      // Items are transformed to have 1px font size.
      svg.setAttribute("font-size", 1);

      const [common, overrides] = await this.textStylePromise;
      style.textContent = `${common}\n${overrides}\n${this.createRootCSS(viewport)}`;

      // Rendering text layer as HTML.
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: div,
        viewport,
      });
      await textLayer.render();

      svg.append(foreignObject);

      await writeSVG(svg, ctx);
    } catch (reason) {
      throw new Error(`Rasterize.textLayer: "${reason?.message}".`);
    }
  }

  static async highlightLayer(ctx, viewport, textContent) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);
      const dummyParent = document.createElement("div");

      // Items are transformed to have 1px font size.
      svg.setAttribute("font-size", 1);

      const [common, overrides] = await this.drawLayerStylePromise;
      style.textContent = `${common}\n${overrides}\n${this.createRootCSS(viewport)}`;

      // Rendering text layer as HTML.
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: dummyParent,
        viewport,
      });
      await textLayer.render();

      const { pageWidth, pageHeight, textDivs } = textLayer;
      const boxes = [];
      let j = 0,
        posRegex;
      for (const { width, height, type } of textContent.items) {
        if (type) {
          continue;
        }
        const { top, left } = textDivs[j++].style;
        let x = parseFloat(left) / 100;
        let y = parseFloat(top) / 100;
        if (isNaN(x)) {
          posRegex ||= /^calc\(var\(--total-scale-factor\)\s*\*(.*)px\)$/;
          // The element is tagged so we've to extract the position from the
          // string, e.g. `calc(var(--total-scale-factor)*66.32px)`.
          let match = left.match(posRegex);
          if (match) {
            x = parseFloat(match[1]) / pageWidth;
          }

          match = top.match(posRegex);
          if (match) {
            y = parseFloat(match[1]) / pageHeight;
          }
        }
        if (width === 0 || height === 0) {
          continue;
        }
        boxes.push({
          x,
          y,
          width: width / pageWidth,
          height: height / pageHeight,
        });
      }
      // We set the borderWidth to 0.001 to slighly increase the size of the
      // boxes so that they can be merged together.
      const outliner = new HighlightOutliner(boxes, /* borderWidth = */ 0.001);
      // We set the borderWidth to 0.0025 in order to have an outline which is
      // slightly bigger than the highlight itself.
      // We must add an inner margin to avoid to have a partial outline.
      const outlinerForOutline = new HighlightOutliner(
        boxes,
        /* borderWidth = */ 0.0025,
        /* innerMargin = */ 0.001
      );
      const drawLayer = new DrawLayer({ pageIndex: 0 });
      drawLayer.setParent(div);
      const outlines = outliner.getOutlines();
      drawLayer.draw(
        {
          bbox: outlines.box,
          root: {
            viewBox: "0 0 1 1",
            fill: "orange",
            "fill-opacity": 0.4,
          },
          rootClass: {
            highlight: true,
            free: false,
          },
          path: {
            d: outlines.toSVGPath(),
          },
        },
        /* isPathUpdatable = */ false,
        /* hasClip = */ true
      );
      const focusLine = outlinerForOutline.getOutlines();
      drawLayer.drawOutline(
        {
          rootClass: {
            highlightOutline: true,
            free: false,
          },
          bbox: focusLine.box,
          path: {
            d: focusLine.toSVGPath(),
          },
        },
        /* mustRemoveSelfIntersections = */ false
      );

      svg.append(foreignObject);

      await writeSVG(svg, ctx);

      drawLayer.destroy();
    } catch (reason) {
      throw new Error(`Rasterize.highlightLayer: "${reason?.message}".`);
    }
  }

  static async xfaLayer(
    ctx,
    viewport,
    xfaHtml,
    fontRules,
    annotationStorage,
    isPrint
  ) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);

      const [common, overrides] = await this.xfaStylePromise;
      style.textContent = `${common}\n${overrides}\n${fontRules}`;

      // Rendering XFA layer as HTML.
      XfaLayer.render({
        viewport: viewport.clone({ dontFlip: true }),
        div,
        xfaHtml,
        annotationStorage,
        linkService: new SimpleLinkService(),
        intent: isPrint ? "print" : "display",
      });

      // Some unsupported type of images (e.g. tiff) lead to errors.
      await inlineImages(div, /* silentErrors = */ true);
      svg.append(foreignObject);

      await writeSVG(svg, ctx);
    } catch (reason) {
      throw new Error(`Rasterize.xfaLayer: "${reason?.message}".`);
    }
  }
}

/**
 * @typedef {Object} DriverOptions
 * @property {HTMLSpanElement} inflight - Field displaying the number of
 *   inflight requests.
 * @property {HTMLInputElement} disableScrolling - Checkbox to disable
 *   automatic scrolling of the output container.
 * @property {HTMLPreElement} output - Container for all output messages.
 * @property {HTMLDivElement} end - Container for a completion message.
 */

class Driver {
  /**
   * @param {DriverOptions} options
   */
  constructor(options) {
    // Configure the global worker options.
    GlobalWorkerOptions.workerSrc = WORKER_SRC;

    // We only need to initialize the `L10n`-instance here, since translation is
    // triggered by a `MutationObserver`; see e.g. `Rasterize.annotationLayer`.
    this._l10n = new GenericL10n(VIEWER_LOCALE);

    // Set the passed options
    this.inflight = options.inflight;
    this.disableScrolling = options.disableScrolling;
    this.output = options.output;
    this.end = options.end;

    // Set parameters from the query string
    const params = parseQueryString(window.location.search.substring(1));
    this.browser = params.get("browser");
    this.manifestFile = params.get("manifestfile");
    this.delay = params.get("delay") | 0;
    this.inFlightRequests = 0;
    this.testFilter = JSON.parse(params.get("testfilter") || "[]");
    this.xfaOnly = params.get("xfaonly") === "true";

    // Create a working canvas
    this.canvas = document.createElement("canvas");
  }

  run() {
    window.onerror = (message, source, line, column, error) => {
      this._info(
        "Error: " +
          message +
          " Script: " +
          source +
          " Line: " +
          line +
          " Column: " +
          column +
          " StackTrace: " +
          error
      );
    };
    this._info("User agent: " + navigator.userAgent);
    this._log(`Harness thinks this browser is ${this.browser}\n`);
    this._log('Fetching manifest "' + this.manifestFile + '"... ');

    if (this.delay > 0) {
      this._log("\nDelaying for " + this.delay + " ms...\n");
    }
    // When gathering the stats the numbers seem to be more reliable
    // if the browser is given more time to start.
    setTimeout(async () => {
      const response = await fetch(this.manifestFile);
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      this._log("done\n");
      this.manifest = await response.json();

      if (this.testFilter?.length || this.xfaOnly) {
        this.manifest = this.manifest.filter(item => {
          if (this.testFilter.includes(item.id)) {
            return true;
          }
          if (this.xfaOnly && item.enableXfa) {
            return true;
          }
          return false;
        });
      }
      this.currentTask = 0;
      this._nextTask();
    }, this.delay);
  }

  /**
   * A debugging tool to log to the terminal while tests are running.
   * XXX: This isn't currently referenced, but it's useful for debugging so
   * do not remove it.
   *
   * @param {string} msg - The message to log, it will be prepended with the
   *    current PDF ID if there is one.
   */
  log(msg) {
    let id = this.browser;
    const task = this.manifest[this.currentTask];
    if (task) {
      id += `-${task.id}`;
    }

    this._info(`${id}: ${msg}`);
  }

  _nextTask() {
    let failure = "";

    this._cleanup().then(() => {
      if (this.currentTask === this.manifest.length) {
        this._done();
        return;
      }
      const task = this.manifest[this.currentTask];
      task.round = 0;
      task.pageNum = task.firstPage || 1;
      task.stats = { times: [] };
      task.enableXfa = task.enableXfa === true;

      const prevFile = md5FileMap.get(task.md5);
      if (prevFile) {
        if (task.file !== prevFile) {
          this._nextPage(
            task,
            `The "${task.file}" file is identical to the previously used "${prevFile}" file.`
          );
          return;
        }
      } else {
        md5FileMap.set(task.md5, task.file);
      }

      // Support *linked* test-cases for the other suites, e.g. unit- and
      // integration-tests, without needing to run them as reference-tests.
      if (task.type === "other") {
        this._log(`Skipping file "${task.file}"\n`);

        if (!task.link) {
          this._nextPage(task, 'Expected "other" test-case to be linked.');
          return;
        }
        this.currentTask++;
        this._nextTask();
        return;
      }

      this._log('Loading file "' + task.file + '"\n');

      try {
        let xfaStyleElement = null;
        if (task.enableXfa) {
          // Need to get the font definitions to inject them in the SVG.
          // So we create this element and those definitions will be
          // appended in font_loader.js.
          xfaStyleElement = document.createElement("style");
          document.documentElement
            .getElementsByTagName("head")[0]
            .append(xfaStyleElement);
        }
        const isOffscreenCanvasSupported =
          task.isOffscreenCanvasSupported === false ? false : undefined;
        const disableFontFace = task.disableFontFace === true;

        const loadingTask = getDocument({
          url: new URL(task.file, window.location),
          password: task.password,
          cMapUrl: CMAP_URL,
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
          wasmUrl: WASM_URL,
          disableAutoFetch: !task.enableAutoFetch,
          pdfBug: true,
          useSystemFonts: task.useSystemFonts,
          useWasm: task.useWasm,
          useWorkerFetch: task.useWorkerFetch,
          enableXfa: task.enableXfa,
          isOffscreenCanvasSupported,
          styleElement: xfaStyleElement,
          disableFontFace,
        });
        let promise = loadingTask.promise;

        if (task.annotationStorage) {
          for (const annotation of Object.values(task.annotationStorage)) {
            const { bitmapName, quadPoints, paths, outlines } = annotation;
            if (bitmapName) {
              promise = promise.then(async doc => {
                const response = await fetch(
                  new URL(`./images/${bitmapName}`, window.location)
                );
                const blob = await response.blob();
                if (bitmapName.endsWith(".svg")) {
                  const image = new Image();
                  const url = URL.createObjectURL(blob);
                  const imagePromise = new Promise((resolve, reject) => {
                    image.onload = () => {
                      const canvas = new OffscreenCanvas(
                        image.width,
                        image.height
                      );
                      const ctx = canvas.getContext("2d");
                      ctx.drawImage(image, 0, 0);
                      annotation.bitmap = canvas.transferToImageBitmap();
                      URL.revokeObjectURL(url);
                      resolve();
                    };
                    image.onerror = reject;
                  });
                  image.src = url;
                  await imagePromise;
                } else {
                  annotation.bitmap = await createImageBitmap(blob);
                }

                return doc;
              });
            }
            if (quadPoints) {
              // Just to ensure that the quadPoints are always a Float32Array
              // like IRL (in order to avoid bugs like bug 1907958).
              annotation.quadPoints = new Float32Array(quadPoints);
            }
            if (paths) {
              for (let i = 0, ii = paths.lines.length; i < ii; i++) {
                paths.lines[i] = Float32Array.from(
                  paths.lines[i],
                  x => x ?? NaN
                );
              }
              for (let i = 0, ii = paths.points.length; i < ii; i++) {
                paths.points[i] = Float32Array.from(
                  paths.points[i],
                  x => x ?? NaN
                );
              }
            }
            if (outlines) {
              if (Array.isArray(outlines)) {
                for (let i = 0, ii = outlines.length; i < ii; i++) {
                  outlines[i] = Float32Array.from(outlines[i], x => x ?? NaN);
                }
              } else {
                outlines.outline = Float32Array.from(
                  outlines.outline,
                  x => x ?? NaN
                );
                outlines.points = Float32Array.from(
                  outlines.points,
                  x => x ?? NaN
                );
              }
            }
          }
        }

        if (task.save) {
          promise = promise.then(async doc => {
            if (!task.annotationStorage) {
              throw new Error("Missing `annotationStorage` entry.");
            }
            if (task.loadAnnotations) {
              for (let num = 1; num <= doc.numPages; num++) {
                const page = await doc.getPage(num);
                await page.getAnnotations({ intent: "display" });
              }
            }
            doc.annotationStorage.setAll(task.annotationStorage);

            const data = await doc.saveDocument();
            await loadingTask.destroy();
            delete task.annotationStorage;

            return getDocument(data).promise;
          });
        }

        promise.then(
          async doc => {
            if (task.enableXfa) {
              task.fontRules = "";
              for (const rule of xfaStyleElement.sheet.cssRules) {
                task.fontRules += rule.cssText + "\n";
              }
            }

            task.pdfDoc = doc;
            task.optionalContentConfigPromise = doc.getOptionalContentConfig({
              intent: task.print ? "print" : "display",
            });

            if (task.optionalContent) {
              const entries = Object.entries(task.optionalContent),
                optionalContentConfig = await task.optionalContentConfigPromise;
              for (const [id, visible] of entries) {
                optionalContentConfig.setVisibility(id, visible);
              }
            }

            if (task.forms) {
              task.fieldObjects = await doc.getFieldObjects();
            }

            this._nextPage(task, failure);
          },
          err => {
            failure = "Loading PDF document: " + err;
            this._nextPage(task, failure);
          }
        );
        return;
      } catch (e) {
        failure = "Loading PDF document: " + this._exceptionToString(e);
      }
      this._nextPage(task, failure);
    });
  }

  _cleanup() {
    // Clear out all the stylesheets since a new one is created for each font.
    while (document.styleSheets.length > 0) {
      const styleSheet = document.styleSheets[0];
      while (styleSheet.cssRules.length > 0) {
        styleSheet.deleteRule(0);
      }
      styleSheet.ownerNode.remove();
    }
    const body = document.body;
    while (body.lastChild !== this.end) {
      body.lastChild.remove();
    }

    const destroyedPromises = [];
    // Wipe out the link to the pdfdoc so it can be GC'ed.
    for (let i = 0; i < this.manifest.length; i++) {
      if (this.manifest[i].pdfDoc) {
        destroyedPromises.push(this.manifest[i].pdfDoc.destroy());
        delete this.manifest[i].pdfDoc;
      }
    }
    return Promise.all(destroyedPromises);
  }

  _exceptionToString(e) {
    if (typeof e !== "object") {
      return String(e);
    }
    if (!("message" in e)) {
      return JSON.stringify(e);
    }
    return e.message + ("stack" in e ? " at " + e.stack.split("\n", 1)[0] : "");
  }

  _getLastPageNumber(task) {
    if (!task.pdfDoc) {
      return task.firstPage || 1;
    }
    return task.lastPage || task.pdfDoc.numPages;
  }

  _nextPage(task, loadError) {
    let failure = loadError || "";
    let ctx;

    if (!task.pdfDoc) {
      const dataUrl = this.canvas.toDataURL("image/png");
      this._sendResult(dataUrl, task, failure).then(() => {
        this._log(
          "done" + (failure ? " (failed !: " + failure + ")" : "") + "\n"
        );
        this.currentTask++;
        this._nextTask();
      });
      return;
    }

    if (task.pageNum > this._getLastPageNumber(task)) {
      if (++task.round < task.rounds) {
        this._log(" Round " + (1 + task.round) + "\n");
        task.pageNum = task.firstPage || 1;
      } else {
        this.currentTask++;
        this._nextTask();
        return;
      }
    }

    if (task.skipPages?.includes(task.pageNum)) {
      this._log(
        " Skipping page " + task.pageNum + "/" + task.pdfDoc.numPages + "...\n"
      );
      task.pageNum++;
      this._nextPage(task);
      return;
    }

    if (!failure) {
      try {
        this._log(
          " Loading page " + task.pageNum + "/" + task.pdfDoc.numPages + "... "
        );
        ctx = this.canvas.getContext("2d", { alpha: false });
        task.pdfDoc.getPage(task.pageNum).then(
          page => {
            // Default to creating the test images at the devices pixel ratio,
            // unless the test explicitly specifies an output scale.
            const outputScale = task.outputScale || window.devicePixelRatio;
            let viewport = page.getViewport({
              scale: PixelsPerInch.PDF_TO_CSS_UNITS,
            });
            if (task.rotation) {
              viewport = viewport.clone({ rotation: task.rotation });
            }
            // Restrict the test from creating a canvas that is too big.
            const MAX_CANVAS_PIXEL_DIMENSION = 4096;
            const largestDimension = Math.max(viewport.width, viewport.height);
            if (
              Math.floor(largestDimension * outputScale) >
              MAX_CANVAS_PIXEL_DIMENSION
            ) {
              const rescale = MAX_CANVAS_PIXEL_DIMENSION / largestDimension;
              viewport = viewport.clone({
                scale: PixelsPerInch.PDF_TO_CSS_UNITS * rescale,
              });
            }
            const pixelWidth = Math.floor(viewport.width * outputScale);
            const pixelHeight = Math.floor(viewport.height * outputScale);
            task.viewportWidth = Math.floor(viewport.width);
            task.viewportHeight = Math.floor(viewport.height);
            task.outputScale = outputScale;
            this.canvas.width = pixelWidth;
            this.canvas.height = pixelHeight;
            this.canvas.style.width = Math.floor(viewport.width) + "px";
            this.canvas.style.height = Math.floor(viewport.height) + "px";
            this._clearCanvas();

            const transform =
              outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            // Initialize various `eq` test subtypes, see comment below.
            let renderAnnotations = false,
              renderForms = false,
              renderPrint = false,
              renderXfa = false,
              annotationCanvasMap = null,
              pageColors = null;

            if (task.annotationStorage) {
              task.pdfDoc.annotationStorage.setAll(task.annotationStorage);
            }

            let textLayerCanvas, annotationLayerCanvas, annotationLayerContext;
            let initPromise;
            if (task.type === "text" || task.type === "highlight") {
              // Using a dummy canvas for PDF context drawing operations
              textLayerCanvas = this.textLayerCanvas;
              if (!textLayerCanvas) {
                textLayerCanvas = document.createElement("canvas");
                this.textLayerCanvas = textLayerCanvas;
              }
              textLayerCanvas.width = pixelWidth;
              textLayerCanvas.height = pixelHeight;
              const textLayerContext = textLayerCanvas.getContext("2d");
              textLayerContext.clearRect(
                0,
                0,
                textLayerCanvas.width,
                textLayerCanvas.height
              );
              textLayerContext.scale(outputScale, outputScale);
              // The text builder will draw its content on the test canvas
              initPromise = page
                .getTextContent({
                  includeMarkedContent: true,
                  disableNormalization: true,
                })
                .then(function (textContent) {
                  return task.type === "text"
                    ? Rasterize.textLayer(
                        textLayerContext,
                        viewport,
                        textContent
                      )
                    : Rasterize.highlightLayer(
                        textLayerContext,
                        viewport,
                        textContent
                      );
                });
            } else {
              textLayerCanvas = null;
              // We fetch the `eq` specific test subtypes here, to avoid
              // accidentally changing the behaviour for other types of tests.
              renderAnnotations = !!task.annotations;
              renderForms = !!task.forms;
              renderPrint = !!task.print;
              renderXfa = !!task.enableXfa;
              pageColors = task.pageColors || null;

              // Render the annotation layer if necessary.
              if (renderAnnotations || renderForms || renderXfa) {
                // Create a dummy canvas for the drawing operations.
                annotationLayerCanvas = this.annotationLayerCanvas;
                if (!annotationLayerCanvas) {
                  annotationLayerCanvas = document.createElement("canvas");
                  this.annotationLayerCanvas = annotationLayerCanvas;
                }
                annotationLayerCanvas.width = pixelWidth;
                annotationLayerCanvas.height = pixelHeight;
                annotationLayerContext = annotationLayerCanvas.getContext("2d");
                annotationLayerContext.clearRect(
                  0,
                  0,
                  annotationLayerCanvas.width,
                  annotationLayerCanvas.height
                );
                annotationLayerContext.scale(outputScale, outputScale);

                if (!renderXfa) {
                  // The annotation builder will draw its content
                  // on the canvas.
                  initPromise = page.getAnnotations({ intent: "display" });
                  annotationCanvasMap = new Map();
                } else {
                  initPromise = page.getXfa().then(function (xfaHtml) {
                    return Rasterize.xfaLayer(
                      annotationLayerContext,
                      viewport,
                      xfaHtml,
                      task.fontRules,
                      task.pdfDoc.annotationStorage,
                      task.renderPrint
                    );
                  });
                }
              } else {
                annotationLayerCanvas = null;
                initPromise = Promise.resolve();
              }
            }
            const renderContext = {
              canvasContext: ctx,
              viewport,
              optionalContentConfigPromise: task.optionalContentConfigPromise,
              annotationCanvasMap,
              pageColors,
              transform,
            };
            if (renderForms) {
              renderContext.annotationMode = AnnotationMode.ENABLE_FORMS;
            } else if (renderPrint) {
              if (task.annotationStorage) {
                renderContext.annotationMode = AnnotationMode.ENABLE_STORAGE;
              }
              renderContext.intent = "print";
            }

            const completeRender = error => {
              // if text layer is present, compose it on top of the page
              if (textLayerCanvas) {
                if (task.type === "text") {
                  ctx.save();
                  ctx.globalCompositeOperation = "screen";
                  ctx.fillStyle = "rgb(128, 255, 128)"; // making it green
                  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
                  ctx.restore();
                  ctx.drawImage(textLayerCanvas, 0, 0);
                } else if (task.type === "highlight") {
                  ctx.save();
                  ctx.globalCompositeOperation = "multiply";
                  ctx.drawImage(textLayerCanvas, 0, 0);
                  ctx.restore();
                }
              }
              // If we have annotation layer, compose it on top of the page.
              if (annotationLayerCanvas) {
                ctx.drawImage(annotationLayerCanvas, 0, 0);
              }
              if (page.stats) {
                // Get the page stats *before* running cleanup.
                task.stats = page.stats;
              }
              page.cleanup(/* resetStats = */ true);
              this._snapshot(task, error);
            };
            initPromise
              .then(data => {
                const renderTask = page.render(renderContext);

                if (task.renderTaskOnContinue) {
                  renderTask.onContinue = function (cont) {
                    // Slightly delay the continued rendering.
                    setTimeout(cont, RENDER_TASK_ON_CONTINUE_DELAY);
                  };
                }
                return renderTask.promise.then(() => {
                  if (annotationCanvasMap) {
                    Rasterize.annotationLayer(
                      annotationLayerContext,
                      viewport,
                      outputScale,
                      data,
                      annotationCanvasMap,
                      task.pdfDoc.annotationStorage,
                      task.fieldObjects,
                      page,
                      IMAGE_RESOURCES_PATH,
                      renderForms
                    ).then(() => {
                      completeRender(false);
                    });
                  } else {
                    completeRender(false);
                  }
                });
              })
              .catch(function (error) {
                completeRender("render : " + error);
              });
          },
          error => {
            this._snapshot(task, "render : " + error);
          }
        );
      } catch (e) {
        failure = "page setup : " + this._exceptionToString(e);
        this._snapshot(task, failure);
      }
    }
  }

  _clearCanvas() {
    const ctx = this.canvas.getContext("2d", { alpha: false });
    ctx.beginPath();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _snapshot(task, failure) {
    this._log("Snapshotting... ");

    const dataUrl = this.canvas.toDataURL("image/png");
    this._sendResult(dataUrl, task, failure).then(() => {
      this._log(
        "done" + (failure ? " (failed !: " + failure + ")" : "") + "\n"
      );
      task.pageNum++;
      this._nextPage(task);
    });
  }

  _quit() {
    this._log("Done !");
    this.end.textContent = "Tests finished. Close this window!";

    // Send the quit request
    fetch(`/tellMeToQuit?browser=${escape(this.browser)}`, {
      method: "POST",
    });
  }

  _info(message) {
    this._send(
      "/info",
      JSON.stringify({
        browser: this.browser,
        message,
      })
    );
  }

  _log(message) {
    // Using insertAdjacentHTML yields a large performance gain and
    // reduces runtime significantly.
    if (this.output.insertAdjacentHTML) {
      // eslint-disable-next-line no-unsanitized/method
      this.output.insertAdjacentHTML("BeforeEnd", message);
    } else {
      this.output.textContent += message;
    }

    if (message.includes("\n") && !this.disableScrolling.checked) {
      // Scroll to the bottom of the page
      this.output.scrollTop = this.output.scrollHeight;
    }
  }

  _done() {
    if (this.inFlightRequests > 0) {
      this.inflight.textContent = this.inFlightRequests;
      setTimeout(this._done.bind(this), WAITING_TIME);
    } else {
      setTimeout(this._quit.bind(this), WAITING_TIME);
    }
  }

  _sendResult(snapshot, task, failure) {
    const result = JSON.stringify({
      browser: this.browser,
      id: task.id,
      numPages: task.pdfDoc ? task.lastPage || task.pdfDoc.numPages : 0,
      lastPageNum: this._getLastPageNumber(task),
      failure,
      file: task.file,
      round: task.round,
      page: task.pageNum,
      snapshot,
      stats: task.stats.times,
      viewportWidth: task.viewportWidth,
      viewportHeight: task.viewportHeight,
      outputScale: task.outputScale,
    });
    return this._send("/submit_task_results", result);
  }

  _send(url, message) {
    const { promise, resolve } = Promise.withResolvers();
    this.inflight.textContent = this.inFlightRequests++;

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: message,
    })
      .then(response => {
        // Retry until successful.
        if (!response.ok || response.status !== 200) {
          throw new Error(response.statusText);
        }

        this.inFlightRequests--;
        resolve();
      })
      .catch(reason => {
        console.warn(`Driver._send failed (${url}):`, reason);

        this.inFlightRequests--;
        resolve();

        this._send(url, message);
      });

    return promise;
  }
}

export { Driver };
