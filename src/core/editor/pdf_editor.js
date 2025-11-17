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

import { Dict, isName, Name, Ref, RefSet, RefSetCache } from "../primitives.js";
import { getModificationDate, stringToPDFString } from "../../shared/util.js";
import { incrementalUpdate, writeValue } from "../writer.js";
import { NameTree, NumberTree } from "../name_number_tree.js";
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
  }
}

class XRefWrapper {
  constructor(entries) {
    this.entries = entries;
  }

  fetch(ref) {
    return ref instanceof Ref ? this.entries[ref.num] : ref;
  }
}

class PDFEditor {
  constructor({ useObjectStreams = true, title = "", author = "" } = {}) {
    this.hasSingleFile = false;
    this.currentDocument = null;
    this.oldPages = [];
    this.newPages = [];
    this.xref = [null];
    this.xrefWrapper = new XRefWrapper(this.xref);
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
    this.namedDestinations = new Map();
    this.parentTree = new Map();
    this.structTreeKids = [];
    this.idTree = new Map();
    this.classMap = new Dict();
    this.roleMap = new Dict();
    this.namespaces = new Map();
    this.structTreeAF = [];
    this.structTreePronunciationLexicon = [];
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
      const oldRef = obj;
      obj = await xref.fetchAsync(oldRef);
      if (typeof obj === "number") {
        // Simple value; no need to create a new reference.
        return obj;
      }

      newRef = this.newRef;
      oldRefMapping.put(oldRef, newRef);

      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
        if (
          obj instanceof Dict &&
          isName(obj.get("Type"), "Page") &&
          !this.currentDocument.pagesMap.has(oldRef)
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
    const {
      currentDocument: { postponedRefCopies },
    } = this;
    if (Array.isArray(obj)) {
      if (mustClone) {
        obj = obj.slice();
      }
      for (let i = 0, ii = obj.length; i < ii; i++) {
        const postponedActions = postponedRefCopies.get(obj[i]);
        if (postponedActions) {
          // The object is a reference that needs to be copied later.
          postponedActions.push(ref => (obj[i] = ref));
          continue;
        }
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
        const postponedActions = postponedRefCopies.get(rawObj);
        if (postponedActions) {
          // The object is a reference that needs to be copied later.
          postponedActions.push(ref => dict.set(key, ref));
          continue;
        }
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
    let kids;
    const k = (kids = node.getRaw("K"));
    if (k instanceof Ref) {
      // We're only interested by ref referencing nodes and not an array.
      if (visited.has(k)) {
        return null;
      }
      kids = await xref.fetchAsync(k);
      if (!Array.isArray(kids)) {
        kids = [k];
      }
    }
    kids = Array.isArray(kids) ? kids : [kids];
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
        const newKidRef = oldRefMapping.get(kidRef);
        if (!newKidRef) {
          continue;
        }
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
      if (newClassName) {
        newNode.set("C", Name.get(newClassName));
      } else {
        newNode.set("C", classNames);
      }
    } else if (Array.isArray(classNames)) {
      const newClassNames = [];
      for (const className of classNames) {
        if (className instanceof Name) {
          const newClassName = dedupClasses.get(className.name);
          if (newClassName) {
            newClassNames.push(Name.get(newClassName));
          } else {
            newClassNames.push(className);
          }
        }
      }
      newNode.set("C", newClassNames);
    }

    // Fix the role name.
    const roleName = node.get("S");
    if (roleName instanceof Name) {
      const newRoleName = dedupRoles.get(roleName.name);
      if (newRoleName) {
        newNode.set("S", Name.get(newRoleName));
      } else {
        newNode.set("S", roleName);
      }
    }

    // Fix the ID.
    const id = node.get("ID");
    if (typeof id === "string") {
      const stringId = stringToPDFString(id, /* keepEscapeSequence = */ false);
      const newId = dedupIDs.get(stringId);
      if (newId) {
        newNode.set("ID", stringToAsciiOrUTF16BE(newId));
      } else {
        newNode.set("ID", id);
      }
    }

    // Table headers may contain IDs that need to be deduplicated.
    let attributes = newNode.get("A");
    if (attributes) {
      if (!Array.isArray(attributes)) {
        attributes = [attributes];
      }
      for (let attr of attributes) {
        attr = this.xrefWrapper.fetch(attr);
        if (isName(attr.get("O"), "Table") && attr.has("Headers")) {
          const headers = this.xrefWrapper.fetch(attr.getRaw("Headers"));
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
    const allDocumentData = [];
    for (const { document, includePages, excludePages } of pageInfos) {
      if (!document) {
        continue;
      }
      const documentData = new DocumentData(document);
      allDocumentData.push(documentData);
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

    this.#collectValidDestinations(allDocumentData);
    this.#collectPageLabels();

    for (const page of this.oldPages) {
      promises.push(this.#postCollectPageData(page));
    }
    await Promise.all(promises);

    this.#findDuplicateNamedDestinations();
    this.#setPostponedRefCopies(allDocumentData);

    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      this.newPages[i] = await this.#makePageCopy(i, null);
    }

    this.#fixPostponedRefCopies(allDocumentData);
    await this.#mergeStructTrees(allDocumentData);

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
      documentData: { pagesMap, destinations, usedNamedDestinations },
    } = pageData;

    if (!annotations) {
      return;
    }

    const promises = [];
    let newAnnotations = [];
    let newIndex = 0;

    // Filter out annotations that are linking to deleted pages.
    for (const annotationRef of annotations) {
      const newAnnotationIndex = newIndex++;
      promises.push(
        xref.fetchIfRefAsync(annotationRef).then(async annotationDict => {
          if (!isName(annotationDict.get("Subtype"), "Link")) {
            newAnnotations[newAnnotationIndex] = annotationRef;
            return;
          }
          const action = annotationDict.get("A");
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
          } else if (typeof dest === "string") {
            const destString = stringToPDFString(
              dest,
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

      // Visit the new page in order to collect used StructParent entries.
      this.#visitObject(pageDict, dict => {
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
      });
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
      let kids = structTreeRoot.dict.get("K");
      if (!kids) {
        continue;
      }
      kids = Array.isArray(kids) ? kids : [kids];
      for (let kid of kids) {
        const kidRef = kid instanceof Ref ? kid : null;
        if (kidRef && removedStructElements.has(kidRef)) {
          continue;
        }
        kid = await xref.fetchIfRefAsync(kid);
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
        }
      }

      // Fix the ID tree.
      for (const [id, nodeRef] of idTree || []) {
        const newNodeRef = oldRefMapping.get(nodeRef);
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
        const pageData = pagesMap.get(pageRef);
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
    for (let i = 0, ii = this.oldPages.length; i < ii; i++) {
      const page = this.oldPages[i];
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
        const newName = `${pointingDest}_p${i + 1}`;
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
        currentLabel = this.cloneDict(currentLabel);
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

    if (annotations) {
      const newAnnotations = await this.#collectDependencies(
        annotations,
        true,
        xref
      );
      this.#fixNamedDestinations(newAnnotations, dedupNamedDestinations);
      pageDict.setIfArray("Annots", newAnnotations);
    }

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
   * @param {Array<[string|number, any]>} map
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
        Array.from(namedDestinations.entries()),
        /* areNames = */ true
      )
    );
  }

  #makeStructTree() {
    const { structTreeKids } = this;
    if (!structTreeKids || structTreeKids.length === 0) {
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

  /**
   * Create the root dictionary.
   * @returns {Promise<void>}
   */
  async #makeRoot() {
    const { rootDict } = this;
    rootDict.setIfName("Type", "Catalog");
    rootDict.setIfName("Version", this.version);
    this.#makePageTree();
    this.#makePageLabelsTree();
    this.#makeDestinationsTree();
    this.#makeStructTree();
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
