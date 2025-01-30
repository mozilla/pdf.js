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
import { SignatureExtractor } from "./drawers/signaturedraw.js";
import { SupportedImageMimeTypes } from "../display_utils.js";

class SignatureOptions extends DrawingOptions {
  #viewParameters;

  constructor(viewerParameters) {
    super();
    this.#viewParameters = viewerParameters;

    super.updateProperties({
      fill: "black",
      "stroke-width": 0,
    });
  }

  clone() {
    const clone = new SignatureOptions(this.#viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Basic editor in order to generate an Stamp annotation annotation containing
 * a signature drawing.
 */
class SignatureEditor extends DrawingEditor {
  static _type = "signature";

  static _editorType = AnnotationEditorType.SIGNATURE;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, mustBeCommitted: true, name: "signatureEditor" });
    this._willKeepAspectRatio = false;
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    this._defaultDrawingOptions = new SignatureOptions(
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
  get isResizable() {
    return true;
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    super.render();
    this.div.hidden = true;
    this.div.setAttribute("role", "figure");

    this.#extractSignature();

    return this.div;
  }

  async #extractSignature() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = SupportedImageMimeTypes.join(",");
    const signal = this._uiManager._signal;
    const { promise, resolve } = Promise.withResolvers();

    input.addEventListener(
      "change",
      async () => {
        if (!input.files || input.files.length === 0) {
          resolve();
        } else {
          this._uiManager.enableWaiting(true);
          const data = await this._uiManager.imageManager.getFromFile(
            input.files[0]
          );
          this._uiManager.enableWaiting(false);
          resolve(data);
        }
        resolve();
      },
      { signal }
    );
    input.addEventListener("cancel", resolve, { signal });
    input.click();

    const bitmap = await promise;
    if (!bitmap?.bitmap) {
      this.remove();
      return;
    }
    const {
      rawDims: { pageWidth, pageHeight },
      rotation,
    } = this.parent.viewport;
    const drawOutlines = SignatureExtractor.process(
      bitmap.bitmap,
      pageWidth,
      pageHeight,
      rotation,
      SignatureEditor._INNER_MARGIN
    );
    this._addOutlines({
      drawOutlines,
      drawingOptions: SignatureEditor.getDefaultDrawingOptions(),
    });
    this.onScaleChanging();
    this.rotate();
    this.div.hidden = false;
  }
}

export { SignatureEditor };
