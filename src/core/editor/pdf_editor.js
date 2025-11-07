/* Copyright 2025 Mozilla Foundation
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

/** @typedef {import("../document.js").PDFDocument} PDFDocument */
/** @typedef {import("../document.js").Page} Page */
/** @typedef {import("../xref.js").XRef} XRef */

import { Dict, isName, Ref, RefSetCache } from "../primitives.js";
import { getModificationDate, stringToPDFString } from "../../shared/util.js";
import { incrementalUpdate, writeValue } from "../writer.js";
import { BaseStream } from "../base_stream.js";
import { StringStream } from "../stream.js";
import { stringToAsciiOrUTF16BE } from "../core_utils.js";

const MAX_LEAVES_PER_PAGES_NODE = 16;
const MAX_IN_NAME_TREE_NODE = 64;

class PageData {
  constructor(page, documentData) {
    this.page = page;
    this.documentData = documentData;
    this.annotations = null;

    documentData.pagesMap.put(page.ref, this);
  }
}

class DocumentData {
  constructor(document) {
    this.document = document;
    this.pageLabels = null;
    this.pagesMap = new RefSetCache();
    this.oldRefMapping = new RefSetCache();
  }
}

class PDFEditor {
  constructor({ useObjectStreams = true, title = "", author = "" } = {}) {
    this.hasSingleFile = false;
    this.currentDocument = null;
    this.oldPages = [];
    this.newPages = [];
    this.xref = [null];
    this.newRefCount = 1;
    [this.rootRef, this.rootDict] = this.newDict;
    [this.infoRef, this.infoDict] = this.newDict;
    [this.pagesRef, this.pagesDict] = this.newDict;
    this.namesDict = null;
    this.useObjectStreams = useObjectStreams;
    this.objStreamRefs = useObjectStreams ? new Set() : null;
    this.version = "1.7";
    this.title = title;
    this.author = author;
    this.pageLabels = null;
  }

  /**
   * Get a new reference for an object in the PDF.
   * @returns {Ref}
   */
  get newRef() {
    const ref = Ref.get(this.newRefCount++, 0);
    return ref;
  }

  /**
   * Create a new dictionary and its reference.
   * @returns {[Ref, Dict]}
   */
  get newDict() {
    const ref = this.newRef;
    const dict = (this.xref[ref.num] = new Dict());
    return [ref, dict];
  }

  /**
   * Clone an object in the PDF.
   * @param {*} obj
   * @param {XRef} xref
   * @returns {Promise<Ref>}
   */
  async #cloneObject(obj, xref) {
    const ref = this.newRef;
    this.xref[ref.num] = await this.#collectDependencies(obj, true, xref);
    return ref;
  }

  /**
   * Collect the dependencies of an object and create new references for each
   * dependency.
   * @param {*} obj
   * @param {boolean} mustClone
   * @param {XRef} xref
   * @returns {Promise<*>}
   */
  async #collectDependencies(obj, mustClone, xref) {
    if (obj instanceof Ref) {
      const {
        currentDocument: { oldRefMapping },
      } = this;
      let newRef = oldRefMapping.get(obj);
      if (newRef) {
        return newRef;
      }
      newRef = this.newRef;
      oldRefMapping.put(obj, newRef);
      obj = await xref.fetchAsync(obj);

      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
        if (
          obj instanceof Dict &&
          isName(obj.get("Type"), "Page") &&
          !this.currentDocument.pagesMap.has(obj)
        ) {
          throw new Error(
            "Add a deleted page to the document is not supported."
          );
        }
      }

      this.xref[newRef.num] = await this.#collectDependencies(obj, true, xref);
      return newRef;
    }
    const promises = [];
    if (Array.isArray(obj)) {
      if (mustClone) {
        obj = obj.slice();
      }
      for (let i = 0, ii = obj.length; i < ii; i++) {
        promises.push(
          this.#collectDependencies(obj[i], true, xref).then(
            newObj => (obj[i] = newObj)
          )
        );
      }
      await Promise.all(promises);
      return obj;
    }
    let dict;
    if (obj instanceof BaseStream) {
      ({ dict } = obj = obj.getOriginalStream().clone());
    } else if (obj instanceof Dict) {
      if (mustClone) {
        obj = obj.clone();
      }
      dict = obj;
    }
    if (dict) {
      for (const [key, rawObj] of dict.getRawEntries()) {
        promises.push(
          this.#collectDependencies(rawObj, true, xref).then(newObj =>
            dict.set(key, newObj)
          )
        );
      }
      await Promise.all(promises);
    }

    return obj;
  }

  /**
   * @typedef {Object} PageInfo
   * @property {PDFDocument} document
   * @property {Array<Array<number>|number>} [includePages]
   *  included ranges (inclusive) or indices.
   * @property {Array<Array<number>|number>} [excludePages]
   *  excluded ranges (inclusive) or indices.
   */

  /**
   * Extract pages from the given documents.
   * @param {Array<PageInfo>} pageInfos
   * @return {Promise<void>}
   */
  async extractPages(pageInfos) {
    const promises = [];
    let newIndex = 0;
    this.hasSingleFile = pageInfos.length === 1;
    for (const { document, includePages, excludePages } of pageInfos) {
      if (!document) {
        continue;
      }
      const documentData = new DocumentData(document);
      promises.push(this.#collectDocumentData(documentData));
      let keptIndices, keptRanges, deletedIndices, deletedRanges;
      for (const page of includePages || []) {
        if (Array.isArray(page)) {
          (keptRanges ||= []).push(page);
        } else {
          (keptIndices ||= new Set()).add(page);
        }
      }
      for (const page of excludePages || []) {
        if (Array.isArray(page)) {
          (deletedRanges ||= []).push(page);
        } else {
          (deletedIndices ||= new Set()).add(page);
        }
      }
      for (let i = 0, ii = document.numPages; i < ii; i++) {
        if (deletedIndices?.has(i)) {
          continue;
        }
        if (deletedRanges) {
          let isDeleted = false;
          for (const [start, end] of deletedRanges) {
            if (i >= start && i <= end) {
              isDeleted = true;
              break;
            }
          }
          if (isDeleted) {
            continue;
          }
        }

        let takePage = false;
        if (keptIndices) {
          takePage = keptIndices.has(i);
        }
        if (!takePage && keptRanges) {
          for (const [start, end] of keptRanges) {
            if (i >= start && i <= end) {
              takePage = true;
              break;
            }
          }
        }
        if (!takePage && !keptIndices && !keptRanges) {
          takePage = true;
        }
        if (!takePage) {
          continue;
        }
        const newPageIndex = newIndex++;
        promises.push(
          document.getPage(i).then(page => {
            this.oldPages[newPageIndex] = new PageData(page, documentData);
          })
        );
      }
    }
    await Promise.all(promises);
    promises.length = 0;

    this.#collectPageLabels();

    for (const page of this.oldPages) {
      promises.push(this.#postCollectPageData(page));
    }
    await Promise.all(promises);

    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      this.newPages[i] = await this.#makePageCopy(i, null);
    }

    return this.writePDF();
  }

  /**
   * Collect the document data.
   * @param {DocumentData} documentData
   * @return {Promise<void>}
   */
  async #collectDocumentData(documentData) {
    const { document } = documentData;
    await document.pdfManager
      .ensureCatalog("rawPageLabels")
      .then(pageLabels => (documentData.pageLabels = pageLabels));
  }

  /**
   * Post process the collected page data.
   * @param {PageData} pageData
   * @returns {Promise<void>}
   */
  async #postCollectPageData(pageData) {
    const {
      page: { xref, annotations },
    } = pageData;

    if (!annotations) {
      return;
    }

    const promises = [];
    let newAnnotations = [];
    let newIndex = 0;

    // TODO: remove only links to deleted pages.
    for (const annotationRef of annotations) {
      const newAnnotationIndex = newIndex++;
      promises.push(
        xref.fetchIfRefAsync(annotationRef).then(async annotationDict => {
          if (!isName(annotationDict.get("Subtype"), "Link")) {
            newAnnotations[newAnnotationIndex] = annotationRef;
          }
        })
      );
    }
    await Promise.all(promises);
    newAnnotations = newAnnotations.filter(annot => !!annot);
    pageData.annotations = newAnnotations.length > 0 ? newAnnotations : null;
  }

  async #collectPageLabels() {
    // We can only preserve page labels when editing a single PDF file.
    // This is consistent with behavior in Adobe Acrobat.
    if (!this.hasSingleFile) {
      return;
    }
    const {
      documentData: { document, pageLabels },
    } = this.oldPages[0];
    if (!pageLabels) {
      return;
    }
    const numPages = document.numPages;
    const oldPageLabels = [];
    const oldPageIndices = new Set(
      this.oldPages.map(({ page: { pageIndex } }) => pageIndex)
    );
    let currentLabel = null;
    let stFirstIndex = -1;
    for (let i = 0; i < numPages; i++) {
      const newLabel = pageLabels.get(i);
      if (newLabel) {
        currentLabel = newLabel;
        stFirstIndex = currentLabel.has("St") ? i : -1;
      }
      if (!oldPageIndices.has(i)) {
        continue;
      }
      if (stFirstIndex !== -1) {
        const st = currentLabel.get("St");
        currentLabel = currentLabel.clone();
        currentLabel.set("St", st + (i - stFirstIndex));
        stFirstIndex = -1;
      }
      oldPageLabels.push(currentLabel);
    }
    currentLabel = oldPageLabels[0];
    let currentIndex = 0;
    const newPageLabels = (this.pageLabels = [[0, currentLabel]]);
    for (let i = 0, ii = oldPageLabels.length; i < ii; i++) {
      const label = oldPageLabels[i];
      if (label === currentLabel) {
        continue;
      }
      currentIndex = i;
      currentLabel = label;
      newPageLabels.push([currentIndex, currentLabel]);
    }
  }

  /**
   * Create a copy of a page.
   * @param {number} pageIndex
   * @returns {Promise<Ref>} the page reference in the new PDF document.
   */
  async #makePageCopy(pageIndex) {
    const { page, documentData, annotations } = this.oldPages[pageIndex];
    this.currentDocument = documentData;
    const { oldRefMapping } = documentData;
    const { xref, rotate, mediaBox, resources, ref: oldPageRef } = page;
    const pageRef = this.newRef;
    const pageDict = (this.xref[pageRef.num] = page.pageDict.clone());
    oldRefMapping.put(oldPageRef, pageRef);

    // No need to keep these entries as we'll set them again later.
    for (const key of [
      "Rotate",
      "MediaBox",
      "CropBox",
      "BleedBox",
      "TrimBox",
      "ArtBox",
      "Resources",
      "Annots",
      "Parent",
      "UserUnit",
    ]) {
      pageDict.delete(key);
    }

    const lastRef = this.newRefCount;
    await this.#collectDependencies(pageDict, false, xref);

    pageDict.set("Rotate", rotate);
    pageDict.set("MediaBox", mediaBox);
    for (const boxName of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
      const box = page.getBoundingBox(boxName);
      if (box?.some((value, index) => value !== mediaBox[index])) {
        // These boxes are optional and their default value is the MediaBox.
        pageDict.set(boxName, box);
      }
    }
    const userUnit = page.userUnit;
    if (userUnit !== 1) {
      pageDict.set("UserUnit", userUnit);
    }
    pageDict.setIfDict(
      "Resources",
      await this.#collectDependencies(resources, true, xref)
    );
    pageDict.setIfArray(
      "Annots",
      await this.#collectDependencies(annotations, true, xref)
    );

    if (this.useObjectStreams) {
      const newLastRef = this.newRefCount;
      const pageObjectRefs = [];
      for (let i = lastRef; i < newLastRef; i++) {
        const obj = this.xref[i];
        if (obj instanceof BaseStream) {
          continue;
        }
        pageObjectRefs.push(Ref.get(i, 0));
      }
      for (let i = 0; i < pageObjectRefs.length; i += 0xffff) {
        const objStreamRef = this.newRef;
        this.objStreamRefs.add(objStreamRef.num);
        this.xref[objStreamRef.num] = pageObjectRefs.slice(i, i + 0xffff);
      }
    }

    this.currentDocument = null;

    return pageRef;
  }

  /**
   * Create the page tree structure.
   */
  #makePageTree() {
    const { newPages: pages, rootDict, pagesRef, pagesDict } = this;
    rootDict.set("Pages", pagesRef);
    pagesDict.setIfName("Type", "Pages");
    pagesDict.set("Count", pages.length);

    const maxLeaves =
      MAX_LEAVES_PER_PAGES_NODE <= 1 ? pages.length : MAX_LEAVES_PER_PAGES_NODE;
    const stack = [{ dict: pagesDict, kids: pages, parentRef: pagesRef }];

    while (stack.length > 0) {
      const { dict, kids, parentRef } = stack.pop();
      if (kids.length <= maxLeaves) {
        dict.set("Kids", kids);
        for (const ref of kids) {
          this.xref[ref.num].set("Parent", parentRef);
        }
        continue;
      }
      const chunkSize = Math.max(maxLeaves, Math.ceil(kids.length / maxLeaves));
      const kidsChunks = [];
      for (let i = 0; i < kids.length; i += chunkSize) {
        kidsChunks.push(kids.slice(i, i + chunkSize));
      }
      const kidsRefs = [];
      dict.set("Kids", kidsRefs);
      for (const chunk of kidsChunks) {
        const [kidRef, kidDict] = this.newDict;
        kidsRefs.push(kidRef);
        kidDict.setIfName("Type", "Pages");
        kidDict.set("Parent", parentRef);
        kidDict.set("Count", chunk.length);
        stack.push({ dict: kidDict, kids: chunk, parentRef: kidRef });
      }
    }
  }

  /**
   * Create a name or number tree from the given map.
   * @param {Array<[string, any]>} map
   * @returns {Ref}
   */
  #makeNameNumTree(map, areNames) {
    const allEntries = map.sort(
      areNames
        ? ([keyA], [keyB]) => keyA.localeCompare(keyB)
        : ([keyA], [keyB]) => keyA - keyB
    );
    const maxLeaves =
      MAX_IN_NAME_TREE_NODE <= 1 ? allEntries.length : MAX_IN_NAME_TREE_NODE;
    const [treeRef, treeDict] = this.newDict;
    const stack = [{ dict: treeDict, entries: allEntries }];
    const valueType = areNames ? "Names" : "Nums";

    while (stack.length > 0) {
      const { dict, entries } = stack.pop();
      if (entries.length <= maxLeaves) {
        dict.set("Limits", [entries[0][0], entries.at(-1)[0]]);
        dict.set(valueType, entries.flat());
        continue;
      }
      const entriesChunks = [];
      const chunkSize = Math.max(
        maxLeaves,
        Math.ceil(entries.length / maxLeaves)
      );
      for (let i = 0; i < entries.length; i += chunkSize) {
        entriesChunks.push(entries.slice(i, i + chunkSize));
      }
      const entriesRefs = [];
      dict.set("Kids", entriesRefs);
      for (const chunk of entriesChunks) {
        const [entriesRef, entriesDict] = this.newDict;
        entriesRefs.push(entriesRef);
        entriesDict.set("Limits", [chunk[0][0], chunk.at(-1)[0]]);
        stack.push({ dict: entriesDict, entries: chunk });
      }
    }
    return treeRef;
  }

  /**
   * Create the page labels tree if it exists.
   */
  #makePageLabelsTree() {
    const { pageLabels } = this;
    if (!pageLabels || pageLabels.length === 0) {
      return;
    }
    const { rootDict } = this;
    const pageLabelsRef = this.#makeNameNumTree(
      this.pageLabels,
      /* areNames = */ false
    );
    rootDict.set("PageLabels", pageLabelsRef);
  }

  /**
   * Create the root dictionary.
   * @returns {Promise<void>}
   */
  async #makeRoot() {
    const { rootDict } = this;
    rootDict.setIfName("Type", "Catalog");
    rootDict.set("Version", this.version);
    this.#makePageTree();
    this.#makePageLabelsTree();
  }

  /**
   * Create the info dictionary.
   * @returns {Map} infoMap
   */
  #makeInfo() {
    const infoMap = new Map();
    if (this.hasSingleFile) {
      const {
        xref: { trailer },
      } = this.oldPages[0].documentData.document;
      const oldInfoDict = trailer.get("Info");
      for (const [key, value] of oldInfoDict || []) {
        if (typeof value === "string") {
          infoMap.set(key, stringToPDFString(value));
        }
      }
    }
    infoMap.delete("ModDate");
    infoMap.set("CreationDate", getModificationDate());
    infoMap.set("Creator", "PDF.js");
    infoMap.set("Producer", "Firefox");

    if (this.author) {
      infoMap.set("Author", this.author);
    }
    if (this.title) {
      infoMap.set("Title", this.title);
    }
    for (const [key, value] of infoMap) {
      this.infoDict.set(key, stringToAsciiOrUTF16BE(value));
    }
    return infoMap;
  }

  /**
   * Create the encryption dictionary if required.
   * @returns {Promise<[Dict|null, CipherTransformFactory|null, Array|null]>}
   */
  async #makeEncrypt() {
    if (!this.hasSingleFile) {
      return [null, null, null];
    }
    const { documentData } = this.oldPages[0];
    const {
      document: {
        xref: { trailer, encrypt },
      },
    } = documentData;
    if (!trailer.has("Encrypt")) {
      return [null, null, null];
    }
    const encryptDict = trailer.get("Encrypt");
    if (!(encryptDict instanceof Dict)) {
      return [null, null, null];
    }
    this.currentDocument = documentData;
    const result = [
      await this.#cloneObject(encryptDict, trailer.xref),
      encrypt,
      trailer.get("ID"),
    ];
    this.currentDocument = null;
    return result;
  }

  /**
   * Create the changes required to write the new PDF document.
   * @returns {Promise<[RefSetCache, Ref]>}
   */
  async #createChanges() {
    const changes = new RefSetCache();
    changes.put(Ref.get(0, 0xffff), { data: null });
    for (let i = 1, ii = this.xref.length; i < ii; i++) {
      if (this.objStreamRefs?.has(i)) {
        await this.#createObjectStream(Ref.get(i, 0), this.xref[i], changes);
      } else {
        changes.put(Ref.get(i, 0), { data: this.xref[i] });
      }
    }

    return [changes, this.newRef];
  }

  /**
   * Create an object stream containing the given objects.
   * @param {Ref} objStreamRef
   * @param {Array<Ref>} objRefs
   * @param {RefSetCache} changes
   */
  async #createObjectStream(objStreamRef, objRefs, changes) {
    const streamBuffer = [""];
    const objOffsets = [];
    let offset = 0;
    const buffer = [];
    for (let i = 0, ii = objRefs.length; i < ii; i++) {
      const objRef = objRefs[i];
      changes.put(objRef, { data: null, objStreamRef, index: i });
      objOffsets.push(`${objRef.num} ${offset}`);
      const data = this.xref[objRef.num];
      await writeValue(data, buffer, /* transform = */ null);
      const obj = buffer.join("");
      buffer.length = 0;
      streamBuffer.push(obj);
      offset += obj.length + 1;
    }
    streamBuffer[0] = objOffsets.join("\n");
    const objStream = new StringStream(streamBuffer.join("\n"));
    const objStreamDict = (objStream.dict = new Dict());
    objStreamDict.setIfName("Type", "ObjStm");
    objStreamDict.set("N", objRefs.length);
    objStreamDict.set("First", streamBuffer[0].length + 1);

    changes.put(objStreamRef, { data: objStream });
  }

  /**
   * Write the new PDF document to a Uint8Array.
   * @returns {Promise<Uint8Array>}
   */
  async writePDF() {
    await this.#makeRoot();
    const infoMap = this.#makeInfo();
    const [encryptRef, encrypt, fileIds] = await this.#makeEncrypt();
    const [changes, xrefTableRef] = await this.#createChanges();

    // Create the PDF header in order to help sniffers.
    // PDF version must be in the range 1.0 to 1.7 inclusive.
    // We add a binary comment line to ensure that the file is treated
    // as a binary file by applications that open it.
    const header = [
      ...`%PDF-${this.version}\n%`.split("").map(c => c.charCodeAt(0)),
      0xfa,
      0xde,
      0xfa,
      0xce,
    ];
    return incrementalUpdate({
      originalData: new Uint8Array(header),
      changes,
      xrefInfo: {
        startXRef: null,
        rootRef: this.rootRef,
        infoRef: this.infoRef,
        encryptRef,
        newRef: xrefTableRef,
        fileIds: fileIds || [null, null],
        infoMap,
      },
      useXrefStream: this.useObjectStreams,
      xref: {
        encrypt,
        encryptRef,
      },
    });
  }
}

export { PDFEditor };
