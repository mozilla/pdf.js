/* Copyright 2017 Mozilla Foundation
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

const Canvas = require("canvas");
const assert = require("assert").strict;
const fs = require("fs");

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, "Invalid canvas size");
    const canvas = Canvas.createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas,
      context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, "Canvas is not specified");
    assert(width > 0 && height > 0, "Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, "Canvas is not specified");

    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Some PDFs need external cmaps.
const CMAP_URL = "../../../node_modules/pdfjs-dist/cmaps/";
const CMAP_PACKED = true;

// Loading file from file system into typed array.
const pdfPath =
  process.argv[2] || "../../../web/compressed.tracemonkey-pldi-09.pdf";
const data = new Uint8Array(fs.readFileSync(pdfPath));

// Load the PDF file.
const loadingTask = pdfjsLib.getDocument({
  data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
});
loadingTask.promise
  .then(function (pdfDocument) {
    console.log("# PDF document loaded.");

    // Get the first page.
    pdfDocument.getPage(1).then(function (page) {
      // Render the page on a Node canvas with 100% scale.
      const viewport = page.getViewport({ scale: 1.0 });
      const canvasFactory = new NodeCanvasFactory();
      const canvasAndContext = canvasFactory.create(
        viewport.width,
        viewport.height
      );
      const renderContext = {
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory,
      };

      const renderTask = page.render(renderContext);
      renderTask.promise.then(function () {
        // Convert the canvas to an image buffer.
        const image = canvasAndContext.canvas.toBuffer();
        fs.writeFile("output.png", image, function (error) {
          if (error) {
            console.error("Error: " + error);
          } else {
            console.log(
              "Finished converting first page of PDF file to a PNG image."
            );
          }
        });
      });
    });
  })
  .catch(function (reason) {
    console.log(reason);
  });
