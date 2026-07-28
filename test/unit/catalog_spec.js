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

import { Dict, Name, Ref } from "../../src/core/primitives.js";
import { BoundedXRefMock } from "./test_utils.js";
import { Catalog } from "../../src/core/catalog.js";
import { FormatError } from "../../src/shared/util.js";

describe("Catalog", function () {
  class CatalogXRefMock extends BoundedXRefMock {
    #catalogObj = null;

    constructor(entries, catalogObj) {
      super(entries);
      this.#catalogObj = catalogObj;

      for (const { data } of entries) {
        data.assignXref(this);
      }
      catalogObj?.assignXref(this);
    }

    getCatalogObj() {
      return this.#catalogObj;
    }
  }

  function makeCatalog(entries) {
    const topPagesDict = new Dict();
    topPagesDict.set("Type", Name.get("Pages"));
    topPagesDict.set("Kids", []);
    topPagesDict.set("Count", 0);

    const catDict = new Dict();
    catDict.set("Type", Name.get("Catalog"));
    catDict.set("Pages", topPagesDict);

    const xref = new CatalogXRefMock(entries, catDict);
    return new Catalog(/* pdfManager = */ null, xref);
  }

  describe("getPageIndex", function () {
    it("should reject a circular `Parent` chain", async function () {
      // The page and its parent reference each other, and both `Kids` arrays
      // are consistent with that, hence walking up the tree never terminates.
      const pageRef = Ref.get(4, 0);
      const pagesRef = Ref.get(5, 0);

      const pageDict = new Dict();
      pageDict.set("Type", Name.get("Page"));
      pageDict.set("Parent", pagesRef);
      pageDict.set("Kids", [pagesRef]);

      const pagesDict = new Dict();
      pagesDict.set("Type", Name.get("Pages"));
      pagesDict.set("Parent", pageRef);
      pagesDict.set("Kids", [pageRef]);
      pagesDict.set("Count", 1);

      const catalog = makeCatalog([
        { ref: pageRef, data: pageDict },
        { ref: pagesRef, data: pagesDict },
      ]);

      await expectAsync(catalog.getPageIndex(pageRef)).toBeRejectedWithError(
        FormatError,
        "Pages tree contains circular reference."
      );
    });
  });

  describe("parseDestDictionary", function () {
    function makeStructElements(entries) {
      const xref = new BoundedXRefMock(entries);
      for (const { data } of entries) {
        data.assignXref(xref);
      }
      return xref;
    }

    it("should handle a circular `K` chain in the `SE` entry", function () {
      const seRef = Ref.get(5, 0);
      const kidRef = Ref.get(6, 0);

      // Neither element provides a `Pg` entry, hence the descendants of the
      // structure element are all visited before giving up.
      const seDict = new Dict();
      seDict.set("S", Name.get("Sect"));
      seDict.set("K", [kidRef]);

      const kidDict = new Dict();
      kidDict.set("S", Name.get("Sect"));
      kidDict.set("K", [seRef]);

      const xref = makeStructElements([
        { ref: seRef, data: seDict },
        { ref: kidRef, data: kidDict },
      ]);

      const destDict = new Dict(xref);
      destDict.set("SE", seRef);

      const resultObj = {};
      Catalog.parseDestDictionary({ destDict, resultObj });
      expect(resultObj.dest).toBeUndefined();
      // `parseDestDictionary` swallows errors from the `SE` parsing, hence the
      // number of fetches is what actually proves that the cycle was detected.
      expect(xref.fetchCount).toBeLessThan(10);
    });

    it("should handle a circular single-reference `K` chain", function () {
      const seRef = Ref.get(5, 0);
      const kidRef = Ref.get(6, 0);

      const seDict = new Dict();
      seDict.set("S", Name.get("Sect"));
      seDict.set("K", kidRef);

      const kidDict = new Dict();
      kidDict.set("S", Name.get("Sect"));
      kidDict.set("K", seRef);

      const xref = makeStructElements([
        { ref: seRef, data: seDict },
        { ref: kidRef, data: kidDict },
      ]);

      const destDict = new Dict(xref);
      destDict.set("SE", seRef);

      const resultObj = {};
      Catalog.parseDestDictionary({ destDict, resultObj });
      expect(resultObj.dest).toBeUndefined();
      expect(xref.fetchCount).toBeLessThan(10);
    });

    it("should find the page of a nested `SE` entry", function () {
      const seRef = Ref.get(5, 0);
      const kidRef = Ref.get(6, 0);
      const grandKidRef = Ref.get(7, 0);
      const pageRef = Ref.get(8, 0);

      const seDict = new Dict();
      seDict.set("S", Name.get("Sect"));
      seDict.set("K", [kidRef]);

      // Only the grand-kid provides a `Pg` entry, hence the descendants must
      // actually be enqueued and visited to find it.
      const kidDict = new Dict();
      kidDict.set("S", Name.get("Sect"));
      kidDict.set("K", [grandKidRef]);

      const grandKidDict = new Dict();
      grandKidDict.set("S", Name.get("P"));
      grandKidDict.set("Pg", pageRef);

      const xref = makeStructElements([
        { ref: seRef, data: seDict },
        { ref: kidRef, data: kidDict },
        { ref: grandKidRef, data: grandKidDict },
      ]);

      const destDict = new Dict(xref);
      destDict.set("SE", seRef);

      const resultObj = {};
      Catalog.parseDestDictionary({ destDict, resultObj });
      expect(resultObj.dest).toEqual([
        pageRef,
        { name: "XYZ" },
        null,
        null,
        null,
      ]);
    });
  });
});
