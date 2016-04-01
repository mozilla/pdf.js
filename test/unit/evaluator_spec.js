/* globals expect, it, describe, PartialEvaluator, StringStream, OPS,
           OperatorList, Dict, Name, Stream, WorkerTask */

'use strict';

describe('evaluator', function() {
  function XrefMock(queue) {
    this.queue = queue || [];
  }
  XrefMock.prototype = {
    fetchIfRef: function() {
      return this.queue.shift();
    }
  };
  function HandlerMock() {
    this.inputs = [];
  }
  HandlerMock.prototype = {
    send: function(name, data) {
      this.inputs.push({name: name, data: data});
    }
  };
  function ResourcesMock() { }
  ResourcesMock.prototype = {
    get: function(name) {
      return this[name];
    }
  };

  function PdfManagerMock() { }

  function runOperatorListCheck(evaluator, stream, resources, callback) {
    var result = new OperatorList();
    var task = new WorkerTask('OperatorListCheck');
    evaluator.getOperatorList(stream, task, resources, result).then(
        function () {
      callback(result);
    });
  }

  describe('splitCombinedOperations', function() {
    it('should reject unknown operations', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('fTT');

      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function(result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(1);
        expect(result.fnArray[0]).toEqual(OPS.fill);
        expect(result.argsArray[0]).toEqual(null);
        done();
      });
    });

    it('should handle one operations', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('Q');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function(result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(1);
        expect(result.fnArray[0]).toEqual(OPS.restore);
        done();
      });
    });

    it('should handle two glued operations', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream('/Res1 DoQ');
      runOperatorListCheck(evaluator, stream, resources, function (result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(2);
        expect(result.fnArray[0]).toEqual(OPS.paintXObject);
        expect(result.fnArray[1]).toEqual(OPS.restore);
        done();
      });
    });

    it('should handle tree glued operations', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('fff');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(3);
        expect(result.fnArray[0]).toEqual(OPS.fill);
        expect(result.fnArray[1]).toEqual(OPS.fill);
        expect(result.fnArray[2]).toEqual(OPS.fill);
        done();
      });
    });

    it('should handle three glued operations #2', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream('B*Bf*');
      runOperatorListCheck(evaluator, stream, resources, function (result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(3);
        expect(result.fnArray[0]).toEqual(OPS.eoFillStroke);
        expect(result.fnArray[1]).toEqual(OPS.fillStroke);
        expect(result.fnArray[2]).toEqual(OPS.eoFill);
        done();
      });
    });

    it('should handle glued operations and operands', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('f5 Ts');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(2);
        expect(result.fnArray[0]).toEqual(OPS.fill);
        expect(result.fnArray[1]).toEqual(OPS.setTextRise);
        expect(result.argsArray.length).toEqual(2);
        expect(result.argsArray[1].length).toEqual(1);
        expect(result.argsArray[1][0]).toEqual(5);
        done();
      });
    });

    it('should handle glued operations and literals', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('trueifalserinulln');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
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
      });
    });
  });

  describe('validateNumberOfArgs', function() {
    it('should execute if correct number of arguments', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray[0][0]).toEqual(5);
        expect(result.argsArray[0][1]).toEqual(1);
        expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
        done();
      });
    });
    it('should execute if too many arguments', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 4 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray[0][0]).toEqual(1);
        expect(result.argsArray[0][1]).toEqual(4);
        expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
        done();
      });
    });
    it('should execute if nested commands', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('/F2 /GS2 gs 5.711 Tf');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.fnArray.length).toEqual(3);
        expect(result.fnArray[0]).toEqual(OPS.setGState);
        expect(result.fnArray[1]).toEqual(OPS.dependency);
        expect(result.fnArray[2]).toEqual(OPS.setFont);
        expect(result.argsArray.length).toEqual(3);
        expect(result.argsArray[0].length).toEqual(1);
        expect(result.argsArray[1].length).toEqual(1);
        expect(result.argsArray[2].length).toEqual(2);
        done();
      });
    });
    it('should skip if too few arguments', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
        done();
      });
    });
    it('should close opened saves', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
        new XrefMock(), new HandlerMock(),
        'prefix');
      var stream = new StringStream('qq');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(4);
        expect(result.fnArray[0]).toEqual(OPS.save);
        expect(result.fnArray[1]).toEqual(OPS.save);
        expect(result.fnArray[2]).toEqual(OPS.restore);
        expect(result.fnArray[3]).toEqual(OPS.restore);
        done();
      });
    });
    it('should skip paintXObject if name is missing', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('/ Do');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
        done();
      });
    });
    it('should skip paintXObject if subtype is PS', function(done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var xobjStreamDict = new Dict();
      xobjStreamDict.set('Subtype', Name.get('PS'));
      var xobjStream = new Stream([], 0, 0, xobjStreamDict);

      var xobjs = new Dict();
      xobjs.set('Res1', xobjStream);

      var resources = new Dict();
      resources.set('XObject', xobjs);

      var stream = new StringStream('/Res1 Do');
      runOperatorListCheck(evaluator, stream, resources, function (result) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
        done();
      });
    });
  });

  describe('thread control', function() {
    it('should abort operator list parsing', function (done) {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('qqQQ');
      var resources = new ResourcesMock();
      var result = new OperatorList();
      var task = new WorkerTask('OperatorListAbort');
      task.terminate();
      evaluator.getOperatorList(stream, task, resources, result).catch(
        function () {
          expect(!!result.fnArray && !!result.argsArray).toEqual(true);
          expect(result.fnArray.length).toEqual(0);
          done();
        });
    });
    it('should abort text parsing parsing', function (done) {
      var resources = new ResourcesMock();
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('qqQQ');
      var task = new WorkerTask('TextContentAbort');
      task.terminate();
      evaluator.getTextContent(stream, task, resources).catch(
        function () {
          expect(true).toEqual(true);
          done();
        });
    });
  });

  describe('operator list', function () {
    function MessageHandlerMock() { }
    MessageHandlerMock.prototype = {
      send: function () { },
    };

    it('should get correct total length after flushing', function () {
      var operatorList = new OperatorList(null, new MessageHandlerMock());
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
