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

import {
  AnnotationMode,
  PixelsPerInch,
  RenderingCancelledException,
  shadow,
} from "pdfjs-lib";
import { getXfaHtmlForPrinting } from "./print_utils.js";

// Creates a placeholder with div and canvas with right size for the page.
function composePage(
  pdfDocument,
  pageNumber,
  size,
  printContainer,
  printResolution,
  optionalContentConfigPromise,
  printAnnotationStoragePromise
) {
  const canvas = document.createElement("canvas");

  // The size of the canvas in pixels for printing.
  const PRINT_UNITS = printResolution / PixelsPerInch.PDF;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "printedPage";
  canvasWrapper.append(canvas);
  printContainer.append(canvasWrapper);

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

    Promise.all([
      pdfDocument.getPage(pageNumber),
      printAnnotationStoragePromise,
    ])
      .then(function ([pdfPage, printAnnotationStorage]) {
        if (currentRenderTask) {
          currentRenderTask.cancel();
          currentRenderTask = null;
        }
        const renderContext = {
          canvasContext: ctx,
          transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
          viewport: pdfPage.getViewport({ scale: 1, rotation: size.rotation }),
          intent: "print",
          annotationMode: AnnotationMode.ENABLE_STORAGE,
          optionalContentConfigPromise,
          printAnnotationStorage,
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
        function (reason) {
          if (!(reason instanceof RenderingCancelledException)) {
            console.error(reason);
          }

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

class FirefoxPrintService {
  constructor({
    pdfDocument,
    pagesOverview,
    printContainer,
    printResolution,
    printAnnotationStoragePromise = null,
  }) {
    this.pdfDocument = pdfDocument;
    this.pagesOverview = pagesOverview;
    this.printContainer = printContainer;
    this._printResolution = printResolution || 150;
    this._optionalContentConfigPromise = pdfDocument.getOptionalContentConfig({
      intent: "print",
    });
    this._printAnnotationStoragePromise =
      printAnnotationStoragePromise || Promise.resolve();
  }

  layout() {
    const {
      pdfDocument,
      pagesOverview,
      printContainer,
      _printResolution,
      _optionalContentConfigPromise,
      _printAnnotationStoragePromise,
    } = this;

    const body = document.querySelector("body");
    body.setAttribute("data-pdfjsprinting", true);

    const { width, height } = this.pagesOverview[0];
    const hasEqualPageSizes = this.pagesOverview.every(
      size => size.width === width && size.height === height
    );
    if (!hasEqualPageSizes) {
      console.warn(
        "Not all pages have the same size. The printed result may be incorrect!"
      );
    }

    // Insert a @page + size rule to make sure that the page size is correctly
    // set. Note that we assume that all pages have the same size, because
    // variable-size pages are scaled down to the initial page size in Firefox.
    this.pageStyleSheet = document.createElement("style");
    this.pageStyleSheet.textContent = `@page { size: ${width}pt ${height}pt;}`;
    body.append(this.pageStyleSheet);

    if (pdfDocument.isPureXfa) {
      getXfaHtmlForPrinting(printContainer, pdfDocument);
      return;
    }

    for (let i = 0, ii = pagesOverview.length; i < ii; ++i) {
      composePage(
        pdfDocument,
        /* pageNumber = */ i + 1,
        pagesOverview[i],
        printContainer,
        _printResolution,
        _optionalContentConfigPromise,
        _printAnnotationStoragePromise
      );
    }
  }

  destroy() {
    this.printContainer.textContent = "";

    const body = document.querySelector("body");
    body.removeAttribute("data-pdfjsprinting");

    if (this.pageStyleSheet) {
      this.pageStyleSheet.remove();
      this.pageStyleSheet = null;
    }
  }
}

/**
 * @implements {IPDFPrintServiceFactory}
 */
class PDFPrintServiceFactory {
  static get supportsPrinting() {
    const canvas = document.createElement("canvas");
    return shadow(this, "supportsPrinting", "mozPrintCallback" in canvas);
  }

  static createPrintService(params) {
    return new FirefoxPrintService(params);
  }
}

export { PDFPrintServiceFactory };
