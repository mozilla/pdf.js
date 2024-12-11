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
  shadow,
  Util,
} from "../../shared/util.js";
import { bindEvents, KeyboardManager } from "./tools.js";
import {
  FreeHighlightOutliner,
  HighlightOutliner,
} from "./drawers/highlight.js";
import {
  HighlightAnnotationElement,
  InkAnnotationElement,
} from "../annotation_layer.js";
import { noContextMenu, stopEvent } from "../display_utils.js";
import { AnnotationEditor } from "./editor.js";
import { ColorPicker } from "./color_picker.js";

/**
 * Basic draw editor in order to generate an Highlight annotation.
 */
class HighlightEditor extends AnnotationEditor {
  #anchorNode = null;

  #anchorOffset = 0;

  #boxes;

  #clipPathId = null;

  #colorPicker = null;

  #focusOutlines = null;

  #focusNode = null;

  #focusOffset = 0;

  #highlightDiv = null;

  #highlightOutlines = null;

  #id = null;

  #isFreeHighlight = false;

  #lastPoint = null;

  #opacity;

  #outlineId = null;

  #text = "";

  #thickness;

  #methodOfCreation = "";

  static _defaultColor = null;

  static _defaultOpacity = 1;

  static _defaultThickness = 12;

  static _type = "highlight";

  static _editorType = AnnotationEditorType.HIGHLIGHT;

  static _freeHighlightId = -1;

  static _freeHighlight = null;

  static _freeHighlightClipId = "";

  static get _keyboardManager() {
    const proto = HighlightEditor.prototype;
    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [["ArrowLeft", "mac+ArrowLeft"], proto._moveCaret, { args: [0] }],
        [["ArrowRight", "mac+ArrowRight"], proto._moveCaret, { args: [1] }],
        [["ArrowUp", "mac+ArrowUp"], proto._moveCaret, { args: [2] }],
        [["ArrowDown", "mac+ArrowDown"], proto._moveCaret, { args: [3] }],
      ])
    );
  }

  constructor(params) {
    super({ ...params, name: "highlightEditor" });
    this.color = params.color || HighlightEditor._defaultColor;
    this.#thickness = params.thickness || HighlightEditor._defaultThickness;
    this.#opacity = params.opacity || HighlightEditor._defaultOpacity;
    this.#boxes = params.boxes || null;
    this.#methodOfCreation = params.methodOfCreation || "";
    this.#text = params.text || "";
    this._isDraggable = false;

    if (params.highlightId > -1) {
      this.#isFreeHighlight = true;
      this.#createFreeOutlines(params);
      this.#addToDrawLayer();
    } else if (this.#boxes) {
      this.#anchorNode = params.anchorNode;
      this.#anchorOffset = params.anchorOffset;
      this.#focusNode = params.focusNode;
      this.#focusOffset = params.focusOffset;
      this.#createOutlines();
      this.#addToDrawLayer();
      this.rotate(this.rotation);
    }
  }

  /** @inheritdoc */
  get telemetryInitialData() {
    return {
      action: "added",
      type: this.#isFreeHighlight ? "free_highlight" : "highlight",
      color: this._uiManager.highlightColorNames.get(this.color),
      thickness: this.#thickness,
      methodOfCreation: this.#methodOfCreation,
    };
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "highlight",
      color: this._uiManager.highlightColorNames.get(this.color),
    };
  }

  static computeTelemetryFinalData(data) {
    // We want to know how many colors have been used.
    return { numberOfColors: data.get("color").size };
  }

  #createOutlines() {
    const outliner = new HighlightOutliner(
      this.#boxes,
      /* borderWidth = */ 0.001
    );
    this.#highlightOutlines = outliner.getOutlines();
    [this.x, this.y, this.width, this.height] = this.#highlightOutlines.box;

    const outlinerForOutline = new HighlightOutliner(
      this.#boxes,
      /* borderWidth = */ 0.0025,
      /* innerMargin = */ 0.001,
      this._uiManager.direction === "ltr"
    );
    this.#focusOutlines = outlinerForOutline.getOutlines();

    // The last point is in the pages coordinate system.
    const { lastPoint } = this.#focusOutlines;
    this.#lastPoint = [
      (lastPoint[0] - this.x) / this.width,
      (lastPoint[1] - this.y) / this.height,
    ];
  }

  #createFreeOutlines({ highlightOutlines, highlightId, clipPathId }) {
    this.#highlightOutlines = highlightOutlines;
    const extraThickness = 1.5;
    this.#focusOutlines = highlightOutlines.getNewOutline(
      /* Slightly bigger than the highlight in order to have a little
         space between the highlight and the outline. */
      this.#thickness / 2 + extraThickness,
      /* innerMargin = */ 0.0025
    );

    if (highlightId >= 0) {
      this.#id = highlightId;
      this.#clipPathId = clipPathId;
      // We need to redraw the highlight because we change the coordinates to be
      // in the box coordinate system.
      this.parent.drawLayer.finalizeDraw(highlightId, {
        bbox: highlightOutlines.box,
        path: {
          d: highlightOutlines.toSVGPath(),
        },
      });
      this.#outlineId = this.parent.drawLayer.drawOutline(
        {
          rootClass: {
            highlightOutline: true,
            free: true,
          },
          bbox: this.#focusOutlines.box,
          path: {
            d: this.#focusOutlines.toSVGPath(),
          },
        },
        /* mustRemoveSelfIntersections = */ true
      );
    } else if (this.parent) {
      const angle = this.parent.viewport.rotation;
      this.parent.drawLayer.updateProperties(this.#id, {
        bbox: HighlightEditor.#rotateBbox(
          this.#highlightOutlines.box,
          (angle - this.rotation + 360) % 360
        ),
        path: {
          d: highlightOutlines.toSVGPath(),
        },
      });
      this.parent.drawLayer.updateProperties(this.#outlineId, {
        bbox: HighlightEditor.#rotateBbox(this.#focusOutlines.box, angle),
        path: {
          d: this.#focusOutlines.toSVGPath(),
        },
      });
    }
    const [x, y, width, height] = highlightOutlines.box;
    switch (this.rotation) {
      case 0:
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        break;
      case 90: {
        const [pageWidth, pageHeight] = this.parentDimensions;
        this.x = y;
        this.y = 1 - x;
        this.width = (width * pageHeight) / pageWidth;
        this.height = (height * pageWidth) / pageHeight;
        break;
      }
      case 180:
        this.x = 1 - x;
        this.y = 1 - y;
        this.width = width;
        this.height = height;
        break;
      case 270: {
        const [pageWidth, pageHeight] = this.parentDimensions;
        this.x = 1 - y;
        this.y = x;
        this.width = (width * pageHeight) / pageWidth;
        this.height = (height * pageWidth) / pageHeight;
        break;
      }
    }

    const { lastPoint } = this.#focusOutlines;
    this.#lastPoint = [(lastPoint[0] - x) / width, (lastPoint[1] - y) / height];
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    HighlightEditor._defaultColor ||=
      uiManager.highlightColors?.values().next().value || "#fff066";
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.HIGHLIGHT_DEFAULT_COLOR:
        HighlightEditor._defaultColor = value;
        break;
      case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS:
        HighlightEditor._defaultThickness = value;
        break;
    }
  }

  /** @inheritdoc */
  translateInPage(x, y) {}

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
      case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS:
        this.#updateThickness(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.HIGHLIGHT_DEFAULT_COLOR,
        HighlightEditor._defaultColor,
      ],
      [
        AnnotationEditorParamsType.HIGHLIGHT_THICKNESS,
        HighlightEditor._defaultThickness,
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
      [
        AnnotationEditorParamsType.HIGHLIGHT_THICKNESS,
        this.#thickness || HighlightEditor._defaultThickness,
      ],
      [AnnotationEditorParamsType.HIGHLIGHT_FREE, this.#isFreeHighlight],
    ];
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const setColorAndOpacity = (col, opa) => {
      this.color = col;
      this.#opacity = opa;
      this.parent?.drawLayer.updateProperties(this.#id, {
        root: {
          fill: col,
          "fill-opacity": opa,
        },
      });
      this.#colorPicker?.updateColor(col);
    };
    const savedColor = this.color;
    const savedOpacity = this.#opacity;
    this.addCommands({
      cmd: setColorAndOpacity.bind(
        this,
        color,
        HighlightEditor._defaultOpacity
      ),
      undo: setColorAndOpacity.bind(this, savedColor, savedOpacity),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
      overwriteIfSameType: true,
      keepUndo: true,
    });

    this._reportTelemetry(
      {
        action: "color_changed",
        color: this._uiManager.highlightColorNames.get(color),
      },
      /* mustWait = */ true
    );
  }

  /**
   * Update the thickness and make this action undoable.
   * @param {number} thickness
   */
  #updateThickness(thickness) {
    const savedThickness = this.#thickness;
    const setThickness = th => {
      this.#thickness = th;
      this.#changeThickness(th);
    };
    this.addCommands({
      cmd: setThickness.bind(this, thickness),
      undo: setThickness.bind(this, savedThickness),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.INK_THICKNESS,
      overwriteIfSameType: true,
      keepUndo: true,
    });
    this._reportTelemetry(
      { action: "thickness_changed", thickness },
      /* mustWait = */ true
    );
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
    return super.fixAndSetPosition(this.#getRotation());
  }

  /** @inheritdoc */
  getBaseTranslation() {
    // The editor itself doesn't have any CSS border (we're drawing one
    // ourselves in using SVG).
    return [0, 0];
  }

  /** @inheritdoc */
  getRect(tx, ty) {
    return super.getRect(tx, ty, this.#getRotation());
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
  remove() {
    this.#cleanDrawLayer();
    this._reportTelemetry({
      action: "deleted",
    });
    super.remove();
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
      // At some point this editor was removed and we're rebuilding it,
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
    this.show(this._isVisible);
    if (mustBeSelected) {
      // We select it after the parent has been set.
      this.select();
    }
  }

  #changeThickness(thickness) {
    if (!this.#isFreeHighlight) {
      return;
    }
    this.#createFreeOutlines({
      highlightOutlines: this.#highlightOutlines.getNewOutline(thickness / 2),
    });
    this.fixAndSetPosition();
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);
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
    ({ id: this.#id, clipPathId: this.#clipPathId } = parent.drawLayer.draw(
      {
        bbox: this.#highlightOutlines.box,
        root: {
          viewBox: "0 0 1 1",
          fill: this.color,
          "fill-opacity": this.#opacity,
        },
        rootClass: {
          highlight: true,
          free: this.#isFreeHighlight,
        },
        path: {
          d: this.#highlightOutlines.toSVGPath(),
        },
      },
      /* isPathUpdatable = */ false,
      /* hasClip = */ true
    ));
    this.#outlineId = parent.drawLayer.drawOutline(
      {
        rootClass: {
          highlightOutline: true,
          free: this.#isFreeHighlight,
        },
        bbox: this.#focusOutlines.box,
        path: {
          d: this.#focusOutlines.toSVGPath(),
        },
      },
      /* mustRemoveSelfIntersections = */ this.#isFreeHighlight
    );

    if (this.#highlightDiv) {
      this.#highlightDiv.style.clipPath = this.#clipPathId;
    }
  }

  static #rotateBbox([x, y, width, height], angle) {
    switch (angle) {
      case 90:
        return [1 - y - height, x, height, width];
      case 180:
        return [1 - x - width, 1 - y - height, width, height];
      case 270:
        return [y, 1 - x - width, height, width];
    }
    return [x, y, width, height];
  }

  /** @inheritdoc */
  rotate(angle) {
    // We need to rotate the svgs because of the coordinates system.
    const { drawLayer } = this.parent;
    let box;
    if (this.#isFreeHighlight) {
      angle = (angle - this.rotation + 360) % 360;
      box = HighlightEditor.#rotateBbox(this.#highlightOutlines.box, angle);
    } else {
      // An highlight annotation is always drawn horizontally.
      box = HighlightEditor.#rotateBbox(
        [this.x, this.y, this.width, this.height],
        angle
      );
    }
    drawLayer.updateProperties(this.#id, {
      bbox: box,
      root: {
        "data-main-rotation": angle,
      },
    });
    drawLayer.updateProperties(this.#outlineId, {
      bbox: HighlightEditor.#rotateBbox(this.#focusOutlines.box, angle),
      root: {
        "data-main-rotation": angle,
      },
    });
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    if (this.#text) {
      div.setAttribute("aria-label", this.#text);
      div.setAttribute("role", "mark");
    }
    if (this.#isFreeHighlight) {
      div.classList.add("free");
    } else {
      this.div.addEventListener("keydown", this.#keydown.bind(this), {
        signal: this._uiManager._signal,
      });
    }
    const highlightDiv = (this.#highlightDiv = document.createElement("div"));
    div.append(highlightDiv);
    highlightDiv.setAttribute("aria-hidden", "true");
    highlightDiv.className = "internal";
    highlightDiv.style.clipPath = this.#clipPathId;
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);

    bindEvents(this, this.#highlightDiv, ["pointerover", "pointerleave"]);
    this.enableEditing();

    return div;
  }

  pointerover() {
    if (!this.isSelected) {
      this.parent?.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hovered: true,
        },
      });
    }
  }

  pointerleave() {
    if (!this.isSelected) {
      this.parent?.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hovered: false,
        },
      });
    }
  }

  #keydown(event) {
    HighlightEditor._keyboardManager.exec(this, event);
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
  select() {
    super.select();
    if (!this.#outlineId) {
      return;
    }
    this.parent?.drawLayer.updateProperties(this.#outlineId, {
      rootClass: {
        hovered: false,
        selected: true,
      },
    });
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    if (!this.#outlineId) {
      return;
    }
    this.parent?.drawLayer.updateProperties(this.#outlineId, {
      rootClass: {
        selected: false,
      },
    });
    if (!this.#isFreeHighlight) {
      this.#setCaret(/* start = */ false);
    }
  }

  /** @inheritdoc */
  get _mustFixPosition() {
    return !this.#isFreeHighlight;
  }

  /** @inheritdoc */
  show(visible = this._isVisible) {
    super.show(visible);
    if (this.parent) {
      this.parent.drawLayer.updateProperties(this.#id, {
        rootClass: {
          hidden: !visible,
        },
      });
      this.parent.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hidden: !visible,
        },
      });
    }
  }

  #getRotation() {
    // Highlight annotations are always drawn horizontally but if
    // a free highlight annotation can be rotated.
    return this.#isFreeHighlight ? this.rotation : 0;
  }

  #serializeBoxes() {
    if (this.#isFreeHighlight) {
      return null;
    }
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const boxes = this.#boxes;
    const quadPoints = new Float32Array(boxes.length * 8);
    let i = 0;
    for (const { x, y, width, height } of boxes) {
      const sx = x * pageWidth + pageX;
      const sy = (1 - y) * pageHeight + pageY;
      // Serializes the rectangle in the Adobe Acrobat format.
      // The rectangle's coordinates (b = bottom, t = top, L = left, R = right)
      // are ordered as follows: tL, tR, bL, bR (bL origin).
      quadPoints[i] = quadPoints[i + 4] = sx;
      quadPoints[i + 1] = quadPoints[i + 3] = sy;
      quadPoints[i + 2] = quadPoints[i + 6] = sx + width * pageWidth;
      quadPoints[i + 5] = quadPoints[i + 7] = sy - height * pageHeight;
      i += 8;
    }
    return quadPoints;
  }

  #serializeOutlines(rect) {
    return this.#highlightOutlines.serialize(rect, this.#getRotation());
  }

  static startHighlighting(parent, isLTR, { target: textLayer, x, y }) {
    const {
      x: layerX,
      y: layerY,
      width: parentWidth,
      height: parentHeight,
    } = textLayer.getBoundingClientRect();

    const ac = new AbortController();
    const signal = parent.combinedSignal(ac);

    const pointerUpCallback = e => {
      ac.abort();
      this.#endHighlight(parent, e);
    };
    window.addEventListener("blur", pointerUpCallback, { signal });
    window.addEventListener("pointerup", pointerUpCallback, { signal });
    window.addEventListener(
      "pointerdown",
      stopEvent /* Avoid to have undesired clicks during the drawing. */,
      {
        capture: true,
        passive: false,
        signal,
      }
    );
    window.addEventListener("contextmenu", noContextMenu, { signal });

    textLayer.addEventListener(
      "pointermove",
      this.#highlightMove.bind(this, parent),
      { signal }
    );
    this._freeHighlight = new FreeHighlightOutliner(
      { x, y },
      [layerX, layerY, parentWidth, parentHeight],
      parent.scale,
      this._defaultThickness / 2,
      isLTR,
      /* innerMargin = */ 0.001
    );
    ({ id: this._freeHighlightId, clipPathId: this._freeHighlightClipId } =
      parent.drawLayer.draw(
        {
          bbox: [0, 0, 1, 1],
          root: {
            viewBox: "0 0 1 1",
            fill: this._defaultColor,
            "fill-opacity": this._defaultOpacity,
          },
          rootClass: {
            highlight: true,
            free: true,
          },
          path: {
            d: this._freeHighlight.toSVGPath(),
          },
        },
        /* isPathUpdatable = */ true,
        /* hasClip = */ true
      ));
  }

  static #highlightMove(parent, event) {
    if (this._freeHighlight.add(event)) {
      // Redraw only if the point has been added.
      parent.drawLayer.updateProperties(this._freeHighlightId, {
        path: {
          d: this._freeHighlight.toSVGPath(),
        },
      });
    }
  }

  static #endHighlight(parent, event) {
    if (!this._freeHighlight.isEmpty()) {
      parent.createAndAddNewEditor(event, false, {
        highlightId: this._freeHighlightId,
        highlightOutlines: this._freeHighlight.getOutlines(),
        clipPathId: this._freeHighlightClipId,
        methodOfCreation: "main_toolbar",
      });
    } else {
      parent.drawLayer.remove(this._freeHighlightId);
    }
    this._freeHighlightId = -1;
    this._freeHighlight = null;
    this._freeHighlightClipId = "";
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof HighlightAnnotationElement) {
      const {
        data: { quadPoints, rect, rotation, id, color, opacity, popupRef },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        opacity,
        quadPoints,
        boxes: null,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        id,
        deleted: false,
        popupRef,
      };
    } else if (data instanceof InkAnnotationElement) {
      const {
        data: {
          inkLists,
          rect,
          rotation,
          id,
          color,
          borderStyle: { rawWidth: thickness },
          popupRef,
        },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        thickness,
        inkLists,
        boxes: null,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        id,
        deleted: false,
        popupRef,
      };
    }

    const { color, quadPoints, inkLists, opacity } = data;
    const editor = await super.deserialize(data, parent, uiManager);

    editor.color = Util.makeHexColor(...color);
    editor.#opacity = opacity || 1;
    if (inkLists) {
      editor.#thickness = data.thickness;
    }
    editor.annotationElementId = data.id || null;
    editor._initialData = initialData;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const [pageX, pageY] = editor.pageTranslation;

    if (quadPoints) {
      const boxes = (editor.#boxes = []);
      for (let i = 0; i < quadPoints.length; i += 8) {
        boxes.push({
          x: (quadPoints[i] - pageX) / pageWidth,
          y: 1 - (quadPoints[i + 1] - pageY) / pageHeight,
          width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
          height: (quadPoints[i + 1] - quadPoints[i + 5]) / pageHeight,
        });
      }
      editor.#createOutlines();
      editor.#addToDrawLayer();
      editor.rotate(editor.rotation);
    } else if (inkLists) {
      editor.#isFreeHighlight = true;
      const points = inkLists[0];
      const point = {
        x: points[0] - pageX,
        y: pageHeight - (points[1] - pageY),
      };
      const outliner = new FreeHighlightOutliner(
        point,
        [0, 0, pageWidth, pageHeight],
        1,
        editor.#thickness / 2,
        true,
        0.001
      );
      for (let i = 0, ii = points.length; i < ii; i += 2) {
        point.x = points[i] - pageX;
        point.y = pageHeight - (points[i + 1] - pageY);
        outliner.add(point);
      }
      const { id, clipPathId } = parent.drawLayer.draw(
        {
          bbox: [0, 0, 1, 1],
          root: {
            viewBox: "0 0 1 1",
            fill: editor.color,
            "fill-opacity": editor._defaultOpacity,
          },
          rootClass: {
            highlight: true,
            free: true,
          },
          path: {
            d: outliner.toSVGPath(),
          },
        },
        /* isPathUpdatable = */ true,
        /* hasClip = */ true
      );
      editor.#createFreeOutlines({
        highlightOutlines: outliner.getOutlines(),
        highlightId: id,
        clipPathId,
      });
      editor.#addToDrawLayer();
    }

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    // It doesn't make sense to copy/paste a highlight annotation.
    if (this.isEmpty() || isForCopying) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const rect = this.getRect(0, 0);
    const color = AnnotationEditor._colorManager.convert(this.color);

    const serialized = {
      annotationType: AnnotationEditorType.HIGHLIGHT,
      color,
      opacity: this.#opacity,
      thickness: this.#thickness,
      quadPoints: this.#serializeBoxes(),
      outlines: this.#serializeOutlines(rect),
      pageIndex: this.pageIndex,
      rect,
      rotation: this.#getRotation(),
      structTreeParentId: this._structTreeParentId,
    };

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;
    return serialized;
  }

  #hasElementChanged(serialized) {
    const { color } = this._initialData;
    return serialized.color.some((c, i) => c !== color[i]);
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    annotation.updateEdited({
      rect: this.getRect(0, 0),
    });

    return null;
  }

  static canCreateNewEmptyEditor() {
    return false;
  }
}

export { HighlightEditor };
