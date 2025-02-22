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

import { AnnotationEditorType, AnnotationPrefix } from "../../shared/util.js";
import {
  OutputScale,
  PixelsPerInch,
  SupportedImageMimeTypes,
} from "../display_utils.js";
import { AnnotationEditor } from "./editor.js";
import { StampAnnotationElement } from "../annotation_layer.js";

/**
 * Basic text editor in order to create a FreeTex annotation.
 */
class StampEditor extends AnnotationEditor {
  #bitmap = null;

  #bitmapId = null;

  #bitmapPromise = null;

  #bitmapUrl = null;

  #bitmapFile = null;

  #bitmapFileName = "";

  #canvas = null;

  #missingCanvas = false;

  #resizeTimeoutId = null;

  #isSvg = false;

  #hasBeenAddedInUndoStack = false;

  static _type = "stamp";

  static _editorType = AnnotationEditorType.STAMP;

  constructor(params) {
    super({ ...params, name: "stampEditor" });
    this.#bitmapUrl = params.bitmapUrl;
    this.#bitmapFile = params.bitmapFile;
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
  }

  /** @inheritdoc */
  static isHandlingMimeForPasting(mime) {
    return SupportedImageMimeTypes.includes(mime);
  }

  /** @inheritdoc */
  static paste(item, parent) {
    parent.pasteEditor(AnnotationEditorType.STAMP, {
      bitmapFile: item.getAsFile(),
    });
  }

  /** @inheritdoc */
  altTextFinish() {
    if (this._uiManager.useNewAltTextFlow) {
      this.div.hidden = false;
    }
    super.altTextFinish();
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "stamp",
      hasAltText: !!this.altTextData?.altText,
    };
  }

  static computeTelemetryFinalData(data) {
    const hasAltTextStats = data.get("hasAltText");
    return {
      hasAltText: hasAltTextStats.get(true) ?? 0,
      hasNoAltText: hasAltTextStats.get(false) ?? 0,
    };
  }

  #getBitmapFetched(data, fromId = false) {
    if (!data) {
      this.remove();
      return;
    }
    this.#bitmap = data.bitmap;
    if (!fromId) {
      this.#bitmapId = data.id;
      this.#isSvg = data.isSvg;
    }
    if (data.file) {
      this.#bitmapFileName = data.file.name;
    }
    this.#createCanvas();
  }

  #getBitmapDone() {
    this.#bitmapPromise = null;
    this._uiManager.enableWaiting(false);
    if (!this.#canvas) {
      return;
    }
    if (
      this._uiManager.useNewAltTextWhenAddingImage &&
      this._uiManager.useNewAltTextFlow &&
      this.#bitmap
    ) {
      this._editToolbar.hide();
      this._uiManager.editAltText(this, /* firstTime = */ true);
      return;
    }

    if (
      !this._uiManager.useNewAltTextWhenAddingImage &&
      this._uiManager.useNewAltTextFlow &&
      this.#bitmap
    ) {
      this._reportTelemetry({
        action: "pdfjs.image.image_added",
        data: { alt_text_modal: false, alt_text_type: "empty" },
      });
      try {
        // The alt-text dialog isn't opened but we still want to guess the alt
        // text.
        this.mlGuessAltText();
      } catch {}
    }

    this.div.focus();
  }

  async mlGuessAltText(imageData = null, updateAltTextData = true) {
    if (this.hasAltTextData()) {
      return null;
    }

    const { mlManager } = this._uiManager;
    if (!mlManager) {
      throw new Error("No ML.");
    }
    if (!(await mlManager.isEnabledFor("altText"))) {
      throw new Error("ML isn't enabled for alt text.");
    }
    const { data, width, height } =
      imageData ||
      this.copyCanvas(null, null, /* createImageData = */ true).imageData;
    const response = await mlManager.guess({
      name: "altText",
      request: {
        data,
        width,
        height,
        channels: data.length / (width * height),
      },
    });
    if (!response) {
      throw new Error("No response from the AI service.");
    }
    if (response.error) {
      throw new Error("Error from the AI service.");
    }
    if (response.cancel) {
      return null;
    }
    if (!response.output) {
      throw new Error("No valid response from the AI service.");
    }
    const altText = response.output;
    await this.setGuessedAltText(altText);
    if (updateAltTextData && !this.hasAltTextData()) {
      this.altTextData = { alt: altText, decorative: false };
    }
    return altText;
  }

  #getBitmap() {
    if (this.#bitmapId) {
      this._uiManager.enableWaiting(true);
      this._uiManager.imageManager
        .getFromId(this.#bitmapId)
        .then(data => this.#getBitmapFetched(data, /* fromId = */ true))
        .finally(() => this.#getBitmapDone());
      return;
    }

    if (this.#bitmapUrl) {
      const url = this.#bitmapUrl;
      this.#bitmapUrl = null;
      this._uiManager.enableWaiting(true);
      this.#bitmapPromise = this._uiManager.imageManager
        .getFromUrl(url)
        .then(data => this.#getBitmapFetched(data))
        .finally(() => this.#getBitmapDone());
      return;
    }

    if (this.#bitmapFile) {
      const file = this.#bitmapFile;
      this.#bitmapFile = null;
      this._uiManager.enableWaiting(true);
      this.#bitmapPromise = this._uiManager.imageManager
        .getFromFile(file)
        .then(data => this.#getBitmapFetched(data))
        .finally(() => this.#getBitmapDone());
      return;
    }

    const input = document.createElement("input");
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      input.hidden = true;
      input.id = "stampEditorFileInput";
      document.body.append(input);
    }
    input.type = "file";
    input.accept = SupportedImageMimeTypes.join(",");
    const signal = this._uiManager._signal;
    this.#bitmapPromise = new Promise(resolve => {
      input.addEventListener(
        "change",
        async () => {
          if (!input.files || input.files.length === 0) {
            this.remove();
          } else {
            this._uiManager.enableWaiting(true);
            const data = await this._uiManager.imageManager.getFromFile(
              input.files[0]
            );
            this._reportTelemetry({
              action: "pdfjs.image.image_selected",
              data: { alt_text_modal: this._uiManager.useNewAltTextFlow },
            });
            this.#getBitmapFetched(data);
          }
          if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
            input.remove();
          }
          resolve();
        },
        { signal }
      );
      input.addEventListener(
        "cancel",
        () => {
          this.remove();
          resolve();
        },
        { signal }
      );
    }).finally(() => this.#getBitmapDone());
    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("TESTING")) {
      input.click();
    }
  }

  /** @inheritdoc */
  remove() {
    if (this.#bitmapId) {
      this.#bitmap = null;
      this._uiManager.imageManager.deleteId(this.#bitmapId);
      this.#canvas?.remove();
      this.#canvas = null;
      if (this.#resizeTimeoutId) {
        clearTimeout(this.#resizeTimeoutId);
        this.#resizeTimeoutId = null;
      }
    }
    super.remove();
  }

  /** @inheritdoc */
  rebuild() {
    if (!this.parent) {
      // It's possible to have to rebuild an editor which is not on a visible
      // page.
      if (this.#bitmapId) {
        this.#getBitmap();
      }
      return;
    }
    super.rebuild();
    if (this.div === null) {
      return;
    }

    if (this.#bitmapId && this.#canvas === null) {
      this.#getBitmap();
    }

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  /** @inheritdoc */
  onceAdded(focus) {
    this._isDraggable = true;
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  isEmpty() {
    return !(
      this.#bitmapPromise ||
      this.#bitmap ||
      this.#bitmapUrl ||
      this.#bitmapFile ||
      this.#bitmapId ||
      this.#missingCanvas
    );
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

    let baseX, baseY;
    if (this._isCopy) {
      baseX = this.x;
      baseY = this.y;
    }

    super.render();
    this.div.hidden = true;
    this.div.setAttribute("role", "figure");

    this.addAltTextButton();

    if (!this.#missingCanvas) {
      if (this.#bitmap) {
        this.#createCanvas();
      } else {
        this.#getBitmap();
      }
    }

    if (this._isCopy) {
      this._moveAfterPaste(baseX, baseY);
    }

    this._uiManager.addShouldRescale(this);

    return this.div;
  }

  setCanvas(annotationElementId, canvas) {
    const { id: bitmapId, bitmap } = this._uiManager.imageManager.getFromCanvas(
      annotationElementId,
      canvas
    );
    canvas.remove();
    if (bitmapId && this._uiManager.imageManager.isValidId(bitmapId)) {
      this.#bitmapId = bitmapId;
      if (bitmap) {
        this.#bitmap = bitmap;
      }
      this.#missingCanvas = false;
      this.#createCanvas();
    }
  }

  /** @inheritdoc */
  _onResized() {
    // We used a CSS-zoom during the resizing, but now it's resized we can
    // rescale correctly the bitmap to fit the new dimensions.
    this.onScaleChanging();
  }

  onScaleChanging() {
    if (!this.parent) {
      return;
    }
    if (this.#resizeTimeoutId !== null) {
      clearTimeout(this.#resizeTimeoutId);
    }
    // The user's zooming the page, there is no need to redraw the bitmap at
    // each step, hence we wait a bit before redrawing it.
    const TIME_TO_WAIT = 200;
    this.#resizeTimeoutId = setTimeout(() => {
      this.#resizeTimeoutId = null;
      this.#drawBitmap();
    }, TIME_TO_WAIT);
  }

  #createCanvas() {
    const { div } = this;
    let { width, height } = this.#bitmap;
    const [pageWidth, pageHeight] = this.pageDimensions;
    const MAX_RATIO = 0.75;
    if (this.width) {
      width = this.width * pageWidth;
      height = this.height * pageHeight;
    } else if (
      width > MAX_RATIO * pageWidth ||
      height > MAX_RATIO * pageHeight
    ) {
      // If the the image is too big compared to the page dimensions
      // (more than MAX_RATIO) then we scale it down.
      const factor = Math.min(
        (MAX_RATIO * pageWidth) / width,
        (MAX_RATIO * pageHeight) / height
      );
      width *= factor;
      height *= factor;
    }
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(
      (width * parentWidth) / pageWidth,
      (height * parentHeight) / pageHeight
    );

    this._uiManager.enableWaiting(false);
    const canvas = (this.#canvas = document.createElement("canvas"));
    canvas.setAttribute("role", "img");
    this.addContainer(canvas);

    this.width = width / pageWidth;
    this.height = height / pageHeight;
    if (this._initialOptions?.isCentered) {
      this.center();
    } else {
      this.fixAndSetPosition();
    }
    this._initialOptions = null;

    if (
      !this._uiManager.useNewAltTextWhenAddingImage ||
      !this._uiManager.useNewAltTextFlow ||
      this.annotationElementId
    ) {
      div.hidden = false;
    }
    this.#drawBitmap();
    if (!this.#hasBeenAddedInUndoStack) {
      this.parent.addUndoableEditor(this);
      this.#hasBeenAddedInUndoStack = true;
    }

    // There are multiple ways to add an image to the page, so here we just
    // count the number of times an image is added to the page whatever the way
    // is.
    this._reportTelemetry({
      action: "inserted_image",
    });
    if (this.#bitmapFileName) {
      canvas.setAttribute("aria-label", this.#bitmapFileName);
    }
  }

  copyCanvas(maxDataDimension, maxPreviewDimension, createImageData = false) {
    if (!maxDataDimension) {
      // TODO: get this value from Firefox
      //   (https://bugzilla.mozilla.org/show_bug.cgi?id=1908184)
      // It's the maximum dimension that the AI can handle.
      maxDataDimension = 224;
    }

    const { width: bitmapWidth, height: bitmapHeight } = this.#bitmap;
    const outputScale = new OutputScale();

    let bitmap = this.#bitmap;
    let width = bitmapWidth,
      height = bitmapHeight;
    let canvas = null;

    if (maxPreviewDimension) {
      if (
        bitmapWidth > maxPreviewDimension ||
        bitmapHeight > maxPreviewDimension
      ) {
        const ratio = Math.min(
          maxPreviewDimension / bitmapWidth,
          maxPreviewDimension / bitmapHeight
        );
        width = Math.floor(bitmapWidth * ratio);
        height = Math.floor(bitmapHeight * ratio);
      }

      canvas = document.createElement("canvas");
      const scaledWidth = (canvas.width = Math.ceil(width * outputScale.sx));
      const scaledHeight = (canvas.height = Math.ceil(height * outputScale.sy));

      if (!this.#isSvg) {
        bitmap = this.#scaleBitmap(scaledWidth, scaledHeight);
      }

      const ctx = canvas.getContext("2d");
      ctx.filter = this._uiManager.hcmFilter;

      // Add a checkerboard pattern as a background in case the image has some
      // transparency.
      let white = "white",
        black = "#cfcfd8";
      if (this._uiManager.hcmFilter !== "none") {
        black = "black";
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        white = "#8f8f9d";
        black = "#42414d";
      }
      const boxDim = 15;
      const boxDimWidth = boxDim * outputScale.sx;
      const boxDimHeight = boxDim * outputScale.sy;
      const pattern = new OffscreenCanvas(boxDimWidth * 2, boxDimHeight * 2);
      const patternCtx = pattern.getContext("2d");
      patternCtx.fillStyle = white;
      patternCtx.fillRect(0, 0, boxDimWidth * 2, boxDimHeight * 2);
      patternCtx.fillStyle = black;
      patternCtx.fillRect(0, 0, boxDimWidth, boxDimHeight);
      patternCtx.fillRect(boxDimWidth, boxDimHeight, boxDimWidth, boxDimHeight);
      ctx.fillStyle = ctx.createPattern(pattern, "repeat");
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      ctx.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        bitmap.height,
        0,
        0,
        scaledWidth,
        scaledHeight
      );
    }

    let imageData = null;
    if (createImageData) {
      let dataWidth, dataHeight;
      if (
        outputScale.symmetric &&
        bitmap.width < maxDataDimension &&
        bitmap.height < maxDataDimension
      ) {
        dataWidth = bitmap.width;
        dataHeight = bitmap.height;
      } else {
        bitmap = this.#bitmap;
        if (bitmapWidth > maxDataDimension || bitmapHeight > maxDataDimension) {
          const ratio = Math.min(
            maxDataDimension / bitmapWidth,
            maxDataDimension / bitmapHeight
          );
          dataWidth = Math.floor(bitmapWidth * ratio);
          dataHeight = Math.floor(bitmapHeight * ratio);

          if (!this.#isSvg) {
            bitmap = this.#scaleBitmap(dataWidth, dataHeight);
          }
        }
      }

      const offscreen = new OffscreenCanvas(dataWidth, dataHeight);
      const offscreenCtx = offscreen.getContext("2d", {
        willReadFrequently: true,
      });
      offscreenCtx.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        bitmap.height,
        0,
        0,
        dataWidth,
        dataHeight
      );
      imageData = {
        width: dataWidth,
        height: dataHeight,
        data: offscreenCtx.getImageData(0, 0, dataWidth, dataHeight).data,
      };
    }

    return { canvas, width, height, imageData };
  }

  #scaleBitmap(width, height) {
    const { width: bitmapWidth, height: bitmapHeight } = this.#bitmap;

    let newWidth = bitmapWidth;
    let newHeight = bitmapHeight;
    let bitmap = this.#bitmap;
    while (newWidth > 2 * width || newHeight > 2 * height) {
      const prevWidth = newWidth;
      const prevHeight = newHeight;

      if (newWidth > 2 * width) {
        // See bug 1820511 (Windows specific bug).
        // TODO: once the above bug is fixed we could revert to:
        // newWidth = Math.ceil(newWidth / 2);
        newWidth =
          newWidth >= 16384
            ? Math.floor(newWidth / 2) - 1
            : Math.ceil(newWidth / 2);
      }
      if (newHeight > 2 * height) {
        newHeight =
          newHeight >= 16384
            ? Math.floor(newHeight / 2) - 1
            : Math.ceil(newHeight / 2);
      }

      const offscreen = new OffscreenCanvas(newWidth, newHeight);
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(
        bitmap,
        0,
        0,
        prevWidth,
        prevHeight,
        0,
        0,
        newWidth,
        newHeight
      );
      bitmap = offscreen.transferToImageBitmap();
    }

    return bitmap;
  }

  #drawBitmap() {
    const [parentWidth, parentHeight] = this.parentDimensions;
    const { width, height } = this;
    const outputScale = new OutputScale();
    const scaledWidth = Math.ceil(width * parentWidth * outputScale.sx);
    const scaledHeight = Math.ceil(height * parentHeight * outputScale.sy);
    const canvas = this.#canvas;

    if (
      !canvas ||
      (canvas.width === scaledWidth && canvas.height === scaledHeight)
    ) {
      return;
    }

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    const bitmap = this.#isSvg
      ? this.#bitmap
      : this.#scaleBitmap(scaledWidth, scaledHeight);

    const ctx = canvas.getContext("2d");
    ctx.filter = this._uiManager.hcmFilter;
    ctx.drawImage(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      0,
      0,
      scaledWidth,
      scaledHeight
    );
  }

  /** @inheritdoc */
  getImageForAltText() {
    return this.#canvas;
  }

  #serializeBitmap(toUrl) {
    if (toUrl) {
      if (this.#isSvg) {
        const url = this._uiManager.imageManager.getSvgUrl(this.#bitmapId);
        if (url) {
          return url;
        }
      }
      // We convert to a data url because it's sync and the url can live in the
      // clipboard.
      const canvas = document.createElement("canvas");
      ({ width: canvas.width, height: canvas.height } = this.#bitmap);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(this.#bitmap, 0, 0);

      return canvas.toDataURL();
    }

    if (this.#isSvg) {
      const [pageWidth, pageHeight] = this.pageDimensions;
      // Multiply by PixelsPerInch.PDF_TO_CSS_UNITS in order to increase the
      // image resolution when rasterizing it.
      const width = Math.round(
        this.width * pageWidth * PixelsPerInch.PDF_TO_CSS_UNITS
      );
      const height = Math.round(
        this.height * pageHeight * PixelsPerInch.PDF_TO_CSS_UNITS
      );
      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(
        this.#bitmap,
        0,
        0,
        this.#bitmap.width,
        this.#bitmap.height,
        0,
        0,
        width,
        height
      );
      return offscreen.transferToImageBitmap();
    }

    return structuredClone(this.#bitmap);
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    let missingCanvas = false;
    if (data instanceof StampAnnotationElement) {
      const {
        data: { rect, rotation, id, structParent, popupRef },
        container,
        parent: {
          page: { pageNumber },
        },
        canvas,
      } = data;
      let bitmapId, bitmap;
      if (canvas) {
        delete data.canvas;
        ({ id: bitmapId, bitmap } = uiManager.imageManager.getFromCanvas(
          container.id,
          canvas
        ));
        canvas.remove();
      } else {
        missingCanvas = true;
        data._hasNoCanvas = true;
      }

      // When switching to edit mode, we wait for the structure tree to be
      // ready (see pdf_viewer.js), so it's fine to use getAriaAttributesSync.
      const altText =
        (
          await parent._structTree.getAriaAttributes(`${AnnotationPrefix}${id}`)
        )?.get("aria-label") || "";

      initialData = data = {
        annotationType: AnnotationEditorType.STAMP,
        bitmapId,
        bitmap,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        id,
        deleted: false,
        accessibilityData: {
          decorative: false,
          altText,
        },
        isSvg: false,
        structParent,
        popupRef,
      };
    }
    const editor = await super.deserialize(data, parent, uiManager);
    const { rect, bitmap, bitmapUrl, bitmapId, isSvg, accessibilityData } =
      data;
    if (missingCanvas) {
      uiManager.addMissingCanvas(data.id, editor);
      editor.#missingCanvas = true;
    } else if (bitmapId && uiManager.imageManager.isValidId(bitmapId)) {
      editor.#bitmapId = bitmapId;
      if (bitmap) {
        editor.#bitmap = bitmap;
      }
    } else {
      editor.#bitmapUrl = bitmapUrl;
    }
    editor.#isSvg = isSvg;

    const [parentWidth, parentHeight] = editor.pageDimensions;
    editor.width = (rect[2] - rect[0]) / parentWidth;
    editor.height = (rect[3] - rect[1]) / parentHeight;

    editor.annotationElementId = data.id || null;
    if (accessibilityData) {
      editor.altTextData = accessibilityData;
    }
    editor._initialData = initialData;
    // No need to be add in the undo stack if the editor is created from an
    // existing one.
    editor.#hasBeenAddedInUndoStack = !!initialData;

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false, context = null) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const serialized = {
      annotationType: AnnotationEditorType.STAMP,
      bitmapId: this.#bitmapId,
      pageIndex: this.pageIndex,
      rect: this.getRect(0, 0),
      rotation: this.rotation,
      isSvg: this.#isSvg,
      structTreeParentId: this._structTreeParentId,
    };

    if (isForCopying) {
      // We don't know what's the final destination (this pdf or another one)
      // of this annotation and the clipboard doesn't support ImageBitmaps,
      // hence we serialize the bitmap to a data url.
      serialized.bitmapUrl = this.#serializeBitmap(/* toUrl = */ true);
      serialized.accessibilityData = this.serializeAltText(true);
      serialized.isCopy = true;
      return serialized;
    }

    const { decorative, altText } = this.serializeAltText(false);
    if (!decorative && altText) {
      serialized.accessibilityData = { type: "Figure", alt: altText };
    }
    if (this.annotationElementId) {
      const changes = this.#hasElementChanged(serialized);
      if (changes.isSame) {
        // Nothing has been changed.
        return null;
      }
      if (changes.isSameAltText) {
        delete serialized.accessibilityData;
      } else {
        serialized.accessibilityData.structParent =
          this._initialData.structParent ?? -1;
      }
    }
    serialized.id = this.annotationElementId;

    if (context === null) {
      return serialized;
    }

    context.stamps ||= new Map();
    const area = this.#isSvg
      ? (serialized.rect[2] - serialized.rect[0]) *
        (serialized.rect[3] - serialized.rect[1])
      : null;
    if (!context.stamps.has(this.#bitmapId)) {
      // We don't want to have multiple copies of the same bitmap in the
      // annotationMap, hence we only add the bitmap the first time we meet it.
      context.stamps.set(this.#bitmapId, { area, serialized });
      serialized.bitmap = this.#serializeBitmap(/* toUrl = */ false);
    } else if (this.#isSvg) {
      // If we have multiple copies of the same svg but with different sizes,
      // then we want to keep the biggest one.
      const prevData = context.stamps.get(this.#bitmapId);
      if (area > prevData.area) {
        prevData.area = area;
        prevData.serialized.bitmap.close();
        prevData.serialized.bitmap = this.#serializeBitmap(/* toUrl = */ false);
      }
    }
    return serialized;
  }

  #hasElementChanged(serialized) {
    const {
      pageIndex,
      accessibilityData: { altText },
    } = this._initialData;

    const isSamePageIndex = serialized.pageIndex === pageIndex;
    const isSameAltText = (serialized.accessibilityData?.alt || "") === altText;

    return {
      isSame:
        !this._hasBeenMoved &&
        !this._hasBeenResized &&
        isSamePageIndex &&
        isSameAltText,
      isSameAltText,
    };
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    annotation.updateEdited({
      rect: this.getRect(0, 0),
    });

    return null;
  }
}

export { StampEditor };
