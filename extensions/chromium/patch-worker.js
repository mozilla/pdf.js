/*
Copyright 2013 Rob Wu <gwnRob@gmail.com>
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
// Target: Chrome 20+

// W3-compliant Worker proxy.
// This module replaces the global Worker object.
// When invoked, the default Worker object is called.
// If this call fails with SECURITY_ERR, the script is fetched
//  using async XHR, and transparently proxies all calls and
//  setters/getters to the new Worker object.
// Note: This script does not magically circumvent the Same origin policy.

(function() {
  'use strict';
  var Worker_ = window.Worker;
  var URL = window.URL || window.webkitURL;
  // Create dummy worker for the following purposes:
  // 1. Don't override the global Worker object if the fallback isn't
  //    going to work (future API changes?)
  // 2. Use it to trigger early validation of postMessage calls
  // Note: Blob constructor is supported since Chrome 20, but since
  // some of the used Chrome APIs are only supported as of Chrome 20,
  //  I don't bother adding a BlobBuilder fallback.
  var dummyWorker = new Worker_(
      URL.createObjectURL(new Blob([], {type: 'text/javascript'})));
  window.Worker = function Worker(scriptURL) {
    if (arguments.length === 0) {
      throw new TypeError('Not enough arguments');
    }
    try {
      return new Worker_(scriptURL);
    } catch (e) {
      if (e.code === 18/*DOMException.SECURITY_ERR*/) {
        return new WorkerXHR(scriptURL);
      } else {
        throw e;
      }
    }
  };
  // Bind events and replay queued messages
  function bindWorker(worker, workerURL) {
    if (worker._terminated) {
      return;
    }
    worker.Worker = new Worker_(workerURL);
    worker.Worker.onerror = worker._onerror;
    worker.Worker.onmessage = worker._onmessage;
    var o;
    while ( (o = worker._replayQueue.shift()) ) {
      worker.Worker[o.method].apply(worker.Worker, o.arguments);
    }
    while ( (o = worker._messageQueue.shift()) ) {
      worker.Worker.postMessage.apply(worker.Worker, o);
    }
  }
  function WorkerXHR(scriptURL) {
    var worker = this;
    var x = new XMLHttpRequest();
    x.responseType = 'blob';
    x.onload = function() {
      // http://stackoverflow.com/a/10372280/938089
      var workerURL = URL.createObjectURL(x.response);
      bindWorker(worker, workerURL);
    };
    x.open('GET', scriptURL);
    x.send();
    worker._replayQueue = [];
    worker._messageQueue = [];
  }
  WorkerXHR.prototype = {
    constructor: Worker_,
    terminate: function() {
      if (!this._terminated) {
        this._terminated = true;
        if (this.Worker)
          this.Worker.terminate();
      }
    },
    postMessage: function(message, transfer) {
      if (!(this instanceof WorkerXHR))
        throw new TypeError('Illegal invocation');
      if (this.Worker) {
        this.Worker.postMessage.apply(this.Worker, arguments);
      } else {
        // Trigger validation:
        dummyWorker.postMessage(message);
        // Alright, push the valid message to the queue.
        this._messageQueue.push(arguments);
      }
    }
  };
  // Implement the EventTarget interface
  [
    'addEventListener',
    'removeEventListener',
    'dispatchEvent'
  ].forEach(function(method) {
    WorkerXHR.prototype[method] = function() {
      if (!(this instanceof WorkerXHR)) {
        throw new TypeError('Illegal invocation');
      }
      if (this.Worker) {
        this.Worker[method].apply(this.Worker, arguments);
      } else {
        this._replayQueue.push({method: method, arguments: arguments});
      }
    };
  });
  Object.defineProperties(WorkerXHR.prototype, {
    onmessage: {
      get: function() {return this._onmessage || null;},
      set: function(func) {
        this._onmessage = typeof func === 'function' ? func : null;
      }
    },
    onerror: {
      get: function() {return this._onerror || null;},
      set: function(func) {
        this._onerror = typeof func === 'function' ? func : null;
      }
    }
  });
})();
