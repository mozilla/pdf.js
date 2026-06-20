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

import { AnnotationEditor } from "./editor.js";
import { AnnotationEditorType } from "../../shared/util.js";
import { MathClamp } from "../../shared/math_clamp.js";

/**
 * A visual redaction marker. It is intentionally not saved as a PDF annotation:
 * the viewer rasterizes pages containing these editors and paints the black
 * boxes into the replacement page image.
 */
class RedactionEditor extends AnnotationEditor {
  #boxes = null;

  static _type = "redaction";

  static _editorType = AnnotationEditorType.REDACTION;

  constructor(params) {
    super({ ...params, name: "redactionEditor" });
    if (params.boxes?.length > 0) {
      this.#setBoxes(params.boxes);
    } else {
      this.width ||= 0.24;
      this.height ||= 0.065;
    }
    this.canAddComment = false;
    this.defaultL10nId = "pdfjs-editor-redaction-editor";
  }

  #boxToCurrentCoords({ x, y, width, height }) {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const left = x * pageWidth + pageX;
    const top = (1 - y) * pageHeight + pageY;
    const rect = [
      left,
      top - height * pageHeight,
      left + width * pageWidth,
      top,
    ];
    const [currentX, currentY, currentWidth, currentHeight] =
      this.getRectInCurrentCoords(rect, pageHeight);

    return {
      x: currentX / pageWidth,
      y: currentY / pageHeight,
      width: currentWidth / pageWidth,
      height: currentHeight / pageHeight,
    };
  }

  #setBoxes(boxes) {
    const currentBoxes = boxes.map(this.#boxToCurrentCoords, this);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const { x, y, width, height } of currentBoxes) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    this.x = minX;
    this.y = minY;
    this.width = maxX - minX;
    this.height = maxY - minY;

    this.#boxes = currentBoxes.map(({ x, y, width, height }) => ({
      x: (x - minX) / this.width,
      y: (y - minY) / this.height,
      width: width / this.width,
      height: height / this.height,
    }));
  }

  #getPDFRectForBox({ x, y, width, height }) {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const boxX = this.x + x * this.width;
    const boxY = this.y + y * this.height;
    const boxWidth = width * this.width;
    const boxHeight = height * this.height;
    const old = {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };

    this.x = boxX;
    this.y = boxY;
    this.width = boxWidth;
    this.height = boxHeight;
    const rect = this.getRect(0, 0);
    this.x = old.x;
    this.y = old.y;
    this.width = old.width;
    this.height = old.height;

    return rect.map((value, i) => {
      if (i % 2 === 0) {
        return MathClamp(value, pageX, pageX + pageWidth);
      }
      return MathClamp(value, pageY, pageY + pageHeight);
    });
  }

  #getRedactionRects() {
    if (!this.#boxes) {
      return [this.getPDFRect()];
    }
    return this.#boxes.map(box => this.#getPDFRectForBox(box));
  }

  #renderBoxes() {
    if (!this.div) {
      return;
    }
    const boxes = this.#boxes || [{ x: 0, y: 0, width: 1, height: 1 }];
    for (const box of boxes) {
      const element = document.createElement("div");
      element.className = "redactionEditorBox";
      element.style.left = `${(100 * box.x).toFixed(2)}%`;
      element.style.top = `${(100 * box.y).toFixed(2)}%`;
      element.style.width = `${(100 * box.width).toFixed(2)}%`;
      element.style.height = `${(100 * box.height).toFixed(2)}%`;
      this.div.append(element);
    }
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
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
    this.#renderBoxes();
    this.setDims();

    return this.div;
  }

  /** @inheritdoc */
  onceAdded(focus) {
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
      this._uiManager.a11yAlert(AnnotationEditor._l10nAlert[this.editorType]);
    }
    this._isDraggable = true;
    if (this._initialOptions?.isCentered) {
      this.center();
    }
    this._initialOptions = null;
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.deleted) {
      return this.serializeDeleted();
    }

    const serialized = Object.assign(super.serialize(isForCopying), {
      color: [0, 0, 0],
      redactionRects: this.#getRedactionRects(),
    });
    if (isForCopying) {
      serialized.isCopy = true;
    }
    return serialized;
  }
}

export { RedactionEditor };
