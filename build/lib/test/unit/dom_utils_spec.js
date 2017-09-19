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
'use strict';

var _dom_utils = require('../../display/dom_utils');

var _util = require('../../shared/util');

var _global = require('../../display/global');

describe('dom_utils', function () {
  describe('DOMSVGFactory', function () {
    var svgFactory = void 0;
    beforeAll(function (done) {
      svgFactory = new _dom_utils.DOMSVGFactory();
      done();
    });
    afterAll(function () {
      svgFactory = null;
    });
    it('`create` should throw an error if the dimensions are invalid', function () {
      expect(function () {
        return svgFactory.create(-1, 0);
      }).toThrow(new Error('Invalid SVG dimensions'));
      expect(function () {
        return svgFactory.create(0, -1);
      }).toThrow(new Error('Invalid SVG dimensions'));
    });
    it('`create` should return an SVG element if the dimensions are valid', function () {
      if ((0, _util.isNodeJS)()) {
        pending('Document is not supported in Node.js.');
      }
      var svg = svgFactory.create(20, 40);
      expect(svg instanceof SVGSVGElement).toBe(true);
      expect(svg.getAttribute('version')).toBe('1.1');
      expect(svg.getAttribute('width')).toBe('20px');
      expect(svg.getAttribute('height')).toBe('40px');
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('viewBox')).toBe('0 0 20 40');
    });
    it('`createElement` should throw an error if the type is not a string', function () {
      expect(function () {
        return svgFactory.createElement(true);
      }).toThrow(new Error('Invalid SVG element type'));
    });
    it('`createElement` should return an SVG element if the type is valid', function () {
      if ((0, _util.isNodeJS)()) {
        pending('Document is not supported in Node.js.');
      }
      var svg = svgFactory.createElement('svg:rect');
      expect(svg instanceof SVGRectElement).toBe(true);
    });
  });
  describe('getFilenameFromUrl', function () {
    it('should get the filename from an absolute URL', function () {
      var url = 'http://server.org/filename.pdf';
      var result = (0, _dom_utils.getFilenameFromUrl)(url);
      var expected = 'filename.pdf';
      expect(result).toEqual(expected);
    });
    it('should get the filename from a relative URL', function () {
      var url = '../../filename.pdf';
      var result = (0, _dom_utils.getFilenameFromUrl)(url);
      var expected = 'filename.pdf';
      expect(result).toEqual(expected);
    });
  });
  describe('isExternalLinkTargetSet', function () {
    var savedExternalLinkTarget;
    beforeAll(function (done) {
      savedExternalLinkTarget = _global.PDFJS.externalLinkTarget;
      done();
    });
    afterAll(function () {
      _global.PDFJS.externalLinkTarget = savedExternalLinkTarget;
    });
    it('handles the predefined LinkTargets', function () {
      for (var key in _dom_utils.LinkTarget) {
        var linkTarget = _dom_utils.LinkTarget[key];
        _global.PDFJS.externalLinkTarget = linkTarget;
        expect((0, _dom_utils.isExternalLinkTargetSet)()).toEqual(!!linkTarget);
      }
    });
    it('handles incorrect LinkTargets', function () {
      var targets = [true, '', false, -1, '_blank', null];
      for (var i = 0, ii = targets.length; i < ii; i++) {
        var linkTarget = targets[i];
        _global.PDFJS.externalLinkTarget = linkTarget;
        expect((0, _dom_utils.isExternalLinkTargetSet)()).toEqual(false);
      }
    });
  });
});