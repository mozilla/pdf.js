/* Copyright 2026 Mozilla Foundation
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
  AnnotationEditorType,
  AnnotationFlag,
  AnnotationMode,
  bytesToString,
  OPS,
  stringToBytes,
} from "../../src/shared/util.js";
import {
  assemblePdf,
  buildGetDocumentParams,
  DefaultFileReaderFactory,
  TEST_PDFS_PATH,
} from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";

describe("api flattening", function () {
  function addSignatureEditor(annotationStorage) {
    annotationStorage.setValue("pdfjs_internal_editor_0", {
      annotationType: AnnotationEditorType.SIGNATURE,
      isSignature: true,
      areContours: false,
      color: [255, 0, 0],
      thickness: 1,
      pageIndex: 0,
      rect: [12, 34, 56, 78],
      rotation: 0,
      structTreeParentId: null,
      lines: [[NaN, NaN, NaN, NaN, 12, 34, 20, 40, 50, 70, 56, 78]],
    });
  }

  function addInkEditor(annotationStorage, extra) {
    annotationStorage.setValue("pdfjs_internal_editor_0", {
      annotationType: AnnotationEditorType.INK,
      color: [255, 0, 0],
      thickness: 1,
      opacity: 1,
      paths: {
        lines: [[NaN, NaN, NaN, NaN, 12, 34, 20, 40, 50, 70, 56, 78]],
        points: [[12, 34, 20, 40, 50, 70, 56, 78]],
      },
      pageIndex: 0,
      rect: [12, 34, 56, 78],
      rotation: 0,
      structTreeParentId: null,
      ...extra,
    });
  }

  // A page with the given content, and a stamp drawing "Hello" at (10, 10).
  function buildStampedPagePdf(content) {
    const appearance = "BT /F1 10 Tf (Hello) Tj ET";
    return assemblePdf([
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R " +
        "/OCProperties << /OCGs [6 0 R] /D << /OFF [6 0 R] >> >> >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] " +
        "/Resources << /Font << /F1 8 0 R >> /Properties << /OC1 6 0 R >> >> " +
        "/Contents 4 0 R /Annots [5 0 R] >>\nendobj\n",
      `4 0 obj\n<< /Length ${content.length} >>\n` +
        `stream\n${content}\nendstream\nendobj\n`,
      "5 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 " +
        "/Rect [10 10 60 60] /AP << /N 7 0 R >> >>\nendobj\n",
      "6 0 obj\n<< /Type /OCG /Name (Hidden) >>\nendobj\n",
      "7 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 50 50] " +
        "/Resources << /Font << /F1 8 0 R >> >> " +
        `/Length ${appearance.length} >>\n` +
        `stream\n${appearance}\nendstream\nendobj\n`,
      "8 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
        "endobj\n",
    ]);
  }

  // A page with the given annotations, each drawing its name.
  function buildAnnotatedPagePdf(annotations) {
    const annots = annotations.map((_, i) => `${2 * i + 5} 0 R`).join(" ");
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
        `/Annots [${annots}] >>\nendobj\n`,
      "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
        "endobj\n",
    ];
    for (const [i, [name, entries]] of annotations.entries()) {
      const appearance = `BT /F1 10 Tf (${name}) Tj ET`;
      objects.push(
        `${2 * i + 5} 0 obj\n<< /Type /Annot ${entries} ` +
          `/Rect [0 ${20 * i} 100 ${20 * i + 20}] ` +
          `/AP << /N ${2 * i + 6} 0 R >> >>\nendobj\n`,
        `${2 * i + 6} 0 obj\n<< /Type /XObject /Subtype /Form ` +
          "/BBox [0 0 100 20] /Resources << /Font << /F1 4 0 R >> >> " +
          `/Length ${appearance.length} >>\n` +
          `stream\n${appearance}\nendstream\nendobj\n`
      );
    }
    return assemblePdf(objects);
  }

  describe("saveDocument", function () {
    it("write a new signature, save the pdf flattened and check that it's drawn in the page content", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("empty.pdf"));
      let pdfDoc = await loadingTask.promise;
      addSignatureEditor(pdfDoc.annotationStorage);

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      const savedString = bytesToString(data);
      expect(savedString).toContain("q 1 0 0 1 0 0 cm /FlatAnnot0 Do Q");

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(fnArray).toContain(OPS.paintFormXObjectBegin);
      expect(fnArray).toContain(OPS.constructPath);

      await loadingTask.destroy();
    });

    it("write a value in a field, save the pdf flattened and check that the form is removed", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
      let pdfDoc = await loadingTask.promise;
      const value = "Hello World";

      pdfDoc.annotationStorage.setValue("55R", { value });

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(await pdfDoc.getFieldObjects()).toBeNull();

      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toContain(value);

      await loadingTask.destroy();
    });

    it("saveDocument and extractPages preserve form fields with non-form annotations flattened (saved and pending annotations)", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        for (const saveFirst of [false, true]) {
          let loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
          let pdfDoc = await loadingTask.promise;
          const value = "Hello World";

          pdfDoc.annotationStorage.setValue("55R", { value });
          pdfDoc.annotationStorage.setValue("56R", { noPrint: true });
          pdfDoc.annotationStorage.setValue("30R", {
            noView: true,
            noPrint: true,
          });
          addSignatureEditor(pdfDoc.annotationStorage);

          if (saveFirst) {
            // Reload to flatten a saved annotation without storage edits.
            const saved = await pdfDoc.saveDocument();
            await loadingTask.destroy();
            loadingTask = getDocument({ data: saved });
            pdfDoc = await loadingTask.promise;
          }

          const options = { flatten: "non-forms" };
          const data =
            method === "saveDocument"
              ? await pdfDoc.saveDocument(options)
              : await pdfDoc.extractPages([{ document: null }], null, options);
          await loadingTask.destroy();

          loadingTask = getDocument({ data });
          pdfDoc = await loadingTask.promise;
          const fields = await pdfDoc.getFieldObjects();
          expect(fields.size).toEqual(10);
          expect(fields.get("Text1")[0].value).toEqual(value);

          for (let pageNumber = 1; pageNumber <= 2; pageNumber++) {
            const page = await pdfDoc.getPage(pageNumber);
            const annotations = await page.getAnnotations({ intent: "any" });
            expect(annotations.length).toEqual(pageNumber === 1 ? 3 : 7);
            expect(annotations.every(({ subtype }) => subtype === "Widget"))
              .withContext(`Page ${pageNumber}`)
              .toBeTrue();

            if (pageNumber === 1) {
              expect(
                annotations.find(({ fieldName }) => fieldName === "Text1")
                  .fieldValue
              ).toEqual(value);
              expect(
                annotations.find(({ fieldName }) => fieldName === "Text2")
                  .annotationFlags & AnnotationFlag.PRINT
              ).toEqual(0);
            } else {
              expect(
                annotations.find(({ fieldName }) => fieldName === "Text4")
                  .annotationFlags & AnnotationFlag.HIDDEN
              ).toEqual(AnnotationFlag.HIDDEN);
            }

            const { fnArray } = await page.getOperatorList({
              annotationMode: AnnotationMode.DISABLE,
            });
            // Only the signature is added to the page content.
            expect(
              fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
            ).toEqual(pageNumber === 1 ? 1 : 0);
            const { items } = await page.getTextContent();
            expect(items.map(({ str }) => str)).not.toContain(value);
          }

          await loadingTask.destroy();
        }
      }
    });

    it("saveDocument and extractPages flatten field visibility and appearances for the display and print intents", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        for (const intent of ["display", "print"]) {
          const flags = [
            AnnotationFlag.PRINT | AnnotationFlag.NOVIEW,
            AnnotationFlag.PRINT | AnnotationFlag.HIDDEN,
            AnnotationFlag.PRINT,
            AnnotationFlag.PRINT,
          ];
          const data = assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 3 0 R /AcroForm 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Fields [6 0 R 7 0 R 8 0 R 9 0 R] " +
              "/DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv 5 0 R >> >> >>\nendobj\n",
            "3 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n",
            "4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 300 300] " +
              "/Annots [6 0 R 7 0 R 8 0 R 9 0 R] >>\nendobj\n",
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
            ...flags.map(
              (flag, i) =>
                `${i + 6} 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx ` +
                `/T (Field${i}) /V (Old) /F ${flag} /Rect [0 ${i * 40} 200 ${i * 40 + 30}] >>\nendobj\n`
            ),
          ]);
          let loadingTask = getDocument({ data });
          let pdfDoc = await loadingTask.promise;
          const values = ["Both", "Screen", "Paper", "Hidden"];
          for (let i = 0; i < values.length; i++) {
            pdfDoc.annotationStorage.setValue(`${i + 6}R`, {
              value: `Raw${i}`,
              formattedValue: values[i],
              noView: i >= 2,
              noPrint: i % 2 === 1,
            });
          }
          const options = { flatten: true, intent };
          const saved =
            method === "saveDocument"
              ? await pdfDoc.saveDocument(options)
              : await pdfDoc.extractPages([{ document: null }], null, options);
          await loadingTask.destroy();

          loadingTask = getDocument({ data: saved });
          pdfDoc = await loadingTask.promise;
          const page = await pdfDoc.getPage(1);
          expect(await pdfDoc.getFieldObjects()).toBeNull();
          expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
          const { items } = await page.getTextContent();
          expect(items.map(({ str }) => str).filter(Boolean)).toEqual([
            "Both",
            intent === "print" ? "Paper" : "Screen",
          ]);
          await loadingTask.destroy();
        }
      }
    });

    it("saveDocument and extractPages flatten non-form annotations for the display and print intents", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        for (const intent of ["display", "print"]) {
          const flags = [
            0,
            AnnotationFlag.PRINT,
            AnnotationFlag.PRINT | AnnotationFlag.NOVIEW,
            AnnotationFlag.PRINT | AnnotationFlag.HIDDEN,
          ];
          const data = assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
              "/Annots [5 0 R 6 0 R 7 0 R 8 0 R] >>\nendobj\n",
            "4 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
              "/Length 15 >>\nstream\n0 0 10 10 re f\nendstream\nendobj\n",
            ...flags.map(
              (flag, i) =>
                `${i + 5} 0 obj\n<< /Type /Annot /Subtype /Stamp /F ${flag} ` +
                "/Rect [0 0 10 10] /AP << /N 4 0 R >> >>\nendobj\n"
            ),
          ]);
          let loadingTask = getDocument({ data });
          let pdfDoc = await loadingTask.promise;
          const options = { flatten: "non-forms", intent };
          const saved =
            method === "saveDocument"
              ? await pdfDoc.saveDocument(options)
              : await pdfDoc.extractPages([{ document: null }], null, options);
          await loadingTask.destroy();

          loadingTask = getDocument({ data: saved });
          pdfDoc = await loadingTask.promise;
          const page = await pdfDoc.getPage(1);
          const annotations = await page.getAnnotations({ intent: "any" });
          expect(
            annotations.map(({ annotationFlags }) => annotationFlags)
          ).toEqual([flags[intent === "print" ? 0 : 2], flags[3]]);
          const { fnArray } = await page.getOperatorList({
            annotationMode: AnnotationMode.DISABLE,
          });
          expect(
            fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
          ).toEqual(2);
          await loadingTask.destroy();
        }
      }
    });

    it("extractPages flattens the fields as saveDocument does, with and without NeedAppearances", async function () {
      for (const needAppearances of [false, true]) {
        const appearance = text => {
          const content = `/Tx BMC BT /Helv 12 Tf 2 10 Td (${text}) Tj ET EMC`;
          return (
            "<< /Type /XObject /Subtype /Form /BBox [0 0 200 30] " +
            "/Resources << /Font << /Helv 5 0 R >> >> " +
            `/Length ${content.length} >>\nstream\n${content}\nendstream`
          );
        };
        const field = (num, name, value, y, ap) =>
          `${num} 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx ` +
          `/T (${name}) /V (${value}) /F 4 /Rect [0 ${y} 200 ${y + 30}]` +
          `${ap ? ` /AP << /N ${ap} 0 R >>` : ""} >>\nendobj\n`;
        const originalData = assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 3 0 R /AcroForm 2 0 R >>\nendobj\n",
          "2 0 obj\n<< /Fields [6 0 R 7 0 R 8 0 R] /DA (/Helv 12 Tf 0 g) " +
            "/DR << /Font << /Helv 5 0 R >> >>" +
            `${needAppearances ? " /NeedAppearances true" : ""} >>\nendobj\n`,
          "3 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n",
          "4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 300 300] " +
            "/Annots [6 0 R 7 0 R 8 0 R] >>\nendobj\n",
          "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          // An unformatted appearance, a formatted one and no appearance.
          field(6, "A", "1234", 0, 9),
          field(7, "B", "1234.5", 40, 10),
          field(8, "C", "Old", 80),
          `9 0 obj\n${appearance("1234")}\nendobj\n`,
          `10 0 obj\n${appearance("$1,234.50")}\nendobj\n`,
        ]);
        const getTexts = async method => {
          let loadingTask = getDocument({ data: originalData.slice() });
          let pdfDoc = await loadingTask.promise;
          // Only the formatted value differs from the saved one.
          pdfDoc.annotationStorage.setValue("6R", {
            value: "1234",
            formattedValue: "$1,234.00",
          });
          // The field font can't encode this value.
          pdfDoc.annotationStorage.setValue("8R", { value: "你好" });

          const options = { flatten: true };
          const data =
            method === "saveDocument"
              ? await pdfDoc.saveDocument(options)
              : await pdfDoc.extractPages([{ document: null }], null, options);
          await loadingTask.destroy();

          loadingTask = getDocument({ data });
          pdfDoc = await loadingTask.promise;
          const page = await pdfDoc.getPage(1);
          const annotations = await page.getAnnotations({ intent: "any" });
          const { items } = await page.getTextContent();
          await loadingTask.destroy();
          return {
            fieldValues: annotations.map(({ fieldValue }) => fieldValue),
            texts: items.map(({ str }) => str).filter(Boolean),
          };
        };

        const expected = await getTexts("saveDocument");
        expect(expected).toEqual({
          fieldValues: ["你好"],
          texts: ["$1,234.00", needAppearances ? "1234.5" : "$1,234.50"],
        });
        expect(await getTexts("extractPages")).toEqual(expected);
      }
    });

    it("write a value in a field of a pdf with a broken xref, extract the pages flattened and check that the value is drawn", async function () {
      // Shift startxref into the xref table to force recovery.
      const originalData = bytesToString(
        assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 3 0 R /AcroForm 2 0 R >>\nendobj\n",
          "2 0 obj\n<< /Fields [5 0 R] /DA (/Helv 12 Tf 0 g) " +
            "/DR << /Font << /Helv 6 0 R >> >> >>\nendobj\n",
          "3 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n",
          "4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 300 300] " +
            "/Annots [5 0 R] >>\nendobj\n",
          "5 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (A) " +
            "/V (Old) /F 4 /Rect [0 0 200 30] >>\nendobj\n",
          "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
        ])
      ).replace(/startxref\n(\d+)/, (_, offset) => `startxref\n${+offset + 7}`);
      let loadingTask = getDocument({ data: stringToBytes(originalData) });
      let pdfDoc = await loadingTask.promise;
      pdfDoc.annotationStorage.setValue("5R", { value: "New" });

      const data = await pdfDoc.extractPages([{ document: null }], null, {
        flatten: true,
      });
      await loadingTask.destroy();
      expect(data).not.toBeNull();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toEqual(["New"]);

      await loadingTask.destroy();
    });

    it("saveDocument and extractPages flatten without sending fonts to the main thread", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        const loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
        const pdfDoc = await loadingTask.promise;
        pdfDoc.annotationStorage.setValue("55R", { value: "Hello World" });

        const options = { flatten: true };
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument(options)
            : await pdfDoc.extractPages([{ document: null }], null, options);
        expect(data).not.toBeNull();

        // Saving must not transfer field fonts to commonObjs.
        const page = await pdfDoc.getPage(1);
        expect([...page.commonObjs]).toEqual([]);

        await loadingTask.destroy();
      }
    });

    it("saveDocument and extractPages flatten without writing the data of the removed annotations", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        const loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
        const pdfDoc = await loadingTask.promise;
        // A field hidden when printing, and a new annotation with a comment.
        pdfDoc.annotationStorage.setValue("56R", {
          value: "Secret",
          noPrint: true,
        });
        addInkEditor(pdfDoc.annotationStorage, {
          popup: { contents: "Private note", deleted: false },
        });

        const options = { flatten: true };
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument(options)
            : await pdfDoc.extractPages([{ document: null }], null, options);
        await loadingTask.destroy();

        const savedString = bytesToString(data);
        expect(savedString).not.toContain("Secret");
        expect(savedString).not.toContain("Private note");
        if (method === "extractPages") {
          // Extraction writes a single revision.
          expect(savedString.match(/%%EOF/g).length).toEqual(1);
        }
      }
    });

    it("saveDocument and extractPages flatten without removing a file attachment", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        let loadingTask = getDocument(
          buildGetDocumentParams("annotation-fileattachment.pdf")
        );
        let pdfDoc = await loadingTask.promise;

        const options = { flatten: true };
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument(options)
            : await pdfDoc.extractPages([{ document: null }], null, options);
        await loadingTask.destroy();

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        const annotations = await page.getAnnotations({ intent: "any" });
        expect(
          annotations.map(({ subtype, file }) => [subtype, file?.filename])
        ).toEqual([["FileAttachment", "Test.txt"]]);

        // Its appearance is drawn in the page content.
        const { fnArray } = await page.getOperatorList({
          annotationMode: AnnotationMode.DISABLE,
        });
        expect(fnArray).toContain(OPS.paintFormXObjectBegin);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that the shared appearances and optional contents have one resource", async function () {
      const appearance = "0 0 10 10 re f";
      const stamp = (num, x) =>
        `${num} 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 ` +
        `/Rect [${x} 0 ${x + 10} 10] /OC 7 0 R /AP << /N 6 0 R >> >>\nendobj\n`;
      const loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R " +
            "/OCProperties << /OCGs [7 0 R] /D << >> >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
            "/Annots [4 0 R 5 0 R] >>\nendobj\n",
          stamp(4, 0),
          stamp(5, 20),
          "6 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
          "7 0 obj\n<< /Type /OCG /Name (Layer) >>\nendobj\n",
        ]),
      });
      const pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      const savedString = bytesToString(data);
      expect(savedString.match(/\/FlatAnnot0 Do/g).length).toEqual(2);
      expect(savedString.match(/\/OC \/FlatOC0 BDC/g).length).toEqual(2);
      expect(savedString).not.toContain("FlatAnnot1");
      expect(savedString).not.toContain("FlatOC1");

      await loadingTask.destroy();
    });

    it("save the pdf flattened with an invalid intent and check that the print one is used", async function () {
      let loadingTask = getDocument({
        // The stamp is printed but not viewed.
        data: buildAnnotatedPagePdf([["Stamp", "/Subtype /Stamp /F 36"]]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true, intent: "foo" });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toEqual(["Stamp"]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that a link is kept with its appearance drawn once", async function () {
      let loadingTask = getDocument({
        data: buildAnnotatedPagePdf([
          [
            "Link",
            "/Subtype /Link /F 4 /A << /S /URI /URI (https://example.com/) >>",
          ],
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      const annotations = await page.getAnnotations({ intent: "any" });
      expect(annotations.map(({ subtype, url }) => [subtype, url])).toEqual([
        ["Link", "https://example.com/"],
      ]);

      // Keep the link, but draw its text only once, in page content.
      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toEqual(["Link"]);
      const { fnArray } = await page.getOperatorList();
      expect(fnArray.filter(fn => fn === OPS.showText).length).toEqual(1);

      await loadingTask.destroy();
    });

    it("preserves an AcroForm without page widgets when only non-form annotations are flattened", async function () {
      const originalData = assemblePdf([
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R " +
          "/AcroForm << /Fields [4 0 R] >> >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R " +
          "/MediaBox [0 0 100 100] >>\nendobj\n",
        "4 0 obj\n<< /FT /Tx /T (Calculation) /V (42) >>\nendobj\n",
      ]);
      const loadingTask = getDocument({ data: originalData.slice() });
      const pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: "non-forms" });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that a field value requiring a generated appearance is drawn in the page content", async function () {
      // NeedAppearances must replace the stale appearance.
      let loadingTask = getDocument(buildGetDocumentParams("bug1844583.pdf"));
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(await pdfDoc.getFieldObjects()).toBeNull();

      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toContain("Hello World");

      await loadingTask.destroy();
    });

    it("write a value the field font can't encode, save the pdf flattened and check that the field is kept", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
      let pdfDoc = await loadingTask.promise;
      const value = "你好";

      pdfDoc.annotationStorage.setValue("55R", { value });

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      // The flattened fields are removed from the form.
      expect([...(await pdfDoc.getFieldObjects()).keys()]).toEqual(["Text1"]);

      const page = await pdfDoc.getPage(1);
      const annotations = await page.getAnnotations({ intent: "any" });
      expect(
        annotations.map(({ id, fieldValue }) => ({ id, fieldValue }))
      ).toEqual([{ id: "55R", fieldValue: value }]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the removed widgets and fields are removed from the kept form", async function () {
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 3 0 R /AcroForm 2 0 R >>\nendobj\n",
          "2 0 obj\n<< /Fields [5 0 R 8 0 R] /CO [5 0 R 8 0 R] " +
            "/DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv 4 0 R >> >> >>\n" +
            "endobj\n",
          "3 0 obj\n<< /Type /Pages /Kids [9 0 R] /Count 1 >>\nendobj\n",
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          "5 0 obj\n<< /FT /Tx /T (P) /V (Old) /Kids [6 0 R 7 0 R] >>\nendobj\n",
          // An unencodable widget and a nonprinting widget.
          "6 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 4 " +
            "/Rect [0 0 100 20] >>\nendobj\n",
          "7 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 0 " +
            "/Rect [0 30 100 50] >>\nendobj\n",
          "8 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (Q) /V (Old) " +
            "/F 4 /Rect [0 60 100 80] >>\nendobj\n",
          "9 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 200 200] " +
            "/Annots [6 0 R 7 0 R 8 0 R] >>\nendobj\n",
        ]),
      });
      let pdfDoc = await loadingTask.promise;
      pdfDoc.annotationStorage.setValue("6R", { value: "你好" });
      pdfDoc.annotationStorage.setValue("8R", { value: "New" });

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const fields = await pdfDoc.getFieldObjects();
      expect(
        Object.fromEntries(
          [...fields].map(([name, objects]) => [
            name,
            objects.map(({ id }) => id),
          ])
        )
      ).toEqual({ P: ["5R", "6R"] });
      expect(await pdfDoc.getCalculationOrderIds()).toEqual(["5R"]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that a field without remaining widgets is removed from the kept form, indirect or direct", async function () {
      for (const isDirect of [false, true]) {
        const acroForm =
          "<< /Fields [5 0 R 8 0 R] /CO [5 0 R] /DA (/Helv 12 Tf 0 g) " +
          "/DR << /Font << /Helv 4 0 R >> >> >>";
        const pdfData = assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 3 0 R " +
            `/AcroForm ${isDirect ? acroForm : "2 0 R"} >>\nendobj\n`,
          `2 0 obj\n${isDirect ? "<< >>" : acroForm}\nendobj\n`,
          "3 0 obj\n<< /Type /Pages /Kids [9 0 R] /Count 1 >>\nendobj\n",
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          "5 0 obj\n<< /FT /Tx /T (P) /V (Old) /Kids [6 0 R 7 0 R] >>\nendobj\n",
          "6 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 4 " +
            "/Rect [0 0 100 20] >>\nendobj\n",
          "7 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 4 " +
            "/Rect [0 30 100 50] >>\nendobj\n",
          // An unencodable value keeps this widget, hence the form.
          "8 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (Q) /V (Old) " +
            "/F 4 /Rect [0 60 100 80] >>\nendobj\n",
          "9 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 200 200] " +
            "/Annots [6 0 R 7 0 R 8 0 R] >>\nendobj\n",
        ]);
        let loadingTask = getDocument({ data: pdfData.slice() });
        let pdfDoc = await loadingTask.promise;
        pdfDoc.annotationStorage.setValue("6R", { value: "New" });
        pdfDoc.annotationStorage.setValue("7R", { value: "New" });
        pdfDoc.annotationStorage.setValue("8R", { value: "你好" });

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        // Don't rewrite the removed field or its widgets in the new revision.
        const written = [
          ...bytesToString(data.subarray(pdfData.length)).matchAll(
            /^(\d+) 0 obj/gm
          ),
        ].map(([, num]) => +num);
        expect(written).toContain(isDirect ? 1 : 2);
        for (const num of [5, 6, 7]) {
          expect(written).not.toContain(num);
        }

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const fields = await pdfDoc.getFieldObjects();
        expect([...fields.keys()]).toEqual(["Q"]);
        expect(await pdfDoc.getCalculationOrderIds()).toBeNull();

        const page = await pdfDoc.getPage(1);
        expect(
          (await page.getAnnotations({ intent: "any" })).map(({ id }) => id)
        ).toEqual(["8R"]);
        const { items } = await page.getTextContent();
        expect(items.map(({ str }) => str).filter(Boolean)).toEqual([
          "New",
          "New",
        ]);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that the parent fields of the removed form aren't rewritten", async function () {
      const pdfData = assemblePdf([
        "1 0 obj\n<< /Type /Catalog /Pages 3 0 R /AcroForm 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Fields [5 0 R] /DA (/Helv 12 Tf 0 g) " +
          "/DR << /Font << /Helv 4 0 R >> >> >>\nendobj\n",
        "3 0 obj\n<< /Type /Pages /Kids [8 0 R] /Count 1 >>\nendobj\n",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
          "endobj\n",
        // Saving a widget value updates its parent field.
        "5 0 obj\n<< /FT /Tx /T (P) /V (Old) /Kids [6 0 R 7 0 R] >>\nendobj\n",
        "6 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 4 " +
          "/Rect [0 0 100 20] >>\nendobj\n",
        "7 0 obj\n<< /Type /Annot /Subtype /Widget /Parent 5 0 R /F 4 " +
          "/Rect [0 30 100 50] >>\nendobj\n",
        "8 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 200 200] " +
          "/Annots [6 0 R 7 0 R] >>\nendobj\n",
      ]);
      let loadingTask = getDocument({ data: pdfData.slice() });
      let pdfDoc = await loadingTask.promise;
      pdfDoc.annotationStorage.setValue("6R", { value: "New" });
      pdfDoc.annotationStorage.setValue("7R", { value: "New" });

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      const written = [
        ...bytesToString(data.subarray(pdfData.length)).matchAll(
          /^(\d+) 0 obj/gm
        ),
      ].map(([, num]) => +num);
      expect(written).toContain(1);
      for (const num of [5, 6, 7]) {
        expect(written).not.toContain(num);
      }

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(await pdfDoc.getFieldObjects()).toBeNull();
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str).filter(Boolean)).toEqual([
        "New",
        "New",
      ]);

      await loadingTask.destroy();
    });

    it("save a tagged pdf flattened and check that the structure element of an annotation references its drawing", async function () {
      const content =
        "/P <</MCID 0>> BDC BT /F1 10 Tf 10 100 Td (Text) Tj ET EMC";
      const appearance = "0 0 10 10 re f";
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R " +
            "/MarkInfo << /Marked true >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/StructParents 0 /Resources << /Font << /F1 4 0 R >> >> " +
            "/Contents 5 0 R /Annots [6 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          `5 0 obj\n<< /Length ${content.length} >>\n` +
            `stream\n${content}\nendstream\nendobj\n`,
          "6 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 /Rect [10 10 20 20] " +
            "/StructParent 1 /AP << /N 10 0 R >> >>\nendobj\n",
          "7 0 obj\n<< /Type /StructTreeRoot /K [8 0 R 9 0 R] " +
            "/ParentTree << /Nums [0 [8 0 R] 1 9 0 R] >> " +
            "/ParentTreeNextKey 2 >>\nendobj\n",
          "8 0 obj\n<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>\n" +
            "endobj\n",
          "9 0 obj\n<< /Type /StructElem /S /Figure /Alt (Stamp alt) " +
            "/P 7 0 R /Pg 3 0 R /K << /Type /OBJR /Obj 6 0 R >> >>\nendobj\n",
          "10 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      // Assign MCID 1 to the stamp after the page's existing MCID 0.
      expect(await page.getStructTree()).toEqual({
        role: "Root",
        children: [
          { role: "P", children: [{ type: "content", id: "p3R_mc0" }] },
          {
            role: "Figure",
            alt: "Stamp alt",
            children: [{ type: "content", id: "p3R_mc1" }],
          },
        ],
      });
      const { items } = await page.getTextContent({
        includeMarkedContent: true,
      });
      expect(
        items
          .filter(({ type }) => type === "beginMarkedContentProps")
          .map(({ tag, id }) => [tag, id])
      ).toEqual([
        ["P", "p3R_mc0"],
        ["Figure", "p3R_mc1"],
      ]);

      await loadingTask.destroy();
    });

    // 13 1 R has the wrong generation, so fetching it throws.
    for (const unreadableKid of ["", "13 1 R "]) {
      it(`flatten a tagged pdf with a parent tree having kids${unreadableKid ? " and an unreadable structure kid" : ""}`, async function () {
        const content =
          "/P <</MCID 0>> BDC BT /F1 10 Tf 10 100 Td (Text) Tj ET EMC";
        const appearance = "0 0 10 10 re f";
        const pdfData = assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R " +
            "/MarkInfo << /Marked true >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/StructParents 0 /Resources << /Font << /F1 4 0 R >> >> " +
            "/Contents 5 0 R /Annots [6 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          `5 0 obj\n<< /Length ${content.length} >>\n` +
            `stream\n${content}\nendstream\nendobj\n`,
          "6 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 /Rect [10 10 20 20] " +
            "/StructParent 1 /AP << /N 10 0 R >> >>\nendobj\n",
          "7 0 obj\n<< /Type /StructTreeRoot /K [8 0 R 9 0 R] " +
            "/ParentTree << /Kids [11 0 R 12 0 R] >> /ParentTreeNextKey 2 >>\n" +
            "endobj\n",
          "8 0 obj\n<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>\n" +
            "endobj\n",
          "9 0 obj\n<< /Type /StructElem /S /Figure /Alt (Stamp alt) " +
            "/P 7 0 R /Pg 3 0 R /K " +
            `[${unreadableKid}<< /Type /OBJR /Obj 6 0 R >>] >>\nendobj\n`,
          "10 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
          "11 0 obj\n<< /Limits [0 0] /Nums [0 [8 0 R]] >>\nendobj\n",
          "12 0 obj\n<< /Limits [1 1] /Nums [1 9 0 R] >>\nendobj\n",
          ...(unreadableKid ? ["13 0 obj\nnull\nendobj\n"] : []),
        ]);
        let loadingTask = getDocument({ data: pdfData.slice() });
        let pdfDoc = await loadingTask.promise;

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        // Rewrite the parent tree flat, with 9R as the stamp's MCID parent.
        const newData = bytesToString(data.subarray(pdfData.length));
        const parentTreeNum = +newData.match(/\/ParentTree (\d+) 0 R/)[1];
        expect(newData).toContain(
          `${parentTreeNum} 0 obj\n<< /Nums [0 [8 0 R 9 0 R]]>>`
        );
        // Preserve the unreadable kid and replace the annotation's OBJR.
        expect(newData).toContain(
          `/K [${unreadableKid}<< /Type /MCR /Pg 3 0 R /MCID 1>>]`
        );

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

        const { items } = await page.getTextContent({
          includeMarkedContent: true,
        });
        expect(
          items
            .filter(({ type }) => type === "beginMarkedContentProps")
            .map(({ tag, id }) => [tag, id])
        ).toEqual([
          ["P", "p3R_mc0"],
          ["Figure", "p3R_mc1"],
        ]);

        await loadingTask.destroy();
      });
    }

    it("save a tagged pdf flattened and check that a structure element with several kids references the drawing", async function () {
      const content =
        "/P <</MCID 0>> BDC BT /F1 10 Tf 10 100 Td (Text) Tj ET EMC " +
        "/Span <</MCID 1>> BDC BT /F1 10 Tf 10 120 Td (Caption) Tj ET EMC";
      const appearance = "0 0 10 10 re f";
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R " +
            "/MarkInfo << /Marked true >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/StructParents 0 /Resources << /Font << /F1 4 0 R >> >> " +
            "/Contents 5 0 R /Annots [6 0 R 11 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          `5 0 obj\n<< /Length ${content.length} >>\n` +
            `stream\n${content}\nendstream\nendobj\n`,
          "6 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 /Rect [10 10 20 20] " +
            "/StructParent 1 /AP << /N 10 0 R >> >>\nendobj\n",
          "7 0 obj\n<< /Type /StructTreeRoot /K [8 0 R 9 0 R 12 0 R] " +
            "/ParentTree << /Nums [0 [8 0 R 9 0 R] 1 9 0 R 2 12 0 R] >> " +
            "/ParentTreeNextKey 3 >>\nendobj\n",
          "8 0 obj\n<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>\n" +
            "endobj\n",
          // MCID 1 is the caption; the OBJR references the stamp.
          "9 0 obj\n<< /Type /StructElem /S /Figure /Alt (Stamp alt) " +
            "/P 7 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 6 0 R >>] >>\n" +
            "endobj\n",
          "10 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
          // A link without appearance is kept.
          "11 0 obj\n<< /Type /Annot /Subtype /Link /Rect [100 10 120 20] " +
            "/StructParent 2 /A << /S /URI /URI (https://mozilla.org) >> >>\n" +
            "endobj\n",
          "12 0 obj\n<< /Type /StructElem /S /Link /P 7 0 R /Pg 3 0 R " +
            "/K << /Type /OBJR /Obj 11 0 R >> >>\nendobj\n",
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      // Keep the link's parent-tree entry; remove the stamp's.
      expect(bytesToString(data)).toContain(
        "/Nums [0 [8 0 R 9 0 R 9 0 R] 2 12 0 R]"
      );

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(
        (await page.getAnnotations({ intent: "any" })).map(({ id }) => id)
      ).toEqual(["11R"]);

      expect(await page.getStructTree()).toEqual({
        role: "Root",
        children: [
          { role: "P", children: [{ type: "content", id: "p3R_mc0" }] },
          {
            role: "Figure",
            alt: "Stamp alt",
            children: [
              { type: "content", id: "p3R_mc1" },
              { type: "content", id: "p3R_mc2" },
            ],
          },
          {
            role: "Link",
            children: [{ type: "annotation", id: "pdfjs_internal_id_11R" }],
          },
        ],
      });
      const { items } = await page.getTextContent({
        includeMarkedContent: true,
      });
      expect(
        items
          .filter(({ type }) => type === "beginMarkedContentProps")
          .map(({ tag, id }) => [tag, id])
      ).toEqual([
        ["P", "p3R_mc0"],
        ["Span", "p3R_mc1"],
        ["Figure", "p3R_mc2"],
      ]);

      await loadingTask.destroy();
    });

    it("write a new annotation with an alt text, save the pdf flattened and check that the alt text is kept", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("empty.pdf"));
      let pdfDoc = await loadingTask.promise;
      addInkEditor(pdfDoc.annotationStorage, {
        accessibilityData: { type: "Figure", alt: "My ink alt" },
      });

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent({
        includeMarkedContent: true,
      });
      const marks = items.filter(
        ({ type }) => type === "beginMarkedContentProps"
      );
      expect(marks.map(({ tag }) => tag)).toEqual(["Figure"]);
      expect((await page.getStructTree()).children).toEqual([
        {
          role: "Figure",
          alt: "My ink alt",
          children: [{ type: "content", id: marks[0].id }],
        },
      ]);

      await loadingTask.destroy();
    });

    it("write a new signature, extract the pages flattened with the ones of another pdf and check that the annotations are drawn in the page content", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("evaljs.pdf"));
      let pdfDoc = await loadingTask.promise;
      addSignatureEditor(pdfDoc.annotationStorage);
      const otherData = await DefaultFileReaderFactory.fetch({
        path: TEST_PDFS_PATH + "annotation-highlight-without-appearance.pdf",
      });

      const data = await pdfDoc.extractPages(
        [{ document: null }, { document: otherData }],
        null,
        { flatten: true }
      );
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(pdfDoc.numPages).toEqual(3);
      expect(await pdfDoc.getFieldObjects()).toBeNull();

      // Page 1: 3 fields and a signature. Page 3: highlight plus nested Form.
      const expectedFormsCount = [4, 8, 2];
      for (let i = 1; i <= 3; i++) {
        const page = await pdfDoc.getPage(i);
        expect(await page.getAnnotations({ intent: "any" }))
          .withContext(`Page ${i}`)
          .toEqual([]);
        const { fnArray } = await page.getOperatorList({
          annotationMode: AnnotationMode.DISABLE,
        });
        expect(fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length)
          .withContext(`Page ${i}`)
          .toEqual(expectedFormsCount[i - 1]);
      }

      await loadingTask.destroy();
    });

    it("write a new signature in an encrypted pdf, extract the pages flattened and check that the signature is drawn in the page content", async function () {
      const password = "asdfasdf";
      let loadingTask = getDocument(
        buildGetDocumentParams("pr6531_2.pdf", { password })
      );
      let pdfDoc = await loadingTask.promise;
      addSignatureEditor(pdfDoc.annotationStorage);

      const data = await pdfDoc.extractPages([{ document: null }], null, {
        flatten: true,
      });
      await loadingTask.destroy();

      expect(data).not.toBeNull();
      expect(bytesToString(data)).toContain("/Encrypt");

      loadingTask = getDocument({ data, password });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(fnArray).toContain(OPS.paintFormXObjectBegin);
      expect(fnArray).toContain(OPS.constructPath);

      await loadingTask.destroy();
    });

    it("extract the pages flattened of an encrypted pdf after the excluded ones of another pdf and check that the password is the one of the encrypted pdf", async function () {
      const password = "asdfasdf";
      let loadingTask = getDocument(buildGetDocumentParams("empty.pdf"));
      let pdfDoc = await loadingTask.promise;
      const encryptedData = await DefaultFileReaderFactory.fetch({
        path: TEST_PDFS_PATH + "pr6531_2.pdf",
      });

      const data = await pdfDoc.extractPages(
        [
          { document: null, excludePages: [0] },
          { document: encryptedData, password },
        ],
        null,
        { flatten: true }
      );
      await loadingTask.destroy();

      expect(data).not.toBeNull();
      // Only the encrypted source contributes pages.
      expect(bytesToString(data)).toContain("/Encrypt");

      loadingTask = getDocument({ data, password });
      pdfDoc = await loadingTask.promise;
      expect(pdfDoc.numPages).toEqual(1);

      await loadingTask.destroy();
    });

    it("save the pdf flattened without any modification and check that the annotations are drawn in the page content", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("issue14438.pdf"));
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      // Popups are removed with their parents; ink without Rect is kept.
      const annotations = await page.getAnnotations({ intent: "any" });
      expect(annotations.map(({ id }) => id)).toEqual([
        "63R",
        "66R",
        "69R",
        "72R",
      ]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(
        fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
      ).toEqual(14);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the popup of a drawn annotation is removed, even without parent", async function () {
      const appearance = "0 0 10 10 re f";
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
            "/Annots [4 0 R 5 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Annot /Subtype /Square /F 4 /Rect [0 0 10 10] " +
            "/Contents (Note) /Popup 5 0 R /AP << /N 6 0 R >> >>\nendobj\n",
          "5 0 obj\n<< /Type /Annot /Subtype /Popup /Rect [20 20 60 60] >>\n" +
            "endobj\n",
          "6 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(await pdfDoc.getAnnotArray(0)).toEqual([]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that an annotation with an overflowing rectangle is kept", async function () {
      const appearance = "0 0 10 10 re f";
      const originalData = assemblePdf([
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
          "/Annots [4 0 R] >>\nendobj\n",
        // The rectangle coordinate overflows to Infinity.
        "4 0 obj\n<< /Type /Annot /Subtype /Square /F 4 " +
          `/Rect [0 0 ${"9".repeat(400)} 10] /AP << /N 5 0 R >> >>\nendobj\n`,
        "5 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
          `/Length ${appearance.length} >>\n` +
          `stream\n${appearance}\nendstream\nendobj\n`,
      ]);
      const loadingTask = getDocument({ data: originalData.slice() });
      const pdfDoc = await loadingTask.promise;

      // Keep the annotation rather than serialize nonfinite coordinates.
      const data = await pdfDoc.saveDocument({ flatten: true });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });

    it("save a pdf with an inline page flattened and check that the page is kept", async function () {
      const appearance = "0 0 10 10 re f";
      const originalData = assemblePdf([
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Count 1 /Kids [<< /Type /Page " +
          "/Parent 2 0 R /MediaBox [0 0 100 100] /Annots [3 0 R] >>] >>\n" +
          "endobj\n",
        "3 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 /Rect [0 0 10 10] " +
          "/AP << /N 4 0 R >> >>\nendobj\n",
        "4 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
          `/Length ${appearance.length} >>\n` +
          `stream\n${appearance}\nendstream\nendobj\n`,
      ]);
      const loadingTask = getDocument({ data: originalData.slice() });
      const pdfDoc = await loadingTask.promise;

      // Flattening skips direct page dictionaries.
      const data = await pdfDoc.saveDocument({ flatten: true });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that an annotation which can't be read is kept", async function () {
      const appearance = "0 0 10 10 re f";
      const pdf = bytesToString(
        assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
            "/Annots [4 0 R 5 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Annot /Subtype /Stamp /F 7 0 R " +
            "/Rect [0 0 10 10] /AP << /N 6 0 R >> >>\nendobj\n",
          "5 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 /Rect [20 20 30 30] " +
            "/AP << /N 6 0 R >> >>\nendobj\n",
          "6 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
          "7 0 obj\n4\nendobj\n",
        ])
      );
      // Point the flags object's xref entry into the PDF header.
      const offset = pdf.indexOf("7 0 obj").toString().padStart(10, "0");
      let loadingTask = getDocument({
        data: stringToBytes(
          pdf.replace(`${offset} 00000 n \n`, "0000000002 00000 n \n")
        ),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      expect(await pdfDoc.getAnnotArray(0)).toEqual(["4R"]);
      const page = await pdfDoc.getPage(1);
      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(
        fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
      ).toEqual(1);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that an appearance without BBox or with an empty one is drawn as when rendering", async function () {
      for (const bbox of ["", "/BBox [0 0 0 0] "]) {
        const appearance = "1 0 0 rg 0 0 25 25 re f";
        let loadingTask = getDocument({
          data: assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
              "/Annots [4 0 R] >>\nendobj\n",
            "4 0 obj\n<< /Type /Annot /Subtype /Square /F 4 " +
              "/Rect [10 10 60 60] /AP << /N 5 0 R >> >>\nendobj\n",
            `5 0 obj\n<< /Type /XObject /Subtype /Form ${bbox}` +
              `/Length ${appearance.length} >>\n` +
              `stream\n${appearance}\nendstream\nendobj\n`,
          ]),
        });
        let pdfDoc = await loadingTask.promise;

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        // Translate without scaling; give the Form BBox the annotation's size.
        const savedString = bytesToString(data);
        expect(savedString).toContain("q 1 0 0 1 10 10 cm /FlatAnnot0 Do Q");
        expect(savedString).toContain("/BBox [0 0 50 50]");

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that an annotation without appearance is drawn in the page content", async function () {
      let loadingTask = getDocument(
        buildGetDocumentParams("annotation-highlight-without-appearance.pdf")
      );
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      // The appearance and its nested Form XObject both have a BBox.
      const savedString = bytesToString(data);
      expect(savedString.match(/\/Subtype \/Form/g).length).toEqual(2);
      expect(savedString.match(/\/BBox/g).length).toEqual(2);

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(
        fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
      ).toEqual(2);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the annotations are drawn from the initial graphics state", async function () {
      // Unmatched Qs, followed by unclosed saves, a clip, hidden marked content
      // and a text object.
      let loadingTask = getDocument({
        data: buildStampedPagePdf(
          "Q 1 0 0 1 100 100 cm Q BT /F1 10 Tf (Page) Tj ET " +
            "q 1 0 0 1 100 100 cm q 0 0 1 1 re W n /OC /OC1 BDC BT"
        ),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      const savedString = bytesToString(data);
      // The unmatched restores are replaced by spaces.
      expect(savedString).toContain(
        "\n  1 0 0 1 100 100 cm   BT /F1 10 Tf (Page) Tj ET q "
      );
      expect(savedString).toContain("stream\nq\n\nendstream");
      expect(savedString).toContain(
        "\nET\nEMC\nQ\nQ\nQ\nq 1 0 0 1 10 10 cm /FlatAnnot0 Do Q\n"
      );

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent({
        includeMarkedContent: true,
      });
      // Preserve page text placement; place the annotation outside the OCG.
      expect(items.map(({ type, str }) => type ?? str)).toEqual([
        "Page",
        "beginMarkedContentProps",
        "endMarkedContent",
        "Hello",
      ]);
      expect(items[0].transform).toEqual([10, 0, 0, 10, 100, 100]);
      expect(items[3].transform).toEqual([10, 0, 0, 10, 10, 10]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the unmatched restores around an inline image are removed", async function () {
      let loadingTask = getDocument({
        data: buildStampedPagePdf(
          "Q 1 0 0 1 100 100 cm Q BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI Q " +
            "BT /F1 10 Tf (Page) Tj ET"
        ),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      expect(bytesToString(data)).toContain(
        "\n  1 0 0 1 100 100 cm   BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI   BT "
      );

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent();
      expect(
        items.map(({ str, transform }) => [str, transform[4], transform[5]])
      ).toEqual([
        ["Page", 100, 100],
        ["Hello", 10, 10],
      ]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that only the unmatched restores outside of the operands are removed", async function () {
      // Preserve matched Q and dictionary q/Q; remove the two unmatched Qs.
      let loadingTask = getDocument({
        data: buildStampedPagePdf(
          "q 1 0 0 1 0 0 cm Q Q /P <</MCID 0 /A q /B Q>> BDC [3] 0 d " +
            "BT /F1 10 Tf 100 100 Td (Page) Tj ET EMC Q"
        ),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      expect(bytesToString(data)).toContain(
        "stream\nq 1 0 0 1 0 0 cm Q   /P <</MCID 0 /A q /B Q>> BDC [3] 0 d " +
          "BT /F1 10 Tf 100 100 Td (Page) Tj ET EMC  \nendstream"
      );

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { items } = await page.getTextContent();
      expect(
        items.map(({ str, transform }) => [str, transform[4], transform[5]])
      ).toEqual([
        ["Page", 100, 100],
        ["Hello", 10, 10],
      ]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the annotations are kept when the page content can't be parsed", async function () {
      // EvaluatorPreprocessor rejects more than 33 operands before an operator.
      const originalData = buildStampedPagePdf(`${"0 ".repeat(34)}m`);
      const loadingTask = getDocument({ data: originalData.slice() });
      const pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the page content streams in a direct or an indirect array are kept", async function () {
      for (const indirect of [false, true]) {
        const streamObject = (num, content, dict = "") =>
          `${num} 0 obj\n<< ${dict}/Length ${content.length} >>\n` +
          `stream\n${content}\nendstream\nendobj\n`;
        let loadingTask = getDocument({
          data: assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
              "/Resources << /Font << /F1 4 0 R >> >> " +
              `/Contents ${indirect ? "9 0 R" : "[5 0 R 6 0 R]"} ` +
              "/Annots [7 0 R] >>\nendobj\n",
            "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
              "endobj\n",
            streamObject(5, "BT /F1 10 Tf 100 100 Td (Page1) Tj ET"),
            streamObject(6, "BT /F1 10 Tf 100 120 Td (Page2) Tj ET"),
            "7 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 " +
              "/Rect [10 10 60 60] /AP << /N 8 0 R >> >>\nendobj\n",
            streamObject(
              8,
              "BT /F1 10 Tf (Hello) Tj ET",
              "/Type /XObject /Subtype /Form /BBox [0 0 50 50] " +
                "/Resources << /Font << /F1 4 0 R >> >> "
            ),
            "9 0 obj\n[5 0 R 6 0 R]\nendobj\n",
          ]),
        });
        let pdfDoc = await loadingTask.promise;

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        // Keep both content streams between the save and appearance streams.
        expect(bytesToString(data)).toMatch(
          /\/Contents \[\d+ 0 R 5 0 R 6 0 R \d+ 0 R\]/
        );

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

        const { items } = await page.getTextContent();
        expect(
          items.map(({ str, transform }) => [str, transform[4], transform[5]])
        ).toEqual([
          ["Page1", 100, 100],
          ["Page2", 100, 120],
          ["Hello", 10, 10],
        ]);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that a page which can't be flattened is kept with the form", async function () {
      const appearance = "BT /F1 10 Tf (Hello) Tj ET";
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 9 0 R " +
            "/AcroForm << /Fields [7 0 R] >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/StructParents 0 /Annots [6 0 R 7 0 R] >>\nendobj\n",
          "4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/Annots [8 0 R] >>\nendobj\n",
          "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          "6 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 " +
            "/Rect [10 10 60 60] /AP << /N 11 0 R >> >>\nendobj\n",
          "7 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (Text) " +
            "/V (Value) /F 4 /Rect [10 100 60 150] /AP << /N 11 0 R >> >>\n" +
            "endobj\n",
          "8 0 obj\n<< /Type /Annot /Subtype /Stamp /F 4 " +
            "/Rect [10 10 60 60] /AP << /N 11 0 R >> >>\nendobj\n",
          "9 0 obj\n<< /Type /StructTreeRoot " +
            "/ParentTree << /Nums [0 10 0 R] >> >>\nendobj\n",
          // Xref entry 10 points to object 99, so fetching 10R fails.
          "99 0 obj\n[]\nendobj\n",
          "11 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 50 50] " +
            "/Resources << /Font << /F1 5 0 R >> >> " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      // The failing page keeps its annotations, hence the form.
      expect([...(await pdfDoc.getFieldObjects()).keys()]).toEqual(["Text"]);
      const [page1, page2] = await Promise.all([
        pdfDoc.getPage(1),
        pdfDoc.getPage(2),
      ]);
      expect(
        (await page1.getAnnotations({ intent: "any" })).map(({ id }) => id)
      ).toEqual(["6R", "7R"]);
      expect((await page1.getTextContent()).items).toEqual([]);

      expect(await page2.getAnnotations({ intent: "any" })).toEqual([]);
      const { items } = await page2.getTextContent();
      expect(items.map(({ str }) => str)).toEqual(["Hello"]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that the resources of the content stream are kept", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("issue18894.pdf"));
      let pdfDoc = await loadingTask.promise;
      // Stream-level /Resources take precedence over page resources.
      addSignatureEditor(pdfDoc.annotationStorage);

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(
        fnArray.filter(fn => fn === OPS.paintFormXObjectBegin).length
      ).toEqual(3);

      await loadingTask.destroy();
    });

    it("save an unmodified pure xfa pdf flattened and check that it's unchanged", async function () {
      const loadingTask = getDocument(
        buildGetDocumentParams("xfa_issue14315.pdf", { enableXfa: true })
      );
      const pdfDoc = await loadingTask.promise;
      expect(pdfDoc.isPureXfa).toEqual(true);
      const originalData = await pdfDoc.getData();

      const data = await pdfDoc.saveDocument({ flatten: true });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });

    it("save the pdf flattened without anything to flatten and check that the form is kept", async function () {
      for (const filename of ["signed_verified.pdf", "xfa_issue14315.pdf"]) {
        const loadingTask = getDocument(buildGetDocumentParams(filename));
        const pdfDoc = await loadingTask.promise;
        const originalData = await pdfDoc.getData();

        const data = await pdfDoc.saveDocument({ flatten: true });
        expect(data).toEqual(originalData);

        await loadingTask.destroy();
      }
    });

    it("save a signed pdf flattened and check that the signature is kept", async function () {
      let loadingTask = getDocument(buildGetDocumentParams("issue16553.pdf"));
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      // Remove the page widget, retaining the signature field.
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
      expect((await pdfDoc.getSignatures()).length).toEqual(1);

      await loadingTask.destroy();
    });

    it("extract the pages flattened after deleting an annotation and check that it's removed", async function () {
      let loadingTask = getDocument(
        buildGetDocumentParams("highlight_popup.pdf")
      );
      let pdfDoc = await loadingTask.promise;
      pdfDoc.annotationStorage.setValue("pdfjs_internal_editor_0", {
        deleted: true,
        id: "24R",
        pageIndex: 0,
        popupRef: "25R",
      });

      const data = await pdfDoc.extractPages([{ document: null }], null, {
        flatten: true,
      });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

      const { fnArray } = await page.getOperatorList({
        annotationMode: AnnotationMode.DISABLE,
      });
      expect(fnArray).not.toContain(OPS.paintFormXObjectBegin);

      await loadingTask.destroy();
    });

    it("extract the pages flattened after editing an annotation and check that it's replaced as when saving", async function () {
      const getEditedData = async method => {
        const loadingTask = getDocument(
          buildGetDocumentParams("issue14438.pdf")
        );
        const pdfDoc = await loadingTask.promise;
        pdfDoc.annotationStorage.setValue("pdfjs_internal_editor_0", {
          annotationType: AnnotationEditorType.FREETEXT,
          rect: [12, 34, 56, 78],
          rotation: 0,
          fontSize: 10,
          color: [0, 0, 0],
          value: "Hello PDF.js World!",
          pageIndex: 0,
          id: "10R",
        });
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument({ flatten: true })
            : await pdfDoc.extractPages([{ document: null }], null, {
                flatten: true,
              });
        await loadingTask.destroy();
        return data;
      };
      const getPageData = async data => {
        const loadingTask = getDocument({ data });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        const annotations = await page.getAnnotations({ intent: "any" });
        const { fnArray } = await page.getOperatorList({
          annotationMode: AnnotationMode.DISABLE,
        });
        await loadingTask.destroy();
        return {
          annotations: annotations.map(({ subtype, textContent }) => ({
            subtype,
            textContent,
          })),
          formsCount: fnArray.filter(fn => fn === OPS.paintFormXObjectBegin)
            .length,
        };
      };

      expect(await getPageData(await getEditedData("extractPages"))).toEqual(
        await getPageData(await getEditedData("saveDocument"))
      );
    });

    it("saveDocument and extractPages use edited annotation flags when flattening", async function () {
      for (const method of ["saveDocument", "extractPages"]) {
        let loadingTask = getDocument({
          data: buildAnnotatedPagePdf([
            ["Missing flags", "/Subtype /FreeText"],
            ["Screen only", "/Subtype /FreeText /F 0"],
            ["Printable", "/Subtype /FreeText /F 4"],
          ]),
        });
        let pdfDoc = await loadingTask.promise;
        for (let i = 0; i < 3; i++) {
          pdfDoc.annotationStorage.setValue(`pdfjs_internal_editor_${i}`, {
            annotationType: AnnotationEditorType.FREETEXT,
            id: `${2 * i + 5}R`,
            rect: [0, 20 * i, 100, 20 * i + 20],
            rotation: 0,
            fontSize: 10,
            color: [0, 0, 0],
            value: `Edited${i}`,
            pageIndex: 0,
          });
        }

        // Saving adds the print flag when /F is absent, but preserves /F 0.
        const options = { flatten: true };
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument(options)
            : await pdfDoc.extractPages([{ document: null }], null, options);
        await loadingTask.destroy();

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        const annotations = await page.getAnnotations({ intent: "any" });
        expect(
          annotations.map(({ annotationFlags }) => annotationFlags)
        ).toEqual([0]);
        const { items } = await page.getTextContent();
        expect(items.map(({ str }) => str).filter(Boolean)).toEqual([
          "Edited0",
          "Edited2",
        ]);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that a widget without field type is drawn with its appearance", async function () {
      const appearance = "BT /F1 10 Tf 2 5 Td (Square) Tj ET";
      let loadingTask = getDocument({
        data: assemblePdf([
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /AcroForm << " +
            "/Fields [4 0 R] /NeedAppearances true /DA (/F1 12 Tf 0 g) " +
            "/DR << /Font << /F1 5 0 R >> >> >> >>\nendobj\n",
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/Annots [4 0 R] >>\nendobj\n",
          // Without /FT, use the existing appearance instead of /V.
          "4 0 obj\n<< /Type /Annot /Subtype /Widget /T (NoType) /V (Value) " +
            "/F 4 /Rect [0 0 100 20] /AP << /N 6 0 R >> >>\nendobj\n",
          "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
            "endobj\n",
          "6 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 100 20] " +
            "/Resources << /Font << /F1 5 0 R >> >> " +
            `/Length ${appearance.length} >>\n` +
            `stream\n${appearance}\nendstream\nendobj\n`,
        ]),
      });
      let pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      await loadingTask.destroy();

      loadingTask = getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(1);
      expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
      const { items } = await page.getTextContent();
      expect(items.map(({ str }) => str)).toEqual(["Square"]);

      await loadingTask.destroy();
    });

    it("save the pdf flattened and check that an unchecked checkbox leaves the expected text", async function () {
      for (const [state, entries, value, expected] of [
        [
          "unchecked by its value",
          "/V /Off /AP << /N << /Yes 6 0 R /Off 7 0 R >> >>",
          undefined,
          ["Off"],
        ],
        [
          "unchecked in the storage",
          "/V /Yes /AS /Yes /AP << /N << /Yes 6 0 R /Off 7 0 R >> >>",
          false,
          ["Off"],
        ],
        [
          "unchecked without an off appearance",
          "/V /Off /AP << /N << /Yes 6 0 R >> >>",
          undefined,
          [],
        ],
      ]) {
        const appearance = text => {
          const content = `BT /F1 10 Tf 2 5 Td (${text}) Tj ET`;
          return (
            "<< /Type /XObject /Subtype /Form /BBox [0 0 20 20] " +
            "/Resources << /Font << /F1 5 0 R >> >> " +
            `/Length ${content.length} >>\nstream\n${content}\nendstream`
          );
        };
        let loadingTask = getDocument({
          data: assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R " +
              "/AcroForm << /Fields [4 0 R] >> >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
              "/Annots [4 0 R] >>\nendobj\n",
            "4 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Btn /T (Check) " +
              `/F 4 /Rect [0 0 20 20] ${entries} >>\nendobj\n`,
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
              "endobj\n",
            `6 0 obj\n${appearance("Yes")}\nendobj\n`,
            `7 0 obj\n${appearance("Off")}\nendobj\n`,
          ]),
        });
        let pdfDoc = await loadingTask.promise;
        if (value !== undefined) {
          pdfDoc.annotationStorage.setValue("4R", { value });
        }

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        expect(await pdfDoc.getFieldObjects()).toBeNull();
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
        const { items } = await page.getTextContent();
        expect(items.map(({ str }) => str))
          .withContext(state)
          .toEqual(expected);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that a checked checkbox without appearance state or without appearance is drawn", async function () {
      for (const hasAppearance of [true, false]) {
        const appearance = text => {
          const content = `BT /F1 10 Tf 2 5 Td (${text}) Tj ET`;
          return (
            "<< /Type /XObject /Subtype /Form /BBox [0 0 20 20] " +
            "/Resources << /Font << /F1 5 0 R >> >> " +
            `/Length ${content.length} >>\nstream\n${content}\nendstream`
          );
        };
        let loadingTask = getDocument({
          data: assemblePdf([
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R " +
              "/AcroForm << /Fields [4 0 R] >> >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] " +
              "/Annots [4 0 R] >>\nendobj\n",
            // /V selects the checked state; /AS is absent.
            "4 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Btn /T (Check) " +
              "/V /Yes /F 4 /Rect [0 0 20 20]" +
              `${hasAppearance ? " /AP << /N << /Yes 6 0 R /Off 7 0 R >> >>" : ""} >>\nendobj\n`,
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n" +
              "endobj\n",
            `6 0 obj\n${appearance("Yes")}\nendobj\n`,
            `7 0 obj\n${appearance("Off")}\nendobj\n`,
          ]),
        });
        let pdfDoc = await loadingTask.promise;

        const data = await pdfDoc.saveDocument({ flatten: true });
        await loadingTask.destroy();

        const savedString = bytesToString(data);
        if (!hasAppearance) {
          // Serialize ZapfDingbats rather than the in-memory fallback font.
          expect(savedString).toContain(
            "<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats>>"
          );
          expect(savedString).not.toContain("FallbackType");
        }

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);
        const { fnArray } = await page.getOperatorList({
          annotationMode: AnnotationMode.DISABLE,
        });
        expect(fnArray).toContain(OPS.paintFormXObjectBegin);
        if (hasAppearance) {
          const { items } = await page.getTextContent();
          expect(items.map(({ str }) => str)).toEqual(["Yes"]);
        }

        await loadingTask.destroy();
      }
    });

    it("saveDocument and extractPages flatten a push button shown or hidden by a script", async function () {
      for (const [method, hidden] of [
        ["saveDocument", false],
        ["saveDocument", true],
        ["extractPages", false],
        ["extractPages", true],
      ]) {
        let loadingTask = getDocument({
          data: buildAnnotatedPagePdf([
            ["Print", "/Subtype /Widget /FT /Btn /Ff 65536 /T (Print) /F 4"],
          ]),
        });
        let pdfDoc = await loadingTask.promise;
        pdfDoc.annotationStorage.setValue("5R", {
          noView: hidden,
          noPrint: hidden,
        });

        const options = { flatten: true };
        const data =
          method === "saveDocument"
            ? await pdfDoc.saveDocument(options)
            : await pdfDoc.extractPages([{ document: null }], null, options);
        await loadingTask.destroy();

        loadingTask = getDocument({ data });
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        expect(await page.getAnnotations({ intent: "any" })).toEqual([]);

        const { items } = await page.getTextContent();
        expect(items.map(({ str }) => str)).toEqual(hidden ? [] : ["Print"]);

        await loadingTask.destroy();
      }
    });

    it("save the pdf flattened and check that the annotations which aren't rendered are kept", async function () {
      const originalData = buildAnnotatedPagePdf([
        // Unsupported barcode widget.
        ["123", "/Subtype /Widget /FT /Tx /T (Code) /V (123) /PMD << >> /F 4"],
        // A highlight without QuadPoints.
        ["Highlight", "/Subtype /Highlight /F 4"],
        // An unknown annotation type with the Invisible flag.
        ["Unknown", "/Subtype /Unknown /F 5"],
      ]);
      const loadingTask = getDocument({ data: originalData.slice() });
      const pdfDoc = await loadingTask.promise;

      const data = await pdfDoc.saveDocument({ flatten: true });
      expect(data).toEqual(originalData);

      await loadingTask.destroy();
    });
  });
});
