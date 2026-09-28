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
import {
  FreeHighlightDrawer,
  FreeHighlightOutliner,
  HighlightOutline,
} from "./drawers/highlight.js";
import {
  HighlightAnnotationElement,
  InkAnnotationElement,
} from "../annotation_layer.js";
import { AnnotationEditor } from "./editor.js";
import { ColorPicker } from "./color_picker.js";
import { DrawingOptions } from "./draw.js";
import { stopEvent } from "../display_utils.js";
import { TextMarkupEditor } from "./text_markup.js";

class HighlightDrawingOptions extends DrawingOptions {
  constructor(properties = null) {
    super();
    super.updateProperties(properties);
  }

  /** @inheritdoc */
  updateSVGProperty(name, value) {
    if (name !== "thickness") {
      // Thickness changes free-highlight geometry, not SVG attributes.
      super.updateSVGProperty(name, value);
    }
  }

  /** @inheritdoc */
  clone() {
    const clone = new HighlightDrawingOptions();
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Editor for text-selection and freehand highlights.
 * Their geometry comes from separate outline implementations.
 */
class HighlightEditor extends TextMarkupEditor {
  #methodOfCreation = "";

  static _DEFAULT_THICKNESS = 12;

  static _defaultDrawingOptions = null;

  static _type = "highlight";

  static _editorType = AnnotationEditorType.HIGHLIGHT;

  constructor(params) {
    super({ ...params, name: "highlightEditor" });
    this.#methodOfCreation =
      params.methodOfCreation ||
      (this._drawOutlines?.isFree ? "main_toolbar" : "");
    this.defaultL10nId = "pdfjs-editor-highlight-editor";
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    // Preserve user-selected defaults across initialize calls.
    this._defaultDrawingOptions ||= new HighlightDrawingOptions({
      fill: uiManager.highlightColors?.values().next().value || "#fff066",
      "fill-opacity": HighlightEditor._DEFAULT_OPACITY,
      thickness: HighlightEditor._DEFAULT_THICKNESS,
    });
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([
        [AnnotationEditorParamsType.HIGHLIGHT_COLOR, "fill"],
        [AnnotationEditorParamsType.HIGHLIGHT_THICKNESS, "thickness"],
      ])
    );
  }

  /** @inheritdoc */
  static _buildOutline(boxes, _pageDimensions, isLTR) {
    // The text is filled, hence the outline is the one of the text boxes.
    return HighlightOutline.build(boxes, isLTR);
  }

  get colorType() {
    return AnnotationEditorParamsType.HIGHLIGHT_COLOR;
  }

  /** @inheritdoc */
  get _drawRotation() {
    // Text uses page coordinates; freehand uses editor rotation.
    return this._drawOutlines?.isFree ? this.rotation : 0;
  }

  /** @inheritdoc */
  get _mustFixPosition() {
    return !this._drawOutlines?.isFree;
  }

  /** @inheritdoc */
  get telemetryInitialData() {
    return {
      action: "added",
      type: this._drawOutlines.isFree ? "free_highlight" : "highlight",
      color: this._uiManager.getNonHCMColorName(this.color),
      thickness: this._drawingOptions.thickness,
      methodOfCreation: this.#methodOfCreation,
    };
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "highlight",
      color: this._uiManager.getNonHCMColorName(this.color),
    };
  }

  static computeTelemetryFinalData(data) {
    // We want to know how many colors have been used.
    return { numberOfColors: data.get("color").size };
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.HIGHLIGHT_COLOR:
        // User-selected colors use the default opacity.
        this._updateColorAndOpacity(
          value,
          HighlightEditor._DEFAULT_OPACITY,
          type
        );
        this._reportTelemetry(
          {
            action: "color_changed",
            color: this._uiManager.getNonHCMColorName(value),
          },
          /* mustWait = */ true
        );
        break;
      case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS:
        super.updateParams(type, value);
        this._reportTelemetry(
          { action: "thickness_changed", thickness: value },
          /* mustWait = */ true
        );
        break;
    }
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    const properties = super.propertiesToUpdate;
    properties.push([
      AnnotationEditorParamsType.HIGHLIGHT_FREE,
      this._drawOutlines.isFree,
    ]);
    return properties;
  }

  /** @inheritdoc */
  get toolbarButtons() {
    if (this._uiManager.highlightColors) {
      // The toolbar destroys its picker, so rebuild it with the toolbar.
      this._colorPicker = new ColorPicker({ editor: this });
      return [["colorPicker", this._colorPicker]];
    }
    // Without any predefined colors, there's no color picker.
    return null;
  }

  /** @inheritdoc */
  remove() {
    this._reportTelemetry({
      action: "deleted",
    });
    super.remove();
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    if (this._drawOutlines.isFree) {
      div.classList.add("free");
    }

    return div;
  }

  /** @inheritdoc */
  static createDrawerInstance({ x, y, box, parent, isLTR }) {
    // The outliner spreads the stroke on both sides of the pointer path, hence
    // it takes the half-thickness. The inner margin slightly inflates the
    // bounding box, else the shape would be clipped by its own SVG viewport.
    return new FreeHighlightDrawer(
      x,
      y,
      box,
      parent.scale,
      this._defaultDrawingOptions.thickness / 2,
      isLTR,
      /* innerMargin = */ 0.001
    );
  }

  /** @inheritdoc */
  static _getDrawingTarget(parent, { target }) {
    // The event target can be a child of the text layer.
    return target.closest(".textLayer");
  }

  /** @inheritdoc */
  static _getPointerCoords({ x, y }) {
    // Child-relative offsets don't match the text layer's client box.
    return [x, y];
  }

  /** @inheritdoc */
  static _addDrawingListeners(target, signal) {
    // Highlights bypass AnnotationEditorLayer.startDrawingSession.
    target.classList.add("free");
    signal.addEventListener("abort", () => target.classList.remove("free"), {
      once: true,
    });
    window.addEventListener("blur", () => this._endDraw(null), { signal });
    window.addEventListener(
      "pointerdown",
      stopEvent /* Prevent pointerdown from reaching page content. */,
      {
        capture: true,
        passive: false,
        signal,
      }
    );
  }

  /** @inheritdoc */
  static _endDrawingSession(isAborted = false) {
    return this.endDrawing(isAborted);
  }

  /** @inheritdoc */
  createDrawingOptions({ color, opacity, thickness }) {
    const { _defaultDrawingOptions: defaults, _DEFAULT_OPACITY } =
      HighlightEditor;
    this._drawingOptions = HighlightEditor.getDefaultDrawingOptions({
      fill: Util.makeHexColor(...color),
      "fill-opacity": opacity || _DEFAULT_OPACITY,
      thickness: thickness || defaults.thickness,
    });
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    data,
    uiManager
  ) {
    if (data.quadPoints) {
      return super.deserializeDraw(
        pageX,
        pageY,
        pageWidth,
        pageHeight,
        innerMargin,
        data,
        uiManager
      );
    }

    const thickness = data.thickness || this._defaultDrawingOptions.thickness;
    const points = (data.inkLists || data.outlines.points)[0];
    // As in `createDrawerInstance`, the outliner takes the half-thickness and a
    // non-null inner margin.
    const outliner = new FreeHighlightOutliner(
      points[0] - pageX,
      pageHeight - (points[1] - pageY),
      [0, 0, pageWidth, pageHeight],
      1,
      thickness / 2,
      true,
      /* innerMargin = */ 0.001
    );
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      outliner.add(points[i] - pageX, pageHeight - (points[i + 1] - pageY));
    }
    const outlines = outliner.getOutlines();
    outlines.buildFocusOutline(thickness);

    return outlines;
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof HighlightAnnotationElement) {
      const {
        data: {
          quadPoints,
          rect,
          rotation,
          id,
          color,
          opacity,
          popupRef,
          richText,
          contentsObj,
          creationDate,
          modificationDate,
        },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        opacity,
        quadPoints,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        annotationElementId: id,
        id,
        deleted: false,
        popupRef,
        richText,
        comment: contentsObj?.str || null,
        creationDate,
        modificationDate,
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
          richText,
          contentsObj,
          creationDate,
          modificationDate,
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
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        annotationElementId: id,
        id,
        deleted: false,
        popupRef,
        richText,
        comment: contentsObj?.str || null,
        creationDate,
        modificationDate,
      };
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;
    if (data.comment) {
      editor.setCommentData(data);
    }

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    const serialized = super.serialize(isForCopying);
    if (!serialized || this.deleted) {
      return serialized;
    }

    Object.assign(serialized, {
      thickness: this._drawingOptions.thickness,
      outlines: this._drawOutlines.serialize(
        serialized.rect,
        this._drawRotation
      ),
    });

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;
    return serialized;
  }

  #hasElementChanged(serialized) {
    const { color } = this._initialData;
    return (
      this.hasEditedComment || serialized.color.some((c, i) => c !== color[i])
    );
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    if (this.deleted) {
      annotation.hide();
      return null;
    }
    annotation.updateEdited({
      rect: this.getPDFRect(),
      popup: this.comment,
    });

    return null;
  }
}

export { HighlightEditor };
