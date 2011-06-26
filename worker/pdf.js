/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var consoleTimer = {};
var console = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: "log",
      data: args
    });
  },
  
  time: function(name) {
    consoleTimer[name] = Date.now();
  },
  
  timeEnd: function(name) {
    var time = consoleTimer[name];
    if (time == null) {
      throw "Unkown timer name " + name;
    }
    this.log("Timer:", name, Date.now() - time);
  }
}

//
importScripts("canvas.js");
importScripts("../pdf.js");
importScripts("../fonts.js");
importScripts("../glyphlist.js")

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
    postMessage({
      action: "pdf_num_pages",
      data: pdfDocument.numPages
    });
    return;
  }
  // User requested to render a certain page.
  else {
    console.time("compile");

    // Let's try to render the first page...
    var page = pdfDocument.getPage(parseInt(data));

    // page.compile will collect all fonts for us, once we have loaded them
    // we can trigger the actual page rendering with page.display
    var fonts = [];
    var gfx = new CanvasGraphics(canvas.getContext("2d"), CanvasProxy);
    page.compile(gfx, fonts);
    console.timeEnd("compile");

    console.time("fonts");
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
    console.timeEnd("fonts");

    console.time("display");
    page.display(gfx);
    canvas.flush();
    console.timeEnd("display");
  }
}
