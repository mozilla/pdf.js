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
/* eslint no-var: error */

import {
  DOMCanvasFactory, DOMSVGFactory, getFilenameFromUrl, isValidFetchUrl
} from '../../src/display/display_utils';
import isNodeJS from '../../src/shared/is_node';

describe('display_utils', function() {
  describe('DOMCanvasFactory', function() {
    let canvasFactory;

    beforeAll(function(done) {
      canvasFactory = new DOMCanvasFactory();
      done();
    });

    afterAll(function() {
      canvasFactory = null;
    });

    it('`create` should throw an error if the dimensions are invalid',
        function() {
      // Invalid width.
      expect(function() {
        return canvasFactory.create(-1, 1);
      }).toThrow(new Error('Invalid canvas size'));

      // Invalid height.
      expect(function() {
        return canvasFactory.create(1, -1);
      }).toThrow(new Error('Invalid canvas size'));
    });

    it('`create` should return a canvas if the dimensions are valid',
        function() {
      if (isNodeJS()) {
        pending('Document is not supported in Node.js.');
      }

      const { canvas, context, } = canvasFactory.create(20, 40);
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
      expect(context instanceof CanvasRenderingContext2D).toBe(true);
      expect(canvas.width).toBe(20);
      expect(canvas.height).toBe(40);
    });

    it('`reset` should throw an error if no canvas is provided', function() {
      const canvasAndContext = { canvas: null, context: null, };

      expect(function() {
        return canvasFactory.reset(canvasAndContext, 20, 40);
      }).toThrow(new Error('Canvas is not specified'));
    });

    it('`reset` should throw an error if the dimensions are invalid',
        function() {
      const canvasAndContext = { canvas: 'foo', context: 'bar', };

      // Invalid width.
      expect(function() {
        return canvasFactory.reset(canvasAndContext, -1, 1);
      }).toThrow(new Error('Invalid canvas size'));

      // Invalid height.
      expect(function() {
        return canvasFactory.reset(canvasAndContext, 1, -1);
      }).toThrow(new Error('Invalid canvas size'));
    });

    it('`reset` should alter the canvas/context if the dimensions are valid',
        function() {
      if (isNodeJS()) {
        pending('Document is not supported in Node.js.');
      }

      const canvasAndContext = canvasFactory.create(20, 40);
      canvasFactory.reset(canvasAndContext, 60, 80);

      const { canvas, context, } = canvasAndContext;
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
      expect(context instanceof CanvasRenderingContext2D).toBe(true);
      expect(canvas.width).toBe(60);
      expect(canvas.height).toBe(80);
    });

    it('`destroy` should throw an error if no canvas is provided', function() {
      expect(function() {
        return canvasFactory.destroy({});
      }).toThrow(new Error('Canvas is not specified'));
    });

    it('`destroy` should clear the canvas/context', function() {
      if (isNodeJS()) {
        pending('Document is not supported in Node.js.');
      }

      const canvasAndContext = canvasFactory.create(20, 40);
      canvasFactory.destroy(canvasAndContext);

      const { canvas, context, } = canvasAndContext;
      expect(canvas).toBe(null);
      expect(context).toBe(null);
    });
  });

  describe('DOMSVGFactory', function() {
    let svgFactory;

    beforeAll(function(done) {
      svgFactory = new DOMSVGFactory();
      done();
    });

    afterAll(function() {
      svgFactory = null;
    });

    it('`create` should throw an error if the dimensions are invalid',
        function() {
      // Invalid width.
      expect(function() {
        return svgFactory.create(-1, 0);
      }).toThrow(new Error('Invalid SVG dimensions'));

      // Invalid height.
      expect(function() {
        return svgFactory.create(0, -1);
      }).toThrow(new Error('Invalid SVG dimensions'));
    });

    it('`create` should return an SVG element if the dimensions are valid',
        function() {
      if (isNodeJS()) {
        pending('Document is not supported in Node.js.');
      }

      const svg = svgFactory.create(20, 40);
      expect(svg instanceof SVGSVGElement).toBe(true);
      expect(svg.getAttribute('version')).toBe('1.1');
      expect(svg.getAttribute('width')).toBe('20px');
      expect(svg.getAttribute('height')).toBe('40px');
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('viewBox')).toBe('0 0 20 40');
    });

    it('`createElement` should throw an error if the type is not a string',
        function() {
      expect(function() {
        return svgFactory.createElement(true);
      }).toThrow(new Error('Invalid SVG element type'));
    });

    it('`createElement` should return an SVG element if the type is valid',
        function() {
      if (isNodeJS()) {
        pending('Document is not supported in Node.js.');
      }

      const svg = svgFactory.createElement('svg:rect');
      expect(svg instanceof SVGRectElement).toBe(true);
    });
  });

  describe('getFilenameFromUrl', function() {
    it('should get the filename from an absolute URL', function() {
      const url = 'https://server.org/filename.pdf';
      expect(getFilenameFromUrl(url)).toEqual('filename.pdf');
    });

    it('should get the filename from a relative URL', function() {
      const url = '../../filename.pdf';
      expect(getFilenameFromUrl(url)).toEqual('filename.pdf');
    });

    it('should get the filename from a URL with an anchor', function() {
      const url = 'https://server.org/filename.pdf#foo';
      expect(getFilenameFromUrl(url)).toEqual('filename.pdf');
    });

    it('should get the filename from a URL with query parameters', function() {
      const url = 'https://server.org/filename.pdf?foo=bar';
      expect(getFilenameFromUrl(url)).toEqual('filename.pdf');
    });
  });

  describe('isValidFetchUrl', function() {
    it('handles invalid Fetch URLs', function() {
      expect(isValidFetchUrl(null)).toEqual(false);
      expect(isValidFetchUrl(100)).toEqual(false);
      expect(isValidFetchUrl('foo')).toEqual(false);
      expect(isValidFetchUrl('/foo', 100)).toEqual(false);
    });

    it('handles relative Fetch URLs', function() {
      expect(isValidFetchUrl('/foo', 'file://www.example.com')).toEqual(false);
      expect(isValidFetchUrl('/foo', 'http://www.example.com')).toEqual(true);
    });

    it('handles unsupported Fetch protocols', function() {
      expect(isValidFetchUrl('file://www.example.com')).toEqual(false);
      expect(isValidFetchUrl('ftp://www.example.com')).toEqual(false);
    });

    it('handles supported Fetch protocols', function() {
      expect(isValidFetchUrl('http://www.example.com')).toEqual(true);
      expect(isValidFetchUrl('https://www.example.com')).toEqual(true);
    });
  });
});
