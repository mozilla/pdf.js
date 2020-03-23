/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NetworkPdfManager = exports.LocalPdfManager = void 0;

var _util = require("../shared/util.js");

var _chunked_stream = require("./chunked_stream.js");

var _core_utils = require("./core_utils.js");

var _document = require("./document.js");

var _stream = require("./stream.js");

class BasePdfManager {
  constructor() {
    if (this.constructor === BasePdfManager) {
      (0, _util.unreachable)("Cannot initialize BasePdfManager.");
    }
  }

  get docId() {
    return this._docId;
  }

  get password() {
    return this._password;
  }

  get docBaseUrl() {
    let docBaseUrl = null;

    if (this._docBaseUrl) {
      const absoluteUrl = (0, _util.createValidAbsoluteUrl)(this._docBaseUrl);

      if (absoluteUrl) {
        docBaseUrl = absoluteUrl.href;
      } else {
        (0, _util.warn)(`Invalid absolute docBaseUrl: "${this._docBaseUrl}".`);
      }
    }

    return (0, _util.shadow)(this, "docBaseUrl", docBaseUrl);
  }

  onLoadedStream() {
    (0, _util.unreachable)("Abstract method `onLoadedStream` called");
  }

  ensureDoc(prop, args) {
    return this.ensure(this.pdfDocument, prop, args);
  }

  ensureXRef(prop, args) {
    return this.ensure(this.pdfDocument.xref, prop, args);
  }

  ensureCatalog(prop, args) {
    return this.ensure(this.pdfDocument.catalog, prop, args);
  }

  getPage(pageIndex) {
    return this.pdfDocument.getPage(pageIndex);
  }

  fontFallback(id, handler) {
    return this.pdfDocument.fontFallback(id, handler);
  }

  cleanup() {
    return this.pdfDocument.cleanup();
  }

  async ensure(obj, prop, args) {
    (0, _util.unreachable)("Abstract method `ensure` called");
  }

  requestRange(begin, end) {
    (0, _util.unreachable)("Abstract method `requestRange` called");
  }

  requestLoadedStream() {
    (0, _util.unreachable)("Abstract method `requestLoadedStream` called");
  }

  sendProgressiveData(chunk) {
    (0, _util.unreachable)("Abstract method `sendProgressiveData` called");
  }

  updatePassword(password) {
    this._password = password;
  }

  terminate(reason) {
    (0, _util.unreachable)("Abstract method `terminate` called");
  }

}

class LocalPdfManager extends BasePdfManager {
  constructor(docId, data, password, evaluatorOptions, docBaseUrl) {
    super();
    this._docId = docId;
    this._password = password;
    this._docBaseUrl = docBaseUrl;
    this.evaluatorOptions = evaluatorOptions;
    const stream = new _stream.Stream(data);
    this.pdfDocument = new _document.PDFDocument(this, stream);
    this._loadedStreamPromise = Promise.resolve(stream);
  }

  async ensure(obj, prop, args) {
    const value = obj[prop];

    if (typeof value === "function") {
      return value.apply(obj, args);
    }

    return value;
  }

  requestRange(begin, end) {
    return Promise.resolve();
  }

  requestLoadedStream() {}

  onLoadedStream() {
    return this._loadedStreamPromise;
  }

  terminate(reason) {}

}

exports.LocalPdfManager = LocalPdfManager;

class NetworkPdfManager extends BasePdfManager {
  constructor(docId, pdfNetworkStream, args, evaluatorOptions, docBaseUrl) {
    super();
    this._docId = docId;
    this._password = args.password;
    this._docBaseUrl = docBaseUrl;
    this.msgHandler = args.msgHandler;
    this.evaluatorOptions = evaluatorOptions;
    this.streamManager = new _chunked_stream.ChunkedStreamManager(pdfNetworkStream, {
      msgHandler: args.msgHandler,
      length: args.length,
      disableAutoFetch: args.disableAutoFetch,
      rangeChunkSize: args.rangeChunkSize
    });
    this.pdfDocument = new _document.PDFDocument(this, this.streamManager.getStream());
  }

  async ensure(obj, prop, args) {
    try {
      const value = obj[prop];

      if (typeof value === "function") {
        return value.apply(obj, args);
      }

      return value;
    } catch (ex) {
      if (!(ex instanceof _core_utils.MissingDataException)) {
        throw ex;
      }

      await this.requestRange(ex.begin, ex.end);
      return this.ensure(obj, prop, args);
    }
  }

  requestRange(begin, end) {
    return this.streamManager.requestRange(begin, end);
  }

  requestLoadedStream() {
    this.streamManager.requestAllChunks();
  }

  sendProgressiveData(chunk) {
    this.streamManager.onReceiveData({
      chunk
    });
  }

  onLoadedStream() {
    return this.streamManager.onLoadedStream();
  }

  terminate(reason) {
    this.streamManager.abort(reason);
  }

}

exports.NetworkPdfManager = NetworkPdfManager;