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
/* globals PDFJS, pdfjsSharedUtil */

'use strict';

var WAITING_TIME = 100; // ms
var PDF_TO_CSS_UNITS = 96.0 / 72.0;

/**
 * @class
 */
var LinkServiceMock = (function LinkServiceMockClosure() {
  function LinkServiceMock() {}

  LinkServiceMock.prototype = {
    navigateTo: function (dest) {},

    getDestinationHash: function (dest) {
      return '#';
    },

    getAnchorUrl: function (hash) {
      return '#';
    },

    executeNamedAction: function (action) {}
  };

  return LinkServiceMock;
})();

/**
 * @class
 */
var rasterizeTextLayer = (function rasterizeTextLayerClosure() {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var textLayerStylePromise = null;
  function getTextLayerStyle() {
    if (textLayerStylePromise) {
      return textLayerStylePromise;
    }
    textLayerStylePromise = new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', './text_layer_test.css');
      xhr.onload = function () {
        resolve(xhr.responseText);
      };
      xhr.send(null);
    });
    return textLayerStylePromise;
  }

  function rasterizeTextLayer(ctx, viewport, textContent) {
    return new Promise(function (resolve) {
      // Building SVG with size of the viewport.
      var svg = document.createElementNS(SVG_NS, 'svg:svg');
      svg.setAttribute('width', viewport.width + 'px');
      svg.setAttribute('height', viewport.height + 'px');
      // items are transformed to have 1px font size
      svg.setAttribute('font-size', 1);

      // Adding element to host our HTML (style + text layer div).
      var foreignObject = document.createElementNS(SVG_NS, 'svg:foreignObject');
      foreignObject.setAttribute('x', '0');
      foreignObject.setAttribute('y', '0');
      foreignObject.setAttribute('width', viewport.width + 'px');
      foreignObject.setAttribute('height', viewport.height + 'px');
      var style = document.createElement('style');
      var stylePromise = getTextLayerStyle();
      foreignObject.appendChild(style);
      var div = document.createElement('div');
      div.className = 'textLayer';
      foreignObject.appendChild(div);

      // Rendering text layer as HTML.
      var task = PDFJS.renderTextLayer({
        textContent: textContent,
        container: div,
        viewport: viewport
      });
      Promise.all([stylePromise, task.promise]).then(function (results) {
        style.textContent = results[0];
        svg.appendChild(foreignObject);

        // We need to have UTF-8 encoded XML.
        var svg_xml = unescape(encodeURIComponent(
          (new XMLSerializer()).serializeToString(svg)));
        var img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(svg_xml);
        img.onload = function () {
          ctx.drawImage(img, 0, 0);
          resolve();
        };
      });
    });
  }

  return rasterizeTextLayer;
})();

/**
 * @class
 */
var rasterizeAnnotationLayer = (function rasterizeAnnotationLayerClosure() {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var annotationLayerStylePromise = null;
  function getAnnotationLayerStyle() {
    if (annotationLayerStylePromise) {
      return annotationLayerStylePromise;
    }
    annotationLayerStylePromise = new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', './annotation_layer_test.css');
      xhr.onload = function () {
        resolve(xhr.responseText);
      };
      xhr.send(null);
    });
    return annotationLayerStylePromise;
  }

  function inlineAnnotationImages(images) {
    var imagePromises = [];
    for (var i = 0, ii = images.length; i < ii; i++) {
      var imagePromise = new Promise(function(resolve) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        xhr.onload = function() {
          var reader = new FileReader();
          reader.onloadend = function() {
            resolve(reader.result);
          };
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = function() {
          resolve('');
        };
        xhr.open('GET', images[i].src);
        xhr.send();
      });
      imagePromises.push(imagePromise);
    }
    return imagePromises;
  }

  function rasterizeAnnotationLayer(ctx, viewport, annotations, page) {
    return new Promise(function (resolve) {
      // Building SVG with size of the viewport.
      var svg = document.createElementNS(SVG_NS, 'svg:svg');
      svg.setAttribute('width', viewport.width + 'px');
      svg.setAttribute('height', viewport.height + 'px');

      // Adding element to host our HTML (style + annotation layer div).
      var foreignObject = document.createElementNS(SVG_NS, 'svg:foreignObject');
      foreignObject.setAttribute('x', '0');
      foreignObject.setAttribute('y', '0');
      foreignObject.setAttribute('width', viewport.width + 'px');
      foreignObject.setAttribute('height', viewport.height + 'px');
      var style = document.createElement('style');
      var stylePromise = getAnnotationLayerStyle();
      foreignObject.appendChild(style);
      var div = document.createElement('div');
      div.className = 'annotationLayer';

      // Rendering annotation layer as HTML.
      stylePromise.then(function (styles) {
        style.textContent = styles;

        var annotation_viewport = viewport.clone({ dontFlip: true });
        var parameters = {
          viewport: annotation_viewport,
          div: div,
          annotations: annotations,
          page: page,
          linkService: new LinkServiceMock()
        };
        PDFJS.AnnotationLayer.render(parameters);

        // Inline SVG images from text annotations.
        var images = div.getElementsByTagName('img');
        var imagePromises = inlineAnnotationImages(images);
        var converted = Promise.all(imagePromises).then(function(data) {
          for (var i = 0, ii = data.length; i < ii; i++) {
            images[i].src = data[i];
          }
        });

        foreignObject.appendChild(div);
        svg.appendChild(foreignObject);

        // We need to have UTF-8 encoded XML.
        converted.then(function() {
          var svg_xml = unescape(encodeURIComponent(
            (new XMLSerializer()).serializeToString(svg)));
          var img = new Image();
          img.src = 'data:image/svg+xml;base64,' + btoa(svg_xml);
          img.onload = function () {
            ctx.drawImage(img, 0, 0);
            resolve();
          };
        });
      });
    });
  }

  return rasterizeAnnotationLayer;
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
var Driver = (function DriverClosure() {
  /**
   * @constructs Driver
   * @param {DriverOptions} options
   */
  function Driver(options) {
    // Configure the global PDFJS object
    PDFJS.workerSrc = '../src/worker_loader.js';
    PDFJS.cMapPacked = true;
    PDFJS.cMapUrl = '../external/bcmaps/';
    PDFJS.enableStats = true;
    PDFJS.imageResourcesPath = '/web/images/';

    // Set the passed options
    this.inflight = options.inflight;
    this.disableScrolling = options.disableScrolling;
    this.output = options.output;
    this.end = options.end;

    // Set parameters from the query string
    var parameters = this._getQueryStringParameters();
    this.browser = parameters.browser;
    this.manifestFile = parameters.manifestFile;
    this.appPath = parameters.path;
    this.delay = (parameters.delay | 0) || 0;
    this.inFlightRequests = 0;
    this.testFilter = parameters.testFilter ?
      JSON.parse(parameters.testFilter) : [];

    // Create a working canvas
    this.canvas = document.createElement('canvas');
  }

  Driver.prototype = {
    _getQueryStringParameters: function Driver_getQueryStringParameters() {
      var queryString = window.location.search.substring(1);
      var values = queryString.split('&');
      var parameters = {};
      for (var i = 0, ii = values.length; i < ii; i++) {
        var value = values[i].split('=');
        parameters[unescape(value[0])] = unescape(value[1]);
      }
      return parameters;
    },

    run: function Driver_run() {
      var self = this;

      this._info('User agent: ' + navigator.userAgent);
      this._log('Harness thinks this browser is "' + this.browser +
        '" with path "' + this.appPath + '"\n');
      this._log('Fetching manifest "' + this.manifestFile + '"... ');

      var r = new XMLHttpRequest();
      r.open('GET', this.manifestFile, false);
      r.onreadystatechange = function() {
        if (r.readyState === 4) {
          self._log('done\n');
          self.manifest = JSON.parse(r.responseText);
          if (self.testFilter && self.testFilter.length) {
            self.manifest = self.manifest.filter(function(item) {
              return self.testFilter.indexOf(item.id) !== -1;
            });
          }
          self.currentTask = 0;
          self._nextTask();
        }
      };
      if (this.delay > 0) {
        this._log('\nDelaying for ' + this.delay + ' ms...\n');
      }
      // When gathering the stats the numbers seem to be more reliable
      // if the browser is given more time to start.
      setTimeout(function() {
        r.send(null);
      }, this.delay);
    },

    _nextTask: function Driver_nextTask() {
      var self = this;
      var failure = '';

      this._cleanup();

      if (this.currentTask === this.manifest.length) {
        this._done();
        return;
      }
      var task = this.manifest[this.currentTask];
      task.round = 0;
      task.pageNum = task.firstPage || 1;
      task.stats = { times: [] };

      this._log('Loading file "' + task.file + '"\n');

      var absoluteUrl = pdfjsSharedUtil.combineUrl(window.location.href,
                                                   task.file);

      PDFJS.disableRange = task.disableRange;
      PDFJS.disableAutoFetch = !task.enableAutoFetch;
      try {
        PDFJS.getDocument({
          url: absoluteUrl,
          password: task.password
        }).then(function(doc) {
          task.pdfDoc = doc;
          self._nextPage(task, failure);
        }, function(e) {
          failure = 'Loading PDF document: ' + e;
          self._nextPage(task, failure);
        });
        return;
      } catch (e) {
        failure = 'Loading PDF document: ' + this._exceptionToString(e);
      }
      this._nextPage(task, failure);
    },

    _cleanup: function Driver_cleanup() {
      // Clear out all the stylesheets since a new one is created for each font.
      while (document.styleSheets.length > 0) {
        var styleSheet = document.styleSheets[0];
        while (styleSheet.cssRules.length > 0) {
          styleSheet.deleteRule(0);
        }
        var ownerNode = styleSheet.ownerNode;
        ownerNode.parentNode.removeChild(ownerNode);
      }
      var body = document.body;
      while (body.lastChild !== this.end) {
        body.removeChild(body.lastChild);
      }

      // Wipe out the link to the pdfdoc so it can be GC'ed.
      for (var i = 0; i < this.manifest.length; i++) {
        if (this.manifest[i].pdfDoc) {
          this.manifest[i].pdfDoc.destroy();
          delete this.manifest[i].pdfDoc;
        }
      }
    },

    _exceptionToString: function Driver_exceptionToString(e) {
      if (typeof e !== 'object') {
        return String(e);
      }
      if (!('message' in e)) {
        return JSON.stringify(e);
      }
      return e.message + ('stack' in e ? ' at ' + e.stack.split('\n')[0] : '');
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
      var failure = loadError || '';
      var ctx;

      if (!task.pdfDoc) {
        var dataUrl = this.canvas.toDataURL('image/png');
        this._sendResult(dataUrl, task, failure, function () {
          self._log('done' + (failure ? ' (failed !: ' + failure + ')' : '') +
            '\n');
          self.currentTask++;
          self._nextTask();
        });
        return;
      }

      if (task.pageNum > this._getLastPageNumber(task)) {
        if (++task.round < task.rounds) {
          this._log(' Round ' + (1 + task.round) + '\n');
          task.pageNum = task.firstPage || 1;
        } else {
          this.currentTask++;
          this._nextTask();
          return;
        }
      }

      if (task.skipPages && task.skipPages.indexOf(task.pageNum) >= 0) {
        this._log(' Skipping page ' + task.pageNum + '/' +
          task.pdfDoc.numPages + '... ');

        // Empty the canvas
        this.canvas.width = 1;
        this.canvas.height = 1;
        ctx = this.canvas.getContext('2d', {alpha: false});
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 1, 1);
        ctx.restore();

        this._snapshot(task, '');
        return;
      }

      if (!failure) {
        try {
          this._log(' Loading page ' + task.pageNum + '/' +
            task.pdfDoc.numPages + '... ');
          this.canvas.mozOpaque = true;
          ctx = this.canvas.getContext('2d', {alpha: false});
          task.pdfDoc.getPage(task.pageNum).then(function(page) {
            var viewport = page.getViewport(PDF_TO_CSS_UNITS);
            self.canvas.width = viewport.width;
            self.canvas.height = viewport.height;
            self._clearCanvas();

            var textLayerCanvas, annotationLayerCanvas;
            var initPromise;
            if (task.type === 'text') {
              // Using a dummy canvas for PDF context drawing operations
              textLayerCanvas = self.textLayerCanvas;
              if (!textLayerCanvas) {
                textLayerCanvas = document.createElement('canvas');
                self.textLayerCanvas = textLayerCanvas;
              }
              textLayerCanvas.width = viewport.width;
              textLayerCanvas.height = viewport.height;
              var textLayerContext = textLayerCanvas.getContext('2d');
              textLayerContext.clearRect(0, 0,
                textLayerCanvas.width, textLayerCanvas.height);
              // The text builder will draw its content on the test canvas
              initPromise =
                page.getTextContent({ normalizeWhitespace: true }).then(
                  function(textContent) {
                    return rasterizeTextLayer(textLayerContext, viewport,
                                              textContent);
                });
            } else {
              textLayerCanvas = null;

              // Render the annotation layer if necessary.
              if (task.annotations) {
                // Create a dummy canvas for the drawing operations.
                annotationLayerCanvas = self.annotationLayerCanvas;
                if (!annotationLayerCanvas) {
                  annotationLayerCanvas = document.createElement('canvas');
                  self.annotationLayerCanvas = annotationLayerCanvas;
                }
                annotationLayerCanvas.width = viewport.width;
                annotationLayerCanvas.height = viewport.height;
                var annotationLayerContext =
                  annotationLayerCanvas.getContext('2d');
                annotationLayerContext.clearRect(0, 0,
                  annotationLayerCanvas.width, annotationLayerCanvas.height);

                // The annotation builder will draw its content on the canvas.
                initPromise =
                  page.getAnnotations({ intent: 'display' }).then(
                    function(annotations) {
                      return rasterizeAnnotationLayer(annotationLayerContext,
                                                      viewport, annotations,
                                                      page);
                  });
              } else {
                annotationLayerCanvas = null;
                initPromise = Promise.resolve();
              }
            }

            var renderContext = {
              canvasContext: ctx,
              viewport: viewport
            };
            var completeRender = (function(error) {
              // if text layer is present, compose it on top of the page
              if (textLayerCanvas) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = 'rgb(128, 255, 128)'; // making it green
                ctx.fillRect(0, 0, viewport.width, viewport.height);
                ctx.restore();
                ctx.drawImage(textLayerCanvas, 0, 0);
              }
              // If we have annotation layer, compose it on top of the page.
              if (annotationLayerCanvas) {
                ctx.drawImage(annotationLayerCanvas, 0, 0);
              }
              page.cleanup();
              task.stats = page.stats;
              page.stats = new pdfjsSharedUtil.StatTimer();
              self._snapshot(task, error);
            });
            initPromise.then(function () {
              page.render(renderContext).promise.then(function() {
                completeRender(false);
              },
              function(error) {
                completeRender('render : ' + error);
              });
            });
          },
          function(error) {
            self._snapshot(task, 'render : ' + error);
          });
        } catch (e) {
          failure = 'page setup : ' + this._exceptionToString(e);
          this._snapshot(task, failure);
        }
      }
    },

    _clearCanvas: function Driver_clearCanvas() {
      var ctx = this.canvas.getContext('2d', {alpha: false});
      ctx.beginPath();
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    _snapshot: function Driver_snapshot(task, failure) {
      var self = this;
      this._log('Snapshotting... ');

      var dataUrl = this.canvas.toDataURL('image/png');
      this._sendResult(dataUrl, task, failure, function () {
        self._log('done' + (failure ? ' (failed !: ' + failure + ')' : '') +
          '\n');
        task.pageNum++;
        self._nextPage(task);
      });
    },

    _quit: function Driver_quit() {
      this._log('Done !');
      this.end.textContent = 'Tests finished. Close this window!';

      // Send the quit request
      var r = new XMLHttpRequest();
      r.open('POST', '/tellMeToQuit?path=' + escape(this.appPath), false);
      r.onreadystatechange = function(e) {
        if (r.readyState === 4) {
          window.close();
        }
      };
      r.send(null);
    },

    _info: function Driver_info(message) {
      this._send('/info', JSON.stringify({
        browser: this.browser,
        message: message
      }));
    },

    _log: function Driver_log(message) {
      // Using insertAdjacentHTML yields a large performance gain and
      // reduces runtime significantly.
      if (this.output.insertAdjacentHTML) {
        this.output.insertAdjacentHTML('BeforeEnd', message);
      } else {
        this.output.textContent += message;
      }

      if (message.lastIndexOf('\n') >= 0 && !this.disableScrolling.checked) {
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

    _sendResult: function Driver_sendResult(snapshot, task, failure,
        callback) {
      var result = JSON.stringify({
        browser: this.browser,
        id: task.id,
        numPages: task.pdfDoc ?
                  (task.lastPage || task.pdfDoc.numPages) : 0,
        lastPageNum: this._getLastPageNumber(task),
        failure: failure,
        file: task.file,
        round: task.round,
        page: task.pageNum,
        snapshot: snapshot,
        stats: task.stats.times
      });
      this._send('/submit_task_results', result, callback);
    },

    _send: function Driver_send(url, message, callback) {
      var self = this;
      var r = new XMLHttpRequest();
      r.open('POST', url, true);
      r.setRequestHeader('Content-Type', 'application/json');
      r.onreadystatechange = function(e) {
        if (r.readyState === 4) {
          self.inFlightRequests--;

          // Retry until successful
          if (r.status !== 200) {
            setTimeout(function() {
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
    }
  };

  return Driver;
})();
