/* globals expect, it, describe, Dict, Name, Annotation, AnnotationBorderStyle,
           AnnotationBorderStyleType, AnnotationType, AnnotationFlag, PDFJS,
           beforeEach, afterEach, stringToBytes, AnnotationFactory, Ref, isRef,
           beforeAll, afterAll */

'use strict';

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

  var annotationFactory;

  beforeAll(function (done) {
    annotationFactory = new AnnotationFactory();
    done();
  });

  afterAll(function () {
    annotationFactory = null;
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

      var annotation = annotationFactory.create(xref, annotationRef);
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
                                                 uniquePrefix, idCounters);
      var annotation2 = annotationFactory.create(xref, annotationDict,
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

      var annotation = annotationFactory.create(xref, annotationRef);
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.ctan.org/tex-archive/info/lshort');
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.hmrc.gov.uk');
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined(); // ../../0013/001346/134685E.pdf#4.3
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toEqual(true);
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.example.com/test.pdf#nameddest=15');
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toEqual('http://www.example.com/test.pdf#' +
                               '[14,{"name":"XYZ"},null,298.043,null]');
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
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

      var annotation = annotationFactory.create(xref, annotationRef);
      var data = annotation.data;
      expect(data.annotationType).toEqual(AnnotationType.LINK);

      expect(data.url).toBeUndefined();
      expect(data.dest).toEqual('LI0');
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

      var popupAnnotation = annotationFactory.create(xref, popupRef);
      var data = popupAnnotation.data;
      expect(data.annotationType).toEqual(AnnotationType.POPUP);

      // Should not modify the `annotationFlags` returned e.g. through the API.
      expect(data.annotationFlags).toEqual(25);
      // The Popup should inherit the `viewable` property of the parent.
      expect(popupAnnotation.viewable).toEqual(true);
    });
  });
});
