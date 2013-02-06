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
/* globals NotImplementedException, MissingDataException, PDFJS, Stream,
           PDFDocument, ChunkedStream, ChunkedStreamManager */

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

    ensureModel: function BasePdfManager_ensureModel(prop) {
      var args = [].slice.call(arguments);
      args.unshift(this.pdfModel);
      return this.ensure.apply(this, args);
    },

    ensureXRef: function BasePdfManager_ensureXRef(prop) {
      var args = [].slice.call(arguments);
      args.unshift(this.pdfModel.xref);
      return this.ensure.apply(this, args);
    },

    ensureCatalog: function BasePdfManager_ensureCatalog(prop) {
      var args = [].slice.call(arguments);
      args.unshift(this.pdfModel.catalog);
      return this.ensure.apply(this, args);
    },

    getPage: function BasePdfManager_pagePage(pageIndex) {
      return this.pdfModel.getPage(pageIndex);
    },

    ensure: function BasePdfManager_ensure(obj, prop) {
      return new NotImplementedException();
    },

    requestLoadedStream: function BasePdfManager_requestLoadedStream() {
      return new NotImplementedException();
    }
  };

  return BasePdfManager;
})();

var LocalPdfManager = (function LocalPdfManagerClosure() {
  function LocalPdfManager(data, password) {
    var stream = new Stream(data);
    this.pdfModel = new PDFDocument(stream, password);
    this.loadedStream = new PDFJS.Promise();
    this.loadedStream.resolve(stream);
  }

  LocalPdfManager.prototype = Object.create(BasePdfManager.prototype);
  LocalPdfManager.prototype.constructor = LocalPdfManager;

  LocalPdfManager.prototype.ensure =
      function LocalPdfManager_ensure(obj, prop) {
    var promise = new PDFJS.Promise();
    var result;
    var value = obj[prop];
    try {
      if (typeof(value) === 'function') {
        var args = [].slice.call(arguments, 2);
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

  LocalPdfManager.prototype.requestLoadedStream =
      function LocalPdfManager_requestLoadedStream() {
  };

  LocalPdfManager.prototype.onLoadedStream =
      function LocalPdfManager_getLoadedStream() {
    return this.loadedStream;
  };

  return LocalPdfManager;
})();

var NetworkPdfManager = (function NetworkPdfManagerClosure() {

  var CHUNK_SIZE = 64000;

  function NetworkPdfManager(args, msgHandler) {

    this.msgHandler = msgHandler;

    var params = {
      msgHandler: msgHandler,
      httpHeaders: args.httpHeaders,
      chunkedViewerLoading: args.chunkedViewerLoading
    };
    this.streamManager = new ChunkedStreamManager(args.length, CHUNK_SIZE,
                                                  args.url, params);

    this.pdfModel = new PDFDocument(this.streamManager.getStream(),
                                    args.password);
  }

  NetworkPdfManager.prototype = Object.create(BasePdfManager.prototype);
  NetworkPdfManager.prototype.constructor = NetworkPdfManager;

  NetworkPdfManager.prototype.ensure =
      function NetworkPdfManager_ensure(obj, prop) {
    var promise = new PDFJS.Promise();
    var args = [].slice.call(arguments);
    args.unshift(promise);
    this.ensureHelper.apply(this, args);
    return promise;
  };

  NetworkPdfManager.prototype.ensureHelper =
      function NetworkPdfManager_ensureHelper(promise, obj, prop) {
    try {
      var result;
      var value = obj[prop];
      if (typeof(value) === 'function') {
        var args = [].slice.call(arguments, 3);
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

      var allArgs = Array.prototype.slice.call(arguments);
      this.streamManager.requestRange(e.begin, e.end, function() {
        this.ensureHelper.apply(this, allArgs);
      }.bind(this));
    }
  };

  NetworkPdfManager.prototype.requestLoadedStream =
      function NetworkPdfManager_requestLoadedStream() {
    this.streamManager.requestAllChunks();
  };

  NetworkPdfManager.prototype.onLoadedStream =
      function NetworkPdfManager_getLoadedStream() {
    return this.streamManager.onLoadedStream();
  };

  return NetworkPdfManager;
})();

