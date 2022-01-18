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
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/optional_content_config").OptionalContentConfig} OptionalContentConfig */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./interfaces").IL10n} IL10n */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFAnnotationLayerFactory} IPDFAnnotationLayerFactory */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFAnnotationEditorLayerFactory} IPDFAnnotationEditorLayerFactory */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFStructTreeLayerFactory} IPDFStructTreeLayerFactory */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFTextLayerFactory} IPDFTextLayerFactory */
/** @typedef {import("./interfaces").IPDFXfaLayerFactory} IPDFXfaLayerFactory */
/** @typedef {import("./interfaces").IRenderableView} IRenderableView */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_rendering_queue").PDFRenderingQueue} PDFRenderingQueue */

import {
  AnnotationMode,
  createPromiseCapability,
  PixelsPerInch,
  RenderingCancelledException,
  SVGGraphics,
} from "pdfjs-lib";
import {
  approximateFraction,
  DEFAULT_SCALE,
  docStyle,
  OutputScale,
  RendererType,
  RenderingStates,
  roundToDivide,
  TextLayerMode,
} from "./ui_utils.js";
import { compatibilityParams } from "./app_options.js";
import { NullL10n } from "./l10n_utils.js";
import { TextAccessibilityManager } from "./text_accessibility.js";

/**
 * @typedef {Object} PDFPageViewOptions
 * @property {HTMLDivElement} [container] - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} id - The page unique ID (normally its number).
 * @property {number} [scale] - The page scale display.
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that is resolved with an {@link OptionalContentConfig} instance.
 *   The default value is `null`.
 * @property {PDFRenderingQueue} [renderingQueue] - The rendering queue object.
 * @property {IPDFTextLayerFactory} [textLayerFactory]
 * @property {number} [textLayerMode] - Controls if the text layer used for
 *   selection and searching is created. The constants from {TextLayerMode}
 *   should be used. The default value is `TextLayerMode.ENABLE`.
 * @property {number} [annotationMode] - Controls if the annotation layer is
 *   created, and if interactive form elements or `AnnotationStorage`-data are
 *   being rendered. The constants from {@link AnnotationMode} should be used;
 *   see also {@link RenderParameters} and {@link GetOperatorListParameters}.
 *   The default value is `AnnotationMode.ENABLE_FORMS`.
 * @property {IPDFAnnotationLayerFactory} [annotationLayerFactory]
 * @property {IPDFAnnotationEditorLayerFactory} [annotationEditorLayerFactory]
 * @property {IPDFXfaLayerFactory} [xfaLayerFactory]
 * @property {IPDFStructTreeLayerFactory} [structTreeLayerFactory]
 * @property {Object} [textHighlighterFactory]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} [useOnlyCssZoom] - Enables CSS only zooming. The default
 *   value is `false`.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use -1 for no limit. The default value
 *   is 4096 * 4096 (16 mega-pixels).
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {IL10n} [l10n] - Localization service.
 */

const MAX_CANVAS_PIXELS = compatibilityParams.maxCanvasPixels || 16777216;

/**
 * @implements {IRenderableView}
 */
class PDFPageView {
  #annotationMode = AnnotationMode.ENABLE_FORMS;

  #useThumbnailCanvas = {
    initialOptionalContent: true,
    regularAnnotations: true,
  };

  /**
   * @param {PDFPageViewOptions} options
   */
  constructor(options) {
    const container = options.container;
    const defaultViewport = options.defaultViewport;

    this.id = options.id;
    this.renderingId = "page" + this.id;

    this.pdfPage = null;
    this.pageLabel = null;
    this.rotation = 0;
    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this._optionalContentConfigPromise =
      options.optionalContentConfigPromise || null;
    this.hasRestrictedScaling = false;
    this.textLayerMode = options.textLayerMode ?? TextLayerMode.ENABLE;
    this.#annotationMode =
      options.annotationMode ?? AnnotationMode.ENABLE_FORMS;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.useOnlyCssZoom = options.useOnlyCssZoom || false;
    this.maxCanvasPixels = options.maxCanvasPixels || MAX_CANVAS_PIXELS;
    this.pageColors = options.pageColors || null;

    this.eventBus = options.eventBus;
    this.renderingQueue = options.renderingQueue;
    this.textLayerFactory = options.textLayerFactory;
    this.annotationLayerFactory = options.annotationLayerFactory;
    this.annotationEditorLayerFactory = options.annotationEditorLayerFactory;
    this.xfaLayerFactory = options.xfaLayerFactory;
    this.textHighlighter =
      options.textHighlighterFactory?.createTextHighlighter({
        pageIndex: this.id - 1,
        eventBus: this.eventBus,
      });
    this.structTreeLayerFactory = options.structTreeLayerFactory;
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || GENERIC")
    ) {
      this.renderer = options.renderer || RendererType.CANVAS;
    }
    this.l10n = options.l10n || NullL10n;

    this.paintTask = null;
    this.paintedViewportMap = new WeakMap();
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;
    this._renderError = null;
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || GENERIC")
    ) {
      this._isStandalone = !this.renderingQueue?.hasViewer();
    }

    this._annotationCanvasMap = null;

    this.annotationLayer = null;
    this.annotationEditorLayer = null;
    this.textLayer = null;
    this.zoomLayer = null;
    this.xfaLayer = null;
    this.structTreeLayer = null;

    const div = document.createElement("div");
    div.className = "page";
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";
    div.setAttribute("data-page-number", this.id);
    div.setAttribute("role", "region");
    this.l10n.get("page_landmark", { page: this.id }).then(msg => {
      div.setAttribute("aria-label", msg);
    });
    this.div = div;

    container?.append(div);

    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this._isStandalone
    ) {
      const { optionalContentConfigPromise } = options;
      if (optionalContentConfigPromise) {
        // Ensure that the thumbnails always display the *initial* document
        // state, for documents with optional content.
        optionalContentConfigPromise.then(optionalContentConfig => {
          if (
            optionalContentConfigPromise !== this._optionalContentConfigPromise
          ) {
            return;
          }
          this.#useThumbnailCanvas.initialOptionalContent =
            optionalContentConfig.hasInitialVisibility;
        });
      }
    }
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: this.scale * PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: totalRotation,
    });
    this.reset();
  }

  destroy() {
    this.reset();
    if (this.pdfPage) {
      this.pdfPage.cleanup();
    }
  }

  /**
   * @private
   */
  async _renderAnnotationLayer() {
    let error = null;
    try {
      await this.annotationLayer.render(this.viewport, "display");
    } catch (ex) {
      console.error(`_renderAnnotationLayer: "${ex}".`);
      error = ex;
    } finally {
      this.eventBus.dispatch("annotationlayerrendered", {
        source: this,
        pageNumber: this.id,
        error,
      });
    }
  }

  /**
   * @private
   */
  async _renderAnnotationEditorLayer() {
    let error = null;
    try {
      await this.annotationEditorLayer.render(this.viewport, "display");
    } catch (ex) {
      console.error(`_renderAnnotationEditorLayer: "${ex}".`);
      error = ex;
    } finally {
      this.eventBus.dispatch("annotationeditorlayerrendered", {
        source: this,
        pageNumber: this.id,
        error,
      });
    }
  }

  /**
   * @private
   */
  async _renderXfaLayer() {
    let error = null;
    try {
      const result = await this.xfaLayer.render(this.viewport, "display");
      if (this.textHighlighter) {
        this._buildXfaTextContentItems(result.textDivs);
      }
    } catch (ex) {
      console.error(`_renderXfaLayer: "${ex}".`);
      error = ex;
    } finally {
      this.eventBus.dispatch("xfalayerrendered", {
        source: this,
        pageNumber: this.id,
        error,
      });
    }
  }

  async _buildXfaTextContentItems(textDivs) {
    const text = await this.pdfPage.getTextContent();
    const items = [];
    for (const item of text.items) {
      items.push(item.str);
    }
    this.textHighlighter.setTextMapping(textDivs, items);
    this.textHighlighter.enable();
  }

  /**
   * @private
   */
  _resetZoomLayer(removeFromDOM = false) {
    if (!this.zoomLayer) {
      return;
    }
    const zoomLayerCanvas = this.zoomLayer.firstChild;
    this.paintedViewportMap.delete(zoomLayerCanvas);
    // Zeroing the width and height causes Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    zoomLayerCanvas.width = 0;
    zoomLayerCanvas.height = 0;

    if (removeFromDOM) {
      // Note: `ChildNode.remove` doesn't throw if the parent node is undefined.
      this.zoomLayer.remove();
    }
    this.zoomLayer = null;
  }

  reset({
    keepZoomLayer = false,
    keepAnnotationLayer = false,
    keepAnnotationEditorLayer = false,
    keepXfaLayer = false,
  } = {}) {
    this.cancelRendering({
      keepAnnotationLayer,
      keepAnnotationEditorLayer,
      keepXfaLayer,
    });
    this.renderingState = RenderingStates.INITIAL;

    const div = this.div;
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";

    const childNodes = div.childNodes,
      zoomLayerNode = (keepZoomLayer && this.zoomLayer) || null,
      annotationLayerNode =
        (keepAnnotationLayer && this.annotationLayer?.div) || null,
      annotationEditorLayerNode =
        (keepAnnotationEditorLayer && this.annotationEditorLayer?.div) || null,
      xfaLayerNode = (keepXfaLayer && this.xfaLayer?.div) || null;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      switch (node) {
        case zoomLayerNode:
        case annotationLayerNode:
        case annotationEditorLayerNode:
        case xfaLayerNode:
          continue;
      }
      node.remove();
    }
    div.removeAttribute("data-loaded");

    if (annotationLayerNode) {
      // Hide the annotation layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.annotationLayer.hide();
    }

    if (annotationEditorLayerNode) {
      this.annotationEditorLayer.hide();
    } else {
      this.annotationEditorLayer?.destroy();
    }
    if (xfaLayerNode) {
      // Hide the XFA layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.xfaLayer.hide();
    }

    if (!zoomLayerNode) {
      if (this.canvas) {
        this.paintedViewportMap.delete(this.canvas);
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        this.canvas.width = 0;
        this.canvas.height = 0;
        delete this.canvas;
      }
      this._resetZoomLayer();
    }
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this.svg
    ) {
      this.paintedViewportMap.delete(this.svg);
      delete this.svg;
    }

    this.loadingIconDiv = document.createElement("div");
    this.loadingIconDiv.className = "loadingIcon notVisible";
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this._isStandalone
    ) {
      this.toggleLoadingIconSpinner(/* viewVisible = */ true);
    }
    this.loadingIconDiv.setAttribute("role", "img");
    this.l10n.get("loading").then(msg => {
      this.loadingIconDiv?.setAttribute("aria-label", msg);
    });
    div.append(this.loadingIconDiv);
  }

  update({ scale = 0, rotation = null, optionalContentConfigPromise = null }) {
    this.scale = scale || this.scale;
    if (typeof rotation === "number") {
      this.rotation = rotation; // The rotation may be zero.
    }
    if (optionalContentConfigPromise instanceof Promise) {
      this._optionalContentConfigPromise = optionalContentConfigPromise;

      // Ensure that the thumbnails always display the *initial* document state,
      // for documents with optional content.
      optionalContentConfigPromise.then(optionalContentConfig => {
        if (
          optionalContentConfigPromise !== this._optionalContentConfigPromise
        ) {
          return;
        }
        this.#useThumbnailCanvas.initialOptionalContent =
          optionalContentConfig.hasInitialVisibility;
      });
    }

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: totalRotation,
    });

    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this._isStandalone
    ) {
      docStyle.setProperty("--scale-factor", this.viewport.scale);
    }

    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this.svg
    ) {
      this.cssTransform({
        target: this.svg,
        redrawAnnotationLayer: true,
        redrawAnnotationEditorLayer: true,
        redrawXfaLayer: true,
      });

      this.eventBus.dispatch("pagerendered", {
        source: this,
        pageNumber: this.id,
        cssTransform: true,
        timestamp: performance.now(),
        error: this._renderError,
      });
      return;
    }

    let isScalingRestricted = false;
    if (this.canvas && this.maxCanvasPixels > 0) {
      const outputScale = this.outputScale;
      if (
        ((Math.floor(this.viewport.width) * outputScale.sx) | 0) *
          ((Math.floor(this.viewport.height) * outputScale.sy) | 0) >
        this.maxCanvasPixels
      ) {
        isScalingRestricted = true;
      }
    }

    if (this.canvas) {
      if (
        this.useOnlyCssZoom ||
        (this.hasRestrictedScaling && isScalingRestricted)
      ) {
        this.cssTransform({
          target: this.canvas,
          redrawAnnotationLayer: true,
          redrawAnnotationEditorLayer: true,
          redrawXfaLayer: true,
        });

        this.eventBus.dispatch("pagerendered", {
          source: this,
          pageNumber: this.id,
          cssTransform: true,
          timestamp: performance.now(),
          error: this._renderError,
        });
        return;
      }
      if (!this.zoomLayer && !this.canvas.hidden) {
        this.zoomLayer = this.canvas.parentNode;
        this.zoomLayer.style.position = "absolute";
      }
    }
    if (this.zoomLayer) {
      this.cssTransform({ target: this.zoomLayer.firstChild });
    }
    this.reset({
      keepZoomLayer: true,
      keepAnnotationLayer: true,
      keepAnnotationEditorLayer: true,
      keepXfaLayer: true,
    });
  }

  /**
   * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
   *              rather than calling this one directly.
   */
  cancelRendering({
    keepAnnotationLayer = false,
    keepAnnotationEditorLayer = false,
    keepXfaLayer = false,
  } = {}) {
    if (this.paintTask) {
      this.paintTask.cancel();
      this.paintTask = null;
    }
    this.resume = null;

    if (this.textLayer) {
      this.textLayer.cancel();
      this.textLayer = null;
    }
    if (
      this.annotationLayer &&
      (!keepAnnotationLayer || !this.annotationLayer.div)
    ) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
      this._annotationCanvasMap = null;
    }
    if (
      this.annotationEditorLayer &&
      (!keepAnnotationEditorLayer || !this.annotationEditorLayer.div)
    ) {
      this.annotationEditorLayer.cancel();
      this.annotationEditorLayer = null;
    }
    if (this.xfaLayer && (!keepXfaLayer || !this.xfaLayer.div)) {
      this.xfaLayer.cancel();
      this.xfaLayer = null;
      this.textHighlighter?.disable();
    }
    if (this._onTextLayerRendered) {
      this.eventBus._off("textlayerrendered", this._onTextLayerRendered);
      this._onTextLayerRendered = null;
    }
  }

  cssTransform({
    target,
    redrawAnnotationLayer = false,
    redrawAnnotationEditorLayer = false,
    redrawXfaLayer = false,
  }) {
    // Scale target (canvas or svg), its wrapper and page container.
    const width = this.viewport.width;
    const height = this.viewport.height;
    const div = this.div;
    target.style.width =
      target.parentNode.style.width =
      div.style.width =
        Math.floor(width) + "px";
    target.style.height =
      target.parentNode.style.height =
      div.style.height =
        Math.floor(height) + "px";
    // The canvas may have been originally rotated; rotate relative to that.
    const relativeRotation =
      this.viewport.rotation - this.paintedViewportMap.get(target).rotation;
    const absRotation = Math.abs(relativeRotation);
    let scaleX = 1,
      scaleY = 1;
    if (absRotation === 90 || absRotation === 270) {
      // Scale x and y because of the rotation.
      scaleX = height / width;
      scaleY = width / height;
    }
    target.style.transform = `rotate(${relativeRotation}deg) scale(${scaleX}, ${scaleY})`;

    if (this.textLayer) {
      // Rotating the text layer is more complicated since the divs inside the
      // the text layer are rotated.
      // TODO: This could probably be simplified by drawing the text layer in
      // one orientation and then rotating overall.
      const textLayerViewport = this.textLayer.viewport;
      const textRelativeRotation =
        this.viewport.rotation - textLayerViewport.rotation;
      const textAbsRotation = Math.abs(textRelativeRotation);
      let scale = width / textLayerViewport.width;
      if (textAbsRotation === 90 || textAbsRotation === 270) {
        scale = width / textLayerViewport.height;
      }
      const textLayerDiv = this.textLayer.textLayerDiv;
      let transX, transY;
      switch (textAbsRotation) {
        case 0:
          transX = transY = 0;
          break;
        case 90:
          transX = 0;
          transY = "-" + textLayerDiv.style.height;
          break;
        case 180:
          transX = "-" + textLayerDiv.style.width;
          transY = "-" + textLayerDiv.style.height;
          break;
        case 270:
          transX = "-" + textLayerDiv.style.width;
          transY = 0;
          break;
        default:
          console.error("Bad rotation value.");
          break;
      }

      textLayerDiv.style.transform =
        `rotate(${textAbsRotation}deg) ` +
        `scale(${scale}) ` +
        `translate(${transX}, ${transY})`;
      textLayerDiv.style.transformOrigin = "0% 0%";
    }

    if (redrawAnnotationLayer && this.annotationLayer) {
      this._renderAnnotationLayer();
    }
    if (redrawAnnotationEditorLayer && this.annotationEditorLayer) {
      this._renderAnnotationEditorLayer();
    }
    if (redrawXfaLayer && this.xfaLayer) {
      this._renderXfaLayer();
    }
  }

  get width() {
    return this.viewport.width;
  }

  get height() {
    return this.viewport.height;
  }

  getPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  }

  /**
   * @ignore
   */
  toggleLoadingIconSpinner(viewVisible = false) {
    this.loadingIconDiv?.classList.toggle("notVisible", !viewVisible);
  }

  draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, pdfPage } = this;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        this.loadingIconDiv.remove();
        delete this.loadingIconDiv;
      }
      return Promise.reject(new Error("pdfPage is not loaded"));
    }

    this.renderingState = RenderingStates.RUNNING;

    // Wrap the canvas so that if it has a CSS transform for high DPI the
    // overflow will be hidden in Firefox.
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.width = div.style.width;
    canvasWrapper.style.height = div.style.height;
    canvasWrapper.classList.add("canvasWrapper");

    const lastDivBeforeTextDiv =
      this.annotationLayer?.div || this.annotationEditorLayer?.div;

    if (lastDivBeforeTextDiv) {
      // The annotation layer needs to stay on top.
      lastDivBeforeTextDiv.before(canvasWrapper);
    } else {
      div.append(canvasWrapper);
    }

    let textLayer = null;
    if (this.textLayerMode !== TextLayerMode.DISABLE && this.textLayerFactory) {
      this._accessibilityManager ||= new TextAccessibilityManager();
      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.width = canvasWrapper.style.width;
      textLayerDiv.style.height = canvasWrapper.style.height;
      if (lastDivBeforeTextDiv) {
        // The annotation layer needs to stay on top.
        lastDivBeforeTextDiv.before(textLayerDiv);
      } else {
        div.append(textLayerDiv);
      }

      textLayer = this.textLayerFactory.createTextLayerBuilder({
        textLayerDiv,
        pageIndex: this.id - 1,
        viewport: this.viewport,
        eventBus: this.eventBus,
        highlighter: this.textHighlighter,
        accessibilityManager: this._accessibilityManager,
      });
    }
    this.textLayer = textLayer;

    if (
      this.#annotationMode !== AnnotationMode.DISABLE &&
      this.annotationLayerFactory
    ) {
      this._annotationCanvasMap ||= new Map();
      this.annotationLayer ||=
        this.annotationLayerFactory.createAnnotationLayerBuilder({
          pageDiv: div,
          pdfPage,
          imageResourcesPath: this.imageResourcesPath,
          renderForms: this.#annotationMode === AnnotationMode.ENABLE_FORMS,
          l10n: this.l10n,
          annotationCanvasMap: this._annotationCanvasMap,
          accessibilityManager: this._accessibilityManager,
        });
    }

    if (this.xfaLayer?.div) {
      // The xfa layer needs to stay on top.
      div.append(this.xfaLayer.div);
    }

    let renderContinueCallback = null;
    if (this.renderingQueue) {
      renderContinueCallback = cont => {
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
    }

    const finishPaintTask = async (error = null) => {
      // The paintTask may have been replaced by a new one, so only remove
      // the reference to the paintTask if it matches the one that is
      // triggering this callback.
      if (paintTask === this.paintTask) {
        this.paintTask = null;
      }

      if (error instanceof RenderingCancelledException) {
        this._renderError = null;
        return;
      }
      this._renderError = error;

      this.renderingState = RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        this.loadingIconDiv.remove();
        delete this.loadingIconDiv;
      }
      this._resetZoomLayer(/* removeFromDOM = */ true);

      // Ensure that the thumbnails won't become partially (or fully) blank,
      // for documents that contain interactive form elements.
      this.#useThumbnailCanvas.regularAnnotations = !paintTask.separateAnnots;

      this.eventBus.dispatch("pagerendered", {
        source: this,
        pageNumber: this.id,
        cssTransform: false,
        timestamp: performance.now(),
        error: this._renderError,
      });

      if (error) {
        throw error;
      }
    };

    const paintTask =
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      this.renderer === RendererType.SVG
        ? this.paintOnSvg(canvasWrapper)
        : this.paintOnCanvas(canvasWrapper);
    paintTask.onRenderContinue = renderContinueCallback;
    this.paintTask = paintTask;

    const resultPromise = paintTask.promise.then(
      () => {
        return finishPaintTask(null).then(() => {
          if (textLayer) {
            const readableStream = pdfPage.streamTextContent({
              includeMarkedContent: true,
            });
            textLayer.setTextContentStream(readableStream);
            textLayer.render();
          }

          if (this.annotationLayer) {
            this._renderAnnotationLayer().then(() => {
              if (this.annotationEditorLayerFactory) {
                this.annotationEditorLayer ||=
                  this.annotationEditorLayerFactory.createAnnotationEditorLayerBuilder(
                    {
                      pageDiv: div,
                      pdfPage,
                      l10n: this.l10n,
                      accessibilityManager: this._accessibilityManager,
                    }
                  );
                this._renderAnnotationEditorLayer();
              }
            });
          }
        });
      },
      function (reason) {
        return finishPaintTask(reason);
      }
    );

    if (this.xfaLayerFactory) {
      this.xfaLayer ||= this.xfaLayerFactory.createXfaLayerBuilder({
        pageDiv: div,
        pdfPage,
      });
      this._renderXfaLayer();
    }

    // The structure tree is currently only supported when the text layer is
    // enabled and a canvas is used for rendering.
    if (this.structTreeLayerFactory && this.textLayer && this.canvas) {
      // The structure tree must be generated after the text layer for the
      // aria-owns to work.
      this._onTextLayerRendered = event => {
        if (event.pageNumber !== this.id) {
          return;
        }
        this.eventBus._off("textlayerrendered", this._onTextLayerRendered);
        this._onTextLayerRendered = null;

        if (!this.canvas) {
          return; // The canvas was removed, prevent errors below.
        }
        this.pdfPage.getStructTree().then(tree => {
          if (!tree) {
            return;
          }
          if (!this.canvas) {
            return; // The canvas was removed, prevent errors below.
          }
          const treeDom = this.structTreeLayer.render(tree);
          treeDom.classList.add("structTree");
          this.canvas.append(treeDom);
        });
      };
      this.eventBus._on("textlayerrendered", this._onTextLayerRendered);
      this.structTreeLayer =
        this.structTreeLayerFactory.createStructTreeLayerBuilder({ pdfPage });
    }

    div.setAttribute("data-loaded", true);

    this.eventBus.dispatch("pagerender", {
      source: this,
      pageNumber: this.id,
    });
    return resultPromise;
  }

  paintOnCanvas(canvasWrapper) {
    const renderCapability = createPromiseCapability();
    const result = {
      promise: renderCapability.promise,
      onRenderContinue(cont) {
        cont();
      },
      cancel() {
        renderTask.cancel();
      },
      get separateAnnots() {
        return renderTask.separateAnnots;
      },
    };

    const viewport = this.viewport;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "presentation");

    // Keep the canvas hidden until the first draw callback, or until drawing
    // is complete when `!this.renderingQueue`, to prevent black flickering.
    canvas.hidden = true;
    let isCanvasHidden = true;
    const showCanvas = function () {
      if (isCanvasHidden) {
        canvas.hidden = false;
        isCanvasHidden = false;
      }
    };

    canvasWrapper.append(canvas);
    this.canvas = canvas;

    const ctx = canvas.getContext("2d", { alpha: false });
    const outputScale = (this.outputScale = new OutputScale());

    if (this.useOnlyCssZoom) {
      const actualSizeViewport = viewport.clone({
        scale: PixelsPerInch.PDF_TO_CSS_UNITS,
      });
      // Use a scale that makes the canvas have the originally intended size
      // of the page.
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
    }

    if (this.maxCanvasPixels > 0) {
      const pixelsInViewport = viewport.width * viewport.height;
      const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        this.hasRestrictedScaling = true;
      } else {
        this.hasRestrictedScaling = false;
      }
    }

    const sfx = approximateFraction(outputScale.sx);
    const sfy = approximateFraction(outputScale.sy);
    canvas.width = roundToDivide(viewport.width * outputScale.sx, sfx[0]);
    canvas.height = roundToDivide(viewport.height * outputScale.sy, sfy[0]);
    canvas.style.width = roundToDivide(viewport.width, sfx[1]) + "px";
    canvas.style.height = roundToDivide(viewport.height, sfy[1]) + "px";

    // Add the viewport so it's known what it was originally drawn with.
    this.paintedViewportMap.set(canvas, viewport);

    // Rendering area
    const transform = outputScale.scaled
      ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
      : null;
    const renderContext = {
      canvasContext: ctx,
      transform,
      viewport: this.viewport,
      annotationMode: this.#annotationMode,
      optionalContentConfigPromise: this._optionalContentConfigPromise,
      annotationCanvasMap: this._annotationCanvasMap,
      pageColors: this.pageColors,
    };
    const renderTask = this.pdfPage.render(renderContext);
    renderTask.onContinue = function (cont) {
      showCanvas();
      if (result.onRenderContinue) {
        result.onRenderContinue(cont);
      } else {
        cont();
      }
    };

    renderTask.promise.then(
      function () {
        showCanvas();
        renderCapability.resolve();
      },
      function (error) {
        showCanvas();
        renderCapability.reject(error);
      }
    );
    return result;
  }

  paintOnSvg(wrapper) {
    if (
      !(
        typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")
      )
    ) {
      throw new Error("Not implemented: paintOnSvg");
    }
    let cancelled = false;
    const ensureNotCancelled = () => {
      if (cancelled) {
        throw new RenderingCancelledException(
          `Rendering cancelled, page ${this.id}`,
          "svg"
        );
      }
    };

    const pdfPage = this.pdfPage;
    const actualSizeViewport = this.viewport.clone({
      scale: PixelsPerInch.PDF_TO_CSS_UNITS,
    });
    const promise = pdfPage
      .getOperatorList({
        annotationMode: this.#annotationMode,
      })
      .then(opList => {
        ensureNotCancelled();
        const svgGfx = new SVGGraphics(pdfPage.commonObjs, pdfPage.objs);
        return svgGfx.getSVG(opList, actualSizeViewport).then(svg => {
          ensureNotCancelled();
          this.svg = svg;
          this.paintedViewportMap.set(svg, actualSizeViewport);

          svg.style.width = wrapper.style.width;
          svg.style.height = wrapper.style.height;
          this.renderingState = RenderingStates.FINISHED;
          wrapper.append(svg);
        });
      });

    return {
      promise,
      onRenderContinue(cont) {
        cont();
      },
      cancel() {
        cancelled = true;
      },
      get separateAnnots() {
        return false;
      },
    };
  }

  /**
   * @param {string|null} label
   */
  setPageLabel(label) {
    this.pageLabel = typeof label === "string" ? label : null;

    if (this.pageLabel !== null) {
      this.div.setAttribute("data-page-label", this.pageLabel);
    } else {
      this.div.removeAttribute("data-page-label");
    }
  }

  /**
   * For use by the `PDFThumbnailView.setImage`-method.
   * @ignore
   */
  get thumbnailCanvas() {
    const { initialOptionalContent, regularAnnotations } =
      this.#useThumbnailCanvas;
    return initialOptionalContent && regularAnnotations ? this.canvas : null;
  }
}

export { PDFPageView };
