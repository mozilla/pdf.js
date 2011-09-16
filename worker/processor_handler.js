/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var WorkerProcessorHandler = {
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

      var start = Date.now();
      // Pre compile the pdf page and fetch the fonts/images.
      var IRQueue = page.getIRQueue(handler);

      console.log("page=%d - getIRQueue: time=%dms, len=%d", pageNum, Date.now() - start, IRQueue.fnArray.length);

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
        IRQueue:  IRQueue,
      });
    }, this);
  }
}
