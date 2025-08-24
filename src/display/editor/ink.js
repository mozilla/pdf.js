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
import { DrawingEditor, DrawingOptions } from "./draw.js";
import { InkDrawOutline, InkDrawOutliner } from "./drawers/inkdraw.js";
import { AnnotationEditor } from "./editor.js";
import { BasicColorPicker } from "./color_picker.js";
import { InkAnnotationElement } from "../annotation_layer.js";

class InkDrawingOptions extends DrawingOptions {
  constructor(viewerParameters) {
    super();
    this._viewParameters = viewerParameters;

    super.updateProperties({
      fill: "none",
      stroke: AnnotationEditor._defaultLineColor,
      "stroke-opacity": 1,
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-miterlimit": 10,
    });
  }

  updateSVGProperty(name, value) {
    if (name === "stroke-width") {
      value ??= this["stroke-width"];
      value *= this._viewParameters.realScale;
    }
    super.updateSVGProperty(name, value);
  }

  clone() {
    const clone = new InkDrawingOptions(this._viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Basic draw editor in order to generate an Ink annotation.
 */
class InkEditor extends DrawingEditor {
  #points = null;

  #erased = false;

  static _type = "ink";

  static _editorType = AnnotationEditorType.INK;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "inkEditor" });
    this._erasable = true;
    this._willKeepAspectRatio = true;
    this.defaultL10nId = "pdfjs-editor-ink-editor";
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    this._defaultDrawingOptions = new InkDrawingOptions(
      uiManager.viewParameters
    );
  }

  /** @inheritdoc */
  static getDefaultDrawingOptions(options) {
    const clone = this._defaultDrawingOptions.clone();
    clone.updateProperties(options);
    return clone;
  }

  /** @inheritdoc */
  static get supportMultipleDrawings() {
    return true;
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([
        [AnnotationEditorParamsType.INK_THICKNESS, "stroke-width"],
        [AnnotationEditorParamsType.INK_COLOR, "stroke"],
        [AnnotationEditorParamsType.INK_OPACITY, "stroke-opacity"],
      ])
    );
  }

  /** @inheritdoc */
  static createDrawerInstance(x, y, parentWidth, parentHeight, rotation) {
    return new InkDrawOutliner(
      x,
      y,
      parentWidth,
      parentHeight,
      rotation,
      this._defaultDrawingOptions["stroke-width"]
    );
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    data
  ) {
    return InkDrawOutline.deserialize(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      innerMargin,
      data
    );
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof InkAnnotationElement) {
      const {
        data: {
          inkLists,
          rect,
          rotation,
          id,
          color,
          opacity,
          borderStyle: { rawWidth: thickness },
          popupRef,
          contentsObj,
        },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.INK,
        color: Array.from(color),
        thickness,
        opacity,
        paths: { points: inkLists },
        boxes: null,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        annotationElementId: id,
        id,
        deleted: false,
        popupRef,
        comment: contentsObj?.str || null,
      };
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;
    if (data.comment) {
      editor.setCommentData(data.comment);
    }

    return editor;
  }

  /** @inheritdoc */
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }

  get colorType() {
    return AnnotationEditorParamsType.INK_COLOR;
  }

  get colorValue() {
    return this._drawingOptions.stroke;
  }

  /** @inheritdoc */
  onScaleChanging() {
    if (!this.parent) {
      return;
    }
    super.onScaleChanging();
    const { _drawId, _drawingOptions, parent } = this;
    _drawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      _drawId,
      _drawingOptions.toSVGProperties()
    );
  }

  static onScaleChangingWhenDrawing() {
    const parent = this._currentParent;
    if (!parent) {
      return;
    }
    super.onScaleChangingWhenDrawing();
    this._defaultDrawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      this._currentDrawId,
      this._defaultDrawingOptions.toSVGProperties()
    );
  }

  /** @inheritdoc */
  createDrawingOptions({ color, thickness, opacity }) {
    this._drawingOptions = InkEditor.getDefaultDrawingOptions({
      stroke: Util.makeHexColor(...color),
      "stroke-width": thickness,
      "stroke-opacity": opacity,
    });
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const { lines, points, rect } = this.serializeDraw(isForCopying);
    const {
      _drawingOptions: {
        stroke,
        "stroke-opacity": opacity,
        "stroke-width": thickness,
      },
    } = this;
    const serialized = {
      annotationType: AnnotationEditorType.INK,
      color: AnnotationEditor._colorManager.convert(stroke),
      opacity,
      thickness,
      paths: {
        lines,
        points,
      },
      pageIndex: this.pageIndex,
      rect,
      rotation: this.rotation,
      structTreeParentId: this._structTreeParentId,
    };
    this.addComment(serialized);

    if (isForCopying) {
      serialized.isCopy = true;
      return serialized;
    }

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;
    return serialized;
  }

  #hasElementChanged(serialized) {
    const { color, thickness, opacity, pageIndex } = this._initialData;
    return (
      this.hasEditedComment ||
      this._hasBeenMoved ||
      this._hasBeenResized ||
      serialized.color.some((c, i) => c !== color[i]) ||
      serialized.thickness !== thickness ||
      serialized.opacity !== opacity ||
      serialized.pageIndex !== pageIndex
    );
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    if (this.deleted) {
      annotation.hide();
      return null;
    }
    const { points, rect } = this.serializeDraw(/* isForCopying = */ false);
    const params = {
      rect,
      thickness: this._drawingOptions["stroke-width"],
      points,
    };
    if (this.hasEditedComment) {
      params.popup = this.comment;
    }
    annotation.updateEdited(params);

    return null;
  }

  /**
   * Erase everything in a radius of (x,y) position.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  erase(x, y, radius) {
    if (!this.#points) {
      this.#points = this.serializeDraw(false).points;
    }

    const radius2 = radius * radius;
    const newPaths = [];
    let modified = false;

    for (const path of this.#points) {
      if (path.length === 0) {
        continue;
      }
      let newPath = [];
      for (let i = 0; i < path.length; i += 2) {
        const [lx, ly] = this.#pagePointToLayer(path[i], path[i + 1]);
        const dx = lx - x;
        const dy = ly - y;
        const dist = dx * dx + dy * dy;
        if (dist >= radius2) {
          newPath.push(path[i], path[i + 1]);
        } else {
          modified = true;
          if (newPath.length >= 4) {
            newPaths.push(new Float32Array(newPath));
          }
          newPath = [];
        }
      }
      if (newPath.length >= 4) {
        newPaths.push(new Float32Array(newPath));
      }
    }

    if (modified) {
      this.#points = newPaths;
      this.#erased = true;
      // remove svg path if no points are left
      if (newPaths.length === 0) {
        this.parent.drawLayer.updateProperties(this._drawId, {
          path: { d: "" },
        });
      } else {
        const tempOutline = this.#deserializePoints();
        this.parent.drawLayer.updateProperties(this._drawId, {
          path: { d: tempOutline.toSVGPath() },
        });
      }
    }
  }

  endErase() {
    // if nothing has been erased
    if (!this.#erased) {
      return {};
    }

    // reset erased flag
    this.#erased = false;
    const oldOutline = this._drawOutlines;
    const drawingOptions = { ...this._drawingOptions };
    const undo = () => {
      this._addOutlines({
        drawOutlines: oldOutline,
        drawId: this._drawId,
        drawingOptions,
      });
    };

    if (this.#points.length === 0) {
      this.remove();
      return { cmd: () => this.remove(), undo };
    }

    const newOutlines = this.#deserializePoints();
    const cmd = () =>
      this._addOutlines({
        drawOutlines: newOutlines,
        drawId: this._drawId,
        drawingOptions,
      });
    cmd();

    this.#points = null;

    return { cmd, undo };
  }

  #deserializePoints() {
    const {
      viewport: {
        rawDims: { pageWidth, pageHeight, pageX, pageY },
      },
    } = this.parent;

    const thickness = this._drawingOptions["stroke-width"];
    const rotation = this.rotation;

    const newOutline = InkEditor.deserializeDraw(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      InkEditor._INNER_MARGIN,
      {
        paths: { points: this.#points },
        rotation,
        thickness,
      }
    );

    return newOutline;
  }

  #pagePointToLayer(px, py) {
    const [pageX, pageY] = this.pageTranslation;
    const [pageW, pageH] = this.pageDimensions;
    const { width: layerW, height: layerH } =
      this.parent.div.getBoundingClientRect();

    const nx = (px - pageX) / pageW;
    const ny = (py - pageY) / pageH;

    let rx, ry;
    switch ((this.rotation || 0) % 360) {
      case 90:
        rx = ny;
        ry = 1 - nx;
        break;
      case 180:
        rx = 1 - nx;
        ry = 1 - ny;
        break;
      case 270:
        rx = 1 - ny;
        ry = nx;
        break;
      default:
        rx = nx;
        ry = ny;
        break;
    }

    const lx = rx * layerW;
    const ly = (1 - ry) * layerH;
    return [lx, ly];
  }
}

export { InkDrawingOptions, InkEditor };
