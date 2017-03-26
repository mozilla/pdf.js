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

// Example to convert a PDF file to a PNG image.

var fs = require('fs');
var assert = require('assert');
var Canvas = require('canvas');

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, 'invalid canvas size');
    var canvas = new Canvas(width, height);
    var context = canvas.getContext('2d');
    return {
      canvas: canvas,
      context: context,
    };
  },
	
  reset: function NodeCanvasFactory_reset(canvasAndContextPair, width, height) {
    assert(canvasAndContextPair.canvas, 'canvas is not specified');
    assert(width > 0 && height > 0, 'invalid canvas size');
    canvasAndContextPair.canvas.width = width;
    canvasAndContextPair.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContextPair) {
    assert(canvasAndContextPair.canvas, 'canvas is not specified');
    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContextPair.canvas.width = 0;
    canvasAndContextPair.canvas.height = 0;
    canvasAndContextPair.canvas = null;
    canvasAndContextPair.context = null;
  },
};

// Getting path of the file in file system.
var pdfURL = '../../helloworld/helloworld.pdf';

// Loading the file into typed array, from the file system.
var rawData = new Uint8Array(fs.readFileSync(pdfURL));

var pdfjsLib = require('../../../build/dist');

// Loading the pdf.
pdfjsLib.getDocument(rawData).then(function (pdfDocument) {
  console.log('# PDF document loaded.');
  // Request for the first page.
  pdfDocument.getPage(1).then(function (page) {
    // Print page on node canvas with 100% scale. 
    var viewport = page.getViewport(1.0);
    var canvasFactory = new NodeCanvasFactory();
    var canvasAndContextPair = canvasFactory.create(viewport.width, viewport.height);
    var canvas = canvasAndContextPair.canvas;
    var renderContext = {
      canvasContext: canvasAndContextPair.context,
      viewport: viewport,
      canvasFactory: canvasFactory
    };
    // Render the page on node canvas.
    page.render(renderContext).then(function () {
      // Convert the canvas to an image buffer.
      data = canvas.toBuffer();
      // Save the printed PDF in file system.
      fs.writeFile('output.png', data, function (error) {
        if (error) {
          console.error('Error: ' + error);
        } else {
          console.log('Finished converting first page of PDF to PNG.');
        }
      });
    });
  });
}).catch(function(reason) {
  console.log(reason);
});
