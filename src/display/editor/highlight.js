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
  AnnotationEditorParamsType,
  AnnotationEditorType,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { bindEvents } from "./tools.js";
import { ColorPicker } from "./color_picker.js";
import { Outliner } from "./outliner.js";

/**
 * Basic draw editor in order to generate an Highlight annotation.
 */
class HighlightEditor extends AnnotationEditor {
  #boxes;

  #clipPathId = null;

  #colorPicker = null;

  #focusOutlines = null;

  #highlightDiv = null;

  #highlightOutlines = null;

  #id = null;

  #lastPoint = null;

  #opacity;

  #outlineId = null;

  static _defaultColor = null;

  static _defaultOpacity = 1;

  static _l10nPromise;

  static _type = "highlight";

  static _editorType = AnnotationEditorType.HIGHLIGHT;

  constructor(params) {
    super({ ...params, name: "highlightEditor" });
    HighlightEditor._defaultColor ||=
      this._uiManager.highlightColors?.values().next().value || "#fff066";
    this.color = params.color || HighlightEditor._defaultColor;
    this.#opacity = params.opacity || HighlightEditor._defaultOpacity;
    this.#boxes = params.boxes || null;
    this._isDraggable = false;

    this.#createOutlines();
    this.#addToDrawLayer();
    this.rotate(this.rotation);
  }

  #createOutlines() {
    const outliner = new Outliner(this.#boxes, /* borderWidth = */ 0.001);
    this.#highlightOutlines = outliner.getOutlines();
    ({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    } = this.#highlightOutlines.box);

    const outlinerForOutline = new Outliner(
      this.#boxes,
      /* borderWidth = */ 0.0025,
      /* innerMargin = */ 0.001,
      this._uiManager.direction === "ltr"
    );
    this.#focusOutlines = outlinerForOutline.getOutlines();

    // The last point is in the pages coordinate system.
    const { lastPoint } = this.#focusOutlines.box;
    this.#lastPoint = [
      (lastPoint[0] - this.x) / this.width,
      (lastPoint[1] - this.y) / this.height,
    ];
  }

  static initialize(l10n) {
    AnnotationEditor.initialize(l10n);
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.HIGHLIGHT_DEFAULT_COLOR:
        HighlightEditor._defaultColor = value;
        break;
    }
  }

  /** @inheritdoc */
  get toolbarPosition() {
    return this.#lastPoint;
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.HIGHLIGHT_COLOR:
        this.#updateColor(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.HIGHLIGHT_DEFAULT_COLOR,
        HighlightEditor._defaultColor,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.HIGHLIGHT_COLOR,
        this.color || HighlightEditor._defaultColor,
      ],
    ];
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const savedColor = this.color;
    this.addCommands({
      cmd: () => {
        this.color = color;
        this.parent.drawLayer.changeColor(this.#id, color);
        this.#colorPicker?.updateColor(color);
      },
      undo: () => {
        this.color = savedColor;
        this.parent.drawLayer.changeColor(this.#id, savedColor);
        this.#colorPicker?.updateColor(savedColor);
      },
      mustExec: true,
      type: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /** @inheritdoc */
  async addEditToolbar() {
    const toolbar = await super.addEditToolbar();
    if (!toolbar) {
      return null;
    }
    if (this._uiManager.highlightColors) {
      this.#colorPicker = new ColorPicker({ editor: this });
      toolbar.addColorPicker(this.#colorPicker);
    }
    return toolbar;
  }

  /** @inheritdoc */
  disableEditing() {
    super.disableEditing();
    this.div.classList.toggle("disabled", true);
  }

  /** @inheritdoc */
  enableEditing() {
    super.enableEditing();
    this.div.classList.toggle("disabled", false);
  }

  /** @inheritdoc */
  fixAndSetPosition() {
    return super.fixAndSetPosition(0);
  }

  /** @inheritdoc */
  getRect(tx, ty) {
    return super.getRect(tx, ty, 0);
  }

  /** @inheritdoc */
  onceAdded() {
    this.parent.addUndoableEditor(this);
    this.div.focus();
  }

  /** @inheritdoc */
  remove() {
    super.remove();
    this.#cleanDrawLayer();
  }

  /** @inheritdoc */
  rebuild() {
    if (!this.parent) {
      return;
    }
    super.rebuild();
    if (this.div === null) {
      return;
    }

    this.#addToDrawLayer();

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  setParent(parent) {
    let mustBeSelected = false;
    if (this.parent && !parent) {
      this.#cleanDrawLayer();
    } else if (parent) {
      this.#addToDrawLayer(parent);
      // If mustBeSelected is true it means that this editor was selected
      // when its parent has been destroyed, hence we must select it again.
      mustBeSelected =
        !this.parent && this.div?.classList.contains("selectedEditor");
    }
    super.setParent(parent);
    if (mustBeSelected) {
      // We select it after the parent has been set.
      this.select();
    }
  }

  #cleanDrawLayer() {
    if (this.#id === null || !this.parent) {
      return;
    }
    this.parent.drawLayer.remove(this.#id);
    this.#id = null;
    this.parent.drawLayer.remove(this.#outlineId);
    this.#outlineId = null;
  }

  #addToDrawLayer(parent = this.parent) {
    if (this.#id !== null) {
      return;
    }
    ({ id: this.#id, clipPathId: this.#clipPathId } =
      parent.drawLayer.highlight(
        this.#highlightOutlines,
        this.color,
        this.#opacity
      ));
    if (this.#highlightDiv) {
      this.#highlightDiv.style.clipPath = this.#clipPathId;
    }
    this.#outlineId = parent.drawLayer.highlightOutline(this.#focusOutlines);
  }

  static #rotateBbox({ x, y, width, height }, angle) {
    switch (angle) {
      case 90:
        return {
          x: 1 - y - height,
          y: x,
          width: height,
          height: width,
        };
      case 180:
        return {
          x: 1 - x - width,
          y: 1 - y - height,
          width,
          height,
        };
      case 270:
        return {
          x: y,
          y: 1 - x - width,
          width: height,
          height: width,
        };
    }
    return {
      x,
      y,
      width,
      height,
    };
  }

  /** @inheritdoc */
  rotate(angle) {
    const { drawLayer } = this.parent;
    drawLayer.rotate(this.#id, angle);
    drawLayer.rotate(this.#outlineId, angle);
    drawLayer.updateBox(this.#id, HighlightEditor.#rotateBbox(this, angle));
    drawLayer.updateBox(
      this.#outlineId,
      HighlightEditor.#rotateBbox(this.#focusOutlines.box, angle)
    );
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    const highlightDiv = (this.#highlightDiv = document.createElement("div"));
    div.append(highlightDiv);
    highlightDiv.className = "internal";
    highlightDiv.style.clipPath = this.#clipPathId;
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);

    bindEvents(this, this.#highlightDiv, ["pointerover", "pointerleave"]);
    this.enableEditing();

    return div;
  }

  pointerover() {
    this.parent.drawLayer.addClass(this.#outlineId, "hovered");
  }

  pointerleave() {
    this.parent.drawLayer.removeClass(this.#outlineId, "hovered");
  }

  /** @inheritdoc */
  select() {
    super.select();
    this.parent?.drawLayer.removeClass(this.#outlineId, "hovered");
    this.parent?.drawLayer.addClass(this.#outlineId, "selected");
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    this.parent?.drawLayer.removeClass(this.#outlineId, "selected");
  }

  #serializeBoxes() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const boxes = this.#boxes;
    const quadPoints = new Array(boxes.length * 8);
    let i = 0;
    for (const { x, y, width, height } of boxes) {
      const sx = x * pageWidth;
      const sy = (1 - y - height) * pageHeight;
      // The specifications say that the rectangle should start from the bottom
      // left corner and go counter-clockwise.
      // But when opening the file in Adobe Acrobat it appears that this isn't
      // correct hence the 4th and 6th numbers are just swapped.
      quadPoints[i] = quadPoints[i + 4] = sx;
      quadPoints[i + 1] = quadPoints[i + 3] = sy;
      quadPoints[i + 2] = quadPoints[i + 6] = sx + width * pageWidth;
      quadPoints[i + 5] = quadPoints[i + 7] = sy + height * pageHeight;
      i += 8;
    }
    return quadPoints;
  }

  #serializeOutlines() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;
    const tx = this.x * pageWidth;
    const ty = (1 - this.y - this.height) * pageHeight;
    const outlines = [];
    for (const outline of this.#highlightOutlines.outlines) {
      const points = new Array(outline.length);
      for (let i = 0; i < outline.length; i += 2) {
        points[i] = tx + outline[i] * width;
        points[i + 1] = ty + (1 - outline[i + 1]) * height;
      }
      outlines.push(points);
    }
    return outlines;
  }

  /** @inheritdoc */
  static deserialize(data, parent, uiManager) {
    const editor = super.deserialize(data, parent, uiManager);

    const { rect, color, quadPoints } = data;
    editor.color = Util.makeHexColor(...color);
    editor.#opacity = data.opacity;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    editor.width = (rect[2] - rect[0]) / pageWidth;
    editor.height = (rect[3] - rect[1]) / pageHeight;
    const boxes = (editor.#boxes = []);
    for (let i = 0; i < quadPoints.length; i += 8) {
      boxes.push({
        x: quadPoints[4] / pageWidth,
        y: 1 - quadPoints[i + 5] / pageHeight,
        width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
        height: (quadPoints[i + 5] - quadPoints[i + 1]) / pageHeight,
      });
    }
    editor.#createOutlines();

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    // It doesn't make sense to copy/paste a highlight annotation.
    if (this.isEmpty() || isForCopying) {
      return null;
    }

    const rect = this.getRect(0, 0);
    const color = AnnotationEditor._colorManager.convert(this.color);

    return {
      annotationType: AnnotationEditorType.HIGHLIGHT,
      color,
      opacity: this.#opacity,
      quadPoints: this.#serializeBoxes(),
      outlines: this.#serializeOutlines(),
      pageIndex: this.pageIndex,
      rect,
      rotation: 0,
      structTreeParentId: this._structTreeParentId,
    };
  }

  static canCreateNewEmptyEditor() {
    return false;
  }
}

export { HighlightEditor };
