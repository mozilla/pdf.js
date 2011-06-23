/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var timer = null;
function tic() {
  timer = Date.now();
}

function toc(msg) {
  log(msg + ": " + (Date.now() - timer) + "ms");
  timer = null;
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  postMessage("log");
  postMessage(JSON.stringify(args))
}

var console = {
  log: log
}

//
importScripts("canvas_proxy.js");
importScripts("pdf.js");
importScripts("fonts.js");
importScripts("glyphlist.js")

// Use the JpegStreamProxy proxy.
JpegStream = JpegStreamProxy;

// Create the WebWorkerProxyCanvas.
var canvas = new CanvasProxy(1224, 1584);

// Listen for messages from the main thread.
var pdfDocument = null;
onmessage = function(event) {
  var data = event.data;
  // If there is no pdfDocument yet, then the sent data is the PDFDocument.
  if (!pdfDocument) {
    pdfDocument = new PDFDoc(new Stream(data));
    postMessage("pdf_num_page");
    postMessage(pdfDocument.numPages)
    return;
  }
  // User requested to render a certain page.
  else {
    tic();

    // Let's try to render the first page...
    var page = pdfDocument.getPage(parseInt(data));

    // page.compile will collect all fonts for us, once we have loaded them
    // we can trigger the actual page rendering with page.display
    var fonts = [];
    var gfx = new CanvasGraphics(canvas.getContext("2d"), CanvasProxy);
    page.compile(gfx, fonts);

    // Inspect fonts and translate the missing one.
    var count = fonts.length;
    for (var i = 0; i < count; i++) {
      var font = fonts[i];
      if (Fonts[font.name]) {
        fontsReady = fontsReady && !Fonts[font.name].loading;
        continue;
      }

      // This "builds" the font and sents it over to the main thread.
      new Font(font.name, font.file, font.properties);
    }
    toc("compiled page");

    tic()
    page.display(gfx);
    canvas.flush();
    toc("displayed page");
  }
}
