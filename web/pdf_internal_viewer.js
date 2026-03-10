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
  getDocument,
  GlobalWorkerOptions,
  OPS,
  PasswordResponses,
} from "pdfjs-lib";
import { DOMCanvasFactory } from "pdfjs/display/canvas_factory.js";
import { makePathFromDrawOPS } from "pdfjs/display/display_utils.js";

GlobalWorkerOptions.workerSrc =
  typeof PDFJSDev === "undefined"
    ? "../src/pdf.worker.js"
    : "../build/pdf.worker.mjs";

const ARROW_COLLAPSED = "▶";
const ARROW_EXPANDED = "▼";

// Matches indirect object references such as "10 0 R".
const REF_RE = /^\d+ \d+ R$/;

// Parses "num" into { page: num }, or "numR"/"numRgen" into { ref: {num,gen} }.
// Returns null for invalid input.
function parseGoToInput(str) {
  const m = str.trim().match(/^(\d+)(R(\d+)?)?$/i);
  if (!m) {
    return null;
  }
  if (!m[2]) {
    return { page: parseInt(m[1]) };
  }
  return {
    ref: { num: parseInt(m[1]), gen: m[3] !== undefined ? parseInt(m[3]) : 0 },
  };
}

// Parses "num", "numR" or "numRgen" into { num, gen }, or returns null.
// Used for URL hash param parsing where a bare number means a ref, not a page.
function parseRefInput(str) {
  const m = str.trim().match(/^(\d+)(?:R(\d+)?)?$/i);
  if (!m) {
    return null;
  }
  return { num: parseInt(m[1]), gen: m[2] !== undefined ? parseInt(m[2]) : 0 };
}

let pdfDoc = null;

// Page number currently displayed in the tree (null when showing a
// ref/trailer).
let currentPage = null;

// PDFPageProxy currently shown in the render view (null when not rendering).
let renderedPage = null;

// Explicit zoom scale (CSS pixels per PDF point). null → auto-fit to panel.
let renderScale = null;

// RenderTask currently in progress, so it can be cancelled on zoom change.
let currentRenderTask = null;

// Operator list for the currently rendered page. Exposed as a module variable
// so it can be mutated and the page redrawn via the Redraw button.
let currentOpList = null;

// Incremented by resetRenderView() to cancel any in-flight showRenderView().
let debugViewGeneration = 0;

// Original color values before user edits: Map<opIdx, originalHex>.
// Keyed by op index so showOpDetail can tell whether a value has been changed.
const originalColors = new Map();

// Breakpoint state: set of op indices, array of line elements, paused index.
const breakpoints = new Set();
let opLines = [];
let pausedAtIdx = null;
let selectedOpLine = null;

// Reverse map: OPS numeric id → string name, built once from the OPS object.
const OPS_TO_NAME = Object.create(null);
for (const [name, id] of Object.entries(OPS)) {
  OPS_TO_NAME[id] = name;
}

// Properties of CanvasRenderingContext2D that we track while stepping.
const TRACKED_CTX_PROPS = new Set([
  "direction",
  "fillStyle",
  "filter",
  "font",
  "globalAlpha",
  "globalCompositeOperation",
  "imageSmoothingEnabled",
  "lineCap",
  "lineDashOffset",
  "lineJoin",
  "lineWidth",
  "miterLimit",
  "strokeStyle",
  "textAlign",
  "textBaseline",
]);

// Map<label, Map<prop, value>> — live graphics state per tracked context.
const ctxStates = new Map();

// Map<label, Array<Map<prop, value>>> — save() stack snapshots per context.
const ctxStateStacks = new Map();

// Map<label, number|null> — which stack frame is shown in the panel.
// null = live/current; 0..N-1 = index into ctxStateStacks (0 = oldest).
const ctxStackViewIdx = new Map();

// Map<label, Map<prop, {valEl, swatchEl?}>> — DOM elements for live updates.
const gfxStateValueElements = new Map();

// Map<label, {container, prevBtn, pos, nextBtn}> — stack-nav DOM elements.
const gfxStateNavElements = new Map();

function formatCtxValue(value) {
  return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
}

// Shallow-copy a state Map (arrays and plain objects are cloned one level
// deep).
function copyState(state) {
  const clone = v => {
    if (Array.isArray(v)) {
      return [...v];
    }
    if (typeof v === "object" && v !== null) {
      return { ...v };
    }
    return v;
  };
  return new Map([...state].map(([k, v]) => [k, clone(v)]));
}

// Apply a single (label, prop, value) update to the DOM unconditionally.
function _applyGfxStatePropEl(label, prop, value) {
  const entry = gfxStateValueElements.get(label)?.get(prop);
  if (!entry) {
    return;
  }
  if (entry.mnEls) {
    for (const k of ["a", "b", "c", "d", "e", "f"]) {
      entry.mnEls[k].textContent = formatMatrixValue(value[k]);
    }
    return;
  }
  const text = formatCtxValue(value);
  entry.valEl.textContent = text;
  entry.valEl.title = text;
  if (entry.swatchEl) {
    entry.swatchEl.style.background = String(value);
  }
}

// Update DOM for a live setter — skipped when the user is browsing a saved
// state so that live updates don't overwrite the frozen view.
function updateGfxStatePropEl(label, prop, value) {
  if (ctxStackViewIdx.get(label) !== null) {
    return;
  }
  _applyGfxStatePropEl(label, prop, value);
}

// Re-render all value DOM elements for label using the currently-viewed state.
function showGfxState(label) {
  const viewIdx = ctxStackViewIdx.get(label);
  const stateToShow =
    viewIdx === null
      ? ctxStates.get(label)
      : ctxStateStacks.get(label)?.[viewIdx];
  if (!stateToShow) {
    return;
  }
  for (const [prop, value] of stateToShow) {
    _applyGfxStatePropEl(label, prop, value);
  }
}

// Sync the stack-nav button states and position counter for a context.
function updateGfxStateStackNav(label) {
  const nav = gfxStateNavElements.get(label);
  if (!nav) {
    return;
  }
  const stack = ctxStateStacks.get(label) ?? [];
  const viewIdx = ctxStackViewIdx.get(label);
  nav.container.hidden = stack.length === 0;
  if (stack.length === 0) {
    return;
  }
  nav.prevBtn.disabled = viewIdx === 0;
  nav.nextBtn.disabled = viewIdx === null;
  nav.pos.textContent =
    viewIdx === null ? "cur" : `${viewIdx + 1}/${stack.length}`;
}

/**
 * Draw a checkerboard pattern filling the canvas, to reveal transparency.
 * Mirrors the pattern used in src/display/editor/stamp.js.
 */
function drawCheckerboard(ctx, width, height) {
  const isHCM = prefersHCM.matches;
  const isDark = prefersDark.matches;
  let light, dark;
  if (isHCM) {
    light = "white";
    dark = "black";
  } else if (isDark) {
    light = "#8f8f9d";
    dark = "#42414d";
  } else {
    light = "white";
    dark = "#cfcfd8";
  }
  const boxDim = 15;
  const pattern = new OffscreenCanvas(boxDim * 2, boxDim * 2);
  const patternCtx = pattern.getContext("2d");
  patternCtx.fillStyle = light;
  patternCtx.fillRect(0, 0, boxDim * 2, boxDim * 2);
  patternCtx.fillStyle = dark;
  patternCtx.fillRect(0, 0, boxDim, boxDim);
  patternCtx.fillRect(boxDim, boxDim, boxDim, boxDim);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(pattern, "repeat");
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// Override canvas.getContext to return a tracked proxy for "2d" contexts.
// Caches the proxy so repeated getContext("2d") calls return the same wrapper.
function wrapCanvasGetContext(canvas, label) {
  let wrappedCtx = null;
  const origGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = (type, ...args) => {
    const ctx = origGetContext(type, ...args);
    if (type !== "2d") {
      return ctx;
    }
    if (!wrappedCtx) {
      if (
        globalThis.StepperManager._active !== null &&
        args[0]?.alpha !== false
      ) {
        drawCheckerboard(ctx, canvas.width, canvas.height);
      }
      wrappedCtx = wrapContext(ctx, label);
    }
    return wrappedCtx;
  };
  return canvas.getContext("2d");
}

// Methods that modify the current transform matrix.
const TRANSFORM_METHODS = new Set([
  "setTransform",
  "transform",
  "resetTransform",
  "translate",
  "rotate",
  "scale",
]);

// Maps every tracked context property to a function that reads its current
// value from a CanvasRenderingContext2D. Covers directly-readable properties
// (TRACKED_CTX_PROPS) and method-read ones (lineDash, transform).
const CTX_PROP_READERS = new Map([
  ...Array.from(TRACKED_CTX_PROPS, p => [p, ctx => ctx[p]]),
  ["lineDash", ctx => ctx.getLineDash()],
  [
    "transform",
    ctx => {
      const { a, b, c, d, e, f } = ctx.getTransform();
      return { a, b, c, d, e, f };
    },
  ],
]);

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

function mEl(tag, ...children) {
  const el = document.createElementNS(MATHML_NS, tag);
  el.append(...children);
  return el;
}

function formatMatrixValue(v) {
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)));
}

function buildTransformMathML({ a, b, c, d, e, f }) {
  const mnEls = {};
  for (const [k, v] of Object.entries({ a, b, c, d, e, f })) {
    mnEls[k] = mEl("mn", formatMatrixValue(v));
  }
  const math = mEl(
    "math",
    mEl(
      "mrow",
      mEl("mo", "["),
      mEl(
        "mtable",
        mEl(
          "mtr",
          mEl("mtd", mnEls.a),
          mEl("mtd", mnEls.c),
          mEl("mtd", mnEls.e)
        ),
        mEl(
          "mtr",
          mEl("mtd", mnEls.b),
          mEl("mtd", mnEls.d),
          mEl("mtd", mnEls.f)
        ),
        mEl(
          "mtr",
          mEl("mtd", mEl("mn", "0")),
          mEl("mtd", mEl("mn", "0")),
          mEl("mtd", mEl("mn", "1"))
        )
      ),
      mEl("mo", "]")
    )
  );
  return { math, mnEls };
}

// Wrap a CanvasRenderingContext2D so every setter and setLineDash/restore call
// updates `ctxStates` and the live DOM elements for the given label.
function wrapContext(ctx, label) {
  const state = new Map();
  for (const [prop, read] of CTX_PROP_READERS) {
    state.set(prop, read(ctx));
  }
  ctxStates.set(label, state);
  ctxStateStacks.set(label, []);
  ctxStackViewIdx.set(label, null);
  // If the panel is already visible (stepping in progress), rebuild it so the
  // new context section is added and its live-update entries are registered.
  if (gfxStateValueElements.size > 0) {
    buildGfxStatePanel();
  }

  return new Proxy(ctx, {
    set(target, prop, value) {
      target[prop] = value;
      if (TRACKED_CTX_PROPS.has(prop)) {
        state.set(prop, value);
        updateGfxStatePropEl(label, prop, value);
      }
      return true;
    },
    get(target, prop) {
      const val = target[prop];
      if (typeof val !== "function") {
        return val;
      }
      if (prop === "save") {
        return function (...args) {
          const result = val.apply(target, args);
          ctxStateStacks.get(label).push(copyState(state));
          updateGfxStateStackNav(label);
          return result;
        };
      }
      if (prop === "restore") {
        return function (...args) {
          const result = val.apply(target, args);
          for (const [p, read] of CTX_PROP_READERS) {
            const v = read(target);
            state.set(p, v);
            updateGfxStatePropEl(label, p, v);
          }
          const stack = ctxStateStacks.get(label);
          if (stack.length > 0) {
            stack.pop();
            // If the viewed frame was just removed, fall back to current.
            const viewIndex = ctxStackViewIdx.get(label);
            if (viewIndex !== null && viewIndex >= stack.length) {
              ctxStackViewIdx.set(label, null);
              showGfxState(label);
            }
            updateGfxStateStackNav(label);
          }
          return result;
        };
      }
      if (prop === "setLineDash") {
        return function (segments) {
          val.call(target, segments);
          const dash = target.getLineDash();
          state.set("lineDash", dash);
          updateGfxStatePropEl(label, "lineDash", dash);
        };
      }
      if (TRANSFORM_METHODS.has(prop)) {
        return function (...args) {
          const result = val.apply(target, args);
          const { a, b, c, d, e, f } = target.getTransform();
          const tf = { a, b, c, d, e, f };
          state.set("transform", tf);
          updateGfxStatePropEl(label, "transform", tf);
          return result;
        };
      }
      return val.bind(target);
    },
  });
}

// Custom CanvasFactory that tracks temporary canvases created during rendering.
// When stepping, each temporary canvas is shown below the main page canvas so
// the user can inspect intermediate compositing targets (masks, patterns, etc).
class DebugCanvasFactory extends DOMCanvasFactory {
  // Wrapper objects currently alive: { canvas, context, wrapper, label }.
  #alive = [];

  // getDocument passes { ownerDocument, enableHWA } to the constructor.
  constructor({ ownerDocument, enableHWA } = {}) {
    super({ ownerDocument: ownerDocument ?? document, enableHWA });
  }

  create(width, height) {
    const canvasAndCtx = super.create(width, height);
    const label = `Temp ${this.#alive.length + 1}`;
    canvasAndCtx.context = wrapCanvasGetContext(canvasAndCtx.canvas, label);
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
    wrapper.addEventListener("click", () => scrollToGfxStateSection(ctxLabel));
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
}

// Cache for getRawData results, keyed by "num:gen". Cleared on each new
// document.
const refCache = new Map();

// Cached media query for dark mode detection.
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

// Cached media query for forced-colors (high-contrast) mode detection.
const prefersHCM = window.matchMedia("(forced-colors: active)");

// Keep --dpr in sync so CSS can scale temp canvases correctly.
function updateDPR() {
  document.documentElement.style.setProperty(
    "--dpr",
    window.devicePixelRatio || 1
  );
}
updateDPR();
window
  .matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  .addEventListener("change", updateDPR);

// Stepper for pausing/stepping through op list rendering.
// Implements the interface expected by InternalRenderTask (pdfBug mode).
class ViewerStepper {
  #continueCallback = null;

  // Pass resumeAt to re-pause at a specific index (e.g. after a zoom).
  constructor(resumeAt = null) {
    this.nextBreakPoint = resumeAt ?? this.#findNextAfter(-1);
    this.currentIdx = -1;
  }

  // Called by executeOperatorList when execution reaches nextBreakPoint.
  breakIt(i, continueCallback) {
    this.currentIdx = i;
    this.#continueCallback = continueCallback;
    onStepped(i);
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

  #findNextAfter(idx) {
    let next = null;
    for (const bp of breakpoints) {
      if (bp > idx && (next === null || bp < next)) {
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

// Install a StepperManager so InternalRenderTask (pdfBug mode) picks it up.
// A new instance is set on each redraw; null means no stepping.
globalThis.StepperManager = {
  get enabled() {
    return globalThis.StepperManager._active !== null;
  },
  _active: null,
  create() {
    return globalThis.StepperManager._active;
  },
};

// Color properties whose value is rendered as a swatch.
const COLOR_CTX_PROPS = new Set(["fillStyle", "strokeStyle", "shadowColor"]);

function scrollToGfxStateSection(label) {
  document
    .querySelector(`#gfx-state-panel [data-ctx-label="${CSS.escape(label)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

// Navigate the save/restore stack view for a context.
// delta = -1 → older (prev) frame; +1 → newer (next) frame.
function navigateGfxStateStack(label, delta) {
  const stack = ctxStateStacks.get(label) ?? [];
  const viewIndex = ctxStackViewIdx.get(label);
  let newViewIndex;
  if (delta < 0) {
    newViewIndex = viewIndex === null ? stack.length - 1 : viewIndex - 1;
    if (newViewIndex < 0) {
      return;
    }
  } else {
    if (viewIndex === null) {
      return;
    }
    newViewIndex = viewIndex >= stack.length - 1 ? null : viewIndex + 1;
  }
  ctxStackViewIdx.set(label, newViewIndex);
  showGfxState(label);
  updateGfxStateStackNav(label);
}

function buildGfxStatePanel() {
  const panel = document.getElementById("gfx-state-panel");
  const resizer = document.getElementById("op-gfx-state-resizer");
  panel.hidden = false;
  resizer.hidden = false;
  panel.replaceChildren();
  gfxStateValueElements.clear();
  gfxStateNavElements.clear();
  for (const [ctxLabel, state] of ctxStates) {
    const propEls = new Map();
    gfxStateValueElements.set(ctxLabel, propEls);

    const section = document.createElement("div");
    section.className = "gfx-state-section";
    section.dataset.ctxLabel = ctxLabel;

    // Title row with label and stack-navigation arrows.
    const title = document.createElement("div");
    title.className = "gfx-state-title";

    const titleLabel = document.createElement("span");
    titleLabel.textContent = ctxLabel;

    const navContainer = document.createElement("span");
    navContainer.className = "gfx-state-stack-nav";
    navContainer.hidden = true;

    const prevBtn = document.createElement("button");
    prevBtn.className = "gfx-state-stack-btn";
    prevBtn.setAttribute("aria-label", "View older saved state");
    prevBtn.textContent = "←";

    const pos = document.createElement("span");
    pos.className = "gfx-state-stack-pos";

    const nextBtn = document.createElement("button");
    nextBtn.className = "gfx-state-stack-btn";
    nextBtn.setAttribute("aria-label", "View newer saved state");
    nextBtn.textContent = "→";

    navContainer.append(prevBtn, pos, nextBtn);
    title.append(titleLabel, navContainer);
    section.append(title);

    gfxStateNavElements.set(ctxLabel, {
      container: navContainer,
      prevBtn,
      pos,
      nextBtn,
    });

    prevBtn.addEventListener("click", () =>
      navigateGfxStateStack(ctxLabel, -1)
    );
    nextBtn.addEventListener("click", () =>
      navigateGfxStateStack(ctxLabel, +1)
    );

    for (const [prop, value] of state) {
      const row = document.createElement("div");
      row.className = "gfx-state-row";

      const key = document.createElement("span");
      key.className = "gfx-state-key";
      key.textContent = prop;

      row.append(key);

      if (prop === "transform") {
        const { math, mnEls } = buildTransformMathML(value);
        row.append(math);
        propEls.set(prop, { valEl: math, swatchEl: null, mnEls });
      } else {
        const val = document.createElement("span");
        val.className = "gfx-state-val";
        const text = formatCtxValue(value);
        val.textContent = text;
        val.title = text;
        let swatchEl = null;
        if (COLOR_CTX_PROPS.has(prop)) {
          swatchEl = document.createElement("span");
          swatchEl.className = "color-swatch";
          swatchEl.style.background = String(value);
          row.append(swatchEl);
        }
        row.append(val);
        propEls.set(prop, { valEl: val, swatchEl });
      }
      section.append(row);
    }
    panel.append(section);

    // Apply the correct state for the current view index (may be a saved
    // frame).
    showGfxState(ctxLabel);
    updateGfxStateStackNav(ctxLabel);
  }
}

function onStepped(i) {
  // Remove previous paused highlight.
  if (pausedAtIdx !== null) {
    opLines[pausedAtIdx]?.classList.remove("paused");
  }
  pausedAtIdx = i;
  opLines[i]?.classList.add("paused");
  opLines[i]?.scrollIntoView({ block: "nearest" });
  stepBtn.disabled = false;
  continueBtn.disabled = false;
  buildGfxStatePanel();
}

function clearPausedState() {
  if (pausedAtIdx !== null) {
    opLines[pausedAtIdx]?.classList.remove("paused");
    pausedAtIdx = null;
  }
  globalThis.StepperManager._active = null;
  stepBtn.disabled = true;
  continueBtn.disabled = true;
  document.getElementById("gfx-state-panel").hidden = true;
  document.getElementById("op-gfx-state-resizer").hidden = true;
}

// Count of in-flight getRawData calls; drives the body "loading" cursor.
let loadingCount = 0;
function markLoading(delta) {
  loadingCount += delta;
  document.body.classList.toggle("loading", loadingCount > 0);
}

function resetRenderView() {
  debugViewGeneration++;
  currentRenderTask?.cancel();
  currentRenderTask = null;
  renderedPage?.cleanup();
  renderedPage = null;
  renderScale = null;
  currentOpList = null;
  originalColors.clear();
  breakpoints.clear();
  opLines = [];
  selectedOpLine = null;
  clearPausedState();

  // If a toolbar wrapper was added in showRenderView, unwrap it.
  // #op-list-panel is inside opListBody inside the wrapper; replaceWith
  // extracts it, discarding the toolbar and line-number column automatically.
  const opListWrapper = document.querySelector(".op-list-panel-wrapper");
  if (opListWrapper) {
    const opListPanelEl = document.getElementById("op-list-panel");
    opListPanelEl.style.flex = "";
    opListWrapper.replaceWith(opListPanelEl);
  }
  document.getElementById("op-list").replaceChildren();
  document.getElementById("op-detail-panel").replaceChildren();
  document.getElementById("gfx-state-panel").replaceChildren();
  ctxStates.clear();
  ctxStateStacks.clear();
  ctxStackViewIdx.clear();
  gfxStateValueElements.clear();
  gfxStateNavElements.clear();
  pdfDoc?.canvasFactory.clear();

  const mainCanvas = document.getElementById("render-canvas");
  mainCanvas.width = mainCanvas.height = 0;
  const highlightCanvas = document.getElementById("highlight-canvas");
  highlightCanvas.width = highlightCanvas.height = 0;

  document.getElementById("zoom-level").textContent = "";
  document.getElementById("zoom-out-btn").disabled = false;
  document.getElementById("zoom-in-btn").disabled = false;
  document.getElementById("redraw-btn").disabled = true;
}

async function loadTree(data, rootLabel = null) {
  currentPage = typeof data.page === "number" ? data.page : null;
  document.getElementById("debug-btn").hidden = currentPage === null;
  document.getElementById("debug-back-btn").hidden = true;
  resetRenderView();
  document.getElementById("debug-view").hidden = true;
  document.getElementById("tree").hidden = false;

  const treeEl = document.getElementById("tree");
  treeEl.classList.add("loading");
  markLoading(1);
  try {
    const rootNode = renderNode(
      rootLabel,
      await pdfDoc.getRawData(data),
      pdfDoc
    );
    treeEl.replaceChildren(rootNode);
    rootNode.querySelector("[role='button']").click();
    const firstTreeItem = treeEl.querySelector("[role='treeitem']");
    if (firstTreeItem) {
      firstTreeItem.tabIndex = 0;
    }
  } finally {
    treeEl.classList.remove("loading");
    markLoading(-1);
  }
}

async function openDocument(source, name) {
  const statusEl = document.getElementById("status");
  const pdfInfoEl = document.getElementById("pdf-info");
  const gotoInput = document.getElementById("goto-input");

  statusEl.textContent = `Loading ${name}…`;
  pdfInfoEl.textContent = "";
  refCache.clear();

  if (pdfDoc) {
    resetRenderView();
    await pdfDoc.destroy();
    pdfDoc = null;
  }

  const loadingTask = getDocument({
    ...source,
    cMapUrl: "../external/bcmaps/",
    wasmUrl: "../web/wasm/",
    iccUrl: "../external/iccs/",
    standardFontDataUrl: "../external/standard_fonts/",
    useWorkerFetch: true,
    pdfBug: true,
    CanvasFactory: DebugCanvasFactory,
  });
  loadingTask.onPassword = (updateCallback, reason) => {
    const dialog = document.getElementById("password-dialog");
    const title = document.getElementById("password-dialog-title");
    const input = document.getElementById("password-input");
    const cancelBtn = document.getElementById("password-cancel");

    title.textContent =
      reason === PasswordResponses.INCORRECT_PASSWORD
        ? "Incorrect password. Please try again:"
        : "This PDF is password-protected. Please enter the password:";
    input.value = "";
    dialog.showModal();

    const onSubmit = () => {
      cleanup();
      updateCallback(input.value);
    };
    const onCancel = () => {
      cleanup();
      dialog.close();
      updateCallback(new Error("Password prompt cancelled."));
    };
    const cleanup = () => {
      dialog.removeEventListener("close", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
    };

    dialog.addEventListener("close", onSubmit, { once: true });
    cancelBtn.addEventListener("click", onCancel, { once: true });
  };
  pdfDoc = await loadingTask.promise;
  const plural = pdfDoc.numPages !== 1 ? "s" : "";
  pdfInfoEl.textContent = `${name} — ${pdfDoc.numPages} page${plural}`;
  statusEl.textContent = "";
  gotoInput.disabled = false;
  gotoInput.value = "";
}

function showError(err) {
  document.getElementById("status").textContent = "Error: " + err.message;
  document.getElementById("tree").append(makeErrorEl(err.message));
}

// Creates a role=alert div with "Error: <message>" text.
function makeErrorEl(message) {
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.textContent = `Error: ${message}`;
  return el;
}

document.getElementById("file-input").value = "";

document.getElementById("tree").addEventListener("keydown", e => {
  const treeEl = document.getElementById("tree");
  // Collect all visible treeitems: those not inside a [hidden] group ancestor.
  const allItems = Array.from(treeEl.querySelectorAll("[role='treeitem']"));
  const visibleItems = allItems.filter(item => {
    let el = item.parentElement;
    while (el && el !== treeEl) {
      if (el.getAttribute("role") === "group" && el.hidden) {
        return false;
      }
      el = el.parentElement;
    }
    return true;
  });
  const focused = document.activeElement;
  const idx = visibleItems.indexOf(focused);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = visibleItems[idx + 1];
    if (next) {
      focused.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = visibleItems[idx - 1];
    if (prev) {
      focused.tabIndex = -1;
      prev.tabIndex = 0;
      prev.focus();
    }
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (!focused || idx < 0) {
      return;
    }
    // Find the toggle button inside this treeitem (not inside a child group).
    const toggle = focused.querySelector(":scope > [role='button']");
    if (!toggle) {
      return;
    }
    const expanded = toggle.getAttribute("aria-expanded");
    if (expanded === "false") {
      toggle.click();
    } else {
      // Already expanded — move to first child treeitem.
      const group = focused.querySelector(
        ":scope > [role='group']:not(.hidden)"
      );
      const firstChild = group?.querySelector("[role='treeitem']");
      if (firstChild) {
        focused.tabIndex = -1;
        firstChild.tabIndex = 0;
        firstChild.focus();
      }
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (!focused || idx < 0) {
      return;
    }
    const toggle = focused.querySelector(":scope > [role='button']");
    const expanded = toggle?.getAttribute("aria-expanded");
    if (expanded === "true") {
      toggle.click();
    } else {
      // Collapsed or no children — move to parent treeitem.
      const parentGroup = focused.closest("[role='group']");
      const parentItem = parentGroup?.closest("[role='treeitem']");
      if (parentItem) {
        focused.tabIndex = -1;
        parentItem.tabIndex = 0;
        parentItem.focus();
      }
    }
  } else if (e.key === "Home") {
    e.preventDefault();
    const first = visibleItems[0];
    if (first && first !== focused) {
      focused.tabIndex = -1;
      first.tabIndex = 0;
      first.focus();
    }
  } else if (e.key === "End") {
    e.preventDefault();
    const last = visibleItems.at(-1);
    if (last && last !== focused) {
      focused.tabIndex = -1;
      last.tabIndex = 0;
      last.focus();
    }
  }
});

document.getElementById("file-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }
  try {
    await openDocument({ data: await file.arrayBuffer() }, file.name);
    await loadTree({ ref: null }, "Trailer");
  } catch (err) {
    showError(err);
  }
});

(async () => {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const fileUrl = searchParams.get("file");
  if (!fileUrl) {
    return;
  }
  try {
    await openDocument({ url: fileUrl }, fileUrl.split("/").pop());
    const refStr = hashParams.get("ref");
    const pageStr = hashParams.get("page");
    if (refStr) {
      const ref = parseRefInput(refStr);
      if (ref) {
        document.getElementById("goto-input").value = refStr;
        await loadTree({ ref });
        return;
      }
    }
    if (pageStr) {
      const page = parseInt(pageStr);
      if (Number.isInteger(page) && page >= 1 && page <= pdfDoc.numPages) {
        document.getElementById("goto-input").value = pageStr;
        await loadTree({ page });
        return;
      }
    }
    await loadTree({ ref: null }, "Trailer");
  } catch (err) {
    showError(err);
  }
})();

document.getElementById("goto-input").addEventListener("keydown", async e => {
  if (e.key !== "Enter" || !pdfDoc) {
    return;
  }
  const input = e.target;
  if (input.value.trim() === "") {
    input.setAttribute("aria-invalid", "false");
    await loadTree({ ref: null }, "Trailer");
    return;
  }
  const result = parseGoToInput(input.value);
  if (!result) {
    input.setAttribute("aria-invalid", "true");
    return;
  }
  if (
    result.page !== undefined &&
    (result.page < 1 || result.page > pdfDoc.numPages)
  ) {
    input.setAttribute("aria-invalid", "true");
    return;
  }
  input.setAttribute("aria-invalid", "false");
  await (result.page !== undefined
    ? loadTree({ page: result.page })
    : loadTree({ ref: result.ref }));
});

document.getElementById("goto-input").addEventListener("input", e => {
  if (e.target.value.trim() === "") {
    e.target.setAttribute("aria-invalid", "false");
  }
});

document.getElementById("debug-btn").addEventListener("click", async () => {
  document.getElementById("debug-btn").hidden = true;
  document.getElementById("debug-back-btn").hidden = false;
  document.getElementById("tree").hidden = true;
  document.getElementById("debug-view").hidden = false;
  // Only render if not already loaded for this page; re-entering from the
  // back button keeps the existing debug state (op-list, canvas, breakpoints).
  if (currentOpList === null) {
    await showRenderView(currentPage);
  }
});

document.getElementById("debug-back-btn").addEventListener("click", () => {
  document.getElementById("debug-back-btn").hidden = true;
  document.getElementById("debug-btn").hidden = false;
  document.getElementById("debug-view").hidden = true;
  document.getElementById("tree").hidden = false;
});

/**
 * Attach a drag-to-resize handler to a resizer element.
 * @param {string} resizerId   ID of the resizer element.
 * @param {string} firstId     ID of the first panel (before the resizer).
 * @param {string} secondId    ID of the second panel (after the resizer).
 * @param {"horizontal"|"vertical"} direction
 * @param {number} minSize     Minimum size in px for each panel.
 * @param {Function} [onDone]  Optional callback invoked after drag ends.
 */
function updateResizerAria(resizer, firstPanel, containerSize, resizerSize) {
  const dimension =
    resizer.getAttribute("aria-orientation") === "vertical"
      ? "width"
      : "height";
  const total = containerSize - resizerSize;
  if (total <= 0) {
    return;
  }
  const firstSize = firstPanel.getBoundingClientRect()[dimension];
  resizer.setAttribute(
    "aria-valuenow",
    String(Math.round((firstSize / containerSize) * 100))
  );
}

function makeResizer(
  resizerId,
  firstArg,
  secondArg,
  direction,
  minSize,
  onDone
) {
  const isHorizontal = direction === "horizontal";
  const axis = isHorizontal ? "clientX" : "clientY";
  const dimension = isHorizontal ? "width" : "height";
  const cursor = isHorizontal ? "col-resize" : "row-resize";

  const getFirst =
    typeof firstArg === "function"
      ? firstArg
      : () => document.getElementById(firstArg);
  const getSecond =
    typeof secondArg === "function"
      ? secondArg
      : () => document.getElementById(secondArg);

  const resizer = document.getElementById(resizerId);
  const minPct = Math.round(
    (minSize /
      Math.max(
        1,
        resizer.parentElement.getBoundingClientRect()[dimension] -
          resizer.getBoundingClientRect()[dimension]
      )) *
      100
  );
  resizer.setAttribute("aria-valuemin", String(minPct));
  resizer.setAttribute("aria-valuemax", String(100 - minPct));
  resizer.setAttribute("aria-valuenow", "50");

  resizer.addEventListener("mousedown", e => {
    e.preventDefault();
    const firstPanel = getFirst();
    const secondPanel = getSecond();
    const startPos = e[axis];
    const containerSize =
      resizer.parentElement.getBoundingClientRect()[dimension];
    const resizerSize = resizer.getBoundingClientRect()[dimension];
    const total = containerSize - resizerSize;
    // After the first drag, panels have inline "N 1 0px" flex styles. Using
    // getBoundingClientRect() as the baseline is wrong here because sub-pixel
    // rendering makes the measured width slightly less than the grow value,
    // causing the panel to barely move for the first pixel(s) of the drag.
    // Parsing the grow value from the inline style gives the correct baseline.
    const inlineFirst = parseFloat(firstPanel.style.flex);
    const startFirst = isNaN(inlineFirst)
      ? firstPanel.getBoundingClientRect()[dimension]
      : inlineFirst;

    resizer.classList.add("dragging");
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";

    const onMouseMove = ev => {
      const delta = ev[axis] - startPos;
      const newFirst = Math.max(
        minSize,
        Math.min(total - minSize, startFirst + delta)
      );
      firstPanel.style.flex = `${newFirst} 1 0px`;
      secondPanel.style.flex = `${total - newFirst} 1 0px`;
      updateResizerAria(resizer, firstPanel, containerSize, resizerSize);
    };

    const onMouseUp = () => {
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      // No flex re-assignment needed: onMouseMove already set grow ratios.
      // Re-measuring here would introduce a 1px jump due to sub-pixel
      // rounding (getBoundingClientRect returns integers while grow-ratio
      // flex-basis values are fractional).
      updateResizerAria(
        resizer,
        getFirst(),
        containerSize,
        resizer.getBoundingClientRect()[dimension]
      );
      onDone?.();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  resizer.addEventListener("keydown", e => {
    const firstPanel = getFirst();
    const secondPanel = getSecond();
    const containerSize =
      resizer.parentElement.getBoundingClientRect()[dimension];
    const resizerSize = resizer.getBoundingClientRect()[dimension];
    const total = containerSize - resizerSize;
    const step = e.shiftKey ? 50 : 10;

    let delta = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      delta = -step;
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      delta = step;
    } else {
      return;
    }
    e.preventDefault();

    const inlineCurrent = parseFloat(firstPanel.style.flex);
    const currentFirst = isNaN(inlineCurrent)
      ? firstPanel.getBoundingClientRect()[dimension]
      : inlineCurrent;
    const newFirst = Math.max(
      minSize,
      Math.min(total - minSize, currentFirst + delta)
    );
    firstPanel.style.flex = `${newFirst} 1 0px`;
    secondPanel.style.flex = `${total - newFirst} 1 0px`;
    updateResizerAria(resizer, firstPanel, containerSize, resizerSize);
    onDone?.();
  });
}

// op-list-panel is wrapped in op-list-panel-wrapper after showRenderView().
// The wrapper is the actual flex sibling of gfx-state-panel in op-top-row,
// so target it when present; fall back to op-list-panel otherwise.
makeResizer(
  "op-gfx-state-resizer",
  () =>
    document.querySelector(".op-list-panel-wrapper") ??
    document.getElementById("op-list-panel"),
  "gfx-state-panel",
  "horizontal",
  60
);
makeResizer("op-resizer", "op-top-row", "op-detail-panel", "vertical", 40);
makeResizer(
  "render-resizer",
  "op-left-col",
  "canvas-panel",
  "horizontal",
  100,
  renderCanvas
);

function getFitScale() {
  const canvasScroll = document.getElementById("canvas-scroll");
  return (
    (canvasScroll.clientWidth - 24) /
    renderedPage.getViewport({ scale: 1 }).width
  );
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.25;

function zoomRenderCanvas(newScale) {
  // If zoomed again while a re-render is already running (not yet re-paused),
  // pausedAtIdx is null but the active stepper still knows the target index.
  const resumeAt =
    pausedAtIdx ?? globalThis.StepperManager._active?.nextBreakPoint ?? null;
  clearPausedState();
  renderScale = newScale;
  if (resumeAt !== null) {
    globalThis.StepperManager._active = new ViewerStepper(resumeAt);
  }
  return renderCanvas();
}

document
  .getElementById("zoom-in-btn")
  .addEventListener("click", () =>
    zoomRenderCanvas(
      Math.min(MAX_ZOOM, (renderScale ?? getFitScale()) * ZOOM_STEP)
    )
  );
document
  .getElementById("zoom-out-btn")
  .addEventListener("click", () =>
    zoomRenderCanvas(
      Math.max(MIN_ZOOM, (renderScale ?? getFitScale()) / ZOOM_STEP)
    )
  );

document.getElementById("redraw-btn").addEventListener("click", async () => {
  if (!renderedPage || !currentOpList) {
    return;
  }
  clearPausedState();
  // Reset recorded bboxes so they get re-recorded for the modified op list.
  renderedPage.recordedBBoxes = null;
  if (breakpoints.size > 0) {
    globalThis.StepperManager._active = new ViewerStepper();
  }
  await renderCanvas();
});

const stepBtn = document.getElementById("step-btn");
const continueBtn = document.getElementById("continue-btn");
const opDetailEl = document.getElementById("op-detail-panel");

stepBtn.addEventListener("click", () => {
  globalThis.StepperManager._active?.stepNext();
});

continueBtn.addEventListener("click", () => {
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

// Formats a glyph items array as: "text" kerning "more text" …
function formatGlyphItems(items) {
  const parts = [];
  let str = "";
  for (const item of items) {
    if (typeof item === "number") {
      if (str) {
        parts.push(JSON.stringify(str));
        str = "";
      }
      parts.push(String(Math.round(item * 100) / 100));
    } else if (item?.unicode) {
      str += item.unicode;
    }
  }
  if (str) {
    parts.push(JSON.stringify(str));
  }
  return parts.join(" ");
}

/**
 * Format an operator argument for display.
 * @param {*}       arg  The argument value.
 * @param {boolean} full true → expand fully (detail panel);
 *                       false → truncate for compact list display.
 */
function formatArg(arg, full) {
  if (arg === null || arg === undefined) {
    return full ? "null" : "";
  }
  if (typeof arg === "number") {
    return Number.isInteger(arg)
      ? String(arg)
      : String(Math.round(arg * 10000) / 10000);
  }
  if (typeof arg === "string") {
    return JSON.stringify(arg);
  }
  if (typeof arg === "boolean") {
    return String(arg);
  }
  if (ArrayBuffer.isView(arg)) {
    if (!full && arg.length > 8) {
      return `<${arg.length} values>`;
    }
    const fmt = n => (Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
    return `[${Array.from(arg).map(fmt).join(" ")}]`;
  }
  if (Array.isArray(arg)) {
    if (arg.length === 0) {
      return "[]";
    }
    if (!full && arg.length > 4) {
      return `[…${arg.length}]`;
    }
    return `[${arg.map(a => formatArg(a, full)).join(", ")}]`;
  }
  if (typeof arg === "object") {
    if (!full) {
      return "{…}";
    }
    return `{${Object.entries(arg)
      .map(([k, v]) => `${k}: ${formatArg(v, true)}`)
      .join(", ")}}`;
  }
  return String(arg);
}

const formatOpArg = arg => formatArg(arg, false);
const formatFullArg = arg => formatArg(arg, true);

function showOpDetail(name, args, opIdx) {
  const detailEl = opDetailEl;
  detailEl.replaceChildren();

  // Always build args into a .detail-args-col so it can be placed in a
  // .detail-body alongside a path preview or image preview on the right.
  const argsContainer = document.createElement("div");
  argsContainer.className = "detail-args-col";

  const header = document.createElement("div");
  header.className = "detail-name";
  header.textContent = name;
  argsContainer.append(header);

  if (!args || args.length === 0) {
    const none = document.createElement("div");
    none.className = "detail-empty";
    none.textContent = "(no arguments)";
    argsContainer.append(none);
    detailEl.append(argsContainer);
    return;
  }

  const imagePreviews = [];
  for (let i = 0; i < args.length; i++) {
    const row = document.createElement("div");
    row.className = "detail-row";
    const idx = document.createElement("span");
    idx.className = "detail-idx";
    idx.textContent = `[${i}]`;
    const val = document.createElement("span");
    val.className = "detail-val";
    if (name === "showText" && i === 0 && Array.isArray(args[0])) {
      val.textContent = formatGlyphItems(args[0]);
    } else if (
      name === "constructPath" &&
      i === 0 &&
      typeof args[0] === "number"
    ) {
      val.textContent = OPS_TO_NAME[args[0]] ?? String(args[0]);
    } else {
      val.textContent = formatFullArg(args[i]);
    }
    row.append(idx);
    if (typeof args[i] === "string" && /^#[0-9a-f]{6}$/i.test(args[i])) {
      const argIdx = i;
      const originalHex = originalColors.get(opIdx);
      if (originalHex && args[i] !== originalHex) {
        val.classList.add("changed-value");
        val.title = `Original: ${originalHex}`;
      }
      row.append(
        makeColorSwatch(args[i], newHex => {
          args[argIdx] = newHex;
          val.textContent = JSON.stringify(newHex);
          const changed = originalHex && newHex !== originalHex;
          val.classList.toggle("changed-value", !!changed);
          val.title = changed ? `Original: ${originalHex}` : "";
          // Also update the swatch and arg span in the selected op list line.
          const listSwatch = document.querySelector(
            "#op-list .op-line.selected .color-swatch"
          );
          if (listSwatch) {
            listSwatch.style.background = newHex;
          }
          const listArgSpan = document.querySelector(
            "#op-list .op-line.selected .op-arg"
          );
          if (listArgSpan) {
            listArgSpan.textContent = JSON.stringify(newHex);
            listArgSpan.classList.toggle("changed-value", !!changed);
            listArgSpan.title = changed ? `Original: ${originalHex}` : "";
          }
        })
      );
    }
    row.append(val);
    argsContainer.append(row);
    if (typeof args[i] === "string" && args[i].startsWith("img_")) {
      const preview = makeImageArgPreview(args[i]);
      if (preview) {
        imagePreviews.push(preview);
      }
    }
  }

  // Assemble the final layout: constructPath gets a path preview on the right;
  // image ops get an image column on the right; others just use argsContainer.
  if (name === "constructPath") {
    // args[1] is [Float32Array|null], args[2] is [minX,minY,maxX,maxY]|null
    const data = Array.isArray(args?.[1]) ? args[1][0] : null;
    const body = document.createElement("div");
    body.className = "detail-body";
    body.append(argsContainer, renderPathPreview(data, args?.[2] ?? null));
    detailEl.append(body);
  } else if (imagePreviews.length > 0) {
    const imgCol = document.createElement("div");
    imgCol.className = "detail-img-col";
    imgCol.append(...imagePreviews);
    const body = document.createElement("div");
    body.className = "detail-body";
    body.append(argsContainer, imgCol);
    detailEl.append(body);
  } else {
    detailEl.append(argsContainer);
  }
}

// Render an img_ argument value into a canvas preview using the decoded image
// stored in renderedPage.objs (or commonObjs for global images starting with
// g_). Handles ImageBitmap and raw pixel data with ImageKind values
// GRAYSCALE_1BPP, RGB_24BPP, and RGBA_32BPP.
function makeImageArgPreview(name) {
  const objStore = name.startsWith("g_")
    ? renderedPage?.commonObjs
    : renderedPage?.objs;
  if (!objStore?.has(name)) {
    return null;
  }
  const imgObj = objStore.get(name);
  if (!imgObj) {
    return null;
  }
  const { width, height } = imgObj;
  const canvas = document.createElement("canvas");
  canvas.className = "image-preview";
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.setAttribute("aria-label", `${name} ${width}×${height}`);
  const ctx = canvas.getContext("2d");

  // Fast path: if the browser already decoded it as an ImageBitmap, draw it.
  if (imgObj.bitmap instanceof ImageBitmap) {
    ctx.drawImage(imgObj.bitmap, 0, 0);
    return canvas;
  }

  // Slow path: convert raw pixel data to RGBA for putImageData.
  const { data, kind } = imgObj;
  let rgba;
  if (kind === 3 /* RGBA_32BPP */) {
    rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  } else if (kind === 2 /* RGB_24BPP */) {
    const pixels = width * height;
    rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0, j = 0; i < pixels; i++, j += 3) {
      rgba[i * 4] = data[j];
      rgba[i * 4 + 1] = data[j + 1];
      rgba[i * 4 + 2] = data[j + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (kind === 1 /* GRAYSCALE_1BPP */) {
    const rowBytes = (width + 7) >> 3;
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const srcRow = row * rowBytes;
      const dstRow = row * width * 4;
      for (let col = 0; col < width; col++) {
        const bit = (data[srcRow + (col >> 3)] >> (7 - (col & 7))) & 1;
        const v = bit ? 255 : 0;
        rgba[dstRow + col * 4] = v;
        rgba[dstRow + col * 4 + 1] = v;
        rgba[dstRow + col * 4 + 2] = v;
        rgba[dstRow + col * 4 + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

async function renderCanvas() {
  if (!renderedPage) {
    return null;
  }

  // Cancel any in-progress render before starting a new one.
  currentRenderTask?.cancel();
  currentRenderTask = null;

  const highlight = document.getElementById("highlight-canvas");
  const dpr = window.devicePixelRatio || 1;
  const scale = renderScale ?? getFitScale();
  document.getElementById("zoom-level").textContent =
    `${Math.round(scale * 100)}%`;
  document.getElementById("zoom-out-btn").disabled = scale <= MIN_ZOOM;
  document.getElementById("zoom-in-btn").disabled = scale >= MAX_ZOOM;
  const viewport = renderedPage.getViewport({ scale: scale * dpr });
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
  newCanvas.addEventListener("click", () => scrollToGfxStateSection("Page"));

  const isStepping = globalThis.StepperManager._active !== null;
  if (isStepping) {
    const oldCanvas = document.getElementById("render-canvas");
    oldCanvas.width = oldCanvas.height = 0;
    oldCanvas.replaceWith(newCanvas);
    // Show any temporary canvases that survived from the previous render
    // (e.g. after a zoom-while-stepping, the factory may already have entries).
    pdfDoc?.canvasFactory.showAll();
  } else {
    // Starting a fresh non-stepping render: remove leftover temp canvases.
    pdfDoc?.canvasFactory.clear();
  }

  // Record bboxes only on the first render; they stay valid for subsequent
  // re-renders because BBoxReader returns normalised [0, 1] fractions.
  const firstRender = !renderedPage.recordedBBoxes;
  const renderTask = renderedPage.render({
    canvasContext: wrapCanvasGetContext(newCanvas, "Page"),
    viewport,
    recordOperations: firstRender,
  });
  currentRenderTask = renderTask;

  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name === "RenderingCancelledException") {
      return null;
    }
    throw err;
  } finally {
    if (currentRenderTask === renderTask) {
      currentRenderTask = null;
    }
  }

  // Render completed fully — stepping session is over.
  clearPausedState();
  pdfDoc?.canvasFactory.clear();
  document.getElementById("redraw-btn").disabled = false;

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

function drawHighlight(opIdx) {
  const bboxes = renderedPage?.recordedBBoxes;
  if (!bboxes || opIdx >= bboxes.length || bboxes.isEmpty(opIdx)) {
    clearHighlight();
    return;
  }
  const canvas = document.getElementById("render-canvas");
  const highlight = document.getElementById("highlight-canvas");
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

function clearHighlight() {
  const highlight = document.getElementById("highlight-canvas");
  highlight.getContext("2d").clearRect(0, 0, highlight.width, highlight.height);
}

function renderPathPreview(data, minMax) {
  const canvas = document.createElement("canvas");
  canvas.className = "path-preview";

  const [minX, minY, maxX, maxY] = minMax ?? [];
  const pathW = maxX - minX || 1;
  const pathH = maxY - minY || 1;
  if (!data || !minMax || !(pathW > 0) || !(pathH > 0)) {
    canvas.width = canvas.height = 1;
    return canvas;
  }

  const PADDING = 10; // px
  const dpr = window.devicePixelRatio || 1;
  const drawW = Math.min(200, 200 * (pathW / pathH));
  const drawH = Math.min(200, 200 * (pathH / pathW));
  const scale = Math.min(drawW / pathW, drawH / pathH);

  canvas.width = Math.round((drawW + PADDING * 2) * dpr);
  canvas.height = Math.round((drawH + PADDING * 2) * dpr);
  canvas.style.width = `${drawW + PADDING * 2}px`;
  canvas.style.height = `${drawH + PADDING * 2}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  // PDF user space has Y pointing up; canvas has Y pointing down — flip Y.
  ctx.translate(PADDING, PADDING + drawH);
  ctx.scale(scale, -scale);
  ctx.translate(-minX, -minY);

  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = prefersDark.matches ? "#9cdcfe" : "#0070c1";
  ctx.stroke(data instanceof Path2D ? data : makePathFromDrawOPS(data));

  return canvas;
}

// The evaluator normalizes all color ops to setFillRGBColor /
// setStrokeRGBColor with args = ["#rrggbb"]. Return that hex string, or null.
function getOpColor(name, args) {
  if (
    (name === "setFillRGBColor" || name === "setStrokeRGBColor") &&
    typeof args?.[0] === "string" &&
    /^#[0-9a-f]{6}$/i.test(args[0])
  ) {
    return args[0];
  }
  return null;
}

// Single hidden color input reused for all swatch pickers.
const colorPickerInput = document.createElement("input");
colorPickerInput.type = "color";
colorPickerInput.style.cssText =
  "position:fixed;opacity:0;pointer-events:none;width:0;height:0;";
document.body.append(colorPickerInput);

// Creates a color swatch. If `onPick` is provided the swatch is clickable and
// opens the browser color picker; onPick(newHex) is called on each change.
function makeColorSwatch(hex, onPick) {
  const swatch = document.createElement("span");
  swatch.className = "color-swatch";
  swatch.style.background = hex;
  if (onPick) {
    swatch.setAttribute("role", "button");
    swatch.setAttribute("tabindex", "0");
    swatch.setAttribute("aria-label", "Change color");
    swatch.title = "Click to change color";
    swatch.addEventListener("click", e => {
      e.stopPropagation();
      colorPickerInput.value = hex;
      const ac = new AbortController();
      colorPickerInput.addEventListener(
        "input",
        () => {
          hex = colorPickerInput.value;
          swatch.style.background = hex;
          onPick(hex);
        },
        { signal: ac.signal }
      );
      colorPickerInput.addEventListener("change", () => ac.abort(), {
        once: true,
      });
      colorPickerInput.click();
    });
  }
  return swatch;
}

async function showRenderView(pageNum) {
  const generation = debugViewGeneration;
  const opListEl = document.getElementById("op-list");

  const spinner = document.createElement("div");
  spinner.setAttribute("role", "status");
  spinner.textContent = "Loading…";
  opListEl.replaceChildren(spinner);
  opDetailEl.replaceChildren();

  renderScale = null;
  markLoading(1);
  try {
    renderedPage = await pdfDoc.getPage(pageNum);
    if (debugViewGeneration !== generation) {
      return;
    }

    // Render the page (records bboxes too). Reuse the operator list from the
    // render task when available (dev/testing builds); fall back to a separate
    // getOperatorList() call otherwise.
    const renderTask = await renderCanvas();
    if (debugViewGeneration !== generation) {
      return;
    }
    currentOpList =
      renderTask?.getOperatorList?.() ?? (await renderedPage.getOperatorList());
    if (debugViewGeneration !== generation) {
      return;
    }
    const opList = currentOpList;

    // Build operator list display.
    opLines = [];
    const opTexts = [];
    let opHighlightedIdx = -1;
    const opNumCol = document.createElement("div");
    opNumCol.className = "cs-line-nums-col";
    opNumCol.style.setProperty(
      "--line-num-width",
      `${String(opList.fnArray.length).length}ch`
    );
    const opNumFrag = document.createDocumentFragment();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < opList.fnArray.length; i++) {
      const name = OPS_TO_NAME[opList.fnArray[i]] ?? `op${opList.fnArray[i]}`;
      const args = opList.argsArray[i] ?? [];
      const line = document.createElement("div");
      line.className = "op-line";
      line.setAttribute("role", "option");
      line.setAttribute("aria-selected", "false");
      line.tabIndex = i === 0 ? 0 : -1;
      opLines.push(line);

      const numItem = document.createElement("div");
      numItem.className = "cs-num-item";
      numItem.append(makeSpan("cs-line-num", String(i + 1)));
      opNumFrag.append(numItem);

      // Breakpoint gutter — click to toggle a red-bullet breakpoint.
      const gutter = document.createElement("span");
      gutter.className = "bp-gutter";
      gutter.setAttribute("role", "checkbox");
      gutter.setAttribute("tabindex", "0");
      gutter.setAttribute("aria-label", "Breakpoint");
      const isInitiallyActive = breakpoints.has(i);
      gutter.setAttribute("aria-checked", String(isInitiallyActive));
      if (isInitiallyActive) {
        gutter.classList.add("active");
      }
      gutter.addEventListener("click", e => {
        e.stopPropagation();
        if (breakpoints.has(i)) {
          breakpoints.delete(i);
          gutter.classList.remove("active");
          gutter.setAttribute("aria-checked", "false");
        } else {
          breakpoints.add(i);
          gutter.classList.add("active");
          gutter.setAttribute("aria-checked", "true");
        }
      });
      gutter.addEventListener("keydown", e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          gutter.click();
        }
      });
      line.append(gutter);

      const nameEl = document.createElement("span");
      nameEl.className = "op-name";
      nameEl.textContent = name;
      line.append(nameEl);
      const rgb = getOpColor(name, args);
      let colorArgSpan = null;
      if (rgb) {
        originalColors.set(i, rgb);
        line.append(
          makeColorSwatch(rgb, newHex => {
            args[0] = newHex;
            if (colorArgSpan) {
              const changed = newHex !== rgb;
              colorArgSpan.textContent = JSON.stringify(newHex);
              colorArgSpan.classList.toggle("changed-value", changed);
              colorArgSpan.title = changed ? `Original: ${rgb}` : "";
            }
          })
        );
      }
      if (name === "showText" && Array.isArray(args[0])) {
        const argEl = document.createElement("span");
        argEl.className = "op-arg";
        argEl.textContent = formatGlyphItems(args[0]);
        line.append(argEl);
      } else {
        for (let j = 0; j < args.length; j++) {
          const s =
            name === "constructPath" && j === 0 && typeof args[0] === "number"
              ? (OPS_TO_NAME[args[0]] ?? String(args[0]))
              : formatOpArg(args[j]);
          if (s) {
            const argEl = document.createElement("span");
            argEl.className = "op-arg";
            argEl.textContent = s;
            line.append(argEl);
            if (rgb && j === 0) {
              colorArgSpan = argEl;
            }
          }
        }
      }
      // Build plain-text representation for search.
      let opText = name;
      if (name === "showText" && Array.isArray(args[0])) {
        opText += " " + formatGlyphItems(args[0]);
      } else {
        for (let j = 0; j < args.length; j++) {
          const s =
            name === "constructPath" && j === 0 && typeof args[0] === "number"
              ? (OPS_TO_NAME[args[0]] ?? String(args[0]))
              : formatOpArg(args[j]);
          if (s) {
            opText += " " + s;
          }
        }
      }
      opTexts.push(opText);

      line.addEventListener("mouseenter", () => drawHighlight(i));
      line.addEventListener("mouseleave", clearHighlight);
      line.addEventListener("click", () => {
        if (selectedOpLine) {
          selectedOpLine.classList.remove("selected");
          selectedOpLine.setAttribute("aria-selected", "false");
          selectedOpLine.tabIndex = -1;
        }
        selectedOpLine = line;
        line.classList.add("selected");
        line.setAttribute("aria-selected", "true");
        line.tabIndex = 0;
        showOpDetail(name, args, i);
      });
      fragment.append(line);
    }
    if (debugViewGeneration === generation) {
      opNumCol.append(opNumFrag);
      opListEl.replaceChildren(fragment);

      opListEl.addEventListener("keydown", e => {
        const lines = opLines;
        if (!lines.length) {
          return;
        }
        const focused = document.activeElement;
        const currentIdx = lines.indexOf(focused);
        let targetIdx = -1;
        if (e.key === "ArrowDown") {
          targetIdx =
            currentIdx < lines.length - 1 ? currentIdx + 1 : currentIdx;
        } else if (e.key === "ArrowUp") {
          targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
        } else if (e.key === "Home") {
          targetIdx = 0;
        } else if (e.key === "End") {
          targetIdx = lines.length - 1;
        } else if (e.key === "Enter" || e.key === " ") {
          if (currentIdx >= 0) {
            lines[currentIdx].click();
            e.preventDefault();
          }
          return;
        } else {
          return;
        }
        e.preventDefault();
        if (targetIdx >= 0) {
          lines[targetIdx].tabIndex = 0;
          if (currentIdx >= 0 && currentIdx !== targetIdx) {
            lines[currentIdx].tabIndex = -1;
          }
          lines[targetIdx].focus();
          lines[targetIdx].scrollIntoView({ block: "nearest" });
        }
      });

      // Wrap #op-list-panel: toolbar above, then a row with the frozen
      // line-number column alongside the scrollable panel.
      const opListPanelEl = document.getElementById("op-list-panel");
      opListPanelEl.addEventListener("scroll", () => {
        opNumCol.scrollTop = opListPanelEl.scrollTop;
      });

      // Replace #op-list-panel in the DOM *before* moving it into opListBody,
      // otherwise replaceWith() would act on its new (detached) position.
      const opListWrapper = document.createElement("div");
      opListWrapper.className = "op-list-panel-wrapper";
      opListPanelEl.replaceWith(opListWrapper);

      const opListBody = document.createElement("div");
      opListBody.className = "op-list-body";
      opListBody.append(opNumCol, opListPanelEl);

      opListWrapper.append(
        makeSearchToolbar({
          total: opList.fnArray.length,
          getText: i => opTexts[i],
          jumpToItem(i) {
            if (opHighlightedIdx >= 0) {
              opLines[opHighlightedIdx]?.classList.remove("cs-match");
              opNumCol.children[opHighlightedIdx]?.classList.remove("cs-match");
            }
            opHighlightedIdx = i;
            if (i < 0) {
              return;
            }
            opLines[i].classList.add("cs-match");
            opNumCol.children[i]?.classList.add("cs-match");
            opLines[i].scrollIntoView({ block: "nearest" });
          },
        }),
        opListBody
      );
    }
  } catch (err) {
    opListEl.replaceChildren(makeErrorEl(err.message));
  } finally {
    markLoading(-1);
  }
}

// PDF Name objects arrive as { name: "..." } after structured clone.
function isPDFName(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof val.name === "string" &&
    Object.keys(val).length === 1
  );
}

// Ref objects arrive as { num: N, gen: G } after structured clone.
function isRefObject(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof val.num === "number" &&
    typeof val.gen === "number" &&
    Object.keys(val).length === 2
  );
}

function refLabel(ref) {
  return ref.gen !== 0 ? `${ref.num}R${ref.gen}` : `${ref.num}R`;
}

// Page content streams:
// { contentStream: true, instructions, cmdNames, rawContents }.
function isContentStream(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    val.contentStream === true &&
    Array.isArray(val.instructions) &&
    Array.isArray(val.rawContents)
  );
}

// Streams: { dict, bytes }, { dict, imageData },
// or { dict, contentStream: true, instructions, cmdNames } (Form XObject).
function isStream(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    Object.prototype.hasOwnProperty.call(val, "dict") &&
    (Object.prototype.hasOwnProperty.call(val, "bytes") ||
      Object.prototype.hasOwnProperty.call(val, "imageData") ||
      val.contentStream === true)
  );
}

function isImageStream(val) {
  return (
    isStream(val) && Object.prototype.hasOwnProperty.call(val, "imageData")
  );
}

function isFormXObjectStream(val) {
  return isStream(val) && val.contentStream === true;
}

/** Create a bare div.node treeitem with an optional "key: " prefix. */
function makeNodeEl(key) {
  const node = document.createElement("div");
  node.className = "node";
  node.setAttribute("role", "treeitem");
  node.tabIndex = -1;
  if (key !== null) {
    node.append(makeSpan("key", key), makeSpan("separator", ": "));
  }
  return node;
}

/**
 * Render one key/value pair as a <div class="node">.
 * @param {string|null} key   Dict key, array index, or null for root.
 * @param {*}           value
 * @param {PDFDocumentProxy} doc
 */
function renderNode(key, value, doc) {
  const node = makeNodeEl(key);
  node.append(renderValue(value, doc));
  return node;
}

/**
 * Populate a container element with the direct children of a value.
 * Used both by renderValue (inside expandables) and renderRef (directly
 * into the ref's children container, avoiding an extra toggle level).
 */
function buildChildren(value, doc, container) {
  if (isStream(value)) {
    for (const [k, v] of Object.entries(value.dict)) {
      container.append(renderNode(k, v, doc));
    }
    if (isImageStream(value)) {
      container.append(renderImageData(value.imageData));
    } else if (isFormXObjectStream(value)) {
      const contentNode = makeNodeEl("content");
      const csLabel = `[Content Stream, ${value.instructions.length} instructions]`;
      const csLabelEl = makeSpan("stream-label", csLabel);
      contentNode.append(
        makeExpandable(csLabelEl, csLabel, c =>
          buildContentStreamPanel(value, c, csLabelEl)
        )
      );
      container.append(contentNode);
    } else {
      const byteNode = makeNodeEl("bytes");
      byteNode.append(
        makeSpan("stream-label", `<${value.bytes.length} raw bytes>`)
      );
      container.append(byteNode);

      const bytesContentEl = document.createElement("div");
      bytesContentEl.className = "bytes-content";
      bytesContentEl.append(formatBytes(value.bytes));
      container.append(bytesContentEl);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => container.append(renderNode(String(i), v, doc)));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      container.append(renderNode(k, v, doc));
    }
  } else {
    container.append(renderNode(null, value, doc));
  }
}

/**
 * Render a single content-stream token as a styled span.
 */
function renderToken(token) {
  if (!token) {
    return makeSpan("token-null", "null");
  }
  switch (token.type) {
    case "cmd":
      return makeSpan("token-cmd", token.value);
    case "name":
      return makeSpan("token-name", "/" + token.value);
    case "ref":
      return makeSpan("token-ref", `${token.num} ${token.gen} R`);
    case "number":
      return makeSpan("token-num", String(token.value));
    case "string":
      return makeSpan("token-str", JSON.stringify(token.value));
    case "boolean":
      return makeSpan("token-bool", String(token.value));
    case "null":
      return makeSpan("token-null", "null");
    case "array": {
      const span = document.createElement("span");
      span.className = "token-array";
      span.append(makeSpan("bracket", "["));
      for (const item of token.value) {
        span.append(document.createTextNode(" "));
        span.append(renderToken(item));
      }
      span.append(document.createTextNode(" "));
      span.append(makeSpan("bracket", "]"));
      return span;
    }
    case "dict": {
      const span = document.createElement("span");
      span.className = "token-dict";
      span.append(makeSpan("bracket", "<<"));
      for (const [k, v] of Object.entries(token.value)) {
        span.append(document.createTextNode(" "));
        span.append(makeSpan("token-name", "/" + k));
        span.append(document.createTextNode(" "));
        span.append(renderToken(v));
      }
      span.append(document.createTextNode(" "));
      span.append(makeSpan("bracket", ">>"));
      return span;
    }
    default:
      return makeSpan("token-unknown", String(token.value ?? token.type));
  }
}

/**
 * Return the plain-text representation of a token (mirrors renderToken).
 * Used to build searchable strings for every instruction.
 */
function tokenToText(token) {
  if (!token) {
    return "null";
  }
  switch (token.type) {
    case "cmd":
      return token.value;
    case "name":
      return "/" + token.value;
    case "ref":
      return `${token.num} ${token.gen} R`;
    case "number":
      return String(token.value);
    case "string":
      return JSON.stringify(token.value);
    case "boolean":
      return String(token.value);
    case "null":
      return "null";
    case "array":
      return `[ ${token.value.map(tokenToText).join(" ")} ]`;
    case "dict": {
      const inner = Object.entries(token.value)
        .map(([k, v]) => `/${k} ${tokenToText(v)}`)
        .join(" ");
      return `<< ${inner} >>`;
    }
    default:
      return String(token.value ?? token.type);
  }
}

/**
 * Populate container with one .content-stm-instruction div per instruction.
 * Shared by Page content streams and Form XObject streams.
 */
const INSTRUCTION_BATCH_SIZE = 500;
// Maximum instructions kept in the DOM at once (two batches).
const MAX_RENDERED_INSTRUCTIONS = INSTRUCTION_BATCH_SIZE * 2;

/**
 * Build and return a sticky search/goto toolbar div.
 *
 * @param {object} opts
 * @param {number}   opts.total      Total number of items.
 * @param {function} opts.getText    getText(i) → plain-text string for item i.
 * @param {function} opts.jumpToItem jumpToItem(i) highlights item i and scrolls
 *                                  to it; jumpToItem(-1) clears the highlight.
 * @returns {HTMLElement} The toolbar element (class "cs-goto-bar").
 */
let _searchToolbarCounter = 0;

function makeSearchToolbar({ total, getText, jumpToItem, actions = null }) {
  const toolbarId = ++_searchToolbarCounter;
  const gotoBar = document.createElement("div");
  gotoBar.className = "cs-goto-bar";

  // Search group (left side)
  const searchGroup = document.createElement("div");
  searchGroup.className = "cs-search-group";

  const searchErrorId = `search-error-${toolbarId}`;

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "cs-search-input";
  searchInput.placeholder = "Search for\u2026";
  searchInput.setAttribute("aria-label", "Search instructions");
  searchInput.setAttribute("aria-describedby", searchErrorId);

  const searchError = document.createElement("span");
  searchError.id = searchErrorId;
  searchError.className = "sr-only";
  searchError.setAttribute("role", "alert");

  const prevBtn = document.createElement("button");
  prevBtn.className = "cs-nav-btn";
  prevBtn.textContent = "↑";
  prevBtn.setAttribute("aria-label", "Previous match");
  prevBtn.disabled = true;

  const nextBtn = document.createElement("button");
  nextBtn.className = "cs-nav-btn";
  nextBtn.textContent = "↓";
  nextBtn.setAttribute("aria-label", "Next match");
  nextBtn.disabled = true;

  const matchInfo = document.createElement("span");
  matchInfo.className = "cs-match-info";

  function makeCheckboxLabel(text) {
    const label = document.createElement("label");
    label.className = "cs-check-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    label.append(cb, ` ${text}`);
    return { label, cb };
  }

  const { label: ignoreCaseLabel, cb: ignoreCaseCb } =
    makeCheckboxLabel("Ignore case");
  const { label: regexLabel, cb: regexCb } = makeCheckboxLabel("Regex");

  searchGroup.append(
    searchInput,
    searchError,
    prevBtn,
    nextBtn,
    matchInfo,
    ignoreCaseLabel,
    regexLabel
  );

  // Go-to-line input (right side)
  const gotoInput = document.createElement("input");
  gotoInput.type = "text";
  gotoInput.className = "cs-goto";
  gotoInput.placeholder = "Go to line\u2026";
  gotoInput.setAttribute("aria-label", "Go to line");

  if (actions) {
    gotoBar.append(actions);
  }
  gotoBar.append(searchGroup, gotoInput);

  let searchMatches = [];
  let currentMatchIdx = -1;

  function updateMatchInfo() {
    if (!searchInput.value) {
      matchInfo.textContent = "";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else if (searchMatches.length === 0) {
      matchInfo.textContent = "No results";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      matchInfo.textContent = `${currentMatchIdx + 1} / ${searchMatches.length}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }

  function computeMatches() {
    jumpToItem(-1);
    searchMatches = [];
    currentMatchIdx = -1;

    const query = searchInput.value;
    if (!query) {
      updateMatchInfo();
      return false;
    }

    let test;
    if (regexCb.checked) {
      try {
        const re = new RegExp(query, ignoreCaseCb.checked ? "i" : "");
        test = str => re.test(str);
        searchInput.removeAttribute("aria-invalid");
        searchError.textContent = "";
      } catch {
        searchInput.setAttribute("aria-invalid", "true");
        searchError.textContent = "Invalid regular expression";
        updateMatchInfo();
        return false;
      }
    } else {
      const needle = ignoreCaseCb.checked ? query.toLowerCase() : query;
      test = str =>
        (ignoreCaseCb.checked ? str.toLowerCase() : str).includes(needle);
    }
    searchInput.removeAttribute("aria-invalid");
    searchError.textContent = "";

    for (let i = 0; i < total; i++) {
      if (test(getText(i))) {
        searchMatches.push(i);
      }
    }
    return searchMatches.length > 0;
  }

  function navigateMatch(delta) {
    if (!searchMatches.length) {
      return;
    }
    currentMatchIdx =
      (currentMatchIdx + delta + searchMatches.length) % searchMatches.length;
    jumpToItem(searchMatches[currentMatchIdx]);
    updateMatchInfo();
  }

  function runSearch() {
    if (computeMatches() && searchMatches.length) {
      currentMatchIdx = 0;
      jumpToItem(searchMatches[0]);
    }
    updateMatchInfo();
  }

  searchInput.addEventListener("input", runSearch);
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      navigateMatch(e.shiftKey ? -1 : 1);
    }
  });
  prevBtn.addEventListener("click", () => navigateMatch(-1));
  nextBtn.addEventListener("click", () => navigateMatch(1));
  ignoreCaseCb.addEventListener("change", runSearch);
  regexCb.addEventListener("change", runSearch);

  gotoInput.addEventListener("keydown", e => {
    if (e.key !== "Enter") {
      return;
    }
    const n = parseInt(gotoInput.value, 10);
    if (Number.isNaN(n) || n < 1 || n > total) {
      gotoInput.setAttribute("aria-invalid", "true");
      return;
    }
    gotoInput.removeAttribute("aria-invalid");
    jumpToItem(n - 1);
  });

  return gotoBar;
}

/**
 * Build a scrollable panel with a frozen line-number column and a
 * search/goto toolbar, backed by an IntersectionObserver virtual scroll
 * that keeps at most MAX_RENDERED_INSTRUCTIONS rows in the DOM at once.
 *
 * @param {object}      opts
 * @param {number}      opts.total       Total number of rows.
 * @param {string}      opts.preClass    className(s) for the content <div>.
 * @param {Function}    opts.getText     (i) => plain-text string for search.
 * @param {Function}    opts.makeItemEl  (i, isHighlighted) => HTMLElement.
 * @param {HTMLElement} opts.container   Target element; panel is appended here.
 */
function buildVirtualScrollPanel({
  total,
  preClass,
  getText,
  makeItemEl,
  container,
  actions = null,
}) {
  if (total === 0) {
    return;
  }

  const scrollEl = document.createElement("div");
  scrollEl.className = "content-stm-scroll";

  // Left panel: line-number column. Lives outside the scroll container so it
  // is unaffected by horizontal scroll. Its scrollTop is synced via JS.
  const numCol = document.createElement("div");
  numCol.className = "cs-line-nums-col";
  numCol.style.setProperty("--line-num-width", `${String(total).length}ch`);

  // Right panel: the actual scroll container.
  const innerEl = document.createElement("div");
  innerEl.className = "content-stm-inner";
  innerEl.addEventListener("scroll", () => {
    numCol.scrollTop = innerEl.scrollTop;
  });

  // Right panel content: item rows.
  const pre = document.createElement("div");
  pre.className = preClass;
  innerEl.append(pre);

  // Body row: frozen num column + scrollable content side by side.
  const body = document.createElement("div");
  body.className = "content-stm-body";
  body.append(numCol, innerEl);

  // Sentinels bracket the rendered window inside pre:
  //   topSentinel  [startIndex .. endIndex)  bottomSentinel
  const topSentinel = document.createElement("div");
  topSentinel.className = "content-stm-load-sentinel";
  const bottomSentinel = document.createElement("div");
  bottomSentinel.className = "content-stm-load-sentinel";

  let startIndex = 0;
  let endIndex = Math.min(INSTRUCTION_BATCH_SIZE, total);
  let highlightedIndex = -1;

  function makeNumEl(i) {
    const item = document.createElement("div");
    item.className = "cs-num-item";
    if (i === highlightedIndex) {
      item.classList.add("cs-match");
    }
    item.append(makeSpan("cs-line-num", String(i + 1)));
    return item;
  }

  function renderRange(from, to) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      frag.append(makeItemEl(i, i === highlightedIndex));
    }
    return frag;
  }

  function renderNumRange(from, to) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      frag.append(makeNumEl(i));
    }
    return frag;
  }

  pre.append(topSentinel, renderRange(0, endIndex), bottomSentinel);
  numCol.append(renderNumRange(0, endIndex));

  function jumpToTarget(targetIndex) {
    // Clear both the content window and the number column.
    let el = topSentinel.nextElementSibling;
    while (el && el !== bottomSentinel) {
      const next = el.nextElementSibling;
      el.remove();
      el = next;
    }
    numCol.replaceChildren();

    // Re-render a window centred around the target.
    const half = Math.floor(MAX_RENDERED_INSTRUCTIONS / 2);
    startIndex = Math.max(0, targetIndex - half);
    endIndex = Math.min(total, startIndex + MAX_RENDERED_INSTRUCTIONS);
    startIndex = Math.max(0, endIndex - MAX_RENDERED_INSTRUCTIONS);
    topSentinel.after(renderRange(startIndex, endIndex));
    numCol.append(renderNumRange(startIndex, endIndex));

    // Scroll to centre the target in innerEl.
    // pre.children: [0]=topSentinel, [1..n]=rows, [n+1]=bottomSentinel
    const targetEl = pre.children[targetIndex - startIndex + 1];
    if (targetEl) {
      const targetRect = targetEl.getBoundingClientRect();
      const innerRect = innerEl.getBoundingClientRect();
      const available = innerEl.clientHeight;
      innerEl.scrollTop +=
        targetRect.top -
        innerRect.top -
        available / 2 +
        targetEl.clientHeight / 2;
    }
  }

  function jumpToItem(i) {
    pre.querySelector(".cs-match")?.classList.remove("cs-match");
    numCol.querySelector(".cs-match")?.classList.remove("cs-match");
    if (i < 0) {
      highlightedIndex = -1;
      return;
    }
    highlightedIndex = i;
    jumpToTarget(i);
    pre.children[i - startIndex + 1]?.classList.add("cs-match");
    numCol.children[i - startIndex]?.classList.add("cs-match");
  }

  scrollEl.append(
    makeSearchToolbar({ total, getText, jumpToItem, actions }),
    body
  );

  if (total <= INSTRUCTION_BATCH_SIZE) {
    container.append(scrollEl);
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        if (entry.target === bottomSentinel) {
          // Append next batch at bottom.
          const newEnd = Math.min(endIndex + INSTRUCTION_BATCH_SIZE, total);
          if (newEnd === endIndex) {
            continue;
          }
          bottomSentinel.before(renderRange(endIndex, newEnd));
          numCol.append(renderNumRange(endIndex, newEnd));
          endIndex = newEnd;

          // Trim oldest rows from top if window exceeds the max.
          if (endIndex - startIndex > MAX_RENDERED_INSTRUCTIONS) {
            const removeCount =
              endIndex - startIndex - MAX_RENDERED_INSTRUCTIONS;
            const heightBefore = pre.scrollHeight;
            for (let i = 0; i < removeCount; i++) {
              topSentinel.nextElementSibling?.remove();
              numCol.firstElementChild?.remove();
            }
            startIndex += removeCount;
            // Compensate so the visible content doesn't jump upward.
            innerEl.scrollTop -= heightBefore - pre.scrollHeight;
          }
        } else {
          // Prepend next batch at top.
          if (startIndex === 0) {
            continue;
          }
          const newStart = Math.max(0, startIndex - INSTRUCTION_BATCH_SIZE);
          const scrollBefore = innerEl.scrollTop;
          const heightBefore = pre.scrollHeight;
          topSentinel.after(renderRange(newStart, startIndex));
          numCol.prepend(renderNumRange(newStart, startIndex));
          // Compensate so the visible content doesn't jump downward.
          innerEl.scrollTop = scrollBefore + (pre.scrollHeight - heightBefore);
          startIndex = newStart;

          // Trim oldest rows from bottom if window exceeds the max.
          if (endIndex - startIndex > MAX_RENDERED_INSTRUCTIONS) {
            const removeCount =
              endIndex - startIndex - MAX_RENDERED_INSTRUCTIONS;
            for (let i = 0; i < removeCount; i++) {
              bottomSentinel.previousElementSibling?.remove();
              numCol.lastElementChild?.remove();
            }
            endIndex -= removeCount;
          }
        }
      }
    },
    { root: innerEl, rootMargin: "200px" }
  );

  observer.observe(topSentinel);
  observer.observe(bottomSentinel);

  container.append(scrollEl);
}

function makeInstrItemEl(isHighlighted) {
  const el = document.createElement("div");
  el.className = "content-stm-instruction";
  if (isHighlighted) {
    el.classList.add("cs-match");
  }
  return el;
}

function buildInstructionLines(val, container, actions = null) {
  const { instructions, cmdNames } = val;
  const total = instructions.length;

  // Pre-compute indentation depth for every instruction so that any
  // slice [from, to) can be rendered without replaying from the start.
  const depths = new Int32Array(total);
  let d = 0;
  for (let i = 0; i < total; i++) {
    const cmd = instructions[i].cmd;
    if (cmd === "ET" || cmd === "Q" || cmd === "EMC") {
      d = Math.max(0, d - 1);
    }
    depths[i] = d;
    if (cmd === "BT" || cmd === "q" || cmd === "BDC") {
      d++;
    }
  }

  // Pre-compute a plain-text string per instruction for searching.
  const instrTexts = instructions.map(instr => {
    const parts = instr.args.map(tokenToText);
    if (instr.cmd !== null) {
      parts.push(instr.cmd);
    }
    return parts.join(" ");
  });

  buildVirtualScrollPanel({
    total,
    preClass: "content-stream",
    getText: i => instrTexts[i],
    actions,
    makeItemEl(i, isHighlighted) {
      const instr = instructions[i];
      const line = makeInstrItemEl(isHighlighted);
      // Wrap the instruction content so that indentation shifts the tokens.
      const content = document.createElement("span");
      if (depths[i] > 0) {
        content.style.paddingInlineStart = `${depths[i] * 1.5}em`;
      }
      for (const arg of instr.args) {
        content.append(renderToken(arg));
        content.append(document.createTextNode(" "));
      }
      if (instr.cmd !== null) {
        const cmdEl = makeSpan("token-cmd", instr.cmd);
        const opsName = cmdNames[instr.cmd];
        if (opsName) {
          cmdEl.title = opsName;
        }
        content.append(cmdEl);
      }
      line.append(content);
      return line;
    },
    container,
  });
}

// Fills container with a raw-bytes virtual-scroll panel.
function buildRawBytesPanel(rawBytes, container, actions = null) {
  const lines = rawBytes.split(/\r?\n|\r/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  buildVirtualScrollPanel({
    total: lines.length,
    preClass: "content-stream raw-bytes-stream",
    getText: i => lines[i],
    makeItemEl(i, isHighlighted) {
      const el = makeInstrItemEl(isHighlighted);
      el.append(formatBytes(lines[i]));
      return el;
    },
    container,
    actions,
  });
}

// Creates a "Parsed" toggle button. aria-pressed=true means the parsed view
// is currently active; clicking switches to the other view.
function makeParseToggleBtn(isParsed, onToggle) {
  const btn = document.createElement("button");
  btn.className = "cs-nav-btn";
  btn.textContent = "Parsed";
  btn.setAttribute("aria-pressed", String(isParsed));
  btn.title = isParsed ? "Show raw bytes" : "Show parsed instructions";
  btn.addEventListener("click", onToggle);
  return btn;
}

// Fills container with the content stream panel (parsed or raw), with a
// toggle button in the toolbar that swaps the view in-place.
function buildContentStreamPanel(val, container, labelEl = null) {
  let isParsed = true;
  const rawBytes = val.rawBytes ?? val.bytes;
  const rawLines = rawBytes ? rawBytes.split(/\r?\n|\r/) : [];
  if (rawLines.at(-1) === "") {
    rawLines.pop();
  }
  const parsedLabel = `[Content Stream, ${val.instructions.length} instructions]`;
  const rawLabel = `[Content Stream, ${rawLines.length} lines]`;

  function rebuild() {
    container.replaceChildren();
    if (labelEl) {
      labelEl.textContent = isParsed ? parsedLabel : rawLabel;
    }
    const btn = makeParseToggleBtn(isParsed, () => {
      isParsed = !isParsed;
      rebuild();
    });
    if (isParsed) {
      buildInstructionLines(val, container, btn);
    } else {
      buildRawBytesPanel(rawBytes, container, btn);
    }
  }

  rebuild();
}

/**
 * Render Page content stream as an expandable panel with a Parsed/Raw toggle.
 */
function renderContentStream(val) {
  const label = `[Content Stream, ${val.instructions.length} instructions]`;
  const labelEl = makeSpan("stream-label", label);
  return makeExpandable(labelEl, label, container =>
    buildContentStreamPanel(val, container, labelEl)
  );
}

/**
 * Render a value inline (primitive) or as an expandable widget.
 * Returns a Node or DocumentFragment suitable for appendChild().
 */
function renderValue(value, doc) {
  // Ref string ("10 0 R") – lazy expandable via getRawData()
  if (typeof value === "string" && REF_RE.test(value)) {
    return renderRef(value, doc);
  }

  // Ref object { num, gen } – lazy expandable via getRawData()
  if (isRefObject(value)) {
    return renderRef(value, doc);
  }

  // PDF Name → /Name
  if (isPDFName(value)) {
    return makeSpan("name-value", "/" + value.name);
  }

  // Content stream (Page Contents) → expandable with Parsed/Raw toggle
  if (isContentStream(value)) {
    return renderContentStream(value, doc);
  }

  // Stream → expandable showing dict entries + byte count or image preview
  if (isStream(value)) {
    return renderExpandable("[Stream]", "stream-label", container =>
      buildChildren(value, doc, container)
    );
  }

  // Plain object (dict)
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return makeSpan("bracket", "{}");
    }
    return renderExpandable(`{${keys.length}}`, "bracket", container =>
      buildChildren(value, doc, container)
    );
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return makeSpan("bracket", "[]");
    }
    return renderExpandable(`[${value.length}]`, "bracket", container =>
      buildChildren(value, doc, container)
    );
  }

  // Primitives
  if (typeof value === "string") {
    return makeSpan("str-value", JSON.stringify(value));
  }
  if (typeof value === "number") {
    return makeSpan("num-value", String(value));
  }
  if (typeof value === "boolean") {
    return makeSpan("bool-value", String(value));
  }
  return makeSpan("null-value", "null");
}

/**
 * Build a lazy-loading expand/collapse widget for a ref (string or object).
 * Results are cached in `refCache` keyed by "num:gen".
 */
function renderRef(ref, doc) {
  // Derive the cache key and display label from whichever form we received.
  // String refs look like "10 0 R"; object refs are { num, gen }.
  let cacheKey, label;
  if (typeof ref === "string") {
    const parts = ref.split(" ");
    cacheKey = `${parts[0]}:${parts[1]}`;
    label = ref;
  } else {
    cacheKey = `${ref.num}:${ref.gen}`;
    label = refLabel(ref);
  }
  return makeExpandable(
    makeSpan("ref", label),
    `reference ${label}`,
    childrenEl => {
      const spinner = document.createElement("div");
      spinner.setAttribute("role", "status");
      spinner.textContent = "Loading…";
      childrenEl.append(spinner);
      markLoading(1);
      if (!refCache.has(cacheKey)) {
        refCache.set(cacheKey, doc.getRawData({ ref }));
      }
      refCache
        .get(cacheKey)
        .then(result => {
          childrenEl.replaceChildren();
          buildChildren(result, doc, childrenEl);
        })
        .catch(err => childrenEl.replaceChildren(makeErrorEl(err.message)))
        .finally(() => markLoading(-1));
    }
  );
}

/**
 * Build a shared expand/collapse widget.
 * labelEl is the element shown between the toggle arrow and the children.
 * ariaLabel is used for the toggle and group aria-labels.
 * onFirstOpen(childrenEl) is called once when first expanded (may be async).
 */
function makeExpandable(labelEl, ariaLabel, onFirstOpen) {
  const toggleEl = document.createElement("span");
  toggleEl.textContent = ARROW_COLLAPSED;
  toggleEl.setAttribute("role", "button");
  toggleEl.setAttribute("tabindex", "0");
  toggleEl.setAttribute("aria-expanded", "false");
  toggleEl.setAttribute("aria-label", `Expand ${ariaLabel}`);
  labelEl.setAttribute("aria-hidden", "true");

  const childrenEl = document.createElement("div");
  childrenEl.className = "hidden";
  childrenEl.setAttribute("role", "group");
  childrenEl.setAttribute("aria-label", `Contents of ${ariaLabel}`);

  let open = false,
    done = false;
  const toggle = () => {
    open = !open;
    toggleEl.textContent = open ? ARROW_EXPANDED : ARROW_COLLAPSED;
    toggleEl.setAttribute("aria-expanded", String(open));
    childrenEl.classList.toggle("hidden", !open);
    if (open && !done) {
      done = true;
      onFirstOpen(childrenEl);
    }
  };
  toggleEl.addEventListener("click", toggle);
  toggleEl.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  labelEl.addEventListener("click", toggle);

  const frag = document.createDocumentFragment();
  frag.append(toggleEl, labelEl, childrenEl);
  return frag;
}

/**
 * Build a synchronous expand/collapse widget.
 * @param {string}   label      Text shown on the collapsed line.
 * @param {string}   labelClass CSS class for the label.
 * @param {Function} buildFn    Called with (containerEl) on first open.
 */
function renderExpandable(label, labelClass, buildFn) {
  return makeExpandable(makeSpan(labelClass, label), label, c => buildFn(c));
}

/**
 * Render image data (RGBA Uint8ClampedArray) into a <canvas> node.
 */
function renderImageData({ width, height, data }) {
  const node = document.createElement("div");
  node.className = "node";
  const keyEl = document.createElement("span");
  keyEl.className = "key";
  keyEl.textContent = "imageData";
  const sep = document.createElement("span");
  sep.className = "separator";
  sep.textContent = ": ";
  const info = document.createElement("span");
  info.className = "stream-label";
  info.textContent = `<${width}×${height}>`;
  node.append(keyEl, sep, info);

  const canvas = document.createElement("canvas");
  canvas.className = "image-preview";
  canvas.width = width;
  canvas.height = height;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${width / dpr}px`;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.setAttribute("aria-label", `Image preview ${width}×${height}`);
  const ctx = canvas.getContext("2d");
  const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
  ctx.putImageData(imgData, 0, 0);
  node.append(canvas);
  return node;
}

function isMostlyText(str) {
  let printable = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) {
      printable++;
    }
  }
  return str.length > 0 && printable / str.length >= 0.8;
}

function formatBytes(str) {
  const mostlyText = isMostlyText(str);
  const frag = document.createDocumentFragment();

  if (!mostlyText) {
    // Binary content: render every byte as hex in a single span.
    const span = document.createElement("span");
    span.className = "bytes-hex";
    const hexParts = [];
    for (let i = 0; i < str.length; i++) {
      hexParts.push(
        str.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0")
      );
    }
    span.textContent = hexParts.join("\u00B7\u200B");
    frag.append(span);
    return frag;
  }

  // Text content: printable ASCII + 0x0A as-is, other bytes as hex spans.
  const isPrintable = c => (c >= 0x20 && c <= 0x7e) || c === 0x0a;
  let i = 0;
  while (i < str.length) {
    const code = str.charCodeAt(i);
    if (isPrintable(code)) {
      let run = "";
      while (i < str.length && isPrintable(str.charCodeAt(i))) {
        run += str[i++];
      }
      frag.append(document.createTextNode(run));
    } else {
      const span = document.createElement("span");
      span.className = "bytes-hex";
      const hexParts = [];
      while (i < str.length && !isPrintable(str.charCodeAt(i))) {
        hexParts.push(
          str.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0")
        );
        i++;
      }
      span.textContent = hexParts.join("\u00B7\u200B");
      frag.append(span);
    }
  }
  return frag;
}

/** Create a <span> with the given class and text content. */
function makeSpan(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}
