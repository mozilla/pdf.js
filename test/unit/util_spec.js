/* globals expect, it, describe, combineUrl, Dict, isDict, Name, PDFJS,
           stringToPDFString, isExternalLinkTargetSet, LinkTarget */

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

  describe('stringToPDFString', function() {
    it('handles ISO Latin 1 strings', function() {
      var str = '\x8Dstring\x8E';
      expect(stringToPDFString(str)).toEqual('\u201Cstring\u201D');
    });

    it('handles UTF-16BE strings', function() {
      var str = '\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67';
      expect(stringToPDFString(str)).toEqual('string');
    });

    it('handles empty strings', function() {
      // ISO Latin 1
      var str1 = '';
      expect(stringToPDFString(str1)).toEqual('');

      // UTF-16BE
      var str2 = '\xFE\xFF';
      expect(stringToPDFString(str2)).toEqual('');
    });
  });

  describe('isExternalLinkTargetSet', function() {
    // Save the current state, to avoid interfering with other tests.
    var previousExternalLinkTarget = PDFJS.externalLinkTarget;

    it('handles the predefined LinkTargets', function() {
      for (var key in LinkTarget) {
        var linkTarget = LinkTarget[key];
        PDFJS.externalLinkTarget = linkTarget;

        expect(isExternalLinkTargetSet()).toEqual(!!linkTarget);
      }
    });

    it('handles incorrect LinkTargets', function() {
      var targets = [true, '', false, -1, '_blank', null];

      for (var i = 0, ii = targets.length; i < ii; i++) {
        var linkTarget = targets[i];
        PDFJS.externalLinkTarget = linkTarget;

        expect(isExternalLinkTargetSet()).toEqual(false);
      }
    });

    // Reset the state.
    PDFJS.externalLinkTarget = previousExternalLinkTarget;
  });
});
