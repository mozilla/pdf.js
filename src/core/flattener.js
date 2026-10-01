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
  AnnotationFlag,
  BBOX_INIT,
  OPS,
  RenderingIntentFlag,
  Util,
  warn,
} from "../shared/util.js";
import {
  ChangesXRefWrapper,
  escapePDFName,
  getInheritableProperty,
  IDENTITY_MATRIX,
  lookupMatrix,
  lookupNormalRect,
  lookupRect,
} from "./core_utils.js";
import {
  Cmd,
  Dict,
  EOF,
  isCmd,
  isName,
  isRefsEqual,
  Name,
  Ref,
  RefMap,
  RefSet,
} from "./primitives.js";
import { getTransformMatrix, WidgetAnnotation } from "./annotation.js";
import { Lexer, Parser } from "./parser.js";
import { Stream, StringStream } from "./stream.js";
import { BaseStream } from "./base_stream.js";
import { EvaluatorPreprocessor } from "./evaluator.js";
import { numberToPDFString } from "./writer.js";
import { NumberTree } from "./name_number_tree.js";

// Keep these annotations interactive.
const INTERACTIVE_ANNOTATION_TYPES = new Set([
  "3D",
  "FileAttachment",
  "Link",
  "Movie",
  "RichMedia",
  "Screen",
  "Sound",
]);

class PageAnnotationFlattener {
  #annotationStorage;

  #changes;

  #changesXref;

  #evaluator;

  #flattenForms;

  #getResources;

  #intent;

  #page;

  #structTree;

  #task;

  constructor({
    page,
    annotationStorage,
    changes,
    flattenForms,
    intent,
    structTree,
    getResources,
  }) {
    this.#page = page;
    this.#annotationStorage = annotationStorage;
    this.#changes = changes;
    this.#changesXref = new ChangesXRefWrapper(changes, page.xref);
    this.#flattenForms = flattenForms;
    this.#intent = intent;
    this.#structTree = structTree;
    this.#getResources = getResources;
  }

  async #fetch(obj) {
    try {
      return await this.#changesXref.fetchIfRefAsync(obj);
    } catch (ex) {
      warn(`flattenAnnotations - cannot fetch "${obj}": "${ex}".`);
      return null;
    }
  }

  /**
   * Draw appearances visible for the intent. Call after saving annotations.
   * @returns {Promise<object>} Widget presence before/after flattening
   *   (`hadWidgets`/`hasWidgets`), removed refs (`removed`), and structure
   *   tags (`tags`). Presence is conservative if flattening is skipped.
   */
  async flatten(handler, task) {
    const page = this.#page;
    const changes = this.#changes;
    const annotationStorage = this.#annotationStorage;
    const flattenForms = this.#flattenForms;
    const intent = this.#intent;
    const structTree = this.#structTree;
    const { xref } = page;

    if (!(page.ref instanceof Ref)) {
      // Only indirect page dictionaries can be updated.
      const hasWidgets = (await page._parsedAnnotations).some(
        annotation => annotation instanceof WidgetAnnotation
      );
      return { hadWidgets: hasWidgets, hasWidgets, removed: null, tags: null };
    }
    const pageDict = changes.get(page.ref)?.data || page.pageDict.clone();
    const annotations = changes.has(page.ref)
      ? pageDict.get("Annots")
      : page.annotations;
    if (!Array.isArray(annotations) || annotations.length === 0) {
      return {
        hadWidgets: false,
        hasWidgets: false,
        removed: null,
        tags: null,
      };
    }

    // Parsed annotations supply visibility and generated appearances.
    const parsedAnnotations = new RefMap();
    for (const parsedAnnotation of await page._parsedAnnotations) {
      if (parsedAnnotation.ref) {
        parsedAnnotations.put(parsedAnnotation.ref, parsedAnnotation);
      }
    }
    this.#evaluator = page._createPartialEvaluator(handler);
    this.#task = task;

    const flattened = [];
    const kept = [];
    const removed = new RefSet();
    const removedPopups = new RefSet();
    const tags = [];
    const interactive = [];
    let hasWidgets = false,
      hadWidgets = false;
    for (const annotation of annotations) {
      const dict = await this.#fetch(annotation);
      if (!(dict instanceof Dict)) {
        continue;
      }
      let subtype, flags;
      try {
        subtype = dict.get("Subtype");
        flags = dict.get("F");
      } catch (ex) {
        // Keep annotations whose subtype or flags cannot be read.
        warn(`flattenAnnotations - ignoring annotation: "${ex}".`);
        kept.push({ annotation });
        continue;
      }
      const isWidget = isName(subtype, "Widget");
      hadWidgets ||= isWidget;
      // Preserve barcode widgets, which TextWidgetAnnotation hides.
      if (isWidget && (!flattenForms || dict.has("PMD"))) {
        hasWidgets = true;
        kept.push({ annotation });
        continue;
      }
      const parsedAnnotation =
        annotation instanceof Ref ? parsedAnnotations.get(annotation) : null;
      const isModified = annotation instanceof Ref && changes.has(annotation);
      let isVisible;
      if (parsedAnnotation && (!isModified || isWidget)) {
        // Widgets use stored visibility; edited annotations use saved flags.
        isVisible =
          intent & RenderingIntentFlag.PRINT
            ? parsedAnnotation.mustBePrinted(annotationStorage)
            : parsedAnnotation.mustBeViewed(
                annotationStorage,
                /* renderForms = */ false
              );
      } else {
        isVisible =
          (intent & RenderingIntentFlag.PRINT
            ? !!(flags & AnnotationFlag.PRINT)
            : !(flags & AnnotationFlag.NOVIEW)) &&
          !(flags & AnnotationFlag.HIDDEN);
      }
      let appearance = null;
      if (isVisible) {
        try {
          appearance = await this.#getAppearanceToFlatten({
            dict,
            parsedAnnotation,
            isModified,
          });
        } catch (ex) {
          warn(`flattenAnnotations - cannot get the appearance: "${ex}".`);
        }
      }

      if (
        subtype instanceof Name &&
        INTERACTIVE_ANNOTATION_TYPES.has(subtype.name)
      ) {
        // Clear retained appearances after drawing them in page content.
        if (appearance && annotation instanceof Ref) {
          flattened.push({ appearance, oc: dict.getRaw("OC"), tag: null });
          interactive.push({ annotation, dict });
        }
        kept.push({ annotation });
        continue;
      }
      if (!appearance && (!isWidget || isVisible)) {
        // Keep visible widgets without drawable appearances.
        hasWidgets ||= isWidget;
        const isPopup = isName(subtype, "Popup");
        kept.push({
          annotation,
          isPopup,
          parent: isPopup ? dict.getRaw("Parent") : null,
        });
        continue;
      }
      // Remove drawn annotations and widgets hidden for this intent.
      let tag = null;
      if (annotation instanceof Ref) {
        removed.put(annotation);
        const popup = dict.getRaw("Popup");
        if (popup instanceof Ref) {
          removedPopups.put(popup);
        }
        tag = structTree?.getTag(dict) ?? null;
        if (tag) {
          tag.annotation = annotation;
          tags.push(tag);
        }
      }
      if (appearance) {
        flattened.push({ appearance, oc: dict.getRaw("OC"), tag });
      }
    }

    const newAnnotations = [];
    // Use both /Parent and /Popup to find popups of removed annotations.
    for (const { annotation, isPopup, parent } of kept) {
      if (
        !isPopup ||
        !(
          (parent instanceof Ref && removed.has(parent)) ||
          (annotation instanceof Ref && removedPopups.has(annotation))
        )
      ) {
        newAnnotations.push(annotation);
      } else if (annotation instanceof Ref) {
        removed.put(annotation);
      }
    }
    if (
      newAnnotations.length === annotations.length &&
      flattened.length === 0
    ) {
      return { hadWidgets, hasWidgets, removed: null, tags: null };
    }
    if (
      flattened.length > 0 &&
      !(await this.#drawFlattenedAppearances(pageDict, flattened))
    ) {
      // Keep annotations if the page content cannot be isolated.
      return { hadWidgets, hasWidgets: hadWidgets, removed: null, tags: null };
    }
    pageDict.set("Annots", newAnnotations);

    if (interactive.length > 0) {
      const emptyAppearanceDict = new Dict(xref);
      emptyAppearanceDict.setIfName("Subtype", "Form");
      emptyAppearanceDict.set("BBox", [0, 0, 1, 1]);
      const emptyAppearanceRef = xref.getNewTemporaryRef();
      changes.put(emptyAppearanceRef, {
        data: new StringStream("", emptyAppearanceDict),
      });
      for (const { annotation, dict } of interactive) {
        const ap = new Dict(xref);
        ap.set("N", emptyAppearanceRef);
        const newDict = dict.clone();
        newDict.set("AP", ap);
        newDict.delete("AS");
        changes.put(annotation, { data: newDict });
      }
    }

    changes.put(page.ref, {
      data: pageDict,
    });
    return { hadWidgets, hasWidgets, removed, tags };
  }

  /**
   * Isolate page content before appending appearances.
   * @returns {Promise<boolean>} Whether isolation succeeded.
   */
  async #drawFlattenedAppearances(pageDict, flattened) {
    const { xref } = this.#page;
    const changes = this.#changes;
    const structTree = this.#structTree;
    let contentStream, unbalanced, resources;
    try {
      contentStream = await this.#page.getContentStream();
      unbalanced = getUnbalancedOperators(contentStream, xref);
      // Preserve stream resources before converting /Contents to an array.
      resources = await this.#getResources(contentStream.dict);
    } catch (ex) {
      warn(`flattenAnnotations - cannot parse the page content: "${ex}".`);
      return false;
    }
    const { saves, unmatchedRestores, markedContent, inText, lastMCID } =
      unbalanced;
    let contents;
    if (unmatchedRestores > 0) {
      // Unmatched Qs would consume the wrapper's save instead of being ignored.
      const data = removeUnmatchedRestores(
        contentStream,
        unmatchedRestores,
        xref
      );
      if (!data) {
        return false;
      }
      const contentRef = xref.getNewTemporaryRef();
      changes.put(contentRef, {
        data: new Stream(data, 0, data.length, new Dict(xref)),
      });
      contents = [contentRef];
    } else {
      contents = pageDict.getRaw("Contents");
      if (contents instanceof Ref) {
        const obj = await this.#fetch(contents);
        if (Array.isArray(obj)) {
          contents = obj;
        }
      }
      if (!Array.isArray(contents)) {
        contents = contents ? [contents] : [];
      }
    }

    resources = resources.clone();
    const newResources = new Map();
    // Reuse names for shared appearance and optional-content references.
    const resourceNames = new Map();
    const addResource = (key, prefix, value) => {
      const id = value instanceof Ref ? `${key}_${value}` : null;
      if (id && resourceNames.has(id)) {
        return resourceNames.get(id);
      }
      let dict = newResources.get(key);
      if (!dict) {
        let oldDict = null;
        try {
          oldDict = resources.get(key);
        } catch (ex) {
          warn(`flattenAnnotations - cannot get the resources: "${ex}".`);
        }
        dict = oldDict instanceof Dict ? oldDict.clone() : new Dict(xref);
        newResources.set(key, dict);
      }
      let i = dict.size;
      while (dict.has(`${prefix}${i}`)) {
        i++;
      }
      const name = `${prefix}${i}`;
      dict.set(name, value);
      if (id) {
        resourceNames.set(id, name);
      }
      return name;
    };

    const buffer = [];
    let mcid = structTree?.getNextMCID(pageDict, lastMCID);
    for (const { appearance, oc, tag } of flattened) {
      const transform = appearance.transform.map(numberToPDFString).join(" ");
      const name = addResource("XObject", "FlatAnnot", appearance.ref);
      const ocName = oc ? addResource("Properties", "FlatOC", oc) : null;

      // Link the structure element to this marked content.
      if (tag?.type) {
        tag.mcid = mcid++;
        buffer.push(`/${escapePDFName(tag.type)} <</MCID ${tag.mcid}>> BDC`);
      }
      if (ocName) {
        buffer.push(`/OC /${ocName} BDC`);
      }
      buffer.push(`q ${transform} cm /${name} Do Q`);
      if (ocName) {
        buffer.push("EMC");
      }
      if (tag?.type) {
        buffer.push("EMC");
      }
    }
    for (const [key, dict] of newResources) {
      resources.set(key, dict);
    }
    pageDict.set("Resources", resources);

    // Close open text/marked content and restore the wrapper's saved state.
    const close =
      (inText ? "ET\n" : "") +
      "EMC\n".repeat(markedContent) +
      "Q\n".repeat(saves + 1);
    const saveRef = xref.getNewTemporaryRef();
    const restoreRef = xref.getNewTemporaryRef();
    changes.put(saveRef, {
      data: new StringStream("q\n", new Dict(xref)),
    });
    changes.put(restoreRef, {
      data: new StringStream(
        `\n${close}${buffer.join("\n")}\n`,
        new Dict(xref)
      ),
    });
    pageDict.set("Contents", [saveRef, ...contents, restoreRef]);
    return true;
  }

  async #getAppearanceToFlatten({ dict, parsedAnnotation, isModified }) {
    let rect = lookupNormalRect(dict.getArray("Rect"), null);
    let ref = null,
      appearance = null;
    if (parsedAnnotation instanceof WidgetAnnotation) {
      // Generate field appearances from stored edits or NeedAppearances.
      appearance = await parsedAnnotation.getFlattenedAppearance(
        this.#evaluator,
        this.#task,
        this.#annotationStorage,
        this.#intent
      );
      if (appearance === false) {
        return null;
      }
    }

    if (!appearance) {
      const ap = await this.#fetch(dict.getRaw("AP"));
      if (ap instanceof Dict) {
        ref = ap.getRaw("N");
        appearance = await this.#fetch(ref);
        if (appearance instanceof Dict) {
          // Select the normal appearance for the saved state.
          const state = dict.get("AS");
          ref = state instanceof Name ? appearance.getRaw(state.name) : null;
          appearance = await this.#fetch(ref);
        }
      } else if (
        !isModified &&
        parsedAnnotation?.appearance &&
        isSelfContained(parsedAnnotation.appearance)
      ) {
        // Use the rectangle computed for the generated appearance.
        ({ appearance } = parsedAnnotation);
        rect = parsedAnnotation.data.rect;
      }
    }
    if (!(appearance instanceof BaseStream) || !rect) {
      return null;
    }

    // Match rendering's BBox fallback and translation for degenerate boxes.
    const size = [0, 0, rect[2] - rect[0], rect[3] - rect[1]];
    const matrix = lookupMatrix(
      appearance.dict?.getArray("Matrix"),
      IDENTITY_MATRIX
    );
    const originalBBox = lookupRect(appearance.dict?.getArray("BBox"), null);
    let bbox = originalBBox ?? size;
    const transform = getTransformMatrix(rect, bbox, matrix);
    const box = BBOX_INIT.slice();
    Util.axialAlignedBoundingBox(bbox, matrix, box);
    if (box[0] === box[2] || box[1] === box[3]) {
      bbox = BBOX_INIT.slice();
      Util.axialAlignedBoundingBox(size, Util.inverseTransform(matrix), bbox);
      if (!bbox.every(Number.isFinite)) {
        bbox = size;
      }
    }
    if (!transform.every(Number.isFinite) || !bbox.every(Number.isFinite)) {
      return null;
    }

    if (
      !(ref instanceof Ref) ||
      !isName(appearance.dict?.get("Subtype"), "Form") ||
      bbox !== originalBBox
    ) {
      // Serialize the appearance as a Form XObject for Do.
      appearance = this.#copyObject(appearance, bbox);
      appearance.dict.setIfName("Subtype", "Form");
      appearance.dict.set("BBox", bbox);
      ref = this.#page.xref.getNewTemporaryRef();
      this.#changes.put(ref, { data: appearance });
    }
    return { ref, transform };
  }

  /**
   * Copy direct objects and decoded streams, preserving existing references.
   * Make nested streams indirect; fill missing Form BBoxes from the enclosing
   * stream or the caller's fallback.
   */
  #copyObject(obj, bbox) {
    if (obj instanceof BaseStream) {
      bbox = lookupRect(obj.dict?.getArray("BBox"), bbox);
      const dict = obj.dict
        ? this.#copyObject(obj.dict, bbox)
        : new Dict(this.#page.xref);
      dict.delete("Filter");
      dict.delete("DecodeParms");
      dict.delete("Length");
      if (
        isName(dict.get("Subtype"), "Form") &&
        !lookupRect(dict.getArray("BBox"), null)
      ) {
        dict.set("BBox", bbox);
      }
      obj.reset();
      const bytes = obj.getBytes();
      obj.reset();
      return new Stream(bytes, 0, bytes.length, dict);
    }

    const toIndirect = value => {
      const copy = this.#copyObject(value, bbox);
      if (!(copy instanceof BaseStream)) {
        return copy;
      }
      const ref = this.#page.xref.getNewTemporaryRef();
      this.#changes.put(ref, { data: copy });
      return ref;
    };
    if (obj instanceof Dict) {
      const dict = new Dict(this.#page.xref);
      for (const [key, value] of obj.getRawEntries()) {
        dict.set(key, toIndirect(value));
      }
      return dict;
    }
    return Array.isArray(obj) ? obj.map(toIndirect) : obj;
  }
}

/**
 * Track unbalanced graphics/text/marked-content state and the largest inline
 * MCID.
 */
function getUnbalancedOperators(stream, xref) {
  const result = {
    saves: 0,
    unmatchedRestores: 0,
    markedContent: 0,
    inText: false,
    lastMCID: -1,
  };
  const preprocessor = new EvaluatorPreprocessor(stream, xref);
  const operation = {
    fn: 0,
    args: [],
  };
  while (true) {
    operation.args.length = 0;

    if (!preprocessor.read(operation)) {
      break;
    }
    switch (operation.fn | 0) {
      case OPS.save:
        result.saves++;
        break;
      case OPS.restore:
        if (result.saves > 0) {
          result.saves--;
        } else {
          result.unmatchedRestores++;
        }
        break;
      case OPS.beginText:
        result.inText = true;
        break;
      case OPS.endText:
        result.inText = false;
        break;
      case OPS.beginMarkedContentProps: {
        const props = operation.args[1];
        const mcid = props instanceof Dict ? props.get("MCID") : null;
        if (Number.isInteger(mcid) && mcid > result.lastMCID) {
          result.lastMCID = mcid;
        }
        result.markedContent++;
        break;
      }
      case OPS.beginMarkedContent:
        result.markedContent++;
        break;
      case OPS.endMarkedContent:
        if (result.markedContent > 0) {
          result.markedContent--;
        }
        break;
    }
  }
  return result;
}

/**
 * Replace unmatched Q operators with spaces, preserving other source bytes.
 * @returns {Uint8Array|null} The content, or null if it can't be fixed.
 */
function removeUnmatchedRestores(stream, count, xref) {
  try {
    stream.reset();
    const data = stream.getBytes().slice();
    const lexer = new Lexer(new Stream(data), EvaluatorPreprocessor.opMap);
    let saves = 0,
      nesting = 0;
    for (let obj = lexer.getObj(); obj !== EOF; obj = lexer.getObj()) {
      while (isCmd(obj, "BI")) {
        // Skip inline-image bytes before resuming the operator scan.
        const parser = new Parser({ lexer, xref });
        parser.makeInlineImage(null);
        obj = parser.buf2;
      }
      if (!(obj instanceof Cmd)) {
        continue;
      }
      switch (obj.cmd) {
        case "[":
        case "<<":
          // Ignore q/Q tokens inside array and dictionary operands.
          nesting++;
          break;
        case "]":
        case ">>":
          nesting = Math.max(nesting - 1, 0);
          break;
        case "q":
          if (nesting === 0) {
            saves++;
          }
          break;
        case "Q":
          if (nesting > 0) {
            break;
          }
          if (saves > 0) {
            saves--;
            break;
          }
          // Lexer.currentChar is the lookahead after Q.
          const end =
            lexer.currentChar < 0 ? data.length : lexer.stream.pos - 1;
          data[end - 1] = /* ' ' = */ 0x20;
          count--;
          break;
      }
    }
    // Require the same unmatched-restore count as getUnbalancedOperators.
    return count === 0 ? data : null;
  } catch (ex) {
    warn(`flattenAnnotations - cannot remove the unmatched restores: "${ex}".`);
    return null;
  }
}

// Reject references that may point to unsaved in-memory resources.
function isSelfContained(obj) {
  if (obj instanceof Ref) {
    return false;
  }
  if (obj instanceof BaseStream) {
    return !obj.dict || isSelfContained(obj.dict);
  }
  return obj instanceof Dict
    ? obj.getRawValues().every(isSelfContained)
    : !Array.isArray(obj) || obj.every(isSelfContained);
}

/** Update structure tags and return the AcroForm dictionary to retain. */
async function finalizeFlattening({
  results,
  structTree,
  manager,
  acroForm,
  acroFormRef,
  catalogRef,
  changes,
  xref,
  flattenForms,
}) {
  const changesXref = new ChangesXRefWrapper(changes, xref);
  const getDict = obj => {
    try {
      const data = changesXref.fetchIfRef(obj);
      return data instanceof Dict ? data : null;
    } catch {
      return null;
    }
  };
  if (structTree) {
    for (const { pageRef, tags } of results) {
      if (tags?.length > 0 && pageRef instanceof Ref) {
        structTree.update({ pageRef, tags });
      }
    }
    structTree.save();
  }
  const removed = new RefSet();
  for (const result of results) {
    for (const ref of result.removed ?? []) {
      removed.put(ref);
    }
  }
  const keepAcroForm =
    !flattenForms ||
    !(catalogRef instanceof Ref) ||
    // No page widgets were found.
    !results.some(({ hadWidgets }) => hadWidgets) ||
    results.some(({ hasWidgets }) => hasWidgets) ||
    // SigFlags may declare signatures without page widgets.
    (await manager.ensureDoc("formInfo")).hasSignatures;
  if (!keepAcroForm) {
    const catalog = getDict(catalogRef);
    if (catalog instanceof Dict && catalog.has("AcroForm")) {
      const newCatalog = catalog.clone();
      newCatalog.delete("AcroForm");
      changes.put(catalogRef, { data: newCatalog });
    }
    acroForm = null;
  } else if (flattenForms && acroForm instanceof Dict) {
    acroForm = pruneFields({
      acroForm,
      acroFormRef,
      catalogRef,
      changes,
      removed,
      getDict,
    });
  }
  pruneChanges({
    changes,
    removed,
    removeFields: !keepAcroForm,
    xref,
    getDict,
  });
  return acroForm;
}

// Prune removed widgets and empty ancestor fields from the retained form.
function pruneFields({
  acroForm,
  acroFormRef,
  catalogRef,
  changes,
  removed,
  getDict,
}) {
  const visited = new RefSet();
  const pruneKids = kids => {
    const newKids = [];
    let modified = false;
    for (const kid of kids) {
      const dict = getDict(kid);
      if (kid instanceof Ref) {
        if (
          removed.has(kid) &&
          // Retain signature fields even when their widgets leave the page.
          !(dict && isName(getInheritableProperty({ dict, key: "FT" }), "Sig"))
        ) {
          modified = true;
          continue;
        }
        if (visited.has(kid)) {
          newKids.push(kid);
          continue;
        }
        visited.put(kid);
      }
      const grandKids = dict?.get("Kids");
      const newGrandKids =
        Array.isArray(grandKids) && grandKids.length > 0
          ? pruneKids(grandKids)
          : grandKids;
      if (newGrandKids === grandKids) {
        newKids.push(kid);
        continue;
      }
      modified = true;
      if (newGrandKids.length === 0) {
        if (kid instanceof Ref) {
          removed.put(kid);
        }
        continue;
      }
      const newDict = dict.clone();
      newDict.set("Kids", newGrandKids);
      if (kid instanceof Ref) {
        changes.put(kid, { ...changes.get(kid), data: newDict });
        newKids.push(kid);
      } else {
        newKids.push(newDict);
      }
    }
    return modified ? newKids : kids;
  };

  const fields = acroForm.get("Fields");
  if (!Array.isArray(fields)) {
    return acroForm;
  }
  const newFields = pruneKids(fields);
  const co = acroForm.get("CO");
  const newCO = Array.isArray(co)
    ? co.filter(ref => !(ref instanceof Ref && removed.has(ref)))
    : co;
  if (newFields === fields && newCO?.length === co?.length) {
    return acroForm;
  }
  acroForm = acroForm.clone();
  acroForm.set("Fields", newFields);
  if (Array.isArray(newCO)) {
    acroForm.set("CO", newCO);
  }
  if (acroFormRef) {
    changes.put(acroFormRef, { data: acroForm });
  } else if (catalogRef instanceof Ref) {
    // The form is directly in the catalog.
    const catalog = getDict(catalogRef);
    if (catalog instanceof Dict) {
      const newCatalog = catalog.clone();
      newCatalog.set("AcroForm", acroForm);
      changes.put(catalogRef, { data: newCatalog });
    }
  }
  return acroForm;
}

// Drop pending writes for removed annotations/fields and orphaned new objects.
function pruneChanges({ changes, removed, removeFields, xref, getDict }) {
  const pruned = new RefSet(removed);
  if (removeFields) {
    for (const refStr of removed) {
      for (
        let parent = getDict(Ref.fromString(refStr))?.getRaw("Parent");
        parent instanceof Ref && !pruned.has(parent);
        parent = getDict(parent)?.getRaw("Parent")
      ) {
        pruned.put(parent);
      }
    }
  }
  for (const ref of pruned) {
    changes.remove(ref);
  }

  // Trace new objects reachable from updates to existing objects.
  const isNew = ref => !xref.getEntry(ref.num);
  const used = new RefSet();
  const visit = obj => {
    if (obj instanceof Ref) {
      if (isNew(obj) && changes.has(obj) && !used.has(obj)) {
        used.put(obj);
        visit(changes.get(obj).data);
      }
    } else if (obj instanceof BaseStream) {
      visit(obj.dict);
    } else if (obj instanceof Dict) {
      for (const value of obj.getRawValues()) {
        visit(value);
      }
    } else if (Array.isArray(obj)) {
      for (const value of obj) {
        visit(value);
      }
    }
  };
  for (const [ref, { data }] of changes.items()) {
    if (!isNew(ref)) {
      visit(data);
    }
  }
  for (const ref of changes.keys()) {
    if (isNew(ref) && !used.has(ref)) {
      changes.remove(ref);
    }
  }
}

/**
 * Replace annotation OBJRs with marked-content references in flat parent trees.
 * For other readable parent trees, remove the OBJRs without adding references.
 */
class StructTreeFlattener {
  #changes;

  #changesXref;

  // The entries of a flat parent tree.
  #entries = null;

  #isModified = false;

  #numberTree = null;

  #parentTree = null;

  #parentTreeRef = null;

  #root;

  #rootRef;

  #xref;

  constructor({ changes, root, rootRef, xref }) {
    this.#changes = changes;
    this.#changesXref = new ChangesXRefWrapper(changes, xref);
    this.#root = root;
    this.#rootRef = rootRef;
    this.#xref = xref;

    const parentTreeRef = root.getRaw("ParentTree");
    const parentTree = this.#fetch(parentTreeRef);
    if (!(parentTree instanceof Dict)) {
      return;
    }
    const nums = this.#fetch(parentTree.getRaw("Nums"));
    if (!parentTree.has("Kids") && Array.isArray(nums)) {
      this.#entries = new Map();
      for (let i = 0, ii = nums.length - 1; i < ii; i += 2) {
        if (Number.isInteger(nums[i])) {
          this.#entries.set(nums[i], nums[i + 1]);
        }
      }
      this.#parentTree = parentTree;
      this.#parentTreeRef = parentTreeRef;
    } else if (!this.#changes.has(parentTreeRef)) {
      // Read other parent trees through the original xref.
      this.#numberTree = new NumberTree(parentTreeRef, xref);
    }
  }

  static create({ catalogRef, changes, xref }) {
    try {
      const changesXref = new ChangesXRefWrapper(changes, xref);
      const rootRef = changesXref
        .fetchIfRef(catalogRef)
        ?.getRaw("StructTreeRoot");
      const root = changesXref.fetchIfRef(rootRef);
      return rootRef instanceof Ref && root instanceof Dict
        ? new StructTreeFlattener({ changes, root, rootRef, xref })
        : null;
    } catch (ex) {
      warn(`StructTreeFlattener: "${ex}".`);
      return null;
    }
  }

  #fetch(obj) {
    return this.#changesXref.fetchIfRef(obj);
  }

  /**
   * @returns {object | null} The structure element of the annotation (`ref`),
   *   and its type (`type`) when its marked content can be referenced.
   */
  getTag(annotationDict) {
    try {
      const structParent = annotationDict.get("StructParent");
      if (!Number.isInteger(structParent)) {
        return null;
      }
      const ref = this.#entries
        ? this.#entries.get(structParent)
        : this.#numberTree?.getRaw(structParent);
      const element = this.#fetch(ref);
      if (!(ref instanceof Ref) || !(element instanceof Dict)) {
        return null;
      }
      const type = element.get("S");
      return {
        ref,
        structParent,
        type: this.#entries && type instanceof Name ? type.name : null,
      };
    } catch (ex) {
      warn(`StructTreeFlattener.getTag: "${ex}".`);
      return null;
    }
  }

  /**
   * @returns {number} The first marked content id to use in the page content.
   */
  getNextMCID(pageDict, lastMCID) {
    const parents = this.#fetch(
      this.#entries?.get(pageDict.get("StructParents"))
    );
    return Math.max(lastMCID + 1, Array.isArray(parents) ? parents.length : 0);
  }

  /**
   * @param {object} params
   * @param {Ref} params.pageRef
   * @param {Array<object>} params.tags - The tags of the removed annotations,
   *   with the marked content id (`mcid`) of the ones drawn in the page.
   */
  update({ pageRef, tags }) {
    const xref = this.#xref;
    let parents = null;
    for (const { annotation, mcid, ref, structParent } of tags) {
      let mcr = null;
      if (this.#entries && Number.isInteger(mcid)) {
        mcr = new Dict(xref);
        mcr.set("Type", Name.get("MCR"));
        mcr.set("Pg", pageRef);
        mcr.set("MCID", mcid);
        parents ??= this.#getParents(pageRef);
        while (parents.length < mcid) {
          parents.push(null);
        }
        parents[mcid] = ref;
      }
      this.#replaceObjectReference(ref, annotation, mcr);
      if (this.#entries?.delete(structParent)) {
        this.#isModified = true;
      }
    }
  }

  // Copy or create the page's parent-tree entry.
  #getParents(pageRef) {
    const pageDict = this.#changes.get(pageRef).data;
    let key = pageDict.get("StructParents");
    let parents = this.#fetch(this.#entries.get(key));
    if (Number.isInteger(key) && Array.isArray(parents)) {
      parents = parents.slice();
    } else {
      key = this.#root.get("ParentTreeNextKey");
      if (!Number.isInteger(key) || key < 0) {
        key = 0;
      }
      for (const entryKey of this.#entries.keys()) {
        key = Math.max(key, entryKey + 1);
      }
      this.#root = this.#root.clone();
      this.#root.set("ParentTreeNextKey", key + 1);
      pageDict.set("StructParents", key);
      parents = [];
    }
    this.#entries.set(key, parents);
    this.#isModified = true;
    return parents;
  }

  #replaceObjectReference(ref, annotation, replacement) {
    const element = this.#fetch(ref);
    if (!(element instanceof Dict)) {
      return;
    }
    const rawKids = element.getRaw("K");
    const kids = this.#fetch(rawKids);
    const newKids = [];
    let found = false;
    for (const kid of Array.isArray(kids) ? kids : [rawKids]) {
      const obj = this.#fetch(kid);
      const objRef =
        obj instanceof Dict && isName(obj.get("Type"), "OBJR")
          ? obj.getRaw("Obj")
          : null;
      if (
        objRef instanceof Ref &&
        annotation instanceof Ref &&
        isRefsEqual(objRef, annotation)
      ) {
        found = true;
        if (replacement) {
          newKids.push(replacement);
        }
        continue;
      }
      newKids.push(kid);
    }
    if (found) {
      const newElement = element.clone();
      newElement.set("K", newKids);
      this.#changes.put(ref, { data: newElement });
    }
  }

  save() {
    if (!this.#isModified) {
      return;
    }
    const xref = this.#xref;
    const nums = [];
    for (const key of [...this.#entries.keys()].sort((a, b) => a - b)) {
      nums.push(key, this.#entries.get(key));
    }
    const parentTree = this.#parentTree.clone();
    parentTree.set("Nums", nums);
    let parentTreeRef = this.#parentTreeRef;
    if (!(parentTreeRef instanceof Ref)) {
      parentTreeRef = xref.getNewTemporaryRef();
      this.#root = this.#root.clone();
      this.#root.set("ParentTree", parentTreeRef);
    }
    this.#changes.put(parentTreeRef, { data: parentTree });
    this.#changes.put(this.#rootRef, { data: this.#root });
  }
}

export { finalizeFlattening, PageAnnotationFlattener, StructTreeFlattener };
