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
      // TODO: Place the worker magic HERE.
      this.page.startRendering(ctx, callback, errback);
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
  }

  constructor.prototype = {
    get numPages() {
      return this.pdf.numPages;
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
