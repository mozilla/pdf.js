/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var WorkerHandler = {
  setup: function(handler) {
    var pdfDoc = null;
    
    handler.on("doc", function(data) {
      pdfDoc = new PDFDoc(new Stream(data));
    });
  
    handler.on("page_request", function(pageNum) {
      pageNum = parseInt(pageNum);

      var page = pdfDoc.getPage(pageNum);

      // The following code does quite the same as Page.prototype.startRendering,
      // but stops at one point and sends the result back to the main thread.
      var gfx = new CanvasGraphics(null);
      var fonts = [];

      var start = Date.now();
      // Pre compile the pdf page and fetch the fonts/images.
      var IRQueue = page.getIRQueue(handler, fonts);

      console.log("page=%d - getIRQueue: time=%dms, len=%d", pageNum, Date.now() - start, IRQueue.fnArray.length);
      // Extract the minimum of font data that is required to build all required
      // font stuff on the main thread.
      var fontsMin = [];
      for (var i = 0; i < fonts.length; i++) {
        var font = fonts[i];

        fontsMin.push({
          name:       font.name,
          file:       font.file,
          properties: font.properties
        });
      }

      if (false /* show used commands */) {
        var cmdMap = {};
  
        var fnArray = IRQueue .fnArray;
        for (var i = 0; i < fnArray.length; i++) {
          var entry = fnArray[i];
          if (entry == "paintReadyFormXObject") {
            //console.log(preCompilation.argsArray[i]);
          }
          if (cmdMap[entry] == null) {
            cmdMap[entry] = 1;
          } else {
            cmdMap[entry] += 1;
          }
        }
        console.log("cmds", JSON.stringify(cmdMap));
      } 

      handler.send("page", {
        pageNum:  pageNum,
        fonts:    fontsMin,
        IRQueue:  IRQueue,
      });
    }, this);
  }
}
