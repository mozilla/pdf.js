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
           PDFDocument, ChunkedStreamManager, createPromiseCapability, Util */

'use strict';

var BasePdfManager = (function BasePdfManagerClosure() {
  function BasePdfManager() {
    throw new Error('Cannot initialize BaseManagerManager');
  }

  BasePdfManager.prototype = {
    get docId() {
      return this._docId;
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
      this.pdfDocument.xref.password = this.password = password;
      if (this._passwordChangedCapability) {
        this._passwordChangedCapability.resolve();
      }
    },

    passwordChanged: function BasePdfManager_passwordChanged() {
      this._passwordChangedCapability = createPromiseCapability();
      return this._passwordChangedCapability.promise;
    },

    terminate: function BasePdfManager_terminate() {
      return new NotImplementedException();
    }
  };

  return BasePdfManager;
})();

var LocalPdfManager = (function LocalPdfManagerClosure() {
  function LocalPdfManager(docId, data, password) {
    this._docId = docId;
    var stream = new Stream(data);
    this.pdfDocument = new PDFDocument(this, stream, password);
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
  function NetworkPdfManager(docId, args, msgHandler) {
    this._docId = docId;
    this.msgHandler = msgHandler;

    var params = {
      msgHandler: msgHandler,
      httpHeaders: args.httpHeaders,
      withCredentials: args.withCredentials,
      chunkedViewerLoading: args.chunkedViewerLoading,
      disableAutoFetch: args.disableAutoFetch,
      initialData: args.initialData
    };
    this.streamManager = new ChunkedStreamManager(args.length,
                                                  args.rangeChunkSize,
                                                  args.url, params);
    this.pdfDocument = new PDFDocument(this, this.streamManager.getStream(),
                                       args.password);
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
          } catch(e) {
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
