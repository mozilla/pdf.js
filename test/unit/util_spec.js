/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, combineUrl, Dict, isDict, Name */

'use strict';

describe('util', function() {

  describe('combineUrl', function() {
    it('absolute url with protocol stays as is', function() {
      var baseUrl = 'http://server/index.html';
      var url = 'http://server2/test2.html';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server2/test2.html';
      expect(result).toEqual(expected);
    });

    it('absolute url without protocol uses prefix from base', function() {
      var baseUrl = 'http://server/index.html';
      var url = '/test2.html';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/test2.html';
      expect(result).toEqual(expected);
    });

    it('combines relative url with base', function() {
      var baseUrl = 'http://server/index.html';
      var url = 'test2.html';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/test2.html';
      expect(result).toEqual(expected);
    });

    it('combines relative url (w/hash) with base', function() {
      var baseUrl = 'http://server/index.html#!/test';
      var url = 'test2.html';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/test2.html';
      expect(result).toEqual(expected);
    });

    it('combines relative url (w/query) with base', function() {
      var baseUrl = 'http://server/index.html?search=/test';
      var url = 'test2.html';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/test2.html';
      expect(result).toEqual(expected);
    });

    it('returns base url when url is empty', function() {
      var baseUrl = 'http://server/index.html';
      var url = '';
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/index.html';
      expect(result).toEqual(expected);
    });

    it('returns base url when url is undefined', function() {
      var baseUrl = 'http://server/index.html';
      var url;
      var result = combineUrl(baseUrl, url);
      var expected = 'http://server/index.html';
      expect(result).toEqual(expected);
    });
  });

  describe('isDict', function() {
    it('handles empty dictionaries with type check', function() {
      var dict = new Dict();
      expect(isDict(dict, 'Page')).toEqual(false);
    });

    it('handles dictionaries with type check', function() {
      var dict = new Dict();
      dict.set('Type', Name.get('Page'));
      expect(isDict(dict, 'Page')).toEqual(true);
    });
  });

});
