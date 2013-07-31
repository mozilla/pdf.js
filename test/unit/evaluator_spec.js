/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, PartialEvaluator, StringStream */

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
      this.inputs({name: name, data: data});
    }
  };
  function ResourcesMock() { }
  ResourcesMock.prototype = {
    get: function(name) {
      return this[name];
    }
  };

  function PdfManagerMock() { }

  describe('splitCombinedOperations', function() {
    it('should reject unknown operations', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('qTT');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(1);
      expect(result.fnArray[0]).toEqual('save');
      expect(result.argsArray[0].length).toEqual(0);
    });

    it('should handle one operations', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('Q');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(1);
      expect(result.fnArray[0]).toEqual('restore');
    });

    it('should handle two glued operations', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream('/Res1 DoQ');
      var result = evaluator.getOperatorList(stream, resources);
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(2);
      expect(result.fnArray[0]).toEqual('paintXObject');
      expect(result.fnArray[1]).toEqual('restore');
    });

    it('should handle tree glued operations', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('qqq');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual('save');
      expect(result.fnArray[1]).toEqual('save');
      expect(result.fnArray[2]).toEqual('save');
    });

    it('should handle three glued operations #2', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var resources = new ResourcesMock();
      resources.Res1 = {};
      var stream = new StringStream('B*Bf*');
      var result = evaluator.getOperatorList(stream, resources);
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual('eoFillStroke');
      expect(result.fnArray[1]).toEqual('fillStroke');
      expect(result.fnArray[2]).toEqual('eoFill');
    });

    it('should handle glued operations and operands', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('q5 Ts');
      var result  = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(2);
      expect(result.fnArray[0]).toEqual('save');
      expect(result.fnArray[1]).toEqual('setTextRise');
      expect(result.argsArray.length).toEqual(2);
      expect(result.argsArray[1].length).toEqual(1);
      expect(result.argsArray[1][0]).toEqual(5);
    });

    it('should handle glued operations and literals', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('trueifalserinullq');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(!!result.fnArray && !!result.argsArray).toEqual(true);
      expect(result.fnArray.length).toEqual(3);
      expect(result.fnArray[0]).toEqual('setFlatness');
      expect(result.fnArray[1]).toEqual('setRenderingIntent');
      expect(result.fnArray[2]).toEqual('save');
      expect(result.argsArray.length).toEqual(3);
      expect(result.argsArray[0].length).toEqual(1);
      expect(result.argsArray[0][0]).toEqual(true);
      expect(result.argsArray[1].length).toEqual(1);
      expect(result.argsArray[1][0]).toEqual(false);
      expect(result.argsArray[2].length).toEqual(0);
    });
  });

  describe('validateNumberOfArgs', function() {
    it('should execute if correct number of arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 d0');
      console.log('here!');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(result.argsArray[0][0]).toEqual(5);
      expect(result.argsArray[0][1]).toEqual(1);
      expect(result.fnArray[0]).toEqual('setCharWidth');
    });
    it('should execute if too many arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 1 4 d0');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(result.argsArray[0][0]).toEqual(5);
      expect(result.argsArray[0][1]).toEqual(1);
      expect(result.argsArray[0][2]).toEqual(4);
      expect(result.fnArray[0]).toEqual('setCharWidth');
    });
    it('should skip if too few arguments', function() {
      var evaluator = new PartialEvaluator(new PdfManagerMock(),
                                           new XrefMock(), new HandlerMock(),
                                           'prefix');
      var stream = new StringStream('5 d0');
      var result = evaluator.getOperatorList(stream, new ResourcesMock());
      expect(result.argsArray).toEqual([]);
      expect(result.fnArray).toEqual([]);
    });
  });
});

