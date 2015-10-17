/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals PDFJS, combineUrl, StatTimer, Promise */

'use strict';

var WAITING_TIME = 100; // ms
var PDF_TO_CSS_UNITS = 96.0 / 72.0;

/**
 * @class
 */
var NullTextLayerBuilder = (function NullTextLayerBuilderClosure() {
  /**
   * @constructs NullTextLayerBuilder
   */
  function NullTextLayerBuilder() {}

  NullTextLayerBuilder.prototype = {
    beginLayout: function NullTextLayerBuilder_BeginLayout() {},
    endLayout: function NullTextLayerBuilder_EndLayout() {},
    appendText: function NullTextLayerBuilder_AppendText() {}
  };

  return NullTextLayerBuilder;
})();

/**
 * @class
 */
var SimpleTextLayerBuilder = (function SimpleTextLayerBuilderClosure() {
  /**
   * @constructs SimpleTextLayerBuilder
   */
  function SimpleTextLayerBuilder(ctx, viewport) {
    this.ctx = ctx;
    this.viewport = viewport;
    this.textCounter = 0;
  }

  SimpleTextLayerBuilder.prototype = {
    appendText: function SimpleTextLayerBuilder_AppendText(geom, styles) {
      var style = styles[geom.fontName];
      var ctx = this.ctx, viewport = this.viewport;
      var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
      var angle = Math.atan2(tx[1], tx[0]);
      var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
      var fontAscent = (style.ascent ? style.ascent * fontHeight :
        (style.descent ? (1 + style.descent) * fontHeight : fontHeight));

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'red';
      ctx.fillStyle = 'yellow';
      ctx.translate(tx[4] + (fontAscent * Math.sin(angle)),
                    tx[5] - (fontAscent * Math.cos(angle)));
      ctx.rotate(angle);
      ctx.rect(0, 0, geom.width * viewport.scale, geom.height * viewport.scale);
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      ctx.font = fontHeight + 'px ' + style.fontFamily;
      ctx.fillStyle = 'black';
      ctx.fillText(geom.str, tx[4], tx[5]);

      this.textCounter++;
    },

    setTextContent:
        function SimpleTextLayerBuilder_SetTextContent(textContent) {
      this.ctx.save();
      var textItems = textContent.items;
      for (var i = 0, ii = textItems.length; i < ii; i++) {
        this.appendText(textItems[i], textContent.styles);
      }
      this.ctx.restore();
    }
  };

  return SimpleTextLayerBuilder;
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

      var absoluteUrl = combineUrl(window.location.href, task.file);

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
        this._clearCanvas();

        this._snapshot(task, '');
        return;
      }

      if (!failure) {
        try {
          this._log(' Loading page ' + task.pageNum + '/' +
            task.pdfDoc.numPages + '... ');
          var ctx = this.canvas.getContext('2d');
          task.pdfDoc.getPage(task.pageNum).then(function(page) {
            var viewport = page.getViewport(PDF_TO_CSS_UNITS);
            self.canvas.width = viewport.width;
            self.canvas.height = viewport.height;
            self._clearCanvas();

            var drawContext, textLayerBuilder;
            var resolveInitPromise;
            var initPromise = new Promise(function (resolve) {
              resolveInitPromise = resolve;
            });
            if (task.type === 'text') {
              // Using a dummy canvas for PDF context drawing operations
              if (!self.dummyCanvas) {
                self.dummyCanvas = document.createElement('canvas');
              }
              drawContext = self.dummyCanvas.getContext('2d');
              // The text builder will draw its content on the test canvas
              textLayerBuilder = new SimpleTextLayerBuilder(ctx, viewport);

              page.getTextContent().then(function(textContent) {
                textLayerBuilder.setTextContent(textContent);
                resolveInitPromise();
              });
            } else {
              drawContext = ctx;
              textLayerBuilder = new NullTextLayerBuilder();
              resolveInitPromise();
            }
            var renderContext = {
              canvasContext: drawContext,
              viewport: viewport
            };
            var completeRender = (function(error) {
              page.destroy();
              task.stats = page.stats;
              page.stats = new StatTimer();
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
      var ctx = this.canvas.getContext('2d');
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
