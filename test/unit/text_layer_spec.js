/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals PDFJS, expect, it, describe, Promise, combineUrl, waitsFor,
           isArray, MissingPDFException */

'use strict';

function waitsForPromiseResolved(promise, successCallback) {
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

function getPageOneOf(pdf) {
  var pdfURL = combineUrl(window.location.href, pdf);
  var resolvePromise;
  var pagePromise = new Promise(function (resolve) {
    resolvePromise = resolve;
  });
  PDFJS.getDocument(pdfURL).then(function(doc) {
    doc.getPage(1).then(function(data) {
      resolvePromise(data);
    });
  });
  var page = {
    promise: pagePromise,
    page: page
  };
  waitsForPromiseResolved(pagePromise, function(data) {
    page.page = data;
  });
  return page;
}

describe('text-extract', function() {
  it('patent', function () {
    var page = getPageOneOf('../pdfs/US6205527_page1.pdf');
    waitsForPromiseResolved(page.promise, function (data) {
      var textPromise = page.page.getTextContent();
      waitsForPromiseResolved(textPromise, function (data) {
        expect(!!data.items).toEqual(true);
        var text = data.items.map(function (d) { return d.str; }).join('');
        // Make sure the text is ordered properly.
        expect(text.indexOf('Disclosed is an apparatus, a system, a') > 0)
          .toEqual(true);
        expect(text.indexOf('device to the computer system; (b) preparing ' +
          'a storage. media of the peripheral storage') > 0).toEqual(true);
      });
    });
  });
  
  it('tracemonkey', function () {
    var page = getPageOneOf('../pdfs/tracemonkey.pdf');
    waitsForPromiseResolved(page.promise, function (data) {
      var textPromise = page.page.getTextContent();
      waitsForPromiseResolved(textPromise, function (data) {
        expect(!!data.items).toEqual(true);
        var text = data.items.map(function (d) { return d.str; }).join('');
        // Make sure the text is ordered properly.
        expect(text.indexOf('no concrete type information is available') > 0)
          .toEqual(true);
        expect(text.indexOf('difficult to com-pile than statically ') > 0)
          .toEqual(true);
        expect(text.indexOf('this work for personal or classroom use is') > 0)
          .toEqual(true);
      });
    });
  });
});