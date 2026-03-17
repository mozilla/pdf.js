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

import { ImageKind, OPS } from "pdfjs-lib";
import { makePathFromDrawOPS } from "pdfjs/display/display_utils.js";
import { MultilineView } from "./multiline_view.js";

// Reverse map: OPS numeric id → string name, built once from the OPS object.
const OPS_TO_NAME = Object.create(null);
for (const [name, id] of Object.entries(OPS)) {
  OPS_TO_NAME[id] = name;
}

// Ops from the getTextContent() switch in evaluator.js — shown in the draw ops
// view when text-only filter is active, and used to determine step targets.
const TEXT_OP_IDS = new Set([
  OPS.setFont,
  OPS.setTextRise,
  OPS.setHScale,
  OPS.setLeading,
  OPS.moveText,
  OPS.setLeadingMoveText,
  OPS.nextLine,
  OPS.setTextMatrix,
  OPS.setCharSpacing,
  OPS.setWordSpacing,
  OPS.beginText,
  OPS.endText,
  OPS.showSpacedText,
  OPS.showText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
  OPS.beginMarkedContent,
  OPS.beginMarkedContentProps,
  OPS.endMarkedContent,
]);

// Superset of TEXT_OP_IDS — all ops that must be executed (not skipped) during
// text-only rendering. The extra ops here are infrastructure (save/restore,
// transforms, XObject wrappers) that affect the graphics state but are not
// shown in the filtered op list.
const TEXT_EXEC_OP_IDS = new Set([
  ...TEXT_OP_IDS,
  OPS.restore,
  OPS.save,
  OPS.dependency,
  OPS.transform,
  OPS.paintFormXObjectBegin,
  OPS.paintFormXObjectEnd,
  OPS.beginGroup,
  OPS.endGroup,
  OPS.setGState,
]);

const BreakpointType = {
  PAUSE: 0,
  SKIP: 1,
};

// Single hidden color input reused for all swatch pickers.
const colorPickerInput = document.createElement("input");
colorPickerInput.type = "color";
colorPickerInput.className = "color-picker-input";

// AbortController for the currently open color-picker session (if any).
let _colorPickerAc = null;

function ensureColorPickerInput() {
  if (!colorPickerInput.isConnected) {
    document.body.append(colorPickerInput);
  }
}

function openColorPicker(hex, onPick) {
  // Cancel any previous session that was dismissed without a change event.
  _colorPickerAc?.abort();
  ensureColorPickerInput();
  colorPickerInput.value = hex;

  const ac = new AbortController();
  _colorPickerAc = ac;
  colorPickerInput.addEventListener(
    "input",
    () => {
      onPick(colorPickerInput.value);
    },
    { signal: ac.signal }
  );
  colorPickerInput.addEventListener(
    "change",
    () => {
      ac.abort();
    },
    { once: true, signal: ac.signal }
  );
  colorPickerInput.click();
}

// Creates a color swatch. If `onPick` is provided the swatch is clickable and
// opens the browser color picker; onPick(newHex) is called on each change.
function makeColorSwatch(hex, onPick) {
  const swatch = document.createElement("span");
  swatch.className = "color-swatch";
  swatch.style.background = hex;
  if (onPick) {
    swatch.role = "button";
    swatch.tabIndex = 0;
    swatch.ariaLabel = "Change color";
    swatch.title = "Click to change color";
    const activate = e => {
      e.stopPropagation();
      openColorPicker(hex, newHex => {
        hex = newHex;
        swatch.style.background = newHex;
        onPick(newHex);
      });
    };
    swatch.addEventListener("click", activate);
    swatch.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      activate(e);
    });
  }
  return swatch;
}

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

class DrawOpDetailView {
  #el;

  #prefersDark;

  constructor(detailPanelEl, { prefersDark }) {
    this.#el = detailPanelEl;
    this.#prefersDark = prefersDark;
  }

  show(
    name,
    args,
    opIdx,
    { originalColors, renderedPage, selectedLine = null }
  ) {
    const detailEl = this.#el;
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
        val.textContent = formatArg(args[i], true);
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
            const listSwatch = selectedLine?.querySelector(".color-swatch");
            if (listSwatch) {
              listSwatch.style.background = newHex;
            }
            const listArgSpan = selectedLine?.querySelector(".op-arg");
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
        const preview = this.#makeImageArgPreview(args[i], renderedPage);
        if (preview) {
          imagePreviews.push(preview);
        }
      }
    }

    // Assemble the final layout: constructPath gets a path preview on the
    // right; image ops get an image column on the right; others just use
    // argsContainer.
    if (name === "constructPath") {
      // args[1] is [Float32Array|null], args[2] is [minX,minY,maxX,maxY]|null
      const data = Array.isArray(args?.[1]) ? args[1][0] : null;
      const body = document.createElement("div");
      body.className = "detail-body";
      body.append(
        argsContainer,
        this.#renderPathPreview(data, args?.[2] ?? null)
      );
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

  clear() {
    this.#el.replaceChildren();
  }

  #renderPathPreview(data, minMax) {
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
    ctx.strokeStyle = this.#prefersDark.matches ? "#9cdcfe" : "#0070c1";
    ctx.stroke(data instanceof Path2D ? data : makePathFromDrawOPS(data));

    return canvas;
  }

  // Render an img_ argument value into a canvas preview using the decoded image
  // stored in renderedPage.objs (or commonObjs for global images starting with
  // g_). Handles ImageBitmap and raw pixel data with ImageKind values
  // GRAYSCALE_1BPP, RGB_24BPP, and RGBA_32BPP.
  #makeImageArgPreview(name, renderedPage) {
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
    canvas.ariaLabel = `${name} ${width}×${height}`;
    const ctx = canvas.getContext("2d");

    // Fast path: if the browser already decoded it as an ImageBitmap, draw it.
    if (imgObj.bitmap instanceof ImageBitmap) {
      ctx.drawImage(imgObj.bitmap, 0, 0);
      return canvas;
    }

    // Slow path: convert raw pixel data to RGBA for putImageData.
    const { data, kind } = imgObj;
    let rgba;
    if (kind === ImageKind.RGBA_32BPP) {
      rgba = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength
      );
    } else if (kind === ImageKind.RGB_24BPP) {
      const pixels = width * height;
      rgba = new Uint8ClampedArray(pixels * 4);
      for (let i = 0, j = 0; i < pixels; i++, j += 3) {
        rgba[i * 4] = data[j];
        rgba[i * 4 + 1] = data[j + 1];
        rgba[i * 4 + 2] = data[j + 2];
        rgba[i * 4 + 3] = 255;
      }
    } else if (kind === ImageKind.GRAYSCALE_1BPP) {
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
}

class DrawOpsView {
  #listPanelEl;

  #detailView;

  #multilineView = null;

  // All op lines indexed by original op index.
  #opLines = [];

  // Plain-text representations for search, parallel to #opLines.
  #opTexts = [];

  // Currently visible lines (all lines, or text-only subset when filtering).
  #visibleLines = [];

  #textFilter = false;

  #selectedLine = null;

  // Map<opIndex, BreakpointType>
  #breakpoints = new Map();

  #originalColors = new Map();

  #renderedPage = null;

  #pausedAtIdx = null;

  #onHighlight;

  #onClearHighlight;

  constructor(
    opListPanelEl,
    detailPanelEl,
    { onHighlight, onClearHighlight, prefersDark }
  ) {
    this.#listPanelEl = opListPanelEl;
    this.#detailView = new DrawOpDetailView(detailPanelEl, { prefersDark });
    this.#onHighlight = onHighlight;
    this.#onClearHighlight = onClearHighlight;
  }

  get breakpoints() {
    return this.#breakpoints;
  }

  load(opList, renderedPage) {
    this.#renderedPage = renderedPage;
    this.#opLines = [];
    this.#opTexts = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const name = OPS_TO_NAME[opList.fnArray[i]] ?? `op${opList.fnArray[i]}`;
      const args = opList.argsArray[i] ?? [];
      const { line, text } = this.#buildLine(i, name, args);
      this.#opLines.push(line);
      this.#opTexts.push(text);
    }

    this.#rebuildMultilineView();
  }

  // Enable or disable the text-ops-only filter. Can be called at any time;
  // rebuilds the list view in place when ops are already loaded.
  setTextFilter(enabled) {
    if (this.#textFilter === enabled) {
      return;
    }
    this.#textFilter = enabled;
    if (this.#opLines.length > 0) {
      this.#rebuildMultilineView();
    }
  }

  #rebuildMultilineView() {
    // Compute the visible (possibly filtered) subset.
    this.#visibleLines = this.#textFilter
      ? this.#opLines.filter(line => TEXT_OP_IDS.has(OPS[line.dataset.opName]))
      : this.#opLines;

    // Tear down the existing MultilineView (if any), keeping the placeholder.
    const anchor = this.#multilineView?.element ?? this.#listPanelEl;
    if (this.#multilineView) {
      this.#multilineView.destroy();
      this.#multilineView = null;
    }

    const multilineView = new MultilineView({
      total: this.#visibleLines.length,
      getText: i => this.#opTexts[+this.#visibleLines[i].dataset.opIdx],
      makeLineEl: (i, isHighlighted) => {
        this.#visibleLines[i].classList.toggle("mlc-match", isHighlighted);
        return this.#visibleLines[i];
      },
    });
    multilineView.element.classList.add("op-list-panel-wrapper");
    multilineView.inner.id = "op-list";
    multilineView.inner.role = "listbox";
    multilineView.inner.ariaLabel = "Operator list";

    multilineView.inner.addEventListener("keydown", e => {
      const { key } = e;
      const lines = this.#visibleLines;
      if (!lines.length) {
        return;
      }
      const focused = document.activeElement;
      const currentIdx = lines.indexOf(focused);
      let targetIdx = -1;
      if (key === "ArrowDown") {
        targetIdx = currentIdx < lines.length - 1 ? currentIdx + 1 : currentIdx;
      } else if (key === "ArrowUp") {
        targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
      } else if (key === "Home") {
        targetIdx = 0;
      } else if (key === "End") {
        targetIdx = lines.length - 1;
      } else if (key === "Enter" || key === " ") {
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
        multilineView.scrollToLine(targetIdx);
        lines[targetIdx].focus();
      }
    });

    anchor.replaceWith(multilineView.element);
    this.#multilineView = multilineView;
  }

  clear() {
    if (this.#multilineView) {
      this.#multilineView.destroy();
      this.#multilineView.element.replaceWith(this.#listPanelEl);
      this.#multilineView = null;
    }
    document.getElementById("op-list").replaceChildren();
    this.#detailView.clear();
    this.#opLines = [];
    this.#opTexts = [];
    this.#visibleLines = [];
    this.#selectedLine = null;
    this.#originalColors.clear();
    this.#breakpoints.clear();
    this.#pausedAtIdx = this.#renderedPage = null;
  }

  markPaused(i) {
    if (this.#pausedAtIdx !== null) {
      this.#opLines[this.#pausedAtIdx]?.classList.remove("paused");
    }
    this.#pausedAtIdx = i;
    this.#opLines[i]?.classList.add("paused");
    // Scroll to the position of this op within the currently visible list.
    const visibleIdx = this.#visibleLines.indexOf(this.#opLines[i]);
    if (visibleIdx >= 0) {
      this.#multilineView?.scrollToLine(visibleIdx);
    }
  }

  clearPaused() {
    if (this.#pausedAtIdx !== null) {
      this.#opLines[this.#pausedAtIdx]?.classList.remove("paused");
      this.#pausedAtIdx = null;
    }
  }

  // The evaluator normalizes all color ops to setFillRGBColor /
  // setStrokeRGBColor with args = ["#rrggbb"]. Return that hex string, or null.
  #getOpColor(name, args) {
    if (
      (name === "setFillRGBColor" || name === "setStrokeRGBColor") &&
      typeof args?.[0] === "string" &&
      /^#[0-9a-f]{6}$/i.test(args[0])
    ) {
      return args[0];
    }
    return null;
  }

  #buildLine(i, name, args) {
    const line = document.createElement("div");
    line.className = "op-line";
    line.role = "option";
    line.ariaSelected = "false";
    line.tabIndex = i === 0 ? 0 : -1;
    line.dataset.opName = name;
    line.dataset.opIdx = i;

    // Breakpoint gutter — click cycles: none → pause (●) → skip (✕) → none.
    const gutter = document.createElement("span");
    gutter.className = "bp-gutter";
    gutter.role = "checkbox";
    gutter.tabIndex = 0;
    gutter.ariaLabel = "Breakpoint";
    const initBpType = this.#breakpoints.get(i);
    if (initBpType === BreakpointType.PAUSE) {
      gutter.dataset.bp = "pause";
      gutter.ariaChecked = "true";
    } else if (initBpType === BreakpointType.SKIP) {
      gutter.dataset.bp = "skip";
      gutter.ariaChecked = "mixed";
      line.classList.add("op-skipped");
    } else {
      gutter.ariaChecked = "false";
    }
    gutter.addEventListener("click", e => {
      e.stopPropagation();
      const current = this.#breakpoints.get(i);
      if (current === undefined) {
        this.#breakpoints.set(i, BreakpointType.PAUSE);
        gutter.dataset.bp = "pause";
        gutter.ariaChecked = "true";
      } else if (current === BreakpointType.PAUSE) {
        this.#breakpoints.set(i, BreakpointType.SKIP);
        gutter.dataset.bp = "skip";
        gutter.ariaChecked = "mixed";
        line.classList.add("op-skipped");
      } else {
        this.#breakpoints.delete(i);
        delete gutter.dataset.bp;
        gutter.ariaChecked = "false";
        line.classList.remove("op-skipped");
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
    const rgb = this.#getOpColor(name, args);
    let colorArgSpan = null;
    if (rgb) {
      this.#originalColors.set(i, rgb);
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

    // Build arg spans and plain-text representation for search in one pass.
    let text = name;
    if (name === "showText" && Array.isArray(args[0])) {
      const formatted = formatGlyphItems(args[0]);
      const argEl = document.createElement("span");
      argEl.className = "op-arg";
      argEl.textContent = formatted;
      line.append(argEl);
      text += " " + formatted;
    } else {
      for (let j = 0; j < args.length; j++) {
        const s =
          name === "constructPath" && j === 0 && typeof args[0] === "number"
            ? (OPS_TO_NAME[args[0]] ?? String(args[0]))
            : formatArg(args[j], false);
        if (s) {
          const argEl = document.createElement("span");
          argEl.className = "op-arg";
          argEl.textContent = s;
          line.append(argEl);
          if (rgb && j === 0) {
            colorArgSpan = argEl;
          }
          text += " " + s;
        }
      }
    }

    line.addEventListener("pointerenter", () => this.#onHighlight(i));
    line.addEventListener("pointerleave", () => this.#onClearHighlight());
    line.addEventListener("click", () => {
      if (this.#selectedLine) {
        this.#selectedLine.classList.remove("selected");
        this.#selectedLine.ariaSelected = "false";
        this.#selectedLine.tabIndex = -1;
      }
      this.#selectedLine = line;
      line.classList.add("selected");
      line.ariaSelected = "true";
      line.tabIndex = 0;
      this.#detailView.show(name, args, i, {
        originalColors: this.#originalColors,
        renderedPage: this.#renderedPage,
        selectedLine: line,
      });
    });

    return { line, text };
  }
}

export { BreakpointType, DrawOpsView, TEXT_EXEC_OP_IDS, TEXT_OP_IDS };
