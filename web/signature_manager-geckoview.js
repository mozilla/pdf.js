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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  SignatureExtractor,
} from "pdfjs-lib";
import { internalOpt } from "./internal_evt.js";

// Initial height in page units.
const DEFAULT_HEIGHT_IN_PAGE = 40;

const SIGNATURE_FONT = Object.freeze({
  fontFamily: "cursive",
  fontStyle: "normal",
  fontWeight: "400",
});

/** Converts GeckoView's typed-signature events into signature editors. */
class SignatureManager {
  #eventBus;

  #mode = AnnotationEditorType.NONE;

  #pendingSignatures = [];

  constructor(eventBus, signal) {
    this.#eventBus = eventBus;
    const opts = { signal, ...internalOpt };
    eventBus.on("addsignature", this.#onAddSignature.bind(this), opts);
    eventBus.on(
      "annotationeditormodechanged",
      this.#onModeChanged.bind(this),
      opts
    );
  }

  #onAddSignature({ text }) {
    const signatureData = SignatureManager.#getSignatureData(text);
    if (!signatureData) {
      return;
    }
    if (this.#mode === AnnotationEditorType.SIGNATURE) {
      this.#createEditor(signatureData);
      return;
    }
    // Wait for signature mode before creating the editor.
    this.#pendingSignatures.push(signatureData);
    this.#eventBus.dispatch("switchannotationeditormode", {
      source: this,
      mode: AnnotationEditorType.SIGNATURE,
    });
  }

  #onModeChanged({ mode }) {
    this.#mode = mode;
    if (mode !== AnnotationEditorType.SIGNATURE) {
      // Keep the pending signatures until we're in signature mode.
      return;
    }
    const pendingSignatures = this.#pendingSignatures;
    this.#pendingSignatures = [];
    for (const signatureData of pendingSignatures) {
      this.#createEditor(signatureData);
    }
  }

  #createEditor(signatureData) {
    this.#eventBus.dispatch("switchannotationeditorparams", {
      source: this,
      type: AnnotationEditorParamsType.CREATE,
      value: { signatureData },
    });
  }

  static #getSignatureData(text) {
    text = typeof text === "string" ? text.trim() : "";
    if (!text) {
      return null;
    }
    // SignatureEditor.render() rebuilds the outline; only newCurves is kept.
    const data = SignatureExtractor.extractContoursFromText(
      text,
      SIGNATURE_FONT,
      /* pageWidth = */ 1,
      /* pageHeight = */ 1,
      /* rotation = */ 0,
      /* innerMargin = */ 0
    );
    if (!data) {
      return null;
    }
    const { newCurves, width, height } = data;
    return {
      lines: {
        curves: newCurves.map(points => ({ points })),
        width,
        height,
      },
      mustSmooth: false,
      areContours: true,
      description: text,
      uuid: null,
      heightInPage: DEFAULT_HEIGHT_IN_PAGE,
    };
  }

  getSignature() {}

  loadSignatures() {}

  /** GeckoView has no description editor. */
  renderEditButton() {
    return null;
  }

  destroy() {
    this.#pendingSignatures.length = 0;
  }
}

export { SignatureManager };
