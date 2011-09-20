/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var consoleTimer = {};
var console = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: 'log',
      data: args
    });
  }
};

var consoleUtils = {
  time: function(name) {
    consoleTimer[name] = Date.now();
  },

  timeEnd: function(name) {
    var time = consoleTimer[name];
    if (time == null) {
      throw 'Unkown timer name ' + name;
    }
    console.log('Timer:', name, Date.now() - time);
  }
};

//
importScripts('console.js');
importScripts('canvas.js');
importScripts('../pdf.js');
importScripts('../fonts.js');
importScripts('../crypto.js');
importScripts('../glyphlist.js');

// Use the JpegStreamProxy proxy.
JpegStream = JpegStreamProxy;

// Create the WebWorkerProxyCanvas.
var canvas = new CanvasProxy(1224, 1584);

// Listen for messages from the main thread.
var pdfDocument = null;
addEventListener('message', function(event) {
  var data = event.data;
  // If there is no pdfDocument yet, then the sent data is the PDFDocument.
  if (!pdfDocument) {
    pdfDocument = new PDFDoc(new Stream(data));
    postMessage({
      action: 'pdf_num_pages',
      data: pdfDocument.numPages
    });
    return;
  }
  // User requested to render a certain page.
  else {
    consoleUtils.time('compile');

    // Let's try to render the first page...
    var page = pdfDocument.getPage(parseInt(data, 10));

    var pdfToCssUnitsCoef = 96.0 / 72.0;
    var pageWidth = (page.mediaBox[2] - page.mediaBox[0]) * pdfToCssUnitsCoef;
    var pageHeight = (page.mediaBox[3] - page.mediaBox[1]) * pdfToCssUnitsCoef;
    postMessage({
      action: 'setup_page',
      data: pageWidth + ',' + pageHeight
    });

    // Set canvas size.
    canvas.width = pageWidth;
    canvas.height = pageHeight;

    // page.compile will collect all fonts for us, once we have loaded them
    // we can trigger the actual page rendering with page.display
    var fonts = [];
    var gfx = new CanvasGraphics(canvas.getContext('2d'), CanvasProxy);
    page.compile(gfx, fonts);
    consoleUtils.timeEnd('compile');

    // Send fonts to the main thread.
    consoleUtils.time('fonts');
    postMessage({
      action: 'fonts',
      data: fonts
    });
    consoleUtils.timeEnd('fonts');

    consoleUtils.time('display');
    page.display(gfx);
    canvas.flush();
    consoleUtils.timeEnd('display');
  }
});
