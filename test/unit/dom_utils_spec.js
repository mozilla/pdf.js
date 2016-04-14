/* globals expect, it, describe, PDFJS, isExternalLinkTargetSet, LinkTarget,
           getAbsoluteUrl, getFilenameFromUrl, beforeAll, afterAll */

'use strict';

describe('dom_utils', function() {
  describe('getAbsoluteUrl', function () {
    it('should accept an absolute URL', function () {
      var url = 'http://www.example.com';
      var baseUrl = null;
      expect(getAbsoluteUrl(url, baseUrl)).toEqual('http://www.example.com');
    });

    it('should reject a non-URL', function () {
      var url = 'An arbitrary string.';
      var baseUrl = null;
      expect(getAbsoluteUrl(url, baseUrl)).toEqual(null);
    });

    it('should accept a relative URL, with a valid baseURL', function () {
      var url = '../../file.pdf#hash';
      var baseUrl = 'http://www.example.com/some/path/';
      expect(getAbsoluteUrl(url, baseUrl)).
        toEqual('http://www.example.com/file.pdf#hash');
    });

    it('should reject a relative URL, without a baseURL', function () {
      var url = '../../file.pdf';
      var baseUrl = null;
      expect(getAbsoluteUrl(url, baseUrl)).toEqual(null);
    });

    it('should reject a relative URL, with an invalid baseURL', function () {
      var url = '../../file.pdf';
      var baseUrl = '/some/relative/path/';
      expect(getAbsoluteUrl(url, baseUrl)).toEqual(null);
    });
  });

  describe('getFilenameFromUrl', function() {
    it('should get the filename from an absolute URL', function() {
      var url = 'http://server.org/filename.pdf';
      var result = getFilenameFromUrl(url);
      var expected = 'filename.pdf';
      expect(result).toEqual(expected);
    });

    it('should get the filename from a relative URL', function() {
      var url = '../../filename.pdf';
      var result = getFilenameFromUrl(url);
      var expected = 'filename.pdf';
      expect(result).toEqual(expected);
    });
  });

  describe('isExternalLinkTargetSet', function() {
    var savedExternalLinkTarget;

    beforeAll(function (done) {
      savedExternalLinkTarget = PDFJS.externalLinkTarget;
      done();
    });

    afterAll(function () {
      PDFJS.externalLinkTarget = savedExternalLinkTarget;
    });

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
  });
});
