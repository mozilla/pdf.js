/* Copyright 2017 Mozilla Foundation
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

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../../shared/util');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

describe('util_stream', function () {
  var FakePort = function () {
    function FakePort() {
      _classCallCheck(this, FakePort);

      this._listeners = [];
      this._deferred = Promise.resolve(undefined);
    }

    _createClass(FakePort, [{
      key: 'postMessage',
      value: function postMessage(obj) {
        var _this = this;

        var event = { data: obj };
        this._deferred.then(function () {
          _this._listeners.forEach(function (listener) {
            listener.call(this, event);
          }, _this);
        });
      }
    }, {
      key: 'addEventListener',
      value: function addEventListener(name, listener) {
        this._listeners.push(listener);
      }
    }, {
      key: 'removeEventListener',
      value: function removeEventListener(name, listener) {
        var i = this._listeners.indexOf(listener);
        this._listeners.splice(i, 1);
      }
    }, {
      key: 'terminate',
      value: function terminate() {
        this._listeners = [];
      }
    }]);

    return FakePort;
  }();

  function sleep(ticks) {
    return Promise.resolve().then(function () {
      return ticks && sleep(ticks - 1);
    });
  }
  describe('sendWithStream', function () {
    it('should return a ReadableStream', function () {
      var port = new FakePort();
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
      var readable = messageHandler1.sendWithStream('fakeHandler');
      expect(typeof readable === 'undefined' ? 'undefined' : _typeof(readable)).toEqual('object');
      expect(_typeof(readable.getReader)).toEqual('function');
    });
    it('should read using a reader', function (done) {
      var log = '';
      var port = new FakePort();
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var port = new FakePort();
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
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
      var port = new FakePort();
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
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
      var port = new FakePort();
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
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
      var port = new FakePort();
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
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
      var port = new FakePort();
      var capability = (0, _util.createPromiseCapability)();
      var messageHandler2 = new _util.MessageHandler('worker', 'main', port);
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
      var messageHandler1 = new _util.MessageHandler('main', 'worker', port);
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