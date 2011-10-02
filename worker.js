/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Set this to true if you want to use workers.
var useWorker = false;

var WorkerPage = (function() {
  function constructor(workerPDF, page, objs) {
    this.workerPDF = workerPDF;
    this.page = page;
    this.objs = objs;
    
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
      var gfx = new CanvasGraphics(this.ctx, this.objs);
      
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

var PDFObjects = (function() {
  function PDFObjects() {
    this.objs = {};
  }

  PDFObjects.prototype = {
    objs: null,

    /**
     * Ensures there is an object defined for `objId`. Stores `data` on the
     * object *if* it is created.
     */
    ensureObj: function(objId, data) {
      if (!this.objs[objId]) {
        return this.objs[objId] = new Promise(objId, data);
      } else {
        return this.objs[objId];
      }
    },

    /**
     * If called *without* callback, this returns the data of `objId` but the
     * object needs to be resolved. If it isn't, this function throws.
     *
     * If called *with* a callback, the callback is called with the data of the
     * object once the object is resolved. That means, if you call this 
     * function and the object is already resolved, the callback gets called
     * right away.
     */
    get: function(objId, callback) {
      // If there is a callback, then the get can be async and the object is 
      // not required to be resolved right now
      if (callback) {
        this.ensureObj(objId).then(callback);
      } 
      // If there isn't a callback, the user expects to get the resolved data
      // directly.
      else {
        var obj = this.objs[objId];

        // If there isn't an object yet or the object isn't resolved, then the
        // data isn't ready yet!
        if (!obj || !obj.isResolved) {
          throw "Requesting object that isn't resolved yet " + objId;
        } 
        // Direct access.
        else {
          return obj.data;
        }
      }
    },

    /**
     * Resolves the object `objId` with optional `data`.
     */
    resolve: function(objId, data) {
      var objs = this.objs;
      
      // In case there is a promise already on this object, just resolve it.
      if (objs[objId]) {
        objs[objId].resolve(data);
      } else {
        this.ensureObj(objId, data);
      }
    },

    onData: function(objId, callback) {
      this.ensureObj(objId).onData(callback);
    },

    isResolved: function(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].isResolved;
      }
    },

    hasData: function(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].hasData;
      }
    },

    /**
     * Sets the data of an object but *doesn't* resolve it.
     */
    setData: function(objId, data) {
      // Watchout! If you call `this.ensureObj(objId, data)` you'll gone create
      // a *resolved* promise which shouldn't be the case!
      this.ensureObj(objId).data = data;
    }
  }
  return PDFObjects;
})();


/**
 * "Promise" object.
 */
var Promise = (function() {
  var EMPTY_PROMISE = {};

  /**
   * If `data` is passed in this constructor, the promise is created resolved.
   * If there isn't data, it isn't resolved at the beginning.
   */
  function Promise(name, data) {
    this.name = name;
    // If you build a promise and pass in some data it's already resolved.
    if (data != null) {
      this.isResolved = true;
      this._data = data;
      this.hasData = true;
    } else {
      this.isResolved = false;      
      this._data = EMPTY_PROMISE;
    }
    this.callbacks = [];
  };
  
  Promise.prototype = {
    hasData: false,

    set data(data) {
      if (data === undefined) {
        return;
      }
      if (this._data !== EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot set the data of a promise twice";
      }
      this._data = data;
      this.hasData = true;

      if (this.onDataCallback) {
        this.onDataCallback(data);
      }
    },
    
    get data() {
      if (this._data === EMPTY_PROMISE) {
        throw "Promise " + this.name + ": Cannot get data that isn't set";
      }
      return this._data;
    },

    onData: function(callback) {
      if (this._data !== EMPTY_PROMISE) {
        callback(this._data);
      } else {
        this.onDataCallback = callback;
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
    
    this.data = data;
    this.stream = new Stream(data);
    this.pdf = new PDFDoc(this.stream);
    
    this.catalog = this.pdf.catalog;
    this.objs = new PDFObjects();
    
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
      var objs = this.objs;

      function checkFontData() {
        // Check if all fontObjs have been processed. If not, shedule a
        // callback that is called once the data arrives and that checks
        // the next fonts.
        for (var i = 0; i < depFonts.length; i++) {
          var fontName = depFonts[i];
          if (!objs.hasData(fontName)) {
            console.log('need to wait for fontData', fontName);
            objs.onData(fontObj, checkFontData);
            return;
          } else if (!objs.isResolved(fontName)) {
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
          new JpegStreamIR(objId, IR, this.objs);
          console.log('got image');
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
        this.objs.resolve(objId, fontObj);
      } else {
        this.objs.setData(objId, fontObj);
      }
    }.bind(this));
    
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
      // Add a reference to the objects such that Page can forward the reference
      // to the CanvasGraphics and so on.
      page.objs = this.objs;
      return this.pageCache[n] = new WorkerPage(this, page, this.objs);
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
