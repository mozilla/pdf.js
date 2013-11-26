/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals NotImplementedException, MissingDataException, Promise, Stream,
           PDFDocument, ChunkedStreamManager */

'use strict';

// TODO(mack): Make use of PDFJS.Util.inherit() when it becomes available
var BasePdfManager = (function BasePdfManagerClosure() {
  function BasePdfManager() {
    throw new Error('Cannot initialize BaseManagerManager');
  }

  BasePdfManager.prototype = {
    onLoadedStream: function BasePdfManager_onLoadedStream() {
      throw new NotImplementedException();
    },

    ensureModel: function BasePdfManager_ensureModel(prop, args) {
      return this.ensure(this.pdfModel, prop, args);
    },

    ensureXRef: function BasePdfManager_ensureXRef(prop, args) {
      return this.ensure(this.pdfModel.xref, prop, args);
    },

    ensureCatalog: function BasePdfManager_ensureCatalog(prop, args) {
      return this.ensure(this.pdfModel.catalog, prop, args);
    },

    getPage: function BasePdfManager_pagePage(pageIndex) {
      return this.pdfModel.getPage(pageIndex);
    },

    cleanup: function BasePdfManager_cleanup() {
      return this.pdfModel.cleanup();
    },

    ensure: function BasePdfManager_ensure(obj, prop, args) {
      return new NotImplementedException();
    },

    requestRange: function BasePdfManager_ensure(begin, end) {
      return new NotImplementedException();
    },

    requestLoadedStream: function BasePdfManager_requestLoadedStream() {
      return new NotImplementedException();
    },

    updatePassword: function BasePdfManager_updatePassword(password) {
      this.pdfModel.xref.password = this.password = password;
      if (this.passwordChangedPromise) {
        this.passwordChangedPromise.resolve();
      }
    },

    terminate: function BasePdfManager_terminate() {
      return new NotImplementedException();
    }
  };

  return BasePdfManager;
})();

var LocalPdfManager = (function LocalPdfManagerClosure() {
  function LocalPdfManager(data, password) {
    var stream = new Stream(data);
    this.pdfModel = new PDFDocument(this, stream, password);
    this.loadedStream = new Promise();
    this.loadedStream.resolve(stream);
  }

  LocalPdfManager.prototype = Object.create(BasePdfManager.prototype);
  LocalPdfManager.prototype.constructor = LocalPdfManager;

  LocalPdfManager.prototype.ensure =
      function LocalPdfManager_ensure(obj, prop, args) {
    var promise = new Promise();
    try {
      var value = obj[prop];
      var result;
      if (typeof(value) === 'function') {
        result = value.apply(obj, args);
      } else {
        result = value;
      }
      promise.resolve(result);
    } catch (e) {
      console.log(e.stack);
      promise.reject(e);
    }
    return promise;
  };

  LocalPdfManager.prototype.requestRange =
      function LocalPdfManager_requestRange(begin, end) {
    var promise = new Promise();
    promise.resolve();
    return promise;
  };

  LocalPdfManager.prototype.requestLoadedStream =
      function LocalPdfManager_requestLoadedStream() {
  };

  LocalPdfManager.prototype.onLoadedStream =
      function LocalPdfManager_getLoadedStream() {
    return this.loadedStream;
  };

  LocalPdfManager.prototype.terminate =
      function LocalPdfManager_terminate() {
    return;
  };

  return LocalPdfManager;
})();

var NetworkPdfManager = (function NetworkPdfManagerClosure() {

  var CHUNK_SIZE = 65536;

  function NetworkPdfManager(args, msgHandler) {

    this.msgHandler = msgHandler;

    var params = {
      msgHandler: msgHandler,
      httpHeaders: args.httpHeaders,
      chunkedViewerLoading: args.chunkedViewerLoading,
      disableAutoFetch: args.disableAutoFetch,
      initialData: args.initialData
    };
    this.streamManager = new ChunkedStreamManager(args.length, CHUNK_SIZE,
                                                  args.url, params);

    this.pdfModel = new PDFDocument(this, this.streamManager.getStream(),
                                    args.password);
  }

  NetworkPdfManager.prototype = Object.create(BasePdfManager.prototype);
  NetworkPdfManager.prototype.constructor = NetworkPdfManager;

  NetworkPdfManager.prototype.ensure =
      function NetworkPdfManager_ensure(obj, prop, args) {
    var promise = new Promise();
    this.ensureHelper(promise, obj, prop, args);
    return promise;
  };

  NetworkPdfManager.prototype.ensureHelper =
      function NetworkPdfManager_ensureHelper(promise, obj, prop, args) {
    try {
      var result;
      var value = obj[prop];
      if (typeof(value) === 'function') {
        result = value.apply(obj, args);
      } else {
        result = value;
      }
      promise.resolve(result);
    } catch(e) {
      if (!(e instanceof MissingDataException)) {
        console.log(e.stack);
        promise.reject(e);
        return;
      }

      this.streamManager.requestRange(e.begin, e.end, function() {
        this.ensureHelper(promise, obj, prop, args);
      }.bind(this));
    }
  };

  NetworkPdfManager.prototype.requestRange =
      function NetworkPdfManager_requestRange(begin, end) {
    var promise = new Promise();
    this.streamManager.requestRange(begin, end, function() {
      promise.resolve();
    });
    return promise;
  };

  NetworkPdfManager.prototype.requestLoadedStream =
      function NetworkPdfManager_requestLoadedStream() {
    this.streamManager.requestAllChunks();
  };

  NetworkPdfManager.prototype.onLoadedStream =
      function NetworkPdfManager_getLoadedStream() {
    return this.streamManager.onLoadedStream();
  };

  NetworkPdfManager.prototype.terminate =
      function NetworkPdfManager_terminate() {
    this.streamManager.networkManager.abortAllRequests();
  };

  return NetworkPdfManager;
})();

