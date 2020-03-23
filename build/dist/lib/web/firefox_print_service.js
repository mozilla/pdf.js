/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FirefoxPrintService = FirefoxPrintService;

var _app_options = require("./app_options.js");

var _ui_utils = require("./ui_utils.js");

var _app = require("./app.js");

var _pdf = require("../pdf");

function composePage(pdfDocument, pageNumber, size, printContainer) {
  const canvas = document.createElement("canvas");
  const PRINT_RESOLUTION = _app_options.AppOptions.get("printResolution") || 150;
  const PRINT_UNITS = PRINT_RESOLUTION / 72.0;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);
  canvas.style.width = Math.floor(size.width * _ui_utils.CSS_UNITS) + "px";
  canvas.style.height = Math.floor(size.height * _ui_utils.CSS_UNITS) + "px";
  const canvasWrapper = document.createElement("div");
  canvasWrapper.appendChild(canvas);
  printContainer.appendChild(canvasWrapper);

  canvas.mozPrintCallback = function (obj) {
    const ctx = obj.context;
    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    pdfDocument.getPage(pageNumber).then(function (pdfPage) {
      const renderContext = {
        canvasContext: ctx,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport: pdfPage.getViewport({
          scale: 1,
          rotation: size.rotation
        }),
        intent: "print"
      };
      return pdfPage.render(renderContext).promise;
    }).then(function () {
      obj.done();
    }, function (error) {
      console.error(error);

      if ("abort" in obj) {
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
    const {
      pdfDocument,
      pagesOverview,
      printContainer
    } = this;
    const body = document.querySelector("body");
    body.setAttribute("data-pdfjsprinting", true);

    for (let i = 0, ii = pagesOverview.length; i < ii; ++i) {
      composePage(pdfDocument, i + 1, pagesOverview[i], printContainer);
    }
  },

  destroy() {
    this.printContainer.textContent = "";
    const body = document.querySelector("body");
    body.removeAttribute("data-pdfjsprinting");
  }

};
_app.PDFPrintServiceFactory.instance = {
  get supportsPrinting() {
    const canvas = document.createElement("canvas");
    const value = ("mozPrintCallback" in canvas);
    return (0, _pdf.shadow)(this, "supportsPrinting", value);
  },

  createPrintService(pdfDocument, pagesOverview, printContainer) {
    return new FirefoxPrintService(pdfDocument, pagesOverview, printContainer);
  }

};