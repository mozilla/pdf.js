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

import {
  approximateFraction,
  CSS_UNITS,
  DEFAULT_SCALE,
  getOutputScale,
  NullL10n,
  RendererType,
  roundToDivide,
  TextLayerMode,
} from "./ui_utils.js";
import {
  createPromiseCapability,
  RenderingCancelledException,
  SVGGraphics,
} from "pdfjs-lib";
import { RenderingStates } from "./pdf_rendering_queue.js";
import { viewerCompatibilityParams } from "./viewer_compatibility.js";

/**
 * @typedef {Object} PDFPageViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} id - The page unique ID (normally its number).
 * @property {number} scale - The page scale display.
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {AnnotationStorage} [annotationStorage] - Storage for annotation
 *   data in forms. The default value is `null`.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that is resolved with an {@link OptionalContentConfig} instance.
 *   The default value is `null`.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IPDFTextLayerFactory} textLayerFactory
 * @property {number} [textLayerMode] - Controls if the text layer used for
 *   selection and searching is created, and if the improved text selection
 *   behaviour is enabled. The constants from {TextLayerMode} should be used.
 *   The default value is `TextLayerMode.ENABLE`.
 * @property {IPDFAnnotationLayerFactory} annotationLayerFactory
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderInteractiveForms - Turns on rendering of
 *   interactive form elements. The default value is `true`.
 * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
 * @property {boolean} [enableWebGL] - Enables WebGL accelerated rendering for
 *   some operations. The default value is `false`.
 * @property {boolean} [useOnlyCssZoom] - Enables CSS only zooming. The default
 *   value is `false`.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use -1 for no limit. The default value
 *   is 4096 * 4096 (16 mega-pixels).
 * @property {IL10n} l10n - Localization service.
 */

const MAX_CANVAS_PIXELS = viewerCompatibilityParams.maxCanvasPixels || 16777216;

/**
 * @implements {IRenderableView}
 */
class PDFPageView {
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
    this._annotationStorage = options.annotationStorage || null;
    this._optionalContentConfigPromise =
      options.optionalContentConfigPromise || null;
    this.hasRestrictedScaling = false;
    this.textLayerMode = Number.isInteger(options.textLayerMode)
      ? options.textLayerMode
      : TextLayerMode.ENABLE;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.renderInteractiveForms =
      typeof options.renderInteractiveForms === "boolean"
        ? options.renderInteractiveForms
        : true;
    this.useOnlyCssZoom = options.useOnlyCssZoom || false;
    this.maxCanvasPixels = options.maxCanvasPixels || MAX_CANVAS_PIXELS;

    this.eventBus = options.eventBus;
    this.renderingQueue = options.renderingQueue;
    this.textLayerFactory = options.textLayerFactory;
    this.annotationLayerFactory = options.annotationLayerFactory;
    this.renderer = options.renderer || RendererType.CANVAS;
    this.enableWebGL = options.enableWebGL || false;
    this.l10n = options.l10n || NullL10n;

    this.paintTask = null;
    this.paintedViewportMap = new WeakMap();
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;
    this._renderError = null;

    this.annotationLayer = null;
    this.textLayer = null;
    this.zoomLayer = null;

    const div = document.createElement("div");
    div.className = "page";
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";
    div.setAttribute("data-page-number", this.id);
    this.div = div;

    container.appendChild(div);
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: this.scale * CSS_UNITS,
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

  reset(keepZoomLayer = false, keepAnnotations = false) {
    this.cancelRendering(keepAnnotations);
    this.renderingState = RenderingStates.INITIAL;

    const div = this.div;
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";

    const childNodes = div.childNodes;
    const currentZoomLayerNode = (keepZoomLayer && this.zoomLayer) || null;
    const currentAnnotationNode =
      (keepAnnotations && this.annotationLayer && this.annotationLayer.div) ||
      null;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];
      if (currentZoomLayerNode === node || currentAnnotationNode === node) {
        continue;
      }
      div.removeChild(node);
    }
    div.removeAttribute("data-loaded");

    if (currentAnnotationNode) {
      // Hide the annotation layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.annotationLayer.hide();
    } else if (this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }

    if (!currentZoomLayerNode) {
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
    if (this.svg) {
      this.paintedViewportMap.delete(this.svg);
      delete this.svg;
    }

    this.loadingIconDiv = document.createElement("div");
    this.loadingIconDiv.className = "loadingIcon";
    div.appendChild(this.loadingIconDiv);
  }

  update(scale, rotation, optionalContentConfigPromise = null) {
    this.scale = scale || this.scale;
    // The rotation may be zero.
    if (typeof rotation !== "undefined") {
      this.rotation = rotation;
    }
    if (optionalContentConfigPromise instanceof Promise) {
      this._optionalContentConfigPromise = optionalContentConfigPromise;
    }

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * CSS_UNITS,
      rotation: totalRotation,
    });

    if (this.svg) {
      this.cssTransform(this.svg, true);

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
        this.cssTransform(this.canvas, true);

        this.eventBus.dispatch("pagerendered", {
          source: this,
          pageNumber: this.id,
          cssTransform: true,
          timestamp: performance.now(),
          error: this._renderError,
        });
        return;
      }
      if (!this.zoomLayer && !this.canvas.hasAttribute("hidden")) {
        this.zoomLayer = this.canvas.parentNode;
        this.zoomLayer.style.position = "absolute";
      }
    }
    if (this.zoomLayer) {
      this.cssTransform(this.zoomLayer.firstChild);
    }
    this.reset(/* keepZoomLayer = */ true, /* keepAnnotations = */ true);
  }

  /**
   * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
   *              rather than calling this one directly.
   */
  cancelRendering(keepAnnotations = false) {
    if (this.paintTask) {
      this.paintTask.cancel();
      this.paintTask = null;
    }
    this.resume = null;

    if (this.textLayer) {
      this.textLayer.cancel();
      this.textLayer = null;
    }
    if (!keepAnnotations && this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }
  }

  cssTransform(target, redrawAnnotations = false) {
    // Scale target (canvas or svg), its wrapper and page container.
    const width = this.viewport.width;
    const height = this.viewport.height;
    const div = this.div;
    target.style.width = target.parentNode.style.width = div.style.width =
      Math.floor(width) + "px";
    target.style.height = target.parentNode.style.height = div.style.height =
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

    if (redrawAnnotations && this.annotationLayer) {
      this._renderAnnotationLayer();
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

  draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, pdfPage } = this;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        div.removeChild(this.loadingIconDiv);
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

    if (this.annotationLayer && this.annotationLayer.div) {
      // The annotation layer needs to stay on top.
      div.insertBefore(canvasWrapper, this.annotationLayer.div);
    } else {
      div.appendChild(canvasWrapper);
    }

    let textLayer = null;
    if (this.textLayerMode !== TextLayerMode.DISABLE && this.textLayerFactory) {
      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.width = canvasWrapper.style.width;
      textLayerDiv.style.height = canvasWrapper.style.height;
      if (this.annotationLayer && this.annotationLayer.div) {
        // The annotation layer needs to stay on top.
        div.insertBefore(textLayerDiv, this.annotationLayer.div);
      } else {
        div.appendChild(textLayerDiv);
      }

      textLayer = this.textLayerFactory.createTextLayerBuilder(
        textLayerDiv,
        this.id - 1,
        this.viewport,
        this.textLayerMode === TextLayerMode.ENABLE_ENHANCE,
        this.eventBus
      );
    }
    this.textLayer = textLayer;

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
        div.removeChild(this.loadingIconDiv);
        delete this.loadingIconDiv;
      }
      this._resetZoomLayer(/* removeFromDOM = */ true);

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
      this.renderer === RendererType.SVG
        ? this.paintOnSvg(canvasWrapper)
        : this.paintOnCanvas(canvasWrapper);
    paintTask.onRenderContinue = renderContinueCallback;
    this.paintTask = paintTask;

    const resultPromise = paintTask.promise.then(
      function () {
        return finishPaintTask(null).then(function () {
          if (textLayer) {
            const readableStream = pdfPage.streamTextContent({
              normalizeWhitespace: true,
            });
            textLayer.setTextContentStream(readableStream);
            textLayer.render();
          }
        });
      },
      function (reason) {
        return finishPaintTask(reason);
      }
    );

    if (this.annotationLayerFactory) {
      if (!this.annotationLayer) {
        this.annotationLayer = this.annotationLayerFactory.createAnnotationLayerBuilder(
          div,
          pdfPage,
          this._annotationStorage,
          this.imageResourcesPath,
          this.renderInteractiveForms,
          this.l10n
        );
      }
      this._renderAnnotationLayer();
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
    };

    const viewport = this.viewport;
    const canvas = document.createElement("canvas");
    this.l10n
      .get("page_canvas", { page: this.id }, "Page {{page}}")
      .then(msg => {
        canvas.setAttribute("aria-label", msg);
      });

    // Keep the canvas hidden until the first draw callback, or until drawing
    // is complete when `!this.renderingQueue`, to prevent black flickering.
    canvas.setAttribute("hidden", "hidden");
    let isCanvasHidden = true;
    const showCanvas = function () {
      if (isCanvasHidden) {
        canvas.removeAttribute("hidden");
        isCanvasHidden = false;
      }
    };

    canvasWrapper.appendChild(canvas);
    this.canvas = canvas;

    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("MOZCENTRAL || GENERIC")
    ) {
      canvas.mozOpaque = true;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    const outputScale = getOutputScale(ctx);
    this.outputScale = outputScale;

    if (this.useOnlyCssZoom) {
      const actualSizeViewport = viewport.clone({ scale: CSS_UNITS });
      // Use a scale that makes the canvas have the originally intended size
      // of the page.
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
      outputScale.scaled = true;
    }

    if (this.maxCanvasPixels > 0) {
      const pixelsInViewport = viewport.width * viewport.height;
      const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        outputScale.scaled = true;
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
    const transform = !outputScale.scaled
      ? null
      : [outputScale.sx, 0, 0, outputScale.sy, 0, 0];
    const renderContext = {
      canvasContext: ctx,
      transform,
      viewport: this.viewport,
      enableWebGL: this.enableWebGL,
      renderInteractiveForms: this.renderInteractiveForms,
      optionalContentConfigPromise: this._optionalContentConfigPromise,
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
        renderCapability.resolve(undefined);
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
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("MOZCENTRAL || CHROME")
    ) {
      // Return a mock object, to prevent errors such as e.g.
      // "TypeError: paintTask.promise is undefined".
      return {
        promise: Promise.reject(new Error("SVG rendering is not supported.")),
        onRenderContinue(cont) {},
        cancel() {},
      };
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
    const actualSizeViewport = this.viewport.clone({ scale: CSS_UNITS });
    const promise = pdfPage.getOperatorList().then(opList => {
      ensureNotCancelled();
      const svgGfx = new SVGGraphics(pdfPage.commonObjs, pdfPage.objs);
      return svgGfx.getSVG(opList, actualSizeViewport).then(svg => {
        ensureNotCancelled();
        this.svg = svg;
        this.paintedViewportMap.set(svg, actualSizeViewport);

        svg.style.width = wrapper.style.width;
        svg.style.height = wrapper.style.height;
        this.renderingState = RenderingStates.FINISHED;
        wrapper.appendChild(svg);
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
}

export { PDFPageView };
