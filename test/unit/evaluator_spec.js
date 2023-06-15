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

import { createIdFactory, XRefMock } from "./test_utils.js";
import { Dict, Name } from "../../src/core/primitives.js";
import { FormatError, OPS } from "../../src/shared/util.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { OperatorList } from "../../src/core/operator_list.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";
import { WorkerTask } from "../../src/core/worker.js";

describe("evaluator", function () {
  function HandlerMock() {
    this.inputs = [];
  }
  HandlerMock.prototype = {
    send(name, data) {
      this.inputs.push({ name, data });
    },
  };
  function ResourcesMock() {}
  ResourcesMock.prototype = {
    get(name) {
      return this[name];
    },
  };

  async function runOperatorListCheck(evaluator, stream, resources) {
    const operatorList = new OperatorList();
    const task = new WorkerTask("OperatorListCheck");
    await evaluator.getOperatorList({
      stream,
      task,
      resources,
      operatorList,
    });
    return operatorList;
  }

  let partialEvaluator;

  beforeAll(function () {
    partialEvaluator = new PartialEvaluator({
      xref: new XRefMock(),
      handler: new HandlerMock(),
      pageIndex: 0,
      idFactory: createIdFactory(/* pageIndex = */ 0),
    });
  });

  afterAll(function () {
    partialEvaluator = null;
  });

  describe("splitCombinedOperations", function () {
    it("should reject unknown operations", async function () {
      const stream = new StringStream("fTT");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(1);
      expect(result.fnArray[0]).toEqual(OPS.fill);
      expect(result.argsArray[0]).toEqual(null);
    });

    it("should handle one operation", async function () {
      const stream = new StringStream("Q");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(1);
      expect(result.fnArray[0]).toEqual(OPS.restore);
    });

    it("should handle two glued operations", async function () {
      const imgDict = new Dict();
      imgDict.set("Subtype", Name.get("Image"));
      imgDict.set("Width", 1);
      imgDict.set("Height", 1);

      const imgStream = new Stream([0]);
      imgStream.dict = imgDict;

      const xObject = new Dict();
      xObject.set("Res1", imgStream);

      const resources = new ResourcesMock();
      resources.XObject = xObject;

      const stream = new StringStream("/Res1 DoQ");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        resources
      );
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.dependency);
      expect(result.fnArray[1]).toEqual(OPS.paintImageXObject);
      expect(result.fnArray[2]).toEqual(OPS.restore);
      expect(result.argsArray.length).toEqual(3);
      expect(result.argsArray[0]).toEqual(["img_p0_1"]);
      expect(result.argsArray[1]).toEqual(["img_p0_1", 1, 1]);
      expect(result.argsArray[2]).toEqual(null);
    });

    it("should handle three glued operations", async function () {
      const stream = new StringStream("fff");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.fill);
      expect(result.fnArray[1]).toEqual(OPS.fill);
      expect(result.fnArray[2]).toEqual(OPS.fill);
    });

    it("should handle three glued operations #2", async function () {
      const resources = new ResourcesMock();
      resources.Res1 = {};
      const stream = new StringStream("B*Bf*");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        resources
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.eoFillStroke);
      expect(result.fnArray[1]).toEqual(OPS.fillStroke);
      expect(result.fnArray[2]).toEqual(OPS.eoFill);
    });

    it("should handle glued operations and operands", async function () {
      const stream = new StringStream("f5 Ts");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(2);
      expect(result.fnArray[0]).toEqual(OPS.fill);
      expect(result.fnArray[1]).toEqual(OPS.setTextRise);
      expect(result.argsArray.length).toEqual(2);
      expect(result.argsArray[1].length).toEqual(1);
      expect(result.argsArray[1][0]).toEqual(5);
    });

    it("should handle glued operations and literals", async function () {
      const stream = new StringStream("trueifalserinulln");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.setFlatness);
      expect(result.fnArray[1]).toEqual(OPS.setRenderingIntent);
      expect(result.fnArray[2]).toEqual(OPS.endPath);
      expect(result.argsArray.length).toEqual(3);
      expect(result.argsArray[0].length).toEqual(1);
      expect(result.argsArray[0][0]).toEqual(true);
      expect(result.argsArray[1].length).toEqual(1);
      expect(result.argsArray[1][0]).toEqual(false);
      expect(result.argsArray[2]).toEqual(null);
    });
  });

  describe("validateNumberOfArgs", function () {
    it("should execute if correct number of arguments", async function () {
      const stream = new StringStream("5 1 d0");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(result.argsArray[0][0]).toEqual(5);
      expect(result.argsArray[0][1]).toEqual(1);
      expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
    });

    it("should execute if too many arguments", async function () {
      const stream = new StringStream("5 1 4 d0");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(result.argsArray[0][0]).toEqual(1);
      expect(result.argsArray[0][1]).toEqual(4);
      expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
    });

    it("should execute if nested commands", async function () {
      const gState = new Dict();
      gState.set("LW", 2);
      gState.set("CA", 0.5);

      const extGState = new Dict();
      extGState.set("GS2", gState);

      const resources = new ResourcesMock();
      resources.ExtGState = extGState;

      const stream = new StringStream("/F2 /GS2 gs 5.711 Tf");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        resources
      );
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.setGState);
      expect(result.fnArray[1]).toEqual(OPS.dependency);
      expect(result.fnArray[2]).toEqual(OPS.setFont);
      expect(result.argsArray.length).toEqual(3);
      expect(result.argsArray[0]).toEqual([
        [
          ["LW", 2],
          ["CA", 0.5],
        ],
      ]);
      expect(result.argsArray[1]).toEqual(["g_font_error"]);
      expect(result.argsArray[2]).toEqual(["g_font_error", 5.711]);
    });

    it("should skip if too few arguments", async function () {
      const stream = new StringStream("5 d0");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(result.argsArray).toEqual([]);
      expect(result.fnArray).toEqual([]);
    });

    it(
      "should error if (many) path operators have too few arguments " +
        "(bug 1443140)",
      async function () {
        const NUM_INVALID_OPS = 25;

        // Non-path operators, should be ignored.
        const invalidMoveText = "10 Td\n".repeat(NUM_INVALID_OPS);
        const moveTextStream = new StringStream(invalidMoveText);
        const result = await runOperatorListCheck(
          partialEvaluator,
          moveTextStream,
          new ResourcesMock()
        );
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);

        // Path operators, should throw error.
        const invalidLineTo = "20 l\n".repeat(NUM_INVALID_OPS);
        const lineToStream = new StringStream(invalidLineTo);

        try {
          await runOperatorListCheck(
            partialEvaluator,
            lineToStream,
            new ResourcesMock()
          );

          // Shouldn't get here.
          expect(false).toEqual(true);
        } catch (reason) {
          expect(reason instanceof FormatError).toEqual(true);
          expect(reason.message).toEqual(
            "Invalid command l: expected 2 args, but received 1 args."
          );
        }
      }
    );

    it("should close opened saves", async function () {
      const stream = new StringStream("qq");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(4);
      expect(result.fnArray[0]).toEqual(OPS.save);
      expect(result.fnArray[1]).toEqual(OPS.save);
      expect(result.fnArray[2]).toEqual(OPS.restore);
      expect(result.fnArray[3]).toEqual(OPS.restore);
    });

    it("should error on paintXObject if name is missing", async function () {
      const stream = new StringStream("/ Do");

      try {
        await runOperatorListCheck(
          partialEvaluator,
          stream,
          new ResourcesMock()
        );

        // Shouldn't get here.
        expect(false).toEqual(true);
      } catch (reason) {
        expect(reason instanceof FormatError).toEqual(true);
        expect(reason.message).toEqual("XObject should be a stream");
      }
    });

    it("should skip paintXObject if subtype is PS", async function () {
      const xobjStreamDict = new Dict();
      xobjStreamDict.set("Subtype", Name.get("PS"));
      const xobjStream = new Stream([], 0, 0, xobjStreamDict);

      const xobjs = new Dict();
      xobjs.set("Res1", xobjStream);

      const resources = new Dict();
      resources.set("XObject", xobjs);

      const stream = new StringStream("/Res1 Do");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        resources
      );
      expect(result.argsArray).toEqual([]);
      expect(result.fnArray).toEqual([]);
    });
  });

  describe("thread control", function () {
    it("should abort operator list parsing", async function () {
      const stream = new StringStream("qqQQ");
      const resources = new ResourcesMock();
      const result = new OperatorList();
      const task = new WorkerTask("OperatorListAbort");
      task.terminate();

      try {
        await partialEvaluator.getOperatorList({
          stream,
          task,
          resources,
          operatorList: result,
        });

        // Shouldn't get here.
        expect(false).toEqual(true);
      } catch {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(0);
      }
    });

    it("should abort text content parsing", async function () {
      const resources = new ResourcesMock();
      const stream = new StringStream("qqQQ");
      const task = new WorkerTask("TextContentAbort");
      task.terminate();

      try {
        await partialEvaluator.getTextContent({
          stream,
          task,
          resources,
        });

        // Shouldn't get here.
        expect(false).toEqual(true);
      } catch {
        expect(true).toEqual(true);
      }
    });
  });

  describe("operator list", function () {
    class StreamSinkMock {
      enqueue() {}
    }

    it("should get correct total length after flushing", function () {
      const operatorList = new OperatorList(null, new StreamSinkMock());
      operatorList.addOp(OPS.save, null);
      operatorList.addOp(OPS.restore, null);

      expect(operatorList.totalLength).toEqual(2);
      expect(operatorList.length).toEqual(2);

      operatorList.flush();

      expect(operatorList.totalLength).toEqual(2);
      expect(operatorList.length).toEqual(0);
    });
  });
});
