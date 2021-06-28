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
/* eslint-disable no-var */
/* globals pdfjsLib, pdfjsViewer */

"use strict";

const WAITING_TIME = 100; // ms
const PDF_TO_CSS_UNITS = 96.0 / 72.0;
const CMAP_URL = "/build/generic/web/cmaps/";
const CMAP_PACKED = true;
const STANDARD_FONT_DATA_URL = "/build/generic/web/standard_fonts/";
const IMAGE_RESOURCES_PATH = "/web/images/";
const WORKER_SRC = "../build/generic/build/pdf.worker.js";
const RENDER_TASK_ON_CONTINUE_DELAY = 5; // ms
const SVG_NS = "http://www.w3.org/2000/svg";

function loadStyles(styles) {
  styles = Object.values(styles);
  if (styles.every(style => style.promise)) {
    return Promise.all(styles.map(style => style.promise));
  }

  for (const style of styles) {
    style.promise = new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", style.file);
      xhr.onload = function () {
        resolve(xhr.responseText);
      };
      xhr.onerror = function (e) {
        reject(new Error(`Error fetching style (${style.file}): ${e}`));
      };
      xhr.send(null);
    });
  }

  return Promise.all(styles.map(style => style.promise));
}

function writeSVG(svgElement, ctx, resolve, reject) {
  // We need to have UTF-8 encoded XML.
  const svg_xml = unescape(
    encodeURIComponent(new XMLSerializer().serializeToString(svgElement))
  );
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(svg_xml);
  img.onload = function () {
    ctx.drawImage(img, 0, 0);
    resolve();
  };
  img.onerror = function (e) {
    reject(new Error("Error rasterizing text layer " + e));
  };
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

async function resolveImages(node, silentErrors = false) {
  const images = node.getElementsByTagName("img");
  const data = await inlineImages(images);

  const loadedPromises = [];
  for (let i = 0, ii = data.length; i < ii; i++) {
    images[i].src = data[i];
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
      })
    );
  }
  await Promise.all(loadedPromises);
}

/**
 * @class
 */
var rasterizeTextLayer = (function rasterizeTextLayerClosure() {
  const styles = {
    common: {
      file: "./text_layer_test.css",
      promise: null,
    },
  };

  function getTextLayerStyle() {
    return loadStyles(styles);
  }

  // eslint-disable-next-line no-shadow
  function rasterizeTextLayer(
    ctx,
    viewport,
    textContent,
    enhanceTextSelection
  ) {
    return new Promise(function (resolve, reject) {
      // Building SVG with size of the viewport.
      var svg = document.createElementNS(SVG_NS, "svg:svg");
      svg.setAttribute("width", viewport.width + "px");
      svg.setAttribute("height", viewport.height + "px");
      // items are transformed to have 1px font size
      svg.setAttribute("font-size", 1);

      // Adding element to host our HTML (style + text layer div).
      var foreignObject = document.createElementNS(SVG_NS, "svg:foreignObject");
      foreignObject.setAttribute("x", "0");
      foreignObject.setAttribute("y", "0");
      foreignObject.setAttribute("width", viewport.width + "px");
      foreignObject.setAttribute("height", viewport.height + "px");
      var style = document.createElement("style");
      var stylePromise = getTextLayerStyle();
      foreignObject.appendChild(style);
      var div = document.createElement("div");
      div.className = "textLayer";
      foreignObject.appendChild(div);

      stylePromise
        .then(async cssRules => {
          style.textContent = cssRules;

          // Rendering text layer as HTML.
          var task = pdfjsLib.renderTextLayer({
            textContent,
            container: div,
            viewport,
            enhanceTextSelection,
          });
          await task.promise;

          task.expandTextDivs(true);
          svg.appendChild(foreignObject);

          writeSVG(svg, ctx, resolve, reject);
        })
        .catch(reason => {
          reject(new Error(`rasterizeTextLayer: "${reason?.message}".`));
        });
    });
  }

  return rasterizeTextLayer;
})();

/**
 * @class
 */
var rasterizeAnnotationLayer = (function rasterizeAnnotationLayerClosure() {
  /**
   * For the reference tests, the entire annotation layer must be visible. To
   * achieve this, we load the common styles as used by the viewer and extend
   * them with a set of overrides to make all elements visible.
   *
   * Note that we cannot simply use `@import` to import the common styles in
   * the overrides file because the browser does not resolve that when the
   * styles are inserted via XHR. Therefore, we load and combine them here.
   */
  const styles = {
    common: {
      file: "../web/annotation_layer_builder.css",
      promise: null,
    },
    overrides: {
      file: "./annotation_layer_builder_overrides.css",
      promise: null,
    },
  };

  function getAnnotationLayerStyle() {
    return loadStyles(styles);
  }

  // eslint-disable-next-line no-shadow
  function rasterizeAnnotationLayer(
    ctx,
    viewport,
    annotations,
    page,
    imageResourcesPath,
    renderInteractiveForms
  ) {
    return new Promise(function (resolve, reject) {
      // Building SVG with size of the viewport.
      var svg = document.createElementNS(SVG_NS, "svg:svg");
      svg.setAttribute("width", viewport.width + "px");
      svg.setAttribute("height", viewport.height + "px");

      // Adding element to host our HTML (style + annotation layer div).
      var foreignObject = document.createElementNS(SVG_NS, "svg:foreignObject");
      foreignObject.setAttribute("x", "0");
      foreignObject.setAttribute("y", "0");
      foreignObject.setAttribute("width", viewport.width + "px");
      foreignObject.setAttribute("height", viewport.height + "px");
      var style = document.createElement("style");
      var stylePromise = getAnnotationLayerStyle();
      foreignObject.appendChild(style);
      var div = document.createElement("div");
      div.className = "annotationLayer";

      // Rendering annotation layer as HTML.
      stylePromise
        .then(async (common, overrides) => {
          style.textContent = common + overrides;

          var annotation_viewport = viewport.clone({ dontFlip: true });
          var parameters = {
            viewport: annotation_viewport,
            div,
            annotations,
            page,
            linkService: new pdfjsViewer.SimpleLinkService(),
            imageResourcesPath,
            renderInteractiveForms,
          };
          pdfjsLib.AnnotationLayer.render(parameters);

          // Inline SVG images from text annotations.
          await resolveImages(div);
          foreignObject.appendChild(div);
          svg.appendChild(foreignObject);

          writeSVG(svg, ctx, resolve, reject);
        })
        .catch(reason => {
          reject(new Error(`rasterizeAnnotationLayer: "${reason?.message}".`));
        });
    });
  }

  return rasterizeAnnotationLayer;
})();

/**
 * @class
 */
var rasterizeXfaLayer = (function rasterizeXfaLayerClosure() {
  const styles = {
    common: {
      file: "../web/xfa_layer_builder.css",
      promise: null,
    },
  };

  function getXfaLayerStyle() {
    return loadStyles(styles);
  }

  // eslint-disable-next-line no-shadow
  function rasterizeXfaLayer(ctx, viewport, xfa, fontRules) {
    return new Promise(function (resolve, reject) {
      // Building SVG with size of the viewport.
      const svg = document.createElementNS(SVG_NS, "svg:svg");
      svg.setAttribute("width", viewport.width + "px");
      svg.setAttribute("height", viewport.height + "px");
      const foreignObject = document.createElementNS(
        SVG_NS,
        "svg:foreignObject"
      );
      foreignObject.setAttribute("x", "0");
      foreignObject.setAttribute("y", "0");
      foreignObject.setAttribute("width", viewport.width + "px");
      foreignObject.setAttribute("height", viewport.height + "px");
      const style = document.createElement("style");
      const stylePromise = getXfaLayerStyle();
      foreignObject.appendChild(style);
      const div = document.createElement("div");
      foreignObject.appendChild(div);

      stylePromise
        .then(async cssRules => {
          style.textContent = fontRules + "\n" + cssRules;

          pdfjsLib.XfaLayer.render({
            xfa,
            div,
            viewport: viewport.clone({ dontFlip: true }),
          });

          // Some unsupported type of images (e.g. tiff)
          // lead to errors.
          await resolveImages(div, /* silentErrors = */ true);
          svg.appendChild(foreignObject);

          writeSVG(svg, ctx, resolve, reject);
        })
        .catch(reason => {
          reject(new Error(`rasterizeXfaLayer: "${reason?.message}".`));
        });
    });
  }

  return rasterizeXfaLayer;
})();

/**
 * @typedef {Object} DriverOptions
 * @property {HTMLSpanElement} inflight - Field displaying the number of
 *   inflight requests.
 * @property {HTMLInputElement} disableScrolling - Checkbox to disable
 *   automatic scrolling of the output container.
 * @property {HTMLPreElement} output - Container for all output messages.
 * @property {HTMLDivElement} end - Container for a completion message.
 */

/**
 * @class
 */
// eslint-disable-next-line no-unused-vars
var Driver = (function DriverClosure() {
  /**
   * @constructs Driver
   * @param {DriverOptions} options
   */
  // eslint-disable-next-line no-shadow
  function Driver(options) {
    // Configure the global worker options.
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

    // Set the passed options
    this.inflight = options.inflight;
    this.disableScrolling = options.disableScrolling;
    this.output = options.output;
    this.end = options.end;

    // Set parameters from the query string
    var parameters = this._getQueryStringParameters();
    this.browser = parameters.browser;
    this.manifestFile = parameters.manifestFile;
    this.delay = parameters.delay | 0 || 0;
    this.inFlightRequests = 0;
    this.testFilter = parameters.testFilter
      ? JSON.parse(parameters.testFilter)
      : [];

    // Create a working canvas
    this.canvas = document.createElement("canvas");
  }

  Driver.prototype = {
    _getQueryStringParameters: function Driver_getQueryStringParameters() {
      var queryString = window.location.search.substring(1);
      var values = queryString.split("&");
      var parameters = {};
      for (var i = 0, ii = values.length; i < ii; i++) {
        var value = values[i].split("=");
        parameters[unescape(value[0])] = unescape(value[1]);
      }
      return parameters;
    },

    run: function Driver_run() {
      var self = this;
      window.onerror = function (message, source, line, column, error) {
        self._info(
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

      var r = new XMLHttpRequest();
      r.open("GET", this.manifestFile, false);
      r.onreadystatechange = function () {
        if (r.readyState === 4) {
          self._log("done\n");
          self.manifest = JSON.parse(r.responseText);
          if (self.testFilter && self.testFilter.length) {
            self.manifest = self.manifest.filter(function (item) {
              return self.testFilter.includes(item.id);
            });
          }
          self.currentTask = 0;
          self._nextTask();
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
    },

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

          const loadingTask = pdfjsLib.getDocument({
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
            doc => {
              if (task.enableXfa) {
                task.fontRules = "";
                for (const rule of xfaStyleElement.sheet.cssRules) {
                  task.fontRules += rule.cssText + "\n";
                }
              }

              task.pdfDoc = doc;
              task.optionalContentConfigPromise =
                doc.getOptionalContentConfig();

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
    },

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
        body.removeChild(body.lastChild);
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
    },

    _exceptionToString: function Driver_exceptionToString(e) {
      if (typeof e !== "object") {
        return String(e);
      }
      if (!("message" in e)) {
        return JSON.stringify(e);
      }
      return e.message + ("stack" in e ? " at " + e.stack.split("\n")[0] : "");
    },

    _getLastPageNumber: function Driver_getLastPageNumber(task) {
      if (!task.pdfDoc) {
        return task.firstPage || 1;
      }
      var lastPageNumber = task.lastPage || 0;
      if (!lastPageNumber || lastPageNumber > task.pdfDoc.numPages) {
        lastPageNumber = task.pdfDoc.numPages;
      }
      return lastPageNumber;
    },

    _nextPage: function Driver_nextPage(task, loadError) {
      var self = this;
      var failure = loadError || "";
      var ctx;

      if (!task.pdfDoc) {
        var dataUrl = this.canvas.toDataURL("image/png");
        this._sendResult(dataUrl, task, failure, function () {
          self._log(
            "done" + (failure ? " (failed !: " + failure + ")" : "") + "\n"
          );
          self.currentTask++;
          self._nextTask();
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
          " Skipping page " +
            task.pageNum +
            "/" +
            task.pdfDoc.numPages +
            "...\n"
        );
        task.pageNum++;
        this._nextPage(task);
        return;
      }

      if (!failure) {
        try {
          this._log(
            " Loading page " +
              task.pageNum +
              "/" +
              task.pdfDoc.numPages +
              "... "
          );
          this.canvas.mozOpaque = true;
          ctx = this.canvas.getContext("2d", { alpha: false });
          task.pdfDoc.getPage(task.pageNum).then(
            function (page) {
              var viewport = page.getViewport({ scale: PDF_TO_CSS_UNITS });
              self.canvas.width = viewport.width;
              self.canvas.height = viewport.height;
              self._clearCanvas();

              // Initialize various `eq` test subtypes, see comment below.
              var renderAnnotations = false,
                renderForms = false,
                renderPrint = false,
                renderXfa = false;

              var textLayerCanvas, annotationLayerCanvas;
              var initPromise;
              if (task.type === "text") {
                // Using a dummy canvas for PDF context drawing operations
                textLayerCanvas = self.textLayerCanvas;
                if (!textLayerCanvas) {
                  textLayerCanvas = document.createElement("canvas");
                  self.textLayerCanvas = textLayerCanvas;
                }
                textLayerCanvas.width = viewport.width;
                textLayerCanvas.height = viewport.height;
                var textLayerContext = textLayerCanvas.getContext("2d");
                textLayerContext.clearRect(
                  0,
                  0,
                  textLayerCanvas.width,
                  textLayerCanvas.height
                );
                var enhanceText = !!task.enhance;
                // The text builder will draw its content on the test canvas
                initPromise = page
                  .getTextContent({
                    normalizeWhitespace: true,
                    includeMarkedContent: true,
                  })
                  .then(function (textContent) {
                    return rasterizeTextLayer(
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
                  annotationLayerCanvas = self.annotationLayerCanvas;
                  if (!annotationLayerCanvas) {
                    annotationLayerCanvas = document.createElement("canvas");
                    self.annotationLayerCanvas = annotationLayerCanvas;
                  }
                  annotationLayerCanvas.width = viewport.width;
                  annotationLayerCanvas.height = viewport.height;
                  var annotationLayerContext =
                    annotationLayerCanvas.getContext("2d");
                  annotationLayerContext.clearRect(
                    0,
                    0,
                    annotationLayerCanvas.width,
                    annotationLayerCanvas.height
                  );

                  if (!renderXfa) {
                    // The annotation builder will draw its content
                    // on the canvas.
                    initPromise = page
                      .getAnnotations({ intent: "display" })
                      .then(function (annotations) {
                        return rasterizeAnnotationLayer(
                          annotationLayerContext,
                          viewport,
                          annotations,
                          page,
                          IMAGE_RESOURCES_PATH,
                          renderForms
                        );
                      });
                  } else {
                    initPromise = page.getXfa().then(function (xfa) {
                      return rasterizeXfaLayer(
                        annotationLayerContext,
                        viewport,
                        xfa,
                        task.fontRules
                      );
                    });
                  }
                } else {
                  annotationLayerCanvas = null;
                  initPromise = Promise.resolve();
                }
              }

              var renderContext = {
                canvasContext: ctx,
                viewport,
                renderInteractiveForms: renderForms,
                optionalContentConfigPromise: task.optionalContentConfigPromise,
              };
              if (renderPrint) {
                if (task.annotationStorage) {
                  const entries = Object.entries(task.annotationStorage),
                    docAnnotationStorage = task.pdfDoc.annotationStorage;
                  for (const [key, value] of entries) {
                    docAnnotationStorage.setValue(key, value);
                  }
                  renderContext.includeAnnotationStorage = true;
                }
                renderContext.intent = "print";
              }

              var completeRender = function (error) {
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
                self._snapshot(task, error);
              };
              initPromise
                .then(function () {
                  const renderTask = page.render(renderContext);

                  if (task.renderTaskOnContinue) {
                    renderTask.onContinue = function (cont) {
                      // Slightly delay the continued rendering.
                      setTimeout(cont, RENDER_TASK_ON_CONTINUE_DELAY);
                    };
                  }
                  return renderTask.promise.then(function () {
                    completeRender(false);
                  });
                })
                .catch(function (error) {
                  completeRender("render : " + error);
                });
            },
            function (error) {
              self._snapshot(task, "render : " + error);
            }
          );
        } catch (e) {
          failure = "page setup : " + this._exceptionToString(e);
          this._snapshot(task, failure);
        }
      }
    },

    _clearCanvas: function Driver_clearCanvas() {
      var ctx = this.canvas.getContext("2d", { alpha: false });
      ctx.beginPath();
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    _snapshot: function Driver_snapshot(task, failure) {
      var self = this;
      this._log("Snapshotting... ");

      var dataUrl = this.canvas.toDataURL("image/png");
      this._sendResult(dataUrl, task, failure, function () {
        self._log(
          "done" + (failure ? " (failed !: " + failure + ")" : "") + "\n"
        );
        task.pageNum++;
        self._nextPage(task);
      });
    },

    _quit: function Driver_quit() {
      this._log("Done !");
      this.end.textContent = "Tests finished. Close this window!";

      // Send the quit request
      var r = new XMLHttpRequest();
      r.open("POST", `/tellMeToQuit?browser=${escape(this.browser)}`, false);
      r.onreadystatechange = function (e) {
        if (r.readyState === 4) {
          window.close();
        }
      };
      r.send(null);
    },

    _info: function Driver_info(message) {
      this._send(
        "/info",
        JSON.stringify({
          browser: this.browser,
          message,
        })
      );
    },

    _log: function Driver_log(message) {
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
    },

    _done: function Driver_done() {
      if (this.inFlightRequests > 0) {
        this.inflight.textContent = this.inFlightRequests;
        setTimeout(this._done.bind(this), WAITING_TIME);
      } else {
        setTimeout(this._quit.bind(this), WAITING_TIME);
      }
    },

    _sendResult: function Driver_sendResult(snapshot, task, failure, callback) {
      var result = JSON.stringify({
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
    },

    _send: function Driver_send(url, message, callback) {
      var self = this;
      var r = new XMLHttpRequest();
      r.open("POST", url, true);
      r.setRequestHeader("Content-Type", "application/json");
      r.onreadystatechange = function (e) {
        if (r.readyState === 4) {
          self.inFlightRequests--;

          // Retry until successful
          if (r.status !== 200) {
            setTimeout(function () {
              self._send(url, message);
            });
          }
          if (callback) {
            callback();
          }
        }
      };
      this.inflight.textContent = this.inFlightRequests++;
      r.send(message);
    },
  };

  return Driver;
})();
