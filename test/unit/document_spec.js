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

import { createIdFactory, XRefMock } from "./test_utils.js";
import { Dict, Name, Ref } from "../../src/core/primitives.js";
import { PDFDocument } from "../../src/core/document.js";
import { StringStream } from "../../src/core/stream.js";

describe("document", function () {
  describe("Page", function () {
    it("should create correct objId/fontId using the idFactory", function () {
      const idFactory1 = createIdFactory(/* pageIndex = */ 0);
      const idFactory2 = createIdFactory(/* pageIndex = */ 1);

      expect(idFactory1.createObjId()).toEqual("p0_1");
      expect(idFactory1.createObjId()).toEqual("p0_2");
      expect(idFactory1.createFontId()).toEqual("f1");
      expect(idFactory1.createFontId()).toEqual("f2");
      expect(idFactory1.getDocId()).toEqual("g_d0");

      expect(idFactory2.createObjId()).toEqual("p1_1");
      expect(idFactory2.createObjId()).toEqual("p1_2");
      expect(idFactory2.createFontId()).toEqual("f1");
      expect(idFactory2.createFontId()).toEqual("f2");
      expect(idFactory2.getDocId()).toEqual("g_d0");

      expect(idFactory1.createObjId()).toEqual("p0_3");
      expect(idFactory1.createObjId()).toEqual("p0_4");
      expect(idFactory1.createFontId()).toEqual("f3");
      expect(idFactory1.createFontId()).toEqual("f4");
      expect(idFactory1.getDocId()).toEqual("g_d0");
    });
  });

  describe("PDFDocument", function () {
    const pdfManager = {
      get docId() {
        return "d0";
      },
    };
    const stream = new StringStream("Dummy_PDF_data");

    function getDocument(acroForm) {
      const pdfDocument = new PDFDocument(pdfManager, stream);
      pdfDocument.catalog = { acroForm };
      return pdfDocument;
    }

    it("should get form info when no form data is present", function () {
      const pdfDocument = getDocument(null);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: false,
      });
    });

    it("should get form info when XFA is present", function () {
      const acroForm = new Dict();

      // The `XFA` entry can only be a non-empty array or stream.
      acroForm.set("XFA", []);
      let pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: false,
      });

      acroForm.set("XFA", ["foo", "bar"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: true,
      });

      acroForm.set("XFA", new StringStream(""));
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: false,
      });

      acroForm.set("XFA", new StringStream("non-empty"));
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: true,
      });
    });

    it("should get form info when AcroForm is present", function () {
      const acroForm = new Dict();

      // The `Fields` entry can only be a non-empty array.
      acroForm.set("Fields", []);
      let pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: false,
      });

      acroForm.set("Fields", ["foo", "bar"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: true,
        hasXfa: false,
      });

      // If the first bit of the `SigFlags` entry is set and the `Fields` array
      // only contains document signatures, then there is no AcroForm data.
      acroForm.set("Fields", ["foo", "bar"]);
      acroForm.set("SigFlags", 2);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: true,
        hasXfa: false,
      });

      const annotationDict = new Dict();
      annotationDict.set("FT", Name.get("Sig"));
      annotationDict.set("Rect", [0, 0, 0, 0]);
      const annotationRef = Ref.get(11, 0);

      const kidsDict = new Dict();
      kidsDict.set("Kids", [annotationRef]);
      const kidsRef = Ref.get(10, 0);

      pdfDocument.xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: kidsRef, data: kidsDict },
      ]);

      acroForm.set("Fields", [kidsRef]);
      acroForm.set("SigFlags", 3);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasXfa: false,
      });
    });
  });
});
