/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Set this to true if you want to use workers.
var useWorker = false;

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
      
      this.startRenderingTime = Date.now();
      this.workerPDF.startRendering(this)
    },
    
    startRenderingFromIRQueue: function(IRQueue, fonts) {
      var gfx = new CanvasGraphics(this.ctx);
      
      var startTime = Date.now();
      var callback = function(err) {
        var pageNum = this.page.pageNumber + 1;
        console.log("page=%d - rendering time: time=%dms", 
          pageNum, Date.now() - startTime);
        console.log("page=%d - total time: time=%dms", 
          pageNum, Date.now() - this.startRenderingTime);

        this.callback(err);
      }.bind(this);
      this.page.startRenderingFromIRQueue(gfx, IRQueue, fonts, callback);
    },
    
    getLinks: function() {
      return this.page.getLinks();
    }
  };
  
  return constructor;
})();

// This holds a list of objects the IR queue depends on.
var Objects = {
  hash: {},
  
  getPromise: function(objId) {
    var hash = this.hash;
	  if (hash[objId]) {
	    return hash[objId];
	  } else {
	    return hash[objId] = new Promise(objId);
	  }
  },
  
  setData: function(objId, data) {
    var promise = this.getPromise(objId);
    promise.data = data;
  },
	
  resolve: function(objId, data) {
    var hash = this.hash;
    // In case there is a promise already on this object, just resolve it.
    if (hash[objId]) {
      hash[objId].resolve(data);
    } else {
      hash[objId] = new Promise(objId, data);
    }
  },

  /**
   * If `ignoreResolve` is true, this function doesn't test if the object
   * is resolved when getting the object's data.
   */
  get: function(objId, ignoreResolve) {
    var obj = this.hash[objId];
    if (!ignoreResolve && (!obj || !obj.isResolved)) {
      throw "Requesting object that isn't resolved yet " + objId;
    }
    return obj.data;
  },
  
  clear: function() {
    delete this.hash;
    this.hash = {};
  }
};

var Promise = (function() {
  var EMPTY_PROMISE = {};

  function Promise(name, data) {
    this.name = name;
    // If you build a promise and pass in some data it's already resolved.
    if (data != null) {
      this.isResolved = true;
      this.$data = data;
      this.hasData = true;
    } else {
      this.isResolved = false;      
      this.$data = EMPTY_PROMISE;
    }
    this.callbacks = [];
  };
  
  Promise.prototype = {
    hasData: false,

    set data(data) {
      if (data === undefined) {
        return;
      }
      if (this.$data !== EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot set the data of a promise twice";
      }
      this.$data = data;
      this.hasData = true;

      if (this.$onDataCallback) {
        this.$onDataCallback(data);
      }
    },
    
    get data() {
      if (this.$data === EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot get data that isn't set";
      }
      return this.$data;
    },

    onData: function(callback) {
      if (this.$data !== EMPTY_PROMISE) {
        callback(this.$data);
      } else {
        this.$onDataCallback = callback;
      }
    },
    
    resolve: function(data) {
      if (this.isResolved) {
        throw "A Promise can be resolved only once " + this.name;
      }
      
      this.isResolved = true;
      this.data = data;
      var callbacks = this.callbacks;
      
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].call(null, data);
      }
    },
    
    then: function(callback) {
      if (!callback) {
        throw "Requiring callback" + this.name;
      }
      
      // If the promise is already resolved, call the callback directly.
      if (this.isResolved) {
        var data = this.data;
        callback.call(null, data);
      } else {
        this.callbacks.push(callback);        
      }
    }
  }
  return Promise;
})();

var WorkerPDFDoc = (function() {
  function constructor(data) {
    // For now, as we create a new WorkerPDFDoc, we clear all objects.
    // TODO: Have the objects per WorkerPDFDoc.
    Objects.clear();
    
    this.data = data;
    this.stream = new Stream(data);
    this.pdf = new PDFDoc(this.stream);
    
    this.catalog = this.pdf.catalog;
    
    this.pageCache = [];
    
    if (useWorker) {
      var worker = this.worker = new Worker("../worker/processor_boot.js");
      var fontWorker = this.fontWorker = new Worker('../worker/font_boot.js');
    } else {
      // If we don't use a worker, just post/sendMessage to the main thread.
      var worker = {
        postMessage: function(obj) {
          worker.onmessage({data: obj});
        }
      }
      var fontWorker = {
        postMessage: function(obj) {
          fontWorker.onmessage({data: obj});
        }
      }
    }

    var processorHandler = this.processorHandler = new MessageHandler("main", worker);
    processorHandler.on("page", function(data) {
      var pageNum = data.pageNum;
      var page = this.pageCache[pageNum];
     
      // DepFonts are all fonts are required to render the page. `fontsToLoad`
      // are all the fonts that are required to render the page AND that
      // aren't loaded on the page yet.
      var depFonts = data.depFonts;
      var fontsToLoad = [];

      function checkFontData() {
        // Check if all fontObjs have been processed. If not, shedule a
        // callback that is called once the data arrives and that checks
        // the next fonts.
        for (var i = 0; i < depFonts.length; i++) {
          var fontName = depFonts[i];
          var fontObj = Objects.getPromise(fontName);
          if (!fontObj.hasData) {
            console.log('need to wait for fontData', fontName);
            fontObj.onData(checkFontData);
            return;
          } else if (!fontObj.isResolved) {
            fontsToLoad.push(fontName);
          }
        }

        // At this point, all font data ia loaded. Start the actuall rendering.
        page.startRenderingFromIRQueue(data.IRQueue, fontsToLoad);
      }

      checkFontData();
    }, this);

    processorHandler.on("obj", function(data) {
      var objId   = data[0];
      var objType = data[1];

      switch (objType) {
        case "JpegStream":
          var IR = data[2];
          new JpegStreamIR(objId, IR);
        break;
        case "Font":
          var name = data[2];
          var file = data[3];
          var properties = data[4];

          fontHandler.send("font", [objId, name, file, properties]);
        break;
        default:
          throw "Got unkown object type " + objType;
      }
    }, this);

    var fontHandler = this.fontHandler = new MessageHandler('font', fontWorker);
    fontHandler.on('font_ready', function(data) {
      var objId   = data[0];
      var fontObj = new FontShape(data[1]);

      console.log('got fontData', objId);

      // If there is no string, then there is nothing to attach to the DOM.
      if (!fontObj.str) {
        Objects.resolve(objId, fontObj);
      } else {
        Objects.setData(objId, fontObj);
      }
    });
    
    if (!useWorker) {
      // If the main thread is our worker, setup the handling for the messages
      // the main thread sends to it self.
      WorkerProcessorHandler.setup(processorHandler);
      WorkerFontHandler.setup(fontHandler);
    }
    
    processorHandler.send("doc", data);
  }

  constructor.prototype = {
    get numPages() {
      return this.pdf.numPages;
    },
    
    startRendering: function(page) {
      this.processorHandler.send("page_request", page.page.pageNumber + 1);
    },
    
    getPage: function(n) {
      if (this.pageCache[n]) {
        return this.pageCache[n];
      }
      
      var page = this.pdf.getPage(n);
      return this.pageCache[n] = new WorkerPage(this, page);
    },
    
    destroy: function() {
      console.log("destroy worker");
      if (this.worker) {
        this.worker.terminate();
      }
      if (this.fontWorker) {
        this.fontWorker.terminate();
      }
      
      for (var n in this.pageCache) {
        delete this.pageCache[n];
      }
      delete this.data;
      delete this.stream;
      delete this.pdf;
      delete this.catalog;
    }
  };
  
  return constructor;
})();
