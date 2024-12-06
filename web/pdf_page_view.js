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
/** @typedef {import("./interfaces").IRenderableView} IRenderableView */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_rendering_queue").PDFRenderingQueue} PDFRenderingQueue */

import {
  AbortException,
  AnnotationMode,
  OutputScale,
  PixelsPerInch,
  RenderingCancelledException,
  setLayerDimensions,
  shadow,
} from "pdfjs-lib";
import {
  approximateFraction,
  calcRound,
  DEFAULT_SCALE,
  floorToDivide,
  RenderingStates,
  TextLayerMode,
} from "./ui_utils.js";
import { AnnotationEditorLayerBuilder } from "./annotation_editor_layer_builder.js";
import { AnnotationLayerBuilder } from "./annotation_layer_builder.js";
import { AppOptions } from "./app_options.js";
import { DrawLayerBuilder } from "./draw_layer_builder.js";
import { GenericL10n } from "web-null_l10n";
import { SimpleLinkService } from "./pdf_link_service.js";
import { StructTreeLayerBuilder } from "./struct_tree_layer_builder.js";
import { TextAccessibilityManager } from "./text_accessibility.js";
import { TextHighlighter } from "./text_highlighter.js";
import { TextLayerBuilder } from "./text_layer_builder.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";

// TODO: Should we make this an app option, or just always
// enable the feature?
const ENABLE_ZOOM_DETAIL = true;

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
 * @property {number} [textLayerMode] - Controls if the text layer used for
 *   selection and searching is created. The constants from {TextLayerMode}
 *   should be used. The default value is `TextLayerMode.ENABLE`.
 * @property {number} [annotationMode] - Controls if the annotation layer is
 *   created, and if interactive form elements or `AnnotationStorage`-data are
 *   being rendered. The constants from {@link AnnotationMode} should be used;
 *   see also {@link RenderParameters} and {@link GetOperatorListParameters}.
 *   The default value is `AnnotationMode.ENABLE_FORMS`.
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use `-1` for no limit, or `0` for
 *   CSS-only zooming. The default value is 4096 * 8192 (32 mega-pixels).
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {IL10n} [l10n] - Localization service.
 * @property {Object} [layerProperties] - The object that is used to lookup
 *   the necessary layer-properties.
 * @property {boolean} [enableHWA] - Enables hardware acceleration for
 *   rendering. The default value is `false`.
 */

const DEFAULT_LAYER_PROPERTIES =
  typeof PDFJSDev === "undefined" || !PDFJSDev.test("COMPONENTS")
    ? null
    : {
        annotationEditorUIManager: null,
        annotationStorage: null,
        downloadManager: null,
        enableScripting: false,
        fieldObjectsPromise: null,
        findController: null,
        hasJSActionsPromise: null,
        get linkService() {
          return new SimpleLinkService();
        },
      };

const LAYERS_ORDER = new Map([
  ["canvasWrapper", 0],
  ["detailLayer", 1],
  ["textLayer", 2],
  ["annotationLayer", 3],
  ["annotationEditorLayer", 4],
  ["xfaLayer", 4],
]);

class PDFPageViewBase {
  #enableHWA = false;

  #loadingId = null;

  #renderError = null;

  #renderingState = RenderingStates.INITIAL;

  #showCanvas = null;

  canvas = null;

  /** @type {null | HTMLDivElement} */
  div = null;

  eventBus = null;

  id = null;

  pageColors = null;

  renderingQueue = null;

  renderTask = null;

  resume = null;

  constructor(options) {
    this.#enableHWA =
      #enableHWA in options ? options.#enableHWA : options.enableHWA || false;
    this.eventBus = options.eventBus;
    this.id = options.id;
    this.pageColors = options.pageColors || null;
    this.renderingQueue = options.renderingQueue;
  }

  get renderingState() {
    return this.#renderingState;
  }

  set renderingState(state) {
    if (state === this.#renderingState) {
      return;
    }
    this.#renderingState = state;

    if (this.#loadingId) {
      clearTimeout(this.#loadingId);
      this.#loadingId = null;
    }

    switch (state) {
      case RenderingStates.PAUSED:
        this.div.classList.remove("loading");
        break;
      case RenderingStates.RUNNING:
        this.div.classList.add("loadingIcon");
        this.#loadingId = setTimeout(() => {
          // Adding the loading class is slightly postponed in order to not have
          // it with loadingIcon.
          // If we don't do that the visibility of the background is changed but
          // the transition isn't triggered.
          this.div.classList.add("loading");
          this.#loadingId = null;
        }, 0);
        break;
      case RenderingStates.INITIAL:
      case RenderingStates.FINISHED:
        this.div.classList.remove("loadingIcon", "loading");
        break;
    }
  }

  get _renderError() {
    return this.#renderError;
  }

  _createCanvas(hideUntilComplete = false) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "presentation");
    this.canvas = canvas;

    // Keep the canvas hidden until the first draw callback, or until drawing
    // is complete when `!this.renderingQueue`, to prevent black flickering.
    canvas.hidden = true;

    const hasHCM = this.pageColors?.background && this.pageColors?.foreground;
    // In HCM, a final filter is applied on the canvas which means that
    // before it's applied we've normal colors. Consequently, to avoid to have
    // a final flash we just display it once all the drawing is done.
    hideUntilComplete ||= hasHCM;
    this.#showCanvas = isLastShow => {
      if (!hideUntilComplete || isLastShow) {
        canvas.hidden = false;
        this.#showCanvas = null; // Only call this function once
      }
    };

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: !this.#enableHWA,
    });

    return { canvas, ctx };
  }

  #renderContinueCallback = cont => {
    this.#showCanvas?.(false);
    if (this.renderingQueue && !this.renderingQueue.isHighestPriority(this)) {
      this.renderingState = RenderingStates.PAUSED;
      this.resume = () => {
        this.renderingState = RenderingStates.RUNNING;
        cont();
      };
      return;
    }
    cont();
  };

  async _drawCanvas(options, onFinish) {
    const renderTask = (this.renderTask = this.pdfPage.render(options));
    renderTask.onContinue = this.#renderContinueCallback;

    try {
      await renderTask.promise;
      this.#showCanvas?.(true);
      this.#finishRenderTask(renderTask, null, onFinish);
    } catch (error) {
      // When zooming with a `drawingDelay` set, avoid temporarily showing
      // a black canvas if rendering was cancelled before the `onContinue`-
      // callback had been invoked at least once.
      if (!(error instanceof RenderingCancelledException)) {
        this.#showCanvas?.(true);
      }
      this.#finishRenderTask(renderTask, error, onFinish);
    }
  }

  async #finishRenderTask(renderTask, error, onFinish) {
    // The renderTask may have been replaced by a new one, so only remove
    // the reference to the renderTask if it matches the one that is
    // triggering this callback.
    if (renderTask === this.renderTask) {
      this.renderTask = null;
    }

    if (error instanceof RenderingCancelledException) {
      this.#renderError = null;
      return;
    }
    this.#renderError = error;

    this.renderingState = RenderingStates.FINISHED;

    onFinish(renderTask);

    this.eventBus.dispatch("pagerendered", {
      source: this,
      pageNumber: this.id,
      cssTransform: false,
      timestamp: performance.now(),
      error: this.#renderError,
    });

    if (error) {
      throw error;
    }
  }

  cancelRendering({ cancelExtraDelay = 0 } = {}) {
    if (this.renderTask) {
      this.renderTask.cancel(cancelExtraDelay);
      this.renderTask = null;
    }
    this.resume = null;
  }
}

/**
 * @typedef {Object} PDFPageViewUpdateParameters
 * @property {number} [scale] The new scale, if specified.
 * @property {number} [rotation] The new rotation, if specified.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise]
 *   A promise that is resolved with an {@link OptionalContentConfig}
 *   instance. The default value is `null`.
 * @property {number} [drawingDelay]
 */

/**
 * @implements {IRenderableView}
 */
class PDFPageView extends PDFPageViewBase {
  #annotationMode = AnnotationMode.ENABLE_FORMS;

  #hasRestrictedScaling = false;

  #isEditing = false;

  #layerProperties = null;

  #previousRotation = null;

  #scaleRoundX = 1;

  #scaleRoundY = 1;

  #textLayerMode = TextLayerMode.ENABLE;

  #useThumbnailCanvas = {
    directDrawing: true,
    initialOptionalContent: true,
    regularAnnotations: true,
  };

  #viewportMap = new WeakMap();

  #layers = [null, null, null, null, null];

  /**
   * @param {PDFPageViewOptions} options
   */
  constructor(options) {
    super(options);

    const container = options.container;
    const defaultViewport = options.defaultViewport;

    this.renderingId = "page" + this.id;
    this.#layerProperties = options.layerProperties || DEFAULT_LAYER_PROPERTIES;

    this.pdfPage = null;
    this.pageLabel = null;
    this.rotation = 0;
    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this._optionalContentConfigPromise =
      options.optionalContentConfigPromise || null;
    this.#textLayerMode = options.textLayerMode ?? TextLayerMode.ENABLE;
    this.#annotationMode =
      options.annotationMode ?? AnnotationMode.ENABLE_FORMS;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.maxCanvasPixels =
      options.maxCanvasPixels ?? AppOptions.get("maxCanvasPixels");

    this.l10n = options.l10n;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this.l10n ||= new GenericL10n();
    }

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this._isStandalone = !this.renderingQueue?.hasViewer();
      this._container = container;
    }

    this._annotationCanvasMap = null;

    this.annotationLayer = null;
    this.annotationEditorLayer = null;
    this.textLayer = null;
    this.zoomLayer = null;
    this.xfaLayer = null;
    this.structTreeLayer = null;
    this.drawLayer = null;

    this.detailView = null;

    const div = document.createElement("div");
    div.className = "page";
    div.setAttribute("data-page-number", this.id);
    div.setAttribute("role", "region");
    div.setAttribute("data-l10n-id", "pdfjs-page-landmark");
    div.setAttribute("data-l10n-args", JSON.stringify({ page: this.id }));
    this.div = div;

    this.#setDimensions();
    container?.append(div);

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this._isStandalone
    ) {
      // Ensure that the various layers always get the correct initial size,
      // see issue 15795.
      container?.style.setProperty(
        "--scale-factor",
        this.scale * PixelsPerInch.PDF_TO_CSS_UNITS
      );

      if (this.pageColors?.background) {
        container?.style.setProperty(
          "--page-bg-color",
          this.pageColors.background
        );
      }

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

      // Ensure that Fluent is connected in e.g. the COMPONENTS build.
      if (!options.l10n) {
        this.l10n.translate(this.div);
      }
    }
  }

  _addLayer(div, name) {
    const pos = LAYERS_ORDER.get(name);
    const oldDiv = this.#layers[pos];
    this.#layers[pos] = div;
    if (oldDiv) {
      oldDiv.replaceWith(div);
      return;
    }
    for (let i = pos - 1; i >= 0; i--) {
      const layer = this.#layers[i];
      if (layer) {
        layer.after(div);
        return;
      }
    }
    this.div.prepend(div);
  }

  _forgetLayer(name) {
    this.#layers[LAYERS_ORDER.get(name)] = null;
  }

  #setDimensions() {
    const { viewport } = this;
    if (this.pdfPage) {
      if (this.#previousRotation === viewport.rotation) {
        return;
      }
      this.#previousRotation = viewport.rotation;
    }

    setLayerDimensions(
      this.div,
      viewport,
      /* mustFlip = */ true,
      /* mustRotate = */ false
    );
  }

  setPdfPage(pdfPage) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this._isStandalone &&
      (this.pageColors?.foreground === "CanvasText" ||
        this.pageColors?.background === "Canvas")
    ) {
      this._container?.style.setProperty(
        "--hcm-highlight-filter",
        pdfPage.filterFactory.addHighlightHCMFilter(
          "highlight",
          "CanvasText",
          "Canvas",
          "HighlightText",
          "Highlight"
        )
      );
      this._container?.style.setProperty(
        "--hcm-highlight-selected-filter",
        pdfPage.filterFactory.addHighlightHCMFilter(
          "highlight_selected",
          "CanvasText",
          "Canvas",
          "HighlightText",
          "Highlight"
        )
      );
    }
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: this.scale * PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: totalRotation,
    });
    this.#setDimensions();
    this.reset();
  }

  destroy() {
    this.reset();
    this.pdfPage?.cleanup();
  }

  hasEditableAnnotations() {
    return !!this.annotationLayer?.hasEditableAnnotations();
  }

  get _textHighlighter() {
    return shadow(
      this,
      "_textHighlighter",
      new TextHighlighter({
        pageIndex: this.id - 1,
        eventBus: this.eventBus,
        findController: this.#layerProperties.findController,
      })
    );
  }

  #dispatchLayerRendered(name, error) {
    this.eventBus.dispatch(name, {
      source: this,
      pageNumber: this.id,
      error,
    });
  }

  async #renderAnnotationLayer() {
    let error = null;
    try {
      await this.annotationLayer.render(
        this.viewport,
        { structTreeLayer: this.structTreeLayer },
        "display"
      );
    } catch (ex) {
      console.error(`#renderAnnotationLayer: "${ex}".`);
      error = ex;
    } finally {
      this.#dispatchLayerRendered("annotationlayerrendered", error);
    }
  }

  async #renderAnnotationEditorLayer() {
    let error = null;
    try {
      await this.annotationEditorLayer.render(this.viewport, "display");
    } catch (ex) {
      console.error(`#renderAnnotationEditorLayer: "${ex}".`);
      error = ex;
    } finally {
      this.#dispatchLayerRendered("annotationeditorlayerrendered", error);
    }
  }

  async #renderDrawLayer() {
    try {
      await this.drawLayer.render("display");
    } catch (ex) {
      console.error(`#renderDrawLayer: "${ex}".`);
    }
  }

  async #renderXfaLayer() {
    let error = null;
    try {
      const result = await this.xfaLayer.render(this.viewport, "display");
      if (result?.textDivs && this._textHighlighter) {
        // Given that the following method fetches the text asynchronously we
        // can invoke it *before* appending the xfaLayer to the DOM (below),
        // since a pending search-highlight/scroll operation thus won't run
        // until after the xfaLayer is available in the viewer.
        this.#buildXfaTextContentItems(result.textDivs);
      }
    } catch (ex) {
      console.error(`#renderXfaLayer: "${ex}".`);
      error = ex;
    } finally {
      if (this.xfaLayer?.div) {
        // Pause translation when inserting the xfaLayer in the DOM.
        this.l10n.pause();
        this._addLayer(this.xfaLayer.div, "xfaLayer");
        this.l10n.resume();
      }
      this.#dispatchLayerRendered("xfalayerrendered", error);
    }
  }

  async #renderTextLayer() {
    if (!this.textLayer) {
      return;
    }

    let error = null;
    try {
      await this.textLayer.render(this.viewport);
    } catch (ex) {
      if (ex instanceof AbortException) {
        return;
      }
      console.error(`#renderTextLayer: "${ex}".`);
      error = ex;
    }
    this.#dispatchLayerRendered("textlayerrendered", error);

    this.#renderStructTreeLayer();
  }

  /**
   * The structure tree is currently only supported when the text layer is
   * enabled and a canvas is used for rendering.
   *
   * The structure tree must be generated after the text layer for the
   * aria-owns to work.
   */
  async #renderStructTreeLayer() {
    if (!this.textLayer) {
      return;
    }

    const treeDom = await this.structTreeLayer?.render();
    if (treeDom) {
      this.l10n.pause();
      this.structTreeLayer?.addElementsToTextLayer();
      if (this.canvas && treeDom.parentNode !== this.canvas) {
        // Pause translation when inserting the structTree in the DOM.
        this.canvas.append(treeDom);
      }
      this.l10n.resume();
    }
    this.structTreeLayer?.show();
  }

  async #buildXfaTextContentItems(textDivs) {
    const text = await this.pdfPage.getTextContent();
    const items = [];
    for (const item of text.items) {
      items.push(item.str);
    }
    this._textHighlighter.setTextMapping(textDivs, items);
    this._textHighlighter.enable();
  }

  /**
   * @private
   */
  _resetZoomLayer(removeFromDOM = false) {
    if (!this.zoomLayer) {
      return;
    }
    const zoomLayerCanvas = this.zoomLayer.firstChild;
    this.#viewportMap.delete(zoomLayerCanvas);
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
    keepTextLayer = false,
  } = {}) {
    this.cancelRendering({
      keepAnnotationLayer,
      keepAnnotationEditorLayer,
      keepXfaLayer,
      keepTextLayer,
    });
    this.renderingState = RenderingStates.INITIAL;

    const div = this.div;

    const childNodes = div.childNodes,
      zoomLayerNode = (keepZoomLayer && this.zoomLayer) || null,
      annotationLayerNode =
        (keepAnnotationLayer && this.annotationLayer?.div) || null,
      annotationEditorLayerNode =
        (keepAnnotationEditorLayer && this.annotationEditorLayer?.div) || null,
      xfaLayerNode = (keepXfaLayer && this.xfaLayer?.div) || null,
      textLayerNode = (keepTextLayer && this.textLayer?.div) || null;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      switch (node) {
        case zoomLayerNode:
        case annotationLayerNode:
        case annotationEditorLayerNode:
        case xfaLayerNode:
        case textLayerNode:
          continue;
      }
      node.remove();
      const layerIndex = this.#layers.indexOf(node);
      if (layerIndex >= 0) {
        this.#layers[layerIndex] = null;
      }
    }
    div.removeAttribute("data-loaded");

    if (annotationLayerNode) {
      // Hide the annotation layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.annotationLayer.hide();
    }
    if (annotationEditorLayerNode) {
      this.annotationEditorLayer.hide();
    }
    if (xfaLayerNode) {
      // Hide the XFA layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.xfaLayer.hide();
    }
    if (textLayerNode) {
      this.textLayer.hide();
    }
    this.structTreeLayer?.hide();

    if (!zoomLayerNode) {
      if (this.canvas) {
        this.#viewportMap.delete(this.canvas);
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        this.canvas.width = 0;
        this.canvas.height = 0;
        this.canvas = null;
      }
      this._resetZoomLayer();
    }
  }

  toggleEditingMode(isEditing) {
    if (!this.hasEditableAnnotations()) {
      return;
    }
    this.#isEditing = isEditing;
    this.reset({
      keepZoomLayer: true,
      keepAnnotationLayer: true,
      keepAnnotationEditorLayer: true,
      keepXfaLayer: true,
      keepTextLayer: true,
    });
  }

  updateVisibleArea(visibleArea) {
    if (this.#hasRestrictedScaling && this.maxCanvasPixels > 0 && visibleArea) {
      this.detailView ??= new PDFPageDetailView({ pageView: this });
      this.detailView.update({ visibleArea });
    } else if (this.detailView) {
      this.detailView.reset();
      this.detailView = null;
    }
  }

  /**
   * Update e.g. the scale and/or rotation of the page.
   * @param {PDFPageViewUpdateParameters} params
   */
  update({
    scale = 0,
    rotation = null,
    optionalContentConfigPromise = null,
    drawingDelay = -1,
  }) {
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
    this.#useThumbnailCanvas.directDrawing = true;

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: totalRotation,
    });
    this.#setDimensions();

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this._isStandalone
    ) {
      this._container?.style.setProperty("--scale-factor", this.viewport.scale);
    }

    if (this.canvas) {
      let onlyCssZoom = false;
      if (this.#hasRestrictedScaling) {
        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
          this.maxCanvasPixels === 0
        ) {
          onlyCssZoom = true;
        } else if (!ENABLE_ZOOM_DETAIL && this.maxCanvasPixels > 0) {
          const { width, height } = this.viewport;
          const { sx, sy } = this.outputScale;
          onlyCssZoom =
            ((Math.floor(width) * sx) | 0) * ((Math.floor(height) * sy) | 0) >
            this.maxCanvasPixels;
        }
      }
      const postponeDrawing = drawingDelay >= 0 && drawingDelay < 1000;

      if (postponeDrawing || onlyCssZoom) {
        if (
          postponeDrawing &&
          !onlyCssZoom &&
          this.renderingState !== RenderingStates.FINISHED
        ) {
          this.cancelRendering({
            keepZoomLayer: true,
            keepAnnotationLayer: true,
            keepAnnotationEditorLayer: true,
            keepXfaLayer: true,
            keepTextLayer: true,
            cancelExtraDelay: drawingDelay,
          });
          // It isn't really finished, but once we have finished
          // to postpone, we'll call this.reset(...) which will set
          // the rendering state to INITIAL, hence the next call to
          // PDFViewer.update() will trigger a redraw (if it's mandatory).
          this.renderingState = RenderingStates.FINISHED;
          // Ensure that the thumbnails won't become partially (or fully) blank,
          // if the sidebar is opened before the actual rendering is done.
          this.#useThumbnailCanvas.directDrawing = false;
        }

        this.cssTransform({
          target: this.canvas,
          redrawAnnotationLayer: true,
          redrawAnnotationEditorLayer: true,
          redrawXfaLayer: true,
          redrawTextLayer: !postponeDrawing,
          hideTextLayer: postponeDrawing,
        });

        if (postponeDrawing) {
          // The "pagerendered"-event will be dispatched once the actual
          // rendering is done, hence don't dispatch it here as well.
          return;
        }

        this.detailView?.update({ underlyingViewUpdated: true });

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
      keepTextLayer: true,
    });

    this.detailView?.update({ underlyingViewUpdated: true });
  }

  /**
   * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
   *              rather than calling this one directly.
   */
  cancelRendering({
    keepAnnotationLayer = false,
    keepAnnotationEditorLayer = false,
    keepXfaLayer = false,
    keepTextLayer = false,
    cancelExtraDelay = 0,
  } = {}) {
    super.cancelRendering({ cancelExtraDelay });

    if (this.textLayer && (!keepTextLayer || !this.textLayer.div)) {
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
    if (this.structTreeLayer && !this.textLayer) {
      this.structTreeLayer = null;
    }
    if (
      this.annotationEditorLayer &&
      (!keepAnnotationEditorLayer || !this.annotationEditorLayer.div)
    ) {
      if (this.drawLayer) {
        this.drawLayer.cancel();
        this.drawLayer = null;
      }
      this.annotationEditorLayer.cancel();
      this.annotationEditorLayer = null;
    }
    if (this.xfaLayer && (!keepXfaLayer || !this.xfaLayer.div)) {
      this.xfaLayer.cancel();
      this.xfaLayer = null;
      this._textHighlighter?.disable();
    }
  }

  cssTransform({
    target,
    redrawAnnotationLayer = false,
    redrawAnnotationEditorLayer = false,
    redrawXfaLayer = false,
    redrawTextLayer = false,
    hideTextLayer = false,
  }) {
    // Scale target (canvas), its wrapper and page container.
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      !(target instanceof HTMLCanvasElement)
    ) {
      throw new Error("Expected `target` to be a canvas.");
    }
    if (!target.hasAttribute("zooming")) {
      target.setAttribute("zooming", true);
      const { style } = target;
      style.width = style.height = "";
    }

    const originalViewport = this.#viewportMap.get(target);
    if (this.viewport !== originalViewport) {
      // The canvas may have been originally rotated; rotate relative to that.
      const relativeRotation =
        this.viewport.rotation - originalViewport.rotation;
      const absRotation = Math.abs(relativeRotation);
      let scaleX = 1,
        scaleY = 1;
      if (absRotation === 90 || absRotation === 270) {
        const { width, height } = this.viewport;
        // Scale x and y because of the rotation.
        scaleX = height / width;
        scaleY = width / height;
      }
      target.style.transform = `rotate(${relativeRotation}deg) scale(${scaleX}, ${scaleY})`;
    }

    if (redrawAnnotationLayer && this.annotationLayer) {
      this.#renderAnnotationLayer();
    }
    if (redrawAnnotationEditorLayer && this.annotationEditorLayer) {
      if (this.drawLayer) {
        this.#renderDrawLayer();
      }
      this.#renderAnnotationEditorLayer();
    }
    if (redrawXfaLayer && this.xfaLayer) {
      this.#renderXfaLayer();
    }

    if (this.textLayer) {
      if (hideTextLayer) {
        this.textLayer.hide();
        this.structTreeLayer?.hide();
      } else if (redrawTextLayer) {
        this.#renderTextLayer();
      }
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

  async draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, l10n, pageColors, pdfPage, viewport } = this;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      throw new Error("pdfPage is not loaded");
    }

    this.renderingState = RenderingStates.RUNNING;

    // Wrap the canvas so that if it has a CSS transform for high DPI the
    // overflow will be hidden in Firefox.
    const canvasWrapper = document.createElement("div");
    canvasWrapper.classList.add("canvasWrapper");
    this._addLayer(canvasWrapper, "canvasWrapper");

    if (
      !this.textLayer &&
      this.#textLayerMode !== TextLayerMode.DISABLE &&
      !pdfPage.isPureXfa
    ) {
      this._accessibilityManager ||= new TextAccessibilityManager();

      this.textLayer = new TextLayerBuilder({
        pdfPage,
        highlighter: this._textHighlighter,
        accessibilityManager: this._accessibilityManager,
        enablePermissions:
          this.#textLayerMode === TextLayerMode.ENABLE_PERMISSIONS,
        onAppend: textLayerDiv => {
          // Pause translation when inserting the textLayer in the DOM.
          this.l10n.pause();
          this._addLayer(textLayerDiv, "textLayer");
          this.l10n.resume();
        },
      });
    }

    if (
      !this.annotationLayer &&
      this.#annotationMode !== AnnotationMode.DISABLE
    ) {
      const {
        annotationStorage,
        annotationEditorUIManager,
        downloadManager,
        enableScripting,
        fieldObjectsPromise,
        hasJSActionsPromise,
        linkService,
      } = this.#layerProperties;

      this._annotationCanvasMap ||= new Map();
      this.annotationLayer = new AnnotationLayerBuilder({
        pdfPage,
        annotationStorage,
        imageResourcesPath: this.imageResourcesPath,
        renderForms: this.#annotationMode === AnnotationMode.ENABLE_FORMS,
        linkService,
        downloadManager,
        enableScripting,
        hasJSActionsPromise,
        fieldObjectsPromise,
        annotationCanvasMap: this._annotationCanvasMap,
        accessibilityManager: this._accessibilityManager,
        annotationEditorUIManager,
        onAppend: annotationLayerDiv => {
          this._addLayer(annotationLayerDiv, "annotationLayer");
        },
      });
    }

    const { width, height } = viewport;

    const { canvas, ctx } = this._createCanvas();
    canvasWrapper.append(canvas);

    const outputScale = (this.outputScale = new OutputScale());

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this.maxCanvasPixels === 0
    ) {
      const invScale = 1 / this.scale;
      // Use a scale that makes the canvas have the originally intended size
      // of the page.
      outputScale.sx *= invScale;
      outputScale.sy *= invScale;
      this.#hasRestrictedScaling = true;
    } else if (this.maxCanvasPixels > 0) {
      const pixelsInViewport = width * height;
      const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        this.#hasRestrictedScaling = true;
      } else {
        this.#hasRestrictedScaling = false;
      }
    }
    const sfx = approximateFraction(outputScale.sx);
    const sfy = approximateFraction(outputScale.sy);

    const canvasWidth = (canvas.width = floorToDivide(
      calcRound(width * outputScale.sx),
      sfx[0]
    ));
    const canvasHeight = (canvas.height = floorToDivide(
      calcRound(height * outputScale.sy),
      sfy[0]
    ));
    const pageWidth = floorToDivide(calcRound(width), sfx[1]);
    const pageHeight = floorToDivide(calcRound(height), sfy[1]);
    outputScale.sx = canvasWidth / pageWidth;
    outputScale.sy = canvasHeight / pageHeight;

    if (this.#scaleRoundX !== sfx[1]) {
      div.style.setProperty("--scale-round-x", `${sfx[1]}px`);
      this.#scaleRoundX = sfx[1];
    }
    if (this.#scaleRoundY !== sfy[1]) {
      div.style.setProperty("--scale-round-y", `${sfy[1]}px`);
      this.#scaleRoundY = sfy[1];
    }

    // Add the viewport so it's known what it was originally drawn with.
    this.#viewportMap.set(canvas, viewport);

    // Rendering area
    const transform = outputScale.scaled
      ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
      : null;
    const renderContext = {
      canvasContext: ctx,
      transform,
      viewport,
      annotationMode: this.#annotationMode,
      optionalContentConfigPromise: this._optionalContentConfigPromise,
      annotationCanvasMap: this._annotationCanvasMap,
      pageColors,
      isEditing: this.#isEditing,
    };
    const resultPromise = this._drawCanvas(renderContext, renderTask => {
      this._resetZoomLayer(/* removeFromDOM = */ true);

      // Ensure that the thumbnails won't become partially (or fully) blank,
      // for documents that contain interactive form elements.
      this.#useThumbnailCanvas.regularAnnotations = !renderTask.separateAnnots;
    }).then(
      async () => {
        this.structTreeLayer ||= new StructTreeLayerBuilder(
          pdfPage,
          viewport.rawDims
        );

        this.#renderTextLayer();

        if (this.annotationLayer) {
          await this.#renderAnnotationLayer();
        }

        const { annotationEditorUIManager } = this.#layerProperties;

        if (!annotationEditorUIManager) {
          return;
        }
        this.drawLayer ||= new DrawLayerBuilder({
          pageIndex: this.id,
        });
        await this.#renderDrawLayer();
        this.drawLayer.setParent(canvasWrapper);

        this.annotationEditorLayer ||= new AnnotationEditorLayerBuilder({
          uiManager: annotationEditorUIManager,
          pdfPage,
          l10n,
          structTreeLayer: this.structTreeLayer,
          accessibilityManager: this._accessibilityManager,
          annotationLayer: this.annotationLayer?.annotationLayer,
          textLayer: this.textLayer,
          drawLayer: this.drawLayer.getDrawLayer(),
          onAppend: annotationEditorLayerDiv => {
            this._addLayer(annotationEditorLayerDiv, "annotationEditorLayer");
          },
        });
        this.#renderAnnotationEditorLayer();
      },
      // TODO: To minimize diff due to autoformatting. Remove before merging.
      e => {
        throw e;
      }
    );

    if (pdfPage.isPureXfa) {
      if (!this.xfaLayer) {
        const { annotationStorage, linkService } = this.#layerProperties;

        this.xfaLayer = new XfaLayerBuilder({
          pdfPage,
          annotationStorage,
          linkService,
        });
      }
      this.#renderXfaLayer();
    }

    div.setAttribute("data-loaded", true);

    this.eventBus.dispatch("pagerender", {
      source: this,
      pageNumber: this.id,
    });
    return resultPromise;
  }

  /**
   * @param {string|null} label
   */
  setPageLabel(label) {
    this.pageLabel = typeof label === "string" ? label : null;

    this.div.setAttribute(
      "data-l10n-args",
      JSON.stringify({ page: this.pageLabel ?? this.id })
    );

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
    const { directDrawing, initialOptionalContent, regularAnnotations } =
      this.#useThumbnailCanvas;
    return directDrawing && initialOptionalContent && regularAnnotations
      ? this.canvas
      : null;
  }
}

/**
 * @implements {IRenderableView}
 */
class PDFPageDetailView extends PDFPageViewBase {
  constructor({ pageView }) {
    super(pageView);

    this.pageView = pageView;
    this.renderingId = "detail" + this.id;

    this.detailArea = null;

    this.div = pageView.div;
  }

  setPdfPage(pdfPage) {
    this.pageView.setPdfPage(pdfPage);
  }

  get pdfPage() {
    return this.pageView.pdfPage;
  }

  reset() {
    this.cancelRendering();
    this.renderingState = RenderingStates.INITIAL;
    this.canvas?.remove();
    this.canvas = null;
  }

  #covers(visibleArea) {
    if (!this.detailArea) {
      return false;
    }

    const { minX, minY, width, height } = this.detailArea;
    return (
      visibleArea.minX > minX &&
      visibleArea.minY > minY &&
      visibleArea.maxX < minX + width &&
      visibleArea.maxY < minY + height
    );
  }

  update({ visibleArea = null, underlyingViewUpdated = false } = {}) {
    if (underlyingViewUpdated) {
      this.cancelRendering();
      this.renderingState = RenderingStates.INITIAL;
      return;
    }

    if (this.#covers(visibleArea)) {
      return;
    }

    const { viewport, maxCanvasPixels } = this.pageView;

    const visibleWidth = visibleArea.maxX - visibleArea.minX;
    const visibleHeight = visibleArea.maxY - visibleArea.minY;

    // "overflowScale" represents which percentage of the width and of the
    // height the detail area extends outside of the visible area. We want to
    // draw a larger area so that we don't have to constantly re-draw while
    // scrolling. The detail area's dimensions thus become
    // visibleLength * (2 * overflowScale + 1).
    // We default to adding a whole height/length of detail area on each side,
    // but we can reduce it to make sure that we stay within the maxCanvasPixels
    // limit.
    const visiblePixels =
      visibleWidth * visibleHeight * (window.devicePixelRatio || 1) ** 2;
    const maxDetailToVisibleLinearRatio = Math.sqrt(
      maxCanvasPixels / visiblePixels
    );
    const maxOverflowScale = (maxDetailToVisibleLinearRatio - 1) / 2;
    let overflowScale = Math.min(1, maxOverflowScale);
    if (overflowScale < 0) {
      overflowScale = 0;
      // In this case, we render a detail view that is exactly as big as the
      // visible area, but we ignore the .maxCanvasPixels limit.
      // TODO: We should probably instead give up and not render the detail view
      // in this case. It's quite rate to hit it though, because usually
      // .maxCanvasPixels will at least have enough pixels to cover the visible
      // screen.
    }

    const overflowWidth = visibleWidth * overflowScale;
    const overflowHeight = visibleHeight * overflowScale;

    const minX = Math.max(0, visibleArea.minX - overflowWidth);
    const maxX = Math.min(viewport.width, visibleArea.maxX + overflowWidth);
    const minY = Math.max(0, visibleArea.minY - overflowHeight);
    const maxY = Math.min(viewport.height, visibleArea.maxY + overflowHeight);
    const width = maxX - minX;
    const height = maxY - minY;

    this.detailArea = { minX, minY, width, height };

    if (!this.scrollLayer && this.canvas && !this.canvas.hidden) {
      this.scrollLayer = this.canvas.parentNode;
      // "forget" the detailLayer, so that when rendering a new detailLayer
      // it doesn't replace the old one.
      // The old one, which becomes the .scrollLayer, will instead be removed
      // once the new canvas finished rendering.
      this.pageView._forgetLayer("detailLayer");
      this.canvas = null;
    }

    this.reset();
  }

  async draw() {
    const initialRenderingState = this.renderingState;
    if (initialRenderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, pdfPage, viewport } = this.pageView;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      throw new Error("pdfPage is not loaded");
    }

    this.renderingState = RenderingStates.RUNNING;

    const { canvas, ctx } = this._createCanvas(
      // If there is already the lower resolution canvas behind,
      // we don't show the new one until when it's fully ready.
      this.pageView.renderingState === RenderingStates.FINISHED
    );
    const { width, height } = viewport;

    const area = this.detailArea;

    const { devicePixelRatio = 1 } = window;
    const transform =
      devicePixelRatio !== 1
        ? [
            devicePixelRatio,
            0,
            0,
            devicePixelRatio,
            -area.minX * devicePixelRatio,
            -area.minY * devicePixelRatio,
          ]
        : null;

    canvas.width = area.width * devicePixelRatio;
    canvas.height = area.height * devicePixelRatio;
    canvas.style.position = "absolute";
    canvas.style.display = "block";
    canvas.style.width = `${(area.width * 100) / width}%`;
    canvas.style.height = `${(area.height * 100) / height}%`;
    canvas.style.top = `${(area.minY * 100) / height}%`;
    canvas.style.left = `${(area.minX * 100) / width}%`;

    // Wrap the canvas so that if it has a CSS transform for high DPI the
    // overflow will be hidden in Firefox.
    const canvasWrapper = document.createElement("div");
    canvasWrapper.classList.add("canvasWrapper", "detailLayer");
    this.pageView._addLayer(canvasWrapper, "detailLayer");
    canvasWrapper.append(canvas);

    const renderingPromise = this._drawCanvas(
      {
        canvasContext: ctx,
        transform,
        viewport,
        pageColors: this.pageColors,
      },
      () => {
        if (!this.scrollLayer) {
          return;
        }

        const scrollLayerCanvas = this.scrollLayer.firstChild;
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        scrollLayerCanvas.width = 0;
        scrollLayerCanvas.height = 0;

        this.scrollLayer.remove();
        this.scrollLayer = null;
      }
    );

    div.setAttribute("data-loaded", true);

    this.eventBus.dispatch("pagerender", {
      source: this,
      pageNumber: this.id,
    });

    return renderingPromise;
  }
}

/**
 * @implements {IRenderableView}
 */
export { PDFPageDetailView, PDFPageView };
