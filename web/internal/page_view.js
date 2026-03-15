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

import { BreakpointType, DrawOpsView } from "./draw_ops_view.js";
import { CanvasContextDetailsView } from "./canvas_context_details_view.js";
import { DOMCanvasFactory } from "pdfjs/display/canvas_factory.js";
import { SplitView } from "./split_view.js";

// Stepper for pausing/stepping through op list rendering.
// Implements the interface expected by InternalRenderTask (pdfBug mode).
class ViewerStepper {
  #onStepped;

  #continueCallback = null;

  // Pass resumeAt to re-pause at a specific index (e.g. after a zoom).
  constructor(onStepped, resumeAt = null) {
    this.#onStepped = onStepped;
    this.nextBreakPoint = resumeAt ?? this.#findNextAfter(-1);
    this.currentIdx = -1;
  }

  // Called by executeOperatorList when execution reaches nextBreakPoint.
  breakIt(i, continueCallback) {
    this.currentIdx = i;
    this.#continueCallback = continueCallback;
    this.#onStepped(i);
  }

  // Advance one instruction then pause again.
  stepNext() {
    if (!this.#continueCallback) {
      return;
    }
    this.nextBreakPoint = this.currentIdx + 1;
    const cb = this.#continueCallback;
    this.#continueCallback = null;
    cb();
  }

  // Continue until the next breakpoint (or end).
  continueToBreakpoint() {
    if (!this.#continueCallback) {
      return;
    }
    this.nextBreakPoint = this.#findNextAfter(this.currentIdx);
    const cb = this.#continueCallback;
    this.#continueCallback = null;
    cb();
  }

  shouldSkip(i) {
    return (
      globalThis.StepperManager._breakpoints.get(i) === BreakpointType.SKIP
    );
  }

  #findNextAfter(idx) {
    let next = null;
    for (const [bp, type] of globalThis.StepperManager._breakpoints) {
      if (
        type === BreakpointType.PAUSE &&
        bp > idx &&
        (next === null || bp < next)
      ) {
        next = bp;
      }
    }
    return next;
  }

  // Called by InternalRenderTask when the operator list grows (streaming).
  updateOperatorList() {}

  // Called by InternalRenderTask to initialise the stepper.
  init() {}

  // Called by InternalRenderTask after recording bboxes (pdfBug mode).
  setOperatorBBoxes() {}

  getNextBreakPoint() {
    return this.nextBreakPoint;
  }
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.25;

class PageView {
  #pdfDoc = null;

  #gfxStateComp;

  #DebugCanvasFactoryClass;

  #opsView;

  #renderedPage = null;

  #renderScale = null;

  #currentRenderTask = null;

  #currentOpList = null;

  #debugViewGeneration = 0;

  #onMarkLoading;

  #prefersDark;

  #onWindowResize;

  #stepButton;

  #continueButton;

  #zoomLevelEl;

  #zoomOutButton;

  #zoomInButton;

  #redrawButton;

  #highlightCanvas;

  #canvasScrollEl;

  constructor({ onMarkLoading }) {
    this.#onMarkLoading = onMarkLoading;
    this.#prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

    this.#gfxStateComp = new CanvasContextDetailsView(
      document.getElementById("gfx-state-panel")
    );

    this.#stepButton = document.getElementById("step-button");
    this.#continueButton = document.getElementById("continue-button");

    this.#opsView = new DrawOpsView(
      document.getElementById("op-list-panel"),
      document.getElementById("op-detail-panel"),
      {
        onHighlight: i => this.#drawHighlight(i),
        onClearHighlight: () => this.#clearHighlight(),
        prefersDark: this.#prefersDark,
      }
    );

    // Install a StepperManager so InternalRenderTask (pdfBug mode) picks it up.
    // A new instance is set on each redraw; null means no stepping.
    globalThis.StepperManager = {
      get enabled() {
        return globalThis.StepperManager._active !== null;
      },
      _active: null,
      _breakpoints: this.#opsView.breakpoints,
      create() {
        return globalThis.StepperManager._active;
      },
    };

    // Keep --dpr in sync so CSS can scale temp canvases correctly.
    this.#updateDPR();
    this.#onWindowResize = () => this.#updateDPR();
    window.addEventListener("resize", this.#onWindowResize);

    this.#DebugCanvasFactoryClass = this.#makeDebugCanvasFactory();

    this.#setupSplits();

    this.#zoomLevelEl = document.getElementById("zoom-level");
    this.#zoomOutButton = document.getElementById("zoom-out-button");
    this.#zoomInButton = document.getElementById("zoom-in-button");
    this.#redrawButton = document.getElementById("redraw-button");
    this.#highlightCanvas = document.getElementById("highlight-canvas");
    this.#canvasScrollEl = document.getElementById("canvas-scroll");

    this.#setupEventListeners();
  }

  // Expose DebugCanvasFactory class so caller can pass to getDocument().
  get DebugCanvasFactory() {
    return this.#DebugCanvasFactoryClass;
  }

  // Show the debug view for a given page.
  async show(pdfDoc, pageNum) {
    this.#pdfDoc = pdfDoc;
    if (this.#currentOpList === null) {
      await this.#showRenderView(pageNum);
    }
  }

  // Reset all debug state (call when navigating to tree or loading new doc).
  reset() {
    this.#debugViewGeneration++;
    this.#currentRenderTask?.cancel();
    this.#currentRenderTask = null;
    this.#renderedPage?.cleanup();
    this.#renderedPage = this.#renderScale = this.#currentOpList = null;
    this.#clearPausedState();
    this.#opsView.clear();
    this.#gfxStateComp.clear();
    this.#pdfDoc?.canvasFactory.clear();

    const mainCanvas = document.getElementById("render-canvas");
    mainCanvas.width = mainCanvas.height = 0;
    this.#highlightCanvas.width = this.#highlightCanvas.height = 0;

    this.#zoomLevelEl.textContent = "";
    this.#zoomOutButton.disabled = false;
    this.#zoomInButton.disabled = false;
    this.#redrawButton.disabled = true;
  }

  #updateDPR() {
    document.documentElement.style.setProperty(
      "--dpr",
      window.devicePixelRatio || 1
    );
  }

  #makeDebugCanvasFactory() {
    const gfxStateComp = this.#gfxStateComp;
    // Custom CanvasFactory that tracks temporary canvases created during
    // rendering. When stepping, each temporary canvas is shown below the main
    // page canvas to inspect intermediate compositing targets (masks, etc).
    return class DebugCanvasFactory extends DOMCanvasFactory {
      // Wrapper objects currently alive: { canvas, context, wrapper, label }.
      #alive = [];

      // getDocument passes { ownerDocument, enableHWA } to the constructor.
      constructor({ ownerDocument, enableHWA } = {}) {
        super({ ownerDocument: ownerDocument ?? document, enableHWA });
      }

      create(width, height) {
        const canvasAndCtx = super.create(width, height);
        const label = `Temp ${this.#alive.length + 1}`;
        canvasAndCtx.context = gfxStateComp.wrapCanvasGetContext(
          canvasAndCtx.canvas,
          label
        );
        if (globalThis.StepperManager._active !== null) {
          this.#attach(canvasAndCtx, width, height, label);
        }
        return canvasAndCtx;
      }

      reset(canvasAndCtx, width, height) {
        super.reset(canvasAndCtx, width, height);
        const entry = this.#alive.find(e => e.canvasAndCtx === canvasAndCtx);
        if (entry) {
          entry.labelEl.textContent = `${entry.labelEl.textContent.split("—")[0].trim()} — ${width}×${height}`;
        }
      }

      destroy(canvasAndCtx) {
        const idx = this.#alive.findIndex(e => e.canvasAndCtx === canvasAndCtx);
        if (idx !== -1) {
          this.#alive[idx].wrapper.remove();
          this.#alive.splice(idx, 1);
        }
        super.destroy(canvasAndCtx);
      }

      // Show all currently-alive canvases (called when stepping starts).
      showAll() {
        for (const entry of this.#alive) {
          if (!entry.wrapper.isConnected) {
            this.#attachWrapper(entry);
          }
        }
      }

      // Remove all temporary canvases from the DOM and clear tracking state.
      clear() {
        for (const entry of this.#alive) {
          entry.wrapper.remove();
          entry.canvasAndCtx.canvas.width = 0;
          entry.canvasAndCtx.canvas.height = 0;
        }
        this.#alive.length = 0;
      }

      #attach(canvasAndCtx, width, height, ctxLabel) {
        const wrapper = document.createElement("div");
        wrapper.className = "temp-canvas-wrapper";
        wrapper.addEventListener("click", () =>
          gfxStateComp.scrollToSection(ctxLabel)
        );
        const labelEl = document.createElement("div");
        labelEl.className = "temp-canvas-label";
        labelEl.textContent = `${ctxLabel} — ${width}×${height}`;
        wrapper.append(labelEl, canvasAndCtx.canvas);
        const entry = { canvasAndCtx, wrapper, labelEl };
        this.#alive.push(entry);
        this.#attachWrapper(entry);
      }

      #attachWrapper(entry) {
        document.getElementById("canvas-scroll").append(entry.wrapper);
      }
    };
  }

  #setupSplits() {
    // Build the three SplitView instances that make up the debug view layout.
    // Inner splits are created first so outer splits can wrap the new
    // containers.
    // Layout: splitHor(splitVer(splitHor(op-list, gfx-state), op-detail),
    // canvas)

    // Inner row split: op-list on the left, gfx-state on the right (hidden by
    // default).
    const opTopSplit = new SplitView(
      document.getElementById("op-list-panel"),
      document.getElementById("gfx-state-panel"),
      { direction: "row", minSize: 60 }
    );

    // Column split: op-list+gfx-state on top, op-detail on the bottom.
    const instructionsSplit = new SplitView(
      opTopSplit.element,
      document.getElementById("op-detail-panel"),
      { direction: "column", minSize: 40 }
    );

    // Outer row split: instructions column on the left, canvas on the right.
    const renderSplit = new SplitView(
      instructionsSplit.element,
      document.getElementById("canvas-panel"),
      { direction: "row", minSize: 100, onResize: () => this.#renderCanvas() }
    );

    const renderPanels = document.getElementById("render-panels");
    renderPanels.replaceWith(renderSplit.element);
    renderSplit.element.id = "render-panels";
  }

  #setupEventListeners() {
    this.#zoomInButton.addEventListener("click", () =>
      this.#zoomRenderCanvas(
        Math.min(
          MAX_ZOOM,
          (this.#renderScale ?? this.#getFitScale()) * ZOOM_STEP
        )
      )
    );
    this.#zoomOutButton.addEventListener("click", () =>
      this.#zoomRenderCanvas(
        Math.max(
          MIN_ZOOM,
          (this.#renderScale ?? this.#getFitScale()) / ZOOM_STEP
        )
      )
    );

    this.#redrawButton.addEventListener("click", async () => {
      if (!this.#renderedPage || !this.#currentOpList) {
        return;
      }
      this.#clearPausedState();
      // Reset recorded bboxes so they get re-recorded for the modified op
      // list.
      this.#renderedPage.recordedBBoxes = null;
      if (this.#opsView.breakpoints.size > 0) {
        globalThis.StepperManager._active = new ViewerStepper(i =>
          this.#onStepped(i)
        );
      }
      await this.#renderCanvas();
    });

    this.#stepButton.addEventListener("click", () => {
      globalThis.StepperManager._active?.stepNext();
    });

    this.#continueButton.addEventListener("click", () => {
      globalThis.StepperManager._active?.continueToBreakpoint();
    });

    document.addEventListener("keydown", e => {
      if (
        e.target.matches("input, textarea, [contenteditable]") ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      ) {
        return;
      }
      const stepper = globalThis.StepperManager._active;
      if (!stepper) {
        return;
      }
      if (e.key === "s") {
        e.preventDefault();
        stepper.stepNext();
      } else if (e.key === "c") {
        e.preventDefault();
        stepper.continueToBreakpoint();
      }
    });
  }

  #onStepped(i) {
    this.#opsView.markPaused(i);
    this.#stepButton.disabled = this.#continueButton.disabled = false;
    this.#gfxStateComp.build();
  }

  #clearPausedState() {
    this.#opsView.clearPaused();
    globalThis.StepperManager._active = null;
    this.#stepButton.disabled = this.#continueButton.disabled = true;
    this.#gfxStateComp.hide();
  }

  #getFitScale() {
    return (
      (this.#canvasScrollEl.clientWidth - 24) /
      this.#renderedPage.getViewport({ scale: 1 }).width
    );
  }

  #zoomRenderCanvas(newScale) {
    // If zoomed again while a re-render is already running (not yet re-paused),
    // pausedAtIdx is null but the active stepper still knows the target index.
    const stepper = globalThis.StepperManager._active;
    let resumeAt = null;
    if (stepper !== null) {
      resumeAt =
        stepper.currentIdx >= 0 ? stepper.currentIdx : stepper.nextBreakPoint;
    }
    this.#clearPausedState();
    this.#renderScale = newScale;
    if (resumeAt !== null) {
      globalThis.StepperManager._active = new ViewerStepper(
        i => this.#onStepped(i),
        resumeAt
      );
    }
    return this.#renderCanvas();
  }

  async #renderCanvas() {
    if (!this.#renderedPage) {
      return null;
    }

    // Cancel any in-progress render before starting a new one.
    this.#currentRenderTask?.cancel();
    this.#currentRenderTask = null;

    const highlight = this.#highlightCanvas;
    const dpr = window.devicePixelRatio || 1;
    const scale = this.#renderScale ?? this.#getFitScale();
    this.#zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
    this.#zoomOutButton.disabled = scale <= MIN_ZOOM;
    this.#zoomInButton.disabled = scale >= MAX_ZOOM;
    const viewport = this.#renderedPage.getViewport({ scale: scale * dpr });
    const cssW = `${viewport.width / dpr}px`;
    const cssH = `${viewport.height / dpr}px`;

    // Size the highlight canvas immediately so it stays in sync.
    highlight.width = viewport.width;
    highlight.height = viewport.height;
    highlight.style.width = cssW;
    highlight.style.height = cssH;

    // Render into a fresh canvas. When stepping, insert it into the DOM
    // immediately so the user sees each instruction drawn live. For normal
    // renders, swap only after completion so there's no blank flash.
    const newCanvas = document.createElement("canvas");
    newCanvas.id = "render-canvas";
    newCanvas.width = viewport.width;
    newCanvas.height = viewport.height;
    newCanvas.style.width = cssW;
    newCanvas.style.height = cssH;
    newCanvas.addEventListener("click", () =>
      this.#gfxStateComp.scrollToSection("Page")
    );

    const isStepping = globalThis.StepperManager._active !== null;
    if (isStepping) {
      const oldCanvas = document.getElementById("render-canvas");
      oldCanvas.width = oldCanvas.height = 0;
      oldCanvas.replaceWith(newCanvas);
      // Show any temporary canvases that survived from the previous render
      // (e.g. after a zoom-while-stepping, the factory may already have
      // entries).
      this.#pdfDoc?.canvasFactory.showAll();
    } else {
      // Starting a fresh non-stepping render: remove leftover temp canvases.
      this.#pdfDoc?.canvasFactory.clear();
    }

    // Record bboxes only on the first render; they stay valid for subsequent
    // re-renders because BBoxReader returns normalised [0, 1] fractions.
    const firstRender = !this.#renderedPage.recordedBBoxes;
    const renderTask = this.#renderedPage.render({
      canvasContext: this.#gfxStateComp.wrapCanvasGetContext(newCanvas, "Page"),
      viewport,
      recordOperations: firstRender,
    });
    this.#currentRenderTask = renderTask;

    try {
      await renderTask.promise;
    } catch (err) {
      if (err?.name === "RenderingCancelledException") {
        return null;
      }
      throw err;
    } finally {
      if (this.#currentRenderTask === renderTask) {
        this.#currentRenderTask = null;
      }
    }

    // Render completed fully — stepping session is over.
    this.#clearPausedState();
    this.#pdfDoc?.canvasFactory.clear();
    this.#redrawButton.disabled = false;

    if (!isStepping) {
      // Swap the completed canvas in, replacing the previous one. Zero out the
      // old canvas dimensions to release its GPU memory.
      const oldCanvas = document.getElementById("render-canvas");
      oldCanvas.width = oldCanvas.height = 0;
      oldCanvas.replaceWith(newCanvas);
    }

    // Return the task on first render so the caller can extract the operator
    // list without a separate getOperatorList() call (dev/testing builds only).
    return firstRender ? renderTask : null;
  }

  #drawHighlight(opIdx) {
    const bboxes = this.#renderedPage?.recordedBBoxes;
    if (!bboxes || opIdx >= bboxes.length || bboxes.isEmpty(opIdx)) {
      this.#clearHighlight();
      return;
    }
    const canvas = document.getElementById("render-canvas");
    const highlight = this.#highlightCanvas;
    const cssW = parseFloat(canvas.style.width);
    const cssH = parseFloat(canvas.style.height);
    const x = bboxes.minX(opIdx) * cssW;
    const y = bboxes.minY(opIdx) * cssH;
    const w = (bboxes.maxX(opIdx) - bboxes.minX(opIdx)) * cssW;
    const h = (bboxes.maxY(opIdx) - bboxes.minY(opIdx)) * cssH;
    const dpr = window.devicePixelRatio || 1;
    const ctx = highlight.getContext("2d");
    ctx.clearRect(0, 0, highlight.width, highlight.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "rgba(255, 165, 0, 0.3)";
    ctx.strokeStyle = "rgba(255, 140, 0, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  #clearHighlight() {
    this.#highlightCanvas
      .getContext("2d")
      .clearRect(
        0,
        0,
        this.#highlightCanvas.width,
        this.#highlightCanvas.height
      );
  }

  async #showRenderView(pageNum) {
    const generation = this.#debugViewGeneration;
    const opListEl = document.getElementById("op-list");

    const spinner = document.createElement("div");
    spinner.role = "status";
    spinner.textContent = "Loading…";
    opListEl.replaceChildren(spinner);
    document.getElementById("op-detail-panel").replaceChildren();

    this.#renderScale = null;
    this.#onMarkLoading(1);
    try {
      this.#renderedPage = await this.#pdfDoc.getPage(pageNum);
      if (this.#debugViewGeneration !== generation) {
        return;
      }

      // Render the page (records bboxes too). Reuse the operator list from
      // the render task when available (dev/testing builds); fall back to a
      // separate getOperatorList() call otherwise.
      const renderTask = await this.#renderCanvas();
      if (this.#debugViewGeneration !== generation) {
        return;
      }
      this.#currentOpList =
        renderTask?.getOperatorList?.() ??
        (await this.#renderedPage.getOperatorList());
      if (this.#debugViewGeneration !== generation) {
        return;
      }
      this.#opsView.load(this.#currentOpList, this.#renderedPage);
    } catch (err) {
      const errEl = document.createElement("div");
      errEl.role = "alert";
      errEl.textContent = `Error: ${err.message}`;
      opListEl.replaceChildren(errEl);
    } finally {
      this.#onMarkLoading(-1);
    }
  }
}

export { PageView };
