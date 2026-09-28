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

/** @typedef {import("./drawers/outline.js").Outline} Outline */

import { DrawingEditor, DrawingOptions } from "./draw.js";
import { shadow, unreachable, Util } from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { BasicColorPicker } from "./color_picker.js";
import { KeyboardManager } from "./tools.js";
import { TextMarkupOutline } from "./drawers/text_markup.js";

class TextMarkupDrawingOptions extends DrawingOptions {
  constructor(properties = null) {
    super();
    super.updateProperties(properties);
  }

  /** @inheritdoc */
  clone() {
    const clone = new TextMarkupDrawingOptions();
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Base class for the editors marking up the selected text: highlight,
 * underline, squiggly and strikeout.
 * Subclasses must define the static `_type`, `_editorType` and
 * `_defaultDrawingOptions` properties and the `colorType` getter. By default,
 * the markup is drawn with the polygons returned by the `_drawBox` method
 * (see `_buildOutline`).
 */
class TextMarkupEditor extends DrawingEditor {
  #anchorNode = null;

  #anchorOffset = 0;

  #focusNode = null;

  #focusOffset = 0;

  #text = "";

  static _DEFAULT_OPACITY = 1;

  static get _keyboardManager() {
    const proto = TextMarkupEditor.prototype;
    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [["ArrowLeft"], proto._moveCaret, { args: [0] }],
        [["ArrowRight"], proto._moveCaret, { args: [1] }],
        [["ArrowUp"], proto._moveCaret, { args: [2] }],
        [["ArrowDown"], proto._moveCaret, { args: [3] }],
      ])
    );
  }

  constructor(params) {
    super(params);
    this.#anchorNode = params.anchorNode || null;
    this.#anchorOffset = params.anchorOffset || 0;
    this.#focusNode = params.focusNode || null;
    this.#focusOffset = params.focusOffset || 0;
    this.#text = params.text || "";
    this._isDraggable = false;
    this.rotate();
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    // Preserve user-selected defaults across initialize calls.
    this._defaultDrawingOptions ||= new TextMarkupDrawingOptions({
      fill: AnnotationEditor._defaultLineColor,
      "fill-opacity": TextMarkupEditor._DEFAULT_OPACITY,
    });
  }

  /** @inheritdoc */
  static getDefaultDrawingOptions(options) {
    const clone = this._defaultDrawingOptions.clone();
    clone.updateProperties(options);
    return clone;
  }

  /** @inheritdoc */
  static get isDrawer() {
    // The editors are created from the text layer.
    return false;
  }

  /** @inheritdoc */
  static get isFromTextSelection() {
    return true;
  }

  /** @inheritdoc */
  static get _hasClipPath() {
    // Clip the interactive div to the text boxes.
    return true;
  }

  /** @inheritdoc */
  static get _hasDrawClass() {
    return false;
  }

  /**
   * Get the polygons to fill in order to draw the markup of a text box.
   * @abstract
   * @param {object} _box - A text box in the page coordinate system normalized
   *   to [0, 1] (the origin is the top-left corner).
   * @param {number} _pageWidth - The page width in PDF units.
   * @param {number} _pageHeight - The page height in PDF units.
   * @returns {Array<Array<number>>}
   */
  static _drawBox(_box, _pageWidth, _pageHeight) {
    unreachable("Abstract method `_drawBox` must be implemented.");
  }

  /**
   * Build the outline of the markup of some text boxes.
   * @param {Array<object>} boxes - The text boxes in the page coordinate
   *   system normalized to [0, 1] (the origin is the top-left corner).
   * @param {Array<number>} pageDimensions - The page dimensions in PDF units.
   * @param {boolean} isLTR
   * @returns {Outline}
   */
  static _buildOutline(boxes, pageDimensions, isLTR) {
    return new TextMarkupOutline(boxes, pageDimensions, isLTR, this._drawBox);
  }

  /** @inheritdoc */
  _addOutlines(params) {
    const { boxes, drawOutlines } = params;
    if (!boxes && !drawOutlines) {
      return;
    }
    this._drawingOptions ||=
      params.drawingOptions || this.constructor.getDefaultDrawingOptions();
    if (boxes) {
      params = {
        ...params,
        drawOutlines: this.constructor._buildOutline(
          boxes,
          this.pageDimensions,
          this._uiManager.direction === "ltr"
        ),
      };
    }
    super._addOutlines(params);
  }

  get color() {
    return this._drawingOptions.fill;
  }

  get opacity() {
    return this._drawingOptions["fill-opacity"];
  }

  /** @inheritdoc */
  get _opacityName() {
    // Preserve imported opacity, which the UI doesn't expose.
    return "fill-opacity";
  }

  /** @inheritdoc */
  get _drawRotation() {
    // The text boxes are in the page coordinate system.
    return 0;
  }

  /** @inheritdoc */
  get isResizable() {
    return false;
  }

  /** @inheritdoc */
  get _mustBeDisabledOnCommit() {
    return false;
  }

  /** @inheritdoc */
  get _mustFixPosition() {
    return true;
  }

  /** @inheritdoc */
  translateInPage(x, y) {}

  /** @inheritdoc */
  get toolbarPosition() {
    return this.#relativeToBox(this._drawOutlines.focusOutline.lastPoint);
  }

  /** @inheritdoc */
  get commentButtonPosition() {
    return this.#relativeToBox(this._drawOutlines.firstPoint);
  }

  #relativeToBox([pointX, pointY]) {
    // The point and box use page coordinates.
    const [x, y, width, height] = this._drawOutlines.box;
    return [(pointX - x) / width, (pointY - y) / height];
  }

  /** @inheritdoc */
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }

  /** @inheritdoc */
  fixAndSetPosition() {
    return super.fixAndSetPosition(this._drawRotation);
  }

  /** @inheritdoc */
  getRect(tx, ty) {
    return super.getRect(tx, ty, this._drawRotation);
  }

  /** @inheritdoc */
  onceAdded(focus) {
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
    }
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    div.classList.add("textMarkupEditor");
    if (this.#text) {
      div.setAttribute("aria-label", this.#text);
      div.setAttribute("role", "mark");
    }
    if (!this._drawOutlines.isFree) {
      div.addEventListener("keydown", this.#keydown.bind(this), {
        signal: this._uiManager._signal,
      });
    }
    this.enableEditing();

    return div;
  }

  #keydown(event) {
    this.constructor._keyboardManager.exec(this, event);
  }

  _moveCaret(direction) {
    this.parent.unselect(this);
    switch (direction) {
      case 0 /* left */:
      case 2 /* up */:
        this.#setCaret(/* start = */ true);
        break;
      case 1 /* right */:
      case 3 /* down */:
        this.#setCaret(/* start = */ false);
        break;
    }
  }

  #setCaret(start) {
    if (!this.#anchorNode) {
      return;
    }
    const selection = window.getSelection();
    if (start) {
      selection.setPosition(this.#anchorNode, this.#anchorOffset);
    } else {
      selection.setPosition(this.#focusNode, this.#focusOffset);
    }
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    if (!this._drawOutlines.isFree) {
      this.#setCaret(/* start = */ false);
    }
  }

  /** @inheritdoc */
  createDrawingOptions({ color, opacity }) {
    this._drawingOptions = this.constructor.getDefaultDrawingOptions({
      fill: Util.makeHexColor(...color),
      "fill-opacity": opacity || TextMarkupEditor._DEFAULT_OPACITY,
    });
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    _innerMargin,
    { quadPoints },
    uiManager
  ) {
    const boxes = [];
    for (let i = 0, ii = quadPoints.length; i < ii; i += 8) {
      boxes.push({
        x: (quadPoints[i] - pageX) / pageWidth,
        y: 1 - (quadPoints[i + 1] - pageY) / pageHeight,
        width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
        height: (quadPoints[i + 1] - quadPoints[i + 5]) / pageHeight,
      });
    }
    return this._buildOutline(
      boxes,
      [pageWidth, pageHeight],
      uiManager.direction === "ltr"
    );
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    // It doesn't make sense to copy/paste a text markup annotation.
    if (this.isEmpty() || isForCopying) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const serialized = super.serialize(isForCopying);
    Object.assign(serialized, {
      color: AnnotationEditor._colorManager.convert(
        this._uiManager.getNonHCMColor(this.color)
      ),
      opacity: this.opacity,
      quadPoints: this._drawOutlines.serializeQuadPoints(
        this.pageTranslation,
        this.pageDimensions
      ),
    });
    this.addComment(serialized);

    return serialized;
  }
}

export { TextMarkupEditor };
