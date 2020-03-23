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

var _util = require("../../shared/util.js");

var _api = require("../../display/api.js");

var _message_handler = require("../../shared/message_handler.js");

describe("message_handler", function () {
  function sleep(ticks) {
    return Promise.resolve().then(() => {
      return ticks && sleep(ticks - 1);
    });
  }

  describe("sendWithStream", function () {
    it("should return a ReadableStream", function () {
      const port = new _api.LoopbackPort();
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler");
      expect(typeof readable).toEqual("object");
      expect(typeof readable.getReader).toEqual("function");
    });
    it("should read using a reader", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        sink.ready.then(() => {
          sink.enqueue("hi");
          return sink.ready;
        }).then(() => {
          sink.close();
        });
        return sleep(5);
      });
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 1,

        size() {
          return 1;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("");
        return reader.read();
      }).then(result => {
        expect(log).toEqual("p");
        expect(result.value).toEqual("hi");
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it("should not read any data when cancelled", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        log += "0";
        sink.ready.then(() => {
          log += "1";
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += "2";
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          log += "3";
          sink.close();
        }, () => {
          log += "4";
        });
      });
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 4,

        size(arr) {
          return arr.length;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("01");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("01p2");
        return reader.cancel(new _util.AbortException("reader cancelled."));
      }).then(() => {
        expect(log).toEqual("01p2c4");
        done();
      });
    });
    it("should not read when errored", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        log += "0";
        sink.ready.then(() => {
          log += "1";
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += "e";
          sink.error(new Error("should not read when errored"));
        });
      });
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 4,

        size(arr) {
          return arr.length;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("01");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return reader.read();
      }).catch(reason => {
        expect(log).toEqual("01pe");
        expect(reason instanceof _util.UnknownErrorException).toEqual(true);
        expect(reason.message).toEqual("should not read when errored");
        done();
      });
    });
    it("should read data with blocking promise", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        log += "0";
        sink.ready.then(() => {
          log += "1";
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += "2";
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          sink.close();
        });
      });
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 4,

        size(arr) {
          return arr.length;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("01");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("01p2");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("01p2p");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it("should read data with blocking promise and buffer whole data" + " into stream", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        log += "0";
        sink.ready.then(() => {
          log += "1";
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += "2";
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          sink.close();
        });
        return sleep(10);
      });
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 8,

        size(arr) {
          return arr.length;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("012");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("012p");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("012p");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it("should ignore any pull after close is called", function (done) {
      let log = "";
      const port = new _api.LoopbackPort();
      const capability = (0, _util.createPromiseCapability)();
      const messageHandler2 = new _message_handler.MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };

        sink.onCancel = function (reason) {
          log += "c";
        };

        log += "0";
        sink.ready.then(() => {
          log += "1";
          sink.enqueue([1, 2, 3, 4], 4);
        });
        return capability.promise.then(() => {
          sink.close();
        });
      });
      const messageHandler1 = new _message_handler.MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler", {}, {
        highWaterMark: 10,

        size(arr) {
          return arr.length;
        }

      });
      const reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual("01");
        capability.resolve();
        return capability.promise.then(() => {
          return reader.read();
        });
      }).then(result => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual("01");
        return reader.read();
      }).then(result => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
  });
});