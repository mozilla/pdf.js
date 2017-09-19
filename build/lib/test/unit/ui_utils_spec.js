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

var _ui_utils = require('../../web/ui_utils');

var _util = require('../../shared/util');

describe('ui_utils', function () {
  describe('binary search', function () {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }
    it('empty array', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([], isTrue)).toEqual(0);
    });
    it('single boolean entry', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([false], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([true], isTrue)).toEqual(0);
    });
    it('three boolean entries', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([true, true, true], isTrue)).toEqual(0);
      expect((0, _ui_utils.binarySearchFirstItem)([false, true, true], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, true], isTrue)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, false], isTrue)).toEqual(3);
    });
    it('three numeric entries', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([0, 1, 2], isGreater3)).toEqual(3);
      expect((0, _ui_utils.binarySearchFirstItem)([2, 3, 4], isGreater3)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([4, 5, 6], isGreater3)).toEqual(0);
    });
  });
  describe('getPDFFileNameFromURL', function () {
    it('gets PDF filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.pdf')).toEqual('file2.pdf');
    });
    it('gets fallback filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.txt')).toEqual('document.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.txt')).toEqual('document.pdf');
    });
    it('gets custom fallback filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.txt', 'qwerty1.pdf')).toEqual('qwerty1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.txt', 'qwerty2.pdf')).toEqual('qwerty2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file3.txt', '')).toEqual('');
    });
    it('gets PDF filename from URL containing leading/trailing whitespace', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('   /pdfs/file1.pdf   ')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('   http://www.example.com/pdfs/file2.pdf   ')).toEqual('file2.pdf');
    });
    it('gets PDF filename from query string', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/pdfs.html?name=file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/pdf.html?file2.pdf')).toEqual('file2.pdf');
    });
    it('gets PDF filename from hash string', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/pdfs.html#name=file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/pdf.html#file2.pdf')).toEqual('file2.pdf');
    });
    it('gets correct PDF filename when multiple ones are present', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.pdf?name=file.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.pdf#file.pdf')).toEqual('file2.pdf');
    });
    it('gets PDF filename from URI-encoded data', function () {
      var encodedUrl = encodeURIComponent('http://www.example.com/pdfs/file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrl)).toEqual('file1.pdf');
      var encodedUrlWithQuery = encodeURIComponent('http://www.example.com/pdfs/file.txt?file2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrlWithQuery)).toEqual('file2.pdf');
    });
    it('gets PDF filename from data mistaken for URI-encoded', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/%AA.pdf')).toEqual('%AA.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/%2F.pdf')).toEqual('%2F.pdf');
    });
    it('gets PDF filename from (some) standard protocols', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('https://www.example.com/file2.pdf')).toEqual('file2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('file:///path/to/files/file3.pdf')).toEqual('file3.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('ftp://www.example.com/file4.pdf')).toEqual('file4.pdf');
    });
    it('gets PDF filename from query string appended to "blob:" URL', function () {
      if ((0, _util.isNodeJS)()) {
        pending('Blob in not supported in Node.js.');
      }
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var blobUrl = (0, _util.createObjectURL)(typedArray, 'application/pdf');
      expect(blobUrl.indexOf('blob:') === 0).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(blobUrl + '?file.pdf')).toEqual('file.pdf');
    });
    it('gets fallback filename from query string appended to "data:" URL', function () {
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var dataUrl = (0, _util.createObjectURL)(typedArray, 'application/pdf', true);
      expect(dataUrl.indexOf('data:') === 0).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(dataUrl + '?file1.pdf')).toEqual('document.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('     ' + dataUrl + '?file2.pdf')).toEqual('document.pdf');
    });
  });
  describe('EventBus', function () {
    it('dispatch event', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch different event', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('nottest');
      expect(count).toEqual(0);
    });
    it('dispatch event multiple times', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.dispatch('test');
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch event to multiple handlers', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      var listener = function listener() {
        count++;
      };
      eventBus.on('test', listener);
      eventBus.dispatch('test');
      eventBus.off('test', listener);
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch to wrong detached', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.off('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached during handling', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      var listener1 = function listener1() {
        eventBus.off('test', listener2);
        count++;
      };
      var listener2 = function listener2() {
        eventBus.off('test', listener1);
        count++;
      };
      eventBus.on('test', listener1);
      eventBus.on('test', listener2);
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
  });
  describe('isValidRotation', function () {
    it('should reject non-integer angles', function () {
      expect((0, _ui_utils.isValidRotation)()).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(null)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(NaN)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)([90])).toEqual(false);
      expect((0, _ui_utils.isValidRotation)('90')).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(90.5)).toEqual(false);
    });
    it('should reject non-multiple of 90 degree angles', function () {
      expect((0, _ui_utils.isValidRotation)(45)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(-123)).toEqual(false);
    });
    it('should accept valid angles', function () {
      expect((0, _ui_utils.isValidRotation)(0)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(90)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(-270)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(540)).toEqual(true);
    });
  });
  describe('waitOnEventOrTimeout', function () {
    var eventBus = void 0;
    beforeAll(function (done) {
      eventBus = new _ui_utils.EventBus();
      done();
    });
    afterAll(function () {
      eventBus = null;
    });
    it('should reject invalid parameters', function (done) {
      var invalidTarget = (0, _ui_utils.waitOnEventOrTimeout)({
        target: 'window',
        name: 'DOMContentLoaded'
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      var invalidName = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: ''
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      var invalidDelay = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: -1000
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      Promise.all([invalidTarget, invalidName, invalidDelay]).then(done, done.fail);
    });
    it('should resolve on event, using the DOM', function (done) {
      if ((0, _util.isNodeJS)()) {
        pending('Document in not supported in Node.js.');
      }
      var button = document.createElement('button');
      var buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: 'click',
        delay: 10000
      });
      button.click();
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it('should resolve on timeout, using the DOM', function (done) {
      if ((0, _util.isNodeJS)()) {
        pending('Document in not supported in Node.js.');
      }
      var button = document.createElement('button');
      var buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: 'click',
        delay: 10
      });
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
    it('should resolve on event, using the EventBus', function (done) {
      var pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: 10000
      });
      eventBus.dispatch('pagerendered');
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it('should resolve on timeout, using the EventBus', function (done) {
      var pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: 10
      });
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
  });
});