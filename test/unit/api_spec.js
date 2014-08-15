/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals PDFJS, expect, it, describe, Promise, combineUrl, waitsFor */

'use strict';

describe('api', function() {
  // TODO run with worker enabled
  var basicApiUrl = combineUrl(window.location.href, '../pdfs/basicapi.pdf');
  function waitsForPromise(promise, successCallback) {
    var data;
    promise.then(function(val) {
      data = val;
      successCallback(data);
    },
    function(error) {
      // Shouldn't get here.
      expect(false).toEqual(true);
    });
    waitsFor(function() {
      return data !== undefined;
    }, 20000);
  }
  describe('PDFJS', function() {
    describe('getDocument', function() {
      it('creates pdf doc from URL', function() {
        var promise = PDFJS.getDocument(basicApiUrl);
        waitsForPromise(promise, function(data) {
          expect(true).toEqual(true);
        });
      });
      it('creates pdf doc from typed array', function() {
        var nonBinaryRequest = PDFJS.disableWorker;
        var request = new XMLHttpRequest();
        request.open('GET', basicApiUrl, false);
        if (!nonBinaryRequest) {
          try {
            request.responseType = 'arraybuffer';
            nonBinaryRequest = request.responseType !== 'arraybuffer';
          } catch (e) {
            nonBinaryRequest = true;
          }
        }
        if (nonBinaryRequest && request.overrideMimeType) {
          request.overrideMimeType('text/plain; charset=x-user-defined');
        }
        request.send(null);

        var typedArrayPdf;
        if (nonBinaryRequest) {
          var data = Array.prototype.map.call(request.responseText,
              function (ch) {
            return ch.charCodeAt(0) & 0xFF;
          });
          typedArrayPdf = new Uint8Array(data);
        } else {
          typedArrayPdf = new Uint8Array(request.response);
        }
        // Sanity check to make sure that we fetched the entire PDF file.
        expect(typedArrayPdf.length).toEqual(105779);

        var promise = PDFJS.getDocument(typedArrayPdf);
        waitsForPromise(promise, function(data) {
          expect(true).toEqual(true);
        });
      });
    });
  });
  describe('PDFDocument', function() {
    var promise = PDFJS.getDocument(basicApiUrl);
    var doc;
    waitsForPromise(promise, function(data) {
      doc = data;
    });
    it('gets number of pages', function() {
      expect(doc.numPages).toEqual(3);
    });
    it('gets fingerprint', function() {
      expect(typeof doc.fingerprint).toEqual('string');
    });
    it('gets page', function() {
      var promise = doc.getPage(1);
      waitsForPromise(promise, function(data) {
        expect(true).toEqual(true);
      });
    });
    it('gets page index', function() {
      // reference to second page
      var ref = {num: 17, gen: 0};
      var promise = doc.getPageIndex(ref);
      waitsForPromise(promise, function(pageIndex) {
        expect(pageIndex).toEqual(1);
      });
    });
    it('gets destinations', function() {
      var promise = doc.getDestinations();
      waitsForPromise(promise, function(data) {
        expect(data).toEqual({ chapter1: [{ gen: 0, num: 17 }, { name: 'XYZ' },
                                          0, 841.89, null] });
      });
    });
    it('gets attachments', function() {
      var promise = doc.getAttachments();
      waitsForPromise(promise, function (data) {
        expect(data).toEqual(null);
      });
    });
    it('gets javascript', function() {
      var promise = doc.getJavaScript();
      waitsForPromise(promise, function (data) {
        expect(data).toEqual([]);
      });
    });
    it('gets outline', function() {
      var promise = doc.getOutline();
      waitsForPromise(promise, function(outline) {
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
      waitsForPromise(promise, function(metadata) {
        expect(metadata.info['Title']).toEqual('Basic API Test');
        expect(metadata.metadata.get('dc:title')).toEqual('Basic API Test');
      });
    });
    it('gets data', function() {
      var promise = doc.getData();
      waitsForPromise(promise, function (data) {
        expect(true).toEqual(true);
      });
    });
    it('gets filesize in bytes', function() {
      var promise = doc.getDownloadInfo();
      waitsForPromise(promise, function (data) {
        expect(data.length).toEqual(105779);
      });
    });
  });
  describe('Page', function() {
    var resolvePromise;
    var promise = new Promise(function (resolve) {
      resolvePromise = resolve;
    });
    PDFJS.getDocument(basicApiUrl).then(function(doc) {
      doc.getPage(1).then(function(data) {
        resolvePromise(data);
      });
    });
    var page;
    waitsForPromise(promise, function(data) {
      page = data;
    });
    it('gets page number', function () {
      expect(page.pageNumber).toEqual(1);
    });
    it('gets rotate', function () {
      expect(page.rotate).toEqual(0);
    });
    it('gets ref', function () {
      expect(page.ref).toEqual({ num: 15, gen: 0 });
    });
    it('gets view', function () {
      expect(page.view).toEqual([0, 0, 595.28, 841.89]);
    });
    it('gets viewport', function () {
      var viewport = page.getViewport(1.5, 90);
      expect(viewport.viewBox).toEqual(page.view);
      expect(viewport.scale).toEqual(1.5);
      expect(viewport.rotation).toEqual(90);
      expect(viewport.transform).toEqual([0, 1.5, 1.5, 0, 0, 0]);
      expect(viewport.width).toEqual(1262.835);
      expect(viewport.height).toEqual(892.92);
    });
    it('gets annotations', function () {
      var promise = page.getAnnotations();
      waitsForPromise(promise, function (data) {
        expect(data.length).toEqual(4);
      });
    });
    it('gets text content', function () {
      var promise = page.getTextContent();
      waitsForPromise(promise, function (data) {
        expect(!!data.items).toEqual(true);
        expect(data.items.length).toEqual(7);
        expect(!!data.styles).toEqual(true);
      });
    });
    it('gets operator list', function() {
      var promise = page.getOperatorList();
      waitsForPromise(promise, function (oplist) {
        expect(!!oplist.fnArray).toEqual(true);
        expect(!!oplist.argsArray).toEqual(true);
        expect(oplist.lastChunk).toEqual(true);
      });
    });
  });
});
