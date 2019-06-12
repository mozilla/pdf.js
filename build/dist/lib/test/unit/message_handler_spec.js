/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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

var _util = require("../../shared/util");

var _api = require("../../display/api");

var _message_handler = require("../../shared/message_handler");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

describe('message_handler', function () {
  function sleep(ticks) {
    return Promise.resolve().then(function () {
      return ticks && sleep(ticks - 1);
    });
  }

  describe('sendWithStream', function () {
    it('should return a ReadableStream', function () {
      var port = new _api.LoopbackPort();
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler');
      expect(_typeof(readable)).toEqual('object');
      expect(_typeof(readable.getReader)).toEqual('function');
    });
    it('should read using a reader', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        sink.ready.then(function () {
          sink.enqueue('hi');
          return sink.ready;
        }).then(function () {
          sink.close();
        });
        return sleep(5);
      });
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 1,
        size: function size() {
          return 1;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('');
        return reader.read();
      }).then(function (result) {
        expect(log).toEqual('p');
        expect(result.value).toEqual('hi');
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it('should not read any data when cancelled', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        log += '0';
        sink.ready.then(function () {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(function () {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(function () {
          log += '3';
          sink.close();
        }, function () {
          log += '4';
        });
      });
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size: function size(arr) {
          return arr.length;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('01');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('01p2');
        return reader.cancel();
      }).then(function () {
        expect(log).toEqual('01p2c4');
        done();
      });
    });
    it('should not read when errored', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        sink.ready.then(function () {
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(function () {
          log += 'error';
          sink.error('error');
        });
      });
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size: function size(arr) {
          return arr.length;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return reader.read();
      }).then(function () {}, function (reason) {
        expect(reason).toEqual('error');
        done();
      });
    });
    it('should read data with blocking promise', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        log += '0';
        sink.ready.then(function () {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(function () {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(function () {
          sink.close();
        });
      });
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size: function size(arr) {
          return arr.length;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('01');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('01p2');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('01p2p');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it('should read data with blocking promise and buffer whole data' + ' into stream', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        log += '0';
        sink.ready.then(function () {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(function () {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(function () {
          sink.close();
        });
        return sleep(10);
      });
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 8,
        size: function size(arr) {
          return arr.length;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('012');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('012p');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('012p');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
    it('should ignore any pull after close is called', function (done) {
      var log = '';
      var port = new _api.LoopbackPort();
      var capability = (0, _util.createPromiseCapability)();
      var messageHandler2 = new _message_handler.MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', function (data, sink) {
        sink.onPull = function () {
          log += 'p';
        };

        sink.onCancel = function (reason) {
          log += 'c';
        };

        log += '0';
        sink.ready.then(function () {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
        });
        return capability.promise.then(function () {
          sink.close();
        });
      });
      var messageHandler1 = new _message_handler.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 10,
        size: function size(arr) {
          return arr.length;
        }
      });
      var reader = readable.getReader();
      sleep(10).then(function () {
        expect(log).toEqual('01');
        capability.resolve();
        return capability.promise.then(function () {
          return reader.read();
        });
      }).then(function (result) {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(function () {
        expect(log).toEqual('01');
        return reader.read();
      }).then(function (result) {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
  });
});