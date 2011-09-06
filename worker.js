/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var WorkerPage = (function() {
  function constructor(workerPDF, page) {
    this.workerPDF = workerPDF;
    this.page = page;
    
    this.ref = page.ref;
  }
  
  constructor.prototype = {
    get width() {
      return this.page.width;
    },
    
    get height() {
      return this.page.height;
    },
    
    get stats() {
      return this.page.stats;
    },
    
    startRendering: function(ctx, callback, errback)  {
      this.ctx = ctx;
      this.callback = callback;
      // TODO: Place the worker magic HERE.
      // this.page.startRendering(ctx, callback, errback);
      
      this.workerPDF.startRendering(this)
    },
    
    startRenderingFromPreCompilation: function(preCompilation, fonts, images) {
      var gfx = new CanvasGraphics(this.ctx);
      
      // TODO: Add proper handling for images loaded by the worker.
      var images = new ImagesLoader();
      
      this.page.startRenderingFromPreCompilation(gfx, preCompilation, fonts, images, this.callback);
    },
    
    getLinks: function() {
      return this.page.getLinks();
    }
  };
  
  return constructor;
})();

var WorkerPDFDoc = (function() {
  function constructor(data) {
    this.data = data;
    this.stream = new Stream(data);
    this.pdf = new PDFDoc(this.stream);
    
    this.catalog = this.pdf.catalog;
    
    this.pageCache = [];
    
    this.worker = new Worker("worker/boot.js");
    this.handler = new MessageHandler({
      "page": function(data) {
        var pageNum = data.pageNum;
        var page = this.pageCache[pageNum];
        
        page.startRenderingFromPreCompilation(data.preCompilation, data.fonts, data.images);
      }
    }, this.worker.postMessage, this);
    this.worker.onmessage = this.handler.onMessage;
    
    this.handler.send("doc", data);
  }

  constructor.prototype = {
    get numPages() {
      return this.pdf.numPages;
    },
    
    startRendering: function(page) {
      this.handler.send("page", page.page.pageNumber);
    },
    
    getPage: function(n) {
      if (this.pageCache[n]) {
        return this.pageCache[n];
      }
      
      var page = this.pdf.getPage(n);
      return this.pageCache[n] = new WorkerPage(this, page);
    }
  };
  
  return constructor;
})();
