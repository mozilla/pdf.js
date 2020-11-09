/* Copyright 2020 Mozilla Foundation
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

import { loadScript } from "../../src/display/display_utils.js";

describe("Scripting", function () {
  let sandbox, send_queue, test_id, ref;

  function getId() {
    const id = `${ref++}R`;
    return id;
  }

  beforeAll(function (done) {
    test_id = 0;
    ref = 1;
    send_queue = new Map();
    window.dispatchEvent = event => {
      if (send_queue.has(event.detail.id)) {
        const prev = send_queue.get(event.detail.id);
        Object.assign(prev, event.detail);
      } else {
        send_queue.set(event.detail.id, event.detail);
      }
    };
    const promise = loadScript("../../build/generic/build/pdf.sandbox.js").then(
      () => {
        return window.pdfjsSandbox.QuickJSSandbox(true);
      }
    );
    sandbox = {
      createSandbox(data) {
        promise.then(sbx => sbx.create(data));
      },
      dispatchEventInSandbox(data) {
        return promise.then(sbx => sbx.dispatchEvent(data));
      },
      nukeSandbox() {
        promise.then(sbx => sbx.nukeSandbox());
      },
      eval(code, key) {
        return promise.then(sbx => sbx.evalForTesting(code, key));
      },
    };
    done();
  });

  afterAll(function () {
    sandbox.nukeSandbox();
    sandbox = null;
    send_queue = null;
  });

  describe("Sandbox", function () {
    it("should send a value, execute an action and get back a new value", function (done) {
      function compute(n) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          s += i;
        }
        return s;
      }
      const number = 123;
      const expected = ((number - 1) * number) / 2;
      const refId = getId();

      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                Keystroke: [
                  `${compute.toString()}event.value = compute(parseInt(event.value));`,
                ],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId,
          value: `${number}`,
          name: "Keystroke",
          willCommit: true,
        })
        .then(() => {
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            valueAsString: expected,
          });
          done();
        })
        .catch(done.fail);
    });
  });

  describe("Util", function () {
    function myeval(code) {
      const key = (test_id++).toString();
      return sandbox.eval(code, key).then(() => {
        return send_queue.get(key).result;
      });
    }

    beforeAll(function (done) {
      sandbox.createSandbox({
        objects: {},
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      });
      done();
    });

    describe("printd", function () {
      it("should print a date according to a format", function (done) {
        const date = `new Date("Sun Apr 15 2007 03:14:15")`;
        Promise.all([
          myeval(`util.printd(0, ${date})`).then(value => {
            expect(value).toEqual("D:20070415031415");
          }),
          myeval(`util.printd(1, ${date})`).then(value => {
            expect(value).toEqual("2007.04.15 03:14:15");
          }),
          myeval(`util.printd(2, ${date})`).then(value => {
            expect(value).toEqual("4/15/07 3:14:15 am");
          }),
          myeval(`util.printd("mmmm mmm mm m", ${date})`).then(value => {
            expect(value).toEqual("April Apr 04 4");
          }),
          myeval(`util.printd("dddd ddd dd d", ${date})`).then(value => {
            expect(value).toEqual("Sunday Sun 15 15");
          }),
        ]).then(() => done());
      });
    });

    describe("scand", function () {
      it("should parse a date according to a format", function (done) {
        const date = new Date("Sun Apr 15 2007 03:14:15");
        Promise.all([
          myeval(`util.scand(0, "D:20070415031415").toString()`).then(value => {
            expect(new Date(value)).toEqual(date);
          }),
          myeval(`util.scand(1, "2007.04.15 03:14:15").toString()`).then(
            value => {
              expect(new Date(value)).toEqual(date);
            }
          ),
          myeval(`util.scand(2, "4/15/07 3:14:15 am").toString()`).then(
            value => {
              expect(new Date(value)).toEqual(date);
            }
          ),
        ]).then(() => done());
      });
    });

    describe("printf", function () {
      it("should print some data according to a format", function (done) {
        Promise.all([
          myeval(
            `util.printf("Integer numbers: %d, %d,...", 1.234, 56.789)`
          ).then(value => {
            expect(value).toEqual("Integer numbers: 1, 56,...");
          }),
          myeval(`util.printf("Hex numbers: %x, %x,...", 1234, 56789)`).then(
            value => {
              expect(value).toEqual("Hex numbers: 4D2, DDD5,...");
            }
          ),
          myeval(
            `util.printf("Hex numbers with 0x: %#x, %#x,...", 1234, 56789)`
          ).then(value => {
            expect(value).toEqual("Hex numbers with 0x: 0x4D2, 0xDDD5,...");
          }),
          myeval(`util.printf("Decimal number: %,0+.3f", 1234567.89123)`).then(
            value => {
              expect(value).toEqual("Decimal number: +1,234,567.891");
            }
          ),
          myeval(`util.printf("Decimal number: %,0+8.3f", 1.234567)`).then(
            value => {
              expect(value).toEqual("Decimal number: +  1.235");
            }
          ),
        ]).then(() => done());
      });

      it("should print a string with no argument", function (done) {
        myeval(`util.printf("hello world")`)
          .then(value => {
            expect(value).toEqual("hello world");
          })
          .then(() => done());
      });

      it(" print a string with a percent", function (done) {
        myeval(`util.printf("%%s")`)
          .then(value => {
            expect(value).toEqual("%%s");
          })
          .then(() => done());
      });
    });

    describe("printx", function () {
      it("should print some data according to a format", function (done) {
        myeval(`util.printx("9 (999) 999-9999", "aaa14159697489zzz")`)
          .then(value => {
            expect(value).toEqual("1 (415) 969-7489");
          })
          .then(() => done());
      });
    });
  });

  describe("Events", function () {
    it("should trigger an event and modify the source", function (done) {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                test: [`event.source.value = "123";`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId,
          value: "",
          name: "test",
          willCommit: true,
        })
        .then(() => {
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "123",
          });
          done();
        })
        .catch(done.fail);
    });

    it("should trigger a Keystroke event and invalidate it", function (done) {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                Keystroke: [`event.rc = false;`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId,
          value: "hell",
          name: "Keystroke",
          willCommit: false,
          change: "o",
          selStart: 4,
          selEnd: 4,
        })
        .then(() => {
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "hell",
            selRange: [4, 4],
          });
          done();
        })
        .catch(done.fail);
    });

    it("should trigger a Keystroke event and change it", function (done) {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                Keystroke: [`event.change = "a";`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId,
          value: "hell",
          name: "Keystroke",
          willCommit: false,
          change: "o",
          selStart: 4,
          selEnd: 4,
        })
        .then(() => {
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "hella",
          });
          done();
        })
        .catch(done.fail);
    });

    it("should trigger an invalid commit Keystroke event", function (done) {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                test: [`event.rc = false;`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId,
          value: "",
          name: "test",
          willCommit: true,
        })
        .then(() => {
          expect(send_queue.has(refId)).toEqual(false);
          done();
        })
        .catch(done.fail);
    });

    it("should trigger a valid commit Keystroke event", function (done) {
      const refId1 = getId();
      const refId2 = getId();
      const data = {
        objects: {
          field1: [
            {
              id: refId1,
              value: "",
              actions: {
                Validate: [`event.value = "world";`],
              },
              type: "text",
            },
          ],
          field2: [
            {
              id: refId2,
              value: "",
              actions: {
                Calculate: [`event.value = "hello";`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [refId2],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);
      sandbox
        .dispatchEventInSandbox({
          id: refId1,
          value: "hello",
          name: "Keystroke",
          willCommit: true,
        })
        .then(() => {
          expect(send_queue.has(refId1)).toEqual(true);
          expect(send_queue.get(refId1)).toEqual({
            id: refId1,
            value: "world",
            valueAsString: "world",
          });
          done();
        })
        .catch(done.fail);
    });
  });
});
