/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  getFilenameFromUrl, isExternalLinkTargetSet, LinkTarget
} from '../../src/display/dom_utils';
import { PDFJS } from '../../src/display/global';

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
