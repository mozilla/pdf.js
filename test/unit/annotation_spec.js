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
  Annotation,
  AnnotationBorderStyle,
  AnnotationFactory,
  getQuadPoints,
  MarkupAnnotation,
} from "../../src/core/annotation.js";
import {
  AnnotationBorderStyleType,
  AnnotationFieldFlag,
  AnnotationFlag,
  AnnotationType,
  OPS,
  stringToBytes,
  stringToUTF8String,
} from "../../src/shared/util.js";
import { createIdFactory, XRefMock } from "./test_utils.js";
import { Dict, Name, Ref, RefSetCache } from "../../src/core/primitives.js";
import { Lexer, Parser } from "../../src/core/parser.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";
import { StringStream } from "../../src/core/stream.js";
import { WorkerTask } from "../../src/core/worker.js";

describe("annotation", function () {
  class PDFManagerMock {
    constructor(params) {
      this.docBaseUrl = params.docBaseUrl || null;
      this.pdfDocument = {
        catalog: {
          acroForm: new Dict(),
        },
      };
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

    ensureCatalog(prop, args) {
      return this.ensure(this.pdfDocument.catalog, prop, args);
    }
  }

  function HandlerMock() {
    this.inputs = [];
  }
  HandlerMock.prototype = {
    send(name, data) {
      this.inputs.push({ name, data });
    },
  };

  let pdfManagerMock, idFactoryMock, partialEvaluator;

  beforeAll(function (done) {
    pdfManagerMock = new PDFManagerMock({
      docBaseUrl: null,
    });
    idFactoryMock = createIdFactory(/* pageIndex = */ 0);
    partialEvaluator = new PartialEvaluator({
      xref: new XRefMock(),
      handler: new HandlerMock(),
      pageIndex: 0,
      idFactory: createIdFactory(/* pageIndex = */ 0),
      fontCache: new RefSetCache(),
    });
    done();
  });

  afterAll(function () {
    pdfManagerMock = null;
    idFactoryMock = null;
    partialEvaluator = null;
  });

  describe("AnnotationFactory", function () {
    it("should get id for annotation", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));

      const annotationRef = Ref.get(10, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.id).toEqual("10R");
        done();
      }, done.fail);
    });

    it(
      "should handle, and get fallback IDs for, annotations that are not " +
        "indirect objects (issue 7569)",
      function (done) {
        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));

        const xref = new XRefMock();
        const idFactory = createIdFactory(/* pageIndex = */ 0);

        const annotation1 = AnnotationFactory.create(
          xref,
          annotationDict,
          pdfManagerMock,
          idFactory
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.id).toEqual("annot_p0_1");
        });

        const annotation2 = AnnotationFactory.create(
          xref,
          annotationDict,
          pdfManagerMock,
          idFactory
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.id).toEqual("annot_p0_2");
        });

        Promise.all([annotation1, annotation2]).then(done, done.fail);
      }
    );

    it("should handle missing /Subtype", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));

      const annotationRef = Ref.get(1, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toBeUndefined();
        done();
      }, done.fail);
    });
  });

  describe("getQuadPoints", function () {
    let dict, rect;

    beforeEach(function (done) {
      dict = new Dict();
      rect = [];
      done();
    });

    afterEach(function () {
      dict = null;
      rect = null;
    });

    it("should ignore missing quadpoints", function () {
      expect(getQuadPoints(dict, rect)).toEqual(null);
    });

    it("should ignore non-array values", function () {
      dict.set("QuadPoints", "foo");
      expect(getQuadPoints(dict, rect)).toEqual(null);
    });

    it("should ignore arrays where the length is not a multiple of eight", function () {
      dict.set("QuadPoints", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(getQuadPoints(dict, rect)).toEqual(null);
    });

    it("should ignore quadpoints if one coordinate lies outside the rectangle", function () {
      rect = [10, 10, 20, 20];
      const inputs = [
        [11, 11, 12, 12, 9, 13, 14, 14], // Smaller than lower x coordinate.
        [11, 11, 12, 12, 13, 9, 14, 14], // Smaller than lower y coordinate.
        [11, 11, 12, 12, 21, 13, 14, 14], // Larger than upper x coordinate.
        [11, 11, 12, 12, 13, 21, 14, 14], // Larger than upper y coordinate.
      ];
      for (const input of inputs) {
        dict.set("QuadPoints", input);
        expect(getQuadPoints(dict, rect)).toEqual(null);
      }
    });

    it("should process valid quadpoints arrays", function () {
      rect = [10, 10, 20, 20];
      dict.set("QuadPoints", [
        11,
        11,
        12,
        12,
        13,
        13,
        14,
        14,
        15,
        15,
        16,
        16,
        17,
        17,
        18,
        18,
      ]);
      expect(getQuadPoints(dict, rect)).toEqual([
        [
          { x: 11, y: 11 },
          { x: 12, y: 12 },
          { x: 13, y: 13 },
          { x: 14, y: 14 },
        ],
        [
          { x: 15, y: 15 },
          { x: 16, y: 16 },
          { x: 17, y: 17 },
          { x: 18, y: 18 },
        ],
      ]);
    });
  });

  describe("Annotation", function () {
    let dict, ref;

    beforeAll(function (done) {
      dict = new Dict();
      ref = Ref.get(1, 0);
      done();
    });

    afterAll(function () {
      dict = ref = null;
    });

    it("should set and get valid contents", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setContents("Foo bar baz");

      expect(annotation.contents).toEqual("Foo bar baz");
    });

    it("should not set and get invalid contents", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setContents(undefined);

      expect(annotation.contents).toEqual("");
    });

    it("should set and get a valid modification date", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setModificationDate("D:20190422");

      expect(annotation.modificationDate).toEqual("D:20190422");
    });

    it("should not set and get an invalid modification date", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setModificationDate(undefined);

      expect(annotation.modificationDate).toEqual(null);
    });

    it("should set and get flags", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setFlags(13);

      expect(annotation.hasFlag(AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.READONLY)).toEqual(false);
    });

    it("should be viewable and not printable by default", function () {
      const annotation = new Annotation({ dict, ref });

      expect(annotation.viewable).toEqual(true);
      expect(annotation.printable).toEqual(false);
    });

    it("should set and get a valid rectangle", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setRectangle([117, 694, 164.298, 720]);

      expect(annotation.rectangle).toEqual([117, 694, 164.298, 720]);
    });

    it("should not set and get an invalid rectangle", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setRectangle([117, 694, 164.298]);

      expect(annotation.rectangle).toEqual([0, 0, 0, 0]);
    });

    it("should reject a color if it is not an array", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor("red");

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });

    it("should set and get a transparent color", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor([]);

      expect(annotation.color).toEqual(null);
    });

    it("should set and get a grayscale color", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor([0.4]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
    });

    it("should set and get an RGB color", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor([0, 0, 1]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
    });

    it("should set and get a CMYK color", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([234, 59, 48]));
    });

    it("should not set and get an invalid color", function () {
      const annotation = new Annotation({ dict, ref });
      annotation.setColor([0.4, 0.6]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
  });

  describe("AnnotationBorderStyle", function () {
    it("should set and get a valid width", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setWidth(3);

      expect(borderStyle.width).toEqual(3);
    });

    it("should not set and get an invalid width", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setWidth("three");

      expect(borderStyle.width).toEqual(1);
    });

    it("should set the width to zero, when the input is a `Name` (issue 10385)", function () {
      const borderStyleZero = new AnnotationBorderStyle();
      borderStyleZero.setWidth(Name.get("0"));
      const borderStyleFive = new AnnotationBorderStyle();
      borderStyleFive.setWidth(Name.get("5"));

      expect(borderStyleZero.width).toEqual(0);
      expect(borderStyleFive.width).toEqual(0);
    });

    it("should set and get a valid style", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setStyle(Name.get("D"));

      expect(borderStyle.style).toEqual(AnnotationBorderStyleType.DASHED);
    });

    it("should not set and get an invalid style", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setStyle("Dashed");

      expect(borderStyle.style).toEqual(AnnotationBorderStyleType.SOLID);
    });

    it("should set and get a valid dash array", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setDashArray([1, 2, 3]);

      expect(borderStyle.dashArray).toEqual([1, 2, 3]);
    });

    it("should not set and get an invalid dash array", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setDashArray([0, 0]);

      expect(borderStyle.dashArray).toEqual([3]);
    });

    it("should set and get a valid horizontal corner radius", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius(3);

      expect(borderStyle.horizontalCornerRadius).toEqual(3);
    });

    it("should not set and get an invalid horizontal corner radius", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setHorizontalCornerRadius("three");

      expect(borderStyle.horizontalCornerRadius).toEqual(0);
    });

    it("should set and get a valid vertical corner radius", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius(3);

      expect(borderStyle.verticalCornerRadius).toEqual(3);
    });

    it("should not set and get an invalid vertical corner radius", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setVerticalCornerRadius("three");

      expect(borderStyle.verticalCornerRadius).toEqual(0);
    });
  });

  describe("MarkupAnnotation", function () {
    let dict, ref;

    beforeAll(function (done) {
      dict = new Dict();
      ref = Ref.get(1, 0);
      done();
    });

    afterAll(function () {
      dict = ref = null;
    });

    it("should set and get a valid creation date", function () {
      const markupAnnotation = new MarkupAnnotation({ dict, ref });
      markupAnnotation.setCreationDate("D:20190422");

      expect(markupAnnotation.creationDate).toEqual("D:20190422");
    });

    it("should not set and get an invalid creation date", function () {
      const markupAnnotation = new MarkupAnnotation({ dict, ref });
      markupAnnotation.setCreationDate(undefined);

      expect(markupAnnotation.creationDate).toEqual(null);
    });

    it("should not parse IRT/RT when not defined", function (done) {
      dict.set("Type", Name.get("Annot"));
      dict.set("Subtype", Name.get("Text"));

      const xref = new XRefMock([{ ref, data: dict }]);

      AnnotationFactory.create(xref, ref, pdfManagerMock, idFactoryMock).then(
        ({ data }) => {
          expect(data.inReplyTo).toBeUndefined();
          expect(data.replyType).toBeUndefined();
          done();
        },
        done.fail
      );
    });

    it("should parse IRT and set default RT when not defined.", function (done) {
      const annotationRef = Ref.get(819, 0);
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Text"));

      const replyRef = Ref.get(820, 0);
      const replyDict = new Dict();
      replyDict.set("Type", Name.get("Annot"));
      replyDict.set("Subtype", Name.get("Text"));
      replyDict.set("IRT", annotationRef);

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: replyRef, data: replyDict },
      ]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        replyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.inReplyTo).toEqual(annotationRef.toString());
        expect(data.replyType).toEqual("R");
        done();
      }, done.fail);
    });

    it("should parse IRT/RT for a group type", function (done) {
      const annotationRef = Ref.get(819, 0);
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Text"));
      annotationDict.set("T", "ParentTitle");
      annotationDict.set("Contents", "ParentText");
      annotationDict.set("CreationDate", "D:20180423");
      annotationDict.set("M", "D:20190423");
      annotationDict.set("C", [0, 0, 1]);

      const popupRef = Ref.get(820, 0);
      const popupDict = new Dict();
      popupDict.set("Type", Name.get("Annot"));
      popupDict.set("Subtype", Name.get("Popup"));
      popupDict.set("Parent", annotationRef);
      annotationDict.set("Popup", popupRef);

      const replyRef = Ref.get(821, 0);
      const replyDict = new Dict();
      replyDict.set("Type", Name.get("Annot"));
      replyDict.set("Subtype", Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", Name.get("Group"));
      replyDict.set("T", "ReplyTitle");
      replyDict.set("Contents", "ReplyText");
      replyDict.set("CreationDate", "D:20180523");
      replyDict.set("M", "D:20190523");
      replyDict.set("C", [0.4]);

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: popupRef, data: popupDict },
        { ref: replyRef, data: replyDict },
      ]);
      annotationDict.assignXref(xref);
      popupDict.assignXref(xref);
      replyDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        replyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
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
      const annotationRef = Ref.get(819, 0);
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Text"));
      annotationDict.set("T", "ParentTitle");
      annotationDict.set("Contents", "ParentText");
      annotationDict.set("CreationDate", "D:20180423");
      annotationDict.set("M", "D:20190423");
      annotationDict.set("C", [0, 0, 1]);

      const popupRef = Ref.get(820, 0);
      const popupDict = new Dict();
      popupDict.set("Type", Name.get("Annot"));
      popupDict.set("Subtype", Name.get("Popup"));
      popupDict.set("Parent", annotationRef);
      annotationDict.set("Popup", popupRef);

      const replyRef = Ref.get(821, 0);
      const replyDict = new Dict();
      replyDict.set("Type", Name.get("Annot"));
      replyDict.set("Subtype", Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", Name.get("R"));
      replyDict.set("T", "ReplyTitle");
      replyDict.set("Contents", "ReplyText");
      replyDict.set("CreationDate", "D:20180523");
      replyDict.set("M", "D:20190523");
      replyDict.set("C", [0.4]);

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: popupRef, data: popupDict },
        { ref: replyRef, data: replyDict },
      ]);
      annotationDict.assignXref(xref);
      popupDict.assignXref(xref);
      replyDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        replyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
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
      const annotationRef = Ref.get(819, 0);
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Text"));
      annotationDict.set("Contents", "TestText");

      const replyRef = Ref.get(820, 0);
      const replyDict = new Dict();
      replyDict.set("Type", Name.get("Annot"));
      replyDict.set("Subtype", Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", Name.get("R"));
      replyDict.set("Contents", "ReplyText");

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: replyRef, data: replyDict },
      ]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        replyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.stateModel).toBeNull();
        expect(data.state).toBeNull();
        done();
      }, done.fail);
    });

    it("should correctly parse state model and state when defined", function (done) {
      const annotationRef = Ref.get(819, 0);
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Text"));

      const replyRef = Ref.get(820, 0);
      const replyDict = new Dict();
      replyDict.set("Type", Name.get("Annot"));
      replyDict.set("Subtype", Name.get("Text"));
      replyDict.set("IRT", annotationRef);
      replyDict.set("RT", Name.get("R"));
      replyDict.set("StateModel", "Review");
      replyDict.set("State", "Rejected");

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: replyRef, data: replyDict },
      ]);
      annotationDict.assignXref(xref);
      replyDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        replyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.stateModel).toEqual("Review");
        expect(data.state).toEqual("Rejected");
        done();
      }, done.fail);
    });
  });

  describe("LinkAnnotation", function () {
    it("should correctly parse a URI action", function (done) {
      const actionDict = new Dict();
      actionDict.set("Type", Name.get("Action"));
      actionDict.set("S", Name.get("URI"));
      actionDict.set("URI", "http://www.ctan.org/tex-archive/info/lshort");

      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = Ref.get(820, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual("http://www.ctan.org/tex-archive/info/lshort");
        expect(data.unsafeUrl).toEqual(
          "http://www.ctan.org/tex-archive/info/lshort"
        );
        expect(data.dest).toBeUndefined();
        done();
      }, done.fail);
    });

    it(
      "should correctly parse a URI action, where the URI entry " +
        "is missing a protocol",
      function (done) {
        const actionDict = new Dict();
        actionDict.set("Type", Name.get("Action"));
        actionDict.set("S", Name.get("URI"));
        actionDict.set("URI", "www.hmrc.gov.uk");

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = Ref.get(353, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toEqual("http://www.hmrc.gov.uk/");
          expect(data.unsafeUrl).toEqual("http://www.hmrc.gov.uk");
          expect(data.dest).toBeUndefined();
          done();
        }, done.fail);
      }
    );

    it(
      "should correctly parse a URI action, where the URI entry " +
        "has an incorrect encoding (bug 1122280)",
      function (done) {
        const actionStream = new StringStream(
          "<<\n" +
            "/Type /Action\n" +
            "/S /URI\n" +
            "/URI (http://www.example.com/\\303\\274\\303\\266\\303\\244)\n" +
            ">>\n"
        );
        const parser = new Parser({
          lexer: new Lexer(actionStream),
          xref: null,
        });
        const actionDict = parser.getObj();

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = Ref.get(8, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toEqual(
            new URL(
              stringToUTF8String(
                "http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4"
              )
            ).href
          );
          expect(data.unsafeUrl).toEqual(
            stringToUTF8String(
              "http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4"
            )
          );
          expect(data.dest).toBeUndefined();
          done();
        }, done.fail);
      }
    );

    it("should correctly parse a GoTo action", function (done) {
      const actionDict = new Dict();
      actionDict.set("Type", Name.get("Action"));
      actionDict.set("S", Name.get("GoTo"));
      actionDict.set("D", "page.157");

      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = Ref.get(798, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("page.157");
        done();
      }, done.fail);
    });

    it(
      "should correctly parse a GoToR action, where the FileSpec entry " +
        "is a string containing a relative URL",
      function (done) {
        const actionDict = new Dict();
        actionDict.set("Type", Name.get("Action"));
        actionDict.set("S", Name.get("GoToR"));
        actionDict.set("F", "../../0013/001346/134685E.pdf");
        actionDict.set("D", "4.3");
        actionDict.set("NewWindow", true);

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = Ref.get(489, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toBeUndefined();
          expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
          expect(data.dest).toBeUndefined();
          expect(data.newWindow).toEqual(true);
          done();
        }, done.fail);
      }
    );

    it(
      "should correctly parse a GoToR action, containing a relative URL, " +
        'with the "docBaseUrl" parameter specified',
      function (done) {
        const actionDict = new Dict();
        actionDict.set("Type", Name.get("Action"));
        actionDict.set("S", Name.get("GoToR"));
        actionDict.set("F", "../../0013/001346/134685E.pdf");
        actionDict.set("D", "4.3");

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = Ref.get(489, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);
        const pdfManager = new PDFManagerMock({
          docBaseUrl: "http://www.example.com/test/pdfs/qwerty.pdf",
        });

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManager,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toEqual(
            "http://www.example.com/0013/001346/134685E.pdf#4.3"
          );
          expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
          expect(data.dest).toBeUndefined();
          done();
        }, done.fail);
      }
    );

    it("should correctly parse a GoToR action, with named destination", function (done) {
      const actionDict = new Dict();
      actionDict.set("Type", Name.get("Action"));
      actionDict.set("S", Name.get("GoToR"));
      actionDict.set("F", "http://www.example.com/test.pdf");
      actionDict.set("D", "15");

      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = Ref.get(495, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual("http://www.example.com/test.pdf#15");
        expect(data.unsafeUrl).toEqual("http://www.example.com/test.pdf#15");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });

    it("should correctly parse a GoToR action, with explicit destination array", function (done) {
      const actionDict = new Dict();
      actionDict.set("Type", Name.get("Action"));
      actionDict.set("S", Name.get("GoToR"));
      actionDict.set("F", "http://www.example.com/test.pdf");
      actionDict.set("D", [14, Name.get("XYZ"), null, 298.043, null]);

      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = Ref.get(489, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual(
          new URL(
            "http://www.example.com/test.pdf#" +
              '[14,{"name":"XYZ"},null,298.043,null]'
          ).href
        );
        expect(data.unsafeUrl).toEqual(
          "http://www.example.com/test.pdf#" +
            '[14,{"name":"XYZ"},null,298.043,null]'
        );
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toBeFalsy();
        done();
      }, done.fail);
    });

    it(
      "should correctly parse a Launch action, where the FileSpec dict " +
        'contains a relative URL, with the "docBaseUrl" parameter specified',
      function (done) {
        const fileSpecDict = new Dict();
        fileSpecDict.set("Type", Name.get("FileSpec"));
        fileSpecDict.set("F", "Part II/Part II.pdf");
        fileSpecDict.set("UF", "Part II/Part II.pdf");

        const actionDict = new Dict();
        actionDict.set("Type", Name.get("Action"));
        actionDict.set("S", Name.get("Launch"));
        actionDict.set("F", fileSpecDict);
        actionDict.set("NewWindow", true);

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        annotationDict.set("A", actionDict);

        const annotationRef = Ref.get(88, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);
        const pdfManager = new PDFManagerMock({
          docBaseUrl: "http://www.example.com/test/pdfs/qwerty.pdf",
        });

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManager,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toEqual(
            new URL("http://www.example.com/test/pdfs/Part II/Part II.pdf").href
          );
          expect(data.unsafeUrl).toEqual("Part II/Part II.pdf");
          expect(data.dest).toBeUndefined();
          expect(data.newWindow).toEqual(true);
          done();
        }, done.fail);
      }
    );

    it(
      "should recover valid URLs from JavaScript actions having certain " +
        "white-listed formats",
      function (done) {
        function checkJsAction(params) {
          const jsEntry = params.jsEntry;
          const expectedUrl = params.expectedUrl;
          const expectedUnsafeUrl = params.expectedUnsafeUrl;
          const expectedNewWindow = params.expectedNewWindow;

          const actionDict = new Dict();
          actionDict.set("Type", Name.get("Action"));
          actionDict.set("S", Name.get("JavaScript"));
          actionDict.set("JS", jsEntry);

          const annotationDict = new Dict();
          annotationDict.set("Type", Name.get("Annot"));
          annotationDict.set("Subtype", Name.get("Link"));
          annotationDict.set("A", actionDict);

          const annotationRef = Ref.get(46, 0);
          const xref = new XRefMock([
            { ref: annotationRef, data: annotationDict },
          ]);

          return AnnotationFactory.create(
            xref,
            annotationRef,
            pdfManagerMock,
            idFactoryMock
          ).then(({ data }) => {
            expect(data.annotationType).toEqual(AnnotationType.LINK);
            expect(data.url).toEqual(expectedUrl);
            expect(data.unsafeUrl).toEqual(expectedUnsafeUrl);
            expect(data.dest).toBeUndefined();
            expect(data.newWindow).toEqual(expectedNewWindow);
          });
        }

        // Check that we reject a 'JS' entry containing arbitrary JavaScript.
        const annotation1 = checkJsAction({
          jsEntry: 'function someFun() { return "qwerty"; } someFun();',
          expectedUrl: undefined,
          expectedUnsafeUrl: undefined,
          expectedNewWindow: undefined,
        });

        // Check that we accept a white-listed {string} 'JS' entry.
        const annotation2 = checkJsAction({
          jsEntry: "window.open('http://www.example.com/test.pdf')",
          expectedUrl: new URL("http://www.example.com/test.pdf").href,
          expectedUnsafeUrl: "http://www.example.com/test.pdf",
          expectedNewWindow: undefined,
        });

        // Check that we accept a white-listed {Stream} 'JS' entry.
        const annotation3 = checkJsAction({
          jsEntry: new StringStream(
            'app.launchURL("http://www.example.com/test.pdf", true)'
          ),
          expectedUrl: new URL("http://www.example.com/test.pdf").href,
          expectedUnsafeUrl: "http://www.example.com/test.pdf",
          expectedNewWindow: true,
        });

        Promise.all([annotation1, annotation2, annotation3]).then(
          done,
          done.fail
        );
      }
    );

    it("should correctly parse a Named action", function (done) {
      const actionDict = new Dict();
      actionDict.set("Type", Name.get("Action"));
      actionDict.set("S", Name.get("Named"));
      actionDict.set("N", Name.get("GoToPage"));

      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("A", actionDict);

      const annotationRef = Ref.get(12, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.action).toEqual("GoToPage");
        done();
      }, done.fail);
    });

    it("should correctly parse a simple Dest", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("Dest", Name.get("LI0"));

      const annotationRef = Ref.get(583, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("LI0");
        done();
      }, done.fail);
    });

    it("should correctly parse a simple Dest, with explicit destination array", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("Dest", [
        Ref.get(17, 0),
        Name.get("XYZ"),
        0,
        841.89,
        null,
      ]);

      const annotationRef = Ref.get(10, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual([
          { num: 17, gen: 0 },
          { name: "XYZ" },
          0,
          841.89,
          null,
        ]);
        done();
      }, done.fail);
    });

    it(
      "should correctly parse a Dest, which violates the specification " +
        "by containing a dictionary",
      function (done) {
        const destDict = new Dict();
        destDict.set("Type", Name.get("Action"));
        destDict.set("S", Name.get("GoTo"));
        destDict.set("D", "page.157");

        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));
        // The /Dest must be a Name or an Array, refer to ISO 32000-1:2008
        // section 12.3.3, but there are PDF files where it's a dictionary.
        annotationDict.set("Dest", destDict);

        const annotationRef = Ref.get(798, 0);
        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
        ]);

        AnnotationFactory.create(
          xref,
          annotationRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.url).toBeUndefined();
          expect(data.unsafeUrl).toBeUndefined();
          expect(data.dest).toEqual("page.157");
          done();
        }, done.fail);
      }
    );

    it("should not set quadpoints if not defined", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));

      const annotationRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });

    it("should set quadpoints if defined", function (done) {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("Rect", [10, 10, 20, 20]);
      annotationDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const annotationRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      AnnotationFactory.create(
        xref,
        annotationRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.quadPoints).toEqual([
          [
            { x: 11, y: 11 },
            { x: 12, y: 12 },
            { x: 13, y: 13 },
            { x: 14, y: 14 },
          ],
        ]);
        done();
      }, done.fail);
    });
  });

  describe("WidgetAnnotation", function () {
    let widgetDict;

    beforeEach(function (done) {
      widgetDict = new Dict();
      widgetDict.set("Type", Name.get("Annot"));
      widgetDict.set("Subtype", Name.get("Widget"));
      done();
    });

    afterEach(function () {
      widgetDict = null;
    });

    it("should handle unknown field names", function (done) {
      const widgetRef = Ref.get(20, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      AnnotationFactory.create(
        xref,
        widgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("");
        done();
      }, done.fail);
    });

    it("should construct the field name when there are no ancestors", function (done) {
      widgetDict.set("T", "foo");

      const widgetRef = Ref.get(21, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      AnnotationFactory.create(
        xref,
        widgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo");
        done();
      }, done.fail);
    });

    it("should construct the field name when there are ancestors", function (done) {
      const firstParent = new Dict();
      firstParent.set("T", "foo");

      const secondParent = new Dict();
      secondParent.set("Parent", firstParent);
      secondParent.set("T", "bar");

      widgetDict.set("Parent", secondParent);
      widgetDict.set("T", "baz");

      const widgetRef = Ref.get(22, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      AnnotationFactory.create(
        xref,
        widgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo.bar.baz");
        done();
      }, done.fail);
    });

    it(
      "should construct the field name if a parent is not a dictionary " +
        "(issue 8143)",
      function (done) {
        const parentDict = new Dict();
        parentDict.set("Parent", null);
        parentDict.set("T", "foo");

        widgetDict.set("Parent", parentDict);
        widgetDict.set("T", "bar");

        const widgetRef = Ref.get(22, 0);
        const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

        AnnotationFactory.create(
          xref,
          widgetRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.WIDGET);
          expect(data.fieldName).toEqual("foo.bar");
          done();
        }, done.fail);
      }
    );
  });

  describe("TextWidgetAnnotation", function () {
    let textWidgetDict, fontRefObj;

    beforeEach(function (done) {
      textWidgetDict = new Dict();
      textWidgetDict.set("Type", Name.get("Annot"));
      textWidgetDict.set("Subtype", Name.get("Widget"));
      textWidgetDict.set("FT", Name.get("Tx"));

      const helvDict = new Dict();
      helvDict.set("BaseFont", Name.get("Helvetica"));
      helvDict.set("Type", Name.get("Font"));
      helvDict.set("Subtype", Name.get("Type1"));

      const fontRef = Ref.get(314, 0);
      fontRefObj = { ref: fontRef, data: helvDict };
      const resourceDict = new Dict();
      const fontDict = new Dict();
      fontDict.set("Helv", fontRef);
      resourceDict.set("Font", fontDict);

      textWidgetDict.set("DA", "/Helv 5 Tf");
      textWidgetDict.set("DR", resourceDict);
      textWidgetDict.set("Rect", [0, 0, 32, 10]);

      done();
    });

    afterEach(function () {
      textWidgetDict = fontRefObj = null;
    });

    it("should handle unknown text alignment, maximum length and flags", function (done) {
      const textWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
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

      const textWidgetRef = Ref.get(43, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
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
      textWidgetDict.set(
        "Ff",
        AnnotationFieldFlag.READONLY + AnnotationFieldFlag.MULTILINE
      );

      const textWidgetRef = Ref.get(84, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.textAlignment).toEqual(1);
        expect(data.maxLen).toEqual(20);
        expect(data.readOnly).toEqual(true);
        expect(data.multiLine).toEqual(true);
        done();
      }, done.fail);
    });

    it("should reject comb fields without a maximum length", function (done) {
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);

      const textWidgetRef = Ref.get(46, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.comb).toEqual(false);
        done();
      }, done.fail);
    });

    it("should accept comb fields with a maximum length", function (done) {
      textWidgetDict.set("MaxLen", 20);
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);

      const textWidgetRef = Ref.get(46, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.comb).toEqual(true);
        done();
      }, done.fail);
    });

    it("should only accept comb fields when the flags are valid", function (done) {
      const invalidFieldFlags = [
        AnnotationFieldFlag.MULTILINE,
        AnnotationFieldFlag.PASSWORD,
        AnnotationFieldFlag.FILESELECT,
      ];

      // Start with all invalid flags set and remove them one by one.
      // The field may only use combs when all invalid flags are unset.
      let flags =
        AnnotationFieldFlag.COMB +
        AnnotationFieldFlag.MULTILINE +
        AnnotationFieldFlag.PASSWORD +
        AnnotationFieldFlag.FILESELECT;

      let promise = Promise.resolve();
      for (let i = 0, ii = invalidFieldFlags.length; i <= ii; i++) {
        promise = promise.then(() => {
          textWidgetDict.set("MaxLen", 20);
          textWidgetDict.set("Ff", flags);

          const textWidgetRef = Ref.get(93, 0);
          const xref = new XRefMock([
            { ref: textWidgetRef, data: textWidgetDict },
          ]);

          return AnnotationFactory.create(
            xref,
            textWidgetRef,
            pdfManagerMock,
            idFactoryMock
          ).then(({ data }) => {
            expect(data.annotationType).toEqual(AnnotationType.WIDGET);

            const valid = invalidFieldFlags.length === 0;
            expect(data.comb).toEqual(valid);

            // Remove the last invalid flag for the next iteration.
            if (!valid) {
              flags -= invalidFieldFlags.pop();
            }
          });
        });
      }
      promise.then(done, done.fail);
    });

    it("should render regular text for printing", function (done) {
      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] = "test\\print";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(
            "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm" +
              " 2.00 2.00 Td (test\\\\print) Tj ET Q EMC"
          );
          done();
        }, done.fail);
    });

    it("should render auto-sized text for printing", function (done) {
      textWidgetDict.set("DA", "/Helv 0 Tf");

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] = "test (print)";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(
            "/Tx BMC q BT /Helv 11 Tf 1 0 0 1 0 0 Tm" +
              " 2.00 2.00 Td (test \\(print\\)) Tj ET Q EMC"
          );
          done();
        }, done.fail);
    });

    it("should not render a password for printing", function (done) {
      textWidgetDict.set("Ff", AnnotationFieldFlag.PASSWORD);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] = "mypassword";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(null);
          done();
        }, done.fail);
    });

    it("should render multiline text for printing", function (done) {
      textWidgetDict.set("Ff", AnnotationFieldFlag.MULTILINE);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] =
            "a aa aaa aaaa aaaaa aaaaaa " +
            "pneumonoultramicroscopicsilicovolcanoconiosis";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(
            "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 10 Tm " +
              "2.00 -5.00 Td (a aa aaa ) Tj\n" +
              "0.00 -5.00 Td (aaaa aaaaa ) Tj\n" +
              "0.00 -5.00 Td (aaaaaa ) Tj\n" +
              "0.00 -5.00 Td (pneumonoultr) Tj\n" +
              "0.00 -5.00 Td (amicroscopi) Tj\n" +
              "0.00 -5.00 Td (csilicovolca) Tj\n" +
              "0.00 -5.00 Td (noconiosis) Tj ET Q EMC"
          );
          done();
        }, done.fail);
    });

    it("should render multiline text with various EOL for printing", function (done) {
      textWidgetDict.set("Ff", AnnotationFieldFlag.MULTILINE);
      textWidgetDict.set("Rect", [0, 0, 128, 10]);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;
      const expectedAppearance =
        "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 10 Tm " +
        "2.00 -5.00 Td " +
        "(Lorem ipsum dolor sit amet, consectetur adipiscing elit.) Tj\n" +
        "0.00 -5.00 Td " +
        "(Aliquam vitae felis ac lectus bibendum ultricies quis non) Tj\n" +
        "0.00 -5.00 Td " +
        "( diam.) Tj\n" +
        "0.00 -5.00 Td " +
        "(Morbi id porttitor quam, a iaculis dui.) Tj\n" +
        "0.00 -5.00 Td " +
        "(Pellentesque habitant morbi tristique senectus et netus ) Tj\n" +
        "0.00 -5.00 Td " +
        "(et malesuada fames ac turpis egestas.) Tj\n" +
        "0.00 -5.00 Td () Tj\n" +
        "0.00 -5.00 Td () Tj\n" +
        "0.00 -5.00 Td " +
        "(Nulla consectetur, ligula in tincidunt placerat, velit ) Tj\n" +
        "0.00 -5.00 Td " +
        "(augue consectetur orci, sed mattis libero nunc ut massa.) Tj\n" +
        "0.00 -5.00 Td " +
        "(Etiam facilisis tempus interdum.) Tj ET Q EMC";

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\r" +
            "Aliquam vitae felis ac lectus bibendum ultricies quis non diam.\n" +
            "Morbi id porttitor quam, a iaculis dui.\r\n" +
            "Pellentesque habitant morbi tristique senectus et " +
            "netus et malesuada fames ac turpis egestas.\n\r\n\r" +
            "Nulla consectetur, ligula in tincidunt placerat, " +
            "velit augue consectetur orci, sed mattis libero nunc ut massa.\r" +
            "Etiam facilisis tempus interdum.";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(expectedAppearance);
          done();
        }, done.fail);
    });

    it("should render comb for printing", function (done) {
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);
      textWidgetDict.set("MaxLen", 4);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] = "aa(aa)a\\";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(
            "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 2 2 Tm" +
              " (a) Tj 8.00 0 Td (a) Tj 8.00 0 Td (\\() Tj" +
              " 8.00 0 Td (a) Tj 8.00 0 Td (a) Tj" +
              " 8.00 0 Td (\\)) Tj 8.00 0 Td (a) Tj" +
              " 8.00 0 Td (\\\\) Tj ET Q EMC"
          );
          done();
        }, done.fail);
    });

    it("should save text", function (done) {
      const textWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        textWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = "hello world";
          return annotation.save(partialEvaluator, task, annotationStorage);
        }, done.fail)
        .then(data => {
          expect(data.length).toEqual(2);
          const [oldData, newData] = data;
          expect(oldData.ref).toEqual(Ref.get(123, 0));
          expect(newData.ref).toEqual(Ref.get(1, 0));

          oldData.data = oldData.data.replace(/\(D:[0-9]+\)/, "(date)");
          expect(oldData.data).toEqual(
            "123 0 obj\n" +
              "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
              "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
              "/V (hello world) /AP << /N 1 0 R>> /M (date)>>\nendobj\n"
          );
          expect(newData.data).toEqual(
            "1 0 obj\n<< /Length 77 /Subtype /Form /Resources " +
              "<< /Font << /Helv 314 0 R>>>> /BBox [0 0 32 10]>> stream\n" +
              "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm 2.00 2.00 Td (hello world) Tj " +
              "ET Q EMC\nendstream\nendobj\n"
          );
          done();
        }, done.fail);
    });
  });

  describe("ButtonWidgetAnnotation", function () {
    let buttonWidgetDict;

    beforeEach(function (done) {
      buttonWidgetDict = new Dict();
      buttonWidgetDict.set("Type", Name.get("Annot"));
      buttonWidgetDict.set("Subtype", Name.get("Widget"));
      buttonWidgetDict.set("FT", Name.get("Btn"));
      done();
    });

    afterEach(function () {
      buttonWidgetDict = null;
    });

    it("should handle checkboxes with export value", function (done) {
      buttonWidgetDict.set("V", Name.get("1"));

      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Off", 0);
      normalAppearanceDict.set("Checked", 1);
      appearanceStatesDict.set("N", normalAppearanceDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.radioButton).toEqual(false);
        expect(data.exportValue).toEqual("Checked");
        done();
      }, done.fail);
    });

    it("should handle checkboxes without export value", function (done) {
      buttonWidgetDict.set("V", Name.get("1"));

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.radioButton).toEqual(false);
        done();
      }, done.fail);
    });

    it("should handle checkboxes without /Off appearance", function (done) {
      buttonWidgetDict.set("V", Name.get("1"));

      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Checked", 1);
      appearanceStatesDict.set("N", normalAppearanceDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.radioButton).toEqual(false);
        expect(data.exportValue).toEqual("Checked");
        done();
      }, done.fail);
    });

    it("should render checkboxes for printing", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();
      const checkedAppearanceDict = new Dict();
      const uncheckedAppearanceDict = new Dict();

      const checkedStream = new StringStream("0.1 0.2 0.3 rg");
      checkedStream.dict = checkedAppearanceDict;

      const uncheckedStream = new StringStream("0.3 0.2 0.1 rg");
      uncheckedStream.dict = uncheckedAppearanceDict;

      checkedAppearanceDict.set("BBox", [0, 0, 8, 8]);
      checkedAppearanceDict.set("FormType", 1);
      checkedAppearanceDict.set("Matrix", [1, 0, 0, 1, 0, 0]);
      normalAppearanceDict.set("Checked", checkedStream);
      normalAppearanceDict.set("Off", uncheckedStream);
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test print");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.getOperatorList(
              partialEvaluator,
              task,
              false,
              annotationStorage
            ),
          ]);
        }, done.fail)
        .then(([annotation, opList]) => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([26, 51, 76])
          );
          return annotation;
        }, done.fail)
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = false;
          return annotation.getOperatorList(
            partialEvaluator,
            task,
            false,
            annotationStorage
          );
        }, done.fail)
        .then(opList => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([76, 51, 26])
          );
          done();
        }, done.fail);
    });

    it("should render checkboxes for printing two times", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();
      const checkedAppearanceDict = new Dict();
      const uncheckedAppearanceDict = new Dict();

      const checkedStream = new StringStream("0.1 0.2 0.3 rg");
      checkedStream.dict = checkedAppearanceDict;

      const uncheckedStream = new StringStream("0.3 0.2 0.1 rg");
      uncheckedStream.dict = uncheckedAppearanceDict;

      checkedAppearanceDict.set("BBox", [0, 0, 8, 8]);
      checkedAppearanceDict.set("FormType", 1);
      checkedAppearanceDict.set("Matrix", [1, 0, 0, 1, 0, 0]);
      normalAppearanceDict.set("Checked", checkedStream);
      normalAppearanceDict.set("Off", uncheckedStream);
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("AP", appearanceStatesDict);
      buttonWidgetDict.set("AS", Name.get("Off"));

      const buttonWidgetRef = Ref.get(1249, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test print");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.getOperatorList(
              partialEvaluator,
              task,
              false,
              annotationStorage
            ),
          ]);
        })
        .then(([annotation, opList]) => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([26, 51, 76])
          );
          return annotation;
        })
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return annotation.getOperatorList(
            partialEvaluator,
            task,
            false,
            annotationStorage
          );
        })
        .then(opList => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([26, 51, 76])
          );
          done();
        })
        .catch(done.fail);
    });

    it("should save checkboxes", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Checked", Ref.get(314, 0));
      normalAppearanceDict.set("Off", Ref.get(271, 0));
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("AP", appearanceStatesDict);
      buttonWidgetDict.set("V", Name.get("Off"));

      const buttonWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.save(partialEvaluator, task, annotationStorage),
          ]);
        }, done.fail)
        .then(([annotation, [oldData]]) => {
          oldData.data = oldData.data.replace(/\(D:[0-9]+\)/, "(date)");
          expect(oldData.ref).toEqual(Ref.get(123, 0));
          expect(oldData.data).toEqual(
            "123 0 obj\n" +
              "<< /Type /Annot /Subtype /Widget /FT /Btn " +
              "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
              "/V /Checked /AS /Checked /M (date)>>\nendobj\n"
          );
          return annotation;
        }, done.fail)
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = false;
          return annotation.save(partialEvaluator, task, annotationStorage);
        }, done.fail)
        .then(data => {
          expect(data).toEqual(null);
          done();
        }, done.fail);
    });

    it("should handle radio buttons with a field value", function (done) {
      const parentDict = new Dict();
      parentDict.set("V", Name.get("1"));

      const normalAppearanceStateDict = new Dict();
      normalAppearanceStateDict.set("2", null);

      const appearanceStatesDict = new Dict();
      appearanceStatesDict.set("N", normalAppearanceStateDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("Parent", parentDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual("1");
        expect(data.buttonValue).toEqual("2");
        done();
      }, done.fail);
    });

    it("should handle radio buttons with a field value not an ascii string", function (done) {
      const parentDict = new Dict();
      parentDict.set("V", Name.get("\x91I=\x91\xf0\x93\xe0\x97e3"));

      const normalAppearanceStateDict = new Dict();
      normalAppearanceStateDict.set("\x91I=\x91\xf0\x93\xe0\x97e3", null);

      const appearanceStatesDict = new Dict();
      appearanceStatesDict.set("N", normalAppearanceStateDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("Parent", parentDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual("‚I=‚ðﬁàŠe3");
        expect(data.buttonValue).toEqual("‚I=‚ðﬁàŠe3");
        done();
      }, done.fail);
    });

    it("should handle radio buttons without a field value", function (done) {
      const normalAppearanceStateDict = new Dict();
      normalAppearanceStateDict.set("2", null);

      const appearanceStatesDict = new Dict();
      appearanceStatesDict.set("N", normalAppearanceStateDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.checkBox).toEqual(false);
        expect(data.radioButton).toEqual(true);
        expect(data.fieldValue).toEqual(null);
        expect(data.buttonValue).toEqual("2");
        done();
      }, done.fail);
    });

    it("should render radio buttons for printing", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();
      const checkedAppearanceDict = new Dict();
      const uncheckedAppearanceDict = new Dict();

      const checkedStream = new StringStream("0.1 0.2 0.3 rg");
      checkedStream.dict = checkedAppearanceDict;

      const uncheckedStream = new StringStream("0.3 0.2 0.1 rg");
      uncheckedStream.dict = uncheckedAppearanceDict;

      checkedAppearanceDict.set("BBox", [0, 0, 8, 8]);
      checkedAppearanceDict.set("FormType", 1);
      checkedAppearanceDict.set("Matrix", [1, 0, 0, 1, 0, 0]);
      normalAppearanceDict.set("Checked", checkedStream);
      normalAppearanceDict.set("Off", uncheckedStream);
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test print");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.getOperatorList(
              partialEvaluator,
              task,
              false,
              annotationStorage
            ),
          ]);
        }, done.fail)
        .then(([annotation, opList]) => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([26, 51, 76])
          );
          return annotation;
        }, done.fail)
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = false;
          return annotation.getOperatorList(
            partialEvaluator,
            task,
            false,
            annotationStorage
          );
        }, done.fail)
        .then(opList => {
          expect(opList.argsArray.length).toEqual(3);
          expect(opList.fnArray).toEqual([
            OPS.beginAnnotation,
            OPS.setFillRGBColor,
            OPS.endAnnotation,
          ]);
          expect(opList.argsArray[1]).toEqual(
            new Uint8ClampedArray([76, 51, 26])
          );
          done();
        }, done.fail);
    });

    it("should save radio buttons", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Checked", Ref.get(314, 0));
      normalAppearanceDict.set("Off", Ref.get(271, 0));
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(123, 0);
      const parentRef = Ref.get(456, 0);

      const parentDict = new Dict();
      parentDict.set("V", Name.get("Off"));
      parentDict.set("Kids", [buttonWidgetRef]);
      buttonWidgetDict.set("Parent", parentRef);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
        { ref: parentRef, data: parentDict },
      ]);

      parentDict.xref = xref;
      buttonWidgetDict.xref = xref;
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.save(partialEvaluator, task, annotationStorage),
          ]);
        }, done.fail)
        .then(([annotation, data]) => {
          expect(data.length).toEqual(2);
          const [radioData, parentData] = data;
          radioData.data = radioData.data.replace(/\(D:[0-9]+\)/, "(date)");
          expect(radioData.ref).toEqual(Ref.get(123, 0));
          expect(radioData.data).toEqual(
            "123 0 obj\n" +
              "<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 32768 " +
              "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
              "/Parent 456 0 R /AS /Checked /M (date)>>\nendobj\n"
          );
          expect(parentData.ref).toEqual(Ref.get(456, 0));
          expect(parentData.data).toEqual(
            "456 0 obj\n<< /V /Checked /Kids [123 0 R]>>\nendobj\n"
          );

          return annotation;
        }, done.fail)
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = false;
          return annotation.save(partialEvaluator, task, annotationStorage);
        }, done.fail)
        .then(data => {
          expect(data).toEqual(null);
          done();
        }, done.fail);
    });

    it("should save radio buttons without a field value", function (done) {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Checked", Ref.get(314, 0));
      normalAppearanceDict.set("Off", Ref.get(271, 0));
      appearanceStatesDict.set("N", normalAppearanceDict);

      buttonWidgetDict.set("Ff", AnnotationFieldFlag.RADIO);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(123, 0);
      const parentRef = Ref.get(456, 0);

      const parentDict = new Dict();
      parentDict.set("Kids", [buttonWidgetRef]);
      buttonWidgetDict.set("Parent", parentRef);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
        { ref: parentRef, data: parentDict },
      ]);

      parentDict.xref = xref;
      buttonWidgetDict.xref = xref;
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = true;
          return Promise.all([
            annotation,
            annotation.save(partialEvaluator, task, annotationStorage),
          ]);
        })
        .then(([annotation, data]) => {
          expect(data.length).toEqual(2);
          const [radioData, parentData] = data;
          radioData.data = radioData.data.replace(/\(D:[0-9]+\)/, "(date)");
          expect(radioData.ref).toEqual(Ref.get(123, 0));
          expect(radioData.data).toEqual(
            "123 0 obj\n" +
              "<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 32768 " +
              "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
              "/Parent 456 0 R /AS /Checked /M (date)>>\nendobj\n"
          );
          expect(parentData.ref).toEqual(Ref.get(456, 0));
          expect(parentData.data).toEqual(
            "456 0 obj\n<< /Kids [123 0 R] /V /Checked>>\nendobj\n"
          );
          done();
        })
        .catch(done.fail);
    });

    it("should save nothing", function (done) {
      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          return annotation.save(partialEvaluator, task, {});
        })
        .then(data => {
          expect(data).toEqual(null);
          done();
        })
        .catch(done.fail);
    });
  });

  describe("ChoiceWidgetAnnotation", function () {
    let choiceWidgetDict, fontRefObj;

    beforeEach(function (done) {
      choiceWidgetDict = new Dict();
      choiceWidgetDict.set("Type", Name.get("Annot"));
      choiceWidgetDict.set("Subtype", Name.get("Widget"));
      choiceWidgetDict.set("FT", Name.get("Ch"));

      const helvDict = new Dict();
      helvDict.set("BaseFont", Name.get("Helvetica"));
      helvDict.set("Type", Name.get("Font"));
      helvDict.set("Subtype", Name.get("Type1"));

      const fontRef = Ref.get(314, 0);
      fontRefObj = { ref: fontRef, data: helvDict };
      const resourceDict = new Dict();
      const fontDict = new Dict();
      fontDict.set("Helv", fontRef);
      resourceDict.set("Font", fontDict);

      choiceWidgetDict.set("DA", "/Helv 5 Tf");
      choiceWidgetDict.set("DR", resourceDict);
      choiceWidgetDict.set("Rect", [0, 0, 32, 10]);

      done();
    });

    afterEach(function () {
      choiceWidgetDict = fontRefObj = null;
    });

    it("should handle missing option arrays", function (done) {
      const choiceWidgetRef = Ref.get(122, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.options).toEqual([]);
        done();
      }, done.fail);
    });

    it("should handle option arrays with array elements", function (done) {
      const optionBarRef = Ref.get(20, 0);
      const optionBarStr = "Bar";
      const optionOneRef = Ref.get(10, 0);
      const optionOneArr = ["bar_export", optionBarRef];

      const options = [["foo_export", "Foo"], optionOneRef];
      const expected = [
        { exportValue: "foo_export", displayValue: "Foo" },
        { exportValue: "bar_export", displayValue: "Bar" },
      ];

      choiceWidgetDict.set("Opt", options);

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        { ref: optionBarRef, data: optionBarStr },
        { ref: optionOneRef, data: optionOneArr },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });

    it("should handle option arrays with string elements", function (done) {
      const optionBarRef = Ref.get(10, 0);
      const optionBarStr = "Bar";

      const options = ["Foo", optionBarRef];
      const expected = [
        { exportValue: "Foo", displayValue: "Foo" },
        { exportValue: "Bar", displayValue: "Bar" },
      ];

      choiceWidgetDict.set("Opt", options);

      const choiceWidgetRef = Ref.get(981, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        { ref: optionBarRef, data: optionBarStr },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });

    it("should handle inherited option arrays (issue 8094)", function (done) {
      const options = [
        ["Value1", "Description1"],
        ["Value2", "Description2"],
      ];
      const expected = [
        { exportValue: "Value1", displayValue: "Description1" },
        { exportValue: "Value2", displayValue: "Description2" },
      ];

      const parentDict = new Dict();
      parentDict.set("Opt", options);

      choiceWidgetDict.set("Parent", parentDict);

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.options).toEqual(expected);
        done();
      }, done.fail);
    });

    it("should decode form values", function (done) {
      const encodedString = "\xFE\xFF\x00F\x00o\x00o";
      const decodedString = "Foo";

      choiceWidgetDict.set("Opt", [encodedString]);
      choiceWidgetDict.set("V", encodedString);

      const choiceWidgetRef = Ref.get(984, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.fieldValue).toEqual([decodedString]);
        expect(data.options).toEqual([
          { exportValue: decodedString, displayValue: decodedString },
        ]);
        done();
      }, done.fail);
    });

    it("should convert the field value to an array", function (done) {
      const inputs = [null, "Foo", ["Foo", "Bar"]];
      const outputs = [[], ["Foo"], ["Foo", "Bar"]];

      let promise = Promise.resolve();
      for (let i = 0, ii = inputs.length; i < ii; i++) {
        promise = promise.then(() => {
          choiceWidgetDict.set("V", inputs[i]);

          const choiceWidgetRef = Ref.get(968, 0);
          const xref = new XRefMock([
            { ref: choiceWidgetRef, data: choiceWidgetDict },
          ]);

          return AnnotationFactory.create(
            xref,
            choiceWidgetRef,
            pdfManagerMock,
            idFactoryMock
          ).then(({ data }) => {
            expect(data.annotationType).toEqual(AnnotationType.WIDGET);
            expect(data.fieldValue).toEqual(outputs[i]);
          });
        });
      }
      promise.then(done, done.fail);
    });

    it("should handle unknown flags", function (done) {
      const choiceWidgetRef = Ref.get(166, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });

    it("should not set invalid flags", function (done) {
      choiceWidgetDict.set("Ff", "readonly");

      const choiceWidgetRef = Ref.get(165, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(false);
        expect(data.combo).toEqual(false);
        expect(data.multiSelect).toEqual(false);
        done();
      }, done.fail);
    });

    it("should set valid flags", function (done) {
      choiceWidgetDict.set(
        "Ff",
        AnnotationFieldFlag.READONLY +
          AnnotationFieldFlag.COMBO +
          AnnotationFieldFlag.MULTISELECT
      );

      const choiceWidgetRef = Ref.get(512, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.readOnly).toEqual(true);
        expect(data.combo).toEqual(true);
        expect(data.multiSelect).toEqual(true);
        done();
      }, done.fail);
    });

    it("should render choice for printing", function (done) {
      const choiceWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const id = annotation.data.id;
          const annotationStorage = {};
          annotationStorage[id] = "a value";
          return annotation._getAppearance(
            partialEvaluator,
            task,
            annotationStorage
          );
        }, done.fail)
        .then(appearance => {
          expect(appearance).toEqual(
            "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm" +
              " 2.00 2.00 Td (a value) Tj ET Q EMC"
          );
          done();
        }, done.fail);
    });

    it("should save choice", function (done) {
      choiceWidgetDict.set("Opt", ["A", "B", "C"]);
      choiceWidgetDict.set("V", "A");

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        pdfManagerMock,
        idFactoryMock
      )
        .then(annotation => {
          const annotationStorage = {};
          annotationStorage[annotation.data.id] = "C";
          return annotation.save(partialEvaluator, task, annotationStorage);
        }, done.fail)
        .then(data => {
          expect(data.length).toEqual(2);
          const [oldData, newData] = data;
          expect(oldData.ref).toEqual(Ref.get(123, 0));
          expect(newData.ref).toEqual(Ref.get(1, 0));

          oldData.data = oldData.data.replace(/\(D:[0-9]+\)/, "(date)");
          expect(oldData.data).toEqual(
            "123 0 obj\n" +
              "<< /Type /Annot /Subtype /Widget /FT /Ch /DA (/Helv 5 Tf) /DR " +
              "<< /Font << /Helv 314 0 R>>>> " +
              "/Rect [0 0 32 10] /Opt [(A) (B) (C)] /V (C) " +
              "/AP << /N 1 0 R>> /M (date)>>\nendobj\n"
          );
          expect(newData.data).toEqual(
            "1 0 obj\n" +
              "<< /Length 67 /Subtype /Form /Resources << /Font << /Helv 314 0 R>>>> " +
              "/BBox [0 0 32 10]>> stream\n" +
              "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm 2.00 2.00 Td (C) Tj ET Q EMC\n" +
              "endstream\nendobj\n"
          );
          done();
        }, done.fail);
    });
  });

  describe("LineAnnotation", function () {
    it("should set the line coordinates", function (done) {
      const lineDict = new Dict();
      lineDict.set("Type", Name.get("Annot"));
      lineDict.set("Subtype", Name.get("Line"));
      lineDict.set("L", [1, 2, 3, 4]);

      const lineRef = Ref.get(122, 0);
      const xref = new XRefMock([{ ref: lineRef, data: lineDict }]);

      AnnotationFactory.create(
        xref,
        lineRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.LINE);
        expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
        done();
      }, done.fail);
    });
  });

  describe("FileAttachmentAnnotation", function () {
    it("should correctly parse a file attachment", function (done) {
      const fileStream = new StringStream(
        "<<\n" +
          "/Type /EmbeddedFile\n" +
          "/Subtype /text#2Fplain\n" +
          ">>\n" +
          "stream\n" +
          "Test attachment" +
          "endstream\n"
      );
      const parser = new Parser({
        lexer: new Lexer(fileStream),
        xref: null,
        allowStreams: true,
      });

      const fileStreamRef = Ref.get(18, 0);
      const fileStreamDict = parser.getObj();

      const embeddedFileDict = new Dict();
      embeddedFileDict.set("F", fileStreamRef);

      const fileSpecRef = Ref.get(19, 0);
      const fileSpecDict = new Dict();
      fileSpecDict.set("Type", Name.get("Filespec"));
      fileSpecDict.set("Desc", "");
      fileSpecDict.set("EF", embeddedFileDict);
      fileSpecDict.set("UF", "Test.txt");

      const fileAttachmentRef = Ref.get(20, 0);
      const fileAttachmentDict = new Dict();
      fileAttachmentDict.set("Type", Name.get("Annot"));
      fileAttachmentDict.set("Subtype", Name.get("FileAttachment"));
      fileAttachmentDict.set("FS", fileSpecRef);
      fileAttachmentDict.set("T", "Topic");
      fileAttachmentDict.set("Contents", "Test.txt");

      const xref = new XRefMock([
        { ref: fileStreamRef, data: fileStreamDict },
        { ref: fileSpecRef, data: fileSpecDict },
        { ref: fileAttachmentRef, data: fileAttachmentDict },
      ]);
      embeddedFileDict.assignXref(xref);
      fileSpecDict.assignXref(xref);
      fileAttachmentDict.assignXref(xref);

      AnnotationFactory.create(
        xref,
        fileAttachmentRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.FILEATTACHMENT);
        expect(data.file.filename).toEqual("Test.txt");
        expect(data.file.content).toEqual(stringToBytes("Test attachment"));
        done();
      }, done.fail);
    });
  });

  describe("PopupAnnotation", function () {
    it("should inherit properties from its parent", function (done) {
      const parentDict = new Dict();
      parentDict.set("Type", Name.get("Annot"));
      parentDict.set("Subtype", Name.get("Text"));
      parentDict.set("M", "D:20190423");
      parentDict.set("C", [0, 0, 1]);

      const popupDict = new Dict();
      popupDict.set("Type", Name.get("Annot"));
      popupDict.set("Subtype", Name.get("Popup"));
      popupDict.set("Parent", parentDict);

      const popupRef = Ref.get(13, 0);
      const xref = new XRefMock([{ ref: popupRef, data: popupDict }]);

      AnnotationFactory.create(
        xref,
        popupRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data, viewable }) => {
        expect(data.annotationType).toEqual(AnnotationType.POPUP);
        expect(data.modificationDate).toEqual("D:20190423");
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
        done();
      }, done.fail);
    });

    it("should handle missing parent properties", function (done) {
      const parentDict = new Dict();
      parentDict.set("Type", Name.get("Annot"));
      parentDict.set("Subtype", Name.get("Text"));

      const popupDict = new Dict();
      popupDict.set("Type", Name.get("Annot"));
      popupDict.set("Subtype", Name.get("Popup"));
      popupDict.set("Parent", parentDict);

      const popupRef = Ref.get(13, 0);
      const xref = new XRefMock([{ ref: popupRef, data: popupDict }]);

      AnnotationFactory.create(
        xref,
        popupRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data, viewable }) => {
        expect(data.annotationType).toEqual(AnnotationType.POPUP);
        expect(data.modificationDate).toEqual(null);
        expect(data.color).toEqual(null);
        done();
      }, done.fail);
    });

    it(
      "should inherit the parent flags when the Popup is not viewable, " +
        "but the parent is (PR 7352)",
      function (done) {
        const parentDict = new Dict();
        parentDict.set("Type", Name.get("Annot"));
        parentDict.set("Subtype", Name.get("Text"));
        parentDict.set("F", 28); // viewable

        const popupDict = new Dict();
        popupDict.set("Type", Name.get("Annot"));
        popupDict.set("Subtype", Name.get("Popup"));
        popupDict.set("F", 25); // not viewable
        popupDict.set("Parent", parentDict);

        const popupRef = Ref.get(13, 0);
        const xref = new XRefMock([{ ref: popupRef, data: popupDict }]);

        AnnotationFactory.create(
          xref,
          popupRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data, viewable }) => {
          expect(data.annotationType).toEqual(AnnotationType.POPUP);
          // We should not modify the `annotationFlags` returned through
          // e.g., the API.
          expect(data.annotationFlags).toEqual(25);
          // The popup should inherit the `viewable` property of the parent.
          expect(viewable).toEqual(true);
          done();
        }, done.fail);
      }
    );

    it(
      "should correctly inherit Contents from group-master annotation " +
        "if parent has ReplyType == Group",
      function (done) {
        const annotationRef = Ref.get(819, 0);
        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Text"));
        annotationDict.set("T", "Correct Title");
        annotationDict.set("Contents", "Correct Text");
        annotationDict.set("M", "D:20190423");
        annotationDict.set("C", [0, 0, 1]);

        const replyRef = Ref.get(820, 0);
        const replyDict = new Dict();
        replyDict.set("Type", Name.get("Annot"));
        replyDict.set("Subtype", Name.get("Text"));
        replyDict.set("IRT", annotationRef);
        replyDict.set("RT", Name.get("Group"));
        replyDict.set("T", "Reply Title");
        replyDict.set("Contents", "Reply Text");
        replyDict.set("M", "D:20190523");
        replyDict.set("C", [0.4]);

        const popupRef = Ref.get(821, 0);
        const popupDict = new Dict();
        popupDict.set("Type", Name.get("Annot"));
        popupDict.set("Subtype", Name.get("Popup"));
        popupDict.set("T", "Wrong Title");
        popupDict.set("Contents", "Wrong Text");
        popupDict.set("Parent", replyRef);
        popupDict.set("M", "D:20190623");
        popupDict.set("C", [0.8]);
        replyDict.set("Popup", popupRef);

        const xref = new XRefMock([
          { ref: annotationRef, data: annotationDict },
          { ref: replyRef, data: replyDict },
          { ref: popupRef, data: popupDict },
        ]);
        annotationDict.assignXref(xref);
        popupDict.assignXref(xref);
        replyDict.assignXref(xref);

        AnnotationFactory.create(
          xref,
          popupRef,
          pdfManagerMock,
          idFactoryMock
        ).then(({ data }) => {
          expect(data.title).toEqual("Correct Title");
          expect(data.contents).toEqual("Correct Text");
          expect(data.modificationDate).toEqual("D:20190423");
          expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
          done();
        }, done.fail);
      }
    );
  });

  describe("InkAnnotation", function () {
    it("should handle a single ink list", function (done) {
      const inkDict = new Dict();
      inkDict.set("Type", Name.get("Annot"));
      inkDict.set("Subtype", Name.get("Ink"));
      inkDict.set("InkList", [[1, 1, 1, 2, 2, 2, 3, 3]]);

      const inkRef = Ref.get(142, 0);
      const xref = new XRefMock([{ ref: inkRef, data: inkDict }]);

      AnnotationFactory.create(
        xref,
        inkRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.INK);
        expect(data.inkLists.length).toEqual(1);
        expect(data.inkLists[0]).toEqual([
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ]);
        done();
      }, done.fail);
    });

    it("should handle multiple ink lists", function (done) {
      const inkDict = new Dict();
      inkDict.set("Type", Name.get("Annot"));
      inkDict.set("Subtype", Name.get("Ink"));
      inkDict.set("InkList", [
        [1, 1, 1, 2],
        [3, 3, 4, 5],
      ]);

      const inkRef = Ref.get(143, 0);
      const xref = new XRefMock([{ ref: inkRef, data: inkDict }]);

      AnnotationFactory.create(
        xref,
        inkRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.INK);
        expect(data.inkLists.length).toEqual(2);
        expect(data.inkLists[0]).toEqual([
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ]);
        expect(data.inkLists[1]).toEqual([
          { x: 3, y: 3 },
          { x: 4, y: 5 },
        ]);
        done();
      }, done.fail);
    });
  });

  describe("HightlightAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const highlightDict = new Dict();
      highlightDict.set("Type", Name.get("Annot"));
      highlightDict.set("Subtype", Name.get("Highlight"));

      const highlightRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: highlightRef, data: highlightDict }]);

      AnnotationFactory.create(
        xref,
        highlightRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.HIGHLIGHT);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });

    it("should set quadpoints if defined", function (done) {
      const highlightDict = new Dict();
      highlightDict.set("Type", Name.get("Annot"));
      highlightDict.set("Subtype", Name.get("Highlight"));
      highlightDict.set("Rect", [10, 10, 20, 20]);
      highlightDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const highlightRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: highlightRef, data: highlightDict }]);

      AnnotationFactory.create(
        xref,
        highlightRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.HIGHLIGHT);
        expect(data.quadPoints).toEqual([
          [
            { x: 11, y: 11 },
            { x: 12, y: 12 },
            { x: 13, y: 13 },
            { x: 14, y: 14 },
          ],
        ]);
        done();
      }, done.fail);
    });
  });

  describe("UnderlineAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const underlineDict = new Dict();
      underlineDict.set("Type", Name.get("Annot"));
      underlineDict.set("Subtype", Name.get("Underline"));

      const underlineRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: underlineRef, data: underlineDict }]);

      AnnotationFactory.create(
        xref,
        underlineRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.UNDERLINE);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });

    it("should set quadpoints if defined", function (done) {
      const underlineDict = new Dict();
      underlineDict.set("Type", Name.get("Annot"));
      underlineDict.set("Subtype", Name.get("Underline"));
      underlineDict.set("Rect", [10, 10, 20, 20]);
      underlineDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const underlineRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: underlineRef, data: underlineDict }]);

      AnnotationFactory.create(
        xref,
        underlineRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.UNDERLINE);
        expect(data.quadPoints).toEqual([
          [
            { x: 11, y: 11 },
            { x: 12, y: 12 },
            { x: 13, y: 13 },
            { x: 14, y: 14 },
          ],
        ]);
        done();
      }, done.fail);
    });
  });

  describe("SquigglyAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const squigglyDict = new Dict();
      squigglyDict.set("Type", Name.get("Annot"));
      squigglyDict.set("Subtype", Name.get("Squiggly"));

      const squigglyRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: squigglyRef, data: squigglyDict }]);

      AnnotationFactory.create(
        xref,
        squigglyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.SQUIGGLY);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });

    it("should set quadpoints if defined", function (done) {
      const squigglyDict = new Dict();
      squigglyDict.set("Type", Name.get("Annot"));
      squigglyDict.set("Subtype", Name.get("Squiggly"));
      squigglyDict.set("Rect", [10, 10, 20, 20]);
      squigglyDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const squigglyRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: squigglyRef, data: squigglyDict }]);

      AnnotationFactory.create(
        xref,
        squigglyRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.SQUIGGLY);
        expect(data.quadPoints).toEqual([
          [
            { x: 11, y: 11 },
            { x: 12, y: 12 },
            { x: 13, y: 13 },
            { x: 14, y: 14 },
          ],
        ]);
        done();
      }, done.fail);
    });
  });

  describe("StrikeOutAnnotation", function () {
    it("should not set quadpoints if not defined", function (done) {
      const strikeOutDict = new Dict();
      strikeOutDict.set("Type", Name.get("Annot"));
      strikeOutDict.set("Subtype", Name.get("StrikeOut"));

      const strikeOutRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: strikeOutRef, data: strikeOutDict }]);

      AnnotationFactory.create(
        xref,
        strikeOutRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.STRIKEOUT);
        expect(data.quadPoints).toBeUndefined();
        done();
      }, done.fail);
    });

    it("should set quadpoints if defined", function (done) {
      const strikeOutDict = new Dict();
      strikeOutDict.set("Type", Name.get("Annot"));
      strikeOutDict.set("Subtype", Name.get("StrikeOut"));
      strikeOutDict.set("Rect", [10, 10, 20, 20]);
      strikeOutDict.set("QuadPoints", [11, 11, 12, 12, 13, 13, 14, 14]);

      const strikeOutRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: strikeOutRef, data: strikeOutDict }]);

      AnnotationFactory.create(
        xref,
        strikeOutRef,
        pdfManagerMock,
        idFactoryMock
      ).then(({ data }) => {
        expect(data.annotationType).toEqual(AnnotationType.STRIKEOUT);
        expect(data.quadPoints).toEqual([
          [
            { x: 11, y: 11 },
            { x: 12, y: 12 },
            { x: 13, y: 13 },
            { x: 14, y: 14 },
          ],
        ]);
        done();
      }, done.fail);
    });
  });
});
