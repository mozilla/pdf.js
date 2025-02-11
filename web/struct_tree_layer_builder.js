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

import { removeNullCharacters } from "./ui_utils.js";

const PDF_ROLE_TO_HTML_ROLE = {
  // Document level structure types
  Document: null, // There's a "document" role, but it doesn't make sense here.
  DocumentFragment: null,
  // Grouping level structure types
  Part: "group",
  Sect: "group", // XXX: There's a "section" role, but it's abstract.
  Div: "group",
  Aside: "note",
  NonStruct: "none",
  // Block level structure types
  P: null,
  // H<n>,
  H: "heading",
  Title: null,
  FENote: "note",
  // Sub-block level structure type
  Sub: "group",
  // General inline level structure types
  Lbl: null,
  Span: null,
  Em: null,
  Strong: null,
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
  THead: "columnheader",
  TBody: null,
  TFoot: null,
  // Standard structure type Caption
  Caption: null,
  // Standard structure type Figure
  Figure: "figure",
  // Standard structure type Formula
  Formula: null,
  // standard structure type Artifact
  Artifact: null,
};

const HEADING_PATTERN = /^H(\d+)$/;

/**
 * @typedef {Object} StructTreeLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {Object} rawDims
 */

class StructTreeLayerBuilder {
  #promise;

  #treeDom = null;

  #treePromise;

  #elementAttributes = new Map();

  #rawDims;

  #elementsToAddToTextLayer = null;

  /**
   * @param {StructTreeLayerBuilderOptions} options
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
      this.#treeDom = this.#walk(await this.#promise);
    } catch (ex) {
      reject(ex);
    }
    this.#promise = null;

    this.#treeDom?.classList.add("structTree");
    resolve(this.#treeDom);

    return promise;
  }

  async getAriaAttributes(annotationId) {
    try {
      await this.render();
      return this.#elementAttributes.get(annotationId);
    } catch {
      // If the structTree cannot be fetched, parsed, and/or rendered,
      // ensure that e.g. the AnnotationLayer won't break completely.
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

  #setAttributes(structElement, htmlElement) {
    const { alt, id, lang } = structElement;
    if (alt !== undefined) {
      // Don't add the label in the struct tree layer but on the annotation
      // in the annotation layer.
      let added = false;
      const label = removeNullCharacters(alt);
      for (const child of structElement.children) {
        if (child.type === "annotation") {
          let attrs = this.#elementAttributes.get(child.id);
          if (!attrs) {
            attrs = new Map();
            this.#elementAttributes.set(child.id, attrs);
          }
          attrs.set("aria-label", label);
          added = true;
        }
      }
      if (!added) {
        htmlElement.setAttribute("aria-label", label);
      }
    }
    if (id !== undefined) {
      htmlElement.setAttribute("aria-owns", id);
    }
    if (lang !== undefined) {
      htmlElement.setAttribute(
        "lang",
        removeNullCharacters(lang, /* replaceInvisible = */ true)
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

  addElementsToTextLayer() {
    if (!this.#elementsToAddToTextLayer) {
      return;
    }
    for (const [id, img] of this.#elementsToAddToTextLayer) {
      document.getElementById(id)?.append(img);
    }
    this.#elementsToAddToTextLayer.clear();
    this.#elementsToAddToTextLayer = null;
  }

  #walk(node) {
    if (!node) {
      return null;
    }

    const element = document.createElement("span");
    if ("role" in node) {
      const { role } = node;
      const match = role.match(HEADING_PATTERN);
      if (match) {
        element.setAttribute("role", "heading");
        element.setAttribute("aria-level", match[1]);
      } else if (PDF_ROLE_TO_HTML_ROLE[role]) {
        element.setAttribute("role", PDF_ROLE_TO_HTML_ROLE[role]);
      }
      if (role === "Figure" && this.#addImageInTextLayer(node, element)) {
        return element;
      }
    }

    this.#setAttributes(node, element);

    if (node.children) {
      if (node.children.length === 1 && "id" in node.children[0]) {
        // Often there is only one content node so just set the values on the
        // parent node to avoid creating an extra span.
        this.#setAttributes(node.children[0], element);
      } else {
        for (const kid of node.children) {
          element.append(this.#walk(kid));
        }
      }
    }
    return element;
  }
}

export { StructTreeLayerBuilder };
