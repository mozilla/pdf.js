/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

describe('api', function() {
  // TODO run with worker enabled
  PDFJS.disableWorker = true;
  var basicApiUrl = combineUrl(window.location.href, '../pdfs/basicapi.pdf');
  function waitsForPromise(promise) {
    waitsFor(function() {
      return promise.isResolved || promise.isRejected;
    }, 4000);
  }
  function expectAfterPromise(promise, successCallback) {
    waitsForPromise(promise);
    runs(function() {
      promise.then(successCallback,
      function(error, e) {
        // Shouldn't get here.
        expect(false).toEqual(true);
      });
    });
  }
  describe('PDFJS', function() {
    describe('getDocument', function() {
      it('creates pdf doc from URL', function() {
        var promise = PDFJS.getDocument(basicApiUrl);
        expectAfterPromise(promise, function(data) {
          expect(true).toEqual(true);
        });
      });
      /*
      it('creates pdf doc from typed array', function() {
        // TODO
      });
      */
    });
  });
  describe('PDFDocument', function() {
    var promise = PDFJS.getDocument(basicApiUrl);
    waitsForPromise(promise);
    var doc;
    runs(function() {
      promise.then(function(data) { doc = data; });
    });
    it('gets number of pages', function() {
      expect(doc.numPages).toEqual(3);
    });
    it('gets fingerprint', function() {
      expect(typeof doc.fingerprint).toEqual('string');
    });
    it('gets page', function() {
      var promise = doc.getPage(1);
      expectAfterPromise(promise, function(data) {
        expect(true).toEqual(true);
      });
    });
    it('gets destinations', function() {
      var promise = doc.getDestinations();
      expectAfterPromise(promise, function(data) {
        // TODO this seems to be broken for the test pdf
      });
    });
    it('gets outline', function() {
      var promise = doc.getOutline();
      expectAfterPromise(promise, function(outline) {
        // Two top level entries.
        expect(outline.length).toEqual(2);
        // Make sure some basic attributes are set.
        expect(outline[1].title).toEqual('Chapter 1');
        expect(outline[1].items.length).toEqual(1);
        expect(outline[1].items[0].title).toEqual('Paragraph 1.1');
      });
    });
    it('gets metadata', function() {
      var promise = doc.getMetadata();
      expectAfterPromise(promise, function(metadata) {
        expect(metadata.info['Title']).toEqual('Basic API Test');
        expect(metadata.metadata.get('dc:title')).toEqual('Basic API Test');
      });
    });
  });
  describe('Page', function() {
    var promise = new Promise();
    PDFJS.getDocument(basicApiUrl).then(function(doc) {
      doc.getPage(1).then(function(data) {
        promise.resolve(data);
      });
    });
    waitsForPromise(promise);
    var page;
    runs(function() {
      promise.then(function(data) {
        page = data;
      });
    });
    it('gets ref', function() {
      expect(page.ref).toEqual({num: 15, gen: 0});
    });
    // TODO rotate
    // TODO viewport
    // TODO annotaions
    // TOOD text content
    // TODO operation list
  });
});
