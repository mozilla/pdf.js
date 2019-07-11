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

import { AppOptions } from './app_options';
import { CSS_UNITS } from './ui_utils';
import { PDFPrintServiceFactory } from './app';
import { shadow } from 'pdfjs-lib';

// Creates a placeholder with div and canvas with right size for the page.
function composePage(pdfDocument, pageNumber, size, printContainer) {
  let canvas = document.createElement('canvas');

  // The size of the canvas in pixels for printing.
  const PRINT_RESOLUTION = AppOptions.get('printResolution') || 150;
  const PRINT_UNITS = PRINT_RESOLUTION / 72.0;
  canvas.width = Math.floor(size.width * PRINT_UNITS);
  canvas.height = Math.floor(size.height * PRINT_UNITS);

  // The physical size of the canvas as specified by the PDF document.
  canvas.style.width = Math.floor(size.width * CSS_UNITS) + 'px';
  canvas.style.height = Math.floor(size.height * CSS_UNITS) + 'px';

  let canvasWrapper = document.createElement('div');
  canvasWrapper.appendChild(canvas);
  printContainer.appendChild(canvasWrapper);

  canvas.mozPrintCallback = function(obj) {
    // Printing/rendering the page.
    let ctx = obj.context;

    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    pdfDocument.getPage(pageNumber).then(function(pdfPage) {
      let renderContext = {
        canvasContext: ctx,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport: pdfPage.getViewport({ scale: 1, rotation: size.rotation, }),
        intent: 'print',
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
}

FirefoxPrintService.prototype = {
  layout() {
    const { pdfDocument, pagesOverview, printContainer, } = this;

    const body = document.querySelector('body');
    body.setAttribute('data-pdfjsprinting', true);

    for (let i = 0, ii = pagesOverview.length; i < ii; ++i) {
      composePage(pdfDocument, i + 1, pagesOverview[i], printContainer);
    }
  },

  destroy() {
    this.printContainer.textContent = '';

    const body = document.querySelector('body');
    body.removeAttribute('data-pdfjsprinting');
  },
};

PDFPrintServiceFactory.instance = {
  get supportsPrinting() {
    let canvas = document.createElement('canvas');
    let value = 'mozPrintCallback' in canvas;

    return shadow(this, 'supportsPrinting', value);
  },

  createPrintService(pdfDocument, pagesOverview, printContainer) {
    return new FirefoxPrintService(pdfDocument, pagesOverview, printContainer);
  },
};

export {
  FirefoxPrintService,
};
