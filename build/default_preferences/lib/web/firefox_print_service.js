"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FirefoxPrintService = FirefoxPrintService;

var _ui_utils = require("./ui_utils");

var _app = require("./app");

var _pdf = require("../pdf");

function composePage(pdfDocument, pageNumber, size, printContainer) {
  let canvas = document.createElement('canvas');
  const PRINT_RESOLUTION = 150;
  const PRINT_UNITS = PRINT_RESOLUTION / 72.0;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);
  canvas.style.width = Math.floor(size.width * _ui_utils.CSS_UNITS) + 'px';
  canvas.style.height = Math.floor(size.height * _ui_utils.CSS_UNITS) + 'px';
  let canvasWrapper = document.createElement('div');
  canvasWrapper.appendChild(canvas);
  printContainer.appendChild(canvasWrapper);

  canvas.mozPrintCallback = function (obj) {
    let ctx = obj.context;
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    pdfDocument.getPage(pageNumber).then(function (pdfPage) {
      let renderContext = {
        canvasContext: ctx,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport: pdfPage.getViewport({
          scale: 1,
          rotation: size.rotation
        }),
        intent: 'print'
      };
      return pdfPage.render(renderContext).promise;
    }).then(function () {
      obj.done();
    }, function (error) {
      console.error(error);

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
}

FirefoxPrintService.prototype = {
  layout() {
    let pdfDocument = this.pdfDocument;
    let printContainer = this.printContainer;
    let body = document.querySelector('body');
    body.setAttribute('data-pdfjsprinting', true);

    for (let i = 0, ii = this.pagesOverview.length; i < ii; ++i) {
      composePage(pdfDocument, i + 1, this.pagesOverview[i], printContainer);
    }
  },

  destroy() {
    this.printContainer.textContent = '';
  }

};
_app.PDFPrintServiceFactory.instance = {
  get supportsPrinting() {
    let canvas = document.createElement('canvas');
    let value = 'mozPrintCallback' in canvas;
    return (0, _pdf.shadow)(this, 'supportsPrinting', value);
  },

  createPrintService(pdfDocument, pagesOverview, printContainer) {
    return new FirefoxPrintService(pdfDocument, pagesOverview, printContainer);
  }

};