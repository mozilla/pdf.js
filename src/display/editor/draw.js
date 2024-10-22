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

import { AnnotationEditorParamsType, unreachable } from "../../shared/util.js";
import { noContextMenu, stopEvent } from "../display_utils.js";
import { AnnotationEditor } from "./editor.js";

class DrawingOptions {
  #svgProperties = Object.create(null);

  updateProperty(name, value) {
    this[name] = value;
    this.updateSVGProperty(name, value);
  }

  updateProperties(properties) {
    if (!properties) {
      return;
    }
    for (const [name, value] of Object.entries(properties)) {
      this.updateProperty(name, value);
    }
  }

  updateSVGProperty(name, value) {
    this.#svgProperties[name] = value;
  }

  toSVGProperties() {
    const root = this.#svgProperties;
    this.#svgProperties = Object.create(null);
    return { root };
  }

  reset() {
    this.#svgProperties = Object.create(null);
  }

  updateAll(options = this) {
    this.updateProperties(options);
  }

  clone() {
    unreachable("Not implemented");
  }
}

/**
 * Basic draw editor.
 */
class DrawingEditor extends AnnotationEditor {
  #drawOutlines = null;

  #mustBeCommitted;

  _drawId = null;

  static _currentDrawId = -1;

  static _currentDraw = null;

  static _currentDrawingOptions = null;

  static _currentParent = null;

  static _INNER_MARGIN = 3;

  constructor(params) {
    super(params);
    this.#mustBeCommitted = params.mustBeCommitted || false;

    if (params.drawOutlines) {
      this.#createDrawOutlines(params);
      this.#addToDrawLayer();
    }
  }

  #createDrawOutlines({ drawOutlines, drawId, drawingOptions }) {
    this.#drawOutlines = drawOutlines;
    this._drawingOptions ||= drawingOptions;

    if (drawId >= 0) {
      this._drawId = drawId;
      // We need to redraw the drawing because we changed the coordinates to be
      // in the box coordinate system.
      this.parent.drawLayer.finalizeDraw(
        drawId,
        drawOutlines.defaultProperties
      );
    } else {
      // We create a new drawing.
      this._drawId = this.#createDrawing(drawOutlines, this.parent);
    }

    this.#updateBbox(drawOutlines.box);
  }

  #createDrawing(drawOutlines, parent) {
    const { id } = parent.drawLayer.draw(
      DrawingEditor._mergeSVGProperties(
        this._drawingOptions.toSVGProperties(),
        drawOutlines.defaultSVGProperties
      ),
      /* isPathUpdatable = */ false,
      /* hasClip = */ false
    );
    return id;
  }

  static _mergeSVGProperties(p1, p2) {
    const p1Keys = new Set(Object.keys(p1));

    for (const [key, value] of Object.entries(p2)) {
      if (p1Keys.has(key)) {
        Object.assign(p1[key], value);
      } else {
        p1[key] = value;
      }
    }
    return p1;
  }

  /**
   * @param {Object} options
   * @return {DrawingOptions} the default options to use for a new editor.
   */
  static getDefaultDrawingOptions(_options) {
    unreachable("Not implemented");
  }

  /**
   * @return {Map<AnnotationEditorParamsType, string>} a map between the
   *   parameter types and the name of the options.
   */
  // eslint-disable-next-line getter-return
  static get typesMap() {
    unreachable("Not implemented");
  }

  static get isDrawer() {
    return true;
  }

  /**
   * @returns {boolean} `true` if several drawings can be added to the
   * annotation.
   */
  static get supportMultipleDrawings() {
    return false;
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    const propertyName = this.typesMap.get(type);
    if (propertyName) {
      this._defaultDrawingOptions.updateProperty(propertyName, value);
    }
    if (this._currentParent) {
      this._currentDraw.updateProperty(propertyName, value);
      this._currentParent.drawLayer.updateProperties(
        this._currentDrawId,
        this._defaultDrawingOptions.toSVGProperties()
      );
    }
  }

  /** @inheritdoc */
  updateParams(type, value) {
    const propertyName = this.constructor.typesMap.get(type);
    if (propertyName) {
      this._updateProperty(type, propertyName, value);
    }
  }

  /** @inheritdoc */
  static get defaultPropertiesToUpdate() {
    const properties = [];
    const options = this._defaultDrawingOptions;
    for (const [type, name] of this.typesMap) {
      properties.push([type, options[name]]);
    }
    return properties;
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    const properties = [];
    const { _drawingOptions } = this;
    for (const [type, name] of this.constructor.typesMap) {
      properties.push([type, _drawingOptions[name]]);
    }
    return properties;
  }

  /**
   * Update a property and make this action undoable.
   * @param {string} color
   */
  _updateProperty(type, name, value) {
    const options = this._drawingOptions;
    const savedValue = options[name];
    const setter = val => {
      options.updateProperty(name, val);
      const bbox = this.#drawOutlines.updateProperty(name, val);
      if (bbox) {
        this.#updateBbox(bbox);
      }
      this.parent?.drawLayer.updateProperties(
        this._drawId,
        options.toSVGProperties()
      );
    };
    this.addCommands({
      cmd: setter.bind(this, value),
      undo: setter.bind(this, savedValue),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /** @inheritdoc */
  _onResizing() {
    this.parent?.drawLayer.updateProperties(
      this._drawId,
      DrawingEditor._mergeSVGProperties(
        this.#drawOutlines.getPathResizingSVGProperties(
          this.#convertToDrawSpace()
        ),
        {
          bbox: this.#rotateBox(),
        }
      )
    );
  }

  /** @inheritdoc */
  _onResized() {
    this.parent?.drawLayer.updateProperties(
      this._drawId,
      DrawingEditor._mergeSVGProperties(
        this.#drawOutlines.getPathResizedSVGProperties(
          this.#convertToDrawSpace()
        ),
        {
          bbox: this.#rotateBox(),
        }
      )
    );
  }

  /** @inheritdoc */
  _onTranslating(x, y) {
    this.parent?.drawLayer.updateProperties(this._drawId, {
      bbox: this.#rotateBox(x, y),
    });
  }

  /** @inheritdoc */
  _onTranslated() {
    this.parent?.drawLayer.updateProperties(
      this._drawId,
      DrawingEditor._mergeSVGProperties(
        this.#drawOutlines.getPathTranslatedSVGProperties(
          this.#convertToDrawSpace(),
          this.parentDimensions
        ),
        {
          bbox: this.#rotateBox(),
        }
      )
    );
  }

  _onStartDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, {
      rootClass: {
        moving: true,
      },
    });
  }

  _onStopDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, {
      rootClass: {
        moving: false,
      },
    });
  }

  /** @inheritdoc */
  commit() {
    super.commit();

    this.disableEditMode();
    this.disableEditing();
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
  getBaseTranslation() {
    // The editor itself doesn't have any CSS border (we're drawing one
    // ourselves in using SVG).
    return [0, 0];
  }

  /** @inheritdoc */
  get isResizable() {
    return true;
  }

  /** @inheritdoc */
  onceAdded() {
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
    }
    this._isDraggable = true;
    if (this.#mustBeCommitted) {
      this.#mustBeCommitted = false;
      this.commit();
      this.parent.setSelected(this);
      if (this.isOnScreen) {
        this.div.focus();
      }
    }
  }

  /** @inheritdoc */
  remove() {
    this.#cleanDrawLayer();
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
    this.#updateBbox(this.#drawOutlines.box);

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilding it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  setParent(parent) {
    let mustBeSelected = false;
    if (this.parent && !parent) {
      this._uiManager.removeShouldRescale(this);
      this.#cleanDrawLayer();
    } else if (parent) {
      this._uiManager.addShouldRescale(this);
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
    if (this._drawId === null || !this.parent) {
      return;
    }
    this.parent.drawLayer.remove(this._drawId);
    this._drawId = null;

    // All the SVG properties must be reset in order to make it possible to
    // undo.
    this._drawingOptions.reset();
  }

  #addToDrawLayer(parent = this.parent) {
    if (this._drawId !== null && this.parent === parent) {
      return;
    }
    if (this._drawId !== null) {
      // The parent has changed, we need to move the drawing to the new parent.
      this.parent.drawLayer.updateParent(this._drawId, parent.drawLayer);
      return;
    }
    this._drawingOptions.updateAll();
    this._drawId = this.#createDrawing(this.#drawOutlines, parent);
  }

  #convertToParentSpace([x, y, width, height]) {
    const {
      parentDimensions: [pW, pH],
      rotation,
    } = this;
    switch (rotation) {
      case 90:
        return [y, 1 - x, width * (pH / pW), height * (pW / pH)];
      case 180:
        return [1 - x, 1 - y, width, height];
      case 270:
        return [1 - y, x, width * (pH / pW), height * (pW / pH)];
      default:
        return [x, y, width, height];
    }
  }

  #convertToDrawSpace() {
    const {
      x,
      y,
      width,
      height,
      parentDimensions: [pW, pH],
      rotation,
    } = this;
    switch (rotation) {
      case 90:
        return [1 - y, x, width * (pW / pH), height * (pH / pW)];
      case 180:
        return [1 - x, 1 - y, width, height];
      case 270:
        return [y, 1 - x, width * (pW / pH), height * (pH / pW)];
      default:
        return [x, y, width, height];
    }
  }

  #updateBbox(bbox) {
    [this.x, this.y, this.width, this.height] =
      this.#convertToParentSpace(bbox);
    if (this.div) {
      this.fixAndSetPosition();
      const [parentWidth, parentHeight] = this.parentDimensions;
      this.setDims(this.width * parentWidth, this.height * parentHeight);
    }
    this._onResized();
  }

  #rotateBox() {
    // We've to deal with two rotations: the rotation of the annotation and the
    // rotation of the parent page.
    // When the page is rotated, all the layers are just rotated thanks to CSS
    // but there is a notable exception: the canvas wrapper.
    // The canvas wrapper is not rotated but the dimensions are (or not) swapped
    // and the page is redrawn with the rotation applied to the canvas.
    // The drawn layer is under the canvas wrapper and is not rotated so we have
    // to "manually" rotate the coordinates.
    //
    // The coordinates (this.x, this.y) correspond to the top-left corner of
    // the editor after it has been rotated in the page coordinate system.

    const {
      x,
      y,
      width,
      height,
      rotation,
      parentRotation,
      parentDimensions: [pW, pH],
    } = this;
    switch ((rotation * 4 + parentRotation) / 90) {
      case 1:
        // 0 -> 90
        return [1 - y - height, x, height, width];
      case 2:
        // 0 -> 180
        return [1 - x - width, 1 - y - height, width, height];
      case 3:
        // 0 -> 270
        return [y, 1 - x - width, height, width];
      case 4:
        // 90 -> 0
        return [
          x,
          y - width * (pW / pH),
          height * (pH / pW),
          width * (pW / pH),
        ];
      case 5:
        // 90 -> 90
        return [1 - y, x, width * (pW / pH), height * (pH / pW)];
      case 6:
        // 90 -> 180
        return [
          1 - x - height * (pH / pW),
          1 - y,
          height * (pH / pW),
          width * (pW / pH),
        ];
      case 7:
        // 90 -> 270
        return [
          y - width * (pW / pH),
          1 - x - height * (pH / pW),
          width * (pW / pH),
          height * (pH / pW),
        ];
      case 8:
        // 180 -> 0
        return [x - width, y - height, width, height];
      case 9:
        // 180 -> 90
        return [1 - y, x - width, height, width];
      case 10:
        // 180 -> 180
        return [1 - x, 1 - y, width, height];
      case 11:
        // 180 -> 270
        return [y - height, 1 - x, height, width];
      case 12:
        // 270 -> 0
        return [
          x - height * (pH / pW),
          y,
          height * (pH / pW),
          width * (pW / pH),
        ];
      case 13:
        // 270 -> 90
        return [
          1 - y - width * (pW / pH),
          x - height * (pH / pW),
          width * (pW / pH),
          height * (pH / pW),
        ];
      case 14:
        // 270 -> 180
        return [
          1 - x,
          1 - y - width * (pW / pH),
          height * (pH / pW),
          width * (pW / pH),
        ];
      case 15:
        // 270 -> 270
        return [y, 1 - x, width * (pW / pH), height * (pH / pW)];
      default:
        // 0 -> 0
        return [x, y, width, height];
    }
  }

  /** @inheritdoc */
  rotate() {
    if (!this.parent) {
      return;
    }
    this.parent.drawLayer.updateProperties(
      this._drawId,
      DrawingEditor._mergeSVGProperties(
        {
          bbox: this.#rotateBox(),
        },
        this.#drawOutlines.updateRotation(
          (this.parentRotation - this.rotation + 360) % 360
        )
      )
    );
  }

  onScaleChanging() {
    if (!this.parent) {
      return;
    }
    this.#updateBbox(
      this.#drawOutlines.updateParentDimensions(
        this.parentDimensions,
        this.parent.scale
      )
    );
  }

  static onScaleChangingWhenDrawing() {}

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    div.classList.add("draw");

    const drawDiv = document.createElement("div");
    div.append(drawDiv);
    drawDiv.setAttribute("aria-hidden", "true");
    drawDiv.className = "internal";
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);
    this._uiManager.addShouldRescale(this);
    this.disableEditing();

    return div;
  }

  /**
   * Create a new drawer instance.
   * @param {number} x - The x coordinate of the event.
   * @param {number} y - The y coordinate of the event.
   * @param {number} parentWidth - The parent width.
   * @param {number} parentHeight - The parent height.
   * @param {number} rotation - The parent rotation.
   */
  static createDrawerInstance(_x, _y, _parentWidth, _parentHeight, _rotation) {
    unreachable("Not implemented");
  }

  static startDrawing(
    parent,
    uiManager,
    _isLTR,
    { target, offsetX: x, offsetY: y }
  ) {
    const {
      viewport: { rotation },
    } = parent;
    const { width: parentWidth, height: parentHeight } =
      target.getBoundingClientRect();
    const ac = new AbortController();
    const signal = parent.combinedSignal(ac);

    window.addEventListener(
      "pointerup",
      e => {
        ac.abort();
        parent.toggleDrawing(true);
        this._endDraw(e);
      },
      { signal }
    );
    window.addEventListener(
      "pointerdown",
      stopEvent /* Avoid to have undesired clicks during drawing. */,
      {
        capture: true,
        passive: false,
        signal,
      }
    );
    window.addEventListener("contextmenu", noContextMenu, { signal });
    target.addEventListener("pointermove", this._drawMove.bind(this), {
      signal,
    });
    parent.toggleDrawing();
    uiManager._editorUndoBar?.hide();

    if (this._currentDraw) {
      parent.drawLayer.updateProperties(
        this._currentDrawId,
        this._currentDraw.startNew(x, y, parentWidth, parentHeight, rotation)
      );
      return;
    }

    uiManager.updateUIForDefaultProperties(this);

    this._currentDraw = this.createDrawerInstance(
      x,
      y,
      parentWidth,
      parentHeight,
      rotation
    );
    this._currentDrawingOptions = this.getDefaultDrawingOptions();
    this._currentParent = parent;

    ({ id: this._currentDrawId } = parent.drawLayer.draw(
      this._mergeSVGProperties(
        this._currentDrawingOptions.toSVGProperties(),
        this._currentDraw.defaultSVGProperties
      ),
      /* isPathUpdatable = */ true,
      /* hasClip = */ false
    ));
  }

  static _drawMove({ offsetX, offsetY }) {
    this._currentParent.drawLayer.updateProperties(
      this._currentDrawId,
      this._currentDraw.add(offsetX, offsetY)
    );
  }

  static _endDraw({ offsetX, offsetY }) {
    const parent = this._currentParent;
    parent.drawLayer.updateProperties(
      this._currentDrawId,
      this._currentDraw.end(offsetX, offsetY)
    );
    if (this.supportMultipleDrawings) {
      const draw = this._currentDraw;
      const drawId = this._currentDrawId;
      const lastElement = draw.getLastElement();
      parent.addCommands({
        cmd: () => {
          parent.drawLayer.updateProperties(
            drawId,
            draw.setLastElement(lastElement)
          );
        },
        undo: () => {
          parent.drawLayer.updateProperties(drawId, draw.removeLastElement());
        },
        mustExec: false,
        type: AnnotationEditorParamsType.DRAW_STEP,
      });

      return;
    }

    this.endDrawing(/* isAborted = */ false);
  }

  static endDrawing(isAborted) {
    const parent = this._currentParent;
    if (!parent) {
      return null;
    }
    parent.toggleDrawing(true);
    parent.cleanUndoStack(AnnotationEditorParamsType.DRAW_STEP);

    if (!this._currentDraw.isEmpty()) {
      const {
        pageDimensions: [pageWidth, pageHeight],
        scale,
      } = parent;

      const editor = parent.createAndAddNewEditor(
        { offsetX: 0, offsetY: 0 },
        false,
        {
          drawId: this._currentDrawId,
          drawOutlines: this._currentDraw.getOutlines(
            pageWidth * scale,
            pageHeight * scale,
            scale,
            this._INNER_MARGIN
          ),
          drawingOptions: this._currentDrawingOptions,
          mustBeCommitted: !isAborted,
        }
      );
      this._cleanup();
      return editor;
    }

    parent.drawLayer.remove(this._currentDrawId);
    this._cleanup();
    return null;
  }

  static _cleanup() {
    this._currentDrawId = -1;
    this._currentDraw = null;
    this._currentDrawingOptions = null;
    this._currentParent = null;
  }

  /**
   * Create the drawing options.
   * @param {Object} _data
   */
  createDrawingOptions(_data) {}

  /**
   * Deserialize the drawing outlines.
   * @param {number} pageX - The x coordinate of the page.
   * @param {number} pageY - The y coordinate of the page.
   * @param {number} pageWidth - The width of the page.
   * @param {number} pageHeight - The height of the page.
   * @param {number} innerWidth - The inner width.
   * @param {Object} data - The data to deserialize.
   * @returns {Object} The deserialized outlines.
   */
  static deserializeDraw(
    _pageX,
    _pageY,
    _pageWidth,
    _pageHeight,
    _innerWidth,
    _data
  ) {
    unreachable("Not implemented");
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    const {
      rawDims: { pageWidth, pageHeight, pageX, pageY },
    } = parent.viewport;
    const drawOutlines = this.deserializeDraw(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      this._INNER_MARGIN,
      data
    );
    const editor = await super.deserialize(data, parent, uiManager);
    editor.createDrawingOptions(data);
    editor.#createDrawOutlines({ drawOutlines });
    editor.#addToDrawLayer();
    editor.onScaleChanging();
    editor.rotate();

    return editor;
  }

  serializeDraw(isForCopying) {
    const [pageX, pageY] = this.pageTranslation;
    const [pageWidth, pageHeight] = this.pageDimensions;
    return this.#drawOutlines.serialize(
      [pageX, pageY, pageWidth, pageHeight],
      isForCopying
    );
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

export { DrawingEditor, DrawingOptions };
