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

import { createPromiseCapability, MessageHandler } from '../../src/shared/util';

describe('util_stream', function () {
  // Temporary fake port for sending messages between main and worker.
  class FakePort {
    constructor() {
      this._listeners = [];
      this._deferred = Promise.resolve(undefined);
    }

    postMessage(obj) {
      let event = { data: obj, };
      this._deferred.then(() => {
        this._listeners.forEach(function (listener) {
          listener.call(this, event);
        }, this);
      });
    }

    addEventListener(name, listener) {
      this._listeners.push(listener);
    }

    removeEventListener(name, listener) {
      let i = this._listeners.indexOf(listener);
      this._listeners.splice(i, 1);
    }

    terminate() {
      this._listeners = [];
    }
  }

  // Sleep function to wait for sometime, similar to setTimeout but faster.
  function sleep(ticks) {
    return Promise.resolve().then(() => {
      return (ticks && sleep(ticks - 1));
    });
  }

  describe('sendWithStream', function () {
    it('should return a ReadableStream', function () {
      let port = new FakePort();
      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler');
      // Check if readable is an instance of ReadableStream.
      expect(typeof readable).toEqual('object');
      expect(typeof readable.getReader).toEqual('function');
    });

    it('should read using a reader', function (done) {
      let log = '';
      let port = new FakePort();
      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        sink.ready.then(() => {
          sink.enqueue('hi');
          return sink.ready;
        }).then(() => {
          sink.close();
        });
        return sleep(5);
      });
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 1,
        size() {
          return 1;
        },
      });
      let reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual('');
        return reader.read();
      }).then((result) => {
        expect(log).toEqual('p');
        expect(result.value).toEqual('hi');
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });

    it('should not read any data when cancelled', function (done) {
      let log = '';
      let port = new FakePort();
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        log += '0';
        sink.ready.then(() => {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          log += '3';
          sink.close();
        }, () => {
          log += '4';
        });
      });
      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size(arr) {
          return arr.length;
        },
      });

      let reader = readable.getReader();
      sleep(10).then(() => {
        expect(log).toEqual('01');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('01p2');
        return reader.cancel();
      }).then(() => {
        expect(log).toEqual('01p2c4');
        done();
      });
    });

    it('should not read when errored', function(done) {
      let log = '';
      let port = new FakePort();
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        sink.ready.then(() => {
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += 'error';
          sink.error('error');
        });
      });
      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size(arr) {
          return arr.length;
        },
      });

      let reader = readable.getReader();

      sleep(10).then(() => {
        expect(log).toEqual('');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return reader.read();
      }).then(() => {
      }, (reason) => {
        expect(reason).toEqual('error');
        done();
      });
    });

    it('should read data with blocking promise', function (done) {
      let log = '';
      let port = new FakePort();
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        log += '0';
        sink.ready.then(() => {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          sink.close();
        });
      });

      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 4,
        size(arr) {
          return arr.length;
        },
      });

      let reader = readable.getReader();
      // Sleep for 10ms, so that read() is not unblocking the ready promise.
      // Chain all read() to stream in sequence.
      sleep(10).then(() => {
        expect(log).toEqual('01');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('01p2');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('01p2p');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });

    it('should read data with blocking promise and buffer whole data' +
       ' into stream', function (done) {
      let log = '';
      let port = new FakePort();
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        log += '0';
        sink.ready.then(() => {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
          return sink.ready;
        }).then(() => {
          log += '2';
          sink.enqueue([5, 6, 7, 8], 4);
          return sink.ready;
        }).then(() => {
          sink.close();
        });
        return sleep(10);
      });

      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 8,
        size(arr) {
          return arr.length;
        },
      });

      let reader = readable.getReader();

      sleep(10).then(() => {
        expect(log).toEqual('012');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('012p');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('012p');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });

    it('should ignore any pull after close is called', function (done) {
      let log = '';
      let port = new FakePort();
      let capability = createPromiseCapability();
      let messageHandler2 = new MessageHandler('worker', 'main', port);
      messageHandler2.on('fakeHandler', (data, sink) => {
        sink.onPull = function () {
          log += 'p';
        };
        sink.onCancel = function (reason) {
          log += 'c';
        };
        log += '0';
        sink.ready.then(() => {
          log += '1';
          sink.enqueue([1, 2, 3, 4], 4);
        });
        return capability.promise.then(() => {
          sink.close();
        });
      });

      let messageHandler1 = new MessageHandler('main', 'worker', port);
      let readable = messageHandler1.sendWithStream('fakeHandler', {}, {
        highWaterMark: 10,
        size(arr) {
          return arr.length;
        },
      });

      let reader = readable.getReader();

      sleep(10).then(() => {
        expect(log).toEqual('01');
        capability.resolve();
        return capability.promise.then(() => {
          return reader.read();
        });
      }).then((result) => {
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);
        return sleep(10);
      }).then(() => {
        expect(log).toEqual('01');
        return reader.read();
      }).then((result) => {
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
        done();
      });
    });
  });
});
