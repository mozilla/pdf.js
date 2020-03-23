/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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

var _annotation = require("../../core/annotation.js");

var _util = require("../../shared/util.js");

var _test_utils = require("./test_utils.js");

var _primitives = require("../../core/primitives.js");

var _parser = require("../../core/parser.js");

var _stream = require("../../core/stream.js");

describe("annotation", function () {
  class PDFManagerMock {
    constructor(params) {
      this.docBaseUrl = params.docBaseUrl || null;
    }

    ensure(obj, prop, args) {
      return new Promise(function (resolve) {
        const value = obj[prop];

        if (typeof value === "function") {
          resolve(value.apply(obj, args));
        } else {
          resolve(value);
        }
      });
    }

  }

  let pdfManagerMock, idFactoryMock;
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
  describe("AnnotationFactory", function () {
    it("should get id for annotation", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));

      const annotationRef = _primitives.Ref.get(10, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual("10R");
        done();
      }, done.fail);
    });
    it("should handle, and get fallback IDs for, annotations that are not " + "indirect objects (issue 7569)", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      const xref = new _test_utils.XRefMock();
      const idFactory = (0, _test_utils.createIdFactory)(0);

      const annotation1 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual("annot_p0_1");
      });

      const annotation2 = _annotation.AnnotationFactory.create(xref, annotationDict, pdfManagerMock, idFactory).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.id).toEqual("annot_p0_2");
      });

      Promise.all([annotation1, annotation2]).then(done, done.fail);
    });
    it("should handle missing /Subtype", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));

      const annotationRef = _primitives.Ref.get(1, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toBeUndefined();
        done();
      }, done.fail);
    });
  });
  describe("getQuadPoints", function () {
    let dict, rect;
    beforeEach(function (done) {
      dict = new _primitives.Dict();
      rect = [];
      done();
    });
    afterEach(function () {
      dict = null;
      rect = null;
    });
    it("should ignore missing quadpoints", function () {
      expect((0, _annotation.getQuadPoints)(dict, rect)).toEqual(null);
    });
    it("should ignore non-array values", function () {
      dict.set("QuadPoints", "foo");
      expect((0, _annotation.getQuadPoints)(dict, rect)).toEqual(null);
    });
    it("should ignore arrays where the length is not a multiple of eight", function () {
      dict.set("QuadPoints", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect((0, _annotation.getQuadPoints)(dict, rect)).toEqual(null);
    });
    it("should ignore quadpoints if one coordinate lies outside the rectangle", function () {
      rect = [10, 10, 20, 20];
      const inputs = [[11, 11, 12, 12, 9, 13, 14, 14], [11, 11, 12, 12, 13, 9, 14, 14], [11, 11, 12, 12, 21, 13, 14, 14], [11, 11, 12, 12, 13, 21, 14, 14]];

      for (const input of inputs) {
        dict.set("QuadPoints", input);
        expect((0, _annotation.getQuadPoints)(dict, rect)).toEqual(null);
      }
    });
    it("should process valid quadpoints arrays", function () {
      rect = [10, 10, 20, 20];
      dict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18]);
      expect((0, _annotation.getQuadPoints)(dict, rect)).toEqual([[{
        x: 11,
        y: 11
      }, {
        x: 12,
        y: 12
      }, {
        x: 13,
        y: 13
      }, {
        x: 14,
        y: 14
      }], [{
        x: 15,
        y: 15
      }, {
        x: 16,
        y: 16
      }, {
        x: 17,
        y: 17
      }, {
        x: 18,
        y: 18
      }]]);
    });
  });
  describe("Annotation", function () {
    let dict, ref;
    beforeAll(function (done) {
      dict = new _primitives.Dict();
      ref = _primitives.Ref.get(1, 0);
      done();
    });
    afterAll(function () {
      dict = ref = null;
    });
    it("should set and get valid contents", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setContents("Foo bar baz");
      expect(annotation.contents).toEqual("Foo bar baz");
    });
    it("should not set and get invalid contents", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setContents(undefined);
      expect(annotation.contents).toEqual("");
    });
    it("should set and get a valid modification date", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setModificationDate("D:20190422");
      expect(annotation.modificationDate).toEqual("D:20190422");
    });
    it("should not set and get an invalid modification date", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setModificationDate(undefined);
      expect(annotation.modificationDate).toEqual(null);
    });
    it("should set and get flags", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setFlags(13);
      expect(annotation.hasFlag(_util.AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(_util.AnnotationFlag.READONLY)).toEqual(false);
    });
    it("should be viewable and not printable by default", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      expect(annotation.viewable).toEqual(true);
      expect(annotation.printable).toEqual(false);
    });
    it("should set and get a valid rectangle", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setRectangle([117, 694, 164.298, 720]);
      expect(annotation.rectangle).toEqual([117, 694, 164.298, 720]);
    });
    it("should not set and get an invalid rectangle", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setRectangle([117, 694, 164.298]);
      expect(annotation.rectangle).toEqual([0, 0, 0, 0]);
    });
    it("should reject a color if it is not an array", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor("red");
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
    it("should set and get a transparent color", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor([]);
      expect(annotation.color).toEqual(null);
    });
    it("should set and get a grayscale color", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor([0.4]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
    });
    it("should set and get an RGB color", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor([0, 0, 1]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
    });
    it("should set and get a CMYK color", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([234, 59, 48]));
    });
    it("should not set and get an invalid color", function () {
      const annotation = new _annotation.Annotation({
        dict,
        ref
      });
      annotation.setColor([0.4, 0.6]);
      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
  });
  describe("AnnotationBorderStyle", function () {
    it("should set and get a valid width", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setWidth(3);
      expect(borderStyle.width).toEqual(3);
    });
    it("should not set and get an invalid width", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setWidth("three");
      expect(borderStyle.width).toEqual(1);
    });
    it("should set the width to zero, when the input is a `Name` (issue 10385)", function () {
      const borderStyleZero = new _annotation.AnnotationBorderStyle();
      borderStyleZero.setWidth(_primitives.Name.get("0"));
      const borderStyleFive = new _annotation.AnnotationBorderStyle();
      borderStyleFive.setWidth(_primitives.Name.get("5"));
      expect(borderStyleZero.width).toEqual(0);
      expect(borderStyleFive.width).toEqual(0);
    });
    it("should set and get a valid style", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setStyle(_primitives.Name.get("D"));
      expect(borderStyle.style).toEqual(_util.AnnotationBorderStyleType.DASHED);
    });
    it("should not set and get an invalid style", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setStyle("Dashed");
      expect(borderStyle.style).toEqual(_util.AnnotationBorderStyleType.SOLID);
    });
    it("should set and get a valid dash array", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setDashArray([1, 2, 3]);
      expect(borderStyle.dashArray).toEqual([1, 2, 3]);
    });
    it("should not set and get an invalid dash array", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setDashArray([0, 0]);
      expect(borderStyle.dashArray).toEqual([3]);
    });
    it("should set and get a valid horizontal corner radius", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius(3);
      expect(borderStyle.horizontalCornerRadius).toEqual(3);
    });
    it("should not set and get an invalid horizontal corner radius", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius("three");
      expect(borderStyle.horizontalCornerRadius).toEqual(0);
    });
    it("should set and get a valid vertical corner radius", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius(3);
      expect(borderStyle.verticalCornerRadius).toEqual(3);
    });
    it("should not set and get an invalid vertical corner radius", function () {
      const borderStyle = new _annotation.AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius("three");
      expect(borderStyle.verticalCornerRadius).toEqual(0);
    });
  });
  describe("MarkupAnnotation", function () {
    let dict, ref;
    beforeAll(function (done) {
      dict = new _primitives.Dict();
      ref = _primitives.Ref.get(1, 0);
      done();
    });
    afterAll(function () {
      dict = ref = null;
    });
    it("should set and get a valid creation date", function () {
      const markupAnnotation = new _annotation.MarkupAnnotation({
        dict,
        ref
      });
      markupAnnotation.setCreationDate("D:20190422");
      expect(markupAnnotation.creationDate).toEqual("D:20190422");
    });
    it("should not set and get an invalid creation date", function () {
      const markupAnnotation = new _annotation.MarkupAnnotation({
        dict,
        ref
      });
      markupAnnotation.setCreationDate(undefined);
      expect(markupAnnotation.creationDate).toEqual(null);
    });
    it("should not parse IRT/RT when not defined", function (done) {
      dict.set("Type", _primitives.Name.get("Annot"));
      dict.set("Subtype", _primitives.Name.get("Text"));
      const xref = new _test_utils.XRefMock([{
        ref,
        data: dict
      }]);

      _annotation.AnnotationFactory.create(xref, ref, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.inReplyTo).toBeUndefined();
        expect(data.replyType).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should parse IRT and set default RT when not defined.", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));

      const replyRef = _primitives.Ref.get(820, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: replyRef,
        data: replyDict
      }]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, replyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.inReplyTo).toEqual(annotationRef.toString());
        expect(data.replyType).toEqual("R");
        done();
      }, done.fail);
    });
    it("should parse IRT/RT for a group type", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));
      annotationDict.set("T", "ParentTitle");
      annotationDict.set("Contents", "ParentText");
      annotationDict.set("CreationDate", "D:20180423");
      annotationDict.set("M", "D:20190423");
      annotationDict.set("C", [0, 0, 1]);

      const popupRef = _primitives.Ref.get(820, 0);

      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("Parent", annotationRef);
      annotationDict.set("Popup", popupRef);

      const replyRef = _primitives.Ref.get(821, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", _primitives.Name.get("Group"));
      replyDict.set("T", "ReplyTitle");
      replyDict.set("Contents", "ReplyText");
      replyDict.set("CreationDate", "D:20180523");
      replyDict.set("M", "D:20190523");
      replyDict.set("C", [0.4]);
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: popupRef,
        data: popupDict
      }, {
        ref: replyRef,
        data: replyDict
      }]);
      annotationDict.assignXref(xref);
      popupDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, replyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.inReplyTo).toEqual(annotationRef.toString());
        expect(data.replyType).toEqual("Group");
        expect(data.title).toEqual("ParentTitle");
        expect(data.contents).toEqual("ParentText");
        expect(data.creationDate).toEqual("D:20180423");
        expect(data.modificationDate).toEqual("D:20190423");
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
        expect(data.hasPopup).toEqual(true);
        done();
      }, done.fail);
    });
    it("should parse IRT/RT for a reply type", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));
      annotationDict.set("T", "ParentTitle");
      annotationDict.set("Contents", "ParentText");
      annotationDict.set("CreationDate", "D:20180423");
      annotationDict.set("M", "D:20190423");
      annotationDict.set("C", [0, 0, 1]);

      const popupRef = _primitives.Ref.get(820, 0);

      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("Parent", annotationRef);
      annotationDict.set("Popup", popupRef);

      const replyRef = _primitives.Ref.get(821, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", _primitives.Name.get("R"));
      replyDict.set("T", "ReplyTitle");
      replyDict.set("Contents", "ReplyText");
      replyDict.set("CreationDate", "D:20180523");
      replyDict.set("M", "D:20190523");
      replyDict.set("C", [0.4]);
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: popupRef,
        data: popupDict
      }, {
        ref: replyRef,
        data: replyDict
      }]);
      annotationDict.assignXref(xref);
      popupDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, replyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.inReplyTo).toEqual(annotationRef.toString());
        expect(data.replyType).toEqual("R");
        expect(data.title).toEqual("ReplyTitle");
        expect(data.contents).toEqual("ReplyText");
        expect(data.creationDate).toEqual("D:20180523");
        expect(data.modificationDate).toEqual("D:20190523");
        expect(data.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
        expect(data.hasPopup).toEqual(false);
        done();
      }, done.fail);
    });
  });
  describe("TextAnnotation", function () {
    it("should not parse state model and state when not defined", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));
      annotationDict.set("Contents", "TestText");

      const replyRef = _primitives.Ref.get(820, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", _primitives.Name.get("R"));
      replyDict.set("Contents", "ReplyText");
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: replyRef,
        data: replyDict
      }]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, replyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.stateModel).toBeNull();
        expect(data.state).toBeNull();
        done();
      }, done.fail);
    });
    it("should correctly parse state model and state when defined", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));

      const replyRef = _primitives.Ref.get(820, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", _primitives.Name.get("R"));
      replyDict.set("StateModel", "Review");
      replyDict.set("State", "Rejected");
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: replyRef,
        data: replyDict
      }]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, replyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.stateModel).toEqual("Review");
        expect(data.state).toEqual("Rejected");
        done();
      }, done.fail);
    });
  });
  describe("LinkAnnotation", function () {
    it("should correctly parse a URI action", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("URI"));
      actionDict.set("URI", "http://www.ctan.org/tex-archive/info/lshort");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(820, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual("http://www.ctan.org/tex-archive/info/lshort");
        expect(data.unsafeUrl).toEqual("http://www.ctan.org/tex-archive/info/lshort");
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should correctly parse a URI action, where the URI entry " + "is missing a protocol", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("URI"));
      actionDict.set("URI", "www.hmrc.gov.uk");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(353, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual("http://www.hmrc.gov.uk/");
        expect(data.unsafeUrl).toEqual("http://www.hmrc.gov.uk");
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should correctly parse a URI action, where the URI entry " + "has an incorrect encoding (bug 1122280)", function (done) {
      const actionStream = new _stream.StringStream("<<\n" + "/Type /Action\n" + "/S /URI\n" + "/URI (http://www.example.com/\\303\\274\\303\\266\\303\\244)\n" + ">>\n");
      const parser = new _parser.Parser({
        lexer: new _parser.Lexer(actionStream),
        xref: null
      });
      const actionDict = parser.getObj();
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(8, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL((0, _util.stringToUTF8String)("http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4")).href);
        expect(data.unsafeUrl).toEqual((0, _util.stringToUTF8String)("http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4"));
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should correctly parse a GoTo action", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("GoTo"));
      actionDict.set("D", "page.157");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(798, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("page.157");
        done();
      }, done.fail);
    });
    it("should correctly parse a GoToR action, where the FileSpec entry " + "is a string containing a relative URL", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("GoToR"));
      actionDict.set("F", "../../0013/001346/134685E.pdf");
      actionDict.set("D", "4.3");
      actionDict.set("NewWindow", true);
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(489, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
        done();
      }, done.fail);
    });
    it("should correctly parse a GoToR action, containing a relative URL, " + 'with the "docBaseUrl" parameter specified', function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("GoToR"));
      actionDict.set("F", "../../0013/001346/134685E.pdf");
      actionDict.set("D", "4.3");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(489, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      const pdfManager = new PDFManagerMock({
        docBaseUrl: "http://www.example.com/test/pdfs/qwerty.pdf"
      });

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual("http://www.example.com/0013/001346/134685E.pdf#4.3");
        expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should correctly parse a GoToR action, with named destination", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("GoToR"));
      actionDict.set("F", "http://www.example.com/test.pdf");
      actionDict.set("D", "15");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(495, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual("http://www.example.com/test.pdf#15");
        expect(data.unsafeUrl).toEqual("http://www.example.com/test.pdf#15");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });
    it("should correctly parse a GoToR action, with explicit destination array", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("GoToR"));
      actionDict.set("F", "http://www.example.com/test.pdf");
      actionDict.set("D", [14, _primitives.Name.get("XYZ"), null, 298.043, null]);
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(489, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL("http://www.example.com/test.pdf#" + '[14,{"name":"XYZ"},null,298.043,null]').href);
        expect(data.unsafeUrl).toEqual("http://www.example.com/test.pdf#" + '[14,{"name":"XYZ"},null,298.043,null]');
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });
    it("should correctly parse a Launch action, where the FileSpec dict " + 'contains a relative URL, with the "docBaseUrl" parameter specified', function (done) {
      const fileSpecDict = new _primitives.Dict();
      fileSpecDict.set("Type", _primitives.Name.get("FileSpec"));
      fileSpecDict.set("F", "Part II/Part II.pdf");
      fileSpecDict.set("UF", "Part II/Part II.pdf");
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("Launch"));
      actionDict.set("F", fileSpecDict);
      actionDict.set("NewWindow", true);
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(88, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);
      const pdfManager = new PDFManagerMock({
        docBaseUrl: "http://www.example.com/test/pdfs/qwerty.pdf"
      });

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManager, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toEqual(new URL("http://www.example.com/test/pdfs/Part II/Part II.pdf").href);
        expect(data.unsafeUrl).toEqual("Part II/Part II.pdf");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
        done();
      }, done.fail);
    });
    it("should recover valid URLs from JavaScript actions having certain " + "white-listed formats", function (done) {
      function checkJsAction(params) {
        const jsEntry = params.jsEntry;
        const expectedUrl = params.expectedUrl;
        const expectedUnsafeUrl = params.expectedUnsafeUrl;
        const expectedNewWindow = params.expectedNewWindow;
        const actionDict = new _primitives.Dict();
        actionDict.set("Type", _primitives.Name.get("Action"));
        actionDict.set("S", _primitives.Name.get("JavaScript"));
        actionDict.set("JS", jsEntry);
        const annotationDict = new _primitives.Dict();
        annotationDict.set("Type", _primitives.Name.get("Annot"));
        annotationDict.set("Subtype", _primitives.Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = _primitives.Ref.get(46, 0);

        const xref = new _test_utils.XRefMock([{
          ref: annotationRef,
          data: annotationDict
        }]);
        return _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
          data
        }) => {
          expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
          expect(data.url).toEqual(expectedUrl);
          expect(data.unsafeUrl).toEqual(expectedUnsafeUrl);
          expect(data.dest).toBeUndefined();
          expect(data.newWindow).toEqual(expectedNewWindow);
        });
      }

      const annotation1 = checkJsAction({
        jsEntry: 'function someFun() { return "qwerty"; } someFun();',
        expectedUrl: undefined,
        expectedUnsafeUrl: undefined,
        expectedNewWindow: undefined
      });
      const annotation2 = checkJsAction({
        jsEntry: "window.open('http://www.example.com/test.pdf')",
        expectedUrl: new URL("http://www.example.com/test.pdf").href,
        expectedUnsafeUrl: "http://www.example.com/test.pdf",
        expectedNewWindow: undefined
      });
      const annotation3 = checkJsAction({
        jsEntry: new _stream.StringStream('app.launchURL("http://www.example.com/test.pdf", true)'),
        expectedUrl: new URL("http://www.example.com/test.pdf").href,
        expectedUnsafeUrl: "http://www.example.com/test.pdf",
        expectedNewWindow: true
      });
      Promise.all([annotation1, annotation2, annotation3]).then(done, done.fail);
    });
    it("should correctly parse a Named action", function (done) {
      const actionDict = new _primitives.Dict();
      actionDict.set("Type", _primitives.Name.get("Action"));
      actionDict.set("S", _primitives.Name.get("Named"));
      actionDict.set("N", _primitives.Name.get("GoToPage"));
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = _primitives.Ref.get(12, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.action).toEqual("GoToPage");
        done();
      }, done.fail);
    });
    it("should correctly parse a simple Dest", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("Dest", _primitives.Name.get("LI0"));

      const annotationRef = _primitives.Ref.get(583, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("LI0");
        done();
      }, done.fail);
    });
    it("should correctly parse a simple Dest, with explicit destination array", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("Dest", [_primitives.Ref.get(17, 0), _primitives.Name.get("XYZ"), 0, 841.89, null]);

      const annotationRef = _primitives.Ref.get(10, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual([{
          num: 17,
          gen: 0
        }, {
          name: "XYZ"
        }, 0, 841.89, null]);
        done();
      }, done.fail);
    });
    it("should correctly parse a Dest, which violates the specification " + "by containing a dictionary", function (done) {
      const destDict = new _primitives.Dict();
      destDict.set("Type", _primitives.Name.get("Action"));
      destDict.set("S", _primitives.Name.get("GoTo"));
      destDict.set("D", "page.157");
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("Dest", destDict);

      const annotationRef = _primitives.Ref.get(798, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("page.157");
        done();
      }, done.fail);
    });
    it("should not set quadpoints if not defined", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));

      const annotationRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should set quadpoints if defined", function (done) {
      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Link"));
      annotationDict.set("Rect", [10, 10, 20, 20]);
      annotationDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const annotationRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }]);

      _annotation.AnnotationFactory.create(xref, annotationRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINK);
        expect(data.quadPoints).toEqual([[{
          x: 11,
          y: 11
        }, {
          x: 12,
          y: 12
        }, {
          x: 13,
          y: 13
        }, {
          x: 14,
          y: 14
        }]]);
        done();
      }, done.fail);
    });
  });
  describe("WidgetAnnotation", function () {
    let widgetDict;
    beforeEach(function (done) {
      widgetDict = new _primitives.Dict();
      widgetDict.set("Type", _primitives.Name.get("Annot"));
      widgetDict.set("Subtype", _primitives.Name.get("Widget"));
      done();
    });
    afterEach(function () {
      widgetDict = null;
    });
    it("should handle unknown field names", function (done) {
      const widgetRef = _primitives.Ref.get(20, 0);

      const xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("");
        done();
      }, done.fail);
    });
    it("should construct the field name when there are no ancestors", function (done) {
      widgetDict.set("T", "foo");

      const widgetRef = _primitives.Ref.get(21, 0);

      const xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo");
        done();
      }, done.fail);
    });
    it("should construct the field name when there are ancestors", function (done) {
      const firstParent = new _primitives.Dict();
      firstParent.set("T", "foo");
      const secondParent = new _primitives.Dict();
      secondParent.set("Parent", firstParent);
      secondParent.set("T", "bar");
      widgetDict.set("Parent", secondParent);
      widgetDict.set("T", "baz");

      const widgetRef = _primitives.Ref.get(22, 0);

      const xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo.bar.baz");
        done();
      }, done.fail);
    });
    it("should construct the field name if a parent is not a dictionary " + "(issue 8143)", function (done) {
      const parentDict = new _primitives.Dict();
      parentDict.set("Parent", null);
      parentDict.set("T", "foo");
      widgetDict.set("Parent", parentDict);
      widgetDict.set("T", "bar");

      const widgetRef = _primitives.Ref.get(22, 0);

      const xref = new _test_utils.XRefMock([{
        ref: widgetRef,
        data: widgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, widgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo.bar");
        done();
      }, done.fail);
    });
  });
  describe("TextWidgetAnnotation", function () {
    let textWidgetDict;
    beforeEach(function (done) {
      textWidgetDict = new _primitives.Dict();
      textWidgetDict.set("Type", _primitives.Name.get("Annot"));
      textWidgetDict.set("Subtype", _primitives.Name.get("Widget"));
      textWidgetDict.set("FT", _primitives.Name.get("Tx"));
      done();
    });
    afterEach(function () {
      textWidgetDict = null;
    });
    it("should handle unknown text alignment, maximum length and flags", function (done) {
      const textWidgetRef = _primitives.Ref.get(124, 0);

      const xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(null);
        expect(data.maxLen).toEqual(null);
        expect(data.readOnly).toEqual(false);
        expect(data.multiLine).toEqual(false);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it("should not set invalid text alignment, maximum length and flags", function (done) {
      textWidgetDict.set("Q", "center");
      textWidgetDict.set("MaxLen", "five");
      textWidgetDict.set("Ff", "readonly");

      const textWidgetRef = _primitives.Ref.get(43, 0);

      const xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(null);
        expect(data.maxLen).toEqual(null);
        expect(data.readOnly).toEqual(false);
        expect(data.multiLine).toEqual(false);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it("should set valid text alignment, maximum length and flags", function (done) {
      textWidgetDict.set("Q", 1);
      textWidgetDict.set("MaxLen", 20);
      textWidgetDict.set("Ff", _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.MULTILINE);

      const textWidgetRef = _primitives.Ref.get(84, 0);

      const xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(1);
        expect(data.maxLen).toEqual(20);
        expect(data.readOnly).toEqual(true);
        expect(data.multiLine).toEqual(true);
        done();
      }, done.fail);
    });
    it("should reject comb fields without a maximum length", function (done) {
      textWidgetDict.set("Ff", _util.AnnotationFieldFlag.COMB);

      const textWidgetRef = _primitives.Ref.get(46, 0);

      const xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });
    it("should accept comb fields with a maximum length", function (done) {
      textWidgetDict.set("MaxLen", 20);
      textWidgetDict.set("Ff", _util.AnnotationFieldFlag.COMB);

      const textWidgetRef = _primitives.Ref.get(46, 0);

      const xref = new _test_utils.XRefMock([{
        ref: textWidgetRef,
        data: textWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.comb).toEqual(true);
        done();
      }, done.fail);
    });
    it("should only accept comb fields when the flags are valid", function (done) {
      const invalidFieldFlags = [_util.AnnotationFieldFlag.MULTILINE, _util.AnnotationFieldFlag.PASSWORD, _util.AnnotationFieldFlag.FILESELECT];
      let flags = _util.AnnotationFieldFlag.COMB + _util.AnnotationFieldFlag.MULTILINE + _util.AnnotationFieldFlag.PASSWORD + _util.AnnotationFieldFlag.FILESELECT;
      let promise = Promise.resolve();

      for (let i = 0, ii = invalidFieldFlags.length; i <= ii; i++) {
        promise = promise.then(() => {
          textWidgetDict.set("MaxLen", 20);
          textWidgetDict.set("Ff", flags);

          const textWidgetRef = _primitives.Ref.get(93, 0);

          const xref = new _test_utils.XRefMock([{
            ref: textWidgetRef,
            data: textWidgetDict
          }]);
          return _annotation.AnnotationFactory.create(xref, textWidgetRef, pdfManagerMock, idFactoryMock).then(({
            data
          }) => {
            expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
            const valid = invalidFieldFlags.length === 0;
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
  describe("ButtonWidgetAnnotation", function () {
    let buttonWidgetDict;
    beforeEach(function (done) {
      buttonWidgetDict = new _primitives.Dict();
      buttonWidgetDict.set("Type", _primitives.Name.get("Annot"));
      buttonWidgetDict.set("Subtype", _primitives.Name.get("Widget"));
      buttonWidgetDict.set("FT", _primitives.Name.get("Btn"));
      done();
    });
    afterEach(function () {
      buttonWidgetDict = null;
    });
    it("should handle checkboxes with export value", function (done) {
      buttonWidgetDict.set("V", _primitives.Name.get("1"));
      const appearanceStatesDict = new _primitives.Dict();
      const exportValueOptionsDict = new _primitives.Dict();
      exportValueOptionsDict.set("Off", 0);
      exportValueOptionsDict.set("Checked", 1);
      appearanceStatesDict.set("D", exportValueOptionsDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = _primitives.Ref.get(124, 0);

      const xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.radioButton).toEqual(false);
        expect(data.exportValue).toEqual("Checked");
        done();
      }, done.fail);
    });
    it("should handle checkboxes without export value", function (done) {
      buttonWidgetDict.set("V", _primitives.Name.get("1"));

      const buttonWidgetRef = _primitives.Ref.get(124, 0);

      const xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.radioButton).toEqual(false);
        done();
      }, done.fail);
    });
    it("should handle radio buttons with a field value", function (done) {
      const parentDict = new _primitives.Dict();
      parentDict.set("V", _primitives.Name.get("1"));
      const normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set("2", null);
      const appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set("N", normalAppearanceStateDict);
      buttonWidgetDict.set("Ff", _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("Parent", parentDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = _primitives.Ref.get(124, 0);

      const xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.buttonValue).toEqual("2");
        done();
      }, done.fail);
    });
    it("should handle radio buttons without a field value", function (done) {
      const normalAppearanceStateDict = new _primitives.Dict();
      normalAppearanceStateDict.set("2", null);
      const appearanceStatesDict = new _primitives.Dict();
      appearanceStatesDict.set("N", normalAppearanceStateDict);
      buttonWidgetDict.set("Ff", _util.AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = _primitives.Ref.get(124, 0);

      const xref = new _test_utils.XRefMock([{
        ref: buttonWidgetRef,
        data: buttonWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, buttonWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual(null);
        expect(data.buttonValue).toEqual("2");
        done();
      }, done.fail);
    });
  });
  describe("ChoiceWidgetAnnotation", function () {
    let choiceWidgetDict;
    beforeEach(function (done) {
      choiceWidgetDict = new _primitives.Dict();
      choiceWidgetDict.set("Type", _primitives.Name.get("Annot"));
      choiceWidgetDict.set("Subtype", _primitives.Name.get("Widget"));
      choiceWidgetDict.set("FT", _primitives.Name.get("Ch"));
      done();
    });
    afterEach(function () {
      choiceWidgetDict = null;
    });
    it("should handle missing option arrays", function (done) {
      const choiceWidgetRef = _primitives.Ref.get(122, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual([]);
        done();
      }, done.fail);
    });
    it("should handle option arrays with array elements", function (done) {
      const optionBarRef = _primitives.Ref.get(20, 0);

      const optionBarStr = "Bar";

      const optionOneRef = _primitives.Ref.get(10, 0);

      const optionOneArr = ["bar_export", optionBarRef];
      const options = [["foo_export", "Foo"], optionOneRef];
      const expected = [{
        exportValue: "foo_export",
        displayValue: "Foo"
      }, {
        exportValue: "bar_export",
        displayValue: "Bar"
      }];
      choiceWidgetDict.set("Opt", options);

      const choiceWidgetRef = _primitives.Ref.get(123, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }, {
        ref: optionBarRef,
        data: optionBarStr
      }, {
        ref: optionOneRef,
        data: optionOneArr
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it("should handle option arrays with string elements", function (done) {
      const optionBarRef = _primitives.Ref.get(10, 0);

      const optionBarStr = "Bar";
      const options = ["Foo", optionBarRef];
      const expected = [{
        exportValue: "Foo",
        displayValue: "Foo"
      }, {
        exportValue: "Bar",
        displayValue: "Bar"
      }];
      choiceWidgetDict.set("Opt", options);

      const choiceWidgetRef = _primitives.Ref.get(981, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }, {
        ref: optionBarRef,
        data: optionBarStr
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it("should handle inherited option arrays (issue 8094)", function (done) {
      const options = [["Value1", "Description1"], ["Value2", "Description2"]];
      const expected = [{
        exportValue: "Value1",
        displayValue: "Description1"
      }, {
        exportValue: "Value2",
        displayValue: "Description2"
      }];
      const parentDict = new _primitives.Dict();
      parentDict.set("Opt", options);
      choiceWidgetDict.set("Parent", parentDict);

      const choiceWidgetRef = _primitives.Ref.get(123, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it("should sanitize display values in option arrays (issue 8947)", function (done) {
      const options = ["\xFE\xFF\x00F\x00o\x00o"];
      const expected = [{
        exportValue: "\xFE\xFF\x00F\x00o\x00o",
        displayValue: "Foo"
      }];
      choiceWidgetDict.set("Opt", options);

      const choiceWidgetRef = _primitives.Ref.get(984, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });
    it("should handle array field values", function (done) {
      const fieldValue = ["Foo", "Bar"];
      choiceWidgetDict.set("V", fieldValue);

      const choiceWidgetRef = _primitives.Ref.get(968, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldValue).toEqual(fieldValue);
        done();
      }, done.fail);
    });
    it("should handle string field values", function (done) {
      const fieldValue = "Foo";
      choiceWidgetDict.set("V", fieldValue);

      const choiceWidgetRef = _primitives.Ref.get(978, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.fieldValue).toEqual([fieldValue]);
        done();
      }, done.fail);
    });
    it("should handle unknown flags", function (done) {
      const choiceWidgetRef = _primitives.Ref.get(166, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });
    it("should not set invalid flags", function (done) {
      choiceWidgetDict.set("Ff", "readonly");

      const choiceWidgetRef = _primitives.Ref.get(165, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });
    it("should set valid flags", function (done) {
      choiceWidgetDict.set("Ff", _util.AnnotationFieldFlag.READONLY + _util.AnnotationFieldFlag.COMBO + _util.AnnotationFieldFlag.MULTISELECT);

      const choiceWidgetRef = _primitives.Ref.get(512, 0);

      const xref = new _test_utils.XRefMock([{
        ref: choiceWidgetRef,
        data: choiceWidgetDict
      }]);

      _annotation.AnnotationFactory.create(xref, choiceWidgetRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(true);
        expect(data.combo).toEqual(true);
        expect(data.multiSelect).toEqual(true);
        done();
      }, done.fail);
    });
  });
  describe("LineAnnotation", function () {
    it("should set the line coordinates", function (done) {
      const lineDict = new _primitives.Dict();
      lineDict.set("Type", _primitives.Name.get("Annot"));
      lineDict.set("Subtype", _primitives.Name.get("Line"));
      lineDict.set("L", [1, 2, 3, 4]);

      const lineRef = _primitives.Ref.get(122, 0);

      const xref = new _test_utils.XRefMock([{
        ref: lineRef,
        data: lineDict
      }]);

      _annotation.AnnotationFactory.create(xref, lineRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.LINE);
        expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
        done();
      }, done.fail);
    });
  });
  describe("FileAttachmentAnnotation", function () {
    it("should correctly parse a file attachment", function (done) {
      const fileStream = new _stream.StringStream("<<\n" + "/Type /EmbeddedFile\n" + "/Subtype /text#2Fplain\n" + ">>\n" + "stream\n" + "Test attachment" + "endstream\n");
      const parser = new _parser.Parser({
        lexer: new _parser.Lexer(fileStream),
        xref: null,
        allowStreams: true
      });

      const fileStreamRef = _primitives.Ref.get(18, 0);

      const fileStreamDict = parser.getObj();
      const embeddedFileDict = new _primitives.Dict();
      embeddedFileDict.set("F", fileStreamRef);

      const fileSpecRef = _primitives.Ref.get(19, 0);

      const fileSpecDict = new _primitives.Dict();
      fileSpecDict.set("Type", _primitives.Name.get("Filespec"));
      fileSpecDict.set("Desc", "");
      fileSpecDict.set("EF", embeddedFileDict);
      fileSpecDict.set("UF", "Test.txt");

      const fileAttachmentRef = _primitives.Ref.get(20, 0);

      const fileAttachmentDict = new _primitives.Dict();
      fileAttachmentDict.set("Type", _primitives.Name.get("Annot"));
      fileAttachmentDict.set("Subtype", _primitives.Name.get("FileAttachment"));
      fileAttachmentDict.set("FS", fileSpecRef);
      fileAttachmentDict.set("T", "Topic");
      fileAttachmentDict.set("Contents", "Test.txt");
      const xref = new _test_utils.XRefMock([{
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

      _annotation.AnnotationFactory.create(xref, fileAttachmentRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.FILEATTACHMENT);
        expect(data.file.filename).toEqual("Test.txt");
        expect(data.file.content).toEqual((0, _util.stringToBytes)("Test attachment"));
        done();
      }, done.fail);
    });
  });
  describe("PopupAnnotation", function () {
    it("should inherit properties from its parent", function (done) {
      const parentDict = new _primitives.Dict();
      parentDict.set("Type", _primitives.Name.get("Annot"));
      parentDict.set("Subtype", _primitives.Name.get("Text"));
      parentDict.set("M", "D:20190423");
      parentDict.set("C", [0, 0, 1]);
      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("Parent", parentDict);

      const popupRef = _primitives.Ref.get(13, 0);

      const xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(({
        data,
        viewable
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.modificationDate).toEqual("D:20190423");
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
        done();
      }, done.fail);
    });
    it("should handle missing parent properties", function (done) {
      const parentDict = new _primitives.Dict();
      parentDict.set("Type", _primitives.Name.get("Annot"));
      parentDict.set("Subtype", _primitives.Name.get("Text"));
      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("Parent", parentDict);

      const popupRef = _primitives.Ref.get(13, 0);

      const xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(({
        data,
        viewable
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.modificationDate).toEqual(null);
        expect(data.color).toEqual(null);
        done();
      }, done.fail);
    });
    it("should inherit the parent flags when the Popup is not viewable, " + "but the parent is (PR 7352)", function (done) {
      const parentDict = new _primitives.Dict();
      parentDict.set("Type", _primitives.Name.get("Annot"));
      parentDict.set("Subtype", _primitives.Name.get("Text"));
      parentDict.set("F", 28);
      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("F", 25);
      popupDict.set("Parent", parentDict);

      const popupRef = _primitives.Ref.get(13, 0);

      const xref = new _test_utils.XRefMock([{
        ref: popupRef,
        data: popupDict
      }]);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(({
        data,
        viewable
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.POPUP);
        expect(data.annotationFlags).toEqual(25);
        expect(viewable).toEqual(true);
        done();
      }, done.fail);
    });
    it("should correctly inherit Contents from group-master annotation " + "if parent has ReplyType == Group", function (done) {
      const annotationRef = _primitives.Ref.get(819, 0);

      const annotationDict = new _primitives.Dict();
      annotationDict.set("Type", _primitives.Name.get("Annot"));
      annotationDict.set("Subtype", _primitives.Name.get("Text"));
      annotationDict.set("T", "Correct Title");
      annotationDict.set("Contents", "Correct Text");
      annotationDict.set("M", "D:20190423");
      annotationDict.set("C", [0, 0, 1]);

      const replyRef = _primitives.Ref.get(820, 0);

      const replyDict = new _primitives.Dict();
      replyDict.set("Type", _primitives.Name.get("Annot"));
      replyDict.set("Subtype", _primitives.Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", _primitives.Name.get("Group"));
      replyDict.set("T", "Reply Title");
      replyDict.set("Contents", "Reply Text");
      replyDict.set("M", "D:20190523");
      replyDict.set("C", [0.4]);

      const popupRef = _primitives.Ref.get(821, 0);

      const popupDict = new _primitives.Dict();
      popupDict.set("Type", _primitives.Name.get("Annot"));
      popupDict.set("Subtype", _primitives.Name.get("Popup"));
      popupDict.set("T", "Wrong Title");
      popupDict.set("Contents", "Wrong Text");
      popupDict.set("Parent", replyRef);
      popupDict.set("M", "D:20190623");
      popupDict.set("C", [0.8]);
      replyDict.set("Popup", popupRef);
      const xref = new _test_utils.XRefMock([{
        ref: annotationRef,
        data: annotationDict
      }, {
        ref: replyRef,
        data: replyDict
      }, {
        ref: popupRef,
        data: popupDict
      }]);
      annotationDict.assignXref(xref);
      popupDict.assignXref(xref);
      replyDict.assignXref(xref);

      _annotation.AnnotationFactory.create(xref, popupRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.title).toEqual("Correct Title");
        expect(data.contents).toEqual("Correct Text");
        expect(data.modificationDate).toEqual("D:20190423");
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
        done();
      }, done.fail);
    });
  });
  describe("InkAnnotation", function () {
    it("should handle a single ink list", function (done) {
      const inkDict = new _primitives.Dict();
      inkDict.set("Type", _primitives.Name.get("Annot"));
      inkDict.set("Subtype", _primitives.Name.get("Ink"));
      inkDict.set("InkList", [[1, 1, 1, 2, 2, 2, 3, 3]]);

      const inkRef = _primitives.Ref.get(142, 0);

      const xref = new _test_utils.XRefMock([{
        ref: inkRef,
        data: inkDict
      }]);

      _annotation.AnnotationFactory.create(xref, inkRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
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
    it("should handle multiple ink lists", function (done) {
      const inkDict = new _primitives.Dict();
      inkDict.set("Type", _primitives.Name.get("Annot"));
      inkDict.set("Subtype", _primitives.Name.get("Ink"));
      inkDict.set("InkList", [[1, 1, 1, 2], [3, 3, 4, 5]]);

      const inkRef = _primitives.Ref.get(143, 0);

      const xref = new _test_utils.XRefMock([{
        ref: inkRef,
        data: inkDict
      }]);

      _annotation.AnnotationFactory.create(xref, inkRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
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
  describe("HightlightAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const highlightDict = new _primitives.Dict();
      highlightDict.set("Type", _primitives.Name.get("Annot"));
      highlightDict.set("Subtype", _primitives.Name.get("Highlight"));

      const highlightRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: highlightRef,
        data: highlightDict
      }]);

      _annotation.AnnotationFactory.create(xref, highlightRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.HIGHLIGHT);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should set quadpoints if defined", function (done) {
      const highlightDict = new _primitives.Dict();
      highlightDict.set("Type", _primitives.Name.get("Annot"));
      highlightDict.set("Subtype", _primitives.Name.get("Highlight"));
      highlightDict.set("Rect", [10, 10, 20, 20]);
      highlightDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const highlightRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: highlightRef,
        data: highlightDict
      }]);

      _annotation.AnnotationFactory.create(xref, highlightRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.HIGHLIGHT);
        expect(data.quadPoints).toEqual([[{
          x: 11,
          y: 11
        }, {
          x: 12,
          y: 12
        }, {
          x: 13,
          y: 13
        }, {
          x: 14,
          y: 14
        }]]);
        done();
      }, done.fail);
    });
  });
  describe("UnderlineAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const underlineDict = new _primitives.Dict();
      underlineDict.set("Type", _primitives.Name.get("Annot"));
      underlineDict.set("Subtype", _primitives.Name.get("Underline"));

      const underlineRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: underlineRef,
        data: underlineDict
      }]);

      _annotation.AnnotationFactory.create(xref, underlineRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.UNDERLINE);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should set quadpoints if defined", function (done) {
      const underlineDict = new _primitives.Dict();
      underlineDict.set("Type", _primitives.Name.get("Annot"));
      underlineDict.set("Subtype", _primitives.Name.get("Underline"));
      underlineDict.set("Rect", [10, 10, 20, 20]);
      underlineDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const underlineRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: underlineRef,
        data: underlineDict
      }]);

      _annotation.AnnotationFactory.create(xref, underlineRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.UNDERLINE);
        expect(data.quadPoints).toEqual([[{
          x: 11,
          y: 11
        }, {
          x: 12,
          y: 12
        }, {
          x: 13,
          y: 13
        }, {
          x: 14,
          y: 14
        }]]);
        done();
      }, done.fail);
    });
  });
  describe("SquigglyAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const squigglyDict = new _primitives.Dict();
      squigglyDict.set("Type", _primitives.Name.get("Annot"));
      squigglyDict.set("Subtype", _primitives.Name.get("Squiggly"));

      const squigglyRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: squigglyRef,
        data: squigglyDict
      }]);

      _annotation.AnnotationFactory.create(xref, squigglyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.SQUIGGLY);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should set quadpoints if defined", function (done) {
      const squigglyDict = new _primitives.Dict();
      squigglyDict.set("Type", _primitives.Name.get("Annot"));
      squigglyDict.set("Subtype", _primitives.Name.get("Squiggly"));
      squigglyDict.set("Rect", [10, 10, 20, 20]);
      squigglyDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const squigglyRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: squigglyRef,
        data: squigglyDict
      }]);

      _annotation.AnnotationFactory.create(xref, squigglyRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.SQUIGGLY);
        expect(data.quadPoints).toEqual([[{
          x: 11,
          y: 11
        }, {
          x: 12,
          y: 12
        }, {
          x: 13,
          y: 13
        }, {
          x: 14,
          y: 14
        }]]);
        done();
      }, done.fail);
    });
  });
  describe("StrikeOutAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const strikeOutDict = new _primitives.Dict();
      strikeOutDict.set("Type", _primitives.Name.get("Annot"));
      strikeOutDict.set("Subtype", _primitives.Name.get("StrikeOut"));

      const strikeOutRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: strikeOutRef,
        data: strikeOutDict
      }]);

      _annotation.AnnotationFactory.create(xref, strikeOutRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.STRIKEOUT);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });
    it("should set quadpoints if defined", function (done) {
      const strikeOutDict = new _primitives.Dict();
      strikeOutDict.set("Type", _primitives.Name.get("Annot"));
      strikeOutDict.set("Subtype", _primitives.Name.get("StrikeOut"));
      strikeOutDict.set("Rect", [10, 10, 20, 20]);
      strikeOutDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const strikeOutRef = _primitives.Ref.get(121, 0);

      const xref = new _test_utils.XRefMock([{
        ref: strikeOutRef,
        data: strikeOutDict
      }]);

      _annotation.AnnotationFactory.create(xref, strikeOutRef, pdfManagerMock, idFactoryMock).then(({
        data
      }) => {
        expect(data.annotationType).toEqual(_util.AnnotationType.STRIKEOUT);
        expect(data.quadPoints).toEqual([[{
          x: 11,
          y: 11
        }, {
          x: 12,
          y: 12
        }, {
          x: 13,
          y: 13
        }, {
          x: 14,
          y: 14
        }]]);
        done();
      }, done.fail);
    });
  });
});