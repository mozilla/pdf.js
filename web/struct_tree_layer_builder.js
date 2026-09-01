/* Copyright 2021 Mozilla Foundation
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

/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */

import { FeatureTest, getUuid, makeMap, shadow } from "pdfjs-lib";
import { removeNullCharacters } from "./ui_utils.js";

const PDF_ROLE_TO_HTML_ROLE = {
  // Document level structure types
  Document: null, // There's a "document" role, but it doesn't make sense here.
  DocumentFragment: null,
  // Grouping level structure types
  Part: "group",
  Art: "article",
  Sect: "group", // XXX: There's a "section" role, but it's abstract.
  Div: "group",
  BlockQuote: "blockquote",
  Aside: "note",
  NonStruct: "none",
  // Block level structure types
  P: "paragraph",
  // H<n>,
  H: "heading",
  Title: null,
  FENote: "note",
  // Sub-block level structure type
  Sub: "group",
  // General inline level structure types
  Lbl: null,
  Span: null,
  Em: "emphasis",
  Strong: "strong",
  Note: "note",
  Code: "code",
  Link: "link",
  Annot: "note",
  Form: "form",
  // Ruby and Warichu structure types
  Ruby: null,
  RB: null,
  RT: null,
  RP: null,
  Warichu: null,
  WT: null,
  WP: null,
  // List standard structure types
  L: "list",
  LI: "listitem",
  LBody: null,
  // Table standard structure types
  Table: "table",
  TR: "row",
  TH: "columnheader",
  TD: "cell",
  THead: "rowgroup",
  TBody: "rowgroup",
  TFoot: "rowgroup",
  // Standard structure type Caption
  Caption: "caption",
  // Standard structure type Figure
  Figure: "figure",
  // Standard structure type Formula
  Formula: null,
  // standard structure type Artifact
  Artifact: null,
};

// WAI-ARIA prohibits accessible names on these roles:
// https://www.w3.org/TR/wai-aria-1.2/#namefromprohibited
const ARIA_ROLES_WITH_PROHIBITED_NAMES = new Set([
  "caption",
  "code",
  "emphasis",
  "generic",
  "none",
  "paragraph",
  "strong",
]);

const MathMLElements = new Set([
  "math",
  "merror",
  "mfrac",
  "mi",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mprescripts",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "semantics",
]);
const MathMLNamespace = "http://www.w3.org/1998/Math/MathML";

class MathMLSanitizer {
  static get sanitizer() {
    // From https://w3c.github.io/mathml-docs/mathml-safe-list.

    return shadow(
      this,
      "sanitizer",
      FeatureTest.isSanitizerSupported
        ? new Sanitizer({
            elements: Array.from(MathMLElements.keys(), name => ({
              name,
              namespace: MathMLNamespace,
            })),
            replaceWithChildrenElements: [
              {
                name: "maction",
                namespace: MathMLNamespace,
              },
            ],
            attributes: [
              "dir",
              "displaystyle",
              "mathbackground",
              "mathcolor",
              "mathsize",
              "scriptlevel",
              "encoding",
              "display",
              "linethickness",
              "intent",
              "arg",
              "form",
              "fence",
              "separator",
              "lspace",
              "rspace",
              "stretchy",
              "symmetric",
              "maxsize",
              "minsize",
              "largeop",
              "movablelimits",
              "width",
              "height",
              "depth",
              "voffset",
              "accent",
              "accentunder",
              "columnspan",
              "rowspan",
            ],
            comments: false,
          })
        : null
    );
  }
}

const HEADING_PATTERN = /^H(\d+)$/;

/**
 * @typedef {object} StructTreeLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {object} rawDims
 */

class StructTreeLayerBuilder {
  #promise;

  #treeDom = null;

  #treePromise;

  #annotationIds = new Set();

  #elementAttributes = new Map();

  #pendingLinkOwnership = new Map();

  #linkTextId = 0;

  #structElementIdPrefix = `pdfjs_internal_struct_${getUuid()}_`;

  #structElementIds = new Map();

  #structElements = new Map();

  #rawDims;

  #elementsToAddToTextLayer = null;

  #elementsToHideInTextLayer = null;

  #elementsToStealFromTextLayer = null;

  /**
   * @param {PDFPageProxy} pdfPage
   * @param {object} rawDims
   */
  constructor(pdfPage, rawDims) {
    this.#promise = pdfPage.getStructTree();
    this.#rawDims = rawDims;
  }

  /**
   * @returns {Promise<void>}
   */
  async render() {
    if (this.#treePromise) {
      return this.#treePromise;
    }
    const { promise, resolve, reject } = Promise.withResolvers();
    this.#treePromise = promise;

    try {
      const tree = await this.#promise;
      this.#collectStructElements(tree);
      this.#collectAnnotations(tree);
      this.#treeDom = this.#walk(tree);
    } catch (ex) {
      reject(ex);
    }
    this.#promise = null;

    this.#treeDom?.classList.add("structTree");
    resolve(this.#treeDom);

    return promise;
  }

  /**
   * @param {string} annotationId
   * @param {object} [options]
   * @param {boolean} [options.enableLinkOwnership]
   * @returns {Promise<Map<string, string>|null|undefined>}
   */
  async getAriaAttributes(annotationId, { enableLinkOwnership = false } = {}) {
    try {
      await this.render();
      const ownership = this.#pendingLinkOwnership.get(annotationId);
      if (ownership && enableLinkOwnership) {
        const { element, ids } = ownership;
        element.removeAttribute("role");
        if (ids.length > 0) {
          this.#elementAttributes
            .getOrInsertComputed(annotationId, makeMap)
            .set("aria-owns", ids.join(" "));
        }
        this.#pendingLinkOwnership.delete(annotationId);
      }
      return this.#elementAttributes.get(annotationId);
    } catch {
      // If the structTree cannot be fetched, parsed, and/or rendered,
      // ensure that e.g. the AnnotationLayer won't break completely.
    }
    return null;
  }

  /**
   * Get the ids of annotations owned by the structure tree.
   * @returns {Promise<Set<string>|null>}
   */
  async getAnnotationIds() {
    try {
      await this.render();
      return this.#annotationIds;
    } catch {
      // See the comment in `getAriaAttributes`.
    }
    return null;
  }

  hide() {
    if (this.#treeDom && !this.#treeDom.hidden) {
      this.#treeDom.hidden = true;
    }
  }

  show() {
    if (this.#treeDom?.hidden) {
      this.#treeDom.hidden = false;
    }
  }

  #collectStructElements(node) {
    if (!node) {
      return;
    }
    // Structure element IDs must be unique within the structure hierarchy;
    // keep the first element when a malformed document reuses an ID.
    if (node.structId) {
      this.#structElements.getOrInsert(node.structId, node);
    }
    for (const child of node.children || []) {
      this.#collectStructElements(child);
    }
  }

  #collectAnnotations(node) {
    if (!node) {
      return;
    }
    if (node.type === "annotation") {
      this.#annotationIds.add(node.id);
      return;
    }
    for (const child of node.children || []) {
      this.#collectAnnotations(child);
    }
  }

  #getStructElementId(structId) {
    return this.#structElementIds.getOrInsertComputed(
      structId,
      () => `${this.#structElementIdPrefix}${this.#structElementIds.size}`
    );
  }

  #getHeaderIds(headers) {
    const result = [],
      visited = new Set(),
      pending = headers.toReversed();

    while (pending.length > 0) {
      const structId = pending.pop();
      if (visited.has(structId)) {
        continue;
      }
      visited.add(structId);

      // The core retains table structure elements from other pages but omits
      // their marked content. `Alt` or `Short` can still provide accessible
      // text.
      const header = this.#structElements.get(structId);
      if (header?.role !== "TH") {
        continue;
      }
      result.push(this.#getStructElementId(structId));

      // A header may itself refer to other headers. Include those
      // recursively, as required by ISO 32000-1, Table 349.
      if (header.headers) {
        for (let i = header.headers.length - 1; i >= 0; i--) {
          pending.push(header.headers[i]);
        }
      }
    }
    return result;
  }

  #setAttributes(structElement, htmlElement) {
    const {
      alt,
      colSpan,
      headers,
      id,
      lang,
      rowSpan,
      short,
      structId,
      summary,
    } = structElement;
    if (alt !== undefined) {
      // Don't add the label in the struct tree layer but on the annotation
      // in the annotation layer.
      let added = false;
      const label = removeNullCharacters(alt);
      for (const child of structElement.children) {
        if (child.type === "annotation") {
          this.#elementAttributes
            .getOrInsertComputed(child.id, makeMap)
            .set("aria-label", label);
          added = true;
        }
      }
      const role =
        htmlElement.getAttribute("role") ||
        (htmlElement.localName === "span" ? "generic" : null);
      // Global ARIA attributes cause user agents to ignore `role="none"` and
      // expose the element's implicit role instead. Keep NonStruct elements
      // presentational so that only their descendants reach assistive
      // technologies.
      if (!added && role !== "none") {
        // A role which cannot be named can still be described, so expose the
        // alternative text that way instead of dropping it.
        htmlElement.setAttribute(
          ARIA_ROLES_WITH_PROHIBITED_NAMES.has(role)
            ? "aria-description"
            : "aria-label",
          label
        );
      }
    }
    if (id !== undefined) {
      htmlElement.setAttribute("aria-owns", id);
    }
    if (
      structId !== undefined &&
      this.#structElements.get(structId) === structElement
    ) {
      const elementId = this.#getStructElementId(structId);
      if (short !== undefined) {
        // `Short` is the PDF 2.0 abbreviated form of a TH element's content
        // (see ISO 32000-2, Table 384). Keep the header's own accessible name
        // and expose the abbreviation through a hidden target used by
        // referring cells. `aria-describedby` includes directly referenced
        // hidden content, while an unreferenced hidden child does not
        // contribute to its parent's name.
        const abbreviation = document.createElement("span");
        abbreviation.setAttribute("id", elementId);
        abbreviation.setAttribute("aria-hidden", "true");
        abbreviation.textContent = removeNullCharacters(short);
        htmlElement.append(abbreviation);
      } else {
        htmlElement.setAttribute("id", elementId);
      }
    }
    if (lang !== undefined) {
      htmlElement.setAttribute(
        "lang",
        removeNullCharacters(lang, /* replaceInvisible = */ true)
      );
    }
    if (rowSpan !== undefined) {
      htmlElement.setAttribute("aria-rowspan", rowSpan);
    }
    if (colSpan !== undefined) {
      htmlElement.setAttribute("aria-colspan", colSpan);
    }
    if (headers?.length > 0) {
      const headerIds = this.#getHeaderIds(headers);
      if (headerIds.length > 0) {
        htmlElement.setAttribute("aria-describedby", headerIds.join(" "));
      }
    }
    if (summary !== undefined) {
      htmlElement.setAttribute(
        "aria-description",
        removeNullCharacters(summary)
      );
    }
  }

  #addImageInTextLayer(node, element) {
    const { alt, bbox, children } = node;
    const child = children?.[0];
    if (!this.#rawDims || !alt || !bbox || child?.type !== "content") {
      return false;
    }

    const { id } = child;
    if (!id) {
      return false;
    }

    // We cannot add the created element to the text layer immediately, as the
    // text layer might not be ready yet. Instead, we store the element and add
    // it later in `addElementsToTextLayer`.

    element.setAttribute("aria-owns", id);
    const img = document.createElement("span");
    (this.#elementsToAddToTextLayer ||= new Map()).set(id, img);
    img.setAttribute("role", "img");
    img.setAttribute("aria-label", removeNullCharacters(alt));

    const { pageHeight, pageX, pageY } = this.#rawDims;
    const calc = "calc(var(--total-scale-factor) *";
    const { style } = img;
    style.width = `${calc}${bbox[2] - bbox[0]}px)`;
    style.height = `${calc}${bbox[3] - bbox[1]}px)`;
    style.left = `${calc}${bbox[0] - pageX}px)`;
    style.top = `${calc}${pageHeight - bbox[3] + pageY}px)`;

    return true;
  }

  updateTextLayer() {
    if (this.#elementsToAddToTextLayer) {
      for (const [id, img] of this.#elementsToAddToTextLayer) {
        document.getElementById(id)?.append(img);
      }
      this.#elementsToAddToTextLayer.clear();
      this.#elementsToAddToTextLayer = null;
    }
    if (this.#elementsToHideInTextLayer) {
      for (const id of this.#elementsToHideInTextLayer) {
        const elem = document.getElementById(id);
        if (elem) {
          elem.ariaHidden = true;
        }
      }
      this.#elementsToHideInTextLayer.length = 0;
      this.#elementsToHideInTextLayer = null;
    }
    if (this.#elementsToStealFromTextLayer) {
      for (
        let i = 0, ii = this.#elementsToStealFromTextLayer.length;
        i < ii;
        i += 2
      ) {
        const element = this.#elementsToStealFromTextLayer[i];
        const ids = this.#elementsToStealFromTextLayer[i + 1];
        let textContent = "";
        for (const id of ids) {
          const elem = document.getElementById(id);
          if (elem) {
            textContent += elem.textContent.trim() || "";
            // Aria-hide the element in order to avoid duplicate reading of the
            // math content by screen readers.
            elem.ariaHidden = "true";
          }
        }
        if (textContent) {
          element.textContent = textContent;
        }
      }
      this.#elementsToStealFromTextLayer.length = 0;
      this.#elementsToStealFromTextLayer = null;
    }
  }

  #collectIds(node, ids) {
    if (!node) {
      return;
    }
    if ("id" in node) {
      ids.push(node.id);
    }
    for (const kid of node.children || []) {
      this.#collectIds(kid, ids);
    }
  }

  #walk(node, parentNodes = []) {
    if (!node) {
      return null;
    }

    let element;
    let visitChildren = true;
    if ("role" in node) {
      const { role } = node;
      if (MathMLElements.has(role)) {
        element = document.createElementNS(MathMLNamespace, role);
        const ids = [];
        (this.#elementsToStealFromTextLayer ||= []).push(element, ids);
        for (const { type, id } of node.children || []) {
          if (type === "content" && id) {
            ids.push(id);
          }
        }
      } else {
        element = document.createElement("span");
      }
      const match = role.match(HEADING_PATTERN);
      if (match) {
        element.setAttribute("role", "heading");
        element.setAttribute("aria-level", match[1]);
      } else if (PDF_ROLE_TO_HTML_ROLE[role]) {
        let htmlRole = PDF_ROLE_TO_HTML_ROLE[role];
        if (role === "TH") {
          if (node.scope === "Row") {
            htmlRole = "rowheader";
          } else if (node.scope === "Column") {
            htmlRole = "columnheader";
          } else if (
            parentNodes.at(-1)?.role === "TR" &&
            parentNodes.at(-2)?.role === "TBody"
          ) {
            // ARIA has no role for a header applying to both axes. Use the
            // existing positional fallback for Both and for an omitted Scope.
            htmlRole = "rowheader";
          }
        } else if (role === "Caption") {
          // ARIA's caption role requires a table, grid, treegrid, or figure
          // context and SHOULD be a direct child. This builder only produces
          // table and figure among those roles.
          const parentRole = parentNodes.at(-1)?.role;
          if (parentRole !== "Table" && parentRole !== "Figure") {
            htmlRole = null;
          }
        }
        if (htmlRole) {
          element.setAttribute("role", htmlRole);
        }
      }
      if (role === "Figure" && this.#addImageInTextLayer(node, element)) {
        return element;
      }
      if (role === "Formula") {
        if (node.mathML && MathMLSanitizer.sanitizer) {
          visitChildren = false;
          element.setHTML(node.mathML, {
            sanitizer: MathMLSanitizer.sanitizer,
          });
          // Hide all the corresponding content elements in the text layer in
          // order to avoid screen readers reading both the MathML and the
          // text content.
          this.#collectIds(node, (this.#elementsToHideInTextLayer ||= []));
          // For now, we don't want to keep the alt text if there's valid
          // MathML (see https://github.com/w3c/mathml-aam/issues/37).
          // TODO: Revisit this decision in the future.
          delete node.alt;
        }
        if (
          !node.mathML &&
          node.children.length === 1 &&
          node.children[0].role !== "math"
        ) {
          element = document.createElementNS(MathMLNamespace, "math");
          delete node.alt;
        }
      }
    }

    element ||= document.createElement("span");

    this.#setAttributes(node, element);

    if (node.children) {
      if (
        node.children.length === 1 &&
        !("role" in node.children[0]) &&
        "id" in node.children[0] &&
        element.getAttribute("role") !== "none"
      ) {
        // Often there is only one content node so just set the values on the
        // parent node to avoid creating an extra span. Note that this must be
        // limited to leaf children: a structure element has to be visited in
        // order to get its own role and attributes. A presentational parent
        // must keep a child span since setting the child's global ARIA
        // attributes on the parent would cause its role to be ignored.
        this.#setAttributes(node.children[0], element);
      } else if (visitChildren) {
        parentNodes.push(node);
        for (const kid of node.children) {
          element.append(this.#walk(kid, parentNodes));
        }
        parentNodes.pop();
      }
    }
    if (node.role === "Link") {
      const annotations = node.children?.filter(
        child => child.type === "annotation"
      );
      if (annotations?.length === 1) {
        const annotation = annotations[0];
        const ids = [];
        for (const child of element.children) {
          if (child.getAttribute("aria-owns") === annotation.id) {
            continue;
          }
          child.id ||= `${this.#structElementIdPrefix}link_${this.#linkTextId++}`;
          ids.push(child.id);
        }
        // Keep the structure-tree Link as a fallback until a stable, visible
        // link annotation explicitly takes ownership of these children.
        this.#pendingLinkOwnership.set(annotation.id, { element, ids });
      }
    }
    return element;
  }
}

export { StructTreeLayerBuilder };
