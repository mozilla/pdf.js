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
import { DrawOPS, FormatError, OPS } from "../../src/shared/util.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { GlobalColorSpaceCache } from "../../src/core/image_utils.js";
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

  async function runTextContentCheck(evaluator, stream) {
    const items = [];
    const sink = {
      desiredSize: 100,
      ready: Promise.resolve(),
      enqueue(chunk) {
        items.push(...chunk.items);
      },
    };
    const task = new WorkerTask("TextContentCheck");
    await evaluator.getTextContent({
      stream,
      task,
      resources: new ResourcesMock(),
      includeMarkedContent: true,
      sink,
    });
    return items;
  }

  let partialEvaluator;

  beforeAll(function () {
    partialEvaluator = new PartialEvaluator({
      xref: new XRefMock(),
      handler: new HandlerMock(),
      pageIndex: 0,
      idFactory: createIdFactory(/* pageIndex = */ 0),
      globalColorSpaceCache: new GlobalColorSpaceCache(),
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
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
      expect(result.fnArray.length).toEqual(1);
      expect(result.fnArray[0]).toEqual(OPS.constructPath);
      expect(result.argsArray[0]).toEqual([OPS.fill, [null], null]);
    });

    it("should handle one operation", async function () {
      const stream = new StringStream("Q");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
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
      expect(result.argsArray[2]).toBeNull();
    });

    it("should handle three glued operations", async function () {
      const stream = new StringStream("fff");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray).toEqual([
        OPS.constructPath,
        OPS.constructPath,
        OPS.constructPath,
      ]);
      expect(result.argsArray[0][0]).toEqual(OPS.fill);
      expect(result.argsArray[1][0]).toEqual(OPS.fill);
      expect(result.argsArray[2][0]).toEqual(OPS.fill);
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
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
      expect(result.fnArray).toEqual([
        OPS.constructPath,
        OPS.constructPath,
        OPS.constructPath,
      ]);
      expect(result.argsArray[0][0]).toEqual(OPS.eoFillStroke);
      expect(result.argsArray[1][0]).toEqual(OPS.fillStroke);
      expect(result.argsArray[2][0]).toEqual(OPS.eoFill);
    });

    it("should handle glued operations and operands", async function () {
      const stream = new StringStream("f5 Ts");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
      expect(result.fnArray.length).toEqual(2);
      expect(result.fnArray[0]).toEqual(OPS.constructPath);
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
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual(OPS.setFlatness);
      expect(result.fnArray[1]).toEqual(OPS.setRenderingIntent);
      expect(result.fnArray[2]).toEqual(OPS.constructPath);
      expect(result.argsArray.length).toEqual(3);
      expect(result.argsArray[0].length).toEqual(1);
      expect(result.argsArray[0][0]).toBeTrue();
      expect(result.argsArray[1].length).toEqual(1);
      expect(result.argsArray[1][0]).toBeFalse();
      expect(result.argsArray[2]).toEqual([OPS.endPath, [null], null]);
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
          expect(false).toBeTrue();
        } catch (reason) {
          expect(reason).toBeInstanceOf(FormatError);
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
      expect(!!result.fnArray && !!result.argsArray).toBeTrue();
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
        expect(false).toBeTrue();
      } catch (reason) {
        expect(reason).toBeInstanceOf(FormatError);
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

    it("should skip empty set fill/stroke color operators", async function () {
      const colorOps = [
        "SC",
        "SCN",
        "sc",
        "scn",
        "G",
        "g",
        "RG",
        "rg",
        "K",
        "k",
      ];

      for (const op of colorOps) {
        const stream = new StringStream(`/DeviceRGB CS /DeviceRGB cs ${op}`);
        const result = await runOperatorListCheck(
          partialEvaluator,
          stream,
          new ResourcesMock()
        );
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
      }
    });

    it("should handle invalid dash stuff", async function () {
      const stream = new StringStream("[ none ] 0 d");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock()
      );
      expect(result.argsArray[0][0]).toEqual([]);
      expect(result.argsArray[0][1]).toEqual(0);
      expect(result.fnArray[0]).toEqual(OPS.setDash);
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
        expect(false).toBeTrue();
      } catch {
        expect(!!result.fnArray && !!result.argsArray).toBeTrue();
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
        expect(false).toBeTrue();
      } catch {
        expect(true).toBeTrue();
      }
    });
  });

  describe("text content", function () {
    it("should close marked content opened in a text object", async function () {
      const stream = new StringStream(
        "/Outer BMC BT /Inner BMC ET /Sibling BMC EMC EMC"
      );
      const items = await runTextContentCheck(partialEvaluator, stream);

      expect(items).toEqual([
        { type: "beginMarkedContent", tag: "Outer" },
        { type: "beginMarkedContent", tag: "Inner" },
        { type: "endMarkedContent" },
        { type: "beginMarkedContent", tag: "Sibling" },
        { type: "endMarkedContent" },
        { type: "endMarkedContent" },
      ]);
    });

    it("should preserve marked content opened before a text object", async function () {
      const stream = new StringStream(
        "/Outer BMC BT ET BT ET /Inner BMC EMC EMC"
      );
      const items = await runTextContentCheck(partialEvaluator, stream);

      expect(items).toEqual([
        { type: "beginMarkedContent", tag: "Outer" },
        { type: "beginMarkedContent", tag: "Inner" },
        { type: "endMarkedContent" },
        { type: "endMarkedContent" },
      ]);
    });

    it("should not close marked content on an unmatched endText", async function () {
      const stream = new StringStream("/Outer BMC ET /Inner BMC EMC EMC");
      const items = await runTextContentCheck(partialEvaluator, stream);

      expect(items).toEqual([
        { type: "beginMarkedContent", tag: "Outer" },
        { type: "beginMarkedContent", tag: "Inner" },
        { type: "endMarkedContent" },
        { type: "endMarkedContent" },
      ]);
    });
  });

  describe("operator list", function () {
    class StreamSinkMock {
      constructor() {
        this.chunks = [];
      }

      enqueue(chunk) {
        this.chunks.push(structuredClone(chunk));
      }
    }

    const BBOX_PAGE = 100;
    function expectBBox(bboxes, index, expected) {
      const offset = index * 4;
      const step = BBOX_PAGE / 256;
      const minX = (bboxes[offset] * BBOX_PAGE) / 256;
      const minY = (bboxes[offset + 1] * BBOX_PAGE) / 256;
      const maxX = ((bboxes[offset + 2] + 1) * BBOX_PAGE) / 256;
      const maxY = ((bboxes[offset + 3] + 1) * BBOX_PAGE) / 256;
      expect(minX).toBeLessThanOrEqual(expected[0]);
      expect(minY).toBeLessThanOrEqual(expected[1]);
      expect(maxX).toBeGreaterThanOrEqual(expected[2]);
      expect(maxY).toBeGreaterThanOrEqual(expected[3]);
      expect(minX).toBeGreaterThan(expected[0] - 2 * step);
      expect(minY).toBeGreaterThan(expected[1] - 2 * step);
      expect(maxX).toBeLessThan(expected[2] + 2 * step);
      expect(maxY).toBeLessThan(expected[3] + 2 * step);
    }

    function createTextOperatorList(font = null) {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, BBOX_PAGE, BBOX_PAGE]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
        ...font,
      });
      return { operatorList, sink };
    }

    function addFill(operatorList, bbox) {
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [
          new Float32Array([
            DrawOPS.moveTo,
            bbox[0],
            bbox[1],
            DrawOPS.lineTo,
            bbox[2],
            bbox[3],
          ]),
        ],
        new Float32Array(bbox),
      ]);
    }

    it("should get correct length after flushing", function () {
      const operatorList = new OperatorList(null, new StreamSinkMock());
      operatorList.addOp(OPS.save, null);
      operatorList.addOp(OPS.restore, null);

      expect(operatorList.length).toEqual(2);

      operatorList.flush();

      expect(operatorList.length).toEqual(0);
    });

    it("should track a path after operator-list optimization", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.save);
      operatorList.addOp(OPS.transform, [2, 0, 0, 3, 10, 20]);
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [new Float32Array([DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 5, 4])],
        new Float32Array([0, 0, 5, 4]),
      ]);
      operatorList.addOp(OPS.restore);
      operatorList.flush(/* lastChunk = */ true);

      const chunk = sink.chunks[0];
      expect(chunk.fnArray).toEqual([OPS.constructPath]);
      expect(chunk.argsArray[0][2]).toEqual(new Float32Array([10, 20, 20, 32]));
      expectBBox(chunk.bboxes, 0, [10, 20, 20, 32]);
    });

    it("should keep group bounding boxes across chunks", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.save);
      operatorList.flush();

      operatorList.addOp(OPS.transform, [2, 0, 0, 3, 10, 20]);
      operatorList.addOp(OPS.paintInlineImageXObject, [
        { width: 1, height: 1 },
      ]);
      operatorList.addOp(OPS.restore);
      operatorList.flush(/* lastChunk = */ true);

      expect(sink.chunks[0].bboxes).toBeNull();
      const { bboxes } = sink.chunks[1];
      expect(bboxes.length).toEqual(16);
      for (let i = 0; i < 4; i++) {
        expectBBox(bboxes, i, [10, 20, 12, 23]);
      }
    });

    it("should track text and the operations it depends on", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      });

      operatorList.addDependency("font1");
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [
        [
          { isSpace: false, width: 500 },
          { isSpace: false, width: 500 },
        ],
      ]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, length } = sink.chunks[0];
      expect(bboxes.length).toEqual(length * 4);
      for (let i = 0; i < length; i++) {
        expectBBox(bboxes, i, [10, 27.5, 40, 40]);
      }
    });

    it("should track stroke dependencies for Type3 text", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
        isType3Font: true,
      });

      operatorList.addOp(OPS.setStrokeRGBColor, [new Uint8ClampedArray(3)]);
      operatorList.addOp(OPS.setLineWidth, [2]);
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [
        [{ isSpace: false, operatorListId: "glyph1", width: 500 }],
      ]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[0];
      expectBBox(bboxes, 0, [10, 27.5, 35, 40]);
      expectBBox(bboxes, 1, [10, 27.5, 35, 40]);
    });

    it("should include miter joins in stroked text bounds", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      });

      operatorList.addOp(OPS.setLineWidth, [2]);
      operatorList.addOp(OPS.setMiterLimit, [4]);
      operatorList.addOp(OPS.setTextRenderingMode, [1]);
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 500 }]]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, length } = sink.chunks[0];
      for (let i = 0; i < length; i++) {
        expectBBox(bboxes, i, [2, 19.5, 43, 48]);
      }
    });

    it("should apply clipping to later operations", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.clip);
      operatorList.addOp(OPS.constructPath, [
        OPS.endPath,
        [
          new Float32Array([
            DrawOPS.moveTo,
            2,
            2,
            DrawOPS.lineTo,
            6,
            2,
            DrawOPS.lineTo,
            6,
            6,
            DrawOPS.lineTo,
            2,
            6,
            DrawOPS.closePath,
          ]),
        ],
        new Float32Array([2, 2, 6, 6]),
      ]);
      operatorList.addOp(OPS.transform, [10, 0, 0, 10, 0, 0]);
      operatorList.addOp(OPS.paintInlineImageXObject, [
        { width: 1, height: 1 },
      ]);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[0];
      for (let i = 0; i < 4; i++) {
        expectBBox(bboxes, i, [2, 2, 6, 6]);
      }
    });

    it("should use the full line width for miter-limit expansion", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.setLineWidth, [2]);
      operatorList.addOp(OPS.setMiterLimit, [4]);
      operatorList.addOp(OPS.constructPath, [
        OPS.stroke,
        [new Float32Array([DrawOPS.moveTo, 10, 10, DrawOPS.lineTo, 20, 20])],
        new Float32Array([10, 10, 20, 20]),
      ]);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[0];
      for (let i = 0; i < 3; i++) {
        expectBBox(bboxes, i, [2, 2, 28, 28]);
      }
    });

    it("should retain nested tiling-pattern resources after changing colors", function () {
      const nestedPattern = new OperatorList();
      nestedPattern.addDependency("image1");
      nestedPattern.addOp(OPS.paintImageXObject, ["image1", 1, 1]);
      const pattern = new OperatorList();
      pattern.addDependencies(nestedPattern.dependencies);
      pattern.addOp(OPS.setFillColorN, [
        "TilingPattern",
        null,
        nestedPattern.getIR(),
      ]);

      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, BBOX_PAGE, BBOX_PAGE]);
      operatorList.addDependencies(pattern.dependencies);
      operatorList.flush();
      operatorList.addOp(OPS.setFillColorN, [
        "TilingPattern",
        null,
        pattern.getIR(),
      ]);
      const fill = [10, 20, 30, 40];
      addFill(operatorList, fill);
      operatorList.addOp(OPS.setFillRGBColor, ["#000000"]);
      addFill(operatorList, [60, 70, 80, 90]);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[1];
      expectBBox(bboxes, 0, fill); // Image dependency from the first chunk.
      expectBBox(bboxes, 1, fill); // Pattern color.
    });

    it("should ignore an empty clipping path", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.clip);
      operatorList.addOp(OPS.constructPath, [OPS.endPath, [null], null]);
      operatorList.addOp(OPS.transform, [10, 0, 0, 10, 20, 30]);
      operatorList.addOp(OPS.paintInlineImageXObject, [
        { width: 1, height: 1 },
      ]);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[0];
      for (let i = 0; i < 4; i++) {
        expectBBox(bboxes, i, [20, 30, 30, 40]);
      }
    });

    it("should inherit the graphics state used to composite a group", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.setGState, [[["BM", "difference"]]]);
      operatorList.addOp(OPS.beginGroup, [{ bbox: [0, 0, 100, 100] }]);
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [new Float32Array([DrawOPS.moveTo, 20, 30, DrawOPS.lineTo, 40, 50])],
        new Float32Array([20, 30, 40, 50]),
      ]);
      operatorList.addOp(OPS.endGroup, []);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes } = sink.chunks[0];
      for (let i = 0; i < 4; i++) {
        expectBBox(bboxes, i, [20, 30, 40, 50]);
      }
    });

    it("should fall back to the clip box for a degenerate font box", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, 0, 0, 0],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      });

      operatorList.addDependency("font1");
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 500 }]]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const showTextIndex = fnArray.indexOf(OPS.showText);
      expectBBox(bboxes, showTextIndex, [0, 0, 100, 100]);
    });

    it("should keep the whole soft-mask group alive for a masked draw", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.beginGroup, [
        { smask: { subtype: "Alpha" }, bbox: [0, 0, 100, 100] },
      ]);
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [new Float32Array([DrawOPS.moveTo, 20, 30, DrawOPS.lineTo, 40, 50])],
        new Float32Array([20, 30, 40, 50]),
      ]);
      operatorList.addOp(OPS.endGroup, [{ smask: { subtype: "Alpha" } }]);
      operatorList.addOp(OPS.setGState, [[["SMask", true]]]);
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [new Float32Array([DrawOPS.moveTo, 60, 70, DrawOPS.lineTo, 80, 90])],
        new Float32Array([60, 70, 80, 90]),
      ]);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const beginGroupIndex = fnArray.indexOf(OPS.beginGroup);
      const endGroupIndex = fnArray.indexOf(OPS.endGroup);
      const setGStateIndex = fnArray.indexOf(OPS.setGState);
      const maskedDrawIndex = fnArray.lastIndexOf(OPS.constructPath);

      expectBBox(bboxes, maskedDrawIndex, [60, 70, 80, 90]);
      expectBBox(bboxes, setGStateIndex, [60, 70, 80, 90]);
      expectBBox(bboxes, beginGroupIndex, [20, 30, 80, 90]);
      expectBBox(bboxes, beginGroupIndex + 1, [20, 30, 80, 90]);
      expectBBox(bboxes, endGroupIndex, [20, 30, 80, 90]);
    });

    it("should keep an earlier same-line run's state alive for a later run", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      const font = {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      };
      operatorList.addFont("fontA", font);
      operatorList.addFont("fontB", font);
      operatorList.addDependency("fontA");
      operatorList.addDependency("fontB");

      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["fontA", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 10, 50]),
      ]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 1000 }]]);
      operatorList.addOp(OPS.setFont, ["fontB", 10]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 1000 }]]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const decode = i => {
        const offset = i * 4;
        if (bboxes[offset] > bboxes[offset + 2]) {
          return null;
        }
        return [
          (bboxes[offset] * 100) / 256,
          (bboxes[offset + 1] * 100) / 256,
          ((bboxes[offset + 2] + 1) * 100) / 256,
          ((bboxes[offset + 3] + 1) * 100) / 256,
        ];
      };
      const firstSetFont = fnArray.indexOf(OPS.setFont);
      const secondRun = fnArray.lastIndexOf(OPS.showText);
      const setFontBox = decode(firstSetFont);
      const secondRunBox = decode(secondRun);

      // Retain the first run's font to compute the second run's position.
      expect(setFontBox).not.toBeNull();
      expect(secondRunBox).not.toBeNull();
      expect(setFontBox[0]).toBeLessThanOrEqual(secondRunBox[0]);
      expect(setFontBox[1]).toBeLessThanOrEqual(secondRunBox[1]);
      expect(setFontBox[2]).toBeGreaterThanOrEqual(secondRunBox[2]);
      expect(setFontBox[3]).toBeGreaterThanOrEqual(secondRunBox[3]);
    });

    it("should retain the leading consumed by nextLine", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);
      operatorList.addFont("font1", {
        ascent: 0.8,
        bbox: [0, -200, 1000, 800],
        descent: -0.2,
        fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      });

      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 60]),
      ]);
      operatorList.addOp(OPS.setLeading, [10]);
      operatorList.addOp(OPS.nextLine, []);
      // nextLine must retain the previous leading.
      operatorList.addOp(OPS.setLeading, [20]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 1000 }]]);
      operatorList.addOp(OPS.endText);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const firstLeading = fnArray.indexOf(OPS.setLeading);
      const showText = fnArray.indexOf(OPS.showText);
      expect(bboxes.slice(firstLeading * 4, firstLeading * 4 + 4)).toEqual(
        bboxes.slice(showText * 4, showText * 4 + 4)
      );
    });

    it("should retain compositing state used by image masks", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([0, 0, 100, 100]);

      operatorList.addOp(OPS.beginGroup, [
        { smask: { subtype: "Alpha" }, bbox: [0, 0, 100, 100] },
      ]);
      operatorList.addOp(OPS.constructPath, [
        OPS.fill,
        [new Float32Array([DrawOPS.moveTo, 10, 10, DrawOPS.lineTo, 20, 20])],
        new Float32Array([10, 10, 20, 20]),
      ]);
      operatorList.addOp(OPS.endGroup, [{ smask: { subtype: "Alpha" } }]);
      operatorList.addOp(OPS.setGState, [[["BM", "difference"]]]);
      operatorList.addOp(OPS.setGState, [[["SMask", true]]]);
      operatorList.addOp(OPS.transform, [10, 0, 0, 10, 60, 70]);
      operatorList.addOp(OPS.paintSolidColorImageMask, []);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const blendMode = fnArray.indexOf(OPS.setGState);
      const softMask = fnArray.lastIndexOf(OPS.setGState);
      expectBBox(bboxes, blendMode, [60, 70, 70, 80]);
      expectBBox(bboxes, softMask, [60, 70, 70, 80]);
    });

    it("should preserve precision before normalizing a large page origin", function () {
      const sink = new StreamSinkMock();
      const operatorList = new OperatorList(0, sink);
      operatorList.enableBBoxes([1_000_000_000, 0, 1_000_000_100, 100]);

      operatorList.addOp(OPS.transform, [1, 0, 0, 1, 1_000_000_010, 20]);
      operatorList.addOp(OPS.paintInlineImageXObject, [
        { width: 1, height: 1 },
      ]);

      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const offset = fnArray.indexOf(OPS.paintInlineImageXObject) * 4;
      expect(bboxes.slice(offset, offset + 4)).toEqual(
        new Uint8ClampedArray([25, 51, 29, 54])
      );
    });

    it("should use the text matrix for stroked text bounds", function () {
      const { operatorList, sink } = createTextOperatorList();
      operatorList.addOp(OPS.setLineWidth, [2]);
      operatorList.addOp(OPS.setLineJoin, [1]);
      operatorList.addOp(OPS.setTextRenderingMode, [1]);
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 4, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [[{ isSpace: false, width: 500 }]]);
      operatorList.addOp(OPS.endText);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.indexOf(OPS.showText), [9, 16, 36, 74]);
    });

    it("should not clip with text in optional content", function () {
      const { operatorList, sink } = createTextOperatorList();
      operatorList.addOp(OPS.beginMarkedContentProps, [
        "OC",
        { type: "OCG", id: "1R" },
      ]);
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.setTextRenderingMode, [7]);
      operatorList.addOp(OPS.showText, [
        [{ isInFont: true, isSpace: false, width: 500 }],
      ]);
      operatorList.addOp(OPS.endText);
      operatorList.addOp(OPS.endMarkedContent);
      addFill(operatorList, [60, 70, 80, 90]);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.indexOf(OPS.constructPath), [60, 70, 80, 90]);
      const page = [0, 0, BBOX_PAGE, BBOX_PAGE];
      expectBBox(bboxes, fnArray.indexOf(OPS.beginMarkedContentProps), page);
      expectBBox(bboxes, fnArray.indexOf(OPS.endMarkedContent), page);
    });

    it("should only clip with drawn text", function () {
      const getFillBBox = isInFont => {
        const { operatorList, sink } = createTextOperatorList();
        operatorList.addOp(OPS.beginText);
        operatorList.addOp(OPS.setFont, ["font1", 10]);
        operatorList.addOp(OPS.setTextMatrix, [
          new Float32Array([1, 0, 0, 1, 20, 30]),
        ]);
        operatorList.addOp(OPS.setTextRenderingMode, [7]);
        operatorList.addOp(OPS.showText, [
          [{ isInFont, isSpace: false, width: 500 }],
        ]);
        operatorList.addOp(OPS.endText);
        addFill(operatorList, [60, 70, 80, 90]);
        operatorList.flush(/* lastChunk = */ true);

        const { bboxes, fnArray } = sink.chunks[0];
        const offset = fnArray.indexOf(OPS.constructPath) * 4;
        return bboxes.slice(offset, offset + 4);
      };
      expect(getFillBBox(true)).toEqual(
        new Uint8ClampedArray([255, 255, 0, 0])
      );
      expectBBox(getFillBBox(false), 0, [60, 70, 80, 90]);
    });

    it("should keep the save scope of a text clip", function () {
      const { operatorList, sink } = createTextOperatorList();
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextRenderingMode, [7]);
      operatorList.addOp(OPS.save);
      operatorList.addOp(OPS.transform, [1, 0, 0, 1, 10, 0]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [
        [{ isInFont: true, isSpace: false, width: 500 }],
      ]);
      operatorList.addOp(OPS.restore);
      operatorList.addOp(OPS.endText);
      addFill(operatorList, [10, 10, 60, 60]);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      const fill = [20, 27.5, 45, 40];
      expectBBox(bboxes, fnArray.indexOf(OPS.constructPath), fill);
      expectBBox(bboxes, fnArray.indexOf(OPS.save), fill);
      expectBBox(bboxes, fnArray.indexOf(OPS.transform), fill);
      expectBBox(bboxes, fnArray.indexOf(OPS.restore), fill);
    });

    it("should advance invisible Type3 text", function () {
      const { operatorList, sink } = createTextOperatorList({
        isType3Font: true,
      });
      const glyph = { isSpace: false, operatorListId: "glyph1", width: 500 };
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.setTextRenderingMode, [3]);
      operatorList.addOp(OPS.showText, [[glyph, glyph, glyph, glyph]]);
      operatorList.addOp(OPS.setTextRenderingMode, [0]);
      operatorList.addOp(OPS.showText, [[glyph]]);
      operatorList.addOp(OPS.endText);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.lastIndexOf(OPS.showText), [30, 27.5, 55, 40]);
    });

    it("should not advance Type3 text by the font matrix translation", function () {
      const { operatorList, sink } = createTextOperatorList({
        fontMatrix: [0.001, 0, 0, 0.001, 0.5, 0],
        isType3Font: true,
      });
      const glyph = { isSpace: false, operatorListId: "glyph1", width: 500 };
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.showText, [[glyph, glyph]]);
      operatorList.addOp(OPS.showText, [[glyph]]);
      operatorList.addOp(OPS.endText);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.lastIndexOf(OPS.showText), [20, 27.5, 45, 40]);
    });

    it("should draw Type3 text in clipping mode without clipping", function () {
      const { operatorList, sink } = createTextOperatorList({
        isType3Font: true,
      });
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", 10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 20, 30]),
      ]);
      operatorList.addOp(OPS.setTextRenderingMode, [7]);
      operatorList.addOp(OPS.showText, [
        [{ isSpace: false, operatorListId: "glyph1", width: 500 }],
      ]);
      operatorList.addOp(OPS.endText);
      addFill(operatorList, [60, 70, 80, 90]);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.indexOf(OPS.showText), [10, 27.5, 35, 40]);
      expectBBox(bboxes, fnArray.indexOf(OPS.constructPath), [60, 70, 80, 90]);
    });

    it("should advance Type3 text with a negative font size", function () {
      const { operatorList, sink } = createTextOperatorList({
        isType3Font: true,
      });
      const glyph = { isSpace: false, operatorListId: "glyph1", width: 1000 };
      operatorList.addOp(OPS.beginText);
      operatorList.addOp(OPS.setFont, ["font1", -10]);
      operatorList.addOp(OPS.setCharSpacing, [10]);
      operatorList.addOp(OPS.setTextMatrix, [
        new Float32Array([1, 0, 0, 1, 60, 50]),
      ]);
      operatorList.addOp(OPS.showText, [[glyph, glyph, glyph]]);
      operatorList.addOp(OPS.endText);
      operatorList.flush(/* lastChunk = */ true);

      const { bboxes, fnArray } = sink.chunks[0];
      expectBBox(bboxes, fnArray.indexOf(OPS.showText), [40, 40, 70, 52.5]);
    });
  });

  describe("graphics-state operators", function () {
    it("should convert negative line width to absolute value in the graphic state", async function () {
      const gState = new Dict();
      gState.set("LW", -5);
      const extGState = new Dict();
      extGState.set("GSneg", gState);

      const resources = new ResourcesMock();
      resources.ExtGState = extGState;

      const stream = new StringStream("/GSneg gs");
      const result = await runOperatorListCheck(
        partialEvaluator,
        stream,
        resources
      );

      expect(result.fnArray).toEqual([OPS.setGState]);

      const stateEntries = result.argsArray[0][0];
      const lwEntry = stateEntries.find(([key]) => key === "LW");
      expect(lwEntry).toBeDefined();
      expect(lwEntry[1]).toEqual(5);
    });
  });
});
