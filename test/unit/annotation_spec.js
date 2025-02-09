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
  AnnotationEditorType,
  AnnotationFieldFlag,
  AnnotationFlag,
  AnnotationType,
  OPS,
  RenderingIntentFlag,
  stringToBytes,
  stringToUTF8String,
} from "../../src/shared/util.js";
import {
  CMAP_URL,
  createIdFactory,
  DefaultCMapReaderFactory,
  DefaultStandardFontDataFactory,
  STANDARD_FONT_DATA_URL,
  XRefMock,
} from "./test_utils.js";
import { Dict, Name, Ref, RefSetCache } from "../../src/core/primitives.js";
import { Lexer, Parser } from "../../src/core/parser.js";
import { FlateStream } from "../../src/core/flate_stream.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";
import { StringStream } from "../../src/core/stream.js";
import { WorkerTask } from "../../src/core/worker.js";
import { writeChanges } from "../../src/core/writer.js";

describe("annotation", function () {
  class PDFManagerMock {
    constructor(params) {
      this.pdfDocument = {
        catalog: {
          baseUrl: params.docBaseUrl || null,
        },
      };
      this.evaluatorOptions = {
        isEvalSupported: true,
        isOffscreenCanvasSupported: false,
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

    ensureDoc(prop, args) {
      return this.ensure(this.pdfDocument, prop, args);
    }
  }

  const fontDataReader = new DefaultStandardFontDataFactory({
    baseUrl: STANDARD_FONT_DATA_URL,
  });

  class HandlerMock {
    constructor() {
      this.inputs = [];
    }

    send(name, data) {
      this.inputs.push({ name, data });
    }

    sendWithPromise(name, data) {
      if (name !== "FetchStandardFontData") {
        return Promise.reject(new Error(`Unsupported mock ${name}.`));
      }
      return fontDataReader.fetch(data);
    }
  }

  let annotationGlobalsMock, pdfManagerMock, idFactoryMock, partialEvaluator;

  beforeAll(async function () {
    pdfManagerMock = new PDFManagerMock({
      docBaseUrl: null,
    });

    annotationGlobalsMock =
      await AnnotationFactory.createGlobals(pdfManagerMock);

    const CMapReaderFactory = new DefaultCMapReaderFactory({
      baseUrl: CMAP_URL,
    });

    const builtInCMapCache = new Map();
    builtInCMapCache.set(
      "UniJIS-UTF16-H",
      await CMapReaderFactory.fetch({ name: "UniJIS-UTF16-H" })
    );
    builtInCMapCache.set(
      "Adobe-Japan1-UCS2",
      await CMapReaderFactory.fetch({ name: "Adobe-Japan1-UCS2" })
    );

    idFactoryMock = createIdFactory(/* pageIndex = */ 0);
    partialEvaluator = new PartialEvaluator({
      xref: new XRefMock(),
      handler: new HandlerMock(),
      pageIndex: 0,
      idFactory: createIdFactory(/* pageIndex = */ 0),
      fontCache: new RefSetCache(),
      builtInCMapCache,
      standardFontDataCache: new Map(),
      systemFontCache: new Map(),
    });
  });

  afterAll(function () {
    annotationGlobalsMock = null;
    pdfManagerMock = null;
    idFactoryMock = null;
    partialEvaluator = null;
  });

  describe("AnnotationFactory", function () {
    it("should get id for annotation", async function () {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));

      const annotationRef = Ref.get(10, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.id).toEqual("10R");
    });

    it(
      "should handle, and get fallback IDs for, annotations that are not " +
        "indirect objects (issue 7569)",
      async function () {
        const annotationDict = new Dict();
        annotationDict.set("Type", Name.get("Annot"));
        annotationDict.set("Subtype", Name.get("Link"));

        const xref = new XRefMock();
        const idFactory = createIdFactory(/* pageIndex = */ 0);

        const annotation1 = AnnotationFactory.create(
          xref,
          annotationDict,
          annotationGlobalsMock,
          idFactory
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.id).toEqual("annot_p0_1");
        });

        const annotation2 = AnnotationFactory.create(
          xref,
          annotationDict,
          annotationGlobalsMock,
          idFactory
        ).then(({ data }) => {
          expect(data.annotationType).toEqual(AnnotationType.LINK);
          expect(data.id).toEqual("annot_p0_2");
        });

        await Promise.all([annotation1, annotation2]);
      }
    );

    it("should handle missing /Subtype", async function () {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));

      const annotationRef = Ref.get(1, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toBeUndefined();
    });
  });

  describe("getQuadPoints", function () {
    let dict, rect;

    beforeEach(function () {
      dict = new Dict();
      rect = [];
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

    it("should process quadpoints in the standard order", function () {
      rect = [10, 10, 20, 20];
      const quadPoints = [
        10, 20, 20, 20, 10, 10, 20, 10, 11, 19, 19, 19, 11, 11, 19, 11,
      ];
      dict.set("QuadPoints", quadPoints);
      expect(getQuadPoints(dict, rect)).toEqual(Float32Array.from(quadPoints));
    });

    it("should normalize and process quadpoints in non-standard orders", function () {
      rect = [10, 10, 20, 20];
      const nonStandardOrders = [
        // Bottom left, bottom right, top right and top left.
        [10, 20, 20, 20, 20, 10, 10, 10],

        // Top left, top right, bottom left and bottom right.
        [10, 10, 20, 10, 10, 20, 20, 20],

        // Top left, top right, bottom right and bottom left.
        [10, 10, 20, 10, 20, 20, 10, 20],
      ];

      for (const nonStandardOrder of nonStandardOrders) {
        dict.set("QuadPoints", nonStandardOrder);
        expect(getQuadPoints(dict, rect)).toEqual(
          Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
        );
      }
    });
  });

  describe("Annotation", function () {
    let dict, ref;

    beforeAll(function () {
      dict = new Dict();
      ref = Ref.get(1, 0);
    });

    afterAll(function () {
      dict = ref = null;
    });

    it("should set and get valid contents", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setContents("Foo bar baz");

      expect(annotation._contents).toEqual({ str: "Foo bar baz", dir: "ltr" });
    });

    it("should not set and get invalid contents", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setContents(undefined);

      expect(annotation._contents).toEqual({ str: "", dir: "ltr" });
    });

    it("should set and get a valid modification date", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setModificationDate("D:20190422");

      expect(annotation.modificationDate).toEqual("D:20190422");
    });

    it("should not set and get an invalid modification date", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setModificationDate(undefined);

      expect(annotation.modificationDate).toEqual(null);
    });

    it("should set and get flags", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setFlags(13);

      expect(annotation.hasFlag(AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.READONLY)).toEqual(false);
      expect(annotation.hasFlag(AnnotationFlag.HIDDEN)).toEqual(false);
    });

    it("should be viewable and not printable by default", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });

      expect(annotation.viewable).toEqual(true);
      expect(annotation.printable).toEqual(false);
    });

    it("should set and get a valid rectangle", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setRectangle([117, 694, 164.298, 720]);

      expect(annotation.rectangle).toEqual([117, 694, 164.298, 720]);
    });

    it("should not set and get an invalid rectangle", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setRectangle([117, 694, 164.298]);

      expect(annotation.rectangle).toEqual([0, 0, 0, 0]);
    });

    it("should reject a color if it is not an array", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor("red");

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });

    it("should set and get a transparent color", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor([]);

      expect(annotation.color).toEqual(null);
    });

    it("should set and get a grayscale color", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor([0.4]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
    });

    it("should set and get an RGB color", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor([0, 0, 1]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
    });

    it("should set and get a CMYK color", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([234, 59, 48]));
    });

    it("should not set and get an invalid color", function () {
      const annotation = new Annotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      annotation.setColor([0.4, 0.6]);

      expect(annotation.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
    });
  });

  describe("AnnotationBorderStyle", function () {
    it("should set and get a valid width", function () {
      const borderStyleInt = new AnnotationBorderStyle();
      borderStyleInt.setWidth(3);
      const borderStyleNum = new AnnotationBorderStyle();
      borderStyleNum.setWidth(2.5);

      expect(borderStyleInt.width).toEqual(3);
      expect(borderStyleNum.width).toEqual(2.5);
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

    it("should not set the width to zero if the dash array is empty (issue 17904)", function () {
      const borderStyle = new AnnotationBorderStyle();
      borderStyle.setWidth(3);
      borderStyle.setDashArray([]);

      expect(borderStyle.width).toEqual(3);
      expect(borderStyle.dashArray).toEqual([]);
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

    beforeAll(function () {
      dict = new Dict();
      ref = Ref.get(1, 0);
    });

    afterAll(function () {
      dict = ref = null;
    });

    it("should set and get a valid creation date", function () {
      const markupAnnotation = new MarkupAnnotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      markupAnnotation.setCreationDate("D:20190422");

      expect(markupAnnotation.creationDate).toEqual("D:20190422");
    });

    it("should not set and get an invalid creation date", function () {
      const markupAnnotation = new MarkupAnnotation({
        dict,
        ref,
        annotationGlobals: annotationGlobalsMock,
        evaluatorOptions: pdfManagerMock.evaluatorOptions,
      });
      markupAnnotation.setCreationDate(undefined);

      expect(markupAnnotation.creationDate).toEqual(null);
    });

    it("should not parse IRT/RT when not defined", async function () {
      dict.set("Type", Name.get("Annot"));
      dict.set("Subtype", Name.get("Text"));

      const xref = new XRefMock([{ ref, data: dict }]);
      const { data } = await AnnotationFactory.create(
        xref,
        ref,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.inReplyTo).toBeUndefined();
      expect(data.replyType).toBeUndefined();
    });

    it("should parse IRT and set default RT when not defined", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        replyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.inReplyTo).toEqual(annotationRef.toString());
      expect(data.replyType).toEqual("R");
    });

    it("should parse IRT/RT for a group type", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        replyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.inReplyTo).toEqual(annotationRef.toString());
      expect(data.replyType).toEqual("Group");
      expect(data.titleObj).toEqual({ str: "ParentTitle", dir: "ltr" });
      expect(data.contentsObj).toEqual({ str: "ParentText", dir: "ltr" });
      expect(data.creationDate).toEqual("D:20180423");
      expect(data.modificationDate).toEqual("D:20190423");
      expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
      expect(data.popupRef).toEqual("820R");
    });

    it("should parse IRT/RT for a reply type", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        replyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.inReplyTo).toEqual(annotationRef.toString());
      expect(data.replyType).toEqual("R");
      expect(data.titleObj).toEqual({ str: "ReplyTitle", dir: "ltr" });
      expect(data.contentsObj).toEqual({ str: "ReplyText", dir: "ltr" });
      expect(data.creationDate).toEqual("D:20180523");
      expect(data.modificationDate).toEqual("D:20190523");
      expect(data.color).toEqual(new Uint8ClampedArray([102, 102, 102]));
      expect(data.popupRef).toEqual(null);
    });
  });

  describe("TextAnnotation", function () {
    it("should not parse state model and state when not defined", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        replyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.stateModel).toBeNull();
      expect(data.state).toBeNull();
    });

    it("should correctly parse state model and state when defined", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        replyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.stateModel).toEqual("Review");
      expect(data.state).toEqual("Rejected");
    });
  });

  describe("LinkAnnotation", function () {
    it("should correctly parse a URI action", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toEqual("http://www.ctan.org/tex-archive/info/lshort");
      expect(data.unsafeUrl).toEqual(
        "http://www.ctan.org/tex-archive/info/lshort"
      );
      expect(data.dest).toBeUndefined();
    });

    it(
      "should correctly parse a URI action, where the URI entry " +
        "is missing a protocol",
      async function () {
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

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual("http://www.hmrc.gov.uk/");
        expect(data.unsafeUrl).toEqual("www.hmrc.gov.uk");
        expect(data.dest).toBeUndefined();
      }
    );

    it(
      "should correctly parse a URI action, where the URI entry " +
        "has an incorrect encoding (bug 1122280)",
      async function () {
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

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual(
          new URL(
            stringToUTF8String(
              "http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4"
            )
          ).href
        );
        expect(data.unsafeUrl).toEqual(
          "http://www.example.com/\xC3\xBC\xC3\xB6\xC3\xA4"
        );
        expect(data.dest).toBeUndefined();
      }
    );

    it("should correctly parse a GoTo action", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual("page.157");
    });

    it(
      "should correctly parse a GoToR action, where the FileSpec entry " +
        "is a string containing a relative URL",
      async function () {
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

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
      }
    );

    it(
      "should correctly parse a GoToR action, containing a relative URL, " +
        'with the "docBaseUrl" parameter specified',
      async function () {
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
        const annotationGlobals =
          await AnnotationFactory.createGlobals(pdfManager);

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobals,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual(
          "http://www.example.com/0013/001346/134685E.pdf#4.3"
        );
        expect(data.unsafeUrl).toEqual("../../0013/001346/134685E.pdf#4.3");
        expect(data.dest).toBeUndefined();
      }
    );

    it("should correctly parse a GoToR action, with named destination", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toEqual("http://www.example.com/test.pdf#15");
      expect(data.unsafeUrl).toEqual("http://www.example.com/test.pdf#15");
      expect(data.dest).toBeUndefined();
      expect(data.newWindow).toBeFalsy();
    });

    it("should correctly parse a GoToR action, with explicit destination array", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
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
    });

    it(
      "should correctly parse a Launch action, where the FileSpec dict " +
        'contains a relative URL, with the "docBaseUrl" parameter specified',
      async function () {
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
        const annotationGlobals =
          await AnnotationFactory.createGlobals(pdfManager);

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobals,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toEqual(
          new URL("http://www.example.com/test/pdfs/Part II/Part II.pdf").href
        );
        expect(data.unsafeUrl).toEqual("Part II/Part II.pdf");
        expect(data.dest).toBeUndefined();
        expect(data.newWindow).toEqual(true);
      }
    );

    it(
      "should recover valid URLs from JavaScript actions having certain " +
        "white-listed formats",
      async function () {
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
            annotationGlobalsMock,
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
          expectedNewWindow: false,
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

        await Promise.all([annotation1, annotation2, annotation3]);
      }
    );

    it("should correctly parse a Named action", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.action).toEqual("GoToPage");
    });

    it("should correctly parse a simple Dest", async function () {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("Dest", Name.get("LI0"));

      const annotationRef = Ref.get(583, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual("LI0");
    });

    it("should correctly parse a simple Dest, with explicit destination array", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.url).toBeUndefined();
      expect(data.unsafeUrl).toBeUndefined();
      expect(data.dest).toEqual([
        Ref.get(17, 0),
        Name.get("XYZ"),
        0,
        841.89,
        null,
      ]);
    });

    it(
      "should correctly parse a Dest, which violates the specification " +
        "by containing a dictionary",
      async function () {
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

        const { data } = await AnnotationFactory.create(
          xref,
          annotationRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.LINK);
        expect(data.url).toBeUndefined();
        expect(data.unsafeUrl).toBeUndefined();
        expect(data.dest).toEqual("page.157");
      }
    );

    it("should not set quadpoints if not defined", async function () {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));

      const annotationRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.quadPoints).toBeUndefined();
    });

    it("should set quadpoints if defined", async function () {
      const annotationDict = new Dict();
      annotationDict.set("Type", Name.get("Annot"));
      annotationDict.set("Subtype", Name.get("Link"));
      annotationDict.set("Rect", [10, 10, 20, 20]);
      annotationDict.set("QuadPoints", [10, 20, 20, 20, 10, 10, 20, 10]);

      const annotationRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: annotationRef, data: annotationDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        annotationRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINK);
      expect(data.quadPoints).toEqual(
        Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
      );
    });
  });

  describe("WidgetAnnotation", function () {
    let widgetDict;

    beforeEach(function () {
      widgetDict = new Dict();
      widgetDict.set("Type", Name.get("Annot"));
      widgetDict.set("Subtype", Name.get("Widget"));
    });

    afterEach(function () {
      widgetDict = null;
    });

    it("should handle unknown field names", async function () {
      const widgetRef = Ref.get(20, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        widgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual("");
    });

    it("should construct the field name when there are no ancestors", async function () {
      widgetDict.set("T", "foo");

      const widgetRef = Ref.get(21, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        widgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual("foo");
    });

    it("should construct the field name when there are ancestors", async function () {
      const firstParent = new Dict();
      firstParent.set("T", "foo");

      const secondParent = new Dict();
      secondParent.set("Parent", firstParent);
      secondParent.set("T", "bar");

      widgetDict.set("Parent", secondParent);
      widgetDict.set("T", "baz");

      const widgetRef = Ref.get(22, 0);
      const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        widgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldName).toEqual("foo.bar.baz");
    });

    it(
      "should construct the field name if a parent is not a dictionary " +
        "(issue 8143)",
      async function () {
        const parentDict = new Dict();
        parentDict.set("Parent", null);
        parentDict.set("T", "foo");

        widgetDict.set("Parent", parentDict);
        widgetDict.set("T", "bar");

        const widgetRef = Ref.get(22, 0);
        const xref = new XRefMock([{ ref: widgetRef, data: widgetDict }]);

        const { data } = await AnnotationFactory.create(
          xref,
          widgetRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.WIDGET);
        expect(data.fieldName).toEqual("foo.bar");
      }
    );
  });

  describe("TextWidgetAnnotation", function () {
    let textWidgetDict, helvRefObj, gothRefObj;

    beforeEach(function () {
      textWidgetDict = new Dict();
      textWidgetDict.set("Type", Name.get("Annot"));
      textWidgetDict.set("Subtype", Name.get("Widget"));
      textWidgetDict.set("FT", Name.get("Tx"));

      const helvDict = new Dict();
      helvDict.set("BaseFont", Name.get("Helvetica"));
      helvDict.set("Type", Name.get("Font"));
      helvDict.set("Subtype", Name.get("Type1"));

      const gothDict = new Dict();
      gothDict.set("BaseFont", Name.get("MSGothic"));
      gothDict.set("Type", Name.get("Font"));
      gothDict.set("Subtype", Name.get("Type0"));
      gothDict.set("Encoding", Name.get("UniJIS-UTF16-H"));
      gothDict.set("Name", Name.get("MSGothic"));

      const cidSysInfoDict = new Dict();
      cidSysInfoDict.set("Ordering", "Japan1");
      cidSysInfoDict.set("Registry", "Adobe");
      cidSysInfoDict.set("Supplement", "5");

      const fontDescriptorDict = new Dict();
      fontDescriptorDict.set("FontName", Name.get("MSGothic"));
      fontDescriptorDict.set("CapHeight", "680");

      const gothDescendantDict = new Dict();
      gothDescendantDict.set("BaseFont", Name.get("MSGothic"));
      gothDescendantDict.set("CIDSystemInfo", cidSysInfoDict);
      gothDescendantDict.set("Subtype", Name.get("CIDFontType2"));
      gothDescendantDict.set("Type", Name.get("Font"));
      gothDescendantDict.set("FontDescriptor", fontDescriptorDict);

      gothDict.set("DescendantFonts", [gothDescendantDict]);

      const helvRef = Ref.get(314, 0);
      const gothRef = Ref.get(159, 0);
      helvRefObj = { ref: helvRef, data: helvDict };
      gothRefObj = { ref: gothRef, data: gothDict };
      const resourceDict = new Dict();
      const fontDict = new Dict();
      fontDict.set("Helv", helvRef);
      resourceDict.set("Font", fontDict);

      textWidgetDict.set("DA", "/Helv 5 Tf");
      textWidgetDict.set("DR", resourceDict);
      textWidgetDict.set("Rect", [0, 0, 32, 10]);
    });

    afterEach(function () {
      textWidgetDict = helvRefObj = gothRefObj = null;
    });

    it("should handle unknown text alignment, maximum length and flags", async function () {
      textWidgetDict.set("DV", "foo");

      const textWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(null);
      expect(data.maxLen).toEqual(0);
      expect(data.readOnly).toEqual(false);
      expect(data.hidden).toEqual(false);
      expect(data.multiLine).toEqual(false);
      expect(data.comb).toEqual(false);
      expect(data.defaultFieldValue).toEqual("foo");
    });

    it("should not set invalid text alignment, maximum length and flags", async function () {
      textWidgetDict.set("Q", "center");
      textWidgetDict.set("MaxLen", "five");
      textWidgetDict.set("Ff", "readonly");

      const textWidgetRef = Ref.get(43, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(null);
      expect(data.maxLen).toEqual(0);
      expect(data.readOnly).toEqual(false);
      expect(data.hidden).toEqual(false);
      expect(data.multiLine).toEqual(false);
      expect(data.comb).toEqual(false);
    });

    it("should set valid text alignment, maximum length and flags", async function () {
      textWidgetDict.set("Q", 1);
      textWidgetDict.set("MaxLen", 20);
      textWidgetDict.set(
        "Ff",
        AnnotationFieldFlag.READONLY + AnnotationFieldFlag.MULTILINE
      );

      const textWidgetRef = Ref.get(84, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.textAlignment).toEqual(1);
      expect(data.maxLen).toEqual(20);
      expect(data.readOnly).toEqual(true);
      expect(data.hidden).toEqual(false);
      expect(data.multiLine).toEqual(true);
    });

    it("should reject comb fields without a maximum length", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);

      const textWidgetRef = Ref.get(46, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.comb).toEqual(false);
    });

    it("should accept comb fields with a maximum length", async function () {
      textWidgetDict.set("MaxLen", 20);
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);

      const textWidgetRef = Ref.get(46, 0);
      const xref = new XRefMock([{ ref: textWidgetRef, data: textWidgetDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.comb).toEqual(true);
    });

    it("should only accept comb fields when the flags are valid", async function () {
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
            annotationGlobalsMock,
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
      await promise;
    });

    it("should render regular text for printing", async function () {
      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "test\\print" });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm" +
          " 2 3.07 Td (test\\\\print) Tj ET Q EMC"
      );
    });

    it("should render regular text in Japanese for printing", async function () {
      textWidgetDict.get("DR").get("Font").set("Goth", gothRefObj.ref);
      textWidgetDict.set("DA", "/Goth 5 Tf");

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        gothRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "こんにちは世界の",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      const utf16String =
        "\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f\x4e\x16\x75\x4c\x30\x6e";
      expect(appearance).toEqual(
        "/Tx BMC q BT /Goth 5 Tf 1 0 0 1 0 0 Tm" +
          ` 2 3.07 Td (${utf16String}) Tj ET Q EMC`
      );
    });

    it("should render regular text for printing using normal appearance", async function () {
      const textWidgetRef = Ref.get(271, 0);

      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      const normalAppearanceStream = new StringStream("0.1 0.2 0.3 rg");
      normalAppearanceStream.dict = normalAppearanceDict;

      appearanceStatesDict.set("N", normalAppearanceStream);
      textWidgetDict.set("AP", appearanceStatesDict);

      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();

      const { opList } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList.argsArray.length).toEqual(3);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList.argsArray[0]).toEqual([
        "271R",
        [0, 0, 32, 10],
        [32, 0, 0, 10, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList.argsArray[1]).toEqual(new Uint8ClampedArray([26, 51, 76]));
    });

    it("should render auto-sized text for printing", async function () {
      textWidgetDict.set("DA", "/Helv 0 Tf");

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "test (print)" });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Helv 5.92 Tf 0 g 1 0 0 1 0 0 Tm" +
          " 2 3.07 Td (test \\(print\\)) Tj ET Q EMC"
      );
    });

    it("should render auto-sized text in Japanese for printing", async function () {
      textWidgetDict.get("DR").get("Font").set("Goth", gothRefObj.ref);
      textWidgetDict.set("DA", "/Goth 0 Tf");

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        gothRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "こんにちは世界の",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      const utf16String =
        "\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f\x4e\x16\x75\x4c\x30\x6e";
      expect(appearance).toEqual(
        "/Tx BMC q BT /Goth 3.5 Tf 0 g 1 0 0 1 0 0 Tm" +
          ` 2 3.07 Td (${utf16String}) Tj ET Q EMC`
      );
    });

    it("should not render a password for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.PASSWORD);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "mypassword" });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(null);
    });

    it("should render multiline text for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.MULTILINE);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value:
          "a aa aaa aaaa aaaaa aaaaaa " +
          "pneumonoultramicroscopicsilicovolcanoconiosis",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 10 Tm " +
          "2 -6.93 Td (a aa aaa ) Tj\n" +
          "0 -8 Td (aaaa aaaaa ) Tj\n" +
          "0 -8 Td (aaaaaa ) Tj\n" +
          "0 -8 Td (pneumonoultr) Tj\n" +
          "0 -8 Td (amicroscopi) Tj\n" +
          "0 -8 Td (csilicovolca) Tj\n" +
          "0 -8 Td (noconiosis) Tj ET Q EMC"
      );
    });

    it("should render multiline text in Japanese for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.MULTILINE);
      textWidgetDict.get("DR").get("Font").set("Goth", gothRefObj.ref);
      textWidgetDict.set("DA", "/Goth 5 Tf");

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        gothRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "こんにちは世界の",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Goth 5 Tf 1 0 0 1 0 10 Tm " +
          "2 -6.93 Td (\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f) Tj\n" +
          "0 -8 Td (\x4e\x16\x75\x4c\x30\x6e) Tj ET Q EMC"
      );
    });

    it("should render multiline text with various EOL for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.MULTILINE);
      textWidgetDict.set("Rect", [0, 0, 128, 10]);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;
      const expectedAppearance =
        "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 10 Tm " +
        "2 -6.93 Td " +
        "(Lorem ipsum dolor sit amet, consectetur adipiscing elit.) Tj\n" +
        "0 -8 Td " +
        "(Aliquam vitae felis ac lectus bibendum ultricies quis non) Tj\n" +
        "0 -8 Td " +
        "( diam.) Tj\n" +
        "0 -8 Td " +
        "(Morbi id porttitor quam, a iaculis dui.) Tj\n" +
        "0 -8 Td " +
        "(Pellentesque habitant morbi tristique senectus et netus ) Tj\n" +
        "0 -8 Td " +
        "(et malesuada fames ac turpis egestas.) Tj\n" +
        "0 -8 Td () Tj\n" +
        "0 -8 Td () Tj\n" +
        "0 -8 Td " +
        "(Nulla consectetur, ligula in tincidunt placerat, velit ) Tj\n" +
        "0 -8 Td " +
        "(augue consectetur orci, sed mattis libero nunc ut massa.) Tj\n" +
        "0 -8 Td " +
        "(Etiam facilisis tempus interdum.) Tj ET Q EMC";

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\r" +
          "Aliquam vitae felis ac lectus bibendum ultricies quis non diam.\n" +
          "Morbi id porttitor quam, a iaculis dui.\r\n" +
          "Pellentesque habitant morbi tristique senectus et " +
          "netus et malesuada fames ac turpis egestas.\n\r\n\r" +
          "Nulla consectetur, ligula in tincidunt placerat, " +
          "velit augue consectetur orci, sed mattis libero nunc ut massa.\r" +
          "Etiam facilisis tempus interdum.",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );

      expect(appearance).toEqual(expectedAppearance);
    });

    it("should render comb for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);
      textWidgetDict.set("MaxLen", 4);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "aa(aa)a\\" });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 2 3.07 Tm" +
          " (a) Tj 8 0 Td (a) Tj 8 0 Td (\\() Tj" +
          " 8 0 Td (a) Tj 8 0 Td (a) Tj" +
          " 8 0 Td (\\)) Tj 8 0 Td (a) Tj" +
          " 8 0 Td (\\\\) Tj ET Q EMC"
      );
    });

    it("should render comb with Japanese text for printing", async function () {
      textWidgetDict.set("Ff", AnnotationFieldFlag.COMB);
      textWidgetDict.set("MaxLen", 4);
      textWidgetDict.get("DR").get("Font").set("Goth", gothRefObj.ref);
      textWidgetDict.set("DA", "/Goth 5 Tf");
      textWidgetDict.set("Rect", [0, 0, 32, 10]);

      const textWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        gothRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "こんにちは世界の",
      });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        "/Tx BMC q BT /Goth 5 Tf 1 0 0 1 2 3.07 Tm" +
          " (\x30\x53) Tj 8 0 Td (\x30\x93) Tj 8 0 Td (\x30\x6b) Tj" +
          " 8 0 Td (\x30\x61) Tj 8 0 Td (\x30\x6f) Tj" +
          " 8 0 Td (\x4e\x16) Tj 8 0 Td (\x75\x4c) Tj" +
          " 8 0 Td (\x30\x6e) Tj ET Q EMC"
      );
    });

    it("should save text", async function () {
      const textWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "hello world" });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
          "/V (hello world) /AP << /N 2 0 R>> /M (date)>>\nendobj\n"
      );
      expect(newData.data).toEqual(
        "2 0 obj\n<< /Subtype /Form /Resources " +
          "<< /Font << /Helv 314 0 R>>>> /BBox [0 0 32 10] /Length 74>> stream\n" +
          "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm 2 3.07 Td (hello world) Tj " +
          "ET Q EMC\nendstream\nendobj\n"
      );
    });

    it("should save the text in two fields with the same name", async function () {
      const textWidget1Ref = Ref.get(123, 0);
      const textWidget2Ref = Ref.get(124, 0);

      const parentRef = Ref.get(125, 0);
      textWidgetDict.set("Parent", parentRef);
      const parentDict = new Dict();
      parentDict.set("Kids", [textWidget1Ref, textWidget2Ref]);
      parentDict.set("T", "foo");
      const textWidget2Dict = textWidgetDict.clone();

      const xref = new XRefMock([
        { ref: textWidget1Ref, data: textWidgetDict },
        { ref: textWidget2Ref, data: textWidget2Dict },
        { ref: parentRef, data: parentDict },
        helvRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation1 = await AnnotationFactory.create(
        xref,
        textWidget1Ref,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotation2 = await AnnotationFactory.create(
        xref,
        textWidget2Ref,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation1.data.id, { value: "hello world" });
      annotationStorage.set(annotation2.data.id, { value: "hello world" });
      const changes = new RefSetCache();

      await annotation1.save(
        partialEvaluator,
        task,
        annotationStorage,
        changes
      );
      await annotation2.save(
        partialEvaluator,
        task,
        annotationStorage,
        changes
      );
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(5);
      const [, , data1, data2, parentData] = data;
      expect(data1.ref).toEqual(textWidget1Ref);
      expect(data2.ref).toEqual(textWidget2Ref);
      expect(parentData.ref).toEqual(parentRef);

      data1.data = data1.data.replace(/\(D:\d+\)/, "(date)");
      data2.data = data2.data.replace(/\(D:\d+\)/, "(date)");
      expect(data1.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
          "/Parent 125 0 R /AP << /N 4 0 R>> /M (date)>>\nendobj\n"
      );
      expect(data2.data).toEqual(
        "124 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
          "/Parent 125 0 R /AP << /N 5 0 R>> /M (date)>>\nendobj\n"
      );
      expect(parentData.data).toEqual(
        "125 0 obj\n<< /Kids [123 0 R 124 0 R] /T (foo) /V (hello world)>>\nendobj\n"
      );
    });

    it("should save rotated text", async function () {
      const textWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "hello world",
        rotation: 90,
      });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
          "/V (hello world) /MK << /R 90>> /AP << /N 2 0 R>> /M (date)>>\nendobj\n"
      );
      expect(newData.data).toEqual(
        "2 0 obj\n<< /Subtype /Form /Resources " +
          "<< /Font << /Helv 314 0 R>>>> /BBox [0 0 32 10] /Matrix [0 1 -1 0 32 0] /Length 74>> stream\n" +
          "/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm 2 2.94 Td (hello world) Tj " +
          "ET Q EMC\nendstream\nendobj\n"
      );
    });

    it("should compress and save text", async function () {
      const textWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        helvRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      const value = "a".repeat(256);
      annotationStorage.set(annotation.data.id, { value });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] " +
          `/V (${value}) /AP << /N 2 0 R>> /M (date)>>\nendobj\n`
      );

      const compressedStream = newData.data.substring(
        newData.data.indexOf("stream\n") + "stream\n".length,
        newData.data.indexOf("\nendstream")
      );
      // Ensure that the data was in fact (significantly) compressed.
      expect(compressedStream.length).toBeLessThan(value.length / 3);

      expect(newData.data).toEqual(
        "2 0 obj\n<< /Subtype /Form /Resources " +
          "<< /Font << /Helv 314 0 R>>>> /BBox [0 0 32 10] " +
          `/Filter /FlateDecode /Length ${compressedStream.length}>> stream\n` +
          `${compressedStream}\nendstream\nendobj\n`
      );

      // Given that the exact compression-output may differ between environments
      // and browsers, ensure that the resulting data can be correctly decoded
      // by our `FlateStream`-implementation since that simulates opening the
      // generated data with the PDF.js library.
      const flateStream = new FlateStream(new StringStream(compressedStream));
      expect(flateStream.getString()).toEqual(
        `/Tx BMC q BT /Helv 5 Tf 1 0 0 1 0 0 Tm 2 3.07 Td (${value}) Tj ET Q EMC`
      );
    });

    it("should get field object for usage in JS sandbox", async function () {
      const textWidgetRef = Ref.get(123, 0);
      const xDictRef = Ref.get(141, 0);
      const dDictRef = Ref.get(262, 0);
      const next0Ref = Ref.get(314, 0);
      const next1Ref = Ref.get(271, 0);
      const next2Ref = Ref.get(577, 0);
      const next00Ref = Ref.get(413, 0);
      const xDict = new Dict();
      const dDict = new Dict();
      const next0Dict = new Dict();
      const next1Dict = new Dict();
      const next2Dict = new Dict();
      const next00Dict = new Dict();

      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        { ref: xDictRef, data: xDict },
        { ref: dDictRef, data: dDict },
        { ref: next0Ref, data: next0Dict },
        { ref: next00Ref, data: next00Dict },
        { ref: next1Ref, data: next1Dict },
        { ref: next2Ref, data: next2Dict },
      ]);

      const JS = Name.get("JavaScript");
      const additionalActionsDict = new Dict();
      const eDict = new Dict();
      eDict.set("JS", "hello()");
      eDict.set("S", JS);
      additionalActionsDict.set("E", eDict);

      // Test the cycle detection here.
      xDict.set("JS", "world()");
      xDict.set("S", JS);
      xDict.set("Next", [next0Ref, next1Ref, next2Ref, xDictRef]);

      next0Dict.set("JS", "olleh()");
      next0Dict.set("S", JS);
      next0Dict.set("Next", next00Ref);

      next00Dict.set("JS", "foo()");
      next00Dict.set("S", JS);
      next00Dict.set("Next", next0Ref);

      next1Dict.set("JS", "dlrow()");
      next1Dict.set("S", JS);
      next1Dict.set("Next", xDictRef);

      next2Dict.set("JS", "oof()");
      next2Dict.set("S", JS);

      dDict.set("JS", "bar()");
      dDict.set("S", JS);
      dDict.set("Next", dDictRef);
      additionalActionsDict.set("D", dDictRef);

      additionalActionsDict.set("X", xDictRef);
      textWidgetDict.set("AA", additionalActionsDict);

      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const fieldObject = await annotation.getFieldObject();
      const actions = fieldObject.actions;
      expect(actions["Mouse Enter"]).toEqual(["hello()"]);
      expect(actions["Mouse Exit"]).toEqual([
        "world()",
        "olleh()",
        "foo()",
        "dlrow()",
        "oof()",
      ]);
      expect(actions["Mouse Down"]).toEqual(["bar()"]);
    });

    it("should save Japanese text", async function () {
      textWidgetDict.get("DR").get("Font").set("Goth", gothRefObj.ref);
      textWidgetDict.set("DA", "/Goth 5 Tf");

      const textWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: textWidgetRef, data: textWidgetDict },
        gothRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        textWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, {
        value: "こんにちは世界の",
      });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      const utf16String =
        "\x30\x53\x30\x93\x30\x6b\x30\x61\x30\x6f\x4e\x16\x75\x4c\x30\x6e";
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Tx /DA (/Goth 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R /Goth 159 0 R>>>> /Rect [0 0 32 10] " +
          `/V (\xfe\xff${utf16String}) /AP << /N 2 0 R>> /M (date)>>\nendobj\n`
      );
      expect(newData.data).toEqual(
        "2 0 obj\n<< /Subtype /Form /Resources " +
          "<< /Font << /Helv 314 0 R /Goth 159 0 R>>>> /BBox [0 0 32 10] /Length 79>> stream\n" +
          `/Tx BMC q BT /Goth 5 Tf 1 0 0 1 0 0 Tm 2 3.07 Td (${utf16String}) Tj ` +
          "ET Q EMC\nendstream\nendobj\n"
      );
    });
  });

  describe("ButtonWidgetAnnotation", function () {
    let buttonWidgetDict;

    beforeEach(function () {
      buttonWidgetDict = new Dict();
      buttonWidgetDict.set("Type", Name.get("Annot"));
      buttonWidgetDict.set("Subtype", Name.get("Widget"));
      buttonWidgetDict.set("FT", Name.get("Btn"));
    });

    afterEach(function () {
      buttonWidgetDict = null;
    });

    it("should handle checkboxes with export value", async function () {
      buttonWidgetDict.set("V", Name.get("Checked"));
      buttonWidgetDict.set("DV", Name.get("Off"));

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

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(true);
      expect(data.fieldValue).toEqual("Checked");
      expect(data.defaultFieldValue).toEqual("Off");
      expect(data.radioButton).toEqual(false);
      expect(data.exportValue).toEqual("Checked");
    });

    it("should handle checkboxes without export value", async function () {
      buttonWidgetDict.set("V", Name.get("Checked"));
      buttonWidgetDict.set("DV", Name.get("Off"));

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(true);
      expect(data.fieldValue).toEqual("Checked");
      expect(data.defaultFieldValue).toEqual("Off");
      expect(data.radioButton).toEqual(false);
    });

    it("should handle checkboxes without /Off appearance", async function () {
      buttonWidgetDict.set("V", Name.get("Checked"));
      buttonWidgetDict.set("DV", Name.get("Off"));

      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();

      normalAppearanceDict.set("Checked", 1);
      appearanceStatesDict.set("N", normalAppearanceDict);
      buttonWidgetDict.set("AP", appearanceStatesDict);

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(true);
      expect(data.fieldValue).toEqual("Checked");
      expect(data.defaultFieldValue).toEqual("Off");
      expect(data.radioButton).toEqual(false);
      expect(data.exportValue).toEqual("Checked");
    });

    it("should render checkbox with fallback font for printing", async function () {
      const appearanceStatesDict = new Dict();
      const normalAppearanceDict = new Dict();
      const checkedAppearanceDict = new Dict();
      const uncheckedAppearanceDict = new Dict();

      const checkedStream = new StringStream("/ 12 Tf (4) Tj");
      checkedStream.dict = checkedAppearanceDict;

      const uncheckedStream = new StringStream("");
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
      const checkboxEvaluator = partialEvaluator.clone({ ignoreErrors: true });
      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });

      const { opList } = await annotation.getOperatorList(
        checkboxEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList.argsArray.length).toEqual(5);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.dependency,
        OPS.setFont,
        OPS.showText,
        OPS.endAnnotation,
      ]);
      expect(opList.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList.argsArray[3][0][0].unicode).toEqual("4");
    });

    it("should render checkboxes for printing", async function () {
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

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });

      const { opList: opList1 } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList1.argsArray.length).toEqual(3);
      expect(opList1.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList1.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList1.argsArray[1]).toEqual(new Uint8ClampedArray([26, 51, 76]));

      annotationStorage.set(annotation.data.id, { value: false });

      const { opList: opList2 } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList2.argsArray.length).toEqual(3);
      expect(opList2.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList2.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList2.argsArray[1]).toEqual(new Uint8ClampedArray([76, 51, 26]));
    });

    it("should render checkboxes for printing twice", async function () {
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

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();

      for (let i = 0; i < 2; i++) {
        annotationStorage.set(annotation.data.id, { value: true });

        const { opList } = await annotation.getOperatorList(
          partialEvaluator,
          task,
          RenderingIntentFlag.PRINT,
          annotationStorage
        );
        expect(opList.argsArray.length).toEqual(3);
        expect(opList.fnArray).toEqual([
          OPS.beginAnnotation,
          OPS.setFillRGBColor,
          OPS.endAnnotation,
        ]);
        expect(opList.argsArray[0]).toEqual([
          "1249R",
          [0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0],
          [1, 0, 0, 1, 0, 0],
          false,
        ]);
        expect(opList.argsArray[1]).toEqual(
          new Uint8ClampedArray([26, 51, 76])
        );
      }
    });

    it("should render checkboxes for printing using normal appearance", async function () {
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
      buttonWidgetDict.set("AS", Name.get("Checked"));

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test print");

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();

      const { opList } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList.argsArray.length).toEqual(3);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList.argsArray[1]).toEqual(new Uint8ClampedArray([26, 51, 76]));
    });

    it("should save checkboxes", async function () {
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

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const [oldData] = await writeChanges(changes, xref);
      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Btn " +
          "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
          "/V /Checked /AS /Checked /M (date)>>\nendobj\n"
      );

      annotationStorage.set(annotation.data.id, { value: false });

      changes.clear();
      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      expect(changes.size).toEqual(0);
    });

    it("should save rotated checkboxes", async function () {
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

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true, rotation: 180 });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const [oldData] = await writeChanges(changes, xref);
      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Btn " +
          "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
          "/V /Checked /AS /Checked /M (date) /MK << /R 180>>>>\nendobj\n"
      );

      annotationStorage.set(annotation.data.id, { value: false });

      changes.clear();
      await annotation.save(partialEvaluator, task, annotationStorage);
      expect(changes.size).toEqual(0);
    });

    it("should handle radio buttons with a field value", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(false);
      expect(data.radioButton).toEqual(true);
      expect(data.fieldValue).toEqual("1");
      expect(data.buttonValue).toEqual("2");
    });

    it("should handle radio buttons with a field value that's not an ASCII string", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(false);
      expect(data.radioButton).toEqual(true);
      expect(data.fieldValue).toEqual("‚I=‚ðﬁàŠe3");
      expect(data.buttonValue).toEqual("‚I=‚ðﬁàŠe3");
    });

    it("should handle radio buttons without a field value", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.checkBox).toEqual(false);
      expect(data.radioButton).toEqual(true);
      expect(data.fieldValue).toEqual(null);
      expect(data.buttonValue).toEqual("2");
    });

    it("should render radio buttons for printing", async function () {
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

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });

      const { opList: opList1 } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList1.argsArray.length).toEqual(3);
      expect(opList1.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList1.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList1.argsArray[1]).toEqual(new Uint8ClampedArray([26, 51, 76]));

      annotationStorage.set(annotation.data.id, { value: false });

      const { opList: opList2 } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList2.argsArray.length).toEqual(3);
      expect(opList2.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList2.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList2.argsArray[1]).toEqual(new Uint8ClampedArray([76, 51, 26]));
    });

    it("should render radio buttons for printing using normal appearance", async function () {
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
      buttonWidgetDict.set("AS", Name.get("Off"));

      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test print");

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();

      const { opList } = await annotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(opList.argsArray.length).toEqual(3);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.endAnnotation,
      ]);
      expect(opList.argsArray[0]).toEqual([
        "124R",
        [0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [1, 0, 0, 1, 0, 0],
        false,
      ]);
      expect(opList.argsArray[1]).toEqual(new Uint8ClampedArray([76, 51, 26]));
    });

    it("should save radio buttons", async function () {
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
      parentDict.set("T", "RadioGroup");
      buttonWidgetDict.set("Parent", parentRef);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
        { ref: parentRef, data: parentDict },
      ]);

      parentDict.xref = xref;
      buttonWidgetDict.xref = xref;
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [radioData, parentData] = data;
      radioData.data = radioData.data.replace(/\(D:\d+\)/, "(date)");
      expect(radioData.ref).toEqual(Ref.get(123, 0));
      expect(radioData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 32768 " +
          "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
          "/Parent 456 0 R /AS /Checked /M (date)>>\nendobj\n"
      );
      expect(parentData.ref).toEqual(Ref.get(456, 0));
      expect(parentData.data).toEqual(
        "456 0 obj\n<< /V /Checked /Kids [123 0 R] /T (RadioGroup)>>\nendobj\n"
      );

      annotationStorage.set(annotation.data.id, { value: false });

      changes.clear();
      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      expect(changes.size).toEqual(0);
    });

    it("should save radio buttons without a field value", async function () {
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
      parentDict.set("T", "RadioGroup");
      buttonWidgetDict.set("Parent", parentRef);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
        { ref: parentRef, data: parentDict },
      ]);

      parentDict.xref = xref;
      buttonWidgetDict.xref = xref;
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: true });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [radioData, parentData] = data;
      radioData.data = radioData.data.replace(/\(D:\d+\)/, "(date)");
      expect(radioData.ref).toEqual(Ref.get(123, 0));
      expect(radioData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 32768 " +
          "/AP << /N << /Checked 314 0 R /Off 271 0 R>>>> " +
          "/Parent 456 0 R /AS /Checked /M (date)>>\nendobj\n"
      );
      expect(parentData.ref).toEqual(Ref.get(456, 0));
      expect(parentData.data).toEqual(
        "456 0 obj\n<< /Kids [123 0 R] /T (RadioGroup) /V /Checked>>\nendobj\n"
      );
    });

    it("should save nothing", async function () {
      const buttonWidgetRef = Ref.get(124, 0);
      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      expect(changes.size).toEqual(0);
    });

    it("should handle push buttons", async function () {
      const buttonWidgetRef = Ref.get(124, 0);
      buttonWidgetDict.set("Ff", AnnotationFieldFlag.PUSHBUTTON);

      const actionDict = new Dict();
      actionDict.set("S", Name.get("JavaScript"));
      actionDict.set("JS", "do_something();");
      buttonWidgetDict.set("A", actionDict);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.pushButton).toEqual(true);
      expect(data.actions.Action).toEqual(["do_something();"]);
    });

    it("should handle push buttons that act as a tooltip only", async function () {
      const buttonWidgetRef = Ref.get(124, 0);
      buttonWidgetDict.set("Ff", AnnotationFieldFlag.PUSHBUTTON);
      buttonWidgetDict.set("TU", "An alternative text");

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.pushButton).toEqual(true);
      expect(data.alternativeText).toEqual("An alternative text");
    });

    it("should handle URL in A dict in push buttons", async function () {
      const buttonWidgetRef = Ref.get(124, 0);
      buttonWidgetDict.set("Ff", AnnotationFieldFlag.PUSHBUTTON);

      const actionDict = new Dict();
      actionDict.set("S", Name.get("JavaScript"));
      actionDict.set(
        "JS",
        "app.launchURL('https://developer.mozilla.org/en-US/', true)"
      );
      buttonWidgetDict.set("A", actionDict);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.url).toEqual("https://developer.mozilla.org/en-US/");
    });

    it("should handle URL in AA dict in push buttons", async function () {
      const buttonWidgetRef = Ref.get(124, 0);
      buttonWidgetDict.set("Ff", AnnotationFieldFlag.PUSHBUTTON);

      // D stands for MouseDown.
      const dDict = new Dict();
      dDict.set("S", Name.get("JavaScript"));
      dDict.set(
        "JS",
        "app.launchURL('https://developer.mozilla.org/en-US/', true)"
      );
      const actionDict = new Dict();
      actionDict.set("D", dDict);
      buttonWidgetDict.set("AA", actionDict);

      const xref = new XRefMock([
        { ref: buttonWidgetRef, data: buttonWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        buttonWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.url).toEqual("https://developer.mozilla.org/en-US/");
    });
  });

  describe("ChoiceWidgetAnnotation", function () {
    let choiceWidgetDict, fontRefObj;

    beforeEach(function () {
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
    });

    afterEach(function () {
      choiceWidgetDict = fontRefObj = null;
    });

    it("should handle missing option arrays", async function () {
      const choiceWidgetRef = Ref.get(122, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual([]);
    });

    it("should handle option arrays with array elements", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });

    it("should handle option arrays with string elements", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });

    it("should handle inherited option arrays (issue 8094)", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.options).toEqual(expected);
    });

    it("should decode form values", async function () {
      const encodedString = "\xFE\xFF\x00F\x00o\x00o";
      const decodedString = "Foo";

      choiceWidgetDict.set("Opt", [encodedString]);
      choiceWidgetDict.set("V", encodedString);
      choiceWidgetDict.set("DV", Name.get("foo"));

      const choiceWidgetRef = Ref.get(984, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.fieldValue).toEqual([decodedString]);
      expect(data.defaultFieldValue).toEqual("foo");
      expect(data.options).toEqual([
        { exportValue: decodedString, displayValue: decodedString },
      ]);
    });

    it("should convert the field value to an array", async function () {
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
            annotationGlobalsMock,
            idFactoryMock
          ).then(({ data }) => {
            expect(data.annotationType).toEqual(AnnotationType.WIDGET);
            expect(data.fieldValue).toEqual(outputs[i]);
          });
        });
      }
      await promise;
    });

    it("should handle unknown flags", async function () {
      const choiceWidgetRef = Ref.get(166, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.hidden).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });

    it("should not set invalid flags", async function () {
      choiceWidgetDict.set("Ff", "readonly");

      const choiceWidgetRef = Ref.get(165, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
      ]);

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(false);
      expect(data.hidden).toEqual(false);
      expect(data.combo).toEqual(false);
      expect(data.multiSelect).toEqual(false);
    });

    it("should set valid flags", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.WIDGET);
      expect(data.readOnly).toEqual(true);
      expect(data.hidden).toEqual(false);
      expect(data.combo).toEqual(true);
      expect(data.multiSelect).toEqual(true);
    });

    it("should render choice for printing", async function () {
      const choiceWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "a value" });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        [
          "/Tx BMC q",
          "1 1 32 10 re W n",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 10 Tm",
          "ET Q EMC",
        ].join("\n")
      );
    });

    it("should render choice with multiple selections but one is visible for printing", async function () {
      choiceWidgetDict.set("Ff", AnnotationFieldFlag.MULTISELECT);
      choiceWidgetDict.set("Opt", [
        ["A", "a"],
        ["B", "b"],
        ["C", "c"],
        ["D", "d"],
      ]);
      choiceWidgetDict.set("V", ["A"]);

      const choiceWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: ["A", "C"] });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        [
          "/Tx BMC q",
          "1 1 32 10 re W n",
          "0.600006 0.756866 0.854904 rg",
          "1 3.25 32 6.75 re f",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 10 Tm",
          "2 -5.88 Td (a) Tj",
          "0 -6.75 Td (b) Tj",
          "ET Q EMC",
        ].join("\n")
      );
    });

    it("should render choice with multiple selections for printing", async function () {
      choiceWidgetDict.set("Ff", AnnotationFieldFlag.MULTISELECT);
      choiceWidgetDict.set("Opt", [
        ["A", "a"],
        ["B", "b"],
        ["C", "c"],
        ["D", "d"],
      ]);
      choiceWidgetDict.set("V", ["A"]);

      const choiceWidgetRef = Ref.get(271, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test print");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: ["B", "C"] });

      const appearance = await annotation._getAppearance(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        annotationStorage
      );
      expect(appearance).toEqual(
        [
          "/Tx BMC q",
          "1 1 32 10 re W n",
          "0.600006 0.756866 0.854904 rg",
          "1 3.25 32 6.75 re f",
          "1 -3.5 32 6.75 re f",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 10 Tm",
          "2 -5.88 Td (b) Tj",
          "0 -6.75 Td (c) Tj",
          "ET Q EMC",
        ].join("\n")
      );
    });

    it("should save rotated choice", async function () {
      choiceWidgetDict.set("Opt", ["A", "B", "C"]);
      choiceWidgetDict.set("V", "A");

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "C", rotation: 270 });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Ch /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> " +
          "/Rect [0 0 32 10] /Opt [(A) (B) (C)] /V (C) " +
          "/MK << /R 270>> /AP << /N 2 0 R>> /M (date)>>\nendobj\n"
      );
      expect(newData.data).toEqual(
        [
          "2 0 obj",
          "<< /Subtype /Form /Resources << /Font << /Helv 314 0 R>>>> " +
            "/BBox [0 0 32 10] /Matrix [0 -1 1 0 0 10] /Length 170>> stream",
          "/Tx BMC q",
          "1 1 10 32 re W n",
          "0.600006 0.756866 0.854904 rg",
          "1 11.75 10 6.75 re f",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 32 Tm",
          "2 -5.88 Td (A) Tj",
          "0 -6.75 Td (B) Tj",
          "0 -6.75 Td (C) Tj",
          "ET Q EMC",
          "endstream",
          "endobj\n",
        ].join("\n")
      );
    });

    it("should save choice", async function () {
      choiceWidgetDict.set("Opt", ["A", "B", "C"]);
      choiceWidgetDict.set("V", "A");

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      partialEvaluator.xref = xref;
      const task = new WorkerTask("test save");

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: "C" });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Ch /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> " +
          "/Rect [0 0 32 10] /Opt [(A) (B) (C)] /V (C) " +
          "/AP << /N 2 0 R>> /M (date)>>\nendobj\n"
      );
      expect(newData.data).toEqual(
        [
          "2 0 obj",
          "<< /Subtype /Form /Resources << /Font << /Helv 314 0 R>>>> " +
            "/BBox [0 0 32 10] /Length 133>> stream",
          "/Tx BMC q",
          "1 1 32 10 re W n",
          "0.600006 0.756866 0.854904 rg",
          "1 3.25 32 6.75 re f",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 10 Tm",
          "2 -5.88 Td (C) Tj",
          "ET Q EMC",
          "endstream",
          "endobj\n",
        ].join("\n")
      );
    });

    it("should save choice with multiple selections", async function () {
      choiceWidgetDict.set("Ff", AnnotationFieldFlag.MULTISELECT);
      choiceWidgetDict.set("Opt", [
        ["A", "a"],
        ["B", "b"],
        ["C", "c"],
        ["D", "d"],
      ]);
      choiceWidgetDict.set("V", ["A"]);

      const choiceWidgetRef = Ref.get(123, 0);
      const xref = new XRefMock([
        { ref: choiceWidgetRef, data: choiceWidgetDict },
        fontRefObj,
      ]);
      const task = new WorkerTask("test save");
      partialEvaluator.xref = xref;

      const annotation = await AnnotationFactory.create(
        xref,
        choiceWidgetRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      const annotationStorage = new Map();
      annotationStorage.set(annotation.data.id, { value: ["B", "C"] });
      const changes = new RefSetCache();

      await annotation.save(partialEvaluator, task, annotationStorage, changes);
      const data = await writeChanges(changes, xref);
      expect(data.length).toEqual(2);
      const [newData, oldData] = data;
      expect(oldData.ref).toEqual(Ref.get(123, 0));
      expect(newData.ref).toEqual(Ref.get(2, 0));

      oldData.data = oldData.data.replace(/\(D:\d+\)/, "(date)");
      expect(oldData.data).toEqual(
        "123 0 obj\n" +
          "<< /Type /Annot /Subtype /Widget /FT /Ch /DA (/Helv 5 Tf) /DR " +
          "<< /Font << /Helv 314 0 R>>>> /Rect [0 0 32 10] /Ff 2097152 /Opt " +
          "[[(A) (a)] [(B) (b)] [(C) (c)] [(D) (d)]] /V [(B) (C)] /AP " +
          "<< /N 2 0 R>> /M (date)>>\nendobj\n"
      );
      expect(newData.data).toEqual(
        [
          "2 0 obj",
          "<< /Subtype /Form /Resources << /Font << /Helv 314 0 R>>>> " +
            "/BBox [0 0 32 10] /Length 171>> stream",
          "/Tx BMC q",
          "1 1 32 10 re W n",
          "0.600006 0.756866 0.854904 rg",
          "1 3.25 32 6.75 re f",
          "1 -3.5 32 6.75 re f",
          "BT",
          "/Helv 5 Tf",
          "1 0 0 1 0 10 Tm",
          "2 -5.88 Td (b) Tj",
          "0 -6.75 Td (c) Tj",
          "ET Q EMC",
          "endstream",
          "endobj\n",
        ].join("\n")
      );
    });
  });

  describe("LineAnnotation", function () {
    it("should set the line coordinates", async function () {
      const lineDict = new Dict();
      lineDict.set("Type", Name.get("Annot"));
      lineDict.set("Subtype", Name.get("Line"));
      lineDict.set("L", [1, 2, 3, 4]);
      lineDict.set("LE", ["Square", "Circle"]);

      const lineRef = Ref.get(122, 0);
      const xref = new XRefMock([{ ref: lineRef, data: lineDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        lineRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINE);
      expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
      expect(data.lineEndings).toEqual(["None", "None"]);
    });

    it("should set the line endings", async function () {
      const lineDict = new Dict();
      lineDict.set("Type", Name.get("Annot"));
      lineDict.set("Subtype", Name.get("Line"));
      lineDict.set("L", [1, 2, 3, 4]);
      lineDict.set("LE", [Name.get("Square"), Name.get("Circle")]);

      const lineRef = Ref.get(122, 0);
      const xref = new XRefMock([{ ref: lineRef, data: lineDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        lineRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.LINE);
      expect(data.lineCoordinates).toEqual([1, 2, 3, 4]);
      expect(data.lineEndings).toEqual(["Square", "Circle"]);
    });
  });

  describe("FileAttachmentAnnotation", function () {
    it("should correctly parse a file attachment", async function () {
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
      fileSpecDict.set("Desc", "abc");
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

      const { data } = await AnnotationFactory.create(
        xref,
        fileAttachmentRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.FILEATTACHMENT);
      expect(data.file).toEqual({
        rawFilename: "Test.txt",
        filename: "Test.txt",
        content: stringToBytes("Test attachment"),
        description: "abc",
      });
    });
  });

  describe("PopupAnnotation", function () {
    it("should inherit properties from its parent", async function () {
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

      const { data } = await AnnotationFactory.create(
        xref,
        popupRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.POPUP);
      expect(data.modificationDate).toEqual("D:20190423");
      expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
    });

    it("should handle missing parent properties", async function () {
      const parentDict = new Dict();
      parentDict.set("Type", Name.get("Annot"));
      parentDict.set("Subtype", Name.get("Text"));

      const popupDict = new Dict();
      popupDict.set("Type", Name.get("Annot"));
      popupDict.set("Subtype", Name.get("Popup"));
      popupDict.set("Parent", parentDict);

      const popupRef = Ref.get(13, 0);
      const xref = new XRefMock([{ ref: popupRef, data: popupDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        popupRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.POPUP);
      expect(data.modificationDate).toEqual(null);
      expect(data.color).toEqual(null);
    });

    it(
      "should inherit the parent flags when the Popup is not viewable, " +
        "but the parent is (PR 7352)",
      async function () {
        const parentDict = new Dict();
        parentDict.set("Type", Name.get("Annot"));
        parentDict.set("Subtype", Name.get("Text"));
        parentDict.set("F", 28); // viewable

        const popupDict = new Dict();
        popupDict.set("Type", Name.get("Annot"));
        popupDict.set("Subtype", Name.get("Popup"));
        popupDict.set("F", 56); // not viewable
        popupDict.set("Parent", parentDict);

        const popupRef = Ref.get(13, 0);
        const xref = new XRefMock([{ ref: popupRef, data: popupDict }]);

        const { data, viewable } = await AnnotationFactory.create(
          xref,
          popupRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.annotationType).toEqual(AnnotationType.POPUP);
        // We should not modify the `annotationFlags` returned through
        // e.g., the API.
        expect(data.annotationFlags).toEqual(56);
        // The popup should inherit the `viewable` property of the parent.
        expect(viewable).toEqual(true);
      }
    );

    it(
      "should correctly inherit Contents from group-master annotation " +
        "if parent has ReplyType == Group",
      async function () {
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

        const { data } = await AnnotationFactory.create(
          xref,
          popupRef,
          annotationGlobalsMock,
          idFactoryMock
        );
        expect(data.titleObj).toEqual({ str: "Correct Title", dir: "ltr" });
        expect(data.contentsObj).toEqual({ str: "Correct Text", dir: "ltr" });
        expect(data.modificationDate).toEqual("D:20190423");
        expect(data.color).toEqual(new Uint8ClampedArray([0, 0, 255]));
      }
    );
  });

  describe("FreeTextAnnotation", () => {
    it("should create a new FreeText annotation", async () => {
      const xref = (partialEvaluator.xref = new XRefMock());
      const task = new WorkerTask("test FreeText creation");
      const changes = new RefSetCache();
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.FREETEXT,
            rect: [12, 34, 56, 78],
            rotation: 0,
            fontSize: 10,
            color: [0, 0, 0],
            value: "Hello PDF.js World!",
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[1].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "2 0 obj\n" +
          "<< /Type /Annot /Subtype /FreeText /CreationDate (date) " +
          "/Rect [12 34 56 78] /DA (/Helv 10 Tf 0 g) /Contents (Hello PDF.js World!) " +
          "/F 4 /Border [0 0 0] /Rotate 0 /AP << /N 3 0 R>>>>\n" +
          "endobj\n"
      );

      const font = data[0].data;
      expect(font).toEqual(
        "1 0 obj\n" +
          "<< /BaseFont /Helvetica /Type /Font /Subtype /Type1 /Encoding " +
          "/WinAnsiEncoding>>\n" +
          "endobj\n"
      );

      const appearance = data[2].data;
      expect(appearance).toEqual(
        "3 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] " +
          "/Resources << /Font << /Helv 1 0 R>>>> /Matrix [1 0 0 1 -12 -34] " +
          "/Length 98>> stream\n" +
          "q\n" +
          "1 0 0 1 0 0 cm\n" +
          "12 34 44 44 re W n\n" +
          "BT\n" +
          "0 g\n" +
          "0 Tc /Helv 10 Tf\n" +
          "12 68 Td (Hello PDF.js World!) Tj\n" +
          "ET\n" +
          "Q\n" +
          "endstream\n" +
          "endobj\n"
      );
    });

    it("should render an added FreeText annotation for printing", async function () {
      partialEvaluator.xref = new XRefMock();
      const task = new WorkerTask("test FreeText printing");
      const freetextAnnotation = (
        await AnnotationFactory.printNewAnnotations(
          annotationGlobalsMock,
          partialEvaluator,
          task,
          [
            {
              annotationType: AnnotationEditorType.FREETEXT,
              rect: [12, 34, 56, 78],
              rotation: 0,
              fontSize: 10,
              color: [0, 0, 0],
              value: "A",
            },
          ]
        )
      )[0];

      const { opList } = await freetextAnnotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        null
      );

      expect(opList.fnArray.length).toEqual(16);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.save,
        OPS.transform,
        OPS.constructPath,
        OPS.clip,
        OPS.endPath,
        OPS.beginText,
        OPS.setFillRGBColor,
        OPS.setCharSpacing,
        OPS.dependency,
        OPS.setFont,
        OPS.moveText,
        OPS.showText,
        OPS.endText,
        OPS.restore,
        OPS.endAnnotation,
      ]);
    });

    it("should update an existing FreeText annotation", async function () {
      const freeTextDict = new Dict();
      freeTextDict.set("Type", Name.get("Annot"));
      freeTextDict.set("Subtype", Name.get("FreeText"));
      freeTextDict.set("CreationDate", "D:20190423");
      freeTextDict.set("Foo", Name.get("Bar"));

      const freeTextRef = Ref.get(143, 0);
      const xref = (partialEvaluator.xref = new XRefMock([
        { ref: freeTextRef, data: freeTextDict },
      ]));
      const changes = new RefSetCache();

      const task = new WorkerTask("test FreeText update");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.FREETEXT,
            rect: [12, 34, 56, 78],
            rotation: 0,
            fontSize: 10,
            color: [0, 0, 0],
            value: "Hello PDF.js World !",
            id: "143R",
            ref: freeTextRef,
            oldAnnotation: freeTextDict,
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[2].data.replaceAll(/\(D:\d+\)/g, "(date)");
      expect(base).toEqual(
        "143 0 obj\n" +
          "<< /Type /Annot /Subtype /FreeText /CreationDate (date) /Foo /Bar /M (date) " +
          "/Rect [12 34 56 78] /DA (/Helv 10 Tf 0 g) /Contents (Hello PDF.js World !) " +
          "/F 4 /Border [0 0 0] /Rotate 0 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );
    });

    it("should extract the text from a FreeText annotation", async function () {
      partialEvaluator.xref = new XRefMock();
      const task = new WorkerTask("test FreeText text extraction");
      const freetextAnnotation = (
        await AnnotationFactory.printNewAnnotations(
          annotationGlobalsMock,
          partialEvaluator,
          task,
          [
            {
              annotationType: AnnotationEditorType.FREETEXT,
              rect: [12, 34, 56, 78],
              rotation: 0,
              fontSize: 10,
              color: [0, 0, 0],
              value: "Hello PDF.js\nWorld !",
            },
          ]
        )
      )[0];

      await freetextAnnotation.extractTextContent(partialEvaluator, task, [
        -Infinity,
        -Infinity,
        Infinity,
        Infinity,
      ]);

      expect(freetextAnnotation.data.textContent).toEqual([
        "Hello PDF.js",
        "World !",
      ]);
    });
  });

  describe("InkAnnotation", function () {
    it("should handle a single ink list", async function () {
      const inkDict = new Dict();
      inkDict.set("Type", Name.get("Annot"));
      inkDict.set("Subtype", Name.get("Ink"));
      const inkList = [1, 1, 1, 2, 2, 2, 3, 3];
      inkDict.set("InkList", [inkList]);

      const inkRef = Ref.get(142, 0);
      const xref = new XRefMock([{ ref: inkRef, data: inkDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        inkRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.INK);
      expect(data.inkLists.length).toEqual(1);
      expect(data.inkLists[0]).toEqual(Float32Array.from(inkList));
    });

    it("should handle multiple ink lists", async function () {
      const inkDict = new Dict();
      inkDict.set("Type", Name.get("Annot"));
      inkDict.set("Subtype", Name.get("Ink"));
      const inkList0 = [1, 1, 1, 2];
      const inkList1 = [3, 3, 4, 5];
      inkDict.set("InkList", [inkList0, inkList1]);

      const inkRef = Ref.get(143, 0);
      const xref = new XRefMock([{ ref: inkRef, data: inkDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        inkRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.INK);
      expect(data.inkLists.length).toEqual(2);
      expect(data.inkLists[0]).toEqual(Float32Array.from(inkList0));
      expect(data.inkLists[1]).toEqual(Float32Array.from(inkList1));
    });

    it("should create a new Ink annotation", async function () {
      const xref = (partialEvaluator.xref = new XRefMock());
      const changes = new RefSetCache();
      const task = new WorkerTask("test Ink creation");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.INK,
            rect: [12, 34, 56, 78],
            rotation: 0,
            thickness: 1,
            opacity: 1,
            color: [0, 0, 0],
            paths: {
              lines: [
                [
                  NaN,
                  NaN,
                  NaN,
                  NaN,
                  10,
                  11,
                  12,
                  13,
                  14,
                  15,
                  16,
                  17,
                  22,
                  23,
                  24,
                  25,
                  26,
                  27,
                ],
                [
                  NaN,
                  NaN,
                  NaN,
                  NaN,
                  910,
                  911,
                  912,
                  913,
                  914,
                  915,
                  916,
                  917,
                  922,
                  923,
                  924,
                  925,
                  926,
                  927,
                ],
              ],
              points: [
                [1, 2, 3, 4, 5, 6, 7, 8],
                [91, 92, 93, 94, 95, 96, 97, 98],
              ],
            },
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[0].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "1 0 obj\n" +
          "<< /Type /Annot /Subtype /Ink /CreationDate (date) /Rect [12 34 56 78] " +
          "/InkList [[1 2 3 4 5 6 7 8] [91 92 93 94 95 96 97 98]] /F 4 " +
          "/Rotate 0 /BS << /W 1>> /C [0 0 0] /CA 1 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );

      const appearance = data[1].data;
      expect(appearance).toEqual(
        "2 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] /Length 127>> stream\n" +
          "1 w 1 J 1 j\n" +
          "0 G\n" +
          "10 11 m\n" +
          "12 13 14 15 16 17 c\n" +
          "22 23 24 25 26 27 c\n" +
          "910 911 m\n" +
          "912 913 914 915 916 917 c\n" +
          "922 923 924 925 926 927 c\n" +
          "S\n" +
          "endstream\n" +
          "endobj\n"
      );
    });

    it("should create a new Ink annotation with some transparency", async function () {
      const xref = (partialEvaluator.xref = new XRefMock());
      const changes = new RefSetCache();
      const task = new WorkerTask("test Ink creation");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.INK,
            rect: [12, 34, 56, 78],
            rotation: 0,
            thickness: 1,
            opacity: 0.12,
            color: [0, 0, 0],
            paths: {
              lines: [
                [
                  NaN,
                  NaN,
                  NaN,
                  NaN,
                  10,
                  11,
                  12,
                  13,
                  14,
                  15,
                  16,
                  17,
                  22,
                  23,
                  24,
                  25,
                  26,
                  27,
                ],
                [
                  NaN,
                  NaN,
                  NaN,
                  NaN,
                  910,
                  911,
                  912,
                  913,
                  914,
                  915,
                  916,
                  917,
                  922,
                  923,
                  924,
                  925,
                  926,
                  927,
                ],
              ],
              points: [
                [1, 2, 3, 4, 5, 6, 7, 8],
                [91, 92, 93, 94, 95, 96, 97, 98],
              ],
            },
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[0].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "1 0 obj\n" +
          "<< /Type /Annot /Subtype /Ink /CreationDate (date) /Rect [12 34 56 78] " +
          "/InkList [[1 2 3 4 5 6 7 8] [91 92 93 94 95 96 97 98]] /F 4 " +
          "/Rotate 0 /BS << /W 1>> /C [0 0 0] /CA 0.12 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );

      const appearance = data[1].data;
      expect(appearance).toEqual(
        "2 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] /Length 134 /Resources " +
          "<< /ExtGState << /R0 << /CA 0.12 /Type /ExtGState>>>>>>>> stream\n" +
          "1 w 1 J 1 j\n" +
          "0 G\n" +
          "/R0 gs\n" +
          "10 11 m\n" +
          "12 13 14 15 16 17 c\n" +
          "22 23 24 25 26 27 c\n" +
          "910 911 m\n" +
          "912 913 914 915 916 917 c\n" +
          "922 923 924 925 926 927 c\n" +
          "S\n" +
          "endstream\n" +
          "endobj\n"
      );
    });

    it("should render an added Ink annotation for printing", async function () {
      partialEvaluator.xref = new XRefMock();
      const task = new WorkerTask("test Ink printing");
      const inkAnnotation = (
        await AnnotationFactory.printNewAnnotations(
          annotationGlobalsMock,
          partialEvaluator,
          task,
          [
            {
              annotationType: AnnotationEditorType.INK,
              rect: [12, 34, 56, 78],
              rotation: 0,
              thickness: 3,
              opacity: 1,
              color: [0, 255, 0],
              paths: {
                lines: [[NaN, NaN, NaN, NaN, 1, 2, 3, 4, 5, 6, 7, 8]],
                points: [[1, 2, 3, 4, 5, 6, 7, 8]],
              },
            },
          ]
        )
      )[0];

      const { opList } = await inkAnnotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        null
      );

      expect(opList.argsArray.length).toEqual(8);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setLineWidth,
        OPS.setLineCap,
        OPS.setLineJoin,
        OPS.setStrokeRGBColor,
        OPS.constructPath,
        OPS.stroke,
        OPS.endAnnotation,
      ]);

      // Linewidth.
      expect(opList.argsArray[1]).toEqual([3]);
      // LineCap.
      expect(opList.argsArray[2]).toEqual([1]);
      // LineJoin.
      expect(opList.argsArray[3]).toEqual([1]);
      // Color.
      expect(opList.argsArray[4]).toEqual(new Uint8ClampedArray([0, 255, 0]));
      // Path.
      expect(opList.argsArray[5][0]).toEqual([OPS.moveTo, OPS.curveTo]);
      expect(opList.argsArray[5][1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      // Min-max.
      expect(opList.argsArray[5][2]).toEqual([1, 2, 1, 2]);
    });
  });

  describe("HighlightAnnotation", function () {
    it("should set quadpoints to null if not defined", async function () {
      const highlightDict = new Dict();
      highlightDict.set("Type", Name.get("Annot"));
      highlightDict.set("Subtype", Name.get("Highlight"));

      const highlightRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: highlightRef, data: highlightDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        highlightRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.HIGHLIGHT);
      expect(data.quadPoints).toEqual(null);
    });

    it("should set quadpoints if defined", async function () {
      const highlightDict = new Dict();
      highlightDict.set("Type", Name.get("Annot"));
      highlightDict.set("Subtype", Name.get("Highlight"));
      highlightDict.set("Rect", [10, 10, 20, 20]);
      highlightDict.set("QuadPoints", [10, 20, 20, 20, 10, 10, 20, 10]);

      const highlightRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: highlightRef, data: highlightDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        highlightRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.HIGHLIGHT);
      expect(data.quadPoints).toEqual(
        Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
      );
    });

    it("should set quadpoints to null when empty", async function () {
      const highlightDict = new Dict();
      highlightDict.set("Type", Name.get("Annot"));
      highlightDict.set("Subtype", Name.get("Highlight"));
      highlightDict.set("Rect", [10, 10, 20, 20]);
      highlightDict.set("QuadPoints", []);

      const highlightRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: highlightRef, data: highlightDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        highlightRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.HIGHLIGHT);
      expect(data.quadPoints).toEqual(null);
    });

    it("should create a new Highlight annotation", async function () {
      const xref = (partialEvaluator.xref = new XRefMock());
      const changes = new RefSetCache();
      const task = new WorkerTask("test Highlight creation");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.HIGHLIGHT,
            rect: [12, 34, 56, 78],
            rotation: 0,
            opacity: 1,
            color: [0, 0, 0],
            quadPoints: [1, 2, 3, 4, 5, 6, 7],
            outlines: [
              [8, 9, 10, 11],
              [12, 13, 14, 15],
            ],
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[0].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "1 0 obj\n" +
          "<< /Type /Annot /Subtype /Highlight /CreationDate (date) /Rect [12 34 56 78] " +
          "/F 4 /Border [0 0 0] /Rotate 0 /QuadPoints [1 2 3 4 5 6 7] /C [0 0 0] " +
          "/CA 1 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );

      const appearance = data[1].data;
      expect(appearance).toEqual(
        "2 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] " +
          "/Length 47 /Resources << /ExtGState << /R0 << /BM /Multiply>>>>>>>> stream\n" +
          "0 g\n" +
          "/R0 gs\n" +
          "8 9 m\n" +
          "10 11 l\n" +
          "h\n" +
          "12 13 m\n" +
          "14 15 l\n" +
          "h\n" +
          "f*\n" +
          "endstream\n" +
          "endobj\n"
      );
    });

    it("should render a new Highlight annotation for printing", async function () {
      partialEvaluator.xref = new XRefMock();
      const task = new WorkerTask("test Highlight printing");
      const highlightAnnotation = (
        await AnnotationFactory.printNewAnnotations(
          annotationGlobalsMock,
          partialEvaluator,
          task,
          [
            {
              annotationType: AnnotationEditorType.HIGHLIGHT,
              rect: [12, 34, 56, 78],
              rotation: 0,
              opacity: 0.5,
              color: [0, 255, 0],
              quadPoints: [1, 2, 3, 4, 5, 6, 7],
              outlines: [[8, 9, 10, 11]],
            },
          ]
        )
      )[0];

      const { opList } = await highlightAnnotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        null
      );

      expect(opList.argsArray.length).toEqual(6);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.setGState,
        OPS.constructPath,
        OPS.eoFill,
        OPS.endAnnotation,
      ]);
    });

    it("should create a new free Highlight annotation", async function () {
      const xref = (partialEvaluator.xref = new XRefMock());
      const changes = new RefSetCache();
      const task = new WorkerTask("test free Highlight creation");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: AnnotationEditorType.HIGHLIGHT,
            rect: [12, 34, 56, 78],
            rotation: 0,
            opacity: 1,
            color: [0, 0, 0],
            thickness: 3.14,
            quadPoints: null,
            outlines: {
              outline: Float32Array.from([
                NaN,
                NaN,
                8,
                9,
                10,
                11,
                NaN,
                NaN,
                12,
                13,
                14,
                15,
              ]),
              points: [Float32Array.from([16, 17, 18, 19])],
            },
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[0].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "1 0 obj\n" +
          "<< /Type /Annot /Subtype /Ink /CreationDate (date) /Rect [12 34 56 78] " +
          "/InkList [[16 17 18 19]] /F 4 /Rotate 0 /IT /InkHighlight /BS << /W 3.14>> " +
          "/C [0 0 0] /CA 1 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );

      const appearance = data[1].data;
      expect(appearance).toEqual(
        "2 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] " +
          "/Length 30 /Resources << /ExtGState << /R0 << /BM /Multiply>>>>>>>> " +
          "stream\n" +
          "0 g\n" +
          "/R0 gs\n" +
          "10 11 m\n" +
          "14 15 l\n" +
          "h f\n" +
          "endstream\n" +
          "endobj\n"
      );
    });

    it("should render a new free Highlight annotation for printing", async function () {
      partialEvaluator.xref = new XRefMock();
      const task = new WorkerTask("test free Highlight printing");
      const highlightAnnotation = (
        await AnnotationFactory.printNewAnnotations(
          annotationGlobalsMock,
          partialEvaluator,
          task,
          [
            {
              annotationType: AnnotationEditorType.HIGHLIGHT,
              rect: [12, 34, 56, 78],
              rotation: 0,
              opacity: 0.5,
              color: [0, 255, 0],
              thickness: 3.14,
              quadPoints: null,
              outlines: {
                outline: Float32Array.from([
                  NaN,
                  NaN,
                  8,
                  9,
                  10,
                  11,
                  NaN,
                  NaN,
                  12,
                  13,
                  14,
                  15,
                ]),
                points: [Float32Array.from([16, 17, 18, 19])],
              },
            },
          ]
        )
      )[0];

      const { opList } = await highlightAnnotation.getOperatorList(
        partialEvaluator,
        task,
        RenderingIntentFlag.PRINT,
        null
      );

      expect(opList.argsArray.length).toEqual(6);
      expect(opList.fnArray).toEqual([
        OPS.beginAnnotation,
        OPS.setFillRGBColor,
        OPS.setGState,
        OPS.constructPath,
        OPS.fill,
        OPS.endAnnotation,
      ]);
    });
  });

  describe("UnderlineAnnotation", function () {
    it("should set quadpoints to null if not defined", async function () {
      const underlineDict = new Dict();
      underlineDict.set("Type", Name.get("Annot"));
      underlineDict.set("Subtype", Name.get("Underline"));

      const underlineRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: underlineRef, data: underlineDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        underlineRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.UNDERLINE);
      expect(data.quadPoints).toEqual(null);
    });

    it("should set quadpoints if defined", async function () {
      const underlineDict = new Dict();
      underlineDict.set("Type", Name.get("Annot"));
      underlineDict.set("Subtype", Name.get("Underline"));
      underlineDict.set("Rect", [10, 10, 20, 20]);
      underlineDict.set("QuadPoints", [10, 20, 20, 20, 10, 10, 20, 10]);

      const underlineRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: underlineRef, data: underlineDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        underlineRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.UNDERLINE);
      expect(data.quadPoints).toEqual(
        Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
      );
    });
  });

  describe("SquigglyAnnotation", function () {
    it("should set quadpoints to null if not defined", async function () {
      const squigglyDict = new Dict();
      squigglyDict.set("Type", Name.get("Annot"));
      squigglyDict.set("Subtype", Name.get("Squiggly"));

      const squigglyRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: squigglyRef, data: squigglyDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        squigglyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.SQUIGGLY);
      expect(data.quadPoints).toEqual(null);
    });

    it("should set quadpoints if defined", async function () {
      const squigglyDict = new Dict();
      squigglyDict.set("Type", Name.get("Annot"));
      squigglyDict.set("Subtype", Name.get("Squiggly"));
      squigglyDict.set("Rect", [10, 10, 20, 20]);
      squigglyDict.set("QuadPoints", [10, 20, 20, 20, 10, 10, 20, 10]);

      const squigglyRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: squigglyRef, data: squigglyDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        squigglyRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.SQUIGGLY);
      expect(data.quadPoints).toEqual(
        Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
      );
    });
  });

  describe("StrikeOutAnnotation", function () {
    it("should set quadpoints to null if not defined", async function () {
      const strikeOutDict = new Dict();
      strikeOutDict.set("Type", Name.get("Annot"));
      strikeOutDict.set("Subtype", Name.get("StrikeOut"));

      const strikeOutRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: strikeOutRef, data: strikeOutDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        strikeOutRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.STRIKEOUT);
      expect(data.quadPoints).toEqual(null);
    });

    it("should set quadpoints if defined", async function () {
      const strikeOutDict = new Dict();
      strikeOutDict.set("Type", Name.get("Annot"));
      strikeOutDict.set("Subtype", Name.get("StrikeOut"));
      strikeOutDict.set("Rect", [10, 10, 20, 20]);
      strikeOutDict.set("QuadPoints", [10, 20, 20, 20, 10, 10, 20, 10]);

      const strikeOutRef = Ref.get(121, 0);
      const xref = new XRefMock([{ ref: strikeOutRef, data: strikeOutDict }]);

      const { data } = await AnnotationFactory.create(
        xref,
        strikeOutRef,
        annotationGlobalsMock,
        idFactoryMock
      );
      expect(data.annotationType).toEqual(AnnotationType.STRIKEOUT);
      expect(data.quadPoints).toEqual(
        Float32Array.from([10, 20, 20, 20, 10, 10, 20, 10])
      );
    });
  });

  describe("StampAnnotation for signatures", function () {
    it("should create a new Stamp annotation", async function () {
      const xref = (partialEvaluator.xref = new XRefMock());
      const changes = new RefSetCache();
      const task = new WorkerTask("test Stamp creation");
      await AnnotationFactory.saveNewAnnotations(
        partialEvaluator,
        task,
        [
          {
            annotationType: 101,
            isSignature: true,
            areContours: true,
            color: [0, 0, 0],
            thickness: 0,
            pageIndex: 0,
            rect: [12, 34, 56, 78],
            rotation: 0,
            structTreeParentId: null,
            lines: [[NaN, NaN, NaN, NaN, 1, 2, 3, 4, 5, 6, 7, 8]],
          },
        ],
        null,
        changes
      );
      const data = await writeChanges(changes, xref);

      const base = data[0].data.replace(/\(D:\d+\)/, "(date)");
      expect(base).toEqual(
        "1 0 obj\n" +
          "<< /Type /Annot /Subtype /Stamp /CreationDate (date) /Rect [12 34 56 78] " +
          "/F 4 /Border [0 0 0] " +
          "/Rotate 0 /AP << /N 2 0 R>>>>\n" +
          "endobj\n"
      );

      const appearance = data[1].data;
      expect(appearance).toEqual(
        "2 0 obj\n" +
          "<< /FormType 1 /Subtype /Form /Type /XObject /BBox [12 34 56 78] /Length 37>> stream\n" +
          "0 w 1 J 1 j\n" +
          "0 g\n" +
          "1 2 m\n" +
          "3 4 5 6 7 8 c\n" +
          "F\n" +
          "endstream\n" +
          "endobj\n"
      );
    });
  });
});
