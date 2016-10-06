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
    define('pdfjs-web/firefox_print_service', ['exports', 'pdfjs-web/ui_utils',
      'pdfjs-web/app', 'pdfjs-web/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'), require('./app.js'),
      require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebFirefoxPrintService = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebApp, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, app, pdfjsLib) {
  var CSS_UNITS = uiUtils.CSS_UNITS;
  var PDFPrintServiceFactory = app.PDFPrintServiceFactory;

  // Creates a placeholder with div and canvas with right size for the page.
  function composePage(pdfDocument, pageNumber, size, printContainer) {
    var canvas = document.createElement('canvas');

    // The size of the canvas in pixels for printing.
    var PRINT_RESOLUTION = 150;
    var PRINT_UNITS = PRINT_RESOLUTION / 72.0;
    canvas.width = Math.floor(size.width * PRINT_UNITS);
    canvas.height = Math.floor(size.height * PRINT_UNITS);

    // The physical size of the canvas as specified by the PDF document.
    canvas.style.width = Math.floor(size.width * CSS_UNITS) + 'px';
    canvas.style.height = Math.floor(size.height * CSS_UNITS) + 'px';

    var canvasWrapper = document.createElement('div');
    canvasWrapper.appendChild(canvas);
    printContainer.appendChild(canvasWrapper);

    canvas.mozPrintCallback = function(obj) {
      // Printing/rendering the page.
      var ctx = obj.context;

      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      pdfDocument.getPage(pageNumber).then(function (pdfPage) {
        var renderContext = {
          canvasContext: ctx,
          transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
          viewport: pdfPage.getViewport(1),
          intent: 'print'
        };
        return pdfPage.render(renderContext).promise;
      }).then(function() {
        // Tell the printEngine that rendering this canvas/page has finished.
        obj.done();
      }, function(error) {
        console.error(error);
        // Tell the printEngine that rendering this canvas/page has failed.
        // This will make the print process stop.
        if ('abort' in obj) {
          obj.abort();
        } else {
          obj.done();
        }
      });
    };
  }

  function FirefoxPrintService(pdfDocument, pagesOverview, printContainer) {
    this.pdfDocument = pdfDocument;
    this.pagesOverview = pagesOverview;
    this.printContainer = printContainer;
    this.pageStyleSheet = null;
  }

  FirefoxPrintService.prototype = {
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
        composePage(pdfDocument, i + 1, this.pagesOverview[i], printContainer);
      }
    },

    destroy: function () {
      this.printContainer.textContent = '';
      if (this.pageStyleSheet && this.pageStyleSheet.parentNode) {
        this.pageStyleSheet.parentNode.removeChild(this.pageStyleSheet);
        this.pageStyleSheet = null;
      }
    }
  };

  PDFPrintServiceFactory.instance = {
    get supportsPrinting() {
      var canvas = document.createElement('canvas');
      var value = 'mozPrintCallback' in canvas;

      return pdfjsLib.shadow(this, 'supportsPrinting', value);
    },

    createPrintService: function (pdfDocument, pagesOverview, printContainer) {
      return new FirefoxPrintService(pdfDocument, pagesOverview,
                                     printContainer);
    }
  };

  exports.FirefoxPrintService = FirefoxPrintService;
}));
