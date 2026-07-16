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
/** @typedef {import("../worker.js").WorkerTask} WorkerTask */
// eslint-disable-next-line max-len
/** @typedef {import("../../shared/message_handler.js").MessageHandler} MessageHandler */

import {
  deepCompare,
  getInheritableProperty,
  getModificationDate,
  getNewAnnotationsMap,
  numberToString,
} from "../core_utils.js";
import {
  Dict,
  isDict,
  isName,
  Name,
  Ref,
  RefSet,
  RefSetCache,
} from "../primitives.js";
import { incrementalUpdate, writeValue } from "../writer.js";
import { isArrayEqual, makeArr, stringToBytes } from "../../shared/util.js";
import { NameTree, NumberTree } from "../name_number_tree.js";
import { stringToAsciiOrUTF16BE, stringToPDFString } from "../string_utils.js";
import { AnnotationFactory } from "../annotation.js";
import { BaseStream } from "../base_stream.js";
import { createImage } from "./pdf_images.js";
import { LETTER_SIZE_MEDIABOX } from "../document.js";
import { MurmurHash3_64 } from "../../shared/murmurhash3.js";
import { StringStream } from "../stream.js";

const MAX_LEAVES_PER_PAGES_NODE = 16;
const MAX_IN_NAME_TREE_NODE = 64;

class PageData {
  constructor(page, documentData) {
    this.page = page;
    this.documentData = documentData;
    this.annotations = null;
    // Named destinations which points to this page.
    this.pointingNamedDestinations = null;

    documentData.pagesMap.put(page.ref, this);
  }
}

class DocumentData {
  constructor(document) {
    this.document = document;
    this.destinations = null;
    this.pageLabels = null;
    this.pagesMap = new RefSetCache();
    this.oldRefMapping = new RefSetCache();
    this.dedupNamedDestinations = new Map();
    this.usedNamedDestinations = new Set();
    this.postponedRefCopies = new RefSetCache();
    this.resourceStreamPromises = new Map();
    this.usedStructParents = new Set();
    this.oldStructParentMapping = new Map();
    this.structTreeRoot = null;
    this.parentTree = null;
    this.idTree = null;
    this.roleMap = null;
    this.classMap = null;
    this.namespaces = null;
    this.structTreeAF = null;
    this.structTreePronunciationLexicon = [];
    this.acroForm = null;
    this.acroFormDefaultAppearance = "";
    this.acroFormDefaultResources = null;
    this.acroFormQ = 0;
    this.hasSignatureAnnotations = false;
    this.fieldToParent = new RefSetCache();
    this.outline = null;
    this.embeddedFiles = null;
  }
}

class XRefWrapper {
  constructor(entries, getNewRef) {
    this.entries = entries;
    this._getNewRef = getNewRef;
  }

  getNewTemporaryRef() {
    return this._getNewRef();
  }

  fetchIfRef(obj) {
    return obj instanceof Ref ? this.fetch(obj) : obj;
  }

  fetch(ref) {
    if (!(ref instanceof Ref)) {
      throw new Error("ref object is not a reference");
    }
    return this.entries[ref.num];
  }

  async fetchIfRefAsync(obj) {
    return obj instanceof Ref ? this.fetchAsync(obj) : obj;
  }

  async fetchAsync(ref) {
    return this.fetch(ref);
  }
}

class PDFEditor {
  // Whether the edited PDF is built from a single source file, used one or more
  // times. This is used to determine if we can preserve information that can't
  // be meaningfully merged across distinct files, such as page labels, the Info
  // dictionary, and passwords. For example, there's no obvious way to dedup
  // page labels when merging multiple PDF files.
  isSingleFile = false;

  #newAnnotationsParams = null;

  #primaryDocument = null;

  // Deduplicates resource streams (fonts/images) shared across the merged
  // documents. Maps a cheap content key to a bucket of { ref, dictStr, stream }
  // candidates; the key only groups possible matches, an exact byte comparison
  // decides, so a key collision can never alias two distinct resources.
  #resourceStreamCache = new Map();

  currentDocument = null;

  oldPages = [];

  newPages = [];

  xref = [null];

  xrefWrapper = new XRefWrapper(this.xref, () => this.newRef);

  newRefCount = 1;

  namesDict = null;

  version = "1.7";

  pageLabels = null;

  namedDestinations = new Map();

  parentTree = new Map();

  structTreeKids = [];

  idTree = new Map();

  classMap = new Dict();

  roleMap = new Dict();

  namespaces = new Map();

  structTreeAF = [];

  structTreePronunciationLexicon = [];

  fields = [];

  acroFormDefaultAppearance = "";

  acroFormDefaultResources = null;

  acroFormNeedAppearances = false;

  acroFormSigFlags = 0;

  acroFormCalculationOrder = null;

  acroFormQ = 0;

  outlineItems = null;

  embeddedFiles = new Map();

  constructor({ useObjectStreams = true, title = "", author = "" } = {}) {
    [this.rootRef, this.rootDict] = this.newDict;
    [this.infoRef, this.infoDict] = this.newDict;
    [this.pagesRef, this.pagesDict] = this.newDict;
    this.useObjectStreams = useObjectStreams;
    this.objStreamRefs = useObjectStreams ? new Set() : null;
    this.title = title;
    this.author = author;
  }

  /**
   * Get a new reference for an object in the PDF.
   * @returns {Ref}
   */
  get newRef() {
    return Ref.get(this.newRefCount++, 0);
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

  cloneDict(dict) {
    const newDict = dict.clone();
    newDict.xref = this.xrefWrapper;
    return newDict;
  }

  /**
   * Collect the dependencies of an object and create new references for each
   * dependency.
   * @param {*} obj
   * @param {boolean} mustClone
   * @param {XRef} xref
   * @param {RefSet} resourceStreamPath
   * @returns {Promise<*>}
   */
  async #collectDependencies(
    obj,
    mustClone,
    xref,
    resourceStreamPath = new RefSet()
  ) {
    if (obj instanceof Ref) {
      const {
        currentDocument: { oldRefMapping },
      } = this;
      const existingRef = oldRefMapping.get(obj);
      if (existingRef) {
        return existingRef;
      }
      const oldRef = obj;
      obj = await xref.fetchAsync(oldRef);
      if (typeof obj === "number") {
        // Simple value; no need to create a new reference.
        return obj;
      }

      // Deduplicate fonts/images against earlier copies (common when merging
      // exports of the same template). Reusing a copy costs no reference, so
      // allocation is deferred to #collectResourceStream until it's known new.
      if (obj instanceof BaseStream && this.#isResourceStream(obj.dict)) {
        return this.#collectResourceStream(
          oldRef,
          obj,
          xref,
          resourceStreamPath
        );
      }

      const newRef = this.newRef;
      oldRefMapping.put(oldRef, newRef);

      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
        if (isDict(obj, "Page") && !this.currentDocument.pagesMap.has(oldRef)) {
          throw new Error(
            "Add a deleted page to the document is not supported."
          );
        }
      }

      this.xref[newRef.num] = await this.#collectDependencies(
        obj,
        true,
        xref,
        resourceStreamPath
      );
      return newRef;
    }
    const promises = [];
    const {
      currentDocument: { postponedRefCopies },
    } = this;
    if (Array.isArray(obj)) {
      if (mustClone) {
        obj = obj.slice();
      }
      for (let i = 0, ii = obj.length; i < ii; i++) {
        const postponedActions =
          obj[i] instanceof Ref && postponedRefCopies.get(obj[i]);
        if (postponedActions) {
          // The object is a reference that needs to be copied later.
          postponedActions.push(ref => (obj[i] = ref));
          continue;
        }
        promises.push(
          this.#collectDependencies(
            obj[i],
            true,
            xref,
            resourceStreamPath
          ).then(newObj => (obj[i] = newObj))
        );
      }
      await Promise.all(promises);
      return obj;
    }
    let dict;
    if (obj instanceof BaseStream) {
      ({ dict } = obj = obj.getOriginalStream().clone());
      dict.xref = this.xrefWrapper;
    } else if (obj instanceof Dict) {
      if (mustClone) {
        obj = obj.clone();
        obj.xref = this.xrefWrapper;
      }
      dict = obj;
    }
    if (dict) {
      for (const [key, rawObj] of dict.getRawEntries()) {
        const postponedActions =
          rawObj instanceof Ref && postponedRefCopies.get(rawObj);
        if (postponedActions) {
          // The object is a reference that needs to be copied later.
          postponedActions.push(ref => dict.set(key, ref));
          continue;
        }
        promises.push(
          this.#collectDependencies(
            rawObj,
            true,
            xref,
            resourceStreamPath
          ).then(newObj => dict.set(key, newObj))
        );
      }
      await Promise.all(promises);
    }

    return obj;
  }

  /**
   * Whether a stream is worth deduplicating: an image or an embedded font
   * program (large and often shared). Per-page content streams etc. are
   * essentially never shared, so hashing them would be wasted work.
   * @param {Dict} dict
   * @returns {boolean}
   */
  #isResourceStream(dict) {
    const subtype = dict.get("Subtype");
    return (
      isName(subtype, "Image") ||
      // FontFile/FontFile2 carry Length1; FontFile3 has one of these Subtypes.
      dict.has("Length1") ||
      isName(subtype, "Type1C") ||
      isName(subtype, "CIDFontType0C") ||
      isName(subtype, "OpenType")
    );
  }

  /**
   * Read the raw, still-encoded bytes of a stream.
   * @param {BaseStream} stream
   * @returns {Uint8Array}
   */
  #rawStreamBytes(stream) {
    const original = stream.getOriginalStream();
    original.reset();
    return original.getBytes();
  }

  /**
   * Serialize a dictionary to a canonical string. Two clones of the same source
   * dict serialize identically, so this works as a bucket key and as an exact
   * comparison.
   * @param {Dict} dict
   * @returns {Promise<string>}
   */
  async #serializeDict(dict) {
    const buffer = [];
    await writeValue(dict, buffer, /* transform = */ null);
    return buffer.join("");
  }

  /**
   * Cheap bucket key for a resource stream: the serialized dict, the byte
   * length, and a few sampled chunks (so large payloads aren't fully hashed).
   * Collisions only group candidates that are then compared byte-for-byte, so
   * they cost time but never cause a wrong merge.
   * @param {string} dictStr
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  #resourceStreamKey(dictStr, bytes) {
    const SAMPLE_SIZE = 256;
    const SAMPLE_COUNT = 4;
    const { length } = bytes;
    const hash = new MurmurHash3_64();
    hash.update(dictStr);
    hash.update(`#${length}`);
    if (length <= SAMPLE_SIZE * SAMPLE_COUNT) {
      hash.update(bytes);
    } else {
      const step = Math.floor((length - SAMPLE_SIZE) / (SAMPLE_COUNT - 1));
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const start = Math.min(i * step, length - SAMPLE_SIZE);
        hash.update(bytes.subarray(start, start + SAMPLE_SIZE));
      }
    }
    return hash.hexdigest();
  }

  /**
   * Clone a resource stream and return its output reference, reusing an earlier
   * copy when possible. The reference is allocated lazily (in
   * #dedupResourceStream), so a reused resource leaves no unused reference.
   * @param {Ref} oldRef
   * @param {BaseStream} stream
   * @param {XRef} xref
   * @param {RefSet} resourceStreamPath
   * @returns {Promise<Ref>}
   */
  async #collectResourceStream(oldRef, stream, xref, resourceStreamPath) {
    const {
      currentDocument: { oldRefMapping, resourceStreamPromises },
    } = this;

    // Re-entry means a (malformed) cycle back to this stream: allocate its
    // reference now to break the loop, like the generic path's eager alloc.
    if (resourceStreamPath.has(oldRef)) {
      return oldRefMapping.getOrPutComputed(oldRef, () => this.newRef);
    }

    const key = oldRef.toString();
    const pending = resourceStreamPromises.get(key);
    if (pending) {
      return pending;
    }

    // The path only grows here, so the shared parent path can be passed
    // read-only everywhere else; snapshot it, add this stream, and recurse.
    const childPath = new RefSet(resourceStreamPath);
    childPath.put(oldRef);

    const promise = Promise.resolve().then(async () => {
      const collected = await this.#collectDependencies(
        stream,
        true,
        xref,
        childPath
      );

      // A cycle already allocated a reference, so store the clone there.
      const cycleRef = oldRefMapping.get(oldRef);
      if (cycleRef) {
        this.xref[cycleRef.num] = collected;
        return cycleRef;
      }

      const ref = await this.#dedupResourceStream(collected);
      oldRefMapping.put(oldRef, ref);
      return ref;
    });
    resourceStreamPromises.set(key, promise);
    try {
      return await promise;
    } finally {
      if (resourceStreamPromises.get(key) === promise) {
        resourceStreamPromises.delete(key);
      }
    }
  }

  /**
   * Return the reference for a cloned resource stream, reusing a byte-identical
   * earlier copy or else allocating and registering a new one.
   * @param {BaseStream} stream
   * @returns {Promise<Ref>}
   */
  async #dedupResourceStream(stream) {
    const dictStr = await this.#serializeDict(stream.dict);
    const bytes = this.#rawStreamBytes(stream);
    const key = this.#resourceStreamKey(dictStr, bytes);

    const bucket = this.#resourceStreamCache.getOrInsertComputed(key, makeArr);
    // Same key only means "maybe equal": confirm with an exact comparison.
    for (const entry of bucket) {
      if (
        entry.dictStr === dictStr &&
        isArrayEqual(this.#rawStreamBytes(entry.stream), bytes)
      ) {
        return entry.ref;
      }
    }
    const ref = this.newRef;
    this.xref[ref.num] = stream;
    bucket.push({ ref, dictStr, stream });
    return ref;
  }

  async #resolveStructKids(rawKids, xref) {
    if (rawKids instanceof Ref) {
      const fetched = await xref.fetchAsync(rawKids);
      return Array.isArray(fetched) ? fetched : [rawKids];
    }
    return Array.isArray(rawKids) ? rawKids : [rawKids];
  }

  async #cloneStructTreeNode(
    parentStructRef,
    node,
    xref,
    removedStructElements,
    dedupIDs,
    dedupClasses,
    dedupRoles,
    visited = new RefSet()
  ) {
    const {
      currentDocument: { pagesMap, oldRefMapping },
    } = this;
    const pg = node.getRaw("Pg");
    if (pg instanceof Ref && !pagesMap.has(pg)) {
      return null;
    }
    const k = node.getRaw("K");
    if (k instanceof Ref && visited.has(k)) {
      return null;
    }
    const kids = await this.#resolveStructKids(k, xref);
    const newKids = [];
    const structElemIndices = [];
    for (let kid of kids) {
      const kidRef = kid instanceof Ref ? kid : null;
      if (kidRef) {
        if (visited.has(kidRef)) {
          continue;
        }
        visited.put(kidRef);
        kid = await xref.fetchAsync(kidRef);
      }
      if (typeof kid === "number") {
        newKids.push(kid);
        continue;
      }
      if (!(kid instanceof Dict)) {
        continue;
      }
      const pgRef = kid.getRaw("Pg");
      if (pgRef instanceof Ref && !pagesMap.has(pgRef)) {
        continue;
      }
      const type = kid.get("Type");
      if (!type || isName(type, "StructElem")) {
        let setAsSpan = false;
        if (kidRef && removedStructElements.has(kidRef)) {
          if (!isName(kid.get("S"), "Link")) {
            continue;
          }
          // A link annotation has been removed but we still need to keep the
          // node in order to preserve the structure tree. Mark it as a Span
          // so that it doesn't affect the semantics.
          setAsSpan = true;
        }
        const newKidRef = await this.#cloneStructTreeNode(
          kidRef,
          kid,
          xref,
          removedStructElements,
          dedupIDs,
          dedupClasses,
          dedupRoles,
          visited
        );
        if (newKidRef) {
          structElemIndices.push(newKids.length);
          newKids.push(newKidRef);
          if (kidRef) {
            oldRefMapping.put(kidRef, newKidRef);
          }
          if (setAsSpan) {
            this.xref[newKidRef.num].setIfName("S", "Span");
          }
        }
        continue;
      }
      if (isName(type, "OBJR")) {
        if (!kidRef) {
          continue;
        }
        // Only keep the reference when its target was actually copied. A link
        // annotation targeting a removed page is dropped, so skip its OBJR.
        const oldObjRef = kid.getRaw("Obj");
        if (oldObjRef instanceof Ref && !oldRefMapping.get(oldObjRef)) {
          continue;
        }
        const newKidRef =
          oldRefMapping.get(kidRef) ||
          (await this.#collectDependencies(kidRef, true, xref));
        const newKid = this.xref[newKidRef.num];
        // Fix the missing StructParent entry in the referenced object.
        const objRef = newKid.getRaw("Obj");
        if (objRef instanceof Ref) {
          const obj = this.xref[objRef.num];
          if (
            obj instanceof Dict &&
            !obj.has("StructParent") &&
            parentStructRef
          ) {
            const structParent = this.parentTree.size;
            this.parentTree.set(structParent, [oldRefMapping, parentStructRef]);
            obj.set("StructParent", structParent);
          }
        }
        newKids.push(newKidRef);
        continue;
      }
      if (isName(type, "MCR")) {
        const newKid = await this.#collectDependencies(
          kidRef || kid,
          true,
          xref
        );
        newKids.push(newKid);
        continue;
      }
      if (kidRef) {
        const newKidRef = await this.#collectDependencies(kidRef, true, xref);
        newKids.push(newKidRef);
      }
    }
    if (kids.length !== 0 && newKids.length === 0) {
      return null;
    }

    const newNodeRef = this.newRef;
    const newNode = (this.xref[newNodeRef.num] = this.cloneDict(node));
    // Don't collect for ID or C since they will be fixed later.
    newNode.delete("ID");
    newNode.delete("C");
    newNode.delete("K");
    newNode.delete("P");
    newNode.delete("S");
    await this.#collectDependencies(newNode, false, xref);

    // Fix the class names.
    const classNames = node.get("C");
    if (classNames instanceof Name) {
      const newClassName = dedupClasses.get(classNames.name);
      newNode.set("C", newClassName ? Name.get(newClassName) : classNames);
    } else if (Array.isArray(classNames)) {
      const newClassNames = [];
      for (const className of classNames) {
        if (className instanceof Name) {
          const newClassName = dedupClasses.get(className.name);
          newClassNames.push(newClassName ? Name.get(newClassName) : className);
        }
      }
      newNode.set("C", newClassNames);
    }

    // Fix the role name.
    const roleName = node.get("S");
    if (roleName instanceof Name) {
      const newRoleName = dedupRoles.get(roleName.name);
      newNode.set("S", newRoleName ? Name.get(newRoleName) : roleName);
    }

    // Fix the ID.
    const id = node.get("ID");
    if (typeof id === "string") {
      const stringId = stringToPDFString(id, /* keepEscapeSequence = */ false);
      const newId = dedupIDs.get(stringId);
      newNode.set("ID", newId ? stringToAsciiOrUTF16BE(newId) : id);
    }

    // Table headers may contain IDs that need to be deduplicated.
    let attributes = newNode.get("A");
    if (attributes) {
      if (!Array.isArray(attributes)) {
        attributes = [attributes];
      }
      for (let attr of attributes) {
        attr = this.xrefWrapper.fetchIfRef(attr);
        if (isName(attr.get("O"), "Table") && attr.has("Headers")) {
          const headers = this.xrefWrapper.fetchIfRef(attr.getRaw("Headers"));
          if (Array.isArray(headers)) {
            for (let i = 0, ii = headers.length; i < ii; i++) {
              const newId = dedupIDs.get(
                stringToPDFString(headers[i], /* keepEscapeSequence = */ false)
              );
              if (newId) {
                headers[i] = newId;
              }
            }
          }
        }
      }
    }

    for (const index of structElemIndices) {
      const structElemRef = newKids[index];
      const structElem = this.xref[structElemRef.num];
      structElem.set("P", newNodeRef);
    }

    if (newKids.length === 1) {
      newNode.set("K", newKids[0]);
    } else if (newKids.length > 1) {
      newNode.set("K", newKids);
    }

    return newNodeRef;
  }

  /**
   * @typedef {Object} PageInfo
   * @property {PDFDocument} [document]
   * @property {ImageBitmap} [image]
   *  image to insert as a synthetic page.
   * @property {Array<Array<number>|number>} [includePages]
   *  included ranges (inclusive) or indices.
   * @property {Array<Array<number>|number>} [excludePages]
   *  excluded ranges (inclusive) or indices.
   * @property {Array<number>} [pageIndices]
   *  position of the pages in the final document.
   * @property {number} [insertAfter]
   *  0-based index in the base sequential sequence after which to insert the
   *  pages. When every contributing pageInfo has pageIndices, this is
   *  interpreted against that explicit layout. Cannot be combined with
   *  pageIndices on the same entry.
   */

  /**
   * Return the document-local page indices that pass the include/exclude
   * filters for the given pageInfo, in document order.
   * @param {PageInfo} pageInfo
   * @returns {Array<number>}
   */
  #getFilteredPageIndices({ document, includePages, excludePages }) {
    if (!document) {
      return [];
    }
    const compile = list => {
      if (!list?.length) {
        return null;
      }
      const indices = new Set();
      const ranges = [];
      for (const item of list) {
        if (Array.isArray(item)) {
          ranges.push(item);
        } else {
          indices.add(item);
        }
      }
      return { indices, ranges };
    };
    const matches = (index, { indices, ranges }) =>
      indices.has(index) ||
      ranges.some(([start, end]) => index >= start && index <= end);
    const inc = compile(includePages);
    const exc = compile(excludePages);
    const result = [];
    for (let i = 0, ii = document.numPages; i < ii; i++) {
      if (exc && matches(i, exc)) {
        continue;
      }
      if (!inc || matches(i, inc)) {
        result.push(i);
      }
    }
    return result;
  }

  /**
   * Resolve insertAfter pageInfos by converting them (and sequential pageInfos)
   * to explicit pageIndices, shifting indices to accommodate each insertion.
   * @param {Array<PageInfo>} pageInfos
   * @returns {Array<PageInfo>}
   */
  #resolveInsertAfterIndices(pageInfos) {
    const counts = new Array(pageInfos.length);
    const sequence = [];
    const insertAfterList = [];
    for (let i = 0; i < pageInfos.length; i++) {
      const info = pageInfos[i];
      let count;
      if (info.image) {
        count = counts[i] = 1;
      } else if (!info.document) {
        counts[i] = 0;
        continue;
      } else {
        count = counts[i] = this.#getFilteredPageIndices(info).length;
      }
      if (info.pageIndices) {
        continue;
      }
      if (info.insertAfter === undefined) {
        for (let j = 0; j < count; j++) {
          sequence.push(i);
        }
      } else {
        insertAfterList.push({ i, insertAfter: info.insertAfter, count });
      }
    }
    if (insertAfterList.length === 0) {
      return pageInfos;
    }

    const hasContent = info => !!(info.document || info.image);

    // Partial pageIndices rely on auto-fill in extractPages, which races with
    // the slots insertAfter assigns here.
    for (let i = 0; i < pageInfos.length; i++) {
      const info = pageInfos[i];
      if (
        hasContent(info) &&
        info.pageIndices &&
        info.pageIndices.length < counts[i]
      ) {
        throw new Error(
          "extractPages: partial pageIndices cannot be combined with insertAfter entries."
        );
      }
    }

    insertAfterList.sort((a, b) => a.insertAfter - b.insertAfter || a.i - b.i);

    // If there is no base sequential sequence, resolve insertAfter against the
    // explicit layout. Shift pageIndices values but keep their array order:
    // extractPages maps each filtered source page to the corresponding
    // pageIndices entry.
    if (
      sequence.length === 0 &&
      pageInfos.some(info => hasContent(info) && info.pageIndices)
    ) {
      const updatedPageInfos = pageInfos.slice();
      let maxExistingPos = -1;
      for (const info of pageInfos) {
        if (!hasContent(info) || !info.pageIndices) {
          continue;
        }
        for (const idx of info.pageIndices) {
          if (idx > maxExistingPos) {
            maxExistingPos = idx;
          }
        }
      }
      let offset = 0;
      for (const { i, insertAfter, count } of insertAfterList) {
        const threshold = Math.min(
          Math.max(insertAfter, -1) + offset,
          maxExistingPos
        );
        for (let j = 0; j < updatedPageInfos.length; j++) {
          const existingInfo = updatedPageInfos[j];
          if (
            !hasContent(existingInfo) ||
            !existingInfo.pageIndices ||
            existingInfo.pageIndices.every(idx => idx <= threshold)
          ) {
            continue;
          }
          updatedPageInfos[j] = {
            ...existingInfo,
            pageIndices: existingInfo.pageIndices.map(idx =>
              idx > threshold ? idx + count : idx
            ),
          };
        }
        const pageIndices = [];
        for (let k = 0; k < count; k++) {
          pageIndices.push(threshold + 1 + k);
        }
        const result = { ...updatedPageInfos[i], pageIndices };
        delete result.insertAfter;
        updatedPageInfos[i] = result;
        offset += count;
        maxExistingPos += count;
      }
      return updatedPageInfos;
    }

    let offset = 0;
    for (const { i, insertAfter, count } of insertAfterList) {
      const insertPos = Math.max(insertAfter, -1) + 1 + offset;
      sequence.splice(insertPos, 0, ...new Array(count).fill(i));
      offset += count;
    }

    const pageIndicesArr = new Array(pageInfos.length);
    for (let pos = 0; pos < sequence.length; pos++) {
      const infoIdx = sequence[pos];
      (pageIndicesArr[infoIdx] ||= []).push(pos);
    }

    return pageInfos.map((info, i) => {
      if (!hasContent(info) || info.pageIndices) {
        return info;
      }
      const result = { ...info, pageIndices: pageIndicesArr[i] || [] };
      delete result.insertAfter;
      return result;
    });
  }

  /**
   * Extract pages from the given documents.
   * @param {Array<PageInfo>} pageInfos
   * @param {Object} annotationStorage - The annotation storage containing the
   *  annotations to be merged into the new document.
   * @param {PDFDocument} primaryDocument - The document the annotation storage
   *  belongs to.
   * @param {MessageHandler} handler - The message handler to use for processing
   *  the annotations.
   * @param {WorkerTask} task - The worker task to use for reporting progress
   *  and cancellation.
   * @return {Promise<void>}
   */
  async extractPages(
    pageInfos,
    annotationStorage,
    primaryDocument,
    handler,
    task
  ) {
    this.#primaryDocument = primaryDocument;
    pageInfos = this.#resolveInsertAfterIndices(pageInfos);
    const promises = [];
    let newIndex = 0;
    const reservePageSlot = newPageIndex => {
      if (!Number.isInteger(newPageIndex) || newPageIndex < 0) {
        throw new Error("extractPages: invalid page index.");
      }
      if (this.oldPages[newPageIndex] !== undefined) {
        throw new Error("extractPages: overlapping pageIndices.");
      }
      // Reserve the slot immediately because page/image collection can be
      // async.
      this.oldPages[newPageIndex] = null;
    };
    // Image entries don't carry document identity, so ignore them when
    // deciding whether we're operating on a single source PDF.
    const docPageInfos = pageInfos.filter(info => !!info.document);
    this.isSingleFile =
      docPageInfos.length === 1 ||
      (docPageInfos.length > 0 &&
        docPageInfos.every(info => info.document === docPageInfos[0].document));
    const allDocumentData = [];

    if (annotationStorage) {
      this.#newAnnotationsParams = {
        handler,
        task,
        newAnnotationsByPage: getNewAnnotationsMap(annotationStorage),
        imagesPromises: AnnotationFactory.generateImages(
          annotationStorage.values(),
          this.xrefWrapper,
          true
        ),
      };
    }

    const imageEntries = [];
    for (const pageInfo of pageInfos) {
      const { document, image, includePages, excludePages, pageIndices } =
        pageInfo;
      if (image) {
        if (pageIndices) {
          newIndex = -1;
          if (pageIndices.length > 1) {
            throw new Error("extractPages: too many pageIndices.");
          }
        }
        // Image entries are inserted as synthetic pages. Reserve a slot now;
        // the actual page dict is built after real pages are collected so
        // that we know the modal MediaBox dimensions to use.
        let newPageIndex;
        if (pageIndices?.length) {
          newPageIndex = pageIndices[0];
        } else if (newIndex !== -1) {
          newPageIndex = newIndex++;
        } else {
          for (
            newPageIndex = 0;
            this.oldPages[newPageIndex] !== undefined;
            newPageIndex++
          ) {
            /* empty */
          }
        }
        reservePageSlot(newPageIndex);
        imageEntries.push({ image, slot: newPageIndex });
        continue;
      }
      if (!document) {
        continue;
      }
      if (pageIndices) {
        newIndex = -1;
      }
      const filteredPageIndices = this.#getFilteredPageIndices({
        document,
        includePages,
        excludePages,
      });
      if (pageIndices && pageIndices.length > filteredPageIndices.length) {
        throw new Error("extractPages: too many pageIndices.");
      }
      const documentData = new DocumentData(document);
      allDocumentData.push(documentData);
      promises.push(this.#collectDocumentData(documentData));
      let pageIndex = 0;
      for (const i of filteredPageIndices) {
        let newPageIndex;
        if (pageIndices) {
          newPageIndex = pageIndices[pageIndex++];
        }
        if (newPageIndex === undefined) {
          if (newIndex !== -1) {
            newPageIndex = newIndex++;
          } else {
            // Find the first available index in the newPages array.
            // This is needed when the pageIndices option is used since the
            // pages can be added in any order.
            for (
              newPageIndex = 0;
              this.oldPages[newPageIndex] !== undefined;
              newPageIndex++
            ) {
              /* empty */
            }
          }
        }
        reservePageSlot(newPageIndex);
        promises.push(
          document.getPage(i).then(page => {
            this.oldPages[newPageIndex] = new PageData(page, documentData);
          })
        );
      }
    }
    await Promise.all(promises);
    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      if (this.oldPages[i] === undefined) {
        throw new Error("extractPages: sparse pageIndices.");
      }
    }
    promises.length = 0;

    this.#collectValidDestinations(allDocumentData);
    this.#collectOutlineDestinations(allDocumentData);
    this.#collectPageLabels();

    for (const page of this.oldPages) {
      if (page) {
        promises.push(this.#postCollectPageData(page));
      }
    }
    await Promise.all(promises);

    this.#findDuplicateNamedDestinations();
    this.#setPostponedRefCopies(allDocumentData);

    const imageSlots = new Map();
    for (const entry of imageEntries) {
      imageSlots.set(entry.slot, entry);
    }
    const modalPageSize = imageSlots.size > 0 ? this.#modalPageSize() : null;

    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      const imageEntry = imageSlots.get(i);
      if (imageEntry) {
        this.newPages[i] = await this.#makeImagePage(
          imageEntry.image,
          modalPageSize
        );
      } else {
        this.newPages[i] = await this.#makePageCopy(i, null);
      }
    }

    this.#fixPostponedRefCopies(allDocumentData);
    await this.#mergeStructTrees(allDocumentData);
    await this.#mergeAcroForms(allDocumentData);
    this.#buildOutline(allDocumentData);
    await this.#collectEmbeddedFiles(allDocumentData);

    return this.writePDF();
  }

  /**
   * Collect the document data.
   * @param {DocumentData} documentData
   * @return {Promise<void>}
   */
  async #collectDocumentData(documentData) {
    const {
      document: { pdfManager, xref },
    } = documentData;
    await Promise.all([
      pdfManager
        .ensureCatalog("destinations")
        .then(destinations => (documentData.destinations = destinations)),
      pdfManager
        .ensureCatalog("rawPageLabels")
        .then(pageLabels => (documentData.pageLabels = pageLabels)),
      pdfManager
        .ensureCatalog("structTreeRoot")
        .then(structTreeRoot => (documentData.structTreeRoot = structTreeRoot)),
      pdfManager
        .ensureCatalog("acroForm")
        .then(acroForm => (documentData.acroForm = acroForm)),
      pdfManager
        .ensureCatalog("documentOutlineForEditor")
        .then(outline => (documentData.outline = outline)),
      pdfManager
        .ensureCatalog("rawEmbeddedFiles")
        .then(ef => (documentData.embeddedFiles = ef)),
    ]);
    const structTreeRoot = documentData.structTreeRoot;
    if (structTreeRoot) {
      const rootDict = structTreeRoot.dict;
      const parentTree = rootDict.get("ParentTree");
      if (parentTree) {
        const numberTree = new NumberTree(parentTree, xref);
        documentData.parentTree = numberTree.getAll(/* isRaw = */ true);
      }
      const idTree = rootDict.get("IDTree");
      if (idTree) {
        const nameTree = new NameTree(idTree, xref);
        documentData.idTree = nameTree.getAll(/* isRaw = */ true);
      }
      documentData.roleMap = rootDict.get("RoleMap") || null;
      documentData.classMap = rootDict.get("ClassMap") || null;
      let namespaces = rootDict.get("Namespaces") || null;
      if (namespaces && !Array.isArray(namespaces)) {
        namespaces = [namespaces];
      }
      documentData.namespaces = namespaces;
      documentData.structTreeAF = rootDict.get("AF") || null;
      documentData.structTreePronunciationLexicon =
        rootDict.get("PronunciationLexicon") || null;
    }
  }

  /**
   * Post process the collected page data.
   * @param {PageData} pageData
   * @returns {Promise<void>}
   */
  async #postCollectPageData(pageData) {
    const {
      page: { xref, annotations },
      documentData: {
        pagesMap,
        destinations,
        usedNamedDestinations,
        fieldToParent,
      },
    } = pageData;

    if (!annotations) {
      return;
    }

    const promises = [];
    let newAnnotations = [];
    let newIndex = 0;
    let { hasSignatureAnnotations } = pageData.documentData;

    // Filter out annotations that are linking to deleted pages.
    for (const annotationRef of annotations) {
      const newAnnotationIndex = newIndex++;
      promises.push(
        xref.fetchIfRefAsync(annotationRef).then(async annotationDict => {
          if (!isName(annotationDict.get("Subtype"), "Link")) {
            if (isName(annotationDict.get("Subtype"), "Widget")) {
              hasSignatureAnnotations ||= isName(
                annotationDict.get("FT"),
                "Sig"
              );
              const parentRef = annotationDict.get("Parent") || null;
              // We remove the parent to avoid visiting it when cloning the
              // annotation.
              // It'll be fixed later in #mergeAcroForms when merging the
              // AcroForms.
              annotationDict.delete("Parent");
              fieldToParent.put(annotationRef, parentRef);
            }

            newAnnotations[newAnnotationIndex] = annotationRef;
            return;
          }
          const action = annotationDict.get("A");
          if (action instanceof Dict && !isName(action.get("S"), "GoTo")) {
            // Only GoTo actions point to pages in the current document. Other
            // actions, such as GoToR, must not be filtered using the current
            // document's page map.
            newAnnotations[newAnnotationIndex] = annotationRef;
            return;
          }
          const dest =
            action instanceof Dict
              ? action.get("D")
              : annotationDict.get("Dest");
          if (
            !dest /* not a destination */ ||
            (Array.isArray(dest) &&
              (!(dest[0] instanceof Ref) || pagesMap.has(dest[0])))
          ) {
            // Keep the annotation as is: it isn't linking to a deleted page.
            newAnnotations[newAnnotationIndex] = annotationRef;
          } else if (dest instanceof Name || typeof dest === "string") {
            const destString = stringToPDFString(
              dest instanceof Name ? dest.name : dest,
              /* keepEscapeSequence = */ true
            );
            if (destinations.has(destString)) {
              // Keep the annotation as is: the named destination is valid.
              // Valid named destinations have been collected previously (see
              // #collectValidDestinations).
              newAnnotations[newAnnotationIndex] = annotationRef;
              usedNamedDestinations.add(destString);
            }
          }
        })
      );
    }

    await Promise.all(promises);
    newAnnotations = newAnnotations.filter(annot => !!annot);
    pageData.annotations = newAnnotations.length > 0 ? newAnnotations : null;
    pageData.documentData.hasSignatureAnnotations ||= hasSignatureAnnotations;
  }

  /**
   * Some references cannot be copied right away since they correspond to some
   * pages that haven't been processed yet. Postpone the copy of those
   * references.
   * @param {Array<DocumentData>} allDocumentData
   */
  #setPostponedRefCopies(allDocumentData) {
    for (const { postponedRefCopies, pagesMap } of allDocumentData) {
      for (const oldPageRef of pagesMap.keys()) {
        postponedRefCopies.put(oldPageRef, []);
      }
    }
  }

  /**
   * Fix all postponed reference copies.
   * @param {Array<DocumentData>} allDocumentData
   */
  #fixPostponedRefCopies(allDocumentData) {
    for (const { postponedRefCopies, oldRefMapping } of allDocumentData) {
      for (const [oldRef, actions] of postponedRefCopies.items()) {
        const newRef = oldRefMapping.get(oldRef);
        for (const action of actions) {
          action(newRef);
        }
      }
      postponedRefCopies.clear();
    }
  }

  #visitObject(obj, callback, visited = new RefSet()) {
    if (obj instanceof Ref) {
      if (!visited.has(obj)) {
        visited.put(obj);
        this.#visitObject(this.xref[obj.num], callback, visited);
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.#visitObject(item, callback, visited);
      }
      return;
    }
    let dict;
    if (obj instanceof BaseStream) {
      ({ dict } = obj);
    } else if (obj instanceof Dict) {
      dict = obj;
    }
    if (dict) {
      callback(dict);
      for (const value of dict.getRawValues()) {
        this.#visitObject(value, callback, visited);
      }
    }
  }

  async #mergeStructTrees(allDocumentData) {
    let newStructParentId = 0;
    const { parentTree: newParentTree } = this;
    for (let i = 0, ii = this.newPages.length; i < ii; i++) {
      if (!this.oldPages[i]) {
        continue;
      }
      const {
        documentData: {
          parentTree,
          oldRefMapping,
          oldStructParentMapping,
          usedStructParents,
          document: { xref },
        },
      } = this.oldPages[i];
      if (!parentTree) {
        continue;
      }
      const pageRef = this.newPages[i];
      const pageDict = this.xref[pageRef.num];
      const visited = new RefSet();
      visited.put(pageRef);

      // Visit the new page in order to collect used StructParent entries.
      this.#visitObject(
        pageDict,
        dict => {
          const structParent =
            dict.get("StructParent") ?? dict.get("StructParents");
          if (typeof structParent !== "number") {
            return;
          }
          usedStructParents.add(structParent);
          let parent = parentTree.get(structParent);
          const parentRef = parent instanceof Ref ? parent : null;
          if (parentRef) {
            const array = xref.fetch(parentRef);
            if (Array.isArray(array)) {
              parent = array;
            }
          }
          if (Array.isArray(parent) && parent.every(ref => ref === null)) {
            parent = null;
          }
          if (!parent) {
            if (dict.has("StructParent")) {
              dict.delete("StructParent");
            } else {
              dict.delete("StructParents");
            }
            return;
          }
          let newStructParent = oldStructParentMapping.get(structParent);
          if (newStructParent === undefined) {
            newStructParent = newStructParentId++;
            oldStructParentMapping.set(structParent, newStructParent);
            newParentTree.set(newStructParent, [oldRefMapping, parent]);
          }
          if (dict.has("StructParent")) {
            dict.set("StructParent", newStructParent);
          } else {
            dict.set("StructParents", newStructParent);
          }
        },
        visited
      );
    }

    const {
      structTreeKids,
      idTree: newIdTree,
      classMap: newClassMap,
      roleMap: newRoleMap,
      namespaces: newNamespaces,
      structTreeAF: newStructTreeAF,
      structTreePronunciationLexicon: newStructTreePronunciationLexicon,
    } = this;
    // Clone the struct tree nodes for each document.
    for (const documentData of allDocumentData) {
      const {
        document: { xref },
        oldRefMapping,
        parentTree,
        usedStructParents,
        structTreeRoot,
        idTree,
        classMap,
        roleMap,
        namespaces,
        structTreeAF,
        structTreePronunciationLexicon,
      } = documentData;

      if (!structTreeRoot) {
        continue;
      }

      this.currentDocument = documentData;
      // Get all the removed StructElem
      const removedStructElements = new RefSet();
      for (const [key, value] of parentTree || []) {
        if (!usedStructParents.has(key) && value instanceof Ref) {
          removedStructElements.put(value);
        }
      }

      // Deduplicate IDs in the ID tree.
      // We keep the old node references since they will be cloned later when
      // cloning the struct tree.
      const dedupIDs = new Map();
      for (const [id, nodeRef] of idTree || []) {
        let _id = id;
        if (newIdTree.has(id)) {
          for (let i = 1; ; i++) {
            const newId = `${id}_${i}`;
            if (!newIdTree.has(newId)) {
              dedupIDs.set(id, newId);
              _id = newId;
              break;
            }
          }
        }
        newIdTree.set(_id, nodeRef);
      }

      const dedupClasses = new Map();
      if (classMap?.size > 0) {
        // Deduplicate ClassMap entries.
        for (let [className, classDict] of classMap) {
          classDict = await this.#collectDependencies(classDict, true, xref);
          if (newClassMap.has(className)) {
            for (let i = 1; ; i++) {
              const newClassName = `${className}_${i}`;
              if (!newClassMap.has(newClassName)) {
                dedupClasses.set(className, newClassName);
                className = newClassName;
                break;
              }
            }
          }
          newClassMap.set(className, classDict);
        }
      }

      const dedupRoles = new Map();
      if (roleMap?.size > 0) {
        // Deduplicate RoleMap entries.
        for (const [roleName, mappedName] of roleMap) {
          const newMappedName = newRoleMap.get(roleName);
          if (!newMappedName) {
            newRoleMap.set(roleName, mappedName);
            continue;
          }
          if (newMappedName === mappedName) {
            continue;
          }
          for (let i = 1; ; i++) {
            const newRoleName = `${roleName}_${i}`;
            if (!newRoleMap.has(newRoleName)) {
              dedupRoles.set(roleName, newRoleName);
              newRoleMap.set(newRoleName, mappedName);
              break;
            }
          }
        }
      }

      if (namespaces?.length > 0) {
        for (const namespaceRef of namespaces) {
          const namespace = await xref.fetchIfRefAsync(namespaceRef);
          let ns = namespace.get("NS");
          if (!ns || newNamespaces.has(ns)) {
            continue;
          }
          ns = stringToPDFString(ns, /* keepEscapeSequence = */ false);
          const newNamespace = await this.#collectDependencies(
            namespace,
            true,
            xref
          );
          newNamespaces.set(ns, newNamespace);
        }
      }

      if (structTreeAF) {
        for (const afRef of structTreeAF) {
          newStructTreeAF.push(
            await this.#collectDependencies(afRef, true, xref)
          );
        }
      }

      if (structTreePronunciationLexicon) {
        for (const lexiconRef of structTreePronunciationLexicon) {
          newStructTreePronunciationLexicon.push(
            await this.#collectDependencies(lexiconRef, true, xref)
          );
        }
      }

      // Get the kids.
      const rawKids = structTreeRoot.dict.getRaw("K");
      if (!rawKids) {
        continue;
      }
      const kids = await this.#resolveStructKids(rawKids, xref);
      for (let kid of kids) {
        const kidRef = kid instanceof Ref ? kid : null;
        kid = await xref.fetchIfRefAsync(kid);
        if (!(kid instanceof Dict)) {
          continue;
        }
        let setAsSpan = false;
        if (kidRef && removedStructElements.has(kidRef)) {
          if (!isName(kid.get("S"), "Link")) {
            continue;
          }
          setAsSpan = true;
        }
        const newKidRef = await this.#cloneStructTreeNode(
          kidRef,
          kid,
          xref,
          removedStructElements,
          dedupIDs,
          dedupClasses,
          dedupRoles
        );
        if (newKidRef) {
          structTreeKids.push(newKidRef);
          if (kidRef) {
            oldRefMapping.put(kidRef, newKidRef);
          }
          if (setAsSpan) {
            this.xref[newKidRef.num].setIfName("S", "Span");
          }
        }
      }

      // Fix the ID tree.
      for (const [id, nodeRef] of idTree || []) {
        const newNodeRef = nodeRef instanceof Ref && oldRefMapping.get(nodeRef);
        const newId = dedupIDs.get(id) || id;
        if (newNodeRef) {
          newIdTree.set(newId, newNodeRef);
        } else {
          newIdTree.delete(newId);
        }
      }
    }

    for (const [key, [oldRefMapping, parent]] of newParentTree) {
      if (!parent) {
        newParentTree.delete(key);
        continue;
      }
      // Some nodes haven't been visited while cloning the struct trees so their
      // ref don't belong to the oldRefMapping. Remove those nodes.
      if (!Array.isArray(parent)) {
        const newParent = oldRefMapping.get(parent);
        if (newParent === undefined) {
          newParentTree.delete(key);
        } else {
          newParentTree.set(key, newParent);
        }
        continue;
      }
      const newParents = parent.map(
        ref => (ref instanceof Ref && oldRefMapping.get(ref)) || null
      );
      if (newParents.length === 0 || newParents.every(ref => ref === null)) {
        newParentTree.delete(key);
        continue;
      }
      newParentTree.set(key, newParents);
    }

    this.currentDocument = null;
  }

  /**
   * Collect named destinations that are still valid (i.e. pointing to kept
   * pages).
   * @param {Array<DocumentData>} allDocumentData
   */
  #collectValidDestinations(allDocumentData) {
    // TODO: Handle OpenAction as well.
    for (const documentData of allDocumentData) {
      if (!documentData.destinations) {
        continue;
      }
      const { destinations, pagesMap } = documentData;
      const newDestinations = (documentData.destinations = new Map());
      for (const [key, dest] of Object.entries(destinations)) {
        const pageRef = dest[0];
        const pageData = pageRef instanceof Ref && pagesMap.get(pageRef);
        if (!pageData) {
          continue;
        }
        (pageData.pointingNamedDestinations ||= new Set()).add(key);
        newDestinations.set(key, dest);
      }
    }
  }

  /**
   * Find and rename duplicate named destinations.
   */
  #findDuplicateNamedDestinations() {
    const { namedDestinations } = this;
    const getUniqueDestinationName = name => {
      if (!namedDestinations.has(name)) {
        return name;
      }
      for (let i = 1; ; i++) {
        const dedupedName = `${name}_${i}`;
        if (!namedDestinations.has(dedupedName)) {
          return dedupedName;
        }
      }
    };
    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      const page = this.oldPages[i];
      if (!page) {
        continue;
      }
      const {
        documentData: {
          destinations,
          dedupNamedDestinations,
          usedNamedDestinations,
        },
      } = page;
      let { pointingNamedDestinations } = page;

      if (!pointingNamedDestinations) {
        // No named destinations pointing to this page.
        continue;
      }
      // Keep only the named destinations that are still used.
      page.pointingNamedDestinations = pointingNamedDestinations =
        pointingNamedDestinations.intersection(usedNamedDestinations);

      for (const pointingDest of pointingNamedDestinations) {
        if (!usedNamedDestinations.has(pointingDest)) {
          // If the named destination isn't used, we can keep it as is.
          continue;
        }
        const dest = destinations.get(pointingDest).slice();
        if (!namedDestinations.has(pointingDest)) {
          // If the named destination hasn't been used yet, we can keep it
          // as is.
          namedDestinations.set(pointingDest, dest);
          continue;
        }
        // Create a new unique named destination.
        const newName = getUniqueDestinationName(`${pointingDest}_p${i + 1}`);
        dedupNamedDestinations.set(pointingDest, newName);
        namedDestinations.set(newName, dest);
      }
    }
  }

  /**
   * Fix named destinations in the annotations.
   * @param {Array<Ref>} annotations
   * @param {Map<string,string>} dedupNamedDestinations
   */
  #fixNamedDestinations(annotations, dedupNamedDestinations) {
    if (dedupNamedDestinations.size === 0) {
      return;
    }
    const fixDestination = (dict, key, dest) => {
      if (typeof dest === "string") {
        dict.set(
          key,
          dedupNamedDestinations.get(
            stringToPDFString(dest, /* keepEscapeSequence = */ true)
          ) || dest
        );
      }
    };

    for (const annotRef of annotations) {
      const annotDict = this.xref[annotRef.num];
      if (!isName(annotDict.get("Subtype"), "Link")) {
        continue;
      }
      const action = annotDict.get("A");
      if (action instanceof Dict && action.has("D")) {
        const dest = action.get("D");
        fixDestination(action, "D", dest);
        continue;
      }
      const dest = annotDict.get("Dest");
      fixDestination(annotDict, "Dest", dest);
    }
  }

  /**
   * Collect named destinations referenced in the outlines so they are kept
   * when filtering duplicate named destinations.
   * @param {Array<DocumentData>} allDocumentData
   */
  #collectOutlineDestinations(allDocumentData) {
    const collect = (items, destinations, usedNamedDestinations) => {
      for (const item of items) {
        if (typeof item.dest === "string" && destinations?.has(item.dest)) {
          usedNamedDestinations.add(item.dest);
        }
        if (item.items.length > 0) {
          collect(item.items, destinations, usedNamedDestinations);
        }
      }
    };
    for (const documentData of allDocumentData) {
      const { outline, destinations, usedNamedDestinations } = documentData;
      if (outline?.length) {
        collect(outline, destinations, usedNamedDestinations);
      }
    }
  }

  /**
   * Check whether an outline item has a valid destination in the output doc.
   * @param {Object} item
   * @param {DocumentData} documentData
   * @returns {boolean}
   */
  #isValidOutlineDest(item, documentData) {
    const { dest, action, url, unsafeUrl, attachment, setOCGState } = item;
    // External links (including relative URLs that can't be made absolute),
    // named actions, attachments and OCG state changes are always kept.
    if (action || url || unsafeUrl || attachment || setOCGState) {
      return true;
    }
    if (!dest) {
      return false;
    }
    if (typeof dest === "string") {
      const name = documentData.dedupNamedDestinations.get(dest) || dest;
      return this.namedDestinations.has(name);
    }
    if (Array.isArray(dest) && dest[0] instanceof Ref) {
      return !!documentData.oldRefMapping.get(dest[0]);
    }
    return false;
  }

  /**
   * Recursively filter outline items, removing those with no valid destination
   * and no remaining children.
   * @param {Array} items
   * @param {DocumentData} documentData
   * @returns {Array}
   */
  #filterOutlineItems(items, documentData) {
    const result = [];
    for (const item of items) {
      const filteredChildren = this.#filterOutlineItems(
        item.items,
        documentData
      );
      const hasValidOwnDest = this.#isValidOutlineDest(item, documentData);
      if (hasValidOwnDest || filteredChildren.length > 0) {
        result.push({
          ...item,
          // When the item's own destination is invalid (but it has surviving
          // children), clear the destination and rawDict so the output item is
          // a plain container rather than a broken link. Clearing rawDict
          // prevents #setOutlineItemDest from cloning a GoTo action that
          // references a deleted page via its D array.
          dest: hasValidOwnDest ? item.dest : null,
          rawDict: hasValidOwnDest ? item.rawDict : null,
          items: filteredChildren,
          _documentData: documentData,
        });
      }
    }
    return result;
  }

  /**
   * Filter outline trees and collect the result into this.outlineItems.
   * Must be called after page copies are made (oldRefMapping is populated).
   * @param {Array<DocumentData>} allDocumentData
   */
  #buildOutline(allDocumentData) {
    const outlineItems = [];
    for (const documentData of allDocumentData) {
      const { outline } = documentData;
      if (!outline?.length) {
        continue;
      }
      outlineItems.push(...this.#filterOutlineItems(outline, documentData));
    }
    this.outlineItems = outlineItems.length > 0 ? outlineItems : null;
  }

  /**
   * Write the destination or action of an outline item into the given dict.
   * @param {Dict} itemDict
   * @param {Object} item
   * @returns {Promise<void>}
   */
  async #setOutlineItemDest(itemDict, item) {
    const { dest, rawDict } = item;
    const documentData = item._documentData;
    if (dest) {
      if (typeof dest === "string") {
        const name = documentData.dedupNamedDestinations.get(dest) || dest;
        itemDict.set("Dest", stringToAsciiOrUTF16BE(name));
      } else if (Array.isArray(dest)) {
        const newDest = dest.slice();
        if (newDest[0] instanceof Ref) {
          newDest[0] = documentData.oldRefMapping.get(newDest[0]) || newDest[0];
        }
        itemDict.set("Dest", newDest);
      }
      return;
    }
    // For all other action types (URI, GoToR, Named, SetOCGState, ...) clone
    // the raw action dict from the original document.
    const actionDict = rawDict?.get("A");
    if (actionDict instanceof Dict) {
      this.currentDocument = documentData;
      const actionRef = await this.#cloneObject(
        actionDict,
        documentData.document.xref
      );
      this.currentDocument = null;
      itemDict.set("A", actionRef);
    }
  }

  /**
   * Build and write the document outline (bookmarks) into the output PDF.
   * @returns {Promise<void>}
   */
  async #makeOutline() {
    const { outlineItems } = this;
    if (!outlineItems?.length) {
      return;
    }

    const [outlineRootRef, outlineRootDict] = this.newDict;
    outlineRootDict.setIfName("Type", "Outlines");

    // First pass: allocate a new Ref for every item in the tree.
    const assignRefs = items => {
      for (const item of items) {
        [item._ref] = this.newDict;
        if (item.items.length > 0) {
          assignRefs(item.items);
        }
      }
    };
    assignRefs(outlineItems);

    // Second pass: fill each Dict and return the total visible item count.
    const fillItems = async (items, parentRef) => {
      let totalCount = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dict = this.xref[item._ref.num];

        dict.set("Title", stringToAsciiOrUTF16BE(item.title));
        dict.set("Parent", parentRef);
        if (i > 0) {
          dict.set("Prev", items[i - 1]._ref);
        }
        if (i < items.length - 1) {
          dict.set("Next", items[i + 1]._ref);
        }

        if (item.items.length > 0) {
          dict.set("First", item.items[0]._ref);
          dict.set("Last", item.items.at(-1)._ref);
          const childCount = await fillItems(item.items, item._ref);
          if (item.count !== undefined) {
            // Preserve the original expanded/collapsed state while updating
            // the number of visible descendants after filtering.
            dict.set("Count", item.count < 0 ? -childCount : childCount);
          }
          // A closed item (count < 0) hides its descendants, so it only
          // contributes 1 to the parent's visible-item tally.
          totalCount +=
            item.count !== undefined && item.count < 0 ? 1 : childCount + 1;
        } else {
          totalCount += 1;
        }

        await this.#setOutlineItemDest(dict, item);

        const flags = (item.bold ? 2 : 0) | (item.italic ? 1 : 0);
        if (flags !== 0) {
          dict.set("F", flags);
        }
        if (
          item.color &&
          (item.color[0] !== 0 || item.color[1] !== 0 || item.color[2] !== 0)
        ) {
          dict.set("C", [
            item.color[0] / 255,
            item.color[1] / 255,
            item.color[2] / 255,
          ]);
        }
      }
      return totalCount;
    };

    const totalCount = await fillItems(outlineItems, outlineRootRef);
    outlineRootDict.set("First", outlineItems[0]._ref);
    outlineRootDict.set("Last", outlineItems.at(-1)._ref);
    outlineRootDict.set("Count", totalCount);

    this.rootDict.set("Outlines", outlineRootRef);
  }

  async #mergeAcroForms(allDocumentData) {
    this.#setAcroFormDefaultBasicValues(allDocumentData);
    this.#setAcroFormDefaultAppearance(allDocumentData);
    this.#setAcroFormQ(allDocumentData);
    await this.#setAcroFormDefaultResources(allDocumentData);
    const newFields = this.fields;
    for (const documentData of allDocumentData) {
      let fields = documentData.acroForm?.get("Fields") || null;
      if (!fields && documentData.fieldToParent.size > 0) {
        fields = this.#fixFields(
          documentData.fieldToParent,
          documentData.document.xref
        );
      }
      if (Array.isArray(fields) && fields.length > 0) {
        this.currentDocument = documentData;
        await this.#cloneFields(newFields, fields);
        this.currentDocument = null;
      }
    }
    this.#setAcroFormCalculationOrder(allDocumentData);
  }

  #setAcroFormQ(allDocumentData) {
    let firstQ = 0;
    let firstDocData = null;
    for (const documentData of allDocumentData) {
      const q = documentData.acroForm?.get("Q");
      if (typeof q !== "number" || q === 0) {
        continue;
      }
      if (firstDocData?.acroFormQ > 0) {
        documentData.acroFormQ = q;
        continue;
      }
      if (firstQ === 0) {
        firstQ = q;
        firstDocData = documentData;
        continue;
      }
      if (q === firstQ) {
        continue;
      }
      firstDocData.acroFormQ ||= firstQ;
      documentData.acroFormQ = q;
      firstQ = 0;
    }

    if (firstQ > 0) {
      this.acroFormQ = firstQ;
    }
  }

  #setAcroFormDefaultBasicValues(allDocumentData) {
    let sigFlags = 0;
    let needAppearances = false;
    for (const documentData of allDocumentData) {
      if (!documentData.acroForm) {
        continue;
      }
      const sf = documentData.acroForm.get("SigFlags");
      if (typeof sf === "number" && documentData.hasSignatureAnnotations) {
        sigFlags |= sf;
      }
      if (documentData.acroForm.get("NeedAppearances") === true) {
        needAppearances = true;
      }
    }
    this.acroFormSigFlags = sigFlags;
    this.acroFormNeedAppearances = needAppearances;
  }

  #setAcroFormCalculationOrder(allDocumentData) {
    const calculationOrder = [];
    for (const documentData of allDocumentData) {
      const co = documentData.acroForm?.get("CO") || null;
      if (!Array.isArray(co)) {
        continue;
      }
      const { oldRefMapping } = documentData;
      for (const coRef of co) {
        const newCoRef = coRef instanceof Ref && oldRefMapping.get(coRef);
        if (newCoRef) {
          calculationOrder.push(newCoRef);
        }
      }
    }
    this.acroFormCalculationOrder =
      calculationOrder.length > 0 ? calculationOrder : null;
  }

  #setAcroFormDefaultAppearance(allDocumentData) {
    // If all the DAs are the same we just use it in the AcroForm. Otherwise, we
    // set the DA for each documentData and use for any annotations that don't
    // have their own DA.
    let firstDA = null;
    let firstDocData = null;
    for (const documentData of allDocumentData) {
      const da = documentData.acroForm?.get("DA") || null;
      if (!da || typeof da !== "string") {
        continue;
      }
      if (firstDocData?.acroFormDefaultAppearance) {
        documentData.acroFormDefaultAppearance = da;
        continue;
      }
      if (!firstDA) {
        firstDA = da;
        firstDocData = documentData;
        continue;
      }
      if (da === firstDA) {
        continue;
      }
      firstDocData.acroFormDefaultAppearance ||= firstDA;
      documentData.acroFormDefaultAppearance = da;
      firstDA = null;
    }

    if (firstDA) {
      this.acroFormDefaultAppearance = firstDA;
    }
  }

  async #setAcroFormDefaultResources(allDocumentData) {
    let firstDR = null;
    let firstDRRef = null;
    let firstDocData = null;
    for (const documentData of allDocumentData) {
      const dr = documentData.acroForm?.get("DR") || null;
      if (!dr || !(dr instanceof Dict)) {
        continue;
      }
      if (firstDocData?.acroFormDefaultResources) {
        documentData.acroFormDefaultResources = dr;
        continue;
      }
      if (!firstDR) {
        firstDR = dr;
        firstDRRef = documentData.acroForm.getRaw("DR");
        firstDocData = documentData;
        continue;
      }
      if (deepCompare(firstDR, dr)) {
        continue;
      }
      firstDocData.acroFormDefaultResources ||= firstDR;
      documentData.acroFormDefaultResources = dr;
      firstDR = null;
      firstDRRef = null;
    }

    if (firstDR) {
      this.currentDocument = firstDocData;
      this.acroFormDefaultResources = await this.#collectDependencies(
        firstDRRef,
        true,
        firstDocData.document.xref
      );
      this.currentDocument = null;
    }
  }

  /**
   * If the document has some fields but no Fields entry in the AcroForm, we
   * need to fix that by creating a Fields entry with the oldest parent field
   * for each field.
   * @param {Map<Ref, Ref>} fieldToParent
   * @param {XRef} xref
   * @returns {Array<Ref>}
   */
  #fixFields(fieldToParent, xref) {
    const newFields = [];
    const processed = new RefSet();
    for (const [fieldRef, parentRef] of fieldToParent) {
      if (!parentRef) {
        newFields.push(fieldRef);
        continue;
      }
      let parent = parentRef;
      let lastNonNullParent = parentRef;
      while (true) {
        parent = xref.fetchIfRef(parent)?.getRaw("Parent") || null;
        if (!parent) {
          break;
        }
        lastNonNullParent = parent;
      }
      if (
        lastNonNullParent instanceof Ref &&
        !processed.has(lastNonNullParent)
      ) {
        newFields.push(lastNonNullParent);
        processed.put(lastNonNullParent);
      }
    }
    return newFields;
  }

  async #cloneFields(newFields, fields) {
    const processed = new RefSet();
    const stack = [
      {
        kids: fields,
        newKids: newFields,
        pos: 0,
        oldParentRef: null,
        parentRef: null,
        parent: null,
      },
    ];
    const {
      document: { xref },
      oldRefMapping,
      fieldToParent,
      acroFormDefaultAppearance,
      acroFormDefaultResources,
      acroFormQ,
    } = this.currentDocument;
    const daToFix = [];
    const drToFix = [];

    while (stack.length > 0) {
      const data = stack.at(-1);
      const { kids, newKids, parent, pos } = data;
      if (pos === kids.length) {
        stack.pop();
        if (newKids.length === 0 || !parent) {
          continue;
        }

        const parentDict = (this.xref[data.parentRef.num] =
          this.cloneDict(parent));
        parentDict.delete("Parent");
        parentDict.delete("Kids");
        await this.#collectDependencies(parentDict, false, xref);
        parentDict.set("Kids", newKids);

        if (stack.length > 0) {
          const lastData = stack.at(-1);
          if (!lastData.parentRef && lastData.oldParentRef) {
            const parentRef = (lastData.parentRef = this.newRef);
            parentDict.set("Parent", parentRef);
            oldRefMapping.put(lastData.oldParentRef, parentRef);
          }
          lastData.newKids.push(data.parentRef);
        }
        continue;
      }
      const oldKidRef = kids[data.pos++];
      if (!(oldKidRef instanceof Ref) || processed.has(oldKidRef)) {
        continue;
      }
      processed.put(oldKidRef);
      const kid = xref.fetchIfRef(oldKidRef);
      if (kid.has("Kids")) {
        const kidsArray = kid.get("Kids");
        if (!Array.isArray(kidsArray)) {
          continue;
        }
        stack.push({
          kids: kidsArray,
          newKids: [],
          pos: 0,
          oldParentRef: oldKidRef,
          parentRef: null,
          parent: kid,
        });

        continue;
      }

      if (!fieldToParent.has(oldKidRef)) {
        continue;
      }
      const newRef = oldRefMapping.get(oldKidRef);
      if (!newRef) {
        continue;
      }
      newKids.push(newRef);
      if (!data.parentRef && data.oldParentRef) {
        data.parentRef = this.newRef;
        oldRefMapping.put(data.oldParentRef, data.parentRef);
      }
      const newKid = this.xref[newRef.num];
      if (data.parentRef) {
        newKid.set("Parent", data.parentRef);
      }
      if (
        acroFormDefaultAppearance &&
        isName(newKid.get("FT"), "Tx") &&
        !newKid.has("DA")
      ) {
        // Fix the DA later since we need to have all the fields tree.
        daToFix.push(newKid);
      }
      if (
        acroFormDefaultResources &&
        !newKid.has("Kids") &&
        newKid.get("AP") instanceof Dict
      ) {
        // Fix the DR later since we need to have all the fields tree.
        drToFix.push(newKid);
      }
      if (acroFormQ && !newKid.has("Q")) {
        newKid.set("Q", acroFormQ);
      }
    }

    for (const field of daToFix) {
      const da = getInheritableProperty({ dict: field, key: "DA" });
      if (!da) {
        // No DA in a parent field, we can set the default one.
        field.set("DA", acroFormDefaultAppearance);
      }
    }
    const resourcesValuesCache = new Map();
    const fixAppearanceResources = async stream => {
      let resources = stream.dict.getRaw("Resources");
      resources &&= this.xrefWrapper.fetchIfRef(resources);
      if (!(resources instanceof Dict)) {
        const newResourcesRef = await resourcesValuesCache.getOrInsertComputed(
          acroFormDefaultResources,
          () => this.#cloneObject(acroFormDefaultResources, xref)
        );
        stream.dict.set("Resources", newResourcesRef);
        return;
      }
      for (const [
        resKey,
        resValue,
      ] of acroFormDefaultResources.getRawEntries()) {
        if (resources.has(resKey)) {
          continue;
        }
        let newResValue = resValue;
        if (resValue instanceof Ref) {
          newResValue = await this.#collectDependencies(resValue, true, xref);
        } else if (
          resValue instanceof Dict ||
          resValue instanceof BaseStream ||
          Array.isArray(resValue)
        ) {
          newResValue = await resourcesValuesCache.getOrInsertComputed(
            resValue,
            () => this.#cloneObject(resValue, xref)
          );
        }
        resources.set(resKey, newResValue);
      }
    };

    for (const field of drToFix) {
      const ap = field.get("AP");
      for (const [, value] of ap) {
        if (value instanceof BaseStream) {
          await fixAppearanceResources(value);
        } else if (value instanceof Dict) {
          for (const [, stream] of value) {
            if (stream instanceof BaseStream) {
              await fixAppearanceResources(stream);
            }
          }
        }
      }
    }
  }

  async #collectPageLabels() {
    // We can only preserve page labels when editing a single PDF file.
    // This is consistent with behavior in Adobe Acrobat.
    if (!this.isSingleFile) {
      return;
    }
    const firstRealPage = this.oldPages.find(p => !!p);
    if (!firstRealPage) {
      return;
    }
    const {
      documentData: { document, pageLabels },
    } = firstRealPage;
    if (!pageLabels) {
      return;
    }
    const numPages = document.numPages;
    const labelsByPageIndex = new Map();
    const oldPageIndices = new Set(
      this.oldPages.filter(p => !!p).map(({ page: { pageIndex } }) => pageIndex)
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
        currentLabel = this.cloneDict(currentLabel);
        currentLabel.set("St", st + (i - stFirstIndex));
        stFirstIndex = -1;
      }
      labelsByPageIndex.set(i, currentLabel);
    }

    const defaultLabel = index => {
      const label = new Dict();
      label.setIfName("S", "D");
      label.set("St", index + 1);
      return label;
    };
    currentLabel = null;
    const newPageLabels = (this.pageLabels = []);
    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      const pageData = this.oldPages[i];
      const label = pageData
        ? labelsByPageIndex.get(pageData.page.pageIndex) || defaultLabel(i)
        : defaultLabel(i);
      if (label === currentLabel) {
        continue;
      }
      currentLabel = label;
      newPageLabels.push([i, currentLabel]);
    }
  }

  /**
   * Create a copy of a page.
   * @param {number} pageIndex
   * @returns {Promise<Ref>} the page reference in the new PDF document.
   */
  async #makePageCopy(pageIndex) {
    const { page, documentData, annotations, pointingNamedDestinations } =
      this.oldPages[pageIndex];
    this.currentDocument = documentData;
    const { dedupNamedDestinations, oldRefMapping } = documentData;
    const { xref, rotate, mediaBox, resources, ref: oldPageRef } = page;
    const pageRef = this.newRef;
    const pageDict = (this.xref[pageRef.num] = this.cloneDict(page.pageDict));
    oldRefMapping.put(oldPageRef, pageRef);

    if (pointingNamedDestinations) {
      for (const pointingDest of pointingNamedDestinations) {
        const name = dedupNamedDestinations.get(pointingDest) || pointingDest;
        const dest = this.namedDestinations.get(name);
        dest[0] = pageRef;
      }
    }

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

    let newAnnots = null;

    if (annotations) {
      const newAnnotations = await this.#collectDependencies(
        annotations,
        true,
        xref
      );
      this.#fixNamedDestinations(newAnnotations, dedupNamedDestinations);
      if (Array.isArray(newAnnotations) && newAnnotations.length > 0) {
        newAnnots = newAnnotations;
      }
    }

    const newAnnotations =
      documentData.document === this.#primaryDocument
        ? this.#newAnnotationsParams?.newAnnotationsByPage?.get(page.pageIndex)
        : null;
    if (newAnnotations) {
      const { handler, task, imagesPromises } = this.#newAnnotationsParams;
      const changes = new RefSetCache();
      const newData = await AnnotationFactory.saveNewAnnotations(
        page.createAnnotationEvaluator(handler),
        this.xrefWrapper,
        task,
        newAnnotations,
        imagesPromises,
        changes
      );
      for (const [ref, { data }] of changes.items()) {
        this.xref[ref.num] = data;
      }
      newAnnots ||= [];
      for (const { ref } of newData.annotations) {
        newAnnots.push(ref);
      }
    }

    pageDict.setIfArray("Annots", newAnnots);

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

  #modalPageSize() {
    const counts = new Map();
    for (const pageData of this.oldPages) {
      if (!pageData) {
        continue;
      }
      const { page } = pageData;
      const [x0, y0, x1, y1] = page.view;
      let width = x1 - x0;
      let height = y1 - y0;
      if (width <= 0 || height <= 0) {
        continue;
      }
      // The synthesized page won't carry a /Rotate entry, so swap dimensions
      // for 90/270 to match what the user sees in the source page.
      if (page.rotate % 180 !== 0) {
        [width, height] = [height, width];
      }
      const key = `${width}x${height}`;
      const entry = counts.get(key);
      if (entry) {
        entry.count++;
      } else {
        counts.set(key, { width, height, count: 1 });
      }
    }
    if (counts.size === 0) {
      const [, , width, height] = LETTER_SIZE_MEDIABOX;
      return { width, height };
    }
    let best = null;
    for (const entry of counts.values()) {
      if (
        !best ||
        entry.count > best.count ||
        (entry.count === best.count &&
          entry.width * entry.height > best.width * best.height)
      ) {
        best = entry;
      }
    }
    return { width: best.width, height: best.height };
  }

  /**
   * Create a brand-new page that displays a single image, sized to the modal
   * page dimensions with a margin equal to 10% of the page width on every
   * side. The image is encoded as JPEG or lossless Flate depending on its
   * contents; when the source has transparency, an SMask carrying the alpha
   * channel is attached so the mask is preserved on render.
   * @param {ImageBitmap} bitmap
   * @param {{width: number, height: number}} pageSize
   * @returns {Promise<Ref>}
   */
  async #makeImagePage(bitmap, pageSize) {
    const { width: pageW, height: pageH } = pageSize;
    const DEFAULT_MARGIN_RATIO = 0.1;
    const margin = pageW * DEFAULT_MARGIN_RATIO;
    const availW = Math.max(1, pageW - 2 * margin);
    const availH = Math.max(1, pageH - 2 * margin);

    const lastRef = this.newRefCount;

    const {
      imageStream,
      smaskStream,
      width: imgW,
      height: imgH,
    } = await createImage(bitmap, this.xrefWrapper, { closeBitmap: true });

    const scale = Math.min(availW / imgW, availH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const tx = (pageW - drawW) / 2;
    const ty = (pageH - drawH) / 2;

    if (smaskStream) {
      const smaskRef = this.newRef;
      this.xref[smaskRef.num] = smaskStream;
      imageStream.dict.set("SMask", smaskRef);
    }
    const imageRef = this.newRef;
    this.xref[imageRef.num] = imageStream;

    const xobjectDict = new Dict(this.xrefWrapper);
    xobjectDict.set("Im0", imageRef);
    const resourcesDict = new Dict(this.xrefWrapper);
    resourcesDict.set("XObject", xobjectDict);
    resourcesDict.set("ProcSet", [Name.get("PDF"), Name.get("ImageC")]);

    const content =
      `q ${numberToString(drawW)} 0 0 ${numberToString(drawH)} ` +
      `${numberToString(tx)} ${numberToString(ty)} cm /Im0 Do Q`;
    const contentsStream = new StringStream(
      content,
      new Dict(this.xrefWrapper)
    );
    const contentsRef = this.newRef;
    this.xref[contentsRef.num] = contentsStream;

    const pageRef = this.newRef;
    const pageDict = (this.xref[pageRef.num] = new Dict(this.xrefWrapper));
    pageDict.setIfName("Type", "Page");
    pageDict.set("MediaBox", [0, 0, pageW, pageH]);
    pageDict.set("Resources", resourcesDict);
    pageDict.set("Contents", contentsRef);

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
   * @param {Array<[string|number, any]>} map
   * @returns {Ref}
   */
  #makeNameNumTree(map, areNames) {
    const allEntries = map.sort(
      areNames
        ? ([keyA], [keyB]) => {
            if (keyA < keyB) {
              return -1;
            }
            if (keyA > keyB) {
              return 1;
            }
            return 0;
          }
        : ([keyA], [keyB]) => keyA - keyB
    );
    const maxLeaves =
      MAX_IN_NAME_TREE_NODE <= 1 ? allEntries.length : MAX_IN_NAME_TREE_NODE;
    const [treeRef, treeDict] = this.newDict;
    const stack = [{ dict: treeDict, entries: allEntries, isRoot: true }];
    const valueType = areNames ? "Names" : "Nums";

    while (stack.length > 0) {
      const { dict, entries, isRoot } = stack.pop();
      if (entries.length <= maxLeaves) {
        if (!isRoot) {
          dict.set("Limits", [entries[0][0], entries.at(-1)[0]]);
        }
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
    if (!pageLabels?.length) {
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
   * Collect and clone EmbeddedFiles from all source documents.
   * @param {Array<DocumentData>} allDocumentData
   */
  async #collectEmbeddedFiles(allDocumentData) {
    const { embeddedFiles } = this;
    for (const documentData of allDocumentData) {
      const {
        embeddedFiles: docEmbeddedFiles,
        document: { xref },
      } = documentData;
      if (!docEmbeddedFiles?.size) {
        continue;
      }
      this.currentDocument = documentData;
      for (const [key, valueRef] of docEmbeddedFiles) {
        let name = key;
        if (embeddedFiles.has(name)) {
          const displayName = stringToPDFString(
            key,
            /* keepEscapeSequence = */ true
          );
          for (let i = 1; ; i++) {
            const deduped = stringToAsciiOrUTF16BE(`${displayName}_${i}`);
            if (!embeddedFiles.has(deduped)) {
              name = deduped;
              break;
            }
          }
        }
        embeddedFiles.set(
          name,
          await this.#collectDependencies(valueRef, true, xref)
        );
      }
      this.currentDocument = null;
    }
  }

  #makeEmbeddedFilesTree() {
    const { embeddedFiles } = this;
    if (embeddedFiles.size === 0) {
      return;
    }
    if (!this.namesDict) {
      [this.namesRef, this.namesDict] = this.newDict;
      this.rootDict.set("Names", this.namesRef);
    }
    this.namesDict.set(
      "EmbeddedFiles",
      this.#makeNameNumTree(
        Array.from(embeddedFiles.entries()),
        /* areNames = */ true
      )
    );
  }

  #makeDestinationsTree() {
    const { namedDestinations } = this;
    if (namedDestinations.size === 0) {
      return;
    }
    if (!this.namesDict) {
      [this.namesRef, this.namesDict] = this.newDict;
      this.rootDict.set("Names", this.namesRef);
    }
    this.namesDict.set(
      "Dests",
      this.#makeNameNumTree(
        Array.from(namedDestinations, ([name, dest]) => [
          stringToAsciiOrUTF16BE(name),
          dest,
        ]),
        /* areNames = */ true
      )
    );
  }

  #makeStructTree() {
    const { structTreeKids } = this;
    if (!structTreeKids?.length) {
      return;
    }
    const { rootDict } = this;
    const structTreeRef = this.newRef;
    const structTree = (this.xref[structTreeRef.num] = new Dict());
    structTree.setIfName("Type", "StructTreeRoot");
    structTree.setIfArray("K", structTreeKids);
    for (const kidRef of structTreeKids) {
      const kid = this.xref[kidRef.num];
      const type = kid.get("Type");
      if (!type || isName(type, "StructElem")) {
        kid.set("P", structTreeRef);
      }
    }
    if (this.parentTree.size > 0) {
      const parentTreeRef = this.#makeNameNumTree(
        Array.from(this.parentTree.entries()),
        /* areNames = */ false
      );
      const parentTree = this.xref[parentTreeRef.num];
      parentTree.setIfName("Type", "ParentTree");
      structTree.set("ParentTree", parentTreeRef);
      structTree.set("ParentTreeNextKey", this.parentTree.size);
    }
    if (this.idTree.size > 0) {
      const idTreeRef = this.#makeNameNumTree(
        Array.from(this.idTree.entries()),
        /* areNames = */ true
      );
      const idTree = this.xref[idTreeRef.num];
      idTree.setIfName("Type", "IDTree");
      structTree.set("IDTree", idTreeRef);
    }
    if (this.classMap.size > 0) {
      const classMapRef = this.newRef;
      this.xref[classMapRef.num] = this.classMap;
      structTree.set("ClassMap", classMapRef);
    }
    if (this.roleMap.size > 0) {
      const roleMapRef = this.newRef;
      this.xref[roleMapRef.num] = this.roleMap;
      structTree.set("RoleMap", roleMapRef);
    }
    if (this.namespaces.size > 0) {
      const namespacesRef = this.newRef;
      this.xref[namespacesRef.num] = Array.from(this.namespaces.values());
      structTree.set("Namespaces", namespacesRef);
    }
    if (this.structTreeAF.length > 0) {
      const structTreeAFRef = this.newRef;
      this.xref[structTreeAFRef.num] = this.structTreeAF;
      structTree.set("AF", structTreeAFRef);
    }
    if (this.structTreePronunciationLexicon.length > 0) {
      const structTreePronunciationLexiconRef = this.newRef;
      this.xref[structTreePronunciationLexiconRef.num] =
        this.structTreePronunciationLexicon;
      structTree.set("PronunciationLexicon", structTreePronunciationLexiconRef);
    }
    rootDict.set("StructTreeRoot", structTreeRef);
  }

  #makeAcroForm() {
    if (this.fields.length === 0) {
      return;
    }
    const { rootDict } = this;
    const acroFormRef = this.newRef;
    const acroForm = (this.xref[acroFormRef.num] = new Dict());
    rootDict.set("AcroForm", acroFormRef);
    acroForm.set("Fields", this.fields);
    if (this.acroFormNeedAppearances) {
      acroForm.set("NeedAppearances", true);
    }
    if (this.acroFormSigFlags > 0) {
      acroForm.set("SigFlags", this.acroFormSigFlags);
    }
    acroForm.setIfArray("CO", this.acroFormCalculationOrder);
    acroForm.setIfDict("DR", this.acroFormDefaultResources);
    if (this.acroFormDefaultAppearance) {
      acroForm.set("DA", this.acroFormDefaultAppearance);
    }
    if (this.acroFormQ > 0) {
      acroForm.set("Q", this.acroFormQ);
    }
    // We don't merge XFA stuff because it'd require to parse, extract and merge
    // all the data, which is a lot of work for a deprecated feature (i.e. XFA).
  }

  /**
   * Create the root dictionary.
   * @returns {Promise<void>}
   */
  async #makeRoot() {
    const { rootDict } = this;
    rootDict.setIfName("Type", "Catalog");
    rootDict.setIfName("Version", this.version);
    this.#makeAcroForm();
    this.#makePageTree();
    this.#makePageLabelsTree();
    this.#makeEmbeddedFilesTree();
    this.#makeDestinationsTree();
    this.#makeStructTree();
    await this.#makeOutline();
  }

  /**
   * Create the info dictionary.
   * @returns {Map} infoMap
   */
  #makeInfo() {
    const infoMap = new Map();
    if (this.isSingleFile) {
      const firstRealPage = this.oldPages.find(p => !!p);
      const {
        xref: { trailer },
      } = firstRealPage.documentData.document;
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
    if (!this.isSingleFile) {
      return [null, null, null];
    }
    const firstRealPage = this.oldPages.find(p => !!p);
    const { documentData } = firstRealPage;
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
    const dict = new Dict();
    dict.setIfName("Type", "ObjStm");
    dict.set("N", objRefs.length);
    dict.set("First", streamBuffer[0].length + 1);
    const objStream = new StringStream(streamBuffer.join("\n"), dict);

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
    const header = stringToBytes(`%PDF-${this.version}\n%\xfa\xde\xfa\xce`);

    return incrementalUpdate({
      originalData: header,
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
