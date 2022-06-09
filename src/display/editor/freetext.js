/* Copyright 2022 Mozilla Foundation
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
  assert,
  LINE_FACTOR,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { bindEvents } from "./tools.js";
import { PixelsPerInch } from "../display_utils.js";

/**
 * Basic text editor in order to create a FreeTex annotation.
 */
class FreeTextEditor extends AnnotationEditor {
  #color;

  #content = "";

  #contentHTML = "";

  #fontSize;

  static _freeTextDefaultContent = "";

  static _l10nPromise;

  static _internalPadding = 0;

  constructor(params) {
    super({ ...params, name: "freeTextEditor" });
    this.#color = params.color || "CanvasText";
    this.#fontSize = params.fontSize || 10;
  }

  static initialize(l10n) {
    this._l10nPromise = l10n.get("freetext_default_content");
    const style = getComputedStyle(document.documentElement);

    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      const lineHeight = parseFloat(
        style.getPropertyValue("--freetext-line-height"),
        10
      );
      assert(
        lineHeight === LINE_FACTOR,
        "Update the CSS variable to agree with the constant."
      );
    }

    this._internalPadding = parseFloat(
      style.getPropertyValue("--freetext-padding"),
      10
    );
  }

  /** @inheritdoc */
  copy() {
    const editor = new FreeTextEditor({
      parent: this.parent,
      id: this.parent.getNextId(),
      x: this.x,
      y: this.y,
    });

    editor.width = this.width;
    editor.height = this.height;
    editor.#color = this.#color;
    editor.#fontSize = this.#fontSize;
    editor.#content = this.#content;
    editor.#contentHTML = this.#contentHTML;

    return editor;
  }

  /** @inheritdoc */
  getInitialTranslation() {
    // The start of the base line is where the user clicked.
    return [
      -FreeTextEditor._internalPadding * this.parent.zoomFactor,
      -(FreeTextEditor._internalPadding + this.#fontSize) *
        this.parent.zoomFactor,
    ];
  }

  /** @inheritdoc */
  rebuild() {
    if (this.div === null) {
      return;
    }

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  /** @inheritdoc */
  enableEditMode() {
    super.enableEditMode();
    this.overlayDiv.classList.remove("enabled");
    this.div.draggable = false;
  }

  /** @inheritdoc */
  disableEditMode() {
    super.disableEditMode();
    this.overlayDiv.classList.add("enabled");
    this.div.draggable = true;
  }

  /** @inheritdoc */
  onceAdded() {
    if (this.width) {
      // The editor was created in using ctrl+c.
      this.div.focus();
      return;
    }
    this.enableEditMode();
    this.editorDiv.focus();
  }

  /** @inheritdoc */
  isEmpty() {
    return this.editorDiv.innerText.trim() === "";
  }

  /**
   * Extract the text from this editor.
   * @returns {string}
   */
  #extractText() {
    const divs = this.editorDiv.getElementsByTagName("div");
    if (divs.length === 0) {
      return this.editorDiv.innerText;
    }
    const buffer = [];
    for (let i = 0, ii = divs.length; i < ii; i++) {
      const div = divs[i];
      const first = div.firstChild;
      if (first?.nodeName === "#text") {
        buffer.push(first.data);
      } else {
        buffer.push("");
      }
    }
    return buffer.join("\n");
  }

  /**
   * Commit the content we have in this editor.
   * @returns {undefined}
   */
  commit() {
    this.disableEditMode();
    this.#contentHTML = this.editorDiv.innerHTML;
    this.#content = this.#extractText().trimEnd();

    const style = getComputedStyle(this.div);
    this.width = parseFloat(style.width);
    this.height = parseFloat(style.height);
  }

  /** @inheritdoc */
  shouldGetKeyboardEvents() {
    return this.isInEditMode();
  }

  /**
   * ondblclick callback.
   * @param {MouseEvent} event
   */
  dblclick(event) {
    this.enableEditMode();
    this.editorDiv.focus();
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    super.render();
    this.editorDiv = document.createElement("div");
    this.editorDiv.tabIndex = 0;
    this.editorDiv.className = "internal";

    FreeTextEditor._l10nPromise.then(msg =>
      this.editorDiv.setAttribute("default-content", msg)
    );
    this.editorDiv.contentEditable = true;

    const { style } = this.editorDiv;
    style.fontSize = `calc(${this.#fontSize}px * var(--zoom-factor))`;
    style.color = this.#color;

    this.div.appendChild(this.editorDiv);

    this.overlayDiv = document.createElement("div");
    this.overlayDiv.classList.add("overlay", "enabled");
    this.div.appendChild(this.overlayDiv);

    // TODO: implement paste callback.
    // The goal is to sanitize and have something suitable for this
    // editor.
    bindEvents(this, this.div, ["dblclick"]);

    if (this.width) {
      // This editor was created in using copy (ctrl+c).
      this.setAt(this.x + this.width, this.y + this.height);
      // eslint-disable-next-line no-unsanitized/property
      this.editorDiv.innerHTML = this.#contentHTML;
    }

    return this.div;
  }

  /** @inheritdoc */
  serialize() {
    const rect = this.editorDiv.getBoundingClientRect();
    const padding = FreeTextEditor._internalPadding * this.parent.zoomFactor;
    const [x1, y1] = Util.applyTransform(
      [this.x + padding, this.y + padding + rect.height],
      this.parent.inverseViewportTransform
    );

    const [x2, y2] = Util.applyTransform(
      [this.x + padding + rect.width, this.y + padding],
      this.parent.inverseViewportTransform
    );
    return {
      annotationType: AnnotationEditorType.FREETEXT,
      color: [0, 0, 0],
      fontSize: this.#fontSize / PixelsPerInch.PDF_TO_CSS_UNITS,
      value: this.#content,
      pageIndex: this.parent.pageIndex,
      rect: [x1, y1, x2, y2],
    };
  }
}

export { FreeTextEditor };
