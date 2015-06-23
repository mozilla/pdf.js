/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, PartialEvaluator, StringStream, OPS,
           OperatorList, waitsFor, runs */

'use strict';

describe('evaluator', function() {
  function XrefMock(queue) {
    this.queue = queue;
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

  function runOperatorListCheck(evaluator, stream, resources, check) {
    var done = false;
    runs(function () {
      var result = new OperatorList();
      evaluator.getOperatorList(stream, resources, result).then(function () {
        check(result);
        done = true;
      });
    });
    waitsFor(function () {
      return done;
    });
  }

  describe('splitCombinedOperations', function() {
    it('should reject unknown operations', function() {
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
      });
    });

    it('should handle one operations', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('Q');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function(result) {
        expect(!!result.fnArray && !!result.argsArray).toEqual(true);
        expect(result.fnArray.length).toEqual(1);
        expect(result.fnArray[0]).toEqual(OPS.restore);
      });
    });

    it('should handle two glued operations', function() {
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
      });
    });

    it('should handle tree glued operations', function() {
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
      });
    });

    it('should handle three glued operations #2', function() {
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
      });
    });

    it('should handle glued operations and operands', function() {
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
      });
    });

    it('should handle glued operations and literals', function() {
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
      });
    });
  });

  describe('validateNumberOfArgs', function() {
    it('should execute if correct number of arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray[0][0]).toEqual(5);
        expect(result.argsArray[0][1]).toEqual(1);
        expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
      });
    });
    it('should execute if too many arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 4 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray[0][0]).toEqual(1);
        expect(result.argsArray[0][1]).toEqual(4);
        expect(result.fnArray[0]).toEqual(OPS.setCharWidth);
      });
    });
    it('should execute if nested commands', function() {
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
      });
    });
    it('should skip if too few arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 d0');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
      });
    });
    it('should close opened saves', function() {
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
      });
    });
    it('should skip paint form XObject if name is missing', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('/ Do');
      runOperatorListCheck(evaluator, stream, new ResourcesMock(),
          function (result) {
        expect(result.argsArray).toEqual([]);
        expect(result.fnArray).toEqual([]);
      });
    });
  });
});
