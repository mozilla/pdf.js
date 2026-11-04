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
  Name,
  Ref,
  RefMap,
  RefSet,
} from "./primitives.js";
import { Lexer, Parser } from "./parser.js";
import { Stream, StringStream } from "./stream.js";
import { BaseStream } from "./base_stream.js";
import { EvaluatorPreprocessor } from "./evaluator.js";
import { getTransformMatrix } from "./annotation.js";
import { numberToPDFString } from "./writer.js";

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

  #getResources;

  #intent;

  #page;

  constructor({ page, annotationStorage, changes, intent, getResources }) {
    this.#page = page;
    this.#annotationStorage = annotationStorage;
    this.#changes = changes;
    this.#changesXref = new ChangesXRefWrapper(changes, page.xref);
    this.#intent = intent;
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
   * @returns {Promise<object>} The removed refs (`removed`).
   */
  async flatten() {
    const page = this.#page;
    const changes = this.#changes;
    const annotationStorage = this.#annotationStorage;
    const intent = this.#intent;
    const { xref } = page;

    if (!(page.ref instanceof Ref)) {
      // Only indirect page dictionaries can be updated.
      return { removed: null };
    }
    const pageDict = changes.get(page.ref)?.data || page.pageDict.clone();
    const annotations = changes.has(page.ref)
      ? pageDict.get("Annots")
      : page.annotations;
    if (!Array.isArray(annotations) || annotations.length === 0) {
      return { removed: null };
    }

    // Parsed annotations supply visibility and generated appearances.
    const parsedAnnotations = new RefMap();
    for (const parsedAnnotation of await page._parsedAnnotations) {
      if (parsedAnnotation.ref) {
        parsedAnnotations.put(parsedAnnotation.ref, parsedAnnotation);
      }
    }

    const flattened = [];
    const kept = [];
    const removed = new RefSet();
    const removedPopups = new RefSet();
    const interactive = [];
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
      if (isName(subtype, "Widget")) {
        // Keep the form fields.
        kept.push({ annotation });
        continue;
      }
      const parsedAnnotation =
        annotation instanceof Ref ? parsedAnnotations.get(annotation) : null;
      const isModified = annotation instanceof Ref && changes.has(annotation);
      let isVisible;
      if (parsedAnnotation && !isModified) {
        // Edited annotations use their saved flags.
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
          flattened.push({ appearance, oc: dict.getRaw("OC") });
          interactive.push({ annotation, dict });
        }
        kept.push({ annotation });
        continue;
      }
      if (!appearance) {
        const isPopup = isName(subtype, "Popup");
        kept.push({
          annotation,
          isPopup,
          parent: isPopup ? dict.getRaw("Parent") : null,
        });
        continue;
      }
      // Remove the drawn annotations.
      if (annotation instanceof Ref) {
        removed.put(annotation);
        const popup = dict.getRaw("Popup");
        if (popup instanceof Ref) {
          removedPopups.put(popup);
        }
      }
      flattened.push({ appearance, oc: dict.getRaw("OC") });
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
      return { removed: null };
    }
    if (
      flattened.length > 0 &&
      !(await this.#drawFlattenedAppearances(pageDict, flattened))
    ) {
      // Keep annotations if the page content cannot be isolated.
      return { removed: null };
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
    return { removed };
  }

  /**
   * Isolate page content before appending appearances.
   * @returns {Promise<boolean>} Whether isolation succeeded.
   */
  async #drawFlattenedAppearances(pageDict, flattened) {
    const { xref } = this.#page;
    const changes = this.#changes;
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
    const { saves, unmatchedRestores, markedContent, inText } = unbalanced;
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
    for (const { appearance, oc } of flattened) {
      const transform = appearance.transform.map(numberToPDFString).join(" ");
      const name = addResource("XObject", "FlatAnnot", appearance.ref);
      const ocName = oc ? addResource("Properties", "FlatOC", oc) : null;

      if (ocName) {
        buffer.push(`/OC /${ocName} BDC`);
      }
      buffer.push(`q ${transform} cm /${name} Do Q`);
      if (ocName) {
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

/** Track unbalanced graphics/text/marked-content state. */
function getUnbalancedOperators(stream, xref) {
  const result = {
    saves: 0,
    unmatchedRestores: 0,
    markedContent: 0,
    inText: false,
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
      case OPS.beginMarkedContent:
      case OPS.beginMarkedContentProps:
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

/** Drop the pending writes of the removed annotations. */
function finalizeFlattening({ results, changes, xref }) {
  const removed = new RefSet();
  for (const result of results) {
    for (const ref of result.removed ?? []) {
      removed.put(ref);
    }
  }
  pruneChanges({ changes, removed, xref });
}

// Drop pending writes for removed annotations and orphaned new objects.
function pruneChanges({ changes, removed, xref }) {
  for (const ref of removed) {
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

export { finalizeFlattening, PageAnnotationFlattener };
