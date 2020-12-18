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

const sandboxBundleSrc = "../../build/generic/build/pdf.sandbox.js";

describe("Scripting", function () {
  let sandbox, send_queue, test_id, ref;

  function getId() {
    const id = `${ref++}R`;
    return id;
  }

  function myeval(code) {
    const key = (test_id++).toString();
    return sandbox.eval(code, key).then(() => {
      const result = send_queue.get(key).result;
      send_queue.delete(key);
      return result;
    });
  }

  beforeAll(function (done) {
    test_id = 0;
    ref = 1;
    send_queue = new Map();
    window.dispatchEvent = event => {
      if (event.detail.command) {
        send_queue.set(event.detail.command, event.detail);
      } else if (send_queue.has(event.detail.id)) {
        const prev = send_queue.get(event.detail.id);
        Object.assign(prev, event.detail);
      } else {
        send_queue.set(event.detail.id, event.detail);
      }
    };
    window.alert = value => {
      const command = "alert";
      send_queue.set(command, { command, value });
    };
    const promise = loadScript(sandboxBundleSrc).then(() => {
      return window.pdfjsSandbox.QuickJSSandbox();
    });
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
      const expected = (((number - 1) * number) / 2).toString();
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
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

  describe("Doc", function () {
    it("should treat globalThis as the doc", async function (done) {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {},
              type: "text",
            },
          ],
        },
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);

      try {
        await myeval(`(this.foobar = 123456, 0)`);
        await myeval(`this.getField("field").doc.foobar`).then(value => {
          expect(value).toEqual(123456);
        });
        done();
      } catch (ex) {
        done.fail(ex);
      }
    });
  });

  describe("Util", function () {
    beforeAll(function (done) {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
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
          myeval(`util.printf("Decimal number: %,0.2f", -12.34567)`).then(
            value => {
              expect(value).toEqual("Decimal number: -12.35");
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

      it("print a string with a percent", function (done) {
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [refId2],
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

  describe("Color", function () {
    beforeAll(function (done) {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
      done();
    });

    function round(color) {
      return [
        color[0],
        ...color.slice(1).map(x => Math.round(x * 1000) / 1000),
      ];
    }

    it("should convert RGB color for different color spaces", function (done) {
      Promise.all([
        myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "T")`).then(value => {
          expect(round(value)).toEqual(["T"]);
        }),
        myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "G")`).then(value => {
          expect(round(value)).toEqual(["G", 0.181]);
        }),
        myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "RGB")`).then(value => {
          expect(round(value)).toEqual(["RGB", 0.1, 0.2, 0.3]);
        }),
        myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "CMYK")`).then(value => {
          expect(round(value)).toEqual(["CMYK", 0.9, 0.8, 0.7, 0.7]);
        }),
      ]).then(() => done());
    });

    it("should convert CMYK color for different color spaces", function (done) {
      Promise.all([
        myeval(`color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "T")`).then(
          value => {
            expect(round(value)).toEqual(["T"]);
          }
        ),
        myeval(`color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "G")`).then(
          value => {
            expect(round(value)).toEqual(["G", 0.371]);
          }
        ),
        myeval(`color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "RGB")`).then(
          value => {
            expect(round(value)).toEqual(["RGB", 0.5, 0.3, 0.4]);
          }
        ),
        myeval(`color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "CMYK")`).then(
          value => {
            expect(round(value)).toEqual(["CMYK", 0.1, 0.2, 0.3, 0.4]);
          }
        ),
      ]).then(() => done());
    });

    it("should convert Gray color for different color spaces", function (done) {
      Promise.all([
        myeval(`color.convert(["G", 0.1], "T")`).then(value => {
          expect(round(value)).toEqual(["T"]);
        }),
        myeval(`color.convert(["G", 0.1], "G")`).then(value => {
          expect(round(value)).toEqual(["G", 0.1]);
        }),
        myeval(`color.convert(["G", 0.1], "RGB")`).then(value => {
          expect(round(value)).toEqual(["RGB", 0.1, 0.1, 0.1]);
        }),
        myeval(`color.convert(["G", 0.1], "CMYK")`).then(value => {
          expect(round(value)).toEqual(["CMYK", 0, 0, 0, 0.9]);
        }),
      ]).then(() => done());
    });

    it("should convert Transparent color for different color spaces", function (done) {
      Promise.all([
        myeval(`color.convert(["T"], "T")`).then(value => {
          expect(round(value)).toEqual(["T"]);
        }),
        myeval(`color.convert(["T"], "G")`).then(value => {
          expect(round(value)).toEqual(["G", 0]);
        }),
        myeval(`color.convert(["T"], "RGB")`).then(value => {
          expect(round(value)).toEqual(["RGB", 0, 0, 0]);
        }),
        myeval(`color.convert(["T"], "CMYK")`).then(value => {
          expect(round(value)).toEqual(["CMYK", 0, 0, 0, 1]);
        }),
      ]).then(() => done());
    });
  });

  describe("App", function () {
    beforeAll(function (done) {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
      done();
    });

    it("should test language", function (done) {
      Promise.all([
        myeval(`app.language`).then(value => {
          expect(value).toEqual("ENU");
        }),
        myeval(`app.language = "hello"`).then(value => {
          expect(value).toEqual("app.language is read-only");
        }),
      ]).then(() => done());
    });

    it("should test platform", function (done) {
      Promise.all([
        myeval(`app.platform`).then(value => {
          expect(value).toEqual("UNIX");
        }),
        myeval(`app.platform = "hello"`).then(value => {
          expect(value).toEqual("app.platform is read-only");
        }),
      ]).then(() => done());
    });
  });

  describe("AForm", function () {
    beforeAll(function (done) {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      });
      done();
    });

    describe("AFExtractNums", function () {
      it("should extract numbers", function (done) {
        Promise.all([
          myeval(`AFExtractNums("123 456 789")`).then(value => {
            expect(value).toEqual(["123", "456", "789"]);
          }),
          myeval(`AFExtractNums("123.456")`).then(value => {
            expect(value).toEqual(["123", "456"]);
          }),
          myeval(`AFExtractNums("123")`).then(value => {
            expect(value).toEqual(["123"]);
          }),
          myeval(`AFExtractNums(".123")`).then(value => {
            expect(value).toEqual(["0", "123"]);
          }),
          myeval(`AFExtractNums(",123")`).then(value => {
            expect(value).toEqual(["0", "123"]);
          }),
        ]).then(() => done());
      });
    });

    describe("AFMakeNumber", function () {
      it("should convert string to number", function (done) {
        Promise.all([
          myeval(`AFMakeNumber("123.456")`).then(value => {
            expect(value).toEqual(123.456);
          }),
          myeval(`AFMakeNumber(123.456)`).then(value => {
            expect(value).toEqual(123.456);
          }),
          myeval(`AFMakeNumber("-123.456")`).then(value => {
            expect(value).toEqual(-123.456);
          }),
          myeval(`AFMakeNumber("-123,456")`).then(value => {
            expect(value).toEqual(-123.456);
          }),
          myeval(`AFMakeNumber("not a number")`).then(value => {
            expect(value).toEqual(null);
          }),
        ]).then(() => done());
      });
    });

    describe("AFMakeArrayFromList", function () {
      it("should split a string into an array of strings", async function (done) {
        const value = await myeval(
          `AFMakeArrayFromList("aaaa,  bbbbbbb,cc,ddd, e")`
        );
        expect(value).toEqual(["aaaa", " bbbbbbb", "cc", "ddd", "e"]);
        done();
      });
    });

    describe("AFNumber_format", function () {
      it("should format a number", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  test1: [
                    `AFNumber_Format(2, 0, 0, 0, "€", false);` +
                      `event.source.value = event.value;`,
                  ],
                  test2: [
                    `AFNumber_Format(1, 3, 0, 0, "$", true);` +
                      `event.source.value = event.value;`,
                  ],
                  test3: [
                    `AFNumber_Format(2, 0, 1, 0, "€", false);` +
                      `event.source.value = event.value;`,
                  ],
                  test4: [
                    `AFNumber_Format(2, 0, 2, 0, "€", false);` +
                      `event.source.value = event.value;`,
                  ],
                  test5: [
                    `AFNumber_Format(2, 0, 3, 0, "€", false);` +
                      `event.source.value = event.value;`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "123456.789",
            name: "test1",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "123,456.79€",
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "223456.789",
            name: "test2",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "$223456,8",
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "-323456.789",
            name: "test3",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "323,456.79€",
            textColor: ["RGB", 1, 0, 0],
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "-423456.789",
            name: "test4",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "(423,456.79€)",
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "-52345.678",
            name: "test5",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "(52,345.68€)",
            textColor: ["RGB", 1, 0, 0],
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("AFNumber_Keystroke", function () {
      it("should validate a number on a keystroke event", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Validate: [
                    `AFNumber_Keystroke(null, 0, null, null, null, null);`,
                  ],
                },
                type: "text",
                name: "MyField",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "123456.789",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "123456.789",
            valueAsString: "123456.789",
          });
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });

      it("should not validate a number on a keystroke event", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Validate: [
                    `AFNumber_Keystroke(null, 0, null, null, null, null);`,
                  ],
                },
                type: "text",
                name: "MyField",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "123s456.789",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has("alert")).toEqual(true);
          expect(send_queue.get("alert")).toEqual({
            command: "alert",
            value: "Invalid number in [ MyField ]",
          });
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("AFPercent_Format", function () {
      it("should format a percentage", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  test1: [
                    `AFPercent_Format(2, 1, false);` +
                      `event.source.value = event.value;`,
                  ],
                  test2: [
                    `AFPercent_Format(2, 1, true);` +
                      `event.source.value = event.value;`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "0.456789",
            name: "test1",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "45.68%",
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "0.456789",
            name: "test2",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "%45.68",
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("AFDate_Format", function () {
      it("should format a date", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  test1: [`AFDate_Format(0);event.source.value = event.value;`],
                  test2: [
                    `AFDate_Format(12);event.source.value = event.value;`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "Sun Apr 15 2007 03:14:15",
            name: "test1",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "4/15",
          });
          send_queue.delete(refId);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "Sun Apr 15 2007 03:14:15",
            name: "test2",
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "4/15/07 3:14 am",
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("AFRange_Validate", function () {
      it("should validate a number in range [a, b]", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Validate: [`AFRange_Validate(true, 123, true, 456);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "321",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "321",
            valueAsString: "321",
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });

      it("should invalidate a number out of range [a, b]", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Validate: [`AFRange_Validate(true, 123, true, 456);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "12",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has("alert")).toEqual(true);
          expect(send_queue.get("alert")).toEqual({
            command: "alert",
            value: "12 is not between 123 and 456",
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("ASSimple_Calculate", function () {
      it("should compute the sum of several fields", async function (done) {
        const refIds = [0, 1, 2, 3].map(_ => getId());
        const data = {
          objects: {
            field1: [
              {
                id: refIds[0],
                value: "",
                actions: {},
                type: "text",
              },
            ],
            field2: [
              {
                id: refIds[1],
                value: "",
                actions: {},
                type: "text",
              },
            ],
            field3: [
              {
                id: refIds[2],
                value: "",
                actions: {},
                type: "text",
              },
            ],
            field4: [
              {
                id: refIds[3],
                value: "",
                actions: {
                  Calculate: [
                    `AFSimple_Calculate("SUM", ["field1", "field2", "field3"]);`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [refIds[3]],
          dispatchEventName: "_dispatchMe",
        };

        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refIds[0],
            value: "1",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has(refIds[3])).toEqual(true);
          expect(send_queue.get(refIds[3])).toEqual({
            id: refIds[3],
            value: 1,
            valueAsString: "1",
          });

          await sandbox.dispatchEventInSandbox({
            id: refIds[1],
            value: "2",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has(refIds[3])).toEqual(true);
          expect(send_queue.get(refIds[3])).toEqual({
            id: refIds[3],
            value: 3,
            valueAsString: "3",
          });

          await sandbox.dispatchEventInSandbox({
            id: refIds[2],
            value: "3",
            name: "Keystroke",
            willCommit: true,
          });
          expect(send_queue.has(refIds[3])).toEqual(true);
          expect(send_queue.get(refIds[3])).toEqual({
            id: refIds[3],
            value: 6,
            valueAsString: "6",
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("AFSpecial_KeystrokeEx", function () {
      it("should validate a phone number on a keystroke event", async function (done) {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_KeystrokeEx("9AXO");`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        try {
          sandbox.createSandbox(data);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "",
            change: "3",
            name: "Keystroke",
            willCommit: false,
            selStart: 0,
            selEnd: 0,
          });
          expect(send_queue.has(refId)).toEqual(false);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "3",
            change: "F",
            name: "Keystroke",
            willCommit: false,
            selStart: 1,
            selEnd: 1,
          });
          expect(send_queue.has(refId)).toEqual(false);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "3F",
            change: "?",
            name: "Keystroke",
            willCommit: false,
            selStart: 2,
            selEnd: 2,
          });
          expect(send_queue.has(refId)).toEqual(false);

          await sandbox.dispatchEventInSandbox({
            id: refId,
            value: "3F?",
            change: "@",
            name: "Keystroke",
            willCommit: false,
            selStart: 3,
            selEnd: 3,
          });
          expect(send_queue.has(refId)).toEqual(true);
          expect(send_queue.get(refId)).toEqual({
            id: refId,
            value: "3F?",
            selRange: [3, 3],
          });

          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    describe("eMailValidate", function () {
      it("should validate an e-mail address", function (done) {
        Promise.all([
          myeval(`eMailValidate(123)`).then(value => {
            expect(value).toEqual(false);
          }),
          myeval(`eMailValidate("foo@bar.com")`).then(value => {
            expect(value).toEqual(true);
          }),
          myeval(`eMailValidate("foo bar")`).then(value => {
            expect(value).toEqual(false);
          }),
        ]).then(() => done());
      });
    });
  });
});
