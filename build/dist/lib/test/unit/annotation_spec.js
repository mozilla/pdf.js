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

var _annotation = require('../../core/annotation');

var _util = require('../../shared/util');

var _primitives = require('../../core/primitives');

var _parser = require('../../core/parser');

var _stream = require('../../core/stream');

var _test_utils = require('./test_utils');

describe('annotation', function () {
  function PDFManagerMock(params) {
    this.docBaseUrl = params.docBaseUrl || null;
  }
  PDFManagerMock.prototype = {};
  function IdFactoryMock(params) {
    var uniquePrefix = params.prefix || 'p0_';
    var idCounters = { obj: params.startObjId || 0 };
    return {
      createObjId: function createObjId() {
        return uniquePrefix + ++idCounters.obj;
      }
    };
  }
  IdFactoryMock.prototype = {};
  var pdfManagerMock, idFactoryMock;
  beforeAll(function (done) {
    pdfManagerMock = new PDFManagerMock({ docBaseUrl: null });
    idFactoryMock = new IdFactoryMock({});
    done();
  });
  afterAll(function () {
    pdfManagerMock = null;
    idFactoryMock = null;
  });
  describe('AnnotationFactory', function () {
    it('should get id for annotation', function () {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      var annotationRef = new _primitives.Ref(10, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.id).toEqual('10R');
    });
    it('should handle, and get fallback id\'s for, annotations that are not ' + 'indirect objects (issue 7569)', function () {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      var xref = new _test_utils.XRefMock();
      var idFactory = new IdFactoryMock({
        prefix: 'p0_',
        startObjId: 0
      });
      var annotation1 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory);
      var annotation2 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory);
      var data1 = annotation1.data,
          data2 = annotation2.data;
      expect(data1.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data2.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data1.id).toEqual('annot_p0_1');
      expect(data2.id).toEqual('annot_p0_2');
    });
    it('should handle missing /Subtype', function () {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      var annotationRef = new _primitives.Ref(1, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toBeUndefined();
    });
  });
  describe('Annotation', function () {
    var dict, ref;
    beforeAll(function (done) {
      dict = new _primitives.Dict();
      ref = new _primitives.Ref(1, 0);
      done();
    });
    afterAll(function () {
      dict = ref = null;
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
      expect(annotation.color).toEqual(new Uint8Array([0, 0, 0]));
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
      expect(annotation.color).toEqual(new Uint8Array([102, 102, 102]));
    });
    it('should set and get an RGB color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0, 0, 1]);
      expect(annotation.color).toEqual(new Uint8Array([0, 0, 255]));
    });
    it('should set and get a CMYK color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);
      expect(annotation.color).toEqual(new Uint8Array([233, 59, 47]));
    });
    it('should not set and get an invalid color', function () {
      var annotation = new _annotation.Annotation({
        dict: dict,
        ref: ref
      });
      annotation.setColor([0.4, 0.6]);
      expect(annotation.color).toEqual(new Uint8Array([0, 0, 0]));
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
    it('should not set and get an invalid horizontal corner radius', function () {
      var borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius('three');
      expect(borderStyle.verticalCornerRadius).toEqual(0);
    });
  });
  describe('LinkAnnotation', function () {
    it('should correctly parse a URI action', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('URI'));
      actionDict.set('URI', 'http://www.ctan.org/tex-archive/info/lshort');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(820, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual('http://www.ctan.org/tex-archive/info/lshort');
      expect(data.unsafeUrl).toEqual('http://www.ctan.org/tex-archive/info/lshort');
      expect(data.dest).toBeUndefined();
    });
    it('should correctly parse a URI action, where the URI entry ' + 'is missing a protocol', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('URI'));
      actionDict.set('URI', 'www.hmrc.gov.uk');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(353, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual('http://www.hmrc.gov.uk/');
      expect(data.unsafeUrl).toEqual('http://www.hmrc.gov.uk');
      expect(data.dest).toBeUndefined();
    });
    it('should correctly parse a URI action, where the URI entry ' + 'has an incorrect encoding (bug 1122280)', function () {
      var actionStream = new _stream.StringStream('<<\n' + '/Type /Action\n' + '/S /URI\n' + '/URI (http://www.example.com/\\303\\274\\303\\266\\303\\244)\n' + '>>\n');
      var lexer = new _parser.Lexer(actionStream);
      var parser = new _parser.Parser(lexer);
      var actionDict = parser.getObj();
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(8, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual(new URL((0, _util.stringToUTF8String)('http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4')).href);
      expect(data.unsafeUrl).toEqual((0, _util.stringToUTF8String)('http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4'));
      expect(data.dest).toBeUndefined();
    });
    it('should correctly parse a GoTo action', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoTo'));
      actionDict.set('D', 'page.157');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(798, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual('page.157');
    });
    it('should correctly parse a GoToR action, where the FileSpec entry ' + 'is a string containing a relative URL', function () {
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
      var annotationRef = new _primitives.Ref(489, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toEqual(true);
    });
    it('should correctly parse a GoToR action, containing a relative URL, ' + 'with the "docBaseUrl" parameter specified', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', '../../0013/001346/134685E.pdf');
      actionDict.set('D', '4.3');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(489, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var pdfManager = new PDFManagerMock({ docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf' });
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual('http://www.example.com/0013/001346/134685E.pdf#4.3');
      expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
      expect(data.dest).toBeUndefined();
    });
    it('should correctly parse a GoToR action, with named destination', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', '15');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(495, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual('http://www.example.com/test.pdf#15');
      expect(data.unsafeUrl).toEqual('http://www.example.com/test.pdf#15');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
    });
    it('should correctly parse a GoToR action, with explicit destination array', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', [14, _primitives.Name.get('XYZ'), null, 298.043, null]);
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(489, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual(new URL('http://www.example.com/test.pdf#' + '[14,{"name":"XYZ"},null,298.043,null]').href);
      expect(data.unsafeUrl).toEqual('http://www.example.com/test.pdf#' + '[14,{"name":"XYZ"},null,298.043,null]');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
    });
    it('should correctly parse a Launch action, where the FileSpec dict ' + 'contains a relative URL, with the "docBaseUrl" parameter specified', function () {
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
      var annotationRef = new _primitives.Ref(88, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var pdfManager = new PDFManagerMock({ docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf' });
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toEqual(new URL('http://www.example.com/test/pdfs/Part II/Part II.pdf').href);
      expect(data.unsafeUrl).toEqual('Part II/Part II.pdf');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toEqual(true);
    });
    it('should recover valid URLs from JavaScript actions having certain ' + 'white-listed formats', function () {
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
        var annotationRef = new _primitives.Ref(46, 0);
        var xref = new _test_utils.XRefMock([{
          ref: annotationRef,
          data: annotationDict
        }]);
        var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
        var data = annotation.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(expectedUrl);
        expect(data.unsafeUrl).toEqual(expectedUnsafeUrl);
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(expectedNewWindow);
      }
      checkJsAction({
        jsEntry: 'function someFun() { return "qwerty"; } someFun();',
        expectedUrl: undefined,
        expectedUnsafeUrl: undefined,
        expectedNewWindow: undefined
      });
      checkJsAction({
        jsEntry: 'window.open(\'http://www.example.com/test.pdf\')',
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
        expectedNewWindow: undefined
      });
      checkJsAction({
        jsEntry: new _stream.StringStream('app.launchURL("http://www.example.com/test.pdf", true)'),
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
        expectedNewWindow: true
      });
    });
    it('should correctly parse a Named action', function () {
      var actionDict = new _primitives.Dict();
      actionDict.set('Type', _primitives.Name.get('Action'));
      actionDict.set('S', _primitives.Name.get('Named'));
      actionDict.set('N', _primitives.Name.get('GoToPage'));
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('A', actionDict);
      var annotationRef = new _primitives.Ref(12, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.action).toEqual('GoToPage');
    });
    it('should correctly parse a simple Dest', function () {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', _primitives.Name.get('LI0'));
      var annotationRef = new _primitives.Ref(583, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual('LI0');
    });
    it('should correctly parse a simple Dest, with explicit destination array', function () {
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', [new _primitives.Ref(17, 0), _primitives.Name.get('XYZ'), 0, 841.89, null]);
      var annotationRef = new _primitives.Ref(10, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual([{
        num: 17,
        gen: 0
      }, { name: 'XYZ' }, 0, 841.89, null]);
    });
    it('should correctly parse a Dest, which violates the specification ' + 'by containing a dictionary', function () {
      var destDict = new _primitives.Dict();
      destDict.set('Type', _primitives.Name.get('Action'));
      destDict.set('S', _primitives.Name.get('GoTo'));
      destDict.set('D', 'page.157');
      var annotationDict = new _primitives.Dict();
      annotationDict.set('Type', _primitives.Name.get('Annot'));
      annotationDict.set('Subtype', _primitives.Name.get('Link'));
      annotationDict.set('Dest', destDict);
      var annotationRef = new _primitives.Ref(798, 0);
      var xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual('page.157');
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
    it('should handle unknown field names', function () {
      var widgetRef = new _primitives.Ref(20, 0);
      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('');
    });
    it('should construct the field name when there are no ancestors', function () {
      widgetDict.set('T', 'foo');
      var widgetRef = new _primitives.Ref(21, 0);
      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('foo');
    });
    it('should construct the field name when there are ancestors', function () {
      var firstParent = new _primitives.Dict();
      firstParent.set('T', 'foo');
      var secondParent = new _primitives.Dict();
      secondParent.set('Parent', firstParent);
      secondParent.set('T', 'bar');
      widgetDict.set('Parent', secondParent);
      widgetDict.set('T', 'baz');
      var widgetRef = new _primitives.Ref(22, 0);
      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('foo.bar.baz');
    });
    it('should construct the field name if a parent is not a dictionary ' + '(issue 8143)', function () {
      var parentDict = new _primitives.Dict();
      parentDict.set('Parent', null);
      parentDict.set('T', 'foo');
      widgetDict.set('Parent', parentDict);
      widgetDict.set('T', 'bar');
      var widgetRef = new _primitives.Ref(22, 0);
      var xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('foo.bar');
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
    it('should handle unknown text alignment, maximum length and flags', function () {
      var textWidgetRef = new _primitives.Ref(124, 0);
      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(null);
      expect(data.maxLen).toEqual(null);
      expect(data.readOnly).toEqual(false);
      expect(data.multiLine).toEqual(false);
      expect(data.comb).toEqual(false);
    });
    it('should not set invalid text alignment, maximum length and flags', function () {
      textWidgetDict.set('Q', 'center');
      textWidgetDict.set('MaxLen', 'five');
      textWidgetDict.set('Ff', 'readonly');
      var textWidgetRef = new _primitives.Ref(43, 0);
      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(null);
      expect(data.maxLen).toEqual(null);
      expect(data.readOnly).toEqual(false);
      expect(data.multiLine).toEqual(false);
      expect(data.comb).toEqual(false);
    });
    it('should set valid text alignment, maximum length and flags', function () {
      textWidgetDict.set('Q', 1);
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.MULTILINE);
      var textWidgetRef = new _primitives.Ref(84, 0);
      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(1);
      expect(data.maxLen).toEqual(20);
      expect(data.readOnly).toEqual(true);
      expect(data.multiLine).toEqual(true);
    });
    it('should reject comb fields without a maximum length', function () {
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.COMB);
      var textWidgetRef = new _primitives.Ref(46, 0);
      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.comb).toEqual(false);
    });
    it('should accept comb fields with a maximum length', function () {
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', _util.AnnotationFieldFlag.COMB);
      var textWidgetRef = new _primitives.Ref(46, 0);
      var xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.comb).toEqual(true);
    });
    it('should only accept comb fields when the flags are valid', function () {
      var invalidFieldFlags = [_util.AnnotationFieldFlag.MULTILINE, _util.AnnotationFieldFlag.PASSWORD, _util.AnnotationFieldFlag.FILESELECT];
      var flags = _util.AnnotationFieldFlag.COMB + _util.AnnotationFieldFlag.MULTILINE + _util.AnnotationFieldFlag.PASSWORD + _util.AnnotationFieldFlag.FILESELECT;
      for (var i = 0, ii = invalidFieldFlags.length; i <= ii; i++) {
        textWidgetDict.set('MaxLen', 20);
        textWidgetDict.set('Ff', flags);
        var textWidgetRef = new _primitives.Ref(93, 0);
        var xref = new _test_utils.XRefMock([{
          ref: textWidgetRef,
          data: textWidgetDict
        }]);
        var annotation = _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock);
        var data = annotation.data;
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        var valid = invalidFieldFlags.length === 0;
        expect(data.comb).toEqual(valid);
        if (!valid) {
          flags -= invalidFieldFlags.splice(-1, 1);
        }
      }
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
    it('should handle checkboxes', function () {
      buttonWidgetDict.set('V', _primitives.Name.get('1'));
      var buttonWidgetRef = new _primitives.Ref(124, 0);
      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(true);
      expect(data.fieldValue).toEqual('1');
      expect(data.radioButton).toEqual(false);
    });
    it('should handle radio buttons with a field value', function () {
      var parentDict = new _primitives.Dict();
      parentDict.set('V', _primitives.Name.get('1'));
      var normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set('2', null);
      var appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set('N', normalAppearanceStateDict);
      buttonWidgetDict.set('Ff', _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set('Parent', parentDict);
      buttonWidgetDict.set('AP', appearanceStatesDict);
      var buttonWidgetRef = new _primitives.Ref(124, 0);
      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(false);
      expect(data.radioButton).toEqual(true);
      expect(data.fieldValue).toEqual('1');
      expect(data.buttonValue).toEqual('2');
    });
    it('should handle radio buttons without a field value', function () {
      var normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set('2', null);
      var appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set('N', normalAppearanceStateDict);
      buttonWidgetDict.set('Ff', _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set('AP', appearanceStatesDict);
      var buttonWidgetRef = new _primitives.Ref(124, 0);
      var xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(false);
      expect(data.radioButton).toEqual(true);
      expect(data.fieldValue).toEqual(null);
      expect(data.buttonValue).toEqual('2');
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
    it('should handle missing option arrays', function () {
      var choiceWidgetRef = new _primitives.Ref(122, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.options).toEqual([]);
    });
    it('should handle option arrays with array elements', function () {
      var optionBarRef = new _primitives.Ref(20, 0);
      var optionBarStr = 'Bar';
      var optionOneRef = new _primitives.Ref(10, 0);
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
      var choiceWidgetRef = new _primitives.Ref(123, 0);
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
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });
    it('should handle option arrays with string elements', function () {
      var optionBarRef = new _primitives.Ref(10, 0);
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
      var choiceWidgetRef = new _primitives.Ref(981, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }, {
        ref: optionBarRef,
        data: optionBarStr
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });
    it('should handle inherited option arrays (issue 8094)', function () {
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
      var choiceWidgetRef = new _primitives.Ref(123, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });
    it('should handle array field values', function () {
      var fieldValue = ['Foo', 'Bar'];
      choiceWidgetDict.set('V', fieldValue);
      var choiceWidgetRef = new _primitives.Ref(968, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldValue).toEqual(fieldValue);
    });
    it('should handle string field values', function () {
      var fieldValue = 'Foo';
      choiceWidgetDict.set('V', fieldValue);
      var choiceWidgetRef = new _primitives.Ref(978, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.fieldValue).toEqual([fieldValue]);
    });
    it('should handle unknown flags', function () {
      var choiceWidgetRef = new _primitives.Ref(166, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });
    it('should not set invalid flags', function () {
      choiceWidgetDict.set('Ff', 'readonly');
      var choiceWidgetRef = new _primitives.Ref(165, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });
    it('should set valid flags', function () {
      choiceWidgetDict.set('Ff', _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.COMBO + _util.AnnotationFieldFlag.MULTISELECT);
      var choiceWidgetRef = new _primitives.Ref(512, 0);
      var xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(true);
      expect(data.combo).toEqual(true);
      expect(data.multiSelect).toEqual(true);
    });
  });
  describe('LineAnnotation', function () {
    it('should set the line coordinates', function () {
      var lineDict = new _primitives.Dict();
      lineDict.set('Type', _primitives.Name.get('Annot'));
      lineDict.set('Subtype', _primitives.Name.get('Line'));
      lineDict.set('L', [1, 2, 3, 4]);
      var lineRef = new _primitives.Ref(122, 0);
      var xref = new _test_utils.XRefMock([{
        ref: lineRef,
        data: lineDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, lineRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.LINE);
      expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
    });
  });
  describe('FileAttachmentAnnotation', function () {
    it('should correctly parse a file attachment', function () {
      var fileStream = new _stream.StringStream('<<\n' + '/Type /EmbeddedFile\n' + '/Subtype /text#2Fplain\n' + '>>\n' + 'stream\n' + 'Test attachment' + 'endstream\n');
      var lexer = new _parser.Lexer(fileStream);
      var parser = new _parser.Parser(lexer, true);
      var fileStreamRef = new _primitives.Ref(18, 0);
      var fileStreamDict = parser.getObj();
      var embeddedFileDict = new _primitives.Dict();
      embeddedFileDict.set('F', fileStreamRef);
      var fileSpecRef = new _primitives.Ref(19, 0);
      var fileSpecDict = new _primitives.Dict();
      fileSpecDict.set('Type', _primitives.Name.get('Filespec'));
      fileSpecDict.set('Desc', '');
      fileSpecDict.set('EF', embeddedFileDict);
      fileSpecDict.set('UF', 'Test.txt');
      var fileAttachmentRef = new _primitives.Ref(20, 0);
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
      var annotation = _annotation.AnnotationFactory.create(xref, fileAttachmentRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.FILEATTACHMENT);
      expect(data.file.filename).toEqual('Test.txt');
      expect(data.file.content).toEqual((0, _util.stringToBytes)('Test attachment'));
    });
  });
  describe('PopupAnnotation', function () {
    it('should inherit the parent flags when the Popup is not viewable, ' + 'but the parent is (PR 7352)', function () {
      var parentDict = new _primitives.Dict();
      parentDict.set('Type', _primitives.Name.get('Annot'));
      parentDict.set('Subtype', _primitives.Name.get('Text'));
      parentDict.set('F', 28);
      var popupDict = new _primitives.Dict();
      popupDict.set('Type', _primitives.Name.get('Annot'));
      popupDict.set('Subtype', _primitives.Name.get('Popup'));
      popupDict.set('F', 25);
      popupDict.set('Parent', parentDict);
      var popupRef = new _primitives.Ref(13, 0);
      var xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);
      var annotation = _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
      expect(data.annotationFlags).toEqual(25);
      expect(annotation.viewable).toEqual(true);
    });
  });
});