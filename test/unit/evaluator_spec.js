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

describe("evaluator", function() {
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

  function runOperatorListCheck(evaluator, stream, resources, callback) {
    var result = new OperatorList();
    var task = new WorkerTask("OperatorListCheck");
    evaluator
      .getOperatorList({
        stream,
        task,
        resources,
        operatorList: result,
      })
      .then(
        function() {
          callback(result);
        },
        function(reason) {
          callback(reason);
        }
      );
  }

  var partialEvaluator;

  beforeAll(function(done) {
    partialEvaluator = new PartialEvaluator({
      xref: new XRefMock(),
      handler: new HandlerMock(),
      pageIndex: 0,
      idFactory: createIdFactory(/* pageIndex = */ 0),
    });
    done();
  });

  afterAll(function() {
    partialEvaluator = null;
  });

  describe("splitCombinedOperations", function() {
    it("should reject unknown operations", function(done) {
      var stream = new StringStream("fTT");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(1);
          expect(result.fnArray[0]).toEqual(OPS.fill);
          expect(result.argsArray[0]).toEqual(null);
          done();
        }
      );
    });

    it("should handle one operation", function(done) {
      var stream = new StringStream("Q");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(1);
          expect(result.fnArray[0]).toEqual(OPS.restore);
          done();
        }
      );
    });

    it("should handle two glued operations", function(done) {
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream("/Res1 DoQ");
      runOperatorListCheck(partialEvaluator, stream, resources, function(
        result
      ) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(2);
        expect(result.fnArray[0]).toEqual(OPS.paintXObject);
        expect(result.fnArray[1]).toEqual(OPS.restore);
        done();
      });
    });

    it("should handle three glued operations", function(done) {
      var stream = new StringStream("fff");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(3);
          expect(result.fnArray[0]).toEqual(OPS.fill);
          expect(result.fnArray[1]).toEqual(OPS.fill);
          expect(result.fnArray[2]).toEqual(OPS.fill);
          done();
        }
      );
    });

    it("should handle three glued operations #2", function(done) {
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream("B*Bf*");
      runOperatorListCheck(partialEvaluator, stream, resources, function(
        result
      ) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(3);
        expect(result.fnArray[0]).toEqual(OPS.eoFillStroke);
        expect(result.fnArray[1]).toEqual(OPS.fillStroke);
        expect(result.fnArray[2]).toEqual(OPS.eoFill);
        done();
      });
    });

    it("should handle glued operations and operands", function(done) {
      var stream = new StringStream("f5 Ts");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(2);
          expect(result.fnArray[0]).toEqual(OPS.fill);
          expect(result.fnArray[1]).toEqual(OPS.setTextRise);
          expect(result.argsArray.length).toEqual(2);
          expect(result.argsArray[1].length).toEqual(1);
          expect(result.argsArray[1][0]).toEqual(5);
          done();
        }
      );
    });

    it("should handle glued operations and literals", function(done) {
      var stream = new StringStream("trueifalserinulln");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
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
          done();
        }
      );
    });
  });

  describe("validateNumberOfArgs", function() {
    it("should execute if correct number of arguments", function(done) {
      var stream = new StringStream("5 1 d0");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(result.argsArray[0][0]).toEqual(5);
          expect(result.argsArray[0][1]).toEqual(1);
          expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
          done();
        }
      );
    });
    it("should execute if too many arguments", function(done) {
      var stream = new StringStream("5 1 4 d0");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(result.argsArray[0][0]).toEqual(1);
          expect(result.argsArray[0][1]).toEqual(4);
          expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
          done();
        }
      );
    });
    it("should execute if nested commands", function(done) {
      var stream = new StringStream("/F2 /GS2 gs 5.711 Tf");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(result.fnArray.length).toEqual(3);
          expect(result.fnArray[0]).toEqual(OPS.setGState);
          expect(result.fnArray[1]).toEqual(OPS.dependency);
          expect(result.fnArray[2]).toEqual(OPS.setFont);
          expect(result.argsArray.length).toEqual(3);
          expect(result.argsArray[0].length).toEqual(1);
          expect(result.argsArray[1].length).toEqual(1);
          expect(result.argsArray[2].length).toEqual(2);
          done();
        }
      );
    });
    it("should skip if too few arguments", function(done) {
      var stream = new StringStream("5 d0");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(result.argsArray).toEqual([]);
          expect(result.fnArray).toEqual([]);
          done();
        }
      );
    });

    it(
      "should error if (many) path operators have too few arguments " +
        "(bug 1443140)",
      function(done) {
        const NUM_INVALID_OPS = 25;
        const tempArr = new Array(NUM_INVALID_OPS + 1);

        // Non-path operators, should be ignored.
        const invalidMoveText = tempArr.join("10 Td\n");
        const moveTextStream = new StringStream(invalidMoveText);
        runOperatorListCheck(
          partialEvaluator,
          moveTextStream,
          new ResourcesMock(),
          function(result) {
            expect(result.argsArray).toEqual([]);
            expect(result.fnArray).toEqual([]);
            done();
          }
        );

        // Path operators, should throw error.
        const invalidLineTo = tempArr.join("20 l\n");
        const lineToStream = new StringStream(invalidLineTo);
        runOperatorListCheck(
          partialEvaluator,
          lineToStream,
          new ResourcesMock(),
          function(error) {
            expect(error instanceof FormatError).toEqual(true);
            expect(error.message).toEqual(
              "Invalid command l: expected 2 args, but received 1 args."
            );
            done();
          }
        );
      }
    );

    it("should close opened saves", function(done) {
      var stream = new StringStream("qq");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(4);
          expect(result.fnArray[0]).toEqual(OPS.save);
          expect(result.fnArray[1]).toEqual(OPS.save);
          expect(result.fnArray[2]).toEqual(OPS.restore);
          expect(result.fnArray[3]).toEqual(OPS.restore);
          done();
        }
      );
    });
    it("should error on paintXObject if name is missing", function(done) {
      var stream = new StringStream("/ Do");
      runOperatorListCheck(
        partialEvaluator,
        stream,
        new ResourcesMock(),
        function(result) {
          expect(result instanceof FormatError).toEqual(true);
          expect(result.message).toEqual(
            "XObject must be referred to by name."
          );
          done();
        }
      );
    });
    it("should skip paintXObject if subtype is PS", function(done) {
      var xobjStreamDict = new Dict();
      xobjStreamDict.set("Subtype", Name.get("PS"));
      var xobjStream = new Stream([], 0, 0, xobjStreamDict);

      var xobjs = new Dict();
      xobjs.set("Res1", xobjStream);

      var resources = new Dict();
      resources.set("XObject", xobjs);

      var stream = new StringStream("/Res1 Do");
      runOperatorListCheck(partialEvaluator, stream, resources, function(
        result
      ) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
        done();
      });
    });
  });

  describe("thread control", function() {
    it("should abort operator list parsing", function(done) {
      var stream = new StringStream("qqQQ");
      var resources = new ResourcesMock();
      var result = new OperatorList();
      var task = new WorkerTask("OperatorListAbort");
      task.terminate();
      partialEvaluator
        .getOperatorList({
          stream,
          task,
          resources,
          operatorList: result,
        })
        .catch(function() {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(0);
          done();
        });
    });
    it("should abort text parsing parsing", function(done) {
      var resources = new ResourcesMock();
      var stream = new StringStream("qqQQ");
      var task = new WorkerTask("TextContentAbort");
      task.terminate();
      partialEvaluator
        .getTextContent({
          stream,
          task,
          resources,
        })
        .catch(function() {
          expect(true).toEqual(true);
          done();
        });
    });
  });

  describe("operator list", function() {
    class StreamSinkMock {
      enqueue() {}
    }

    it("should get correct total length after flushing", function() {
      var operatorList = new OperatorList(null, new StreamSinkMock());
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
