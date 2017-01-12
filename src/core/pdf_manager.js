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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/pdf_manager', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/stream', 'pdfjs/core/chunked_stream', 'pdfjs/core/document'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./stream.js'),
      require('./chunked_stream.js'), require('./document.js'));
  } else {
    factory((root.pdfjsCorePdfManager = {}), root.pdfjsSharedUtil,
      root.pdfjsCoreStream, root.pdfjsCoreChunkedStream,
      root.pdfjsCoreDocument);
  }
}(this, function (exports, sharedUtil, coreStream, coreChunkedStream,
                  coreDocument) {

var warn = sharedUtil.warn;
var createValidAbsoluteUrl = sharedUtil.createValidAbsoluteUrl;
var shadow = sharedUtil.shadow;
var NotImplementedException = sharedUtil.NotImplementedException;
var MissingDataException = sharedUtil.MissingDataException;
var createPromiseCapability = sharedUtil.createPromiseCapability;
var Util = sharedUtil.Util;
var Stream = coreStream.Stream;
var ChunkedStreamManager = coreChunkedStream.ChunkedStreamManager;
var PDFDocument = coreDocument.PDFDocument;

var BasePdfManager = (function BasePdfManagerClosure() {
  function BasePdfManager() {
    throw new Error('Cannot initialize BaseManagerManager');
  }

  BasePdfManager.prototype = {
    get docId() {
      return this._docId;
    },

    get password() {
      return this._password;
    },

    get docBaseUrl() {
      var docBaseUrl = null;
      if (this._docBaseUrl) {
        var absoluteUrl = createValidAbsoluteUrl(this._docBaseUrl);
        if (absoluteUrl) {
          docBaseUrl = absoluteUrl.href;
        } else {
          warn('Invalid absolute docBaseUrl: "' + this._docBaseUrl + '".');
        }
      }
      return shadow(this, 'docBaseUrl', docBaseUrl);
    },

    onLoadedStream: function BasePdfManager_onLoadedStream() {
      throw new NotImplementedException();
    },

    ensureDoc: function BasePdfManager_ensureDoc(prop, args) {
      return this.ensure(this.pdfDocument, prop, args);
    },

    ensureXRef: function BasePdfManager_ensureXRef(prop, args) {
      return this.ensure(this.pdfDocument.xref, prop, args);
    },

    ensureCatalog: function BasePdfManager_ensureCatalog(prop, args) {
      return this.ensure(this.pdfDocument.catalog, prop, args);
    },

    getPage: function BasePdfManager_getPage(pageIndex) {
      return this.pdfDocument.getPage(pageIndex);
    },

    cleanup: function BasePdfManager_cleanup() {
      return this.pdfDocument.cleanup();
    },

    ensure: function BasePdfManager_ensure(obj, prop, args) {
      return new NotImplementedException();
    },

    requestRange: function BasePdfManager_requestRange(begin, end) {
      return new NotImplementedException();
    },

    requestLoadedStream: function BasePdfManager_requestLoadedStream() {
      return new NotImplementedException();
    },

    sendProgressiveData: function BasePdfManager_sendProgressiveData(chunk) {
      return new NotImplementedException();
    },

    updatePassword: function BasePdfManager_updatePassword(password) {
      this._password = password;
    },

    terminate: function BasePdfManager_terminate() {
      return new NotImplementedException();
    }
  };

  return BasePdfManager;
})();

var LocalPdfManager = (function LocalPdfManagerClosure() {
  function LocalPdfManager(docId, data, password, evaluatorOptions,
                           docBaseUrl) {
    this._docId = docId;
    this._password = password;
    this._docBaseUrl = docBaseUrl;
    this.evaluatorOptions = evaluatorOptions;
    var stream = new Stream(data);
    this.pdfDocument = new PDFDocument(this, stream);
    this._loadedStreamCapability = createPromiseCapability();
    this._loadedStreamCapability.resolve(stream);
  }

  Util.inherit(LocalPdfManager, BasePdfManager, {
    ensure: function LocalPdfManager_ensure(obj, prop, args) {
      return new Promise(function (resolve, reject) {
        try {
          var value = obj[prop];
          var result;
          if (typeof value === 'function') {
            result = value.apply(obj, args);
          } else {
            result = value;
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    },

    requestRange: function LocalPdfManager_requestRange(begin, end) {
      return Promise.resolve();
    },

    requestLoadedStream: function LocalPdfManager_requestLoadedStream() {
      return;
    },

    onLoadedStream: function LocalPdfManager_onLoadedStream() {
      return this._loadedStreamCapability.promise;
    },

    terminate: function LocalPdfManager_terminate() {
      return;
    }
  });

  return LocalPdfManager;
})();

var NetworkPdfManager = (function NetworkPdfManagerClosure() {
  function NetworkPdfManager(docId, pdfNetworkStream, args, evaluatorOptions,
                             docBaseUrl) {
    this._docId = docId;
    this._password = args.password;
    this._docBaseUrl = docBaseUrl;
    this.msgHandler = args.msgHandler;
    this.evaluatorOptions = evaluatorOptions;

    var params = {
      msgHandler: args.msgHandler,
      url: args.url,
      length: args.length,
      disableAutoFetch: args.disableAutoFetch,
      rangeChunkSize: args.rangeChunkSize
    };
    this.streamManager = new ChunkedStreamManager(pdfNetworkStream, params);
    this.pdfDocument = new PDFDocument(this, this.streamManager.getStream());
  }

  Util.inherit(NetworkPdfManager, BasePdfManager, {
    ensure: function NetworkPdfManager_ensure(obj, prop, args) {
      var pdfManager = this;

      return new Promise(function (resolve, reject) {
        function ensureHelper() {
          try {
            var result;
            var value = obj[prop];
            if (typeof value === 'function') {
              result = value.apply(obj, args);
            } else {
              result = value;
            }
            resolve(result);
          } catch (e) {
            if (!(e instanceof MissingDataException)) {
              reject(e);
              return;
            }
            pdfManager.streamManager.requestRange(e.begin, e.end).
              then(ensureHelper, reject);
          }
        }

        ensureHelper();
      });
    },

    requestRange: function NetworkPdfManager_requestRange(begin, end) {
      return this.streamManager.requestRange(begin, end);
    },

    requestLoadedStream: function NetworkPdfManager_requestLoadedStream() {
      this.streamManager.requestAllChunks();
    },

    sendProgressiveData:
        function NetworkPdfManager_sendProgressiveData(chunk) {
      this.streamManager.onReceiveData({ chunk: chunk });
    },

    onLoadedStream: function NetworkPdfManager_onLoadedStream() {
      return this.streamManager.onLoadedStream();
    },

    terminate: function NetworkPdfManager_terminate() {
      this.streamManager.abort();
    }
  });

  return NetworkPdfManager;
})();

exports.LocalPdfManager = LocalPdfManager;
exports.NetworkPdfManager = NetworkPdfManager;
}));
