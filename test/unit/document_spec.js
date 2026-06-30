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
    // Padded to 1024 bytes so signature ByteRange tests using offsets
    // like `[0, 100, 200, 800]` stay within `stream.end` (the new
    // `#parseSignatureDict` validation rejects ByteRanges that exceed
    // the file length).
    const stream = new StringStream("Dummy_PDF_data".padEnd(1024, " "));

    function getDocument(acroForm, xref = new XRefMock()) {
      const catalog = { acroForm };
      const pdfManager = {
        get docId() {
          return "d0";
        },
        ensureDoc(prop, args) {
          return pdfManager.ensure(pdfDocument, prop, args);
        },
        ensureCatalog(prop, args) {
          return pdfManager.ensure(catalog, prop, args);
        },
        async ensure(obj, prop, args) {
          const value = obj[prop];
          if (typeof value === "function") {
            return value.apply(obj, args);
          }
          return value;
        },
        get evaluatorOptions() {
          return { isOffscreenCanvasSupported: false };
        },
      };
      const pdfDocument = new PDFDocument(pdfManager, stream);
      pdfDocument.xref = xref;
      pdfDocument.catalog = catalog;

      pdfManager.pdfDocument = pdfDocument;
      return pdfDocument;
    }

    it("should get form info when no form data is present", function () {
      const pdfDocument = getDocument(null);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: false,
        hasFields: false,
      });
    });

    it("should get form info when XFA is present", function () {
      const acroForm = new Dict();

      // The `XFA` entry can only be a non-empty array or stream.
      acroForm.set("XFA", []);
      let pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: false,
        hasFields: false,
      });

      acroForm.set("XFA", ["foo", "bar"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: true,
        hasFields: false,
      });

      acroForm.set("XFA", new StringStream(""));
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: false,
        hasFields: false,
      });

      acroForm.set("XFA", new StringStream("non-empty"));
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: true,
        hasFields: false,
      });
    });

    it("should get form info when AcroForm is present", function () {
      const acroForm = new Dict();

      // The `Fields` entry can only be a non-empty array.
      acroForm.set("Fields", []);
      let pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: false,
        hasXfa: false,
        hasFields: false,
      });

      acroForm.set("Fields", ["foo", "bar"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: true,
        hasSignatures: false,
        hasXfa: false,
        hasFields: true,
      });

      // If the first bit of the `SigFlags` entry is set and the `Fields` array
      // only contains document signatures, then there is no AcroForm data.
      acroForm.set("Fields", ["foo", "bar"]);
      acroForm.set("SigFlags", 2);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: true,
        hasSignatures: false,
        hasXfa: false,
        hasFields: true,
      });

      const annotationDict = new Dict();
      annotationDict.set("FT", Name.get("Sig"));
      annotationDict.set("Rect", [0, 0, 0, 0]);
      const annotationRef = Ref.get(11, 0);

      const kidsDict = new Dict();
      kidsDict.set("Kids", [annotationRef]);
      const kidsRef = Ref.get(10, 0);

      const xref = new XRefMock([
        { ref: annotationRef, data: annotationDict },
        { ref: kidsRef, data: kidsDict },
      ]);

      acroForm.set("Fields", [kidsRef]);
      acroForm.set("SigFlags", 3);
      pdfDocument = getDocument(acroForm, xref);
      expect(pdfDocument.formInfo).toEqual({
        hasAcroForm: false,
        hasSignatures: true,
        hasXfa: false,
        hasFields: true,
      });
    });

    describe("getSignatures", function () {
      function makeSigDict({
        byteRange,
        contents = "00".repeat(8),
        subFilter = "adbe.pkcs7.detached",
        name = null,
        reason = null,
        location = null,
        m = null,
      }) {
        const dict = new Dict();
        dict.set("Type", Name.get("Sig"));
        dict.set("Filter", Name.get("Adobe.PPKLite"));
        dict.set("SubFilter", Name.get(subFilter));
        dict.set("ByteRange", byteRange);
        dict.set("Contents", contents);
        if (name !== null) {
          dict.set("Name", name);
        }
        if (reason !== null) {
          dict.set("Reason", reason);
        }
        if (location !== null) {
          dict.set("Location", location);
        }
        if (m !== null) {
          dict.set("M", m);
        }
        return dict;
      }

      function makeSigField({ T, sigRef }) {
        const dict = new Dict();
        dict.set("FT", Name.get("Sig"));
        dict.set("T", T);
        dict.set("V", sigRef);
        return dict;
      }

      it("returns null when no signatures are present", async function () {
        const acroForm = new Dict();
        const pdfDocument = getDocument(acroForm);
        const signatures = await pdfDocument.signatures;
        expect(signatures).toBeNull();
      });

      it("extracts metadata for a single signature", async function () {
        const acroForm = new Dict();
        acroForm.set("SigFlags", 3);

        const sigRef = Ref.get(20, 0);
        const fieldRef = Ref.get(21, 0);
        const sigDict = makeSigDict({
          byteRange: [0, 100, 200, 300],
          name: "Alice Becker",
          reason: "Approved for release",
          m: "D:20251014103200+00'00'",
        });
        const fieldDict = makeSigField({ T: "sig_alice", sigRef });

        const xref = new XRefMock([
          { ref: sigRef, data: sigDict },
          { ref: fieldRef, data: fieldDict },
        ]);
        acroForm.set("Fields", [fieldRef]);

        const pdfDocument = getDocument(acroForm, xref);
        const signatures = await pdfDocument.signatures;
        expect(signatures.length).toEqual(1);
        const [sig] = signatures;
        expect(sig.signerName).toEqual("Alice Becker");
        expect(sig.reason).toEqual("Approved for release");
        expect(sig.signingTime).toEqual("D:20251014103200+00'00'");
        expect(sig.fieldName).toEqual("sig_alice");
        expect(sig.subFilter).toEqual("adbe.pkcs7.detached");
        expect(sig.signatureType).toEqual(0);
        expect(sig.byteRange).toEqual([0, 100, 200, 300]);
        expect(sig.parentId).toEqual(null);
        expect(sig.revisionIndex).toEqual(0);
        // The bytes (pkcs7 + signed-data spans) are no longer attached
        // to the metadata array — they're fetched on demand via
        // `getSignatureData(id)` so the worker→main message stays
        // small.
        expect(sig.pkcs7).toBeUndefined();
        expect(sig.data).toBeUndefined();
        const bytes = await pdfDocument.getSignatureData(sig.id);
        expect(bytes.pkcs7).toBeInstanceOf(Uint8Array);
        expect(Array.isArray(bytes.data)).toBeTrue();
        expect(bytes.data.length).toEqual(2);
      });

      it("walks Kids recursively to find nested signature fields", async function () {
        const acroForm = new Dict();
        acroForm.set("SigFlags", 3);

        const sigRef = Ref.get(30, 0);
        const sigFieldRef = Ref.get(31, 0);
        const containerRef = Ref.get(32, 0);

        const sigDict = makeSigDict({
          byteRange: [0, 50, 100, 150],
          name: "John Smith",
        });
        const sigField = makeSigField({ T: "sig_john", sigRef });
        const container = new Dict();
        container.set("Kids", [sigFieldRef]);

        const xref = new XRefMock([
          { ref: sigRef, data: sigDict },
          { ref: sigFieldRef, data: sigField },
          { ref: containerRef, data: container },
        ]);
        acroForm.set("Fields", [containerRef]);

        const pdfDocument = getDocument(acroForm, xref);
        const signatures = await pdfDocument.signatures;
        expect(signatures.length).toEqual(1);
        expect(signatures[0].signerName).toEqual("John Smith");
      });

      it("skips signatures with malformed ByteRange", async function () {
        const acroForm = new Dict();
        acroForm.set("SigFlags", 3);

        const sigRef = Ref.get(40, 0);
        const fieldRef = Ref.get(41, 0);
        const sigDict = makeSigDict({ byteRange: [0, 100] }); // wrong length
        const fieldDict = makeSigField({ T: "bad", sigRef });

        const xref = new XRefMock([
          { ref: sigRef, data: sigDict },
          { ref: fieldRef, data: fieldDict },
        ]);
        acroForm.set("Fields", [fieldRef]);

        const pdfDocument = getDocument(acroForm, xref);
        expect(await pdfDocument.signatures).toBeNull();
      });

      it("groups sub-signatures under the outer revision", async function () {
        const acroForm = new Dict();
        acroForm.set("SigFlags", 3);

        // Outer covers more bytes (c+d larger) → parent.
        // Inner covers fewer bytes → sub-signature of outer.
        const outerSigRef = Ref.get(50, 0);
        const outerFieldRef = Ref.get(51, 0);
        const innerSigRef = Ref.get(52, 0);
        const innerFieldRef = Ref.get(53, 0);

        const outerSig = makeSigDict({
          byteRange: [0, 100, 200, 800],
          name: "Outer",
        });
        const innerSig = makeSigDict({
          byteRange: [0, 50, 100, 200],
          name: "Inner",
        });

        const xref = new XRefMock([
          { ref: outerSigRef, data: outerSig },
          {
            ref: outerFieldRef,
            data: makeSigField({ T: "outer", sigRef: outerSigRef }),
          },
          { ref: innerSigRef, data: innerSig },
          {
            ref: innerFieldRef,
            data: makeSigField({ T: "inner", sigRef: innerSigRef }),
          },
        ]);
        acroForm.set("Fields", [outerFieldRef, innerFieldRef]);

        const pdfDocument = getDocument(acroForm, xref);
        const signatures = await pdfDocument.signatures;
        expect(signatures.length).toEqual(2);
        // Sorted descending by c+d, so outer comes first.
        expect(signatures[0].signerName).toEqual("Outer");
        expect(signatures[0].parentId).toEqual(null);
        expect(signatures[0].revisionIndex).toEqual(0);
        expect(signatures[1].signerName).toEqual("Inner");
        expect(signatures[1].parentId).toEqual(signatures[0].id);
        expect(signatures[1].revisionIndex).toEqual(1);
      });

      it("maps SubFilter to the PDFSignatureAlgorithm enum", async function () {
        const acroForm = new Dict();
        acroForm.set("SigFlags", 3);

        async function signatureType(subFilter) {
          const sigRef = Ref.get(60, 0);
          const fieldRef = Ref.get(61, 0);
          const sigDict = makeSigDict({
            byteRange: [0, 10, 20, 30],
            subFilter,
          });
          const xref = new XRefMock([
            { ref: sigRef, data: sigDict },
            {
              ref: fieldRef,
              data: makeSigField({ T: "sig", sigRef }),
            },
          ]);
          acroForm.set("Fields", [fieldRef]);
          const pdfDocument = getDocument(acroForm, xref);
          const [sig] = await pdfDocument.signatures;
          return sig.signatureType;
        }

        expect(await signatureType("adbe.pkcs7.detached")).toEqual(0);
        expect(await signatureType("adbe.pkcs7.sha1")).toEqual(1);
        expect(await signatureType("ETSI.CAdES.detached")).toEqual(null);
      });
    });

    it("should get calculation order array or null", function () {
      const acroForm = new Dict();

      let pdfDocument = getDocument(acroForm);
      expect(pdfDocument.calculationOrderIds).toEqual(null);

      acroForm.set("CO", [Ref.get(1, 0), Ref.get(2, 0), Ref.get(3, 0)]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.calculationOrderIds).toEqual(["1R", "2R", "3R"]);

      acroForm.set("CO", []);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.calculationOrderIds).toEqual(null);

      acroForm.set("CO", ["1", "2"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.calculationOrderIds).toEqual(null);

      acroForm.set("CO", ["1", Ref.get(1, 0), "2"]);
      pdfDocument = getDocument(acroForm);
      expect(pdfDocument.calculationOrderIds).toEqual(["1R"]);
    });

    it("should get field objects array or null", async function () {
      const acroForm = new Dict();

      let pdfDocument = getDocument(acroForm);
      let fields = await pdfDocument.fieldObjects;
      expect(fields).toEqual(null);

      acroForm.set("Fields", []);
      pdfDocument = getDocument(acroForm);
      fields = await pdfDocument.fieldObjects;
      expect(fields).toEqual(null);

      const kid1Ref = Ref.get(314, 0);
      const kid11Ref = Ref.get(159, 0);
      const kid2Ref = Ref.get(265, 0);
      const kid2BisRef = Ref.get(266, 0);
      const parentRef = Ref.get(358, 0);

      const allFields = Object.create(null);
      for (const name of ["parent", "kid1", "kid2", "kid11"]) {
        const buttonWidgetDict = new Dict();
        buttonWidgetDict.set("Type", Name.get("Annot"));
        buttonWidgetDict.set("Subtype", Name.get("Widget"));
        buttonWidgetDict.set("FT", Name.get("Btn"));
        buttonWidgetDict.set("T", name);
        allFields[name] = buttonWidgetDict;
      }

      allFields.kid1.set("Kids", [kid11Ref]);
      allFields.parent.set("Kids", [kid1Ref, kid2Ref, kid2BisRef]);

      const xref = new XRefMock([
        { ref: parentRef, data: allFields.parent },
        { ref: kid1Ref, data: allFields.kid1 },
        { ref: kid11Ref, data: allFields.kid11 },
        { ref: kid2Ref, data: allFields.kid2 },
        { ref: kid2BisRef, data: allFields.kid2 },
      ]);

      acroForm.set("Fields", [parentRef]);
      pdfDocument = getDocument(acroForm, xref);
      fields = (await pdfDocument.fieldObjects).allFields;

      for (const [name, objs] of Object.entries(fields)) {
        fields[name] = objs.map(obj => obj.id);
      }

      expect(fields["parent.kid1"]).toEqual(["314R"]);
      expect(fields["parent.kid1.kid11"]).toEqual(["159R"]);
      expect(fields["parent.kid2"]).toEqual(["265R", "266R"]);
      expect(fields.parent).toEqual(["358R"]);
    });

    it("should check if fields have any actions", async function () {
      const acroForm = new Dict();

      let pdfDocument = getDocument(acroForm);
      let hasJSActions = await pdfDocument.hasJSActions;
      expect(hasJSActions).toEqual(false);

      acroForm.set("Fields", []);
      pdfDocument = getDocument(acroForm);
      hasJSActions = await pdfDocument.hasJSActions;
      expect(hasJSActions).toEqual(false);

      const kid1Ref = Ref.get(314, 0);
      const kid11Ref = Ref.get(159, 0);
      const kid2Ref = Ref.get(265, 0);
      const parentRef = Ref.get(358, 0);

      const allFields = Object.create(null);
      for (const name of ["parent", "kid1", "kid2", "kid11"]) {
        const buttonWidgetDict = new Dict();
        buttonWidgetDict.set("Type", Name.get("Annot"));
        buttonWidgetDict.set("Subtype", Name.get("Widget"));
        buttonWidgetDict.set("FT", Name.get("Btn"));
        buttonWidgetDict.set("T", name);
        allFields[name] = buttonWidgetDict;
      }

      allFields.kid1.set("Kids", [kid11Ref]);
      allFields.parent.set("Kids", [kid1Ref, kid2Ref]);

      const xref = new XRefMock([
        { ref: parentRef, data: allFields.parent },
        { ref: kid1Ref, data: allFields.kid1 },
        { ref: kid11Ref, data: allFields.kid11 },
        { ref: kid2Ref, data: allFields.kid2 },
      ]);

      acroForm.set("Fields", [parentRef]);
      pdfDocument = getDocument(acroForm, xref);
      hasJSActions = await pdfDocument.hasJSActions;
      expect(hasJSActions).toEqual(false);

      const JS = Name.get("JavaScript");
      const additionalActionsDict = new Dict();
      const eDict = new Dict();
      eDict.set("JS", "hello()");
      eDict.set("S", JS);
      additionalActionsDict.set("E", eDict);
      allFields.kid2.set("AA", additionalActionsDict);

      pdfDocument = getDocument(acroForm, xref);
      hasJSActions = await pdfDocument.hasJSActions;
      expect(hasJSActions).toEqual(true);
    });
  });
});
