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

import {
  BreakpointType,
  DrawOpsView,
  TEXT_EXEC_OP_IDS,
  TEXT_OP_IDS,
} from "./draw_ops_view.js";
import { OPS, TextLayer } from "pdfjs-lib";
import { CanvasContextDetailsView } from "./canvas_context_details_view.js";
import { DOMCanvasFactory } from "pdfjs/display/canvas_factory.js";
import { FontView } from "./font_view.js";
import { SplitView } from "./split_view.js";

// Enable font inspection so TextLayer sets data-font-name on each span.
// fontAdded is called by FontFaceObject when loading fonts (via the pdfBug
// inspectFont callback in api.js) — we don't need it here, but it must exist
// to avoid a TypeError that would disrupt font loading and break canvas
// rendering.
globalThis.FontInspector = { enabled: true, fontAdded() {} };

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
  // In text-only mode, skip forward to the next text op.
  stepNext() {
    if (!this.#continueCallback) {
      return;
    }
    let next = this.currentIdx + 1;
    if (globalThis.StepperManager._textOnly) {
      const count = globalThis.StepperManager._opCount();
      while (next < count && !globalThis.StepperManager._isTextOp(next)) {
        next++;
      }
      if (next >= count) {
        next = null; // no more text ops; let rendering run to completion
      }
    }
    this.nextBreakPoint = next;
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
      globalThis.StepperManager._breakpoints.get(i) === BreakpointType.SKIP ||
      (globalThis.StepperManager._textOnly &&
        !globalThis.StepperManager._isTextExecOp(i))
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

  #textFilterButton;

  #textLayerColorInput;

  #textSpanBorderButton;

  #textFilter = false;

  #highlightCanvas;

  #canvasScrollEl;

  #textLayerEl = null;

  #textLayerInstance = null;

  #fontView;

  #fontViewButton;

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

    this.#fontView = new FontView(document.getElementById("font-panel"), {
      onSelect: loadedName => {
        if (!this.#textLayerEl) {
          return;
        }
        for (const span of this.#textLayerEl.querySelectorAll(
          ".font-highlighted"
        )) {
          span.classList.remove("font-highlighted");
        }
        if (loadedName) {
          for (const span of this.#textLayerEl.querySelectorAll(
            `[data-font-name="${CSS.escape(loadedName)}"]`
          )) {
            span.classList.add("font-highlighted");
          }
        }
      },
    });
    this.#fontViewButton = document.getElementById("font-view-button");
    globalThis.FontInspector.fontAdded = font => this.#fontView.fontAdded(font);

    // Install a StepperManager so InternalRenderTask (pdfBug mode) picks it up.
    // A new instance is set on each redraw; null means no stepping.
    globalThis.StepperManager = {
      get enabled() {
        return globalThis.StepperManager._active !== null;
      },
      _active: null,
      _breakpoints: this.#opsView.breakpoints,
      _textOnly: false,
      // Returns true when op index i is a text op shown in the filtered list.
      _isTextOp: i => TEXT_OP_IDS.has(this.#currentOpList?.fnArray[i]),
      // Returns true when op index i must be executed (not skipped) in text
      // mode.
      _isTextExecOp: i => TEXT_EXEC_OP_IDS.has(this.#currentOpList?.fnArray[i]),
      // Returns the total number of ops in the current op list.
      _opCount: () => this.#currentOpList?.fnArray.length ?? 0,
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
    this.#textFilterButton = document.getElementById("text-filter-button");
    this.#textLayerColorInput = document.getElementById(
      "text-layer-color-input"
    );
    this.#textSpanBorderButton = document.getElementById(
      "text-span-border-button"
    );
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
    this.#cancelTextLayer();
    this.#currentRenderTask?.cancel();
    this.#currentRenderTask = null;
    this.#renderedPage?.cleanup();
    this.#renderedPage = this.#renderScale = this.#currentOpList = null;
    this.#clearPausedState();
    this.#opsView.clear();
    this.#fontView.clear();
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
        const checker = document.createElement("div");
        checker.className = "canvas-checker";
        checker.append(canvasAndCtx.canvas);
        wrapper.append(labelEl, checker);
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

    // Row split: canvas on the left, font panel on the right (hidden by
    // default).
    const canvasFontSplit = new SplitView(
      document.getElementById("canvas-panel"),
      document.getElementById("font-panel"),
      { direction: "row", minSize: 150, onResize: () => this.#rerenderCanvas() }
    );

    // Outer row split: instructions column on the left, canvas+font on the
    // right.
    const renderSplit = new SplitView(
      instructionsSplit.element,
      canvasFontSplit.element,
      { direction: "row", minSize: 100, onResize: () => this.#rerenderCanvas() }
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
      if (this.#textFilter || this.#opsView.breakpoints.size > 0) {
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
      if (globalThis.StepperManager._active) {
        this.#gfxStateComp.freeze();
        globalThis.StepperManager._active.continueToBreakpoint();
      }
    });

    const TEXT_LAYER_COLOR_KEY = "debugger.textLayerColor";
    const DEFAULT_TEXT_LAYER_COLOR = "#c03030";
    const applyColor = color => {
      this.#textLayerColorInput.value = color;
      document.documentElement.style.setProperty("--text-layer-color", color);
    };

    applyColor(
      localStorage.getItem(TEXT_LAYER_COLOR_KEY) ?? DEFAULT_TEXT_LAYER_COLOR
    );

    document
      .getElementById("text-layer-color-button")
      .addEventListener("click", () => this.#textLayerColorInput.click());

    this.#textLayerColorInput.addEventListener("input", () => {
      const color = this.#textLayerColorInput.value;
      applyColor(color);
      localStorage.setItem(TEXT_LAYER_COLOR_KEY, color);
    });

    const SPAN_BORDERS_KEY = "debugger.spanBorders";
    const applySpanBorders = enabled => {
      this.#textSpanBorderButton.setAttribute("aria-pressed", String(enabled));
      document
        .getElementById("canvas-wrapper")
        .classList.toggle("show-span-borders", enabled);
    };

    applySpanBorders(localStorage.getItem(SPAN_BORDERS_KEY) === "true");

    this.#textSpanBorderButton.addEventListener("click", () => {
      const next =
        this.#textSpanBorderButton.getAttribute("aria-pressed") !== "true";
      applySpanBorders(next);
      localStorage.setItem(SPAN_BORDERS_KEY, String(next));
    });

    this.#fontViewButton.addEventListener("click", () => {
      const next = this.#fontViewButton.getAttribute("aria-pressed") !== "true";
      this.#fontViewButton.setAttribute("aria-pressed", String(next));
      const fontPanelEl = this.#fontView.element;
      if (next && !fontPanelEl.style.flexGrow) {
        // On first reveal, size the font panel to its SplitView minSize (150px)
        // and give the canvas panel the remaining space.
        // Both panels need flex-basis:0 for SplitView's pixel-weight math, so
        // we must set both flexGrow values explicitly here.
        const FONT_PANEL_MIN = 150;
        const RESIZER_SIZE = 6;
        const available =
          fontPanelEl.parentElement.getBoundingClientRect().width -
          RESIZER_SIZE;
        fontPanelEl.style.flexGrow = FONT_PANEL_MIN;
        document.getElementById("canvas-panel").style.flexGrow = Math.max(
          100,
          available - FONT_PANEL_MIN
        );
      }
      fontPanelEl.hidden = !next;
      this.#rerenderCanvas();
    });

    this.#textFilterButton.addEventListener("click", () => {
      const pressed =
        this.#textFilterButton.getAttribute("aria-pressed") === "true";
      const next = !pressed;
      this.#textFilterButton.setAttribute("aria-pressed", String(next));
      this.#textFilter = next;
      globalThis.StepperManager._textOnly = next;
      this.#opsView.setTextFilter(next);
      this.#redrawButton.click();
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

  // Re-render preserving any current pause position and text-only state.
  // Used by both zoom and resize so neither loses stepper or filter state.
  #rerenderCanvas() {
    const stepper = globalThis.StepperManager._active;
    let resumeAt = null;
    if (stepper !== null) {
      resumeAt =
        stepper.currentIdx >= 0 ? stepper.currentIdx : stepper.nextBreakPoint;
    }
    this.#clearPausedState();
    if (resumeAt !== null || this.#textFilter) {
      globalThis.StepperManager._active = new ViewerStepper(
        i => this.#onStepped(i),
        resumeAt
      );
    }
    return this.#renderCanvas();
  }

  #zoomRenderCanvas(newScale) {
    this.#renderScale = newScale;
    return this.#rerenderCanvas();
  }

  #cancelTextLayer() {
    this.#textLayerInstance?.cancel();
    this.#textLayerEl?.remove();
    this.#textLayerInstance = null;
    this.#textLayerEl = null;
  }

  async #buildTextLayer(scale) {
    const container = document.createElement("div");
    container.className = "textLayer";
    // --total-scale-factor is required by text_layer_builder.css to compute
    // font sizes. setLayerDimensions (called inside TextLayer) consumes it but
    // never sets it, so we must provide it here.
    container.style.setProperty("--total-scale-factor", scale);
    container.style.setProperty("--scale-round-x", "1px");
    container.style.setProperty("--scale-round-y", "1px");
    document.getElementById("canvas-wrapper").append(container);
    this.#textLayerEl = container;

    const viewport = this.#renderedPage.getViewport({ scale });
    const textLayer = new TextLayer({
      textContentSource: this.#renderedPage.streamTextContent(),
      container,
      viewport,
    });
    this.#textLayerInstance = textLayer;

    try {
      await textLayer.render();
    } catch (err) {
      if (err?.name !== "AbortException") {
        throw err;
      }
    }
  }

  async #renderCanvas() {
    if (!this.#renderedPage) {
      return null;
    }

    // Cancel any in-progress render before starting a new one.
    // Hide the text layer immediately so it isn't visible at the wrong scale
    // during the render; it is shown again once the canvas is ready.
    if (this.#textLayerEl) {
      this.#textLayerEl.style.visibility = "hidden";
    }
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

    // In text-only mode, overlay the text layer on the finished canvas.
    // If a layer already exists (e.g. after a zoom/resize), rescale it in place
    // by updating the CSS variable and calling update() — no rebuild needed.
    // If the filter is now off, discard any existing layer.
    if (this.#textFilter) {
      if (this.#textLayerInstance) {
        this.#textLayerEl.style.setProperty("--total-scale-factor", scale);
        this.#textLayerInstance.update({
          viewport: this.#renderedPage.getViewport({ scale }),
        });
        this.#textLayerEl.style.visibility = "";
      } else {
        await this.#buildTextLayer(scale);
      }
    } else {
      this.#cancelTextLayer();
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
      this.#fontView.showForOpList(this.#currentOpList, OPS);
      // If text-only filter is active, re-render immediately using only text
      // ops so the canvas matches the filtered op list.
      if (this.#textFilter) {
        if (this.#debugViewGeneration !== generation) {
          return;
        }
        this.#renderedPage.recordedBBoxes = null;
        globalThis.StepperManager._active = new ViewerStepper(i =>
          this.#onStepped(i)
        );
        await this.#renderCanvas();
      }
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
