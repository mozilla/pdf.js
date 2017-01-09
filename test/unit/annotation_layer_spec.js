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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-test/unit/annotation_layer_spec', ['exports',
           'pdfjs/core/primitives', 'pdfjs/core/annotation',
           'pdfjs/core/stream', 'pdfjs/core/parser',
           'pdfjs/shared/util', 'pdfjs/display/global'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/core/primitives.js'),
            require('../../src/core/annotation.js'),
            require('../../src/core/stream.js'),
            require('../../src/core/parser.js'),
            require('../../src/shared/util.js'),
            require('../../src/display/global.js'));
  } else {
    factory((root.pdfjsTestUnitAnnotationLayerSpec = {}),
             root.pdfjsCorePrimitives, root.pdfjsCoreAnnotation,
             root.pdfjsCoreStream, root.pdfjsCoreParser,
             root.pdfjsSharedUtil, root.pdfjsDisplayGlobal);
  }
}(this, function (exports, corePrimitives, coreAnnotation, coreStream,
                  coreParser, sharedUtil, displayGlobal) {

var Annotation = coreAnnotation.Annotation;
var AnnotationBorderStyle = coreAnnotation.AnnotationBorderStyle;
var AnnotationFactory = coreAnnotation.AnnotationFactory;
var Lexer = coreParser.Lexer;
var Parser = coreParser.Parser;
var isRef = corePrimitives.isRef;
var Dict = corePrimitives.Dict;
var Name = corePrimitives.Name;
var Ref = corePrimitives.Ref;
var StringStream = coreStream.StringStream;
var PDFJS = displayGlobal.PDFJS;
var AnnotationType = sharedUtil.AnnotationType;
var AnnotationFlag = sharedUtil.AnnotationFlag;
var AnnotationBorderStyleType = sharedUtil.AnnotationBorderStyleType;
var AnnotationFieldFlag = sharedUtil.AnnotationFieldFlag;
var stringToBytes = sharedUtil.stringToBytes;
var stringToUTF8String = sharedUtil.stringToUTF8String;

describe('Annotation layer', function() {
  function XRefMock(array) {
    this.map = Object.create(null);
    for (var elem in array) {
      var obj = array[elem];
      var ref = obj.ref, data = obj.data;
      this.map[ref.toString()] = data;
    }
  }
  XRefMock.prototype = {
    fetch: function (ref) {
      return this.map[ref.toString()];
    },
    fetchIfRef: function (obj) {
      if (!isRef(obj)) {
        return obj;
      }
      return this.fetch(obj);
    },
  };

  function PDFManagerMock(params) {
    this.docBaseUrl = params.docBaseUrl || null;
  }
  PDFManagerMock.prototype = {};

  var annotationFactory, pdfManagerMock;

  beforeAll(function (done) {
    annotationFactory = new AnnotationFactory();
    pdfManagerMock = new PDFManagerMock({
      docBaseUrl: null,
    });
    done();
  });

  afterAll(function () {
    annotationFactory = null;
    pdfManagerMock = null;
  });

  describe('AnnotationFactory', function () {
    it('should get id for annotation', function () {
      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));

      var annotationRef = new Ref(10, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.id).toEqual('10R');
    });

    it('should handle, and get fallback id\'s for, annotations that are not ' +
       'indirect objects (issue 7569)', function () {
      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));

      var xref = new XRefMock();
      var uniquePrefix = 'p0_', idCounters = { obj: 0, };

      var annotation1 = annotationFactory.create(xref, annotationDict,
                                                 pdfManagerMock,
                                                 uniquePrefix, idCounters);
      var annotation2 = annotationFactory.create(xref, annotationDict,
                                                 pdfManagerMock,
                                                 uniquePrefix, idCounters);
      var data1 = annotation1.data, data2 = annotation2.data;
      expect(data1.annotationType).toEqual(AnnotationType.LINK);
      expect(data2.annotationType).toEqual(AnnotationType.LINK);

      expect(data1.id).toEqual('annot_p0_1');
      expect(data2.id).toEqual('annot_p0_2');
    });

    it('should handle missing /Subtype', function () {
      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));

      var annotationRef = new Ref(1, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toBeUndefined();
    });
  });

  describe('Annotation', function() {
    var dict, ref;

    beforeAll(function (done) {
      dict = new Dict();
      ref = new Ref(1, 0);
      done();
    });

    afterAll(function () {
      dict = ref = null;
    });

    it('should set and get flags', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setFlags(13);

      expect(annotation.hasFlag(AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.READONLY)).toEqual(false);
    });

    it('should be viewable and not printable by default', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });

      expect(annotation.viewable).toEqual(true);
      expect(annotation.printable).toEqual(false);
    });

    it('should set and get a valid rectangle', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setRectangle([117, 694, 164.298, 720]);

      expect(annotation.rectangle).toEqual([117, 694, 164.298, 720]);
    });

    it('should not set and get an invalid rectangle', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setRectangle([117, 694, 164.298]);

      expect(annotation.rectangle).toEqual([0, 0, 0, 0]);
    });

    it('should reject a color if it is not an array', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor('red');

      expect(annotation.color).toEqual(new Uint8Array([0, 0, 0]));
    });

    it('should set and get a transparent color', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor([]);

      expect(annotation.color).toEqual(null);
    });

    it('should set and get a grayscale color', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor([0.4]);

      expect(annotation.color).toEqual(new Uint8Array([102, 102, 102]));
    });

    it('should set and get an RGB color', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor([0, 0, 1]);

      expect(annotation.color).toEqual(new Uint8Array([0, 0, 255]));
    });

    it('should set and get a CMYK color', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);

      expect(annotation.color).toEqual(new Uint8Array([233, 59, 47]));
    });

    it('should not set and get an invalid color', function() {
      var annotation = new Annotation({ dict: dict, ref: ref });
      annotation.setColor([0.4, 0.6]);

      expect(annotation.color).toEqual(new Uint8Array([0, 0, 0]));
    });
  });

  describe('AnnotationBorderStyle', function() {
    it('should set and get a valid width', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setWidth(3);

      expect(borderStyle.width).toEqual(3);
    });

    it('should not set and get an invalid width', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setWidth('three');

      expect(borderStyle.width).toEqual(1);
    });

    it('should set and get a valid style', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setStyle(Name.get('D'));

      expect(borderStyle.style).toEqual(AnnotationBorderStyleType.DASHED);
    });

    it('should not set and get an invalid style', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setStyle('Dashed');

      expect(borderStyle.style).toEqual(AnnotationBorderStyleType.SOLID);
    });

    it('should set and get a valid dash array', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setDashArray([1, 2, 3]);

      expect(borderStyle.dashArray).toEqual([1, 2, 3]);
    });

    it('should not set and get an invalid dash array', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setDashArray([0, 0]);

      expect(borderStyle.dashArray).toEqual([3]);
    });

    it('should set and get a valid horizontal corner radius', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius(3);

      expect(borderStyle.horizontalCornerRadius).toEqual(3);
    });

    it('should not set and get an invalid horizontal corner radius',
        function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius('three');

      expect(borderStyle.horizontalCornerRadius).toEqual(0);
    });

    it('should set and get a valid vertical corner radius', function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius(3);

      expect(borderStyle.verticalCornerRadius).toEqual(3);
    });

    it('should not set and get an invalid horizontal corner radius',
        function() {
      var borderStyle = new AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius('three');

      expect(borderStyle.verticalCornerRadius).toEqual(0);
    });
  });

  describe('LinkAnnotation', function() {
    it('should correctly parse a URI action', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('URI'));
      actionDict.set('URI', 'http://www.ctan.org/tex-archive/info/lshort');

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(820, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.ctan.org/tex-archive/info/lshort');
      expect(data.unsafeUrl).toEqual(
        'http://www.ctan.org/tex-archive/info/lshort');
      expect(data.dest).toBeUndefined();
    });

    it('should correctly parse a URI action, where the URI entry ' +
       'is missing a protocol', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('URI'));
      actionDict.set('URI', 'www.hmrc.gov.uk');

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(353, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.hmrc.gov.uk/');
      expect(data.unsafeUrl).toEqual('http://www.hmrc.gov.uk');
      expect(data.dest).toBeUndefined();
    });

    it('should correctly parse a URI action, where the URI entry ' +
       'has an incorrect encoding (bug 1122280)', function () {
      var actionStream = new StringStream(
        '<<\n' +
        '/Type /Action\n' +
        '/S /URI\n' +
        '/URI (http://www.example.com/\\303\\274\\303\\266\\303\\244)\n' +
        '>>\n'
      );
      var lexer = new Lexer(actionStream);
      var parser = new Parser(lexer);
      var actionDict = parser.getObj();

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(8, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual(
        new URL(stringToUTF8String(
          'http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4')).href);
      expect(data.unsafeUrl).toEqual(
        stringToUTF8String(
          'http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4'));
      expect(data.dest).toBeUndefined();
    });

    it('should correctly parse a GoTo action', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('GoTo'));
      actionDict.set('D', 'page.157');

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(798, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual('page.157');
    });

    it('should correctly parse a GoToR action, where the FileSpec entry ' +
       'is a string containing a relative URL', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('GoToR'));
      actionDict.set('F', '../../0013/001346/134685E.pdf');
      actionDict.set('D', '4.3');
      actionDict.set('NewWindow', true);

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(489, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toEqual(true);
    });

    it('should correctly parse a GoToR action, containing a relative URL, ' +
       'with the "docBaseUrl" parameter specified', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('GoToR'));
      actionDict.set('F', '../../0013/001346/134685E.pdf');
      actionDict.set('D', '4.3');

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(489, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);
      var pdfManager = new PDFManagerMock({
        docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf',
      });

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManager);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual(
        'http://www.example.com/0013/001346/134685E.pdf#4.3');
      expect(data.unsafeUrl).toEqual('../../0013/001346/134685E.pdf#4.3');
      expect(data.dest).toBeUndefined();
    });

    it('should correctly parse a GoToR action, with named destination',
        function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', '15');

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(495, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.example.com/test.pdf#nameddest=15');
      expect(data.unsafeUrl).toEqual(
        'http://www.example.com/test.pdf#nameddest=15');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
    });

    it('should correctly parse a GoToR action, with explicit destination array',
        function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('GoToR'));
      actionDict.set('F', 'http://www.example.com/test.pdf');
      actionDict.set('D', [14, Name.get('XYZ'), null, 298.043, null]);

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(489, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual(new URL('http://www.example.com/test.pdf#' +
                                 '[14,{"name":"XYZ"},null,298.043,null]').href);
      expect(data.unsafeUrl).toEqual('http://www.example.com/test.pdf#' +
                                     '[14,{"name":"XYZ"},null,298.043,null]');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
    });

    it('should correctly parse a Launch action, where the FileSpec dict ' +
       'contains a relative URL, with the "docBaseUrl" parameter specified',
        function() {
      var fileSpecDict = new Dict();
      fileSpecDict.set('Type', Name.get('FileSpec'));
      fileSpecDict.set('F', 'Part II/Part II.pdf');
      fileSpecDict.set('UF', 'Part II/Part II.pdf');

      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('Launch'));
      actionDict.set('F', fileSpecDict);
      actionDict.set('NewWindow', true);

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(88, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);
      var pdfManager = new PDFManagerMock({
        docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf',
      });

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManager);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual(
        new URL('http://www.example.com/test/pdfs/Part II/Part II.pdf').href);
      expect(data.unsafeUrl).toEqual('Part II/Part II.pdf');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toEqual(true);
    });

    it('should recover valid URLs from JavaScript actions having certain ' +
       'white-listed formats', function () {
      function checkJsAction(params) {
        var jsEntry = params.jsEntry;
        var expectedUrl = params.expectedUrl;
        var expectedUnsafeUrl = params.expectedUnsafeUrl;

        var actionDict = new Dict();
        actionDict.set('Type', Name.get('Action'));
        actionDict.set('S', Name.get('JavaScript'));
        actionDict.set('JS', jsEntry);

        var annotationDict = new Dict();
        annotationDict.set('Type', Name.get('Annot'));
        annotationDict.set('Subtype', Name.get('Link'));
        annotationDict.set('A', actionDict);

        var annotationRef = new Ref(46, 0);
        var xref = new XRefMock([
          { ref: annotationRef, data: annotationDict, }
        ]);

        var annotation = annotationFactory.create(xref, annotationRef,
                                                  pdfManagerMock);
        var data = annotation.data;
        expect(data.annotationType).toEqual(AnnotationType.LINK);

        expect(data.url).toEqual(expectedUrl);
        expect(data.unsafeUrl).toEqual(expectedUnsafeUrl);
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
      }

      // Check that we reject a 'JS' entry containing arbitrary JavaScript.
      checkJsAction({
        jsEntry: 'function someFun() { return "qwerty"; } someFun();',
        expectedUrl: undefined,
        expectedUnsafeUrl: undefined,
      });
      // Check that we accept a white-listed {string} 'JS' entry.
      checkJsAction({
        jsEntry: 'window.open(\'http://www.example.com/test.pdf\')',
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
      });
      // Check that we accept a white-listed {Stream} 'JS' entry.
      checkJsAction({
        jsEntry: new StringStream(
                   'app.launchURL("http://www.example.com/test.pdf", true)'),
        expectedUrl: new URL('http://www.example.com/test.pdf').href,
        expectedUnsafeUrl: 'http://www.example.com/test.pdf',
      });
    });

    it('should correctly parse a Named action', function() {
      var actionDict = new Dict();
      actionDict.set('Type', Name.get('Action'));
      actionDict.set('S', Name.get('Named'));
      actionDict.set('N', Name.get('GoToPage'));

      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('A', actionDict);

      var annotationRef = new Ref(12, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.action).toEqual('GoToPage');
    });

    it('should correctly parse a simple Dest', function() {
      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('Dest', Name.get('LI0'));

      var annotationRef = new Ref(583, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual('LI0');
    });

    it('should correctly parse a simple Dest, with explicit destination array',
        function() {
      var annotationDict = new Dict();
      annotationDict.set('Type', Name.get('Annot'));
      annotationDict.set('Subtype', Name.get('Link'));
      annotationDict.set('Dest', [new Ref(17, 0), Name.get('XYZ'),
                                  0, 841.89, null]);

      var annotationRef = new Ref(10, 0);
      var xref = new XRefMock([
        { ref: annotationRef, data: annotationDict, }
      ]);

      var annotation = annotationFactory.create(xref, annotationRef,
                                                pdfManagerMock);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual([{ num: 17, gen: 0, }, { name: 'XYZ' },
                                 0, 841.89, null]);
    });
  });

  describe('WidgetAnnotation', function() {
    var widgetDict;

    beforeEach(function (done) {
      widgetDict = new Dict();
      widgetDict.set('Type', Name.get('Annot'));
      widgetDict.set('Subtype', Name.get('Widget'));

      done();
    });

    afterEach(function () {
      widgetDict = null;
    });

    it('should handle unknown field names', function() {
      var widgetRef = new Ref(20, 0);
      var xref = new XRefMock([
        { ref: widgetRef, data: widgetDict, }
      ]);

      var widgetAnnotation = annotationFactory.create(xref, widgetRef,
                                                      pdfManagerMock);
      var data = widgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('');
    });

    it('should construct the field name when there are no ancestors',
        function() {
      widgetDict.set('T', 'foo');

      var widgetRef = new Ref(21, 0);
      var xref = new XRefMock([
        { ref: widgetRef, data: widgetDict, }
      ]);

      var widgetAnnotation = annotationFactory.create(xref, widgetRef,
                                                      pdfManagerMock);
      var data = widgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('foo');
    });

    it('should construct the field name when there are ancestors', function() {
      var firstParent = new Dict();
      firstParent.set('T', 'foo');

      var secondParent = new Dict();
      secondParent.set('Parent', firstParent);
      secondParent.set('T', 'bar');

      widgetDict.set('Parent', secondParent);
      widgetDict.set('T', 'baz');

      var widgetRef = new Ref(22, 0);
      var xref = new XRefMock([
        { ref: widgetRef, data: widgetDict, }
      ]);

      var widgetAnnotation = annotationFactory.create(xref, widgetRef,
                                                      pdfManagerMock);
      var data = widgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual('foo.bar.baz');
    });
  });

  describe('TextWidgetAnnotation', function() {
    var textWidgetDict;

    beforeEach(function (done) {
      textWidgetDict = new Dict();
      textWidgetDict.set('Type', Name.get('Annot'));
      textWidgetDict.set('Subtype', Name.get('Widget'));
      textWidgetDict.set('FT', Name.get('Tx'));

      done();
    });

    afterEach(function () {
      textWidgetDict = null;
    });

    it('should handle unknown text alignment, maximum length and flags',
        function() {
      var textWidgetRef = new Ref(124, 0);
      var xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict, }
      ]);

      var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                          pdfManagerMock);
      expect(textWidgetAnnotation.data.textAlignment).toEqual(null);
      expect(textWidgetAnnotation.data.maxLen).toEqual(null);
      expect(textWidgetAnnotation.data.readOnly).toEqual(false);
      expect(textWidgetAnnotation.data.multiLine).toEqual(false);
      expect(textWidgetAnnotation.data.comb).toEqual(false);
    });

    it('should not set invalid text alignment, maximum length and flags',
        function() {
      textWidgetDict.set('Q', 'center');
      textWidgetDict.set('MaxLen', 'five');
      textWidgetDict.set('Ff', 'readonly');

      var textWidgetRef = new Ref(43, 0);
      var xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict, }
      ]);

      var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                          pdfManagerMock);
      expect(textWidgetAnnotation.data.textAlignment).toEqual(null);
      expect(textWidgetAnnotation.data.maxLen).toEqual(null);
      expect(textWidgetAnnotation.data.readOnly).toEqual(false);
      expect(textWidgetAnnotation.data.multiLine).toEqual(false);
      expect(textWidgetAnnotation.data.comb).toEqual(false);
    });

    it('should set valid text alignment, maximum length and flags',
        function() {
      textWidgetDict.set('Q', 1);
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', AnnotationFieldFlag.READONLY +
                               AnnotationFieldFlag.MULTILINE);

      var textWidgetRef = new Ref(84, 0);
      var xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict, }
      ]);

      var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                          pdfManagerMock);
      expect(textWidgetAnnotation.data.textAlignment).toEqual(1);
      expect(textWidgetAnnotation.data.maxLen).toEqual(20);
      expect(textWidgetAnnotation.data.readOnly).toEqual(true);
      expect(textWidgetAnnotation.data.multiLine).toEqual(true);
    });

    it('should reject comb fields without a maximum length', function() {
      textWidgetDict.set('Ff', AnnotationFieldFlag.COMB);

      var textWidgetRef = new Ref(46, 0);
      var xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict, }
      ]);

      var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                          pdfManagerMock);
      expect(textWidgetAnnotation.data.comb).toEqual(false);
    });

    it('should accept comb fields with a maximum length', function() {
      textWidgetDict.set('MaxLen', 20);
      textWidgetDict.set('Ff', AnnotationFieldFlag.COMB);

      var textWidgetRef = new Ref(46, 0);
      var xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict, }
      ]);

      var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                          pdfManagerMock);
      expect(textWidgetAnnotation.data.comb).toEqual(true);
    });

    it('should only accept comb fields when the flags are valid', function() {
      var invalidFieldFlags = [
        AnnotationFieldFlag.MULTILINE, AnnotationFieldFlag.PASSWORD,
        AnnotationFieldFlag.FILESELECT
      ];

      // Start with all invalid flags set and remove them one by one.
      // The field may only use combs when all invalid flags are unset.
      var flags = AnnotationFieldFlag.COMB + AnnotationFieldFlag.MULTILINE +
                  AnnotationFieldFlag.PASSWORD + AnnotationFieldFlag.FILESELECT;

      for (var i = 0, ii = invalidFieldFlags.length; i <= ii; i++) {
        textWidgetDict.set('MaxLen', 20);
        textWidgetDict.set('Ff', flags);

        var textWidgetRef = new Ref(93, 0);
        var xref = new XRefMock([
          { ref: textWidgetRef, data: textWidgetDict, }
        ]);

        var textWidgetAnnotation = annotationFactory.create(xref, textWidgetRef,
                                                            pdfManagerMock);
        var valid = (invalidFieldFlags.length === 0);
        expect(textWidgetAnnotation.data.comb).toEqual(valid);

        // Remove the last invalid flag for the next iteration.
        if (!valid) {
          flags -= invalidFieldFlags.splice(-1, 1);
        }
      }
    });
  });

  describe('ButtonWidgetAnnotation', function() {
    var buttonWidgetDict;

    beforeEach(function (done) {
      buttonWidgetDict = new Dict();
      buttonWidgetDict.set('Type', Name.get('Annot'));
      buttonWidgetDict.set('Subtype', Name.get('Widget'));
      buttonWidgetDict.set('FT', Name.get('Btn'));

      done();
    });

    afterEach(function () {
      buttonWidgetDict = null;
    });

    it('should handle checkboxes', function() {
      buttonWidgetDict.set('V', Name.get('1'));

      var buttonWidgetRef = new Ref(124, 0);
      var xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict, }
      ]);

      var buttonWidgetAnnotation =
        annotationFactory.create(xref, buttonWidgetRef);
      expect(buttonWidgetAnnotation.data.checkBox).toEqual(true);
      expect(buttonWidgetAnnotation.data.fieldValue).toEqual('1');
      expect(buttonWidgetAnnotation.data.radioButton).toEqual(false);
    });

    it('should handle radio buttons', function() {
      var parentDict = new Dict();
      parentDict.set('V', Name.get('1'));

      var normalAppearanceStateDict = new Dict();
      normalAppearanceStateDict.set('2', null);

      var appearanceStatesDict = new Dict();
      appearanceStatesDict.set('N', normalAppearanceStateDict);

      buttonWidgetDict.set('Ff', AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set('Parent', parentDict);
      buttonWidgetDict.set('AP', appearanceStatesDict);

      var buttonWidgetRef = new Ref(124, 0);
      var xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict, }
      ]);

      var buttonWidgetAnnotation =
        annotationFactory.create(xref, buttonWidgetRef);
      expect(buttonWidgetAnnotation.data.checkBox).toEqual(false);
      expect(buttonWidgetAnnotation.data.radioButton).toEqual(true);
      expect(buttonWidgetAnnotation.data.fieldValue).toEqual('1');
      expect(buttonWidgetAnnotation.data.buttonValue).toEqual('2');
    });
  });

  describe('ChoiceWidgetAnnotation', function() {
    var choiceWidgetDict;

    beforeEach(function (done) {
      choiceWidgetDict = new Dict();
      choiceWidgetDict.set('Type', Name.get('Annot'));
      choiceWidgetDict.set('Subtype', Name.get('Widget'));
      choiceWidgetDict.set('FT', Name.get('Ch'));

      done();
    });

    afterEach(function () {
      choiceWidgetDict = null;
    });

    it('should handle missing option arrays', function() {
      var choiceWidgetRef = new Ref(122, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual([]);
    });

    it('should handle option arrays with array elements', function() {
      var optionBarRef = new Ref(20, 0);
      var optionBarStr = 'Bar';
      var optionOneRef = new Ref(10, 0);
      var optionOneArr = ['bar_export', optionBarRef];

      var options = [['foo_export', 'Foo'], optionOneRef];
      var expected = [
        {
          exportValue: 'foo_export',
          displayValue: 'Foo'
        },
        {
          exportValue: 'bar_export',
          displayValue: 'Bar'
        }
      ];

      choiceWidgetDict.set('Opt', options);

      var choiceWidgetRef = new Ref(123, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, },
        { ref: optionBarRef, data: optionBarStr, },
        { ref: optionOneRef, data: optionOneArr, },
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });

    it('should handle option arrays with string elements', function() {
      var optionBarRef = new Ref(10, 0);
      var optionBarStr = 'Bar';

      var options = ['Foo', optionBarRef];
      var expected = [
        {
          exportValue: 'Foo',
          displayValue: 'Foo'
        },
        {
          exportValue: 'Bar',
          displayValue: 'Bar'
        }
      ];

      choiceWidgetDict.set('Opt', options);

      var choiceWidgetRef = new Ref(981, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, },
        { ref: optionBarRef, data: optionBarStr, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });

    it('should handle array field values', function() {
      var fieldValue = ['Foo', 'Bar'];

      choiceWidgetDict.set('V', fieldValue);

      var choiceWidgetRef = new Ref(968, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldValue).toEqual(fieldValue);
    });

    it('should handle string field values', function() {
      var fieldValue = 'Foo';

      choiceWidgetDict.set('V', fieldValue);

      var choiceWidgetRef = new Ref(978, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldValue).toEqual([fieldValue]);
    });

    it('should handle unknown flags', function() {
      var choiceWidgetRef = new Ref(166, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });

    it('should not set invalid flags', function() {
      choiceWidgetDict.set('Ff', 'readonly');

      var choiceWidgetRef = new Ref(165, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });

    it('should set valid flags', function() {
      choiceWidgetDict.set('Ff', AnnotationFieldFlag.READONLY +
                                 AnnotationFieldFlag.COMBO +
                                 AnnotationFieldFlag.MULTISELECT);

      var choiceWidgetRef = new Ref(512, 0);
      var xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict, }
      ]);

      var choiceWidgetAnnotation = annotationFactory.create(xref,
                                                            choiceWidgetRef,
                                                            pdfManagerMock);
      var data = choiceWidgetAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(true);
      expect(data.combo).toEqual(true);
      expect(data.multiSelect).toEqual(true);
    });
  });

  describe('FileAttachmentAnnotation', function() {
    var loadingTask;
    var annotations;

    beforeEach(function(done) {
      var pdfUrl = new URL('../pdfs/annotation-fileattachment.pdf',
                           window.location).href;
      loadingTask = PDFJS.getDocument(pdfUrl);
      loadingTask.promise.then(function(pdfDocument) {
        return pdfDocument.getPage(1).then(function(pdfPage) {
          return pdfPage.getAnnotations().then(function (pdfAnnotations) {
            annotations = pdfAnnotations;
            done();
          });
        });
      }).catch(function (reason) {
        done.fail(reason);
      });
    });

    afterEach(function() {
      loadingTask.destroy();
    });

    it('should correctly parse a file attachment', function() {
      var annotation = annotations[0];
      expect(annotation.file.filename).toEqual('Test.txt');
      expect(annotation.file.content).toEqual(stringToBytes('Test attachment'));
    });
  });

  describe('PopupAnnotation', function() {
    it('should inherit the parent flags when the Popup is not viewable, ' +
       'but the parent is (PR 7352)', function () {
      var parentDict = new Dict();
      parentDict.set('Type', Name.get('Annot'));
      parentDict.set('Subtype', Name.get('Text'));
      parentDict.set('F', 28); // viewable

      var popupDict = new Dict();
      popupDict.set('Type', Name.get('Annot'));
      popupDict.set('Subtype', Name.get('Popup'));
      popupDict.set('F', 25); // not viewable
      popupDict.set('Parent', parentDict);

      var popupRef = new Ref(13, 0);
      var xref = new XRefMock([
        { ref: popupRef, data: popupDict, }
      ]);

      var popupAnnotation = annotationFactory.create(xref, popupRef,
                                                     pdfManagerMock);
      var data = popupAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.POPUP);

      // Should not modify the `annotationFlags` returned e.g. through the API.
      expect(data.annotationFlags).toEqual(25);
      // The Popup should inherit the `viewable` property of the parent.
      expect(popupAnnotation.viewable).toEqual(true);
    });
  });
});
}));
