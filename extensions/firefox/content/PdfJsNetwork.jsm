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
/* globals Components, Services */

"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["NetworkManager"];

function log(aMsg) {
  var msg = "PdfJsNetwork.jsm: " + (aMsg.join ? aMsg.join("") : aMsg);
  Services.console.logStringMessage(msg);
}

var NetworkManager = (function NetworkManagerClosure() {

  const OK_RESPONSE = 200;
  const PARTIAL_CONTENT_RESPONSE = 206;

  function getArrayBuffer(xhr) {
    var data = xhr.response;
    if (typeof data !== "string") {
      return data;
    }
    var length = data.length;
    var array = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
      array[i] = data.charCodeAt(i) & 0xFF;
    }
    return array.buffer;
  }

  class NetworkManagerClass {
    constructor(url, args) {
      this.url = url;
      args = args || {};
      this.isHttp = /^https?:/i.test(url);
      this.httpHeaders = (this.isHttp && args.httpHeaders) || {};
      this.withCredentials = args.withCredentials || false;
      this.getXhr = args.getXhr ||
        function NetworkManager_getXhr() {
          return new XMLHttpRequest();
        };

      this.currXhrId = 0;
      this.pendingRequests = Object.create(null);
      this.loadedRequests = Object.create(null);
    }

    requestRange(begin, end, listeners) {
      var args = {
        begin,
        end,
      };
      for (var prop in listeners) {
        args[prop] = listeners[prop];
      }
      return this.request(args);
    }

    requestFull(listeners) {
      return this.request(listeners);
    }

    request(args) {
      var xhr = this.getXhr();
      var xhrId = this.currXhrId++;
      var pendingRequest = this.pendingRequests[xhrId] = {
        xhr,
      };

      xhr.open("GET", this.url);
      xhr.withCredentials = this.withCredentials;
      for (var property in this.httpHeaders) {
        var value = this.httpHeaders[property];
        if (typeof value === "undefined") {
          continue;
        }
        xhr.setRequestHeader(property, value);
      }
      if (this.isHttp && "begin" in args && "end" in args) {
        var rangeStr = args.begin + "-" + (args.end - 1);
        xhr.setRequestHeader("Range", "bytes=" + rangeStr);
        pendingRequest.expectedStatus = 206;
      } else {
        pendingRequest.expectedStatus = 200;
      }

      var useMozChunkedLoading = !!args.onProgressiveData;
      if (useMozChunkedLoading) {
        xhr.responseType = "moz-chunked-arraybuffer";
        pendingRequest.onProgressiveData = args.onProgressiveData;
        pendingRequest.mozChunked = true;
      } else {
        xhr.responseType = "arraybuffer";
      }

      if (args.onError) {
        xhr.onerror = function(evt) {
          args.onError(xhr.status);
        };
      }
      xhr.onreadystatechange = this.onStateChange.bind(this, xhrId);
      xhr.onprogress = this.onProgress.bind(this, xhrId);

      pendingRequest.onHeadersReceived = args.onHeadersReceived;
      pendingRequest.onDone = args.onDone;
      pendingRequest.onError = args.onError;
      pendingRequest.onProgress = args.onProgress;

      xhr.send(null);

      return xhrId;
    }

    onProgress(xhrId, evt) {
      var pendingRequest = this.pendingRequests[xhrId];
      if (!pendingRequest) {
        // Maybe abortRequest was called...
        return;
      }

      if (pendingRequest.mozChunked) {
        var chunk = getArrayBuffer(pendingRequest.xhr);
        pendingRequest.onProgressiveData(chunk);
      }

      var onProgress = pendingRequest.onProgress;
      if (onProgress) {
        onProgress(evt);
      }
    }

    onStateChange(xhrId, evt) {
      var pendingRequest = this.pendingRequests[xhrId];
      if (!pendingRequest) {
        // Maybe abortRequest was called...
        return;
      }

      var xhr = pendingRequest.xhr;
      if (xhr.readyState >= 2 && pendingRequest.onHeadersReceived) {
        pendingRequest.onHeadersReceived();
        delete pendingRequest.onHeadersReceived;
      }

      if (xhr.readyState !== 4) {
        return;
      }

      if (!(xhrId in this.pendingRequests)) {
        // The XHR request might have been aborted in onHeadersReceived()
        // callback, in which case we should abort request
        return;
      }

      delete this.pendingRequests[xhrId];

      // success status == 0 can be on ftp, file and other protocols
      if (xhr.status === 0 && this.isHttp) {
        if (pendingRequest.onError) {
          pendingRequest.onError(xhr.status);
        }
        return;
      }
      var xhrStatus = xhr.status || OK_RESPONSE;

      // From http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.35.2:
      // "A server MAY ignore the Range header". This means it's possible to
      // get a 200 rather than a 206 response from a range request.
      var ok_response_on_range_request =
          xhrStatus === OK_RESPONSE &&
          pendingRequest.expectedStatus === PARTIAL_CONTENT_RESPONSE;

      if (!ok_response_on_range_request &&
          xhrStatus !== pendingRequest.expectedStatus) {
        if (pendingRequest.onError) {
          pendingRequest.onError(xhr.status);
        }
        return;
      }

      this.loadedRequests[xhrId] = true;

      var chunk = getArrayBuffer(xhr);
      if (xhrStatus === PARTIAL_CONTENT_RESPONSE) {
        var rangeHeader = xhr.getResponseHeader("Content-Range");
        var matches = /bytes (\d+)-(\d+)\/(\d+)/.exec(rangeHeader);
        var begin = parseInt(matches[1], 10);
        pendingRequest.onDone({
          begin,
          chunk,
        });
      } else if (pendingRequest.onProgressiveData) {
        pendingRequest.onDone(null);
      } else if (chunk) {
        pendingRequest.onDone({
          begin: 0,
          chunk,
        });
      } else if (pendingRequest.onError) {
        pendingRequest.onError(xhr.status);
      }
    }

    hasPendingRequests() {
      for (var xhrId in this.pendingRequests) {
        return true;
      }
      return false;
    }

    getRequestXhr(xhrId) {
      return this.pendingRequests[xhrId].xhr;
    }

    isStreamingRequest(xhrId) {
      return !!(this.pendingRequests[xhrId].onProgressiveData);
    }

    isPendingRequest(xhrId) {
      return xhrId in this.pendingRequests;
    }

    isLoadedRequest(xhrId) {
      return xhrId in this.loadedRequests;
    }

    abortAllRequests() {
      for (var xhrId in this.pendingRequests) {
        this.abortRequest(xhrId | 0);
      }
    }

    abortRequest(xhrId) {
      var xhr = this.pendingRequests[xhrId].xhr;
      delete this.pendingRequests[xhrId];
      xhr.abort();
    }
  }

  return NetworkManagerClass;
})();
