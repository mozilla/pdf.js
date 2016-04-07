/* globals expect, it, describe, PDFJS, isExternalLinkTargetSet, LinkTarget,
           getFilenameFromUrl, beforeAll, afterAll */

'use strict';

describe('dom_utils', function() {
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
