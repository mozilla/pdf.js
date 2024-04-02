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

import {
  AbortException,
  UnknownErrorException,
} from "../../src/shared/util.js";
import { LoopbackPort } from "../../src/display/api.js";
import { MessageHandler } from "../../src/shared/message_handler.js";

describe("message_handler", function () {
  // Sleep function to wait for sometime, similar to setTimeout but faster.
  function sleep(ticks) {
    return Promise.resolve().then(() => ticks && sleep(ticks - 1));
  }

  describe("sendWithStream", function () {
    it("should return a ReadableStream", function () {
      const port = new LoopbackPort();
      const messageHandler1 = new MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream("fakeHandler");
      // Check if readable is an instance of ReadableStream.
      expect(typeof readable).toEqual("object");
      expect(typeof readable.getReader).toEqual("function");
    });

    it("should read using a reader", async function () {
      let log = "";
      const port = new LoopbackPort();
      const messageHandler1 = new MessageHandler("main", "worker", port);
      const messageHandler2 = new MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };
        sink.onCancel = function (reason) {
          log += "c";
        };
        sink.ready
          .then(() => {
            sink.enqueue("hi");
            return sink.ready;
          })
          .then(() => {
            sink.close();
          });
        return sleep(5);
      });
      const readable = messageHandler1.sendWithStream(
        "fakeHandler",
        {},
        {
          highWaterMark: 1,
          size() {
            return 1;
          },
        }
      );

      const reader = readable.getReader();
      await sleep(10);
      expect(log).toEqual("");

      let result = await reader.read();
      expect(log).toEqual("p");
      expect(result.value).toEqual("hi");
      expect(result.done).toEqual(false);

      await sleep(10);
      result = await reader.read();
      expect(result.value).toEqual(undefined);
      expect(result.done).toEqual(true);
    });

    it("should not read any data when cancelled", async function () {
      let log = "";
      const port = new LoopbackPort();
      const messageHandler2 = new MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };
        sink.onCancel = function (reason) {
          log += "c";
        };
        log += "0";
        sink.ready
          .then(() => {
            log += "1";
            sink.enqueue([1, 2, 3, 4], 4);
            return sink.ready;
          })
          .then(() => {
            log += "2";
            sink.enqueue([5, 6, 7, 8], 4);
            return sink.ready;
          })
          .then(
            () => {
              log += "3";
              sink.close();
            },
            () => {
              log += "4";
            }
          );
      });
      const messageHandler1 = new MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream(
        "fakeHandler",
        {},
        {
          highWaterMark: 4,
          size(arr) {
            return arr.length;
          },
        }
      );

      const reader = readable.getReader();
      await sleep(10);
      expect(log).toEqual("01");

      const result = await reader.read();
      expect(result.value).toEqual([1, 2, 3, 4]);
      expect(result.done).toEqual(false);

      await sleep(10);
      expect(log).toEqual("01p2");

      await reader.cancel(new AbortException("reader cancelled."));
      expect(log).toEqual("01p2c4");
    });

    it("should not read when errored", async function () {
      let log = "";
      const port = new LoopbackPort();
      const messageHandler2 = new MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };
        sink.onCancel = function (reason) {
          log += "c";
        };
        log += "0";
        sink.ready
          .then(() => {
            log += "1";
            sink.enqueue([1, 2, 3, 4], 4);
            return sink.ready;
          })
          .then(() => {
            log += "e";
            sink.error(new Error("should not read when errored"));
          });
      });
      const messageHandler1 = new MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream(
        "fakeHandler",
        {},
        {
          highWaterMark: 4,
          size(arr) {
            return arr.length;
          },
        }
      );

      const reader = readable.getReader();
      await sleep(10);
      expect(log).toEqual("01");

      const result = await reader.read();
      expect(result.value).toEqual([1, 2, 3, 4]);
      expect(result.done).toEqual(false);

      try {
        await reader.read();

        // Shouldn't get here.
        expect(false).toEqual(true);
      } catch (reason) {
        expect(log).toEqual("01pe");
        expect(reason instanceof UnknownErrorException).toEqual(true);
        expect(reason.message).toEqual("should not read when errored");
      }
    });

    it("should read data with blocking promise", async function () {
      let log = "";
      const port = new LoopbackPort();
      const messageHandler2 = new MessageHandler("worker", "main", port);
      messageHandler2.on("fakeHandler", (data, sink) => {
        sink.onPull = function () {
          log += "p";
        };
        sink.onCancel = function (reason) {
          log += "c";
        };
        log += "0";
        sink.ready
          .then(() => {
            log += "1";
            sink.enqueue([1, 2, 3, 4], 4);
            return sink.ready;
          })
          .then(() => {
            log += "2";
            sink.enqueue([5, 6, 7, 8], 4);
            return sink.ready;
          })
          .then(() => {
            sink.close();
          });
      });

      const messageHandler1 = new MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream(
        "fakeHandler",
        {},
        {
          highWaterMark: 4,
          size(arr) {
            return arr.length;
          },
        }
      );

      const reader = readable.getReader();
      // Sleep for 10ms, so that read() is not unblocking the ready promise.
      // Chain all read() to stream in sequence.
      await sleep(10);
      expect(log).toEqual("01");

      let result = await reader.read();
      expect(result.value).toEqual([1, 2, 3, 4]);
      expect(result.done).toEqual(false);

      await sleep(10);
      expect(log).toEqual("01p2");

      result = await reader.read();
      expect(result.value).toEqual([5, 6, 7, 8]);
      expect(result.done).toEqual(false);

      await sleep(10);
      expect(log).toEqual("01p2p");

      result = await reader.read();
      expect(result.value).toEqual(undefined);
      expect(result.done).toEqual(true);
    });

    it(
      "should read data with blocking promise and buffer whole data" +
        " into stream",
      async function () {
        let log = "";
        const port = new LoopbackPort();
        const messageHandler2 = new MessageHandler("worker", "main", port);
        messageHandler2.on("fakeHandler", (data, sink) => {
          sink.onPull = function () {
            log += "p";
          };
          sink.onCancel = function (reason) {
            log += "c";
          };
          log += "0";
          sink.ready
            .then(() => {
              log += "1";
              sink.enqueue([1, 2, 3, 4], 4);
              return sink.ready;
            })
            .then(() => {
              log += "2";
              sink.enqueue([5, 6, 7, 8], 4);
              return sink.ready;
            })
            .then(() => {
              sink.close();
            });
          return sleep(10);
        });

        const messageHandler1 = new MessageHandler("main", "worker", port);
        const readable = messageHandler1.sendWithStream(
          "fakeHandler",
          {},
          {
            highWaterMark: 8,
            size(arr) {
              return arr.length;
            },
          }
        );

        const reader = readable.getReader();
        await sleep(10);
        expect(log).toEqual("012");

        let result = await reader.read();
        expect(result.value).toEqual([1, 2, 3, 4]);
        expect(result.done).toEqual(false);

        await sleep(10);
        expect(log).toEqual("012p");

        result = await reader.read();
        expect(result.value).toEqual([5, 6, 7, 8]);
        expect(result.done).toEqual(false);

        await sleep(10);
        expect(log).toEqual("012p");

        result = await reader.read();
        expect(result.value).toEqual(undefined);
        expect(result.done).toEqual(true);
      }
    );

    it("should ignore any pull after close is called", async function () {
      let log = "";
      const port = new LoopbackPort();
      const { promise, resolve } = Promise.withResolvers();
      const messageHandler2 = new MessageHandler("worker", "main", port);
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
        return promise.then(() => {
          sink.close();
        });
      });

      const messageHandler1 = new MessageHandler("main", "worker", port);
      const readable = messageHandler1.sendWithStream(
        "fakeHandler",
        {},
        {
          highWaterMark: 10,
          size(arr) {
            return arr.length;
          },
        }
      );

      const reader = readable.getReader();
      await sleep(10);
      expect(log).toEqual("01");

      resolve();
      await promise;

      let result = await reader.read();
      expect(result.value).toEqual([1, 2, 3, 4]);
      expect(result.done).toEqual(false);

      await sleep(10);
      expect(log).toEqual("01");

      result = await reader.read();
      expect(result.value).toEqual(undefined);
      expect(result.done).toEqual(true);
    });
  });
});
