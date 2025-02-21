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

import { BasePDFPageView } from "./base_pdf_page_view.js";
import { RenderingStates } from "./ui_utils.js";

/** @typedef {import("./interfaces").IRenderableView} IRenderableView */

/**
 * @implements {IRenderableView}
 */
class PDFPageDetailView extends BasePDFPageView {
  #detailArea = null;

  /**
   * @type {boolean} True when the last rendering attempt of the view was
   *                 cancelled due to a `.reset()` call. This will happen when
   *                 the visible area changes so much during the rendering that
   *                 we need to cancel the rendering and start over.
   */
  renderingCancelled = false;

  constructor({ pageView }) {
    super(pageView);

    this.pageView = pageView;
    this.renderingId = "detail" + this.id;

    this.div = pageView.div;
  }

  setPdfPage(pdfPage) {
    this.pageView.setPdfPage(pdfPage);
  }

  get pdfPage() {
    return this.pageView.pdfPage;
  }

  get renderingState() {
    return super.renderingState;
  }

  set renderingState(value) {
    this.renderingCancelled = false;
    super.renderingState = value;
  }

  reset({ keepCanvas = false } = {}) {
    const renderingCancelled =
      this.renderingCancelled ||
      this.renderingState === RenderingStates.RUNNING ||
      this.renderingState === RenderingStates.PAUSED;
    this.cancelRendering();
    this.renderingState = RenderingStates.INITIAL;
    this.renderingCancelled = renderingCancelled;

    if (!keepCanvas) {
      this._resetCanvas();
    }
  }

  #shouldRenderDifferentArea(visibleArea) {
    if (!this.#detailArea) {
      return true;
    }

    const minDetailX = this.#detailArea.minX;
    const minDetailY = this.#detailArea.minY;
    const maxDetailX = this.#detailArea.width + minDetailX;
    const maxDetailY = this.#detailArea.height + minDetailY;

    if (
      visibleArea.minX < minDetailX ||
      visibleArea.minY < minDetailY ||
      visibleArea.maxX > maxDetailX ||
      visibleArea.maxY > maxDetailY
    ) {
      return true;
    }

    const {
      width: maxWidth,
      height: maxHeight,
      scale,
    } = this.pageView.viewport;

    if (this.#detailArea.scale !== scale) {
      return true;
    }

    const paddingLeftSize = visibleArea.minX - minDetailX;
    const paddingRightSize = maxDetailX - visibleArea.maxX;
    const paddingTopSize = visibleArea.minY - minDetailY;
    const paddingBottomSize = maxDetailY - visibleArea.maxY;

    // If the user is moving in any direction such that the remaining area
    // rendered outside of the screen is less than MOVEMENT_THRESHOLD of the
    // padding we render on each side, trigger a re-render. This is so that if
    // the user then keeps scrolling in that direction, we have a chance of
    // finishing rendering the new detail before they get past the rendered
    // area.

    const MOVEMENT_THRESHOLD = 0.5;
    const ratio = (1 + MOVEMENT_THRESHOLD) / MOVEMENT_THRESHOLD;

    if (
      (minDetailX > 0 && paddingRightSize / paddingLeftSize > ratio) ||
      (maxDetailX < maxWidth && paddingLeftSize / paddingRightSize > ratio) ||
      (minDetailY > 0 && paddingBottomSize / paddingTopSize > ratio) ||
      (maxDetailY < maxHeight && paddingTopSize / paddingBottomSize > ratio)
    ) {
      return true;
    }

    return false;
  }

  update({ visibleArea = null, underlyingViewUpdated = false } = {}) {
    if (underlyingViewUpdated) {
      this.cancelRendering();
      this.renderingState = RenderingStates.INITIAL;
      return;
    }

    if (!this.#shouldRenderDifferentArea(visibleArea)) {
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
      // in this case. It's quite rare to hit it though, because usually
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

    this.#detailArea = { minX, minY, width, height, scale: viewport.scale };

    this.reset({ keepCanvas: true });
  }

  async draw() {
    // The PDFPageView might have already dropped this PDFPageDetailView. In
    // that case, simply do nothing.
    if (this.pageView.detailView !== this) {
      return undefined;
    }

    // If there is already the lower resolution canvas behind,
    // we don't show the new one until when it's fully ready.
    const hideUntilComplete =
      this.pageView.renderingState === RenderingStates.FINISHED ||
      this.renderingState === RenderingStates.FINISHED;

    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset(); // Ensure that we reset all state to prevent issues.
    }
    const { div, pdfPage, viewport } = this.pageView;

    if (!pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      throw new Error("pdfPage is not loaded");
    }

    this.renderingState = RenderingStates.RUNNING;

    const canvasWrapper = this.pageView._ensureCanvasWrapper();

    const { canvas, prevCanvas, ctx } = this._createCanvas(newCanvas => {
      // If there is already the background canvas, inject this new canvas
      // after it. We cannot simply use .append because all canvases must
      // be before the SVG elements used for drawings.
      if (canvasWrapper.firstElementChild?.tagName === "CANVAS") {
        canvasWrapper.firstElementChild.after(newCanvas);
      } else {
        canvasWrapper.prepend(newCanvas);
      }
    }, hideUntilComplete);
    canvas.setAttribute("aria-hidden", "true");

    const { width, height } = viewport;

    const area = this.#detailArea;

    const { devicePixelRatio = 1 } = window;
    const transform = [
      devicePixelRatio,
      0,
      0,
      devicePixelRatio,
      -area.minX * devicePixelRatio,
      -area.minY * devicePixelRatio,
    ];

    canvas.width = area.width * devicePixelRatio;
    canvas.height = area.height * devicePixelRatio;
    const { style } = canvas;
    style.width = `${(area.width * 100) / width}%`;
    style.height = `${(area.height * 100) / height}%`;
    style.top = `${(area.minY * 100) / height}%`;
    style.left = `${(area.minX * 100) / width}%`;

    const renderingPromise = this._drawCanvas(
      this.pageView._getRenderingContext(ctx, transform),
      () => {
        // If the rendering is cancelled, keep the old canvas visible.
        this.canvas?.remove();
        this.canvas = prevCanvas;
      },
      () => {
        this.dispatchPageRendered(
          /* cssTransform */ false,
          /* isDetailView */ true
        );
      }
    );

    div.setAttribute("data-loaded", true);

    this.dispatchPageRender();

    return renderingPromise;
  }
}

export { PDFPageDetailView };
