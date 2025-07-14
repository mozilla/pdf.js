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
  static _type = "ink";

  static _editorType = AnnotationEditorType.INK;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "inkEditor" });
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
      };
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;

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
    const { points, rect } = this.serializeDraw(/* isForCopying = */ false);
    annotation.updateEdited({
      rect,
      thickness: this._drawingOptions["stroke-width"],
      points,
    });

    return null;
  }
}

export { InkDrawingOptions, InkEditor };
