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

// Methods that modify the current transform matrix.
const TRANSFORM_METHODS = new Set([
  "resetTransform",
  "rotate",
  "scale",
  "setTransform",
  "transform",
  "translate",
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

// Color properties whose value is rendered as a swatch.
const COLOR_CTX_PROPS = new Set(["fillStyle", "shadowColor", "strokeStyle"]);

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

// Cached media queries used by drawCheckerboard.
const _prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const _prefersHCM = window.matchMedia("(forced-colors: active)");

/**
 * Draw a checkerboard pattern filling the canvas, to reveal transparency.
 * Mirrors the pattern used in src/display/editor/stamp.js.
 */
function drawCheckerboard(ctx, width, height) {
  const isHCM = _prefersHCM.matches;
  const isDark = _prefersDark.matches;
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
  const pattern =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(boxDim * 2, boxDim * 2)
      : Object.assign(document.createElement("canvas"), {
          width: boxDim * 2,
          height: boxDim * 2,
        });
  const patternCtx = pattern.getContext("2d");
  if (!patternCtx) {
    return;
  }
  patternCtx.fillStyle = light;
  patternCtx.fillRect(0, 0, boxDim * 2, boxDim * 2);
  patternCtx.fillStyle = dark;
  patternCtx.fillRect(0, 0, boxDim, boxDim);
  patternCtx.fillRect(boxDim, boxDim, boxDim, boxDim);
  ctx.save();
  const fillPattern = ctx.createPattern(pattern, "repeat");
  if (!fillPattern) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = fillPattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Tracks and displays the CanvasRenderingContext2D graphics state for all
 * contexts created during a stepped render.
 *
 * @param {HTMLElement} panelEl  The #gfx-state-panel DOM element.
 */
class CanvasContextDetailsView {
  #panel;

  // Map<label, Map<prop, value>> — live graphics state per tracked context.
  #ctxStates = new Map();

  // Map<label, Array<Map<prop, value>>> — save() stack snapshots per context.
  #ctxStateStacks = new Map();

  // Map<label, number|null> — which stack frame is shown; null = live/current.
  #ctxStackViewIdx = new Map();

  // Map<label, Map<prop, {valEl, swatchEl?}>> — DOM elements for live updates.
  #gfxStateValueElements = new Map();

  // Map<label, {container, prevBtn, pos, nextBtn}> — stack-nav DOM elements.
  #gfxStateNavElements = new Map();

  constructor(panelEl) {
    this.#panel = panelEl;
  }

  /**
   * Wrap a CanvasRenderingContext2D to track its graphics state.
   * Returns a Proxy that keeps internal state in sync and updates the DOM.
   */
  wrapContext(ctx, label) {
    const state = new Map();
    for (const [prop, read] of CTX_PROP_READERS) {
      state.set(prop, read(ctx));
    }
    this.#ctxStates.set(label, state);
    this.#ctxStateStacks.set(label, []);
    this.#ctxStackViewIdx.set(label, null);
    // If the panel is already visible (stepping in progress), rebuild it so
    // the new context section is added and its live-update entries are
    // registered.
    if (this.#gfxStateValueElements.size > 0) {
      this.build();
    }

    return new Proxy(ctx, {
      set: (target, prop, value) => {
        target[prop] = value;
        if (TRACKED_CTX_PROPS.has(prop)) {
          state.set(prop, value);
          this.#updatePropEl(label, prop, value);
        }
        return true;
      },
      get: (target, prop) => {
        const val = target[prop];
        if (typeof val !== "function") {
          return val;
        }
        if (prop === "save") {
          return (...args) => {
            const result = val.apply(target, args);
            this.#ctxStateStacks.get(label).push(this.#copyState(state));
            this.#updateStackNav(label);
            return result;
          };
        }
        if (prop === "restore") {
          return (...args) => {
            const result = val.apply(target, args);
            for (const [p, read] of CTX_PROP_READERS) {
              const v = read(target);
              state.set(p, v);
              this.#updatePropEl(label, p, v);
            }
            const stack = this.#ctxStateStacks.get(label);
            if (stack.length > 0) {
              stack.pop();
              // If the viewed frame was just removed, fall back to current.
              const viewIndex = this.#ctxStackViewIdx.get(label);
              if (viewIndex !== null && viewIndex >= stack.length) {
                this.#ctxStackViewIdx.set(label, null);
                this.#showState(label);
              }
              this.#updateStackNav(label);
            }
            return result;
          };
        }
        if (prop === "setLineDash") {
          return segments => {
            val.call(target, segments);
            const dash = target.getLineDash();
            state.set("lineDash", dash);
            this.#updatePropEl(label, "lineDash", dash);
          };
        }
        if (TRANSFORM_METHODS.has(prop)) {
          return (...args) => {
            const result = val.apply(target, args);
            const { a, b, c, d, e, f } = target.getTransform();
            const tf = { a, b, c, d, e, f };
            state.set("transform", tf);
            this.#updatePropEl(label, "transform", tf);
            return result;
          };
        }
        return val.bind(target);
      },
    });
  }

  /**
   * Override canvas.getContext to return a tracked proxy for "2d" contexts.
   * Caches the proxy so repeated getContext("2d") calls return the same
   * wrapper.
   */
  wrapCanvasGetContext(canvas, label) {
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
        wrappedCtx = this.wrapContext(ctx, label);
      }
      return wrappedCtx;
    };
    return canvas.getContext("2d");
  }

  /**
   * Rebuild the graphics-state panel DOM for all currently tracked contexts.
   * Shows the panel if it was hidden.
   */
  build() {
    this.#panel.hidden = false;
    this.#panel.replaceChildren();
    this.#gfxStateValueElements.clear();
    this.#gfxStateNavElements.clear();

    for (const [ctxLabel, state] of this.#ctxStates) {
      const propEls = new Map();
      this.#gfxStateValueElements.set(ctxLabel, propEls);

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
      prevBtn.className = "gfx-state-stack-button";
      prevBtn.ariaLabel = "View older saved state";
      prevBtn.textContent = "←";

      const pos = document.createElement("span");
      pos.className = "gfx-state-stack-pos";

      const nextBtn = document.createElement("button");
      nextBtn.className = "gfx-state-stack-button";
      nextBtn.ariaLabel = "View newer saved state";
      nextBtn.textContent = "→";

      navContainer.append(prevBtn, pos, nextBtn);
      title.append(titleLabel, navContainer);
      section.append(title);

      this.#gfxStateNavElements.set(ctxLabel, {
        container: navContainer,
        prevBtn,
        pos,
        nextBtn,
      });

      prevBtn.addEventListener("click", () => this.#navigate(ctxLabel, -1));
      nextBtn.addEventListener("click", () => this.#navigate(ctxLabel, +1));

      for (const [prop, value] of state) {
        const row = document.createElement("div");
        row.className = "gfx-state-row";

        const key = document.createElement("span");
        key.className = "gfx-state-key";
        key.textContent = prop;

        row.append(key);

        if (prop === "transform") {
          const { math, mnEls } = this.#buildTransformMathML(value);
          row.append(math);
          propEls.set(prop, { valEl: math, swatchEl: null, mnEls });
        } else {
          const val = document.createElement("span");
          val.className = "gfx-state-val";
          const text = this.#formatCtxValue(value);
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
      this.#panel.append(section);

      // Apply the correct state for the current view index (may be a saved
      // frame).
      this.#showState(ctxLabel);
      this.#updateStackNav(ctxLabel);
    }
  }

  /** Hide the panel. */
  hide() {
    this.#panel.hidden = true;
  }

  /**
   * Scroll the panel to bring the section for the given context label into
   * view.
   */
  scrollToSection(label) {
    this.#panel
      .querySelector(`[data-ctx-label="${CSS.escape(label)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  /**
   * Clear all tracked state and reset the panel DOM.
   * Called when the debug view is reset between pages.
   */
  clear() {
    this.#ctxStates.clear();
    this.#ctxStateStacks.clear();
    this.#ctxStackViewIdx.clear();
    this.#gfxStateValueElements.clear();
    this.#gfxStateNavElements.clear();
    this.#panel.replaceChildren();
  }

  #formatCtxValue(value) {
    return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
  }

  // Shallow-copy a state Map (arrays and plain objects are cloned one level
  // deep).
  #copyState(state) {
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
  #applyPropEl(label, prop, value) {
    const entry = this.#gfxStateValueElements.get(label)?.get(prop);
    if (!entry) {
      return;
    }
    if (entry.mnEls) {
      for (const k of ["a", "b", "c", "d", "e", "f"]) {
        entry.mnEls[k].textContent = this.#formatMatrixValue(value[k]);
      }
      return;
    }
    const text = this.#formatCtxValue(value);
    entry.valEl.textContent = text;
    entry.valEl.title = text;
    if (entry.swatchEl) {
      entry.swatchEl.style.background = String(value);
    }
  }

  // Update DOM for a live setter — skipped when the user is browsing a saved
  // state so that live updates don't overwrite the frozen view.
  #updatePropEl(label, prop, value) {
    if (this.#ctxStackViewIdx.get(label) !== null) {
      return;
    }
    this.#applyPropEl(label, prop, value);
  }

  // Re-render all value DOM elements for label using the currently-viewed
  // state.
  #showState(label) {
    const viewIdx = this.#ctxStackViewIdx.get(label);
    const stateToShow =
      viewIdx === null
        ? this.#ctxStates.get(label)
        : this.#ctxStateStacks.get(label)?.[viewIdx];
    if (!stateToShow) {
      return;
    }
    for (const [prop, value] of stateToShow) {
      this.#applyPropEl(label, prop, value);
    }
  }

  // Sync the stack-nav button states and position counter for a context.
  #updateStackNav(label) {
    const nav = this.#gfxStateNavElements.get(label);
    if (!nav) {
      return;
    }
    const stack = this.#ctxStateStacks.get(label) ?? [];
    const viewIdx = this.#ctxStackViewIdx.get(label);
    nav.container.hidden = stack.length === 0;
    if (stack.length === 0) {
      return;
    }
    nav.prevBtn.disabled = viewIdx === 0;
    nav.nextBtn.disabled = viewIdx === null;
    nav.pos.textContent =
      viewIdx === null ? "cur" : `${viewIdx + 1}/${stack.length}`;
  }

  // Navigate the save/restore stack view for a context.
  // delta = -1 → older (prev) frame; +1 → newer (next) frame.
  #navigate(label, delta) {
    const stack = this.#ctxStateStacks.get(label) ?? [];
    const viewIndex = this.#ctxStackViewIdx.get(label);
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
    this.#ctxStackViewIdx.set(label, newViewIndex);
    this.#showState(label);
    this.#updateStackNav(label);
  }

  #mEl(tag, ...children) {
    const el = document.createElementNS(MATHML_NS, tag);
    el.append(...children);
    return el;
  }

  #formatMatrixValue(v) {
    return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)));
  }

  #buildTransformMathML({ a, b, c, d, e, f }) {
    const mnEls = {};
    for (const [k, v] of Object.entries({ a, b, c, d, e, f })) {
      mnEls[k] = this.#mEl("mn", this.#formatMatrixValue(v));
    }
    const math = this.#mEl(
      "math",
      this.#mEl(
        "mrow",
        this.#mEl("mo", "["),
        this.#mEl(
          "mtable",
          this.#mEl(
            "mtr",
            this.#mEl("mtd", mnEls.a),
            this.#mEl("mtd", mnEls.c),
            this.#mEl("mtd", mnEls.e)
          ),
          this.#mEl(
            "mtr",
            this.#mEl("mtd", mnEls.b),
            this.#mEl("mtd", mnEls.d),
            this.#mEl("mtd", mnEls.f)
          ),
          this.#mEl(
            "mtr",
            this.#mEl("mtd", this.#mEl("mn", "0")),
            this.#mEl("mtd", this.#mEl("mn", "0")),
            this.#mEl("mtd", this.#mEl("mn", "1"))
          )
        ),
        this.#mEl("mo", "]")
      )
    );
    return { math, mnEls };
  }
}

export { CanvasContextDetailsView };
