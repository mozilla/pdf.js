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
import { Autolinker } from "./autolinker.js";
import { BasePDFPageView } from "./base_pdf_page_view.js";
import { DrawLayerBuilder } from "./draw_layer_builder.js";
import { GenericL10n } from "web-null_l10n";
import { PDFPageDetailView } from "./pdf_page_detail_view.js";
import { SimpleLinkService } from "./pdf_link_service.js";
import { StructTreeLayerBuilder } from "./struct_tree_layer_builder.js";
import { TextAccessibilityManager } from "./text_accessibility.js";
import { TextHighlighter } from "./text_highlighter.js";
import { TextLayerBuilder } from "./text_layer_builder.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";

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
 * @property {boolean} [enableDetailCanvas] - When enabled, if the rendered
 *   pages would need a canvas that is larger than `maxCanvasPixels`, it will
 *   draw a second canvas on top of the CSS-zoomed one, that only renders the
 *   part of the page that is close to the viewport. The default value is
 *   `true`.

 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {IL10n} [l10n] - Localization service.
 * @property {Object} [layerProperties] - The object that is used to lookup
 *   the necessary layer-properties.
 * @property {boolean} [enableHWA] - Enables hardware acceleration for
 *   rendering. The default value is `false`.
 * @property {boolean} [enableAutoLinking] - Enable creation of hyperlinks from
 *   text that look like URLs. The default value is `false`.
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
  ["textLayer", 1],
  ["annotationLayer", 2],
  ["annotationEditorLayer", 3],
  ["xfaLayer", 3],
]);

/**
 * @implements {IRenderableView}
 */
class PDFPageView extends BasePDFPageView {
  #annotationMode = AnnotationMode.ENABLE_FORMS;

  #canvasWrapper = null;

  #enableAutoLinking = false;

  #hasRestrictedScaling = false;

  #isEditing = false;

  #layerProperties = null;

  #needsRestrictedScaling = false;

  #originalViewport = null;

  #previousRotation = null;

  #scaleRoundX = 1;

  #scaleRoundY = 1;

  #textLayerMode = TextLayerMode.ENABLE;

  #userUnit = 1;

  #useThumbnailCanvas = {
    directDrawing: true,
    initialOptionalContent: true,
    regularAnnotations: true,
  };

  #layers = [null, null, null, null];

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
    this.enableDetailCanvas = options.enableDetailCanvas ?? true;
    this.maxCanvasPixels =
      options.maxCanvasPixels ?? AppOptions.get("maxCanvasPixels");
    this.#enableAutoLinking = options.enableAutoLinking || false;

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

  #addLayer(div, name) {
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

  #setDimensions() {
    const { div, viewport } = this;

    if (viewport.userUnit !== this.#userUnit) {
      if (viewport.userUnit !== 1) {
        div.style.setProperty("--user-unit", viewport.userUnit);
      } else {
        div.style.removeProperty("--user-unit");
      }
      this.#userUnit = viewport.userUnit;
    }
    if (this.pdfPage) {
      if (this.#previousRotation === viewport.rotation) {
        return;
      }
      this.#previousRotation = viewport.rotation;
    }

    setLayerDimensions(
      div,
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
      await this.annotationLayer.render({
        viewport: this.viewport,
        intent: "display",
        structTreeLayer: this.structTreeLayer,
      });
    } catch (ex) {
      console.error("#renderAnnotationLayer:", ex);
      error = ex;
    } finally {
      this.#dispatchLayerRendered("annotationlayerrendered", error);
    }
  }

  async #renderAnnotationEditorLayer() {
    let error = null;
    try {
      await this.annotationEditorLayer.render({
        viewport: this.viewport,
        intent: "display",
      });
    } catch (ex) {
      console.error("#renderAnnotationEditorLayer:", ex);
      error = ex;
    } finally {
      this.#dispatchLayerRendered("annotationeditorlayerrendered", error);
    }
  }

  async #renderDrawLayer() {
    try {
      await this.drawLayer.render({
        intent: "display",
      });
    } catch (ex) {
      console.error("#renderDrawLayer:", ex);
    }
  }

  async #renderXfaLayer() {
    let error = null;
    try {
      const result = await this.xfaLayer.render({
        viewport: this.viewport,
        intent: "display",
      });
      if (result?.textDivs && this._textHighlighter) {
        // Given that the following method fetches the text asynchronously we
        // can invoke it *before* appending the xfaLayer to the DOM (below),
        // since a pending search-highlight/scroll operation thus won't run
        // until after the xfaLayer is available in the viewer.
        this.#buildXfaTextContentItems(result.textDivs);
      }
    } catch (ex) {
      console.error("#renderXfaLayer:", ex);
      error = ex;
    } finally {
      if (this.xfaLayer?.div) {
        // Pause translation when inserting the xfaLayer in the DOM.
        this.l10n.pause();
        this.#addLayer(this.xfaLayer.div, "xfaLayer");
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
      await this.textLayer.render({
        viewport: this.viewport,
      });
    } catch (ex) {
      if (ex instanceof AbortException) {
        return;
      }
      console.error("#renderTextLayer:", ex);
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

  async #injectLinkAnnotations(textLayerPromise) {
    let error = null;
    try {
      await textLayerPromise;

      if (!this.annotationLayer) {
        return; // Rendering was cancelled while the textLayerPromise resolved.
      }
      await this.annotationLayer.injectLinkAnnotations({
        inferredLinks: Autolinker.processLinks(this),
        viewport: this.viewport,
        structTreeLayer: this.structTreeLayer,
      });
    } catch (ex) {
      console.error("#injectLinkAnnotations:", ex);
      error = ex;
    }
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      this.#dispatchLayerRendered("linkannotationsadded", error);
    }
  }

  _resetCanvas() {
    super._resetCanvas();
    this.#originalViewport = null;
  }

  reset({
    keepAnnotationLayer = false,
    keepAnnotationEditorLayer = false,
    keepXfaLayer = false,
    keepTextLayer = false,
    keepCanvasWrapper = false,
    preserveDetailViewState = false,
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
      annotationLayerNode =
        (keepAnnotationLayer && this.annotationLayer?.div) || null,
      annotationEditorLayerNode =
        (keepAnnotationEditorLayer && this.annotationEditorLayer?.div) || null,
      xfaLayerNode = (keepXfaLayer && this.xfaLayer?.div) || null,
      textLayerNode = (keepTextLayer && this.textLayer?.div) || null,
      canvasWrapperNode = (keepCanvasWrapper && this.#canvasWrapper) || null;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      switch (node) {
        case annotationLayerNode:
        case annotationEditorLayerNode:
        case xfaLayerNode:
        case textLayerNode:
        case canvasWrapperNode:
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

    if (!keepCanvasWrapper && this.#canvasWrapper) {
      this.#canvasWrapper = null;
      this._resetCanvas();
    }

    if (!preserveDetailViewState) {
      this.detailView?.reset({ keepCanvas: keepCanvasWrapper });

      // If we are keeping the canvas around we must also keep the `detailView`
      // object, so that next time we need a detail view we'll update the
      // existing canvas rather than creating a new one.
      if (!keepCanvasWrapper) {
        this.detailView = null;
      }
    }
  }

  toggleEditingMode(isEditing) {
    // The page can be invisible, consequently there's no annotation layer and
    // we can't know if there are editable annotations.
    // So to avoid any issue when the page is rendered the #isEditing flag must
    // be set.
    this.#isEditing = isEditing;
    if (!this.hasEditableAnnotations()) {
      return;
    }
    this.reset({
      keepAnnotationLayer: true,
      keepAnnotationEditorLayer: true,
      keepXfaLayer: true,
      keepTextLayer: true,
      keepCanvasWrapper: true,
    });
  }

  updateVisibleArea(visibleArea) {
    if (this.enableDetailCanvas) {
      if (
        this.#needsRestrictedScaling &&
        this.maxCanvasPixels > 0 &&
        visibleArea
      ) {
        this.detailView ??= new PDFPageDetailView({ pageView: this });
        this.detailView.update({ visibleArea });
      } else if (this.detailView) {
        this.detailView.reset();
        this.detailView = null;
      }
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

    this.#computeScale();

    if (this.canvas) {
      const onlyCssZoom =
        this.#hasRestrictedScaling && this.#needsRestrictedScaling;
      const postponeDrawing = drawingDelay >= 0 && drawingDelay < 1000;

      if (postponeDrawing || onlyCssZoom) {
        if (
          postponeDrawing &&
          !onlyCssZoom &&
          this.renderingState !== RenderingStates.FINISHED
        ) {
          this.cancelRendering({
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
          redrawAnnotationLayer: true,
          redrawAnnotationEditorLayer: true,
          redrawXfaLayer: true,
          redrawTextLayer: !postponeDrawing,
          hideTextLayer: postponeDrawing,
        });

        // The "pagerendered"-event will be dispatched once the actual
        // rendering is done, hence don't dispatch it here as well.
        if (!postponeDrawing) {
          this.detailView?.update({ underlyingViewUpdated: true });

          this.dispatchPageRendered(
            /* cssTransform */ true,
            /* isDetailView */ false
          );
        }
        return;
      }
    }
    this.cssTransform({});
    this.reset({
      keepAnnotationLayer: true,
      keepAnnotationEditorLayer: true,
      keepXfaLayer: true,
      keepTextLayer: true,
      keepCanvasWrapper: true,
      // It will be reset by the .update call below
      preserveDetailViewState: true,
    });

    this.detailView?.update({ underlyingViewUpdated: true });
  }

  #computeScale() {
    const { width, height } = this.viewport;
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
      this.#needsRestrictedScaling = true;
    } else if (this.maxCanvasPixels > 0) {
      const pixelsInViewport = width * height;
      const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        this.#needsRestrictedScaling = true;
      } else {
        this.#needsRestrictedScaling = false;
      }
    }
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
    redrawAnnotationLayer = false,
    redrawAnnotationEditorLayer = false,
    redrawXfaLayer = false,
    redrawTextLayer = false,
    hideTextLayer = false,
  }) {
    const { canvas } = this;
    if (!canvas) {
      return;
    }

    const originalViewport = this.#originalViewport;
    if (this.viewport !== originalViewport) {
      // The canvas may have been originally rotated; rotate relative to that.
      const relativeRotation =
        (360 + this.viewport.rotation - originalViewport.rotation) % 360;
      if (relativeRotation === 90 || relativeRotation === 270) {
        const { width, height } = this.viewport;
        // Scale x and y because of the rotation.
        const scaleX = height / width;
        const scaleY = width / height;
        canvas.style.transform = `rotate(${relativeRotation}deg) scale(${scaleX},${scaleY})`;
      } else {
        canvas.style.transform =
          relativeRotation === 0 ? "" : `rotate(${relativeRotation}deg)`;
      }
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

  // Wrap the canvas so that if it has a CSS transform for high DPI the
  // overflow will be hidden in Firefox.
  _ensureCanvasWrapper() {
    let canvasWrapper = this.#canvasWrapper;
    if (!canvasWrapper) {
      canvasWrapper = this.#canvasWrapper = document.createElement("div");
      canvasWrapper.classList.add("canvasWrapper");
      this.#addLayer(canvasWrapper, "canvasWrapper");
    }
    return canvasWrapper;
  }

  _getRenderingContext(canvasContext, transform) {
    return {
      canvasContext,
      transform,
      viewport: this.viewport,
      annotationMode: this.#annotationMode,
      optionalContentConfigPromise: this._optionalContentConfigPromise,
      annotationCanvasMap: this._annotationCanvasMap,
      pageColors: this.pageColors,
      isEditing: this.#isEditing,
    };
  }

  async draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, l10n, pdfPage, viewport } = this;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      throw new Error("pdfPage is not loaded");
    }

    this.renderingState = RenderingStates.RUNNING;

    const canvasWrapper = this._ensureCanvasWrapper();

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
          this.#addLayer(textLayerDiv, "textLayer");
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
          this.#addLayer(annotationLayerDiv, "annotationLayer");
        },
      });
    }

    const { width, height } = viewport;
    this.#originalViewport = viewport;

    const { canvas, prevCanvas, ctx } = this._createCanvas(newCanvas => {
      // Always inject the canvas as the first element in the wrapper.
      canvasWrapper.prepend(newCanvas);
    });
    canvas.setAttribute("role", "presentation");

    if (!this.outputScale) {
      this.#computeScale();
    }
    const { outputScale } = this;
    this.#hasRestrictedScaling = this.#needsRestrictedScaling;

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

    // Rendering area
    const transform = outputScale.scaled
      ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
      : null;
    const resultPromise = this._drawCanvas(
      this._getRenderingContext(ctx, transform),
      () => {
        prevCanvas?.remove();
        this._resetCanvas();
      },
      renderTask => {
        // Ensure that the thumbnails won't become partially (or fully) blank,
        // for documents that contain interactive form elements.
        this.#useThumbnailCanvas.regularAnnotations =
          !renderTask.separateAnnots;

        this.dispatchPageRendered(
          /* cssTransform */ false,
          /* isDetailView */ false
        );
      }
    ).then(async () => {
      this.structTreeLayer ||= new StructTreeLayerBuilder(
        pdfPage,
        viewport.rawDims
      );

      const textLayerPromise = this.#renderTextLayer();

      if (this.annotationLayer) {
        await this.#renderAnnotationLayer();

        if (this.#enableAutoLinking && this.annotationLayer) {
          await this.#injectLinkAnnotations(textLayerPromise);
        }
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
          this.#addLayer(annotationEditorLayerDiv, "annotationEditorLayer");
        },
      });
      this.#renderAnnotationEditorLayer();
    });

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

    this.dispatchPageRender();

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

export { PDFPageView };
