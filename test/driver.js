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
/* globals pdfjsLib, pdfjsViewer */

"use strict";

const {
  AnnotationLayer,
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  PixelsPerInch,
  renderTextLayer,
  shadow,
  XfaLayer,
} = pdfjsLib;
const { parseQueryString, SimpleLinkService } = pdfjsViewer;

const WAITING_TIME = 100; // ms
const CMAP_URL = "/build/generic/web/cmaps/";
const CMAP_PACKED = true;
const STANDARD_FONT_DATA_URL = "/build/generic/web/standard_fonts/";
const IMAGE_RESOURCES_PATH = "/web/images/";
const WORKER_SRC = "../build/generic/build/pdf.worker.js";
const RENDER_TASK_ON_CONTINUE_DELAY = 5; // ms
const SVG_NS = "http://www.w3.org/2000/svg";

const md5FileMap = new Map();

function loadStyles(styles) {
  const promises = [];

  for (const file of styles) {
    promises.push(
      new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", file);
        xhr.onload = function () {
          resolve(xhr.responseText);
        };
        xhr.onerror = function (e) {
          reject(new Error(`Error fetching style (${file}): ${e}`));
        };
        xhr.send(null);
      })
    );
  }

  return Promise.all(promises);
}

function writeSVG(svgElement, ctx) {
  // We need to have UTF-8 encoded XML.
  const svg_xml = unescape(
    encodeURIComponent(new XMLSerializer().serializeToString(svgElement))
  );
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svg_xml);
    img.onload = function () {
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = function (e) {
      reject(new Error(`Error rasterizing SVG: ${e}`));
    };
  });
}

function inlineImages(images) {
  const imagePromises = [];
  for (let i = 0, ii = images.length; i < ii; i++) {
    imagePromises.push(
      new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "blob";
        xhr.onload = function () {
          const reader = new FileReader();
          reader.onloadend = function () {
            resolve(reader.result);
          };
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = function (e) {
          reject(new Error("Error fetching inline image " + e));
        };
        xhr.open("GET", images[i].src);
        xhr.send();
      })
    );
  }
  return Promise.all(imagePromises);
}

async function convertCanvasesToImages(annotationCanvasMap) {
  const results = new Map();
  const promises = [];
  for (const [key, canvas] of annotationCanvasMap) {
    promises.push(
      new Promise(resolve => {
        canvas.toBlob(blob => {
          const image = document.createElement("img");
          image.onload = resolve;
          results.set(key, image);
          image.src = URL.createObjectURL(blob);
        });
      })
    );
  }
  await Promise.all(promises);
  return results;
}

async function resolveImages(node, silentErrors = false) {
  const images = node.getElementsByTagName("img");
  const data = await inlineImages(images);

  const loadedPromises = [];
  for (let i = 0, ii = data.length; i < ii; i++) {
    loadedPromises.push(
      new Promise(function (resolveImage, rejectImage) {
        images[i].onload = resolveImage;
        images[i].onerror = function (e) {
          if (silentErrors) {
            resolveImage();
          } else {
            rejectImage(new Error("Error loading image " + e));
          }
        };
        images[i].src = data[i];
      })
    );
  }
  await Promise.all(loadedPromises);
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
    const styles = [
      "../web/annotation_layer_builder.css",
      "./annotation_layer_builder_overrides.css",
    ];
    return shadow(this, "annotationStylePromise", loadStyles(styles));
  }

  static get textStylePromise() {
    const styles = ["./text_layer_test.css"];
    return shadow(this, "textStylePromise", loadStyles(styles));
  }

  static get xfaStylePromise() {
    const styles = [
      "../web/xfa_layer_builder.css",
      "./xfa_layer_builder_overrides.css",
    ];
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
    foreignObject.appendChild(style);

    const div = document.createElement("div");
    foreignObject.appendChild(div);

    return { svg, foreignObject, style, div };
  }

  static async annotationLayer(
    ctx,
    viewport,
    annotations,
    annotationCanvasMap,
    page,
    imageResourcesPath,
    renderForms = false
  ) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);
      div.className = "annotationLayer";

      const [common, overrides] = await this.annotationStylePromise;
      style.textContent = `${common}\n${overrides}`;

      const annotationViewport = viewport.clone({ dontFlip: true });
      const annotationImageMap = await convertCanvasesToImages(
        annotationCanvasMap
      );

      // Rendering annotation layer as HTML.
      const parameters = {
        viewport: annotationViewport,
        div,
        annotations,
        page,
        linkService: new SimpleLinkService(),
        imageResourcesPath,
        renderForms,
        annotationCanvasMap: annotationImageMap,
      };
      AnnotationLayer.render(parameters);

      // Inline SVG images from text annotations.
      await resolveImages(div);
      foreignObject.appendChild(div);
      svg.appendChild(foreignObject);

      await writeSVG(svg, ctx);
    } catch (reason) {
      throw new Error(`Rasterize.annotationLayer: "${reason?.message}".`);
    }
  }

  static async textLayer(ctx, viewport, textContent, enhanceTextSelection) {
    try {
      const { svg, foreignObject, style, div } = this.createContainer(viewport);
      div.className = "textLayer";

      // Items are transformed to have 1px font size.
      svg.setAttribute("font-size", 1);

      const [cssRules] = await this.textStylePromise;
      style.textContent = cssRules;

      // Rendering text layer as HTML.
      const task = renderTextLayer({
        textContent,
        container: div,
        viewport,
        enhanceTextSelection,
      });
      await task.promise;

      task.expandTextDivs(true);
      svg.appendChild(foreignObject);

      await writeSVG(svg, ctx);
    } catch (reason) {
      throw new Error(`Rasterize.textLayer: "${reason?.message}".`);
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
      style.textContent = `${fontRules}\n${common}\n${overrides}`;

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
      await resolveImages(div, /* silentErrors = */ true);
      svg.appendChild(foreignObject);

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

// eslint-disable-next-line no-unused-vars
class Driver {
  /**
   * @param {DriverOptions} options
   */
  constructor(options) {
    // Configure the global worker options.
    GlobalWorkerOptions.workerSrc = WORKER_SRC;

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

    const r = new XMLHttpRequest();
    r.open("GET", this.manifestFile, false);
    r.onreadystatechange = () => {
      if (r.readyState === 4) {
        this._log("done\n");
        this.manifest = JSON.parse(r.responseText);
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
      }
    };
    if (this.delay > 0) {
      this._log("\nDelaying for " + this.delay + " ms...\n");
    }
    // When gathering the stats the numbers seem to be more reliable
    // if the browser is given more time to start.
    setTimeout(function () {
      r.send(null);
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

      const absoluteUrl = new URL(task.file, window.location).href;
      try {
        let xfaStyleElement = null;
        if (task.enableXfa) {
          // Need to get the font definitions to inject them in the SVG.
          // So we create this element and those definitions will be
          // appended in font_loader.js.
          xfaStyleElement = document.createElement("style");
          document.documentElement
            .getElementsByTagName("head")[0]
            .appendChild(xfaStyleElement);
        }

        const loadingTask = getDocument({
          url: absoluteUrl,
          password: task.password,
          cMapUrl: CMAP_URL,
          cMapPacked: CMAP_PACKED,
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
          disableRange: task.disableRange,
          disableAutoFetch: !task.enableAutoFetch,
          pdfBug: true,
          useSystemFonts: task.useSystemFonts,
          useWorkerFetch: task.useWorkerFetch,
          enableXfa: task.enableXfa,
          styleElement: xfaStyleElement,
        });
        loadingTask.promise.then(
          async doc => {
            if (task.enableXfa) {
              task.fontRules = "";
              for (const rule of xfaStyleElement.sheet.cssRules) {
                task.fontRules += rule.cssText + "\n";
              }
            }

            task.pdfDoc = doc;
            task.optionalContentConfigPromise = doc.getOptionalContentConfig();

            if (task.optionalContent) {
              const entries = Object.entries(task.optionalContent),
                optionalContentConfig = await task.optionalContentConfigPromise;
              for (const [id, visible] of entries) {
                optionalContentConfig.setVisibility(id, visible);
              }
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
    return e.message + ("stack" in e ? " at " + e.stack.split("\n")[0] : "");
  }

  _getLastPageNumber(task) {
    if (!task.pdfDoc) {
      return task.firstPage || 1;
    }
    let lastPageNumber = task.lastPage || 0;
    if (!lastPageNumber || lastPageNumber > task.pdfDoc.numPages) {
      lastPageNumber = task.pdfDoc.numPages;
    }
    return lastPageNumber;
  }

  _nextPage(task, loadError) {
    let failure = loadError || "";
    let ctx;

    if (!task.pdfDoc) {
      const dataUrl = this.canvas.toDataURL("image/png");
      this._sendResult(dataUrl, task, failure, () => {
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

    if (task.skipPages && task.skipPages.includes(task.pageNum)) {
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
        this.canvas.mozOpaque = true;
        ctx = this.canvas.getContext("2d", { alpha: false });
        task.pdfDoc.getPage(task.pageNum).then(
          page => {
            const viewport = page.getViewport({
              scale: PixelsPerInch.PDF_TO_CSS_UNITS,
            });
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;
            this._clearCanvas();

            // Initialize various `eq` test subtypes, see comment below.
            let renderAnnotations = false,
              renderForms = false,
              renderPrint = false,
              renderXfa = false,
              annotationCanvasMap = null;

            if (task.annotationStorage) {
              const entries = Object.entries(task.annotationStorage),
                docAnnotationStorage = task.pdfDoc.annotationStorage;
              for (const [key, value] of entries) {
                docAnnotationStorage.setValue(key, value);
              }
            }

            let textLayerCanvas, annotationLayerCanvas, annotationLayerContext;
            let initPromise;
            if (task.type === "text") {
              // Using a dummy canvas for PDF context drawing operations
              textLayerCanvas = this.textLayerCanvas;
              if (!textLayerCanvas) {
                textLayerCanvas = document.createElement("canvas");
                this.textLayerCanvas = textLayerCanvas;
              }
              textLayerCanvas.width = viewport.width;
              textLayerCanvas.height = viewport.height;
              const textLayerContext = textLayerCanvas.getContext("2d");
              textLayerContext.clearRect(
                0,
                0,
                textLayerCanvas.width,
                textLayerCanvas.height
              );
              const enhanceText = !!task.enhance;
              // The text builder will draw its content on the test canvas
              initPromise = page
                .getTextContent({
                  includeMarkedContent: true,
                })
                .then(function (textContent) {
                  return Rasterize.textLayer(
                    textLayerContext,
                    viewport,
                    textContent,
                    enhanceText
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

              // Render the annotation layer if necessary.
              if (renderAnnotations || renderForms || renderXfa) {
                // Create a dummy canvas for the drawing operations.
                annotationLayerCanvas = this.annotationLayerCanvas;
                if (!annotationLayerCanvas) {
                  annotationLayerCanvas = document.createElement("canvas");
                  this.annotationLayerCanvas = annotationLayerCanvas;
                }
                annotationLayerCanvas.width = viewport.width;
                annotationLayerCanvas.height = viewport.height;
                annotationLayerContext = annotationLayerCanvas.getContext("2d");
                annotationLayerContext.clearRect(
                  0,
                  0,
                  annotationLayerCanvas.width,
                  annotationLayerCanvas.height
                );

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
                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.fillStyle = "rgb(128, 255, 128)"; // making it green
                ctx.fillRect(0, 0, viewport.width, viewport.height);
                ctx.restore();
                ctx.drawImage(textLayerCanvas, 0, 0);
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
              .then(function (data) {
                const renderTask = page.render(renderContext);

                if (task.renderTaskOnContinue) {
                  renderTask.onContinue = function (cont) {
                    // Slightly delay the continued rendering.
                    setTimeout(cont, RENDER_TASK_ON_CONTINUE_DELAY);
                  };
                }
                return renderTask.promise.then(function () {
                  if (annotationCanvasMap) {
                    Rasterize.annotationLayer(
                      annotationLayerContext,
                      viewport,
                      data,
                      annotationCanvasMap,
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
    this._sendResult(dataUrl, task, failure, () => {
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
    const r = new XMLHttpRequest();
    r.open("POST", `/tellMeToQuit?browser=${escape(this.browser)}`, false);
    r.onreadystatechange = function (e) {
      if (r.readyState === 4) {
        window.close();
      }
    };
    r.send(null);
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

    if (message.lastIndexOf("\n") >= 0 && !this.disableScrolling.checked) {
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

  _sendResult(snapshot, task, failure, callback) {
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
    });
    this._send("/submit_task_results", result, callback);
  }

  _send(url, message, callback) {
    const r = new XMLHttpRequest();
    r.open("POST", url, true);
    r.setRequestHeader("Content-Type", "application/json");
    r.onreadystatechange = e => {
      if (r.readyState === 4) {
        this.inFlightRequests--;

        // Retry until successful
        if (r.status !== 200) {
          setTimeout(() => {
            this._send(url, message);
          });
        }
        if (callback) {
          callback();
        }
      }
    };
    this.inflight.textContent = this.inFlightRequests++;
    r.send(message);
  }
}
