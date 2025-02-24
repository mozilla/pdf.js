/* Copyright 2025 Mozilla Foundation
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

import { AnnotationEditorType, shadow } from "../../shared/util.js";
import { DrawingEditor, DrawingOptions } from "./draw.js";
import { AnnotationEditor } from "./editor.js";
import { ContourDrawOutline } from "./drawers/contour.js";
import { InkDrawingOptions } from "./ink.js";
import { InkDrawOutline } from "./drawers/inkdraw.js";
import { SignatureExtractor } from "./drawers/signaturedraw.js";

class SignatureOptions extends DrawingOptions {
  constructor() {
    super();

    super.updateProperties({
      fill: "CanvasText",
      "stroke-width": 0,
    });
  }

  clone() {
    const clone = new SignatureOptions();
    clone.updateAll(this);
    return clone;
  }
}

class DrawnSignatureOptions extends InkDrawingOptions {
  constructor(viewerParameters) {
    super(viewerParameters);

    super.updateProperties({
      stroke: "CanvasText",
      "stroke-width": 1,
    });
  }

  clone() {
    const clone = new DrawnSignatureOptions(this._viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Basic editor in order to generate an Stamp annotation annotation containing
 * a signature drawing.
 */
class SignatureEditor extends DrawingEditor {
  #isExtracted = false;

  #description = null;

  #signatureData = null;

  #signatureUUID = null;

  static _type = "signature";

  static _editorType = AnnotationEditorType.SIGNATURE;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, mustBeCommitted: true, name: "signatureEditor" });
    this._willKeepAspectRatio = true;
    this.#signatureData = params.signatureData || null;
    this.#description = null;
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);

    this._defaultDrawingOptions = new SignatureOptions();
    this._defaultDrawnSignatureOptions = new DrawnSignatureOptions(
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
    return false;
  }

  static get typesMap() {
    return shadow(this, "typesMap", new Map());
  }

  static get isDrawer() {
    return false;
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "signature",
      hasDescription: !!this.#description,
    };
  }

  static computeTelemetryFinalData(data) {
    const hasDescriptionStats = data.get("hasDescription");
    return {
      hasAltText: hasDescriptionStats.get(true) ?? 0,
      hasNoAltText: hasDescriptionStats.get(false) ?? 0,
    };
  }

  /** @inheritdoc */
  get isResizable() {
    return true;
  }

  /** @inheritdoc */
  onScaleChanging() {
    if (this._drawId === null) {
      return;
    }
    super.onScaleChanging();
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    let baseX, baseY;
    const { _isCopy } = this;
    if (_isCopy) {
      // No need to adjust the position when rendering in DrawingEditor.
      this._isCopy = false;
      baseX = this.x;
      baseY = this.y;
    }

    super.render();
    this.div.setAttribute("role", "figure");

    if (this._drawId === null) {
      if (this.#signatureData) {
        const {
          lines,
          mustSmooth,
          areContours,
          description,
          uuid,
          heightInPage,
        } = this.#signatureData;
        const {
          rawDims: { pageWidth, pageHeight },
          rotation,
        } = this.parent.viewport;
        const outline = SignatureExtractor.processDrawnLines({
          lines,
          pageWidth,
          pageHeight,
          rotation,
          innerMargin: SignatureEditor._INNER_MARGIN,
          mustSmooth,
          areContours,
        });
        this.addSignature(outline, heightInPage, description, uuid);
      } else {
        this.div.hidden = true;
        this._uiManager.getSignature(this);
      }
    }

    if (_isCopy) {
      this._isCopy = true;
      this._moveAfterPaste(baseX, baseY);
    }

    return this.div;
  }

  setUuid(uuid) {
    this.#signatureUUID = uuid;
    this.addEditToolbar();
  }

  getUuid() {
    return this.#signatureUUID;
  }

  get description() {
    return this.#description;
  }

  set description(description) {
    this.#description = description;
    super.addEditToolbar().then(toolbar => {
      toolbar?.updateEditSignatureButton(description);
    });
  }

  getSignaturePreview() {
    const { newCurves, areContours, thickness, width, height } =
      this.#signatureData;
    const maxDim = Math.max(width, height);
    const outlineData = SignatureExtractor.processDrawnLines({
      lines: {
        curves: newCurves.map(points => ({ points })),
        thickness,
        width,
        height,
      },
      pageWidth: maxDim,
      pageHeight: maxDim,
      rotation: 0,
      innerMargin: 0,
      mustSmooth: false,
      areContours,
    });
    return { areContours, outline: outlineData.outline };
  }

  /** @inheritdoc */
  async addEditToolbar() {
    const toolbar = await super.addEditToolbar();
    if (!toolbar) {
      return null;
    }
    if (this._uiManager.signatureManager && this.#description !== null) {
      await toolbar.addEditSignatureButton(
        this._uiManager.signatureManager,
        this.#signatureUUID,
        this.#description
      );
      toolbar.show();
    }
    return toolbar;
  }

  addSignature(data, heightInPage, description, uuid) {
    const { x: savedX, y: savedY } = this;
    const { outline } = (this.#signatureData = data);
    this.#isExtracted = outline instanceof ContourDrawOutline;
    this.#description = description;
    let drawingOptions;
    if (this.#isExtracted) {
      drawingOptions = SignatureEditor.getDefaultDrawingOptions();
    } else {
      drawingOptions = SignatureEditor._defaultDrawnSignatureOptions.clone();
      drawingOptions.updateProperties({ "stroke-width": outline.thickness });
    }
    this._addOutlines({
      drawOutlines: outline,
      drawingOptions,
    });
    const [parentWidth, parentHeight] = this.parentDimensions;
    const [, pageHeight] = this.pageDimensions;
    let newHeight = heightInPage / pageHeight;
    // Ensure the signature doesn't exceed the page height.
    // If the signature is too big, we scale it down to 50% of the page height.
    newHeight = newHeight >= 1 ? 0.5 : newHeight;

    this.width *= newHeight / this.height;
    if (this.width >= 1) {
      newHeight *= 0.9 / this.width;
      this.width = 0.9;
    }

    this.height = newHeight;
    this.setDims(parentWidth * this.width, parentHeight * this.height);
    this.x = savedX;
    this.y = savedY;
    this.center();

    this._onResized();
    this.onScaleChanging();
    this.rotate();
    this._uiManager.addToAnnotationStorage(this);
    this.setUuid(uuid);

    this._reportTelemetry({
      action: "pdfjs.signature.inserted",
      data: {
        hasBeenSaved: !!uuid,
        hasDescription: !!description,
      },
    });

    this.div.hidden = false;
  }

  getFromImage(bitmap) {
    const {
      rawDims: { pageWidth, pageHeight },
      rotation,
    } = this.parent.viewport;
    return SignatureExtractor.process(
      bitmap,
      pageWidth,
      pageHeight,
      rotation,
      SignatureEditor._INNER_MARGIN
    );
  }

  getFromText(text, fontInfo) {
    const {
      rawDims: { pageWidth, pageHeight },
      rotation,
    } = this.parent.viewport;
    return SignatureExtractor.extractContoursFromText(
      text,
      fontInfo,
      pageWidth,
      pageHeight,
      rotation,
      SignatureEditor._INNER_MARGIN
    );
  }

  getDrawnSignature(curves) {
    const {
      rawDims: { pageWidth, pageHeight },
      rotation,
    } = this.parent.viewport;
    return SignatureExtractor.processDrawnLines({
      lines: curves,
      pageWidth,
      pageHeight,
      rotation,
      innerMargin: SignatureEditor._INNER_MARGIN,
      mustSmooth: false,
      areContours: false,
    });
  }

  /** @inheritdoc */
  createDrawingOptions({ areContours, thickness }) {
    if (areContours) {
      this._drawingOptions = SignatureEditor.getDefaultDrawingOptions();
    } else {
      this._drawingOptions =
        SignatureEditor._defaultDrawnSignatureOptions.clone();
      this._drawingOptions.updateProperties({ "stroke-width": thickness });
    }
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.isEmpty()) {
      return null;
    }

    const { lines, points, rect } = this.serializeDraw(isForCopying);
    const {
      _drawingOptions: { "stroke-width": thickness },
    } = this;
    const serialized = {
      annotationType: AnnotationEditorType.SIGNATURE,
      isSignature: true,
      areContours: this.#isExtracted,
      color: [0, 0, 0],
      thickness: this.#isExtracted ? 0 : thickness,
      pageIndex: this.pageIndex,
      rect,
      rotation: this.rotation,
      structTreeParentId: this._structTreeParentId,
    };
    if (isForCopying) {
      serialized.paths = { lines, points };
      serialized.uuid = this.#signatureUUID;
      serialized.isCopy = true;
    } else {
      serialized.lines = lines;
    }
    if (this.#description) {
      serialized.accessibilityData = { type: "Figure", alt: this.#description };
    }
    return serialized;
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
    if (data.areContours) {
      return ContourDrawOutline.deserialize(
        pageX,
        pageY,
        pageWidth,
        pageHeight,
        innerMargin,
        data
      );
    }

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
    const editor = await super.deserialize(data, parent, uiManager);
    editor.#isExtracted = data.areContours;
    editor.#description = data.accessibilityData?.alt || "";
    editor.#signatureUUID = data.uuid;
    return editor;
  }
}

export { SignatureEditor };
