/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Set this to true if you want to use workers.
var useWorker = true;

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
    
    get view() {
      return this.page.view;
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

/**
 * A PDF document and page is build up of many objects. E.g. there are objects
 * for fonts, images, rendering code and such. These objects might get processed
 * inside of a worker. The `PDFObjects` implements some basic functions to manage
 * these objects.
 */
var PDFObjects = (function() {
  function PDFObjects() {
    this.objs = {};
  }

  PDFObjects.prototype = {
    objs: null,

    /**
     * Internal function.
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
 * Each object that is stored in PDFObjects is based on a Promise object that
 * contains the status of the object and the data. There migth be situations,
 * where a function want to use the value of an object, but it isn't ready at
 * that time. To get a notification, once the object is ready to be used, s.o.
 * can add a callback using the `then` method on the promise that then calls
 * the callback once the object gets resolved.
 * A promise can get resolved only once and only once the data of the promise
 * can be set. If any of these happens twice or the data is required before
 * it was set, an exception is throw.
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


