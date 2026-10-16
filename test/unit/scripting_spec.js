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

const sandboxBundleSrc = "../../build/generic/build/pdf.sandbox.mjs";

describe("Scripting", function () {
  let sandbox, send_queue, test_id, ref, windowAlert;

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

  beforeAll(function () {
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
    windowAlert = window.alert;
    window.alert = value => {
      const command = "alert";
      send_queue.set(command, { command, value });
    };
    // eslint-disable-next-line no-unsanitized/method
    const promise = import(sandboxBundleSrc).then(pdfjsSandbox =>
      pdfjsSandbox.QuickJSSandbox()
    );
    sandbox = {
      createSandbox(data) {
        promise.then(sbx => sbx.create(data));
      },
      dispatchEventInSandbox: data =>
        promise.then(sbx => sbx.dispatchEvent(data)),
      nukeSandbox() {
        promise.then(sbx => sbx.nukeSandbox());
      },
      eval: (code, key) => promise.then(sbx => sbx.evalForTesting(code, key)),
    };
  });

  afterAll(function () {
    sandbox.nukeSandbox();
    sandbox = null;
    send_queue = null;
    window.alert = windowAlert;
    windowAlert = test_id = ref = null;
  });

  describe("Sandbox", function () {
    it("should send a value, execute an action and get back a new value", async () => {
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
        appInfo: { language: "en-US", platform: "Linux x86_64" },
      };
      sandbox.createSandbox(data);
      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: `${number}`,
        name: "Keystroke",
        willCommit: true,
      });
      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        siblings: null,
        value: expected,
        formattedValue: null,
      });
    });

    it("should keep using the original global evaluator", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                replaceEval: [`globalThis.eval = () => { throw null; };`],
                updateField: [`event.source.value = "updated";`],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
      });

      await sandbox.dispatchEventInSandbox({ id: refId, name: "replaceEval" });
      await sandbox.dispatchEventInSandbox({ id: refId, name: "updateField" });
      expect(send_queue.get(refId)).toEqual({ id: refId, value: "updated" });
    });

    it("should check the radio button matching the field value", async () => {
      const refIds = [getId(), getId()];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            {
              id: refIds[0],
              value: "Second",
              exportValues: "First",
              actions: {},
              type: "radiobutton",
            },
            {
              id: refIds[1],
              exportValues: "Second",
              actions: {},
              type: "radiobutton",
            },
          ],
        },
        calculationOrder: [],
      });

      const value = await myeval(
        `[0, 1].map(i => getField("radio").isBoxChecked(i))`
      );
      expect(value).toEqual([false, true]);
    });

    it("should report unchecked radio buttons and checkboxes", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            {
              id: getId(),
              value: "Off",
              exportValues: "First",
              actions: {},
              type: "radiobutton",
            },
            {
              id: getId(),
              exportValues: "Second",
              actions: {},
              type: "radiobutton",
            },
          ],
          checkbox: [
            { id: getId(), exportValues: "Yes", actions: {}, type: "checkbox" },
          ],
        },
        calculationOrder: [],
      });

      const value = await myeval(
        `["radio", "checkbox"].map(name => getField(name).isBoxChecked(0))`
      );
      expect(value).toEqual([false, false]);
    });

    it("should ignore invalid widget indices", async () => {
      const refIds = [getId(), getId(), getId()];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            {
              id: refIds[0],
              value: "First",
              exportValues: "First",
              actions: {},
              type: "radiobutton",
            },
            {
              id: refIds[1],
              exportValues: "Second",
              actions: {},
              type: "radiobutton",
            },
          ],
          checkbox: [
            {
              id: refIds[2],
              value: "Yes",
              exportValues: "Yes",
              actions: {},
              type: "checkbox",
            },
          ],
        },
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const radio = getField("radio");
        const checkbox = getField("checkbox");
        for (const index of [0.5, NaN, "abc", "01", -1, 2, undefined]) {
          radio.checkThisBox(index);
          checkbox.checkThisBox(index, false);
        }
        return [
          radio.value,
          checkbox.value,
          radio.isBoxChecked(0.5),
          radio.isDefaultChecked(0.5),
          radio.isBoxChecked("0"),
        ];
      })()`);
      expect(value).toEqual(["First", "Yes", false, false, true]);
      for (const id of refIds) {
        expect(send_queue.has(id)).toBeFalse();
      }
    });

    it("should run each radio widget's PageOpen and PageClose action chains", async () => {
      // Each event uses its own globals.
      const radio = (exportValues, page, chain) => ({
        id: getId(),
        value: "A",
        exportValues,
        page,
        actions: { PageOpen: chain("Open"), PageClose: chain("Close") },
        type: "radiobutton",
      });
      const increment = e => [
        `globalThis.m${e} = (globalThis.m${e} || 0) + 1;`,
      ];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            // Chains with the same first script.
            radio("A", 0, e => [
              `globalThis.n${e} = 0;`,
              `globalThis.n${e} += 1;`,
            ]),
            radio("B", 0, e => [
              `globalThis.n${e} = 0;`,
              `globalThis.n${e} += 2;`,
            ]),
            // Identical chains.
            radio("C", 1, increment),
            radio("D", 1, increment),
          ],
        },
        calculationOrder: [],
      });

      for (const name of ["PageOpen", "PageClose"]) {
        for (const pageNumber of [1, 2]) {
          await sandbox.dispatchEventInSandbox({
            id: "page",
            name,
            pageNumber,
            actions: {},
          });
        }
      }
      expect(
        await myeval(`[
          globalThis.nOpen,
          globalThis.mOpen,
          globalThis.nClose,
          globalThis.mClose,
        ]`)
      ).toEqual([2, 2, 2, 2]);
    });

    it("should run widget PageOpen and PageClose actions even when they match the field's", async () => {
      const increment = e => `globalThis.n${e} = (globalThis.n${e} || 0) + 1;`;
      const actions = {
        PageOpen: [increment("Open")],
        PageClose: [increment("Close")],
      };
      const refIds = [0, 1, 2].map(_ => getId());
      const radio = (id, exportValues) => ({
        id,
        value: "A",
        exportValues,
        page: 0,
        actions,
        type: "radiobutton",
      });
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            // Parent field with the same action chains.
            {
              id: refIds[0],
              type: "",
              kidIds: refIds.slice(1),
              actions,
            },
            radio(refIds[1], "A"),
            radio(refIds[2], "B"),
          ],
        },
        calculationOrder: [],
      });

      for (const name of ["PageOpen", "PageClose"]) {
        await sandbox.dispatchEventInSandbox({
          id: "page",
          name,
          pageNumber: 1,
          actions: {},
        });
      }
      expect(await myeval(`[globalThis.nOpen, globalThis.nClose]`)).toEqual([
        2, 2,
      ]);
    });

    it("should uncheck a checkbox set to a non-export value", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          checkbox: [
            {
              id: refId,
              value: "Yes",
              exportValues: "Yes",
              actions: {},
              type: "checkbox",
            },
          ],
        },
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const checkbox = getField("checkbox");
        checkbox.value = "0";
        return [checkbox.value, checkbox.isBoxChecked(0)];
      })()`);
      expect(value).toEqual(["Off", false]);
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        siblings: [],
        value: "Off",
      });
    });

    it("should report checkbox defaults independently of current values", async () => {
      const checkbox = (value, defaultValue) => [
        {
          id: getId(),
          value,
          defaultValue,
          exportValues: "Yes",
          actions: {},
          type: "checkbox",
        },
      ];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: { off: checkbox("Yes", "Off"), on: checkbox("Off", "Yes") },
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const off = getField("off");
        const on = getField("on");
        const before = [off.isDefaultChecked(0), on.isDefaultChecked(0)];
        off.value = "Off";
        on.value = "Yes";
        return [
          ...before,
          off.isDefaultChecked(0),
          off.isDefaultChecked(0.5),
          on.isDefaultChecked(0),
          on.isDefaultChecked(1),
        ];
      })()`);
      expect(value).toEqual([false, true, false, false, true, false]);
    });

    it("should let scripts declare variables named like internal ones", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
      const names = [
        "AForm",
        "App",
        "Border",
        "Color",
        "Console",
        "Doc",
        "Field",
        "Util",
        "initSandbox",
      ];

      const types = await myeval(
        `[${names.map(name => `typeof ${name}`).join(", ")}]`
      );
      expect(types).toEqual(names.map(() => "undefined"));

      const value = await myeval(
        `globalThis.eval("${names.map(name => `var ${name} = 1;`).join(" ")} 123")`
      );
      expect(value).toEqual(123);
    });

    it("should select the items of a choice field by index", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          list: [
            {
              id: refId,
              value: "A",
              items: Array.from("abcdefghijk", c => ({
                displayValue: c,
                exportValue: c.toUpperCase(),
              })),
              actions: {},
              type: "listbox",
            },
          ],
        },
        calculationOrder: [],
      });

      await myeval(`(getField("list").currentValueIndices = 1, 0)`);
      expect(send_queue.get(refId).indices).toEqual([1]);
      expect(await myeval(`getField("list").value`)).toEqual("B");

      await myeval(`(getField("list").multipleSelection = true, 0)`);
      await myeval(`(getField("list").currentValueIndices = [10, 2], 0)`);
      expect(send_queue.get(refId).indices).toEqual([2, 10]);
      expect(await myeval(`getField("list").value`)).toEqual(["C", "K"]);
    });

    it("should expose scripting constants globally", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });

      const value = await myeval(`[
        globalThis.border === border, border.s,
        globalThis.cursor === cursor, cursor.hidden,
        globalThis.display === display, display.noView,
        globalThis.font === font, font.Helv,
        globalThis.highlight === highlight, highlight.p,
        globalThis.position === position, position.overlay,
        globalThis.scaleHow === scaleHow, scaleHow.proportional,
        globalThis.scaleWhen === scaleWhen, scaleWhen.tooBig,
        globalThis.style === style, style.ch,
        globalThis.trans === trans, trans.replace,
        globalThis.zoomtype === zoomtype, zoomtype.fitP,
        globalThis.ADBE === ADBE, ADBE.Reader_Value_Asked,
        typeof IDS_INVALID_VALUE, RE_ZIP_COMMIT[0],
      ]`);
      expect(value).toEqual([
        true,
        "solid",
        true,
        1,
        true,
        3,
        true,
        "Helvetica",
        true,
        "push",
        true,
        6,
        true,
        0,
        true,
        2,
        true,
        "check",
        true,
        "Replace",
        true,
        "FitPage",
        true,
        true,
        "string",
        "\\d{5}",
      ]);
    });

    it("should send cleared values and sibling IDs for grouped buttons", async () => {
      const radioIds = [getId(), getId()];
      const checkboxIds = [getId(), getId()];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          radio: [
            {
              id: radioIds[0],
              value: "First",
              exportValues: "First",
              actions: {},
              type: "radiobutton",
            },
            {
              id: radioIds[1],
              exportValues: "Second",
              actions: {},
              type: "radiobutton",
            },
          ],
          checkbox: [
            {
              id: checkboxIds[0],
              value: "Yes",
              exportValues: "Yes",
              actions: {},
              type: "checkbox",
            },
            {
              id: checkboxIds[1],
              exportValues: "Other",
              actions: {},
              type: "checkbox",
            },
          ],
        },
        calculationOrder: [],
      });

      await myeval(`getField("radio").value = null`);
      expect(send_queue.get(radioIds[0])).toEqual({
        id: radioIds[0],
        siblings: [radioIds[1]],
        value: "",
      });

      await myeval(`getField("checkbox").value = "Off"`);
      expect(send_queue.get(checkboxIds[0])).toEqual({
        id: checkboxIds[0],
        siblings: [checkboxIds[1]],
        value: "Off",
      });
    });

    it("should support custom valueOf and Number prototype methods", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        function Num(v) { this.v = v; }
        Num.prototype.valueOf = function () { return this.v; };
        Number.prototype.formatMoney = function () { return "$" + this; };
        return [new Num(5) + 1, (7).formatMoney()];
      })()`);
      expect(value).toEqual([6, "$7"]);
    });

    it("should call detached app, color, console and util methods", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const { clearTimeOut, setTimeOut } = app;
        clearTimeOut(setTimeOut("0", 100000));
        const { equal } = color;
        const { println } = console;
        println("Hello");
        const { scand } = util;
        return [
          equal(color.black, ["RGB", 0, 0, 0]),
          scand("yyyy", "2020").getFullYear(),
        ];
      })()`);
      expect(value).toEqual([true, 2020]);
      expect(send_queue.get("println")).toEqual({
        command: "println",
        value: "PDF.js Console:: Hello",
      });
    });

    it("should send display and value updates for descendant fields", async () => {
      const refIds = [0, 1, 2, 3].map(_ => getId());
      const text = id => ({ id, value: "", actions: {}, type: "text" });
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          A: [{ id: refIds[0], type: "", kidIds: [refIds[1], refIds[2]] }],
          "A.B": [text(refIds[1])],
          "A.C": [{ id: refIds[2], type: "", kidIds: [refIds[3]] }],
          "A.C.D": [text(refIds[3])],
        },
        calculationOrder: [],
      });

      await myeval(
        `(getField("A").display = display.hidden, getField("A").value = "a", 0)`
      );
      for (const id of [refIds[1], refIds[3]]) {
        expect(send_queue.get(id)).toEqual({ id, display: 1, value: "a" });
      }
      expect(send_queue.has(refIds[0])).toBeFalse();
      expect(send_queue.has(refIds[2])).toBeFalse();
    });

    it("should propagate textSize, defaultValue and selection indices to descendants", async () => {
      const refIds = [0, 1, 2, 3, 4].map(_ => getId());
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          A: [{ id: refIds[0], type: "", kidIds: [refIds[1], refIds[2]] }],
          "A.B": [
            {
              id: refIds[1],
              value: "",
              defaultValue: "",
              actions: {},
              type: "text",
            },
          ],
          "A.C": [
            {
              id: refIds[2],
              value: "a",
              items: [
                { displayValue: "a", exportValue: "a" },
                { displayValue: "b", exportValue: "b" },
              ],
              actions: {},
              type: "listbox",
            },
          ],
          D: [{ id: refIds[3], type: "", kidIds: [refIds[4]] }],
          "D.E": [{ id: refIds[4], value: "", actions: {}, type: "text" }],
        },
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const field = getField("A");
        field.textSize = 12;
        field.defaultValue = "hello";
        field.currentValueIndices = 1;
        getField("D").textSize = 7;
        resetForm(["A.B"]);
        return [
          getField("A.B").textSize,
          getField("A.B").value,
          getField("A.C").value,
          getField("D.E").textSize,
          field.textSize,
          Object.keys(field).includes("textSize"),
        ];
      })()`);
      expect(value).toEqual([12, "hello", "b", 7, 12, true]);
    });

    it("should handle ResetForm without sending field updates", async () => {
      const refIds = [0, 1, 2].map(_ => getId());
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          combo: [
            {
              id: refIds[0],
              value: "B",
              defaultValue: null,
              items: [
                { displayValue: "A", exportValue: "A" },
                { displayValue: "B", exportValue: "B" },
              ],
              actions: {},
              type: "combobox",
            },
          ],
          radio: [
            {
              id: refIds[1],
              value: "Second",
              defaultValue: "First",
              exportValues: "First",
              actions: {},
              type: "radiobutton",
            },
            {
              id: refIds[2],
              exportValues: "Second",
              actions: {},
              type: "radiobutton",
            },
          ],
        },
        calculationOrder: [],
      });

      await sandbox.dispatchEventInSandbox({
        id: "app",
        name: "ResetForm",
        ids: refIds,
      });
      for (const id of refIds) {
        expect(send_queue.has(id)).toBeFalse();
      }
      const value = await myeval(`[
        getField("combo").value,
        getField("combo").currentValueIndices,
        getField("radio").value,
        getField("radio").isBoxChecked(0),
      ]`);
      expect(value).toEqual(["B", 1, "First", true]);
    });

    it("should send list box multipleSelection changes", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          list: [
            {
              id: refId,
              value: "A",
              items: [
                { displayValue: "a", exportValue: "A" },
                { displayValue: "b", exportValue: "B" },
              ],
              actions: {},
              type: "listbox",
            },
          ],
        },
        calculationOrder: [],
      });

      await myeval(`(getField("list").multipleSelection = true, 0)`);
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        multipleSelection: true,
      });
    });
  });

  describe("Doc", function () {
    it("should treat globalThis as the doc", async () => {
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

      await myeval(`(this.foobar = 123456, 0)`);
      const value = await myeval(`this.getField("field").doc.foobar`);
      expect(value).toEqual(123456);
    });

    it("should get field using a path", async () => {
      const base = value => ({
        id: getId(),
        value,
        actions: {},
        type: "text",
      });
      const data = {
        objects: {
          A: [base(1)],
          "A.B": [base(2)],
          "A.B.C": [base(3)],
          "A.B.C.D": [base(4)],
          "A.B.C.D.E": [base(5)],
          "A.B.C.D.E.F": [base(6)],
          "A.B.C.D.G": [base(7)],
          C: [base(8)],
        },
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);

      let value = await myeval(`this.getField("A").value`);
      expect(value).toEqual(1);

      value = await myeval(`this.getField("B.C").value`);
      expect(value).toEqual(3);

      // path has been cached so try again
      value = await myeval(`this.getField("B.C").value`);
      expect(value).toEqual(3);

      value = await myeval(`this.getField("B.C.D#0").value`);
      expect(value).toEqual(5);

      value = await myeval(`this.getField("B.C.D#1").value`);
      expect(value).toEqual(7);

      value = await myeval(`this.getField("C").value`);
      expect(value).toEqual(8);

      value = await myeval(
        `this.getField("A.B.C.D").getArray().map((x) => x.value)`
      );
      expect(value).toEqual([4, 5, 6, 7]);
    });

    it("should reset the descendants of a non-terminal field", async () => {
      const refIds = [0, 1, 2, 3, 4].map(_ => getId());
      const text = id => ({
        id,
        value: "",
        defaultValue: "",
        actions: {},
        type: "text",
      });
      const data = {
        objects: {
          A: [{ id: refIds[0], type: "", kidIds: [refIds[1], refIds[2]] }],
          "A.B": [text(refIds[1])],
          "A.C": [{ id: refIds[2], type: "", kidIds: [refIds[3]] }],
          "A.C.D": [text(refIds[3])],
          E: [text(refIds[4])],
        },
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      };
      sandbox.createSandbox(data);

      await myeval(
        `(["A.B", "A.C.D", "E"].forEach(n => this.getField(n).value = "hello"), 0)`
      );
      for (const id of [refIds[1], refIds[3], refIds[4]]) {
        send_queue.delete(id);
      }

      await myeval(`(this.resetForm(["A"]), 0)`);

      for (const id of [refIds[1], refIds[3]]) {
        expect(send_queue.get(id)).toEqual({
          id,
          siblings: null,
          value: "",
          formattedValue: null,
          selRange: [0, 0],
        });
      }
      expect(send_queue.has(refIds[4])).toBeFalse();

      const values = await myeval(
        `["A.B", "A.C.D", "E"].map(n => this.getField(n).value)`
      );
      expect(values).toEqual(["", "", "hello"]);
    });

    it("should run OpenAction once, after formatting", async () => {
      const push = name => `(globalThis.run ??= []).push("${name}");`;
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        docInfo: { actions: { OpenAction: [push("OpenAction")] } },
        objects: {
          field: [
            {
              id: getId(),
              value: "",
              actions: { Format: [push("Format")] },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
      });

      await sandbox.dispatchEventInSandbox({ id: "doc", name: "Open" });
      expect(await myeval(`globalThis.run`)).toEqual(["Format", "OpenAction"]);
    });

    it("should preserve an unparsable date on document open", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          date: [
            {
              id: refId,
              value: "2024",
              hasDatetimeHTML: true,
              datetimeFormat: "mm/dd/yyyy",
              actions: { Format: [`AFDate_FormatEx("mm/dd/yyyy");`] },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
      });

      expect(await myeval(`util.scand("mm/dd/yyyy", "2024")`)).toBeNull();
      await sandbox.dispatchEventInSandbox({ id: "doc", name: "Open" });
      expect(send_queue.has(refId)).toBeFalse();
      expect(await myeval(`getField("date").value`)).toEqual("2024");
    });
  });

  describe("Util", function () {
    beforeAll(function () {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
    });

    describe("printd", function () {
      it("should print a date according to a format", async () => {
        const date = `new Date("Sun Apr 15 2007 03:14:15")`;
        let value = await myeval(`util.printd(0, ${date})`);
        expect(value).toEqual("D:20070415031415");

        value = await myeval(`util.printd(1, ${date})`);
        expect(value).toEqual("2007.04.15 03:14:15");

        value = await myeval(`util.printd(2, ${date})`);
        expect(value).toEqual("4/15/07 3:14:15 am");

        value = await myeval(`util.printd("mmmm mmm mm m", ${date})`);
        expect(value).toEqual("April Apr 04 4");

        value = await myeval(`util.printd("dddd ddd dd d", ${date})`);
        expect(value).toEqual("Sunday Sun 15 15");
      });

      it("should preserve escaped characters in date formats", async () => {
        const date = `new Date("Sun Apr 15 2007 03:14:15")`;
        const format = String.raw`\m mm \d dd \\ \é`;
        const value = await myeval(
          `util.printd(${JSON.stringify(format)}, ${date})`
        );
        expect(value).toEqual("m 04 d 15 \\ é");
      });
    });

    describe("scand", function () {
      it("should parse a date according to a format", async () => {
        const date = new Date("Sun Apr 15 2007 03:14:15");
        let value = await myeval(
          `util.scand(0, "D:20070415031415").toString()`
        );
        expect(new Date(value)).toEqual(date);

        value = await myeval(`util.scand(1, "2007.04.15 03:14:15").toString()`);
        expect(new Date(value)).toEqual(date);

        value = await myeval(`util.scand(2, "4/15/07 3:14:15 am").toString()`);
        expect(new Date(value)).toEqual(date);

        value = await myeval(`util.scand("mmddyyyy", "07/15/2007").toString()`);
        expect(new Date(value)).toEqual(new Date("07/15/2007 12:00:00"));

        value = await myeval(`util.scand("mmddyyyy", "07a15b2007").toString()`);
        expect(new Date(value)).toEqual(new Date("07/15/2007 12:00:00"));
      });

      it("should parse several dates with the same format", async () => {
        const value = await myeval(
          `["3:30 pm", "4:45 pm", "9:15 pm"].map(d => util.scand("h:MM tt", d).getHours())`
        );
        expect(value).toEqual([15, 16, 21]);
      });

      it("should handle a format with repeated specifiers", async () => {
        const cFormat = "Hm".repeat(40);
        const cDate = `${"1".repeat(84)}x`;
        const value = await myeval(
          `util.scand("${cFormat}", "${cDate}")?.toString() ?? "null"`
        );
        expect(value).toEqual("null");
      });
    });

    describe("printf", function () {
      it("should print some data according to a format", async () => {
        let value = await myeval(
          `util.printf("Integer numbers: %d, %d,...", 1.234, 56.789)`
        );
        expect(value).toEqual("Integer numbers: 1, 56,...");

        value = await myeval(
          `util.printf("Hex numbers: %x, %x,...", 1234, 56789)`
        );
        expect(value).toEqual("Hex numbers: 4D2, DDD5,...");

        value = await myeval(
          `util.printf("Hex numbers with 0x: %#x, %#x,...", 1234, 56789)`
        );
        expect(value).toEqual("Hex numbers with 0x: 0x4D2, 0xDDD5,...");

        value = await myeval(
          `util.printf("Decimal number: %,0+.3f", 1234567.89123)`
        );
        expect(value).toEqual("Decimal number: +1,234,567.891");

        value = await myeval(
          `util.printf("Decimal number: %,0+8.3f", 1.234567)`
        );
        expect(value).toEqual("Decimal number: +  1.235");

        value = await myeval(
          `util.printf("Decimal number: %,0.2f", -12.34567)`
        );
        expect(value).toEqual("Decimal number: -12.35");

        value = await myeval(`util.printf("Decimal number: %,0.0f", 4.95)`);
        expect(value).toEqual("Decimal number: 5");

        value = await myeval(`util.printf("Decimal number: %,0.0f", 4.49)`);
        expect(value).toEqual("Decimal number: 4");

        value = await myeval(`util.printf("Decimal number: %,0.0f", -4.95)`);
        expect(value).toEqual("Decimal number: -5");

        value = await myeval(`util.printf("Decimal number: %,0.0f", -4.49)`);
        expect(value).toEqual("Decimal number: -4");

        value = await myeval(`util.printf("Decimal number: %,0.2f", -0.5)`);
        expect(value).toEqual("Decimal number: -0.50");
      });

      it("should print a string with no argument", async () => {
        const value = await myeval(`util.printf("hello world")`);
        expect(value).toEqual("hello world");
      });

      it("print a string with a percent", async () => {
        const value = await myeval(`util.printf("%%s")`);
        expect(value).toEqual("%%s");
      });
    });

    describe("printx", function () {
      it("should print some data according to a format", async () => {
        const value = await myeval(
          `util.printx("9 (999) 999-9999", "aaa14159697489zzz")`
        );
        expect(value).toEqual("1 (415) 969-7489");
      });
    });
  });

  describe("Events", function () {
    it("should trigger an event and modify the source", async () => {
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

      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "",
        name: "test",
        willCommit: true,
      });

      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        value: "123",
      });
    });

    it("should report null and run the next action", async () => {
      const refId = getId();
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                custom: ["throw null;", "globalThis.nextAction = true;"],
              },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
      });

      await sandbox.dispatchEventInSandbox({ id: refId, name: "custom" });
      expect(send_queue.get("error")).toEqual({
        command: "error",
        value: `Error when executing "custom" for field "${refId}"\nnull`,
      });
      send_queue.delete("error");
      expect(await myeval(`globalThis.nextAction`)).toEqual(true);
    });

    it("should report errors when string conversion or stack access throws", async () => {
      const refId = getId();
      const cases = {
        throwingToString: ["({ toString() { throw 1; } })", "Unknown error"],
        nullPrototype: ["Object.create(null)", "Unknown error"],
        throwingStack: ["({ get stack() { throw 2; } })", "[object Object]"],
      };
      const actions = Object.create(null);
      for (const [name, [thrown]] of Object.entries(cases)) {
        actions[name] = [`throw ${thrown};`];
      }
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {
          field: [{ id: refId, value: "", actions, type: "text" }],
        },
        calculationOrder: [],
      });

      for (const [name, [, expected]] of Object.entries(cases)) {
        send_queue.delete("error");
        await sandbox.dispatchEventInSandbox({ id: refId, name });
        expect(send_queue.get("error"))
          .withContext(name)
          .toEqual({
            command: "error",
            value: `Error when executing "${name}" for field "${refId}"\n${expected}`,
          });
      }
      send_queue.delete("error");
    });

    it("should report errors from fields without widgets", async () => {
      const refIds = [getId(), getId()];
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        docInfo: { actions: { OpenAction: ["globalThis.openAction = true;"] } },
        objects: {
          A: [
            {
              id: refIds[0],
              type: "",
              kidIds: [refIds[1]],
              actions: { Format: [`throw new Error("Broken");`] },
            },
          ],
          "A.B": [
            {
              id: refIds[1],
              value: "",
              actions: { Format: ["globalThis.kidFormat = true;"] },
              type: "text",
            },
          ],
        },
        calculationOrder: [],
      });

      await sandbox.dispatchEventInSandbox({ id: "doc", name: "Open" });
      expect(send_queue.get("error").value.split("\n").slice(0, 2)).toEqual([
        `Error when executing "Format" for field "${refIds[0]}"`,
        "Error: Broken",
      ]);
      send_queue.delete("error");
      expect(
        await myeval(`[globalThis.kidFormat, globalThis.openAction]`)
      ).toEqual([true, true]);
    });

    it("should trigger an event added with setAction", async () => {
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
      };
      sandbox.createSandbox(data);

      await myeval(
        `(this.getField("field").setAction("test", 'event.source.value = "abc";'), 0)`
      );

      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "",
        name: "test",
        willCommit: true,
      });

      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        value: "abc",
      });
    });

    it("should trigger an event appended with setAction", async () => {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                test: [`event.source.value = "a";`],
              },
              type: "text",
            },
          ],
        },
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        calculationOrder: [],
      };
      sandbox.createSandbox(data);

      await myeval(
        `(this.getField("field").setAction("test", 'event.source.value += "b";'), 0)`
      );

      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "",
        name: "test",
        willCommit: true,
      });

      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        value: "ab",
      });
    });

    it("should trigger a Keystroke event and invalidate it", async () => {
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
      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "hell",
        name: "Keystroke",
        willCommit: false,
        change: "o",
        selStart: 4,
        selEnd: 4,
      });

      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        siblings: null,
        value: "hell",
        selRange: [4, 4],
      });
    });

    it("should trigger a Keystroke event and change it", async () => {
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
      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "hell",
        name: "Keystroke",
        willCommit: false,
        change: "o",
        selStart: 4,
        selEnd: 4,
      });

      expect(send_queue.has(refId)).toBeTrue();
      expect(send_queue.get(refId)).toEqual({
        id: refId,
        siblings: null,
        value: "hella",
        selRange: [5, 5],
      });
    });

    it("should trigger an invalid commit Keystroke event", async () => {
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
      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "",
        name: "test",
        willCommit: true,
      });
      expect(send_queue.has(refId)).toBeFalse();
    });

    it("should trigger a valid commit Keystroke event", async () => {
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
      await sandbox.dispatchEventInSandbox({
        id: refId1,
        value: "hello",
        name: "Keystroke",
        willCommit: true,
      });

      expect(send_queue.has(refId1)).toBeTrue();
      expect(send_queue.get(refId1)).toEqual({
        id: refId1,
        siblings: null,
        value: "world",
        formattedValue: null,
      });
    });
  });

  describe("Color", function () {
    beforeAll(function () {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
    });

    function round(color) {
      return [
        color[0],
        ...color.slice(1).map(x => Math.round(x * 1000) / 1000),
      ];
    }

    it("should convert RGB color for different color spaces", async () => {
      let value = await myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "T")`);
      expect(round(value)).toEqual(["T"]);

      value = await myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "G")`);
      expect(round(value)).toEqual(["G", 0.181]);

      value = await myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "RGB")`);
      expect(round(value)).toEqual(["RGB", 0.1, 0.2, 0.3]);

      value = await myeval(`color.convert(["RGB", 0.1, 0.2, 0.3], "CMYK")`);
      expect(round(value)).toEqual(["CMYK", 0.9, 0.8, 0.7, 0.7]);
    });

    it("should convert CMYK color for different color spaces", async () => {
      let value = await myeval(
        `color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "T")`
      );
      expect(round(value)).toEqual(["T"]);

      value = await myeval(`color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "G")`);
      expect(round(value)).toEqual(["G", 0.371]);

      value = await myeval(
        `color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "RGB")`
      );
      expect(round(value)).toEqual(["RGB", 0.5, 0.3, 0.4]);

      value = await myeval(
        `color.convert(["CMYK", 0.1, 0.2, 0.3, 0.4], "CMYK")`
      );
      expect(round(value)).toEqual(["CMYK", 0.1, 0.2, 0.3, 0.4]);
    });

    it("should convert Gray color for different color spaces", async () => {
      let value = await myeval(`color.convert(["G", 0.1], "T")`);
      expect(round(value)).toEqual(["T"]);

      value = await myeval(`color.convert(["G", 0.1], "G")`);
      expect(round(value)).toEqual(["G", 0.1]);

      value = await myeval(`color.convert(["G", 0.1], "RGB")`);
      expect(round(value)).toEqual(["RGB", 0.1, 0.1, 0.1]);

      value = await myeval(`color.convert(["G", 0.1], "CMYK")`);
      expect(round(value)).toEqual(["CMYK", 0, 0, 0, 0.9]);
    });

    it("should convert Transparent color for different color spaces", async () => {
      let value = await myeval(`color.convert(["T"], "T")`);
      expect(round(value)).toEqual(["T"]);

      value = await myeval(`color.convert(["T"], "G")`);
      expect(round(value)).toEqual(["G", 0]);

      value = await myeval(`color.convert(["T"], "RGB")`);
      expect(round(value)).toEqual(["RGB", 0, 0, 0]);

      value = await myeval(`color.convert(["T"], "CMYK")`);
      expect(round(value)).toEqual(["CMYK", 0, 0, 0, 1]);
    });

    it("should make added colors enumerable", async () => {
      const value = await myeval(`(() => {
        color.purple = ["RGB", 0.5, 0, 0.5];
        const names = [];
        for (const name in color) {
          names.push(name);
        }
        return [color.purple, names.includes("purple"), names.includes("convert")];
      })()`);
      expect(value).toEqual([["RGB", 0.5, 0, 0.5], true, false]);
    });
  });

  describe("App", function () {
    beforeAll(function () {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });
    });

    it("should test language", async () => {
      let value = await myeval(`app.language`);
      expect(value).toEqual("ENU");

      value = await myeval(`app.language = "hello"`);
      expect(value).toEqual("app.language is read-only");
    });

    it("should test platform", async () => {
      let value = await myeval(`app.platform`);
      expect(value).toEqual("UNIX");

      value = await myeval(`app.platform = "hello"`);
      expect(value).toEqual("app.platform is read-only");
    });

    it("shouldn't display an alert", async () => {
      const refId = getId();
      const data = {
        objects: {
          field: [
            {
              id: refId,
              value: "",
              actions: {
                Validate: [`app.alert(event.value);`],
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

      sandbox.createSandbox(data);
      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "hello",
        name: "Keystroke",
        willCommit: true,
      });
      expect(send_queue.has("alert")).toBeTrue();
      expect(send_queue.get("alert")).toEqual({
        command: "alert",
        value: "hello",
      });
      send_queue.delete(refId);
      send_queue.delete("alert");

      await sandbox.dispatchEventInSandbox({
        id: refId,
        value: "",
        name: "Keystroke",
        willCommit: true,
      });
      expect(send_queue.has("alert")).toBeFalse();
      send_queue.delete(refId);
    });

    it("should ignore an invalid timeout", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });

      const value = await myeval(`(() => {
        const timeout = app.setTimeOut("0", 100000);
        app.clearTimeOut(timeout);
        app.clearTimeOut(timeout);
        app.clearTimeOut(undefined);
        app.clearInterval(42);
        app.clearInterval({});
        return "ok";
      })()`);
      expect(value).toEqual("ok");
    });

    it("should cancel a cleared timeout", async () => {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
      });

      await myeval(`(() => {
        globalThis.run = [];
        app.clearTimeOut(app.setTimeOut("run.push('timeout');", 0));
        app.clearInterval(app.setInterval("run.push('interval');", 0));
        // Keep the handle alive to prevent cancellation by GC.
        globalThis.kept = app.setTimeOut("run.push('kept');", 0);
        return 0;
      })()`);
      // Earlier timers would run before the retained timeout.
      let run;
      for (let i = 0; i < 100; i++) {
        run = await myeval(`globalThis.run`);
        if (run.length > 0) {
          break;
        }
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
      }
      expect(run).toEqual(["kept"]);
    });
  });

  describe("AForm", function () {
    beforeAll(function () {
      sandbox.createSandbox({
        appInfo: { language: "en-US", platform: "Linux x86_64" },
        objects: {},
        calculationOrder: [],
        dispatchEventName: "_dispatchMe",
      });
    });

    describe("AFParseDateEx", function () {
      it("should parse a date with a format", async () => {
        const check = async (date, format, expected) => {
          const value = await myeval(
            `AFParseDateEx("${date}", "${format}").toISOString().replace(/T.*/, "")`
          );
          expect(value).toEqual(
            new Date(expected).toISOString().replace(/T.*/, "")
          );
        };

        await check("05", "dd", "2000/01/05");
        await check("12", "mm", "2000/12/01");
        await check("2022", "yyyy", "2022/01/01");
        await check("a1$9bbbb21", "dd/mm/yyyy", "2021/09/01");
        await check("1/2/2024", "dd/mm/yyyy", "2024/02/01");
        await check("01/2/2024", "dd/mm/yyyy", "2024/02/01");
        await check("1/02/2024", "dd/mm/yyyy", "2024/02/01");
        await check("01/02/2024", "dd/mm/yyyy", "2024/02/01");

        // The following test isn't working as expected because
        // the quickjs date parser has been replaced by the browser one
        // and the date "1.9.2021" is valid in Chrome but not in Firefox.
        // The supported date format is not specified...
        // await check("1.9.2021", "dd/mm/yyyy", "2021/09/01");
      });
    });

    describe("AFExtractNums", function () {
      it("should extract numbers", async () => {
        let value = await myeval(`AFExtractNums("123 456 789")`);
        expect(value).toEqual(["123", "456", "789"]);

        value = await myeval(`AFExtractNums("123.456")`);
        expect(value).toEqual(["123", "456"]);

        value = await myeval(`AFExtractNums("123")`);
        expect(value).toEqual(["123"]);

        value = await myeval(`AFExtractNums(".123")`);
        expect(value).toEqual(["0", "123"]);

        value = await myeval(`AFExtractNums(",123")`);
        expect(value).toEqual(["0", "123"]);
      });
    });

    describe("AFMakeNumber", function () {
      it("should convert string to number", async () => {
        let value = await myeval(`AFMakeNumber("123.456")`);
        expect(value).toEqual(123.456);

        value = await myeval(`AFMakeNumber(123.456)`);
        expect(value).toEqual(123.456);

        value = await myeval(`AFMakeNumber("-123.456")`);
        expect(value).toEqual(-123.456);

        value = await myeval(`AFMakeNumber("-123,456")`);
        expect(value).toEqual(-123.456);

        value = await myeval(`AFMakeNumber("not a number")`);
        expect(value).toBeNull();
      });
    });

    describe("AFMakeArrayFromList", function () {
      it("should split a string into an array of strings", async () => {
        const value = await myeval(
          `AFMakeArrayFromList("aaaa,  bbbbbbb,cc,ddd, e")`
        );
        expect(value).toEqual(["aaaa", " bbbbbbb", "cc", "ddd", "e"]);
      });
    });

    describe("AFNumber_format", function () {
      it("should format a number", async () => {
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
                  test6: [
                    `event.value = 0;` +
                      `AFNumber_Format(2, 0, 0, 0, "€", false);` +
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "0",
          name: "test1",
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          value: "0.00€",
        });
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "",
          name: "test6",
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          value: "0.00€",
        });
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "123456.789",
          name: "test1",
        });
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          value: "(52,345.68€)",
          textColor: ["RGB", 1, 0, 0],
        });
      });
    });

    describe("AFNumber_Keystroke", function () {
      it("should validate a number on a keystroke event", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "123456.789",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "123456.789",
          formattedValue: null,
        });
      });

      it("should not validate a number on a keystroke event", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "123s456.789",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has("alert")).toBeTrue();
        expect(send_queue.get("alert")).toEqual({
          command: "alert",
          value:
            "The value entered does not match the format of the field [ MyField ]",
        });
      });
    });

    describe("AFPercent_Format", function () {
      it("should format a percentage", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "0.456789",
          name: "test1",
        });
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          value: "%45.68",
        });
      });
    });

    describe("AFDate_Format", function () {
      it("should format a date", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "Sun Apr 15 2007 03:14:15",
          name: "test1",
        });
        expect(send_queue.has(refId)).toBeTrue();
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
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          value: "4/15/07 3:14 am",
        });
      });

      it("should format a date (cFormat)", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Format: [`AFDate_FormatEx("mm.dd.yyyy");`],
                  Keystroke: [`AFDate_KeystrokeEx("mm.dd.yyyy");`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "12.06.2023",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "12.06.2023",
          formattedValue: "12.06.2023",
        });
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "12.06.202",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "12.06.202",
          formattedValue: "12.06.0202",
        });
        send_queue.delete(refId);

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "02.06.2023",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "02.06.2023",
          formattedValue: "02.06.2023",
        });
        send_queue.delete(refId);

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "2.6.2023",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "2.6.2023",
          formattedValue: "02.06.2023",
        });
        send_queue.delete(refId);
      });
    });

    describe("AFRange_Validate", function () {
      it("should validate a number in range [a, b]", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "321",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "321",
          formattedValue: null,
        });
      });

      it("should invalidate a number out of range [a, b]", async () => {
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

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "12",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has("alert")).toBeTrue();
        expect(send_queue.get("alert")).toEqual({
          command: "alert",
          value:
            "Invalid value: must be greater than or equal to 123 and less than or equal to 456.",
        });
      });
    });

    describe("AFSimple_Calculate", function () {
      it("should compute the sum of several fields", async () => {
        const refIds = [0, 1, 2, 3, 4].map(_ => getId());
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
                    `AFSimple_Calculate("SUM", ["field1", "field2", "field3", "unknown"]);`,
                  ],
                },
                type: "text",
              },
            ],
            field5: [
              {
                id: refIds[4],
                value: "",
                actions: {
                  Calculate: [
                    `AFSimple_Calculate("SUM", "field1, field2, field3, unknown");`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [refIds[3], refIds[4]],
          dispatchEventName: "_dispatchMe",
        };

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refIds[0],
          value: "1",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 1,
          formattedValue: null,
        });

        await sandbox.dispatchEventInSandbox({
          id: refIds[1],
          value: "2",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 3,
          formattedValue: null,
        });

        await sandbox.dispatchEventInSandbox({
          id: refIds[2],
          value: "3",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 6,
          formattedValue: null,
        });

        expect(send_queue.has(refIds[4])).toBeTrue();
        expect(send_queue.get(refIds[4])).toEqual({
          id: refIds[4],
          siblings: null,
          value: 6,
          formattedValue: null,
        });
      });

      it("should compute the sum of several fields in fields tree", async () => {
        const refIds = [0, 1, 2, 3, 4, 5].map(_ => getId());
        const data = {
          objects: {
            field1: [
              {
                id: refIds[0],
                kidIds: [refIds[1], refIds[2]],
              },
            ],
            "field1.field2": [
              {
                id: refIds[1],
                kidIds: [refIds[3]],
              },
            ],
            "field1.field3": [
              {
                id: refIds[2],
                value: "",
                actions: {},
                type: "text",
              },
            ],
            "field1.field2.field4": [
              {
                id: refIds[3],
                kidIds: [refIds[4]],
              },
            ],
            "field1.field2.field4.field5": [
              {
                id: refIds[4],
                value: "",
                actions: {},
                type: "text",
              },
            ],
            field6: [
              {
                id: refIds[5],
                value: "",
                actions: {
                  Calculate: [`AFSimple_Calculate("SUM", "field1");`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [refIds[5]],
          dispatchEventName: "_dispatchMe",
        };

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refIds[2],
          value: "123",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[5])).toBeTrue();
        expect(send_queue.get(refIds[5])).toEqual({
          id: refIds[5],
          siblings: null,
          value: 123,
          formattedValue: null,
        });

        await sandbox.dispatchEventInSandbox({
          id: refIds[4],
          value: "456",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[5])).toBeTrue();
        expect(send_queue.get(refIds[5])).toEqual({
          id: refIds[5],
          siblings: null,
          value: 579,
          formattedValue: null,
        });
      });

      it("should compute the max of several fields", async () => {
        const refIds = [0, 1, 2, 3, 4].map(_ => getId());
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
                    `AFSimple_Calculate("MAX", ["field1", "field2", "field3", "unknown"]);`,
                  ],
                },
                type: "text",
              },
            ],
            field5: [
              {
                id: refIds[4],
                value: "",
                actions: {
                  Calculate: [
                    `AFSimple_Calculate("MAX", "field1, field2, field3, unknown");`,
                  ],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [refIds[3], refIds[4]],
          dispatchEventName: "_dispatchMe",
        };

        sandbox.createSandbox(data);
        await sandbox.dispatchEventInSandbox({
          id: refIds[0],
          value: "1",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 1,
          formattedValue: null,
        });

        await sandbox.dispatchEventInSandbox({
          id: refIds[1],
          value: "2",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 2,
          formattedValue: null,
        });

        await sandbox.dispatchEventInSandbox({
          id: refIds[2],
          value: "3",
          name: "Keystroke",
          willCommit: true,
        });
        expect(send_queue.has(refIds[3])).toBeTrue();
        expect(send_queue.get(refIds[3])).toEqual({
          id: refIds[3],
          siblings: null,
          value: 3,
          formattedValue: null,
        });

        expect(send_queue.has(refIds[4])).toBeTrue();
        expect(send_queue.get(refIds[4])).toEqual({
          id: refIds[4],
          siblings: null,
          value: 3,
          formattedValue: null,
        });
      });
    });

    describe("AFSpecial_KeystrokeEx", function () {
      it("should validate a phone number on a keystroke event", async () => {
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
        expect(send_queue.has(refId)).toBeTrue();
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "3",
          change: "F",
          name: "Keystroke",
          willCommit: false,
          selStart: 1,
          selEnd: 1,
        });
        expect(send_queue.has(refId)).toBeTrue();
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "3F",
          change: "?",
          name: "Keystroke",
          willCommit: false,
          selStart: 2,
          selEnd: 2,
        });
        expect(send_queue.has(refId)).toBeTrue();
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "3F?",
          change: "@",
          name: "Keystroke",
          willCommit: false,
          selStart: 3,
          selEnd: 3,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "3F?",
          selRange: [3, 3],
        });

        send_queue.delete(refId);
        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "3F?",
          change: "0",
          name: "Keystroke",
          willCommit: false,
          selStart: 3,
          selEnd: 3,
        });
        expect(send_queue.has(refId)).toBeTrue();
        send_queue.delete(refId);

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value: "3F?0",
          name: "Keystroke",
          willCommit: true,
          selStart: 4,
          selEnd: 4,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value: "3F?0",
          formattedValue: null,
        });
      });
    });

    describe("AFSpecial_Keystroke", function () {
      it("should validate a zip code on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(0);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "12345";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });

      it("should validate a US phone number (long) on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(2);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "(123) 456-7890";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });

      it("should validate a US phone number with digits only (long) on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(2);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "1234567890";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });

      it("should validate a US phone number with digits and dashes (long) on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(2);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "123-456-7890";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });

      it("should validate a US phone number (short) on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(2);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "123-4567";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });

      it("should validate a US phone number with digits only (short) on a keystroke event", async () => {
        const refId = getId();
        const data = {
          objects: {
            field: [
              {
                id: refId,
                value: "",
                actions: {
                  Keystroke: [`AFSpecial_Keystroke(2);`],
                },
                type: "text",
              },
            ],
          },
          appInfo: { language: "en-US", platform: "Linux x86_64" },
          calculationOrder: [],
          dispatchEventName: "_dispatchMe",
        };
        sandbox.createSandbox(data);

        let value = "";
        const changes = "1234567";
        let i = 0;

        for (; i < changes.length; i++) {
          const change = changes.charAt(i);
          await sandbox.dispatchEventInSandbox({
            id: refId,
            value,
            change,
            name: "Keystroke",
            willCommit: false,
            selStart: i,
            selEnd: i,
          });
          expect(send_queue.has(refId)).toBeTrue();
          send_queue.delete(refId);
          value += change;
        }

        await sandbox.dispatchEventInSandbox({
          id: refId,
          value,
          change: "A",
          name: "Keystroke",
          willCommit: false,
          selStart: i,
          selEnd: i,
        });
        expect(send_queue.has(refId)).toBeTrue();
        expect(send_queue.get(refId)).toEqual({
          id: refId,
          siblings: null,
          value,
          selRange: [i, i],
        });

        send_queue.delete(refId);
      });
    });

    describe("eMailValidate", function () {
      it("should validate an e-mail address", async () => {
        let value = await myeval(`eMailValidate(123)`);
        expect(value).toBeFalse();

        value = await myeval(`eMailValidate("foo@bar.com")`);
        expect(value).toBeTrue();

        value = await myeval(`eMailValidate("foo bar")`);
        expect(value).toBeFalse();
      });
    });

    describe("AFExactMatch", function () {
      it("should check matching between regexs and a string", async () => {
        let value = await myeval(`AFExactMatch(/\\d+/, "123")`);
        expect(value).toBeTrue();

        value = await myeval(`AFExactMatch(/\\d+/, "foo")`);
        expect(value).toEqual(0);

        value = await myeval(`AFExactMatch([/\\d+/, /[fo]*/], "foo")`);
        expect(value).toEqual(2);

        value = await myeval(`AFExactMatch([/\\d+/, /[fo]*/], "bar")`);
        expect(value).toEqual(0);
      });
    });
  });
});
