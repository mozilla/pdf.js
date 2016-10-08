/* Copyright 2016 Mozilla Foundation
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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/pdf_print_service', ['exports', 'pdfjs-web/ui_utils',
      'pdfjs-web/overlay_manager', 'pdfjs-web/app', 'pdfjs-web/pdfjs'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'), require('./overlay_manager.js'),
      require('./app.js'), require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebPDFPrintService = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebOverlayManager, root.pdfjsWebApp, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, overlayManager, app, pdfjsLib) {
  var CSS_UNITS = uiUtils.CSS_UNITS;
  var PDFPrintServiceFactory = app.PDFPrintServiceFactory;
  var OverlayManager = overlayManager.OverlayManager;

  var activeService = null;

  // Using one canvas for all paint operations -- painting one canvas at a time.
  var scratchCanvas = null;

  function renderPage(pdfDocument, pageNumber, size, wrapper) {
    if (!scratchCanvas) {
      scratchCanvas = document.createElement('canvas');
    }

    // The size of the canvas in pixels for printing.
    var PRINT_RESOLUTION = 150;
    var PRINT_UNITS = PRINT_RESOLUTION / 72.0;
    scratchCanvas.width = Math.floor(size.width * PRINT_UNITS);
    scratchCanvas.height = Math.floor(size.height * PRINT_UNITS);

    // The physical size of the img as specified by the PDF document.
    var img = document.createElement('img');
    img.style.width = Math.floor(size.width * CSS_UNITS) + 'px';
    img.style.height = Math.floor(size.height * CSS_UNITS) + 'px';

    var ctx = scratchCanvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    ctx.restore();

    return pdfDocument.getPage(pageNumber).then(function (pdfPage) {
      var renderContext = {
        canvasContext: ctx,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport: pdfPage.getViewport(1),
        intent: 'print'
      };
      return pdfPage.render(renderContext).promise;
    }).then(function() {
      if (!activeService) {
        return Promise.reject(new Error('cancelled'));
      }
      if (('toBlob' in scratchCanvas) &&
          !pdfjsLib.PDFJS.disableCreateObjectURL) {
        scratchCanvas.toBlob(function (blob) {
          img.src = URL.createObjectURL(blob);
        });
      } else {
        img.src = scratchCanvas.toDataURL();
      }
      wrapper.appendChild(img);
      return new Promise(function(resolve, reject) {
        img.onload = resolve;
        img.onerror = reject;
      });
    });
  }

  function PDFPrintService(pdfDocument, pagesOverview, printContainer) {
    this.pdfDocument = pdfDocument;
    this.pagesOverview = pagesOverview;
    this.printContainer = printContainer;
    this.wrappers = [];
    this.currentPage = -1;
  }

  PDFPrintService.prototype = {
    layout: function () {
      var pdfDocument = this.pdfDocument;
      var printContainer = this.printContainer;
      var body = document.querySelector('body');
      body.setAttribute('data-pdfjsprinting', true);

      var hasEqualPageSizes = this.pagesOverview.every(function (size) {
        return size.width === this.pagesOverview[0].width &&
               size.height === this.pagesOverview[0].height;
      }, this);
      if (!hasEqualPageSizes) {
        console.warn('Not all pages have the same size. The printed ' +
                     'result may be incorrect!');
      }

      // Insert a @page + size rule to make sure that the page size is correctly
      // set. Note that we assume that all pages have the same size, because
      // variable-size pages are not supported yet (e.g. in Chrome & Firefox).
      // TODO(robwu): Use named pages when size calculation bugs get resolved
      // (e.g. https://crbug.com/355116) AND when support for named pages is
      // added (http://www.w3.org/TR/css3-page/#using-named-pages).
      // In browsers where @page + size is not supported (such as Firefox,
      // https://bugzil.la/851441), the next stylesheet will be ignored and the
      // user has to select the correct paper size in the UI if wanted.
      this.pageStyleSheet = document.createElement('style');
      var pageSize = this.pagesOverview[0];
      this.pageStyleSheet.textContent =
        // "size:<width> <height>" is what we need. But also add "A4" because
        // Firefox incorrectly reports support for the other value.
        '@supports ((size:A4) and (size:1pt 1pt)) {' +
        '@page { size: ' + pageSize.width + 'pt ' + pageSize.height + 'pt;}' +
        '}';
      body.appendChild(this.pageStyleSheet);

      for (var i = 0, ii = this.pagesOverview.length; i < ii; ++i) {
        var wrapper = document.createElement('div');
        printContainer.appendChild(wrapper);
        this.wrappers[i] = wrapper;
      }
    },

    destroy: function () {
      this.printContainer.textContent = '';
      this.wrappers = null;
      if (this.pageStyleSheet && this.pageStyleSheet.parentNode) {
        this.pageStyleSheet.parentNode.removeChild(this.pageStyleSheet);
        this.pageStyleSheet = null;
      }
      if (activeService !== this) {
        return; // no need to clean up shared resources
      }
      activeService = null;
      if (scratchCanvas) {
        scratchCanvas.width = scratchCanvas.height = 0;
        scratchCanvas = null;
      }
      ensureOverlay().then(function () {
        if (OverlayManager.active !== 'printServiceOverlay') {
          return; // overlay was already closed
        }
        OverlayManager.close('printServiceOverlay');
      });
    },

    renderPages: function () {
      var pageCount = this.pagesOverview.length;
      var renderNextPage = function (resolve, reject) {
        if (activeService !== this) {
          reject(new Error('cancelled'));
          return;
        }
        if (++this.currentPage >= pageCount) {
          renderProgress(pageCount, pageCount);
          resolve();
          return;
        }
        var index = this.currentPage;
        renderProgress(index, pageCount);
        renderPage(this.pdfDocument, index + 1,
                   this.pagesOverview[index], this.wrappers[index]).then(
          function () { renderNextPage(resolve, reject); }, reject);
      }.bind(this);
      return new Promise(renderNextPage);
    },
  };


  var print = window.print;
  window.print = function print() {
    if (activeService) {
      console.warn('Ignored window.print() because of a pending print job.');
      return;
    }
    ensureOverlay().then(function () {
      OverlayManager.open('printServiceOverlay');
    });

    try {
      dispatchEvent('beforeprint');
    } finally {
      if (!activeService) {
        console.error('Expected print service to be initialized.');
      }
      activeService.renderPages().then(startPrint, abort);
    }
  };

  function dispatchEvent(eventType) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent(eventType, false, false, 'custom');
    window.dispatchEvent(event);
  }

  function startPrint() {
    // Push window.print in the macrotask queue to avoid being affected by
    // the deprecation of running print() code in a microtask, see
    // https://github.com/mozilla/pdf.js/issues/7547.
    setTimeout(function() {
      if (!activeService) {
        return; // Print task cancelled by user.
      }
      print.call(window);
      setTimeout(abort, 20); // Tidy-up
    }, 0);
  }

  function abort() {
    if (activeService) {
      activeService.destroy();
      dispatchEvent('afterprint');
    }
  }

  function renderProgress(index, total) {
    var progressContainer = document.getElementById('printServiceOverlay');
    var progress = Math.round(100 * index / total);
    var progressBar = progressContainer.querySelector('progress');
    var progressPerc = progressContainer.querySelector('.relative-progress');
    progressBar.value = progress;
    progressPerc.textContent = progress + '%';
  }

  var hasAttachEvent = !!document.attachEvent;

  window.addEventListener('keydown', function(event) {
    // Intercept Cmd/Ctrl + P in all browsers.
    // Also intercept Cmd/Ctrl + Shift + P in Chrome and Opera
    if (event.keyCode === 80/*P*/ && (event.ctrlKey || event.metaKey) &&
        !event.altKey && (!event.shiftKey || window.chrome || window.opera)) {
      window.print();
      if (hasAttachEvent) {
        // Only attachEvent can cancel Ctrl + P dialog in IE <=10
        // attachEvent is gone in IE11, so the dialog will re-appear in IE11.
        return;
      }
      event.preventDefault();
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      } else {
        event.stopPropagation();
      }
      return;
    }
  }, true);
  if (hasAttachEvent) {
    document.attachEvent('onkeydown', function(event) {
      event = event || window.event;
      if (event.keyCode === 80/*P*/ && event.ctrlKey) {
        event.keyCode = 0;
        return false;
      }
    });
  }

  if ('onbeforeprint' in window) {
    // Do not propagate before/afterprint events when they are not triggered
    // from within this polyfill. (FF/IE).
    var stopPropagationIfNeeded = function(event) {
      if (event.detail !== 'custom' && event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeprint', stopPropagationIfNeeded, false);
    window.addEventListener('afterprint', stopPropagationIfNeeded, false);
  }

  var overlayPromise;
  function ensureOverlay() {
    if (!overlayPromise) {
      overlayPromise = OverlayManager.register('printServiceOverlay',
        document.getElementById('printServiceOverlay'), abort, true);
      document.getElementById('printCancel').onclick = abort;
    }
    return overlayPromise;
  }

  PDFPrintServiceFactory.instance = {
    supportsPrinting: true,

    createPrintService: function (pdfDocument, pagesOverview, printContainer) {
      if (activeService) {
        throw new Error('The print service is created and active.');
      }
      activeService = new PDFPrintService(pdfDocument, pagesOverview,
                                          printContainer);
      return activeService;
    }
  };

  exports.PDFPrintService = PDFPrintService;
}));
