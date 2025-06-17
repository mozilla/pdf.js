/* Copyright 2012 Mozilla Foundation
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

// eslint-disable-next-line max-len
/** @typedef {import("../src/display/optional_content_config").OptionalContentConfig} OptionalContentConfig */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */
/** @typedef {import("./interfaces").IRenderableView} IRenderableView */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_rendering_queue").PDFRenderingQueue} PDFRenderingQueue */

import { OutputScale, RenderingCancelledException } from "pdfjs-lib";
import { AppOptions } from "./app_options.js";
import { RenderingStates } from "./ui_utils.js";

const DRAW_UPSCALE_FACTOR = 2; // See comment in `PDFThumbnailView.draw` below.
const MAX_NUM_SCALING_STEPS = 3;
const THUMBNAIL_WIDTH = 98; // px

function zeroCanvas(c) {
  // Zeroing the width and height causes Firefox to release graphics
  // resources immediately, which can greatly reduce memory consumption.
  c.width = 0;
  c.height = 0;
}

/**
 * @typedef {Object} PDFThumbnailViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} id - The thumbnail's unique ID (normally its number).
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that is resolved with an {@link OptionalContentConfig} instance.
 *   The default value is `null`.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use `-1` for no limit, or `0` for
 *   CSS-only zooming. The default value is 4096 * 8192 (32 mega-pixels).
 * @property {number} [maxCanvasDim] - The maximum supported canvas dimension,
 *   in either width or height. Use `-1` for no limit.
 *   The default value is 32767.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 */

class TempImageFactory {
  static #tempCanvas = null;

  static getCanvas(width, height) {
    const tempCanvas = (this.#tempCanvas ||= document.createElement("canvas"));
    tempCanvas.width = width;
    tempCanvas.height = height;

    // Since this is a temporary canvas, we need to fill it with a white
    // background ourselves. `#getPageDrawContext` uses CSS rules for this.
    const ctx = tempCanvas.getContext("2d", { alpha: false });
    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return [tempCanvas, tempCanvas.getContext("2d")];
  }

  static destroyCanvas() {
    if (this.#tempCanvas) {
      zeroCanvas(this.#tempCanvas);
    }
    this.#tempCanvas = null;
  }
}

/**
 * @implements {IRenderableView}
 */
class PDFThumbnailView {
  /**
   * @param {PDFThumbnailViewOptions} options
   */
  constructor({
    container,
    eventBus,
    id,
    defaultViewport,
    optionalContentConfigPromise,
    linkService,
    renderingQueue,
    maxCanvasPixels,
    maxCanvasDim,
    pageColors,
  }) {
    this.id = id;
    this.renderingId = "thumbnail" + id;
    this.pageLabel = null;

    this.pdfPage = null;
    this.rotation = 0;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this._optionalContentConfigPromise = optionalContentConfigPromise || null;
    this.maxCanvasPixels = maxCanvasPixels ?? AppOptions.get("maxCanvasPixels");
    this.maxCanvasDim = maxCanvasDim || AppOptions.get("maxCanvasDim");
    this.pageColors = pageColors || null;

    this.eventBus = eventBus;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;

    this.renderTask = null;
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;

    const anchor = document.createElement("a");
    anchor.href = linkService.getAnchorUrl("#page=" + id);
    anchor.setAttribute("data-l10n-id", "pdfjs-thumb-page-title");
    anchor.setAttribute("data-l10n-args", this.#pageL10nArgs);
    anchor.onclick = function () {
      linkService.goToPage(id);
      return false;
    };
    this.anchor = anchor;

    const div = document.createElement("div");
    div.className = "thumbnail";
    div.setAttribute("data-page-number", this.id);
    this.div = div;
    this.#updateDims();

    const img = document.createElement("div");
    img.className = "thumbnailImage";
    this._placeholderImg = img;

    div.append(img);
    anchor.append(div);
    container.append(anchor);
  }

  #updateDims() {
    const { width, height } = this.viewport;
    const ratio = width / height;

    this.canvasWidth = THUMBNAIL_WIDTH;
    this.canvasHeight = (this.canvasWidth / ratio) | 0;
    this.scale = this.canvasWidth / width;

    const { style } = this.div;
    style.setProperty("--thumbnail-width", `${this.canvasWidth}px`);
    style.setProperty("--thumbnail-height", `${this.canvasHeight}px`);
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({ scale: 1, rotation: totalRotation });
    this.reset();
  }

  reset() {
    this.cancelRendering();
    this.renderingState = RenderingStates.INITIAL;

    this.div.removeAttribute("data-loaded");
    this.image?.replaceWith(this._placeholderImg);
    this.#updateDims();

    if (this.image) {
      this.image.removeAttribute("src");
      delete this.image;
    }
  }

  update({ rotation = null }) {
    if (typeof rotation === "number") {
      this.rotation = rotation; // The rotation may be zero.
    }
    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: 1,
      rotation: totalRotation,
    });
    this.reset();
  }

  /**
   * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
   *              rather than calling this one directly.
   */
  cancelRendering() {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
    this.resume = null;
  }

  #getPageDrawContext(upscaleFactor = 1) {
    // Keep the no-thumbnail outline visible, i.e. `data-loaded === false`,
    // until rendering/image conversion is complete, to avoid display issues.
    const canvas = document.createElement("canvas");
    const outputScale = new OutputScale();
    const width = upscaleFactor * this.canvasWidth,
      height = upscaleFactor * this.canvasHeight;

    outputScale.limitCanvas(
      width,
      height,
      this.maxCanvasPixels,
      this.maxCanvasDim
    );
    canvas.width = (width * outputScale.sx) | 0;
    canvas.height = (height * outputScale.sy) | 0;

    const transform = outputScale.scaled
      ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
      : null;

    return { canvas, transform };
  }

  #convertCanvasToImage(canvas) {
    if (this.renderingState !== RenderingStates.FINISHED) {
      throw new Error("#convertCanvasToImage: Rendering has not finished.");
    }
    const reducedCanvas = this.#reduceImage(canvas);

    const image = document.createElement("img");
    image.className = "thumbnailImage";
    image.setAttribute("data-l10n-id", "pdfjs-thumb-page-canvas");
    image.setAttribute("data-l10n-args", this.#pageL10nArgs);
    image.src = reducedCanvas.toDataURL();
    this.image = image;

    this.div.setAttribute("data-loaded", true);
    this._placeholderImg.replaceWith(image);

    zeroCanvas(reducedCanvas);
  }

  async draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      return;
    }
    const { pageColors, pdfPage } = this;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      throw new Error("pdfPage is not loaded");
    }

    this.renderingState = RenderingStates.RUNNING;

    // Render the thumbnail at a larger size and downsize the canvas (similar
    // to `setImage`), to improve consistency between thumbnails created by
    // the `draw` and `setImage` methods (fixes issue 8233).
    // NOTE: To primarily avoid increasing memory usage too much, but also to
    //   reduce downsizing overhead, we purposely limit the up-scaling factor.
    const { canvas, transform } = this.#getPageDrawContext(DRAW_UPSCALE_FACTOR);
    const drawViewport = this.viewport.clone({
      scale: DRAW_UPSCALE_FACTOR * this.scale,
    });
    const renderContinueCallback = cont => {
      if (!this.renderingQueue.isHighestPriority(this)) {
        this.renderingState = RenderingStates.PAUSED;
        this.resume = () => {
          this.renderingState = RenderingStates.RUNNING;
          cont();
        };
        return;
      }
      cont();
    };

    const renderContext = {
      canvas,
      transform,
      viewport: drawViewport,
      optionalContentConfigPromise: this._optionalContentConfigPromise,
      pageColors,
    };
    const renderTask = (this.renderTask = pdfPage.render(renderContext));
    renderTask.onContinue = renderContinueCallback;

    let error = null;
    try {
      await renderTask.promise;
    } catch (e) {
      if (e instanceof RenderingCancelledException) {
        zeroCanvas(canvas);
        return;
      }
      error = e;
    } finally {
      // The renderTask may have been replaced by a new one, so only remove
      // the reference to the renderTask if it matches the one that is
      // triggering this callback.
      if (renderTask === this.renderTask) {
        this.renderTask = null;
      }
    }
    this.renderingState = RenderingStates.FINISHED;

    this.#convertCanvasToImage(canvas);
    zeroCanvas(canvas);

    this.eventBus.dispatch("thumbnailrendered", {
      source: this,
      pageNumber: this.id,
      pdfPage,
    });

    if (error) {
      throw error;
    }
  }

  setImage(pageView) {
    if (this.renderingState !== RenderingStates.INITIAL) {
      return;
    }
    const { thumbnailCanvas: canvas, pdfPage, scale } = pageView;
    if (!canvas) {
      return;
    }
    if (!this.pdfPage) {
      this.setPdfPage(pdfPage);
    }
    if (scale < this.scale) {
      // Avoid upscaling the image, since that makes the thumbnail look blurry.
      return;
    }
    this.renderingState = RenderingStates.FINISHED;
    this.#convertCanvasToImage(canvas);
  }

  #getReducedImageDims(canvas) {
    const width = canvas.width << MAX_NUM_SCALING_STEPS,
      height = canvas.height << MAX_NUM_SCALING_STEPS;

    const outputScale = new OutputScale();
    // Here we're not actually "rendering" to the canvas and the `OutputScale`
    // is thus only used to limit the canvas size, hence the identity scale.
    outputScale.sx = outputScale.sy = 1;

    outputScale.limitCanvas(
      width,
      height,
      this.maxCanvasPixels,
      this.maxCanvasDim
    );
    return [(width * outputScale.sx) | 0, (height * outputScale.sy) | 0];
  }

  #reduceImage(img) {
    const { canvas } = this.#getPageDrawContext(1);
    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    if (img.width <= 2 * canvas.width) {
      ctx.drawImage(
        img,
        0,
        0,
        img.width,
        img.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      return canvas;
    }
    // drawImage does an awful job of rescaling the image, doing it gradually.
    let [reducedWidth, reducedHeight] = this.#getReducedImageDims(canvas);
    const [reducedImage, reducedImageCtx] = TempImageFactory.getCanvas(
      reducedWidth,
      reducedHeight
    );

    while (reducedWidth > img.width || reducedHeight > img.height) {
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }
    reducedImageCtx.drawImage(
      img,
      0,
      0,
      img.width,
      img.height,
      0,
      0,
      reducedWidth,
      reducedHeight
    );
    while (reducedWidth > 2 * canvas.width) {
      reducedImageCtx.drawImage(
        reducedImage,
        0,
        0,
        reducedWidth,
        reducedHeight,
        0,
        0,
        reducedWidth >> 1,
        reducedHeight >> 1
      );
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }
    ctx.drawImage(
      reducedImage,
      0,
      0,
      reducedWidth,
      reducedHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas;
  }

  get #pageL10nArgs() {
    return JSON.stringify({ page: this.pageLabel ?? this.id });
  }

  /**
   * @param {string|null} label
   */
  setPageLabel(label) {
    this.pageLabel = typeof label === "string" ? label : null;

    this.anchor.setAttribute("data-l10n-args", this.#pageL10nArgs);

    if (this.renderingState !== RenderingStates.FINISHED) {
      return;
    }
    this.image?.setAttribute("data-l10n-args", this.#pageL10nArgs);
  }
}

export { PDFThumbnailView, TempImageFactory };
