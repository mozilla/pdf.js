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

import { CSS_UNITS } from "./ui_utils.js";
import { PDFPrintServiceFactory } from "./app.js";
import { shadow } from "pdfjs-lib";

// Creates a placeholder with div and canvas with right size for the page.
function composePage(
  pdfDocument,
  pageNumber,
  size,
  printContainer,
  printResolution,
  optionalContentConfigPromise
) {
  const canvas = document.createElement("canvas");

  // The size of the canvas in pixels for printing.
  const PRINT_UNITS = printResolution / 72.0;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);

  // The physical size of the canvas as specified by the PDF document.
  canvas.style.width = Math.floor(size.width * CSS_UNITS) + "px";
  canvas.style.height = Math.floor(size.height * CSS_UNITS) + "px";

  const canvasWrapper = document.createElement("div");
  canvasWrapper.appendChild(canvas);
  printContainer.appendChild(canvasWrapper);

  // A callback for a given page may be executed multiple times for different
  // print operations (think of changing the print settings in the browser).
  //
  // Since we don't support queueing multiple render tasks for the same page
  // (and it'd be racy anyways if painting the page is not done in one go) we
  // keep track of the last scheduled task in order to properly cancel it before
  // starting the next one.
  let currentRenderTask = null;
  canvas.mozPrintCallback = function (obj) {
    // Printing/rendering the page.
    const ctx = obj.context;

    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    let thisRenderTask = null;
    pdfDocument
      .getPage(pageNumber)
      .then(function (pdfPage) {
        if (currentRenderTask) {
          currentRenderTask.cancel();
          currentRenderTask = null;
        }
        const renderContext = {
          canvasContext: ctx,
          transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
          viewport: pdfPage.getViewport({ scale: 1, rotation: size.rotation }),
          intent: "print",
          annotationStorage: pdfDocument.annotationStorage,
          optionalContentConfigPromise,
        };
        currentRenderTask = thisRenderTask = pdfPage.render(renderContext);
        return thisRenderTask.promise;
      })
      .then(
        function () {
          // Tell the printEngine that rendering this canvas/page has finished.
          if (currentRenderTask === thisRenderTask) {
            currentRenderTask = null;
          }
          obj.done();
        },
        function (error) {
          console.error(error);

          if (currentRenderTask === thisRenderTask) {
            currentRenderTask.cancel();
            currentRenderTask = null;
          }

          // Tell the printEngine that rendering this canvas/page has failed.
          // This will make the print process stop.
          if ("abort" in obj) {
            obj.abort();
          } else {
            obj.done();
          }
        }
      );
  };
}

function FirefoxPrintService(
  pdfDocument,
  pagesOverview,
  printContainer,
  printResolution,
  optionalContentConfigPromise = null
) {
  this.pdfDocument = pdfDocument;
  this.pagesOverview = pagesOverview;
  this.printContainer = printContainer;
  this._printResolution = printResolution || 150;
  this._optionalContentConfigPromise =
    optionalContentConfigPromise || pdfDocument.getOptionalContentConfig();
}

FirefoxPrintService.prototype = {
  layout() {
    const {
      pdfDocument,
      pagesOverview,
      printContainer,
      _printResolution,
      _optionalContentConfigPromise,
    } = this;

    const body = document.querySelector("body");
    body.setAttribute("data-pdfjsprinting", true);

    for (let i = 0, ii = pagesOverview.length; i < ii; ++i) {
      composePage(
        pdfDocument,
        /* pageNumber = */ i + 1,
        pagesOverview[i],
        printContainer,
        _printResolution,
        _optionalContentConfigPromise
      );
    }
  },

  destroy() {
    this.printContainer.textContent = "";

    const body = document.querySelector("body");
    body.removeAttribute("data-pdfjsprinting");
  },
};

PDFPrintServiceFactory.instance = {
  get supportsPrinting() {
    const canvas = document.createElement("canvas");
    const value = "mozPrintCallback" in canvas;

    return shadow(this, "supportsPrinting", value);
  },

  createPrintService(
    pdfDocument,
    pagesOverview,
    printContainer,
    printResolution,
    optionalContentConfigPromise
  ) {
    return new FirefoxPrintService(
      pdfDocument,
      pagesOverview,
      printContainer,
      printResolution,
      optionalContentConfigPromise
    );
  },
};

export { FirefoxPrintService };
