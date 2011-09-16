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

  get: function(objId) {
    var obj = this.hash[objId];
    if (!obj || !obj.isResolved) {
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
    } else {
      this.isResolved = false;      
      this.$data = EMPTY_PROMISE;
    }
    this.callbacks = [];
  };
  
  Promise.prototype = {
    set data(data) {
      if (data === undefined) {
        return;
      }
      if (this.$data !== EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot set the data of a promise twice";
      }
      this.$data = data;
    },
    
    get data() {
      if (this.$data === EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot get data that isn't set";
      }
      return this.$data;
    },
    
    resolve: function(data) {
      if (this.isResolved) {
        throw "A Promise can be resolved only once";
      }
      
      this.isResolved = true;
      this.data = data;
      var callbacks = this.callbacks;
      
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].call(null, data);
      }
    },
    
    then: function(callback) {
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
    
    var useWorker = true;
    
    if (useWorker) {
      var worker = new Worker("../worker/boot_processor.js");
    } else {
      // If we don't use a worker, just post/sendMessage to the main thread.
      var worker = {
        postMessage: function(obj) {
          worker.onmessage({data: obj});
        }
      }
    }

    var fontWorker = new Worker('../worker/boot_font.js');
    var fontHandler = this.fontHandler = new MessageHandler('font', fontWorker);

    var handler = this.handler = new MessageHandler("main", worker);
    handler.on("page", function(data) {
      var pageNum = data.pageNum;
      var page = this.pageCache[pageNum];
      

      page.startRenderingFromIRQueue(data.IRQueue, data.fonts);
    }, this);

    handler.on("obj", function(data) {
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

    fontHandler.on('font_ready', function(data) {
      var objId   = data[0];
      var fontObj = new FontShape(data[1]);
      // If there is no string, then there is nothing to attach to the DOM.
      if (!fontObj.str) {
        Objects.resolve(objId, fontObj);
      } else {
        Objects.setData(objId, fontObj);
        FontLoader.bind([fontObj], function() {
          console.log("loaded", fontObj.loadedName);
          Objects.resolve(objId);
        });
      }
    });
    
    if (!useWorker) {
      // If the main thread is our worker, setup the handling for the messages
      // the main thread sends to it self.
      WorkerHandler.setup(handler);
    }
    
    handler.send("doc", data);
  }

  constructor.prototype = {
    get numPages() {
      return this.pdf.numPages;
    },
    
    startRendering: function(page) {
      this.handler.send("page_request", page.page.pageNumber + 1);
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
