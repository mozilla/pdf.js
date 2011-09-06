/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

//
importScripts('console.js');
importScripts('event_handler.js');
importScripts('../pdf.js');
importScripts('../fonts.js');
importScripts('../crypto.js');
importScripts('../glyphlist.js');

// Listen for messages from the main thread.
var pdfDoc = null;

var handler = new MessageHandler({
  "doc": function(data) {
    pdfDocument = new PDFDoc(new Stream(data));
    console.log("setup pdfDoc");
  },
  
  "page": function(pageNum) {
    pageNum = parseInt(pageNum);
    console.log("about to process page", pageNum);
    
    var page = pdfDocument.getPage(pageNum);
    
    // The following code does quite the same as Page.prototype.startRendering,
    // but stops at one point and sends the result back to the main thread.
    var gfx = new CanvasGraphics(canvasCtx);
    var fonts = [];
    // TODO: Figure out how image loading is handled inside the worker.
    var images = new ImagesLoader();
    
    // Pre compile the pdf page and fetch the fonts/images.
    var preCompilation = page.preCompile(gfx, fonts, images);
    
    // Extract the minimum of font data that is required to build all required
    // font stuff on the main thread.
    var fontsMin = [];
    for (var i = 0; i < fonts.length; i++) {
      var font = fonts[i];
    
      fontsMin.push({
        name:       orgFont.name,
        file:       orgFont.file,
        properties: orgFont.properties
      });
    }
    
    // TODO: Handle images here.
    
    handler.send("page", {
      pageNum:        pageNum,
      fonts:          fontsMin,
      images:         [],
      preCompilation: preCompilation,
    });
  }
}, postMessage);

onmessage = handler.onMessage;
