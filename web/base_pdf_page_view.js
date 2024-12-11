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

import { RenderingCancelledException } from "pdfjs-lib";
import { RenderingStates } from "./ui_utils.js";

class BasePDFPageView {
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

  _createCanvas(onShow, hideUntilComplete = false) {
    const { pageColors } = this;
    const hasHCM = !!(pageColors?.background && pageColors?.foreground);
    const prevCanvas = this.canvas;

    // In HCM, a final filter is applied on the canvas which means that
    // before it's applied we've normal colors. Consequently, to avoid to
    // have a final flash we just display it once all the drawing is done.
    const updateOnFirstShow = !prevCanvas && !hasHCM && !hideUntilComplete;

    const canvas = (this.canvas = document.createElement("canvas"));

    this.#showCanvas = isLastShow => {
      if (updateOnFirstShow) {
        // Don't add the canvas until the first draw callback, or until
        // drawing is complete when `!this.renderingQueue`, to prevent black
        // flickering.
        onShow(canvas);
        this.#showCanvas = null;
        return;
      }
      if (!isLastShow) {
        return;
      }

      if (prevCanvas) {
        prevCanvas.replaceWith(canvas);
        prevCanvas.width = prevCanvas.height = 0;
      } else {
        onShow(canvas);
      }
    };

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: !this.#enableHWA,
    });

    return { canvas, prevCanvas, ctx };
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

  _resetCanvas() {
    const { canvas } = this;
    if (!canvas) {
      return;
    }
    canvas.remove();
    canvas.width = canvas.height = 0;
    this.canvas = null;
  }

  async _drawCanvas(options, onCancel, onFinish) {
    const renderTask = (this.renderTask = this.pdfPage.render(options));
    renderTask.onContinue = this.#renderContinueCallback;
    renderTask.onError = error => {
      if (error instanceof RenderingCancelledException) {
        onCancel();
        this.#renderError = null;
      }
    };

    let error = null;
    try {
      await renderTask.promise;
      this.#showCanvas?.(true);
    } catch (e) {
      error = e;
      // When zooming with a `drawingDelay` set, avoid temporarily showing
      // a black canvas if rendering was cancelled before the `onContinue`-
      // callback had been invoked at least once.
      if (error instanceof RenderingCancelledException) {
        return;
      }

      this.#showCanvas?.(true);
    } finally {
      // The renderTask may have been replaced by a new one, so only remove
      // the reference to the renderTask if it matches the one that is
      // triggering this callback.
      if (renderTask === this.renderTask) {
        this.renderTask = null;
      }
    }
    this.#renderError = error;

    this.renderingState = RenderingStates.FINISHED;

    onFinish(renderTask);

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

  dispatchPageRender() {
    this.eventBus.dispatch("pagerender", {
      source: this,
      pageNumber: this.id,
    });
  }

  dispatchPageRendered(cssTransform, isDetailView) {
    this.eventBus.dispatch("pagerendered", {
      source: this,
      pageNumber: this.id,
      cssTransform,
      isDetailView,
      timestamp: performance.now(),
      error: this.#renderError,
    });
  }
}

export { BasePDFPageView };
