/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _annotation = require("../../core/annotation");

var _util = require("../../shared/util");

var _test_utils = require("./test_utils");

var _primitives = require("../../core/primitives");

var _parser = require("../../core/parser");

var _stream = require("../../core/stream");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

describe('annotation', function () {
  var PDFManagerMock =
  /*#__PURE__*/
  function () {
    function PDFManagerMock(params) {
      _classCallCheck(this, PDFManagerMock);

      this.docBaseUrl = params.docBaseUrl || null;
    }

    _createClass(PDFManagerMock, [{
      key: "ensure",
      value: function ensure(obj, prop, args) {
        return new Promise(function (resolve) {
          var value = obj[prop];

          if (typeof value === 'function') {
            resolve(value.apply(obj, args));
          } else {
            resolve(value);
          }
        });
      }
    }]);

    return PDFManagerMock;
  }();

  var pdfManagerMock, idFactoryMock;
  beforeAll(function (done) {
    pdfManagerMock = new PDFManagerMock({
      docBaseUrl: null
    });
    idFactoryMock = (0, _test_utils.createIdFactory)(0);
    done();
  });
  afterAll(function () {
    pdfManagerMock = null;
    idFactoryMock = null;
  });
  describe('AnnotationFactory', function () {
    it('should get id for annotation', function (done) {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));

      var annotationRef = _primitives.Ref.get(10, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref) {
        var data = _ref.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual('10R');
        done();
      }, done.fail);
    });
    it('should handle, and get fallback IDs for, annotations that are not ' + 'indirect objects (issue 7569)', function (done) {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      var xref = new _test_utils.XRefMock();
      var idFactory = (0, _test_utils.createIdFactory)(0);

      var annotation1 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory).then(function (_ref2) {
        var data = _ref2.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual('annot_p0_1');
      });

      var annotation2 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory).then(function (_ref3) {
        var data = _ref3.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual('annot_p0_2');
      });

      Promise.all([annotation1, annotation2]).then(done, done.fail);
    });
    it('should handle missing /Subtype', function (done) {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));

      var annotationRef = _primitives.Ref.get(1, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref4) {
        var data = _ref4.data;
        expect(data.annotationType).toBeUndefined();
        done();
      }, done.fail);
    });
  });
  describe('Annotation', function () {
    var dict, ref;
    beforeAll(function (done) {
      dict = new _primitives.Dict();
      ref = _primitives.Ref.get(1, 0);
      done();
    });
    afterAll(function () {
      dict = ref = null;
    });
    it('should set and get valid contents', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setContents('Foo bar baz');
      expect(annotation.contents).toEqual('Foo bar baz');
    });
    it('should not set and get invalid contents', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setContents(undefined);
      expect(annotation.contents).toEqual('');
    });
    it('should set and get a valid modification date', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setModificationDate('D:20190422');
      expect(annotation.modificationDate).toEqual('D:20190422');
    });
    it('should not set and get an invalid modification date', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setModificationDate(undefined);
      expect(annotation.modificationDate).toEqual(null);
    });
    it('should set and get flags', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setFlags(13);
      expect(annotation.hasFlag(_util.AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.READONLY)).toEqual(false);
    });
    it('should be viewable and not printable by default', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      expect(annotation.viewable).toEqual(true);
      expect(annotation.printable).toEqual(false);
    });
    it('should set and get a valid rectangle', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setRectangle([117, 694, 164.298, 720]);
      expect(annotation.rectangle).toEqual([117, 694, 164.298, 720]);
    });
    it('should not set and get an invalid rectangle', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setRectangle([117, 694, 164.298]);
      expect(annotation.rectangle).toEqual([0, 0, 0, 0]);
    });
    it('should reject a color if it is not an array', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor('red');
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
    it('should set and get a transparent color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([]);
      expect(annotation.color).toEqual(null);
    });
    it('should set and get a grayscale color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0.4]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
    });
    it('should set and get an RGB color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0, 0, 1]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
    });
    it('should set and get a CMYK color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([234, 59, 48]));
    });
    it('should not set and get an invalid color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0.4, 0.6]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
  });
  describe('AnnotationBorderStyle', function () {
    it('should set and get a valid width', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setWidth(3);
      expect(borderStyle.width).toEqual(3);
    });
    it('should not set and get an invalid width', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setWidth('three');
      expect(borderStyle.width).toEqual(1);
    });
    it('should set the width to zero, when the input is a `Name` (issue 10385)', function () {
      var borderStyleZero = new _annotation.AnnotationBorderStyle();
      borderStyleZero.setWidth(_primitives.Name.get('0'));
      var borderStyleFive = new _annotation.AnnotationBorderStyle();
      borderStyleFive.setWidth(_primitives.Name.get('5'));
      expect(borderStyleZero.width).toEqual(0);
      expect(borderStyleFive.width).toEqual(0);
    });
    it('should set and get a valid style', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setStyle(_primitives.Name.get('D'));
      expect(borderStyle.style).toEqual(_util.AnnotationBorderStyleType.DASHED);
    });
    it('should not set and get an invalid style', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setStyle('Dashed');
      expect(borderStyle.style).toEqual(_util.AnnotationBorderStyleType.SOLID);
    });
    it('should set and get a valid dash array', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setDashArray([1, 2, 3]);
      expect(borderStyle.dashArray).toEqual([1, 2, 3]);
    });
    it('should not set and get an invalid dash array', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setDashArray([0, 0]);
      expect(borderStyle.dashArray).toEqual([3]);
    });
    it('should set and get a valid horizontal corner radius', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius(3);
      expect(borderStyle.horizontalCornerRadius).toEqual(3);
    });
    it('should not set and get an invalid horizontal corner radius', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius('three');
      expect(borderStyle.horizontalCornerRadius).toEqual(0);
    });
    it('should set and get a valid vertical corner radius', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius(3);
      expect(borderStyle.verticalCornerRadius).toEqual(3);
    });
    it('should not set and get an invalid vertical corner radius', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius('three');
      expect(borderStyle.verticalCornerRadius).toEqual(0);
    });
  });
  describe('MarkupAnnotation', function () {
    var dict, ref;
    beforeAll(function (done) {
      dict = new _primitives.Dict();
      ref = _primitives.Ref.get(1, 0);
      done();
    });
    afterAll(function () {
      dict = ref = null;
    });
    it('should set and get a valid creation date', function () {
      var markupAnnotation = new _annotation.MarkupAnnotation({
        dict: dict,
        ref: ref
      });
      markupAnnotation.setCreationDate('D:20190422');
      expect(markupAnnotation.creationDate).toEqual('D:20190422');
    });
    it('should not set and get an invalid creation date', function () {
      var markupAnnotation = new _annotation.MarkupAnnotation({
        dict: dict,
        ref: ref
      });
      markupAnnotation.setCreationDate(undefined);
      expect(markupAnnotation.creationDate).toEqual(null);
    });
  });
  describe('LinkAnnotation', function () {
    it('should correctly parse a URI action', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('URI'));
      actionDict.set('URI', 'http://www.ctan.org/tex-archive/info/lshort');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(820, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref5) {
        var data = _ref5.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual('http://www.ctan.org/tex-archive/info/lshort');
        expect(data.unsafeUrl).toEqual('http://www.ctan.org/tex-archive/info/lshort');
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it('should correctly parse a URI action, where the URI entry ' + 'is missing a protocol', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('URI'));
      actionDict.set('URI', 'www.hmrc.gov.uk');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(353, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref6) {
        var data = _ref6.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual('http://www.hmrc.gov.uk/');
        expect(data.unsafeUrl).toEqual('http://www.hmrc.gov.uk');
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it('should correctly parse a URI action, where the URI entry ' + 'has an incorrect encoding (bug 1122280)', function (done) {
      var actionStream = new _stream.StringStream('<<\n' + '/Type /Action\n' + '/S /URI\n' + '/URI (http://www.example.com/\\303\\274\\303\\266\\303\\244)\n' + '>>\n');
      var lexer = new _parser.Lexer(actionStream);
      var parser = new _parser.Parser(lexer);
      var actionDict = parser.getObj();
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(8, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref7) {
        var data = _ref7.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL((0, _util.stringToUTF8String)('http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4')).href);
        expect(data.unsafeUrl).toEqual((0, _util.stringToUTF8String)('http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4'));
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it('should correctly parse a GoTo action', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoTo'));
      actionDict.set('D', 'page.157');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(798, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref8) {
        var data = _ref8.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual('page.157');
        done();
      }, done.fail);
    });
    it('should correctly parse a GoToR action, where the FileSpec entry ' + 'is a string containing a relative URL', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', '../../0013/001346/134685E.pdf');
      actionDict.set('D', '4.3');
      actionDict.set('NewWindow', true);
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(489, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref9) {
        var data = _ref9.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
        done();
      }, done.fail);
    });
    it('should correctly parse a GoToR action, containing a relative URL, ' + 'with the "docBaseUrl" parameter specified', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', '../../0013/001346/134685E.pdf');
      actionDict.set('D', '4.3');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(489, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var pdfManager = new PDFManagerMock({
        docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf'
      });

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock).then(function (_ref10) {
        var data = _ref10.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual('http://www.example.com/0013/001346/134685E.pdf#4.3');
        expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it('should correctly parse a GoToR action, with named destination', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', '15');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(495, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref11) {
        var data = _ref11.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual('http://www.example.com/test.pdf#15');
        expect(data.unsafeUrl).toEqual('http://www.example.com/test.pdf#15');
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });
    it('should correctly parse a GoToR action, with explicit destination array', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', [14, _primitives.Name.get('XYZ'), null, 298.043, null]);
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(489, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref12) {
        var data = _ref12.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL('http://www.example.com/test.pdf#' + '[14,{"name":"XYZ"},null,298.043,null]').href);
        expect(data.unsafeUrl).toEqual('http://www.example.com/test.pdf#' + '[14,{"name":"XYZ"},null,298.043,null]');
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });
    it('should correctly parse a Launch action, where the FileSpec dict ' + 'contains a relative URL, with the "docBaseUrl" parameter specified', function (done) {
      var fileSpecDict = new _primitives.Dict();
      fileSpecDict.set('Type', _primitives.Name.get('FileSpec'));
      fileSpecDict.set('F', 'Part II/Part II.pdf');
      fileSpecDict.set('UF', 'Part II/Part II.pdf');
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('Launch'));
      actionDict.set('F', fileSpecDict);
      actionDict.set('NewWindow', true);
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(88, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var pdfManager = new PDFManagerMock({
        docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf'
      });

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock).then(function (_ref13) {
        var data = _ref13.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL('http://www.example.com/test/pdfs/Part II/Part II.pdf').href);
        expect(data.unsafeUrl).toEqual('Part II/Part II.pdf');
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
        done();
      }, done.fail);
    });
    it('should recover valid URLs from JavaScript actions having certain ' + 'white-listed formats', function (done) {
      function checkJsAction(params) {
        var jsEntry = params.jsEntry;
        var expectedUrl = params.expectedUrl;
        var expectedUnsafeUrl = params.expectedUnsafeUrl;
        var expectedNewWindow = params.expectedNewWindow;
        var actionDict = new _primitives.Dict();
        actionDict.set('Type', _primitives.Name.get('Action'));
        actionDict.set('S', _primitives.Name.get('JavaScript'));
        actionDict.set('JS', jsEntry);
        var annotationDict = new _primitives.Dict();
        annotationDict.set('Type', _primitives.Name.get('Annot'));
        annotationDict.set('Subtype', _primitives.Name.get('Link'));
        annotationDict.set('A', actionDict);

        var annotationRef = _primitives.Ref.get(46, 0);

        var xref = new _test_utils.XRefMock([{
          ref: annotationRef,
          data: annotationDict
        }]);
        return _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref14) {
          var data = _ref14.data;
          expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
          expect(data.url).toEqual(expectedUrl);
          expect(data.unsafeUrl).toEqual(expectedUnsafeUrl);
          expect(data.dest).toBeUndefined();
          expect(data.newWindow).toEqual(expectedNewWindow);
        });
      }

      var annotation1 = checkJsAction({
        jsEntry: 'function someFun() { return "qwerty"; } someFun();',
        expectedUrl: undefined,
        expectedUnsafeUrl: undefined,
        expectedNewWindow: undefined
      });
      var annotation2 = checkJsAction({
        jsEntry: 'window.open(\'http://www.example.com/test.pdf\')',
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
        expectedNewWindow: undefined
      });
      var annotation3 = checkJsAction({
        jsEntry: new _stream.StringStream('app.launchURL("http://www.example.com/test.pdf", true)'),
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
        expectedNewWindow: true
      });
      Promise.all([annotation1, annotation2, annotation3]).then(done, done.fail);
    });
    it('should correctly parse a Named action', function (done) {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('Named'));
      actionDict.set('N', _primitives.Name.get('GoToPage'));
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = _primitives.Ref.get(12, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref15) {
        var data = _ref15.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.action).toEqual('GoToPage');
        done();
      }, done.fail);
    });
    it('should correctly parse a simple Dest', function (done) {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', _primitives.Name.get('LI0'));

      var annotationRef = _primitives.Ref.get(583, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref16) {
        var data = _ref16.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual('LI0');
        done();
      }, done.fail);
    });
    it('should correctly parse a simple Dest, with explicit destination array', function (done) {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', [_primitives.Ref.get(17, 0), _primitives.Name.get('XYZ'), 0, 841.89, null]);

      var annotationRef = _primitives.Ref.get(10, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref17) {
        var data = _ref17.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual([{
          num: 17,
          gen: 0
        }, {
          name: 'XYZ'
        }, 0, 841.89, null]);
        done();
      }, done.fail);
    });
    it('should correctly parse a Dest, which violates the specification ' + 'by containing a dictionary', function (done) {
      var destDict = new _primitives.Dict();
      destDict.set('Type', _primitives.Name.get('Action'));
      destDict.set('S', _primitives.Name.get('GoTo'));
      destDict.set('D', 'page.157');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', destDict);

      var annotationRef = _primitives.Ref.get(798, 0);

      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(function (_ref18) {
        var data = _ref18.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual('page.157');
        done();
      }, done.fail);
    });
  });
  describe('WidgetAnnotation', function () {
    var widgetDict;
    beforeEach(function (done) {
      widgetDict = new _primitives.Dict();
      widgetDict.set('Type', _primitives.Name.get('Annot'));
      widgetDict.set('Subtype', _primitives.Name.get('Widget'));
      done();
    });
    afterEach(function () {
      widgetDict = null;
    });
    it('should handle unknown field names', function (done) {
      var widgetRef = _primitives.Ref.get(20, 0);

      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(function (_ref19) {
        var data = _ref19.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual('');
        done();
      }, done.fail);
    });
    it('should construct the field name when there are no ancestors', function (done) {
      widgetDict.set('T', 'foo');

      var widgetRef = _primitives.Ref.get(21, 0);

      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(function (_ref20) {
        var data = _ref20.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual('foo');
        done();
      }, done.fail);
    });
    it('should construct the field name when there are ancestors', function (done) {
      var firstParent = new _primitives.Dict();
      firstParent.set('T', 'foo');
      var secondParent = new _primitives.Dict();
      secondParent.set('Parent', firstParent);
      secondParent.set('T', 'bar');
      widgetDict.set('Parent', secondParent);
      widgetDict.set('T', 'baz');

      var widgetRef = _primitives.Ref.get(22, 0);

      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(function (_ref21) {
        var data = _ref21.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual('foo.bar.baz');
        done();
      }, done.fail);
    });
    it('should construct the field name if a parent is not a dictionary ' + '(issue 8143)', function (done) {
      var parentDict = new _primitives.Dict();
      parentDict.set('Parent', null);
      parentDict.set('T', 'foo');
      widgetDict.set('Parent', parentDict);
      widgetDict.set('T', 'bar');

      var widgetRef = _primitives.Ref.get(22, 0);

      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(function (_ref22) {
        var data = _ref22.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual('foo.bar');
        done();
      }, done.fail);
    });
  });
  describe('TextWidgetAnnotation', function () {
    var textWidgetDict;
    beforeEach(function (done) {
      textWidgetDict = new _primitives.Dict();
      textWidgetDict.set('Type', _primitives.Name.get('Annot'));
      textWidgetDict.set('Subtype', _primitives.Name.get('Widget'));
      textWidgetDict.set('FT', _primitives.Name.get('Tx'));
      done();
    });
    afterEach(function () {
      textWidgetDict = null;
    });
    it('should handle unknown text alignment, maximum length and flags', function (done) {
      var textWidgetRef = _primitives.Ref.get(124, 0);

      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref23) {
        var data = _ref23.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(null);
        expect(data.maxLen).toEqual(null);
        expect(data.readOnly).toEqual(false);
        expect(data.multiLine).toEqual(false);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it('should not set invalid text alignment, maximum length and flags', function (done) {
      textWidgetDict.set('Q', 'center');
      textWidgetDict.set('MaxLen', 'five');
      textWidgetDict.set('Ff', 'readonly');

      var textWidgetRef = _primitives.Ref.get(43, 0);

      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref24) {
        var data = _ref24.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(null);
        expect(data.maxLen).toEqual(null);
        expect(data.readOnly).toEqual(false);
        expect(data.multiLine).toEqual(false);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it('should set valid text alignment, maximum length and flags', function (done) {
      textWidgetDict.set('Q', 1);
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.MULTILINE);

      var textWidgetRef = _primitives.Ref.get(84, 0);

      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref25) {
        var data = _ref25.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(1);
        expect(data.maxLen).toEqual(20);
        expect(data.readOnly).toEqual(true);
        expect(data.multiLine).toEqual(true);
        done();
      }, done.fail);
    });
    it('should reject comb fields without a maximum length', function (done) {
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.COMB);

      var textWidgetRef = _primitives.Ref.get(46, 0);

      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref26) {
        var data = _ref26.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it('should accept comb fields with a maximum length', function (done) {
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.COMB);

      var textWidgetRef = _primitives.Ref.get(46, 0);

      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref27) {
        var data = _ref27.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.comb).toEqual(true);
        done();
      }, done.fail);
    });
    it('should only accept comb fields when the flags are valid', function (done) {
      var invalidFieldFlags = [_util.AnnotationFieldFlag.MULTILINE, _util.AnnotationFieldFlag.PASSWORD, _util.AnnotationFieldFlag.FILESELECT];
      var flags = _util.AnnotationFieldFlag.COMB + _util.AnnotationFieldFlag.MULTILINE + _util.AnnotationFieldFlag.PASSWORD + _util.AnnotationFieldFlag.FILESELECT;
      var promise = Promise.resolve();

      for (var i = 0, ii = invalidFieldFlags.length; i <= ii; i++) {
        promise = promise.then(function () {
          textWidgetDict.set('MaxLen', 20);
          textWidgetDict.set('Ff', flags);

          var textWidgetRef = _primitives.Ref.get(93, 0);

          var xref = new _test_utils.XRefMock([{
            ref: textWidgetRef,
            data: textWidgetDict
          }]);
          return _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref28) {
            var data = _ref28.data;
            expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
            var valid = invalidFieldFlags.length === 0;
            expect(data.comb).toEqual(valid);

            if (!valid) {
              flags -= invalidFieldFlags.pop();
            }
          });
        });
      }

      promise.then(done, done.fail);
    });
  });
  describe('ButtonWidgetAnnotation', function () {
    var buttonWidgetDict;
    beforeEach(function (done) {
      buttonWidgetDict = new _primitives.Dict();
      buttonWidgetDict.set('Type', _primitives.Name.get('Annot'));
      buttonWidgetDict.set('Subtype', _primitives.Name.get('Widget'));
      buttonWidgetDict.set('FT', _primitives.Name.get('Btn'));
      done();
    });
    afterEach(function () {
      buttonWidgetDict = null;
    });
    it('should handle checkboxes with export value', function (done) {
      buttonWidgetDict.set('V', _primitives.Name.get('1'));
      var appearanceStatesDict = new _primitives.Dict();
      var exportValueOptionsDict = new _primitives.Dict();
      exportValueOptionsDict.set('Off', 0);
      exportValueOptionsDict.set('Checked', 1);
      appearanceStatesDict.set('D', exportValueOptionsDict);
      buttonWidgetDict.set('AP', appearanceStatesDict);

      var buttonWidgetRef = _primitives.Ref.get(124, 0);

      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref29) {
        var data = _ref29.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual('1');
        expect(data.radioButton).toEqual(false);
        expect(data.exportValue).toEqual('Checked');
        done();
      }, done.fail);
    });
    it('should handle checkboxes without export value', function (done) {
      buttonWidgetDict.set('V', _primitives.Name.get('1'));

      var buttonWidgetRef = _primitives.Ref.get(124, 0);

      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref30) {
        var data = _ref30.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual('1');
        expect(data.radioButton).toEqual(false);
        done();
      }, done.fail);
    });
    it('should handle radio buttons with a field value', function (done) {
      var parentDict = new _primitives.Dict();
      parentDict.set('V', _primitives.Name.get('1'));
      var normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set('2', null);
      var appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set('N', normalAppearanceStateDict);
      buttonWidgetDict.set('Ff', _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set('Parent', parentDict);
      buttonWidgetDict.set('AP', appearanceStatesDict);

      var buttonWidgetRef = _primitives.Ref.get(124, 0);

      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref31) {
        var data = _ref31.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual('1');
        expect(data.buttonValue).toEqual('2');
        done();
      }, done.fail);
    });
    it('should handle radio buttons without a field value', function (done) {
      var normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set('2', null);
      var appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set('N', normalAppearanceStateDict);
      buttonWidgetDict.set('Ff', _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set('AP', appearanceStatesDict);

      var buttonWidgetRef = _primitives.Ref.get(124, 0);

      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref32) {
        var data = _ref32.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual(null);
        expect(data.buttonValue).toEqual('2');
        done();
      }, done.fail);
    });
  });
  describe('ChoiceWidgetAnnotation', function () {
    var choiceWidgetDict;
    beforeEach(function (done) {
      choiceWidgetDict = new _primitives.Dict();
      choiceWidgetDict.set('Type', _primitives.Name.get('Annot'));
      choiceWidgetDict.set('Subtype', _primitives.Name.get('Widget'));
      choiceWidgetDict.set('FT', _primitives.Name.get('Ch'));
      done();
    });
    afterEach(function () {
      choiceWidgetDict = null;
    });
    it('should handle missing option arrays', function (done) {
      var choiceWidgetRef = _primitives.Ref.get(122, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref33) {
        var data = _ref33.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual([]);
        done();
      }, done.fail);
    });
    it('should handle option arrays with array elements', function (done) {
      var optionBarRef = _primitives.Ref.get(20, 0);

      var optionBarStr = 'Bar';

      var optionOneRef = _primitives.Ref.get(10, 0);

      var optionOneArr = ['bar_export', optionBarRef];
      var options = [['foo_export', 'Foo'], optionOneRef];
      var expected = [{
        exportValue: 'foo_export',
        displayValue: 'Foo'
      }, {
        exportValue: 'bar_export',
        displayValue: 'Bar'
      }];
      choiceWidgetDict.set('Opt', options);

      var choiceWidgetRef = _primitives.Ref.get(123, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }, {
        ref: optionBarRef,
        data: optionBarStr
      }, {
        ref: optionOneRef,
        data: optionOneArr
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref34) {
        var data = _ref34.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it('should handle option arrays with string elements', function (done) {
      var optionBarRef = _primitives.Ref.get(10, 0);

      var optionBarStr = 'Bar';
      var options = ['Foo', optionBarRef];
      var expected = [{
        exportValue: 'Foo',
        displayValue: 'Foo'
      }, {
        exportValue: 'Bar',
        displayValue: 'Bar'
      }];
      choiceWidgetDict.set('Opt', options);

      var choiceWidgetRef = _primitives.Ref.get(981, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }, {
        ref: optionBarRef,
        data: optionBarStr
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref35) {
        var data = _ref35.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it('should handle inherited option arrays (issue 8094)', function (done) {
      var options = [['Value1', 'Description1'], ['Value2', 'Description2']];
      var expected = [{
        exportValue: 'Value1',
        displayValue: 'Description1'
      }, {
        exportValue: 'Value2',
        displayValue: 'Description2'
      }];
      var parentDict = new _primitives.Dict();
      parentDict.set('Opt', options);
      choiceWidgetDict.set('Parent', parentDict);

      var choiceWidgetRef = _primitives.Ref.get(123, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref36) {
        var data = _ref36.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it('should sanitize display values in option arrays (issue 8947)', function (done) {
      var options = ['\xFE\xFF\x00F\x00o\x00o'];
      var expected = [{
        exportValue: '\xFE\xFF\x00F\x00o\x00o',
        displayValue: 'Foo'
      }];
      choiceWidgetDict.set('Opt', options);

      var choiceWidgetRef = _primitives.Ref.get(984, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref37) {
        var data = _ref37.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it('should handle array field values', function (done) {
      var fieldValue = ['Foo', 'Bar'];
      choiceWidgetDict.set('V', fieldValue);

      var choiceWidgetRef = _primitives.Ref.get(968, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref38) {
        var data = _ref38.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldValue).toEqual(fieldValue);
        done();
      }, done.fail);
    });
    it('should handle string field values', function (done) {
      var fieldValue = 'Foo';
      choiceWidgetDict.set('V', fieldValue);

      var choiceWidgetRef = _primitives.Ref.get(978, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref39) {
        var data = _ref39.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldValue).toEqual([fieldValue]);
        done();
      }, done.fail);
    });
    it('should handle unknown flags', function (done) {
      var choiceWidgetRef = _primitives.Ref.get(166, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref40) {
        var data = _ref40.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });
    it('should not set invalid flags', function (done) {
      choiceWidgetDict.set('Ff', 'readonly');

      var choiceWidgetRef = _primitives.Ref.get(165, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref41) {
        var data = _ref41.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });
    it('should set valid flags', function (done) {
      choiceWidgetDict.set('Ff', _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.COMBO + _util.AnnotationFieldFlag.MULTISELECT);

      var choiceWidgetRef = _primitives.Ref.get(512, 0);

      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(function (_ref42) {
        var data = _ref42.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(true);
        expect(data.combo).toEqual(true);
        expect(data.multiSelect).toEqual(true);
        done();
      }, done.fail);
    });
  });
  describe('LineAnnotation', function () {
    it('should set the line coordinates', function (done) {
      var lineDict = new _primitives.Dict();
      lineDict.set('Type', _primitives.Name.get('Annot'));
      lineDict.set('Subtype', _primitives.Name.get('Line'));
      lineDict.set('L', [1, 2, 3, 4]);

      var lineRef = _primitives.Ref.get(122, 0);

      var xref = new _test_utils.XRefMock([{
        ref: lineRef,
        data: lineDict
      }]);

      _annotation.AnnotationFactory.create(xref, lineRef, pdfManagerMock, idFactoryMock).then(function (_ref43) {
        var data = _ref43.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINE);
        expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
        done();
      }, done.fail);
    });
  });
  describe('FileAttachmentAnnotation', function () {
    it('should correctly parse a file attachment', function (done) {
      var fileStream = new _stream.StringStream('<<\n' + '/Type /EmbeddedFile\n' + '/Subtype /text#2Fplain\n' + '>>\n' + 'stream\n' + 'Test attachment' + 'endstream\n');
      var lexer = new _parser.Lexer(fileStream);
      var parser = new _parser.Parser(lexer, true);

      var fileStreamRef = _primitives.Ref.get(18, 0);

      var fileStreamDict = parser.getObj();
      var embeddedFileDict = new _primitives.Dict();
      embeddedFileDict.set('F', fileStreamRef);

      var fileSpecRef = _primitives.Ref.get(19, 0);

      var fileSpecDict = new _primitives.Dict();
      fileSpecDict.set('Type', _primitives.Name.get('Filespec'));
      fileSpecDict.set('Desc', '');
      fileSpecDict.set('EF', embeddedFileDict);
      fileSpecDict.set('UF', 'Test.txt');

      var fileAttachmentRef = _primitives.Ref.get(20, 0);

      var fileAttachmentDict = new _primitives.Dict();
      fileAttachmentDict.set('Type', _primitives.Name.get('Annot'));
      fileAttachmentDict.set('Subtype', _primitives.Name.get('FileAttachment'));
      fileAttachmentDict.set('FS', fileSpecRef);
      fileAttachmentDict.set('T', 'Topic');
      fileAttachmentDict.set('Contents', 'Test.txt');
      var xref = new _test_utils.XRefMock([{
        ref: fileStreamRef,
        data: fileStreamDict
      }, {
        ref: fileSpecRef,
        data: fileSpecDict
      }, {
        ref: fileAttachmentRef,
        data: fileAttachmentDict
      }]);
      embeddedFileDict.assignXref(xref);
      fileSpecDict.assignXref(xref);
      fileAttachmentDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, fileAttachmentRef, pdfManagerMock, idFactoryMock).then(function (_ref44) {
        var data = _ref44.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.FILEATTACHMENT);
        expect(data.file.filename).toEqual('Test.txt');
        expect(data.file.content).toEqual((0, _util.stringToBytes)('Test attachment'));
        done();
      }, done.fail);
    });
  });
  describe('PopupAnnotation', function () {
    it('should inherit properties from its parent', function (done) {
      var parentDict = new _primitives.Dict();
      parentDict.set('Type', _primitives.Name.get('Annot'));
      parentDict.set('Subtype', _primitives.Name.get('Text'));
      parentDict.set('M', 'D:20190423');
      parentDict.set('C', [0, 0, 1]);
      var popupDict = new _primitives.Dict();
      popupDict.set('Type', _primitives.Name.get('Annot'));
      popupDict.set('Subtype', _primitives.Name.get('Popup'));
      popupDict.set('Parent', parentDict);

      var popupRef = _primitives.Ref.get(13, 0);

      var xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(function (_ref45) {
        var data = _ref45.data,
            viewable = _ref45.viewable;
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.modificationDate).toEqual('D:20190423');
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
        done();
      }, done.fail);
    });
    it('should handle missing parent properties', function (done) {
      var parentDict = new _primitives.Dict();
      parentDict.set('Type', _primitives.Name.get('Annot'));
      parentDict.set('Subtype', _primitives.Name.get('Text'));
      var popupDict = new _primitives.Dict();
      popupDict.set('Type', _primitives.Name.get('Annot'));
      popupDict.set('Subtype', _primitives.Name.get('Popup'));
      popupDict.set('Parent', parentDict);

      var popupRef = _primitives.Ref.get(13, 0);

      var xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(function (_ref46) {
        var data = _ref46.data,
            viewable = _ref46.viewable;
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.modificationDate).toEqual(null);
        expect(data.color).toEqual(null);
        done();
      }, done.fail);
    });
    it('should inherit the parent flags when the Popup is not viewable, ' + 'but the parent is (PR 7352)', function (done) {
      var parentDict = new _primitives.Dict();
      parentDict.set('Type', _primitives.Name.get('Annot'));
      parentDict.set('Subtype', _primitives.Name.get('Text'));
      parentDict.set('F', 28);
      var popupDict = new _primitives.Dict();
      popupDict.set('Type', _primitives.Name.get('Annot'));
      popupDict.set('Subtype', _primitives.Name.get('Popup'));
      popupDict.set('F', 25);
      popupDict.set('Parent', parentDict);

      var popupRef = _primitives.Ref.get(13, 0);

      var xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(function (_ref47) {
        var data = _ref47.data,
            viewable = _ref47.viewable;
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.annotationFlags).toEqual(25);
        expect(viewable).toEqual(true);
        done();
      }, done.fail);
    });
  });
  describe('InkAnnotation', function () {
    it('should handle a single ink list', function (done) {
      var inkDict = new _primitives.Dict();
      inkDict.set('Type', _primitives.Name.get('Annot'));
      inkDict.set('Subtype', _primitives.Name.get('Ink'));
      inkDict.set('InkList', [[1, 1, 1, 2, 2, 2, 3, 3]]);

      var inkRef = _primitives.Ref.get(142, 0);

      var xref = new _test_utils.XRefMock([{
        ref: inkRef,
        data: inkDict
      }]);

      _annotation.AnnotationFactory.create(xref, inkRef, pdfManagerMock, idFactoryMock).then(function (_ref48) {
        var data = _ref48.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.INK);
        expect(data.inkLists.length).toEqual(1);
        expect(data.inkLists[0]).toEqual([{
          x: 1,
          y: 1
        }, {
          x: 1,
          y: 2
        }, {
          x: 2,
          y: 2
        }, {
          x: 3,
          y: 3
        }]);
        done();
      }, done.fail);
    });
    it('should handle multiple ink lists', function (done) {
      var inkDict = new _primitives.Dict();
      inkDict.set('Type', _primitives.Name.get('Annot'));
      inkDict.set('Subtype', _primitives.Name.get('Ink'));
      inkDict.set('InkList', [[1, 1, 1, 2], [3, 3, 4, 5]]);

      var inkRef = _primitives.Ref.get(143, 0);

      var xref = new _test_utils.XRefMock([{
        ref: inkRef,
        data: inkDict
      }]);

      _annotation.AnnotationFactory.create(xref, inkRef, pdfManagerMock, idFactoryMock).then(function (_ref49) {
        var data = _ref49.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.INK);
        expect(data.inkLists.length).toEqual(2);
        expect(data.inkLists[0]).toEqual([{
          x: 1,
          y: 1
        }, {
          x: 1,
          y: 2
        }]);
        expect(data.inkLists[1]).toEqual([{
          x: 3,
          y: 3
        }, {
          x: 4,
          y: 5
        }]);
        done();
      }, done.fail);
    });
  });
});