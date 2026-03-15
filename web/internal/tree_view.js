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

import { MultilineView } from "./multiline_view.js";

const ARROW_COLLAPSED = "▶";
const ARROW_EXPANDED = "▼";

// Matches indirect object references such as "10 0 R".
const REF_RE = /^\d+ \d+ R$/;

/**
 * Renders and manages the PDF internal structure tree.
 *
 * @param {HTMLElement} treeEl
 * @param {object}      options
 * @param {Function}    options.onMarkLoading  Called with +1/-1 to track
 *                                             in-flight requests.
 */
class TreeView {
  #treeEl;

  #onMarkLoading;

  // Cache for getRawData results, keyed by "num:gen". Cleared on each new
  // document.
  #refCache = new Map();

  constructor(treeEl, { onMarkLoading }) {
    this.#treeEl = treeEl;
    this.#onMarkLoading = onMarkLoading;
    this.#setupKeyboardNav();
  }

  // --- Public API ---

  /**
   * Fetch and render a tree for the given ref/page from doc.
   * @param {{ ref?: object, page?: number }} data
   * @param {string|null}   rootLabel
   * @param {PDFDocumentProxy} doc
   */
  async load(data, rootLabel, doc) {
    this.#treeEl.classList.add("loading");
    this.#onMarkLoading(1);
    try {
      const rootNode = this.#renderNode(
        rootLabel,
        await doc.getRawData(data),
        doc
      );
      this.#treeEl.replaceChildren(rootNode);
      rootNode.querySelector("[role='button']")?.click();
      const firstTreeItem = this.#treeEl.querySelector("[role='treeitem']");
      if (firstTreeItem) {
        firstTreeItem.tabIndex = 0;
      }
    } finally {
      this.#treeEl.classList.remove("loading");
      this.#onMarkLoading(-1);
    }
  }

  /** Append a role=alert error node to the tree element. */
  showError(message) {
    this.#treeEl.append(this.#makeErrorNode(message));
  }

  /** Clear the ref cache (call when a new document is opened). */
  clearCache() {
    this.#refCache.clear();
  }

  // --- Private helpers ---

  #moveFocus(from, to) {
    if (!to) {
      return;
    }
    if (from) {
      from.tabIndex = -1;
    }
    to.tabIndex = 0;
    to.focus();
  }

  #getVisibleItems() {
    return Array.from(
      this.#treeEl.querySelectorAll("[role='treeitem']")
    ).filter(item => {
      let el = item.parentElement;
      while (el && el !== this.#treeEl) {
        if (el.role === "group" && el.classList.contains("hidden")) {
          return false;
        }
        el = el.parentElement;
      }
      return true;
    });
  }

  #makeErrorNode(message) {
    const el = document.createElement("div");
    el.role = "alert";
    el.textContent = `Error: ${message}`;
    return el;
  }

  #setupKeyboardNav() {
    this.#treeEl.addEventListener("keydown", e => {
      const { key } = e;
      if (
        key !== "ArrowDown" &&
        key !== "ArrowUp" &&
        key !== "ArrowRight" &&
        key !== "ArrowLeft" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      e.preventDefault();
      const focused =
        document.activeElement instanceof HTMLElement &&
        this.#treeEl.contains(document.activeElement)
          ? document.activeElement
          : null;

      // ArrowRight/Left operate on the focused treeitem directly without
      // needing a full list of visible items.
      if (key === "ArrowRight" || key === "ArrowLeft") {
        if (!focused || focused.role !== "treeitem") {
          return;
        }
        if (key === "ArrowRight") {
          // Find the toggle button inside this treeitem (not inside a child
          // group).
          const toggle = focused.querySelector(":scope > [role='button']");
          if (!toggle) {
            return;
          }
          if (toggle.ariaExpanded === "false") {
            toggle.click();
          } else {
            // Already expanded — move to first child treeitem.
            const group = focused.querySelector(
              ":scope > [role='group']:not(.hidden)"
            );
            const firstChild = group?.querySelector("[role='treeitem']");
            this.#moveFocus(focused, firstChild);
          }
        } else {
          // Collapsed or no children — move to parent treeitem.
          const toggle = focused.querySelector(":scope > [role='button']");
          if (toggle?.ariaExpanded === "true") {
            toggle.click();
          } else {
            const parentGroup = focused.closest("[role='group']");
            const parentItem = parentGroup?.closest("[role='treeitem']");
            this.#moveFocus(focused, parentItem);
          }
        }
        return;
      }

      // ArrowDown/Up/Home/End need the full ordered list of visible treeitems.
      const visibleItems = this.#getVisibleItems();
      if (visibleItems.length === 0) {
        return;
      }
      const idx = visibleItems.indexOf(focused);

      if (key === "ArrowDown") {
        const next = visibleItems[idx >= 0 ? idx + 1 : 0];
        this.#moveFocus(focused, next);
      } else if (key === "ArrowUp") {
        const prev = idx >= 0 ? visibleItems[idx - 1] : visibleItems.at(-1);
        this.#moveFocus(focused, prev);
      } else if (key === "Home") {
        const first = visibleItems[0];
        if (first !== focused) {
          this.#moveFocus(focused, first);
        }
      } else if (key === "End") {
        const last = visibleItems.at(-1);
        if (last !== focused) {
          this.#moveFocus(focused, last);
        }
      }
    });
  }

  /** Create a bare div.node treeitem with an optional "key: " prefix. */
  #makeNodeEl(key) {
    const node = document.createElement("div");
    node.className = "node";
    node.role = "treeitem";
    node.tabIndex = -1;
    if (key !== null) {
      node.append(
        this.#makeSpan("key", key),
        this.#makeSpan("separator", ": ")
      );
    }
    return node;
  }

  /**
   * Render one key/value pair as a <div class="node">.
   * @param {string|null} key   Dict key, array index, or null for root.
   * @param {*}           value
   * @param {PDFDocumentProxy} doc
   */
  #renderNode(key, value, doc) {
    const node = this.#makeNodeEl(key);
    node.append(this.#renderValue(value, doc));
    return node;
  }

  /**
   * Populate a container element with the direct children of a value.
   * Used both by renderValue (inside expandables) and renderRef (directly
   * into the ref's children container, avoiding an extra toggle level).
   */
  #buildChildren(value, doc, container) {
    if (this.#isStream(value)) {
      for (const [k, v] of Object.entries(value.dict)) {
        container.append(this.#renderNode(k, v, doc));
      }
      if (this.#isImageStream(value)) {
        container.append(this.#renderImageData(value.imageData));
      } else if (this.#isFormXObjectStream(value)) {
        const contentNode = this.#makeNodeEl("content");
        const csLabel = `[Content Stream, ${value.instructions.length} instructions]`;
        const csLabelEl = this.#makeSpan("stream-label", csLabel);
        contentNode.append(
          this.#makeExpandable(csLabelEl, csLabel, c =>
            this.#buildContentStreamPanel(value, c, csLabelEl)
          )
        );
        container.append(contentNode);
      } else {
        const byteNode = this.#makeNodeEl("bytes");
        byteNode.append(
          this.#makeSpan("stream-label", `<${value.bytes.length} raw bytes>`)
        );
        container.append(byteNode);

        const bytesContentEl = document.createElement("div");
        bytesContentEl.className = "bytes-content";
        bytesContentEl.append(this.#formatBytes(value.bytes));
        container.append(bytesContentEl);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) =>
        container.append(this.#renderNode(String(i), v, doc))
      );
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        container.append(this.#renderNode(k, v, doc));
      }
    } else {
      container.append(this.#renderNode(null, value, doc));
    }
  }

  /**
   * Render a single content-stream token as a styled span.
   */
  #renderToken(token) {
    if (!token) {
      return this.#makeSpan("token-null", "null");
    }
    switch (token.type) {
      case "cmd":
        return this.#makeSpan("token-cmd", token.value);
      case "name":
        return this.#makeSpan("token-name", "/" + token.value);
      case "ref":
        return this.#makeSpan("token-ref", `${token.num} ${token.gen} R`);
      case "number":
        return this.#makeSpan("token-num", String(token.value));
      case "string":
        return this.#makeSpan("token-str", JSON.stringify(token.value));
      case "boolean":
        return this.#makeSpan("token-bool", String(token.value));
      case "null":
        return this.#makeSpan("token-null", "null");
      case "array": {
        const span = document.createElement("span");
        span.className = "token-array";
        span.append(this.#makeSpan("bracket", "["));
        for (const item of token.value) {
          span.append(document.createTextNode(" "));
          span.append(this.#renderToken(item));
        }
        span.append(document.createTextNode(" "));
        span.append(this.#makeSpan("bracket", "]"));
        return span;
      }
      case "dict": {
        const span = document.createElement("span");
        span.className = "token-dict";
        span.append(this.#makeSpan("bracket", "<<"));
        for (const [k, v] of Object.entries(token.value)) {
          span.append(document.createTextNode(" "));
          span.append(this.#makeSpan("token-name", `/${k}`));
          span.append(document.createTextNode(" "));
          span.append(this.#renderToken(v));
        }
        span.append(document.createTextNode(" "));
        span.append(this.#makeSpan("bracket", ">>"));
        return span;
      }
      default:
        return this.#makeSpan(
          "token-unknown",
          String(token.value ?? token.type)
        );
    }
  }

  /**
   * Return the plain-text representation of a token (mirrors #renderToken).
   * Used to build searchable strings for every instruction.
   */
  #tokenToText(token) {
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
        return `[ ${token.value.map(t => this.#tokenToText(t)).join(" ")} ]`;
      case "dict": {
        const inner = Object.entries(token.value)
          .map(([k, v]) => `/${k} ${this.#tokenToText(v)}`)
          .join(" ");
        return `<< ${inner} >>`;
      }
      default:
        return String(token.value ?? token.type);
    }
  }

  #buildInstructionLines(val, container, actions = null) {
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
      const parts = instr.args.map(t => this.#tokenToText(t));
      if (instr.cmd !== null) {
        parts.push(instr.cmd);
      }
      return parts.join(" ");
    });

    const mc = new MultilineView({
      total,
      lineClass: "content-stream",
      getText: i => instrTexts[i],
      actions,
      makeLineEl: (i, isHighlighted) => {
        const line = document.createElement("div");
        line.className = "content-stm-instruction";
        if (isHighlighted) {
          line.classList.add("mlc-match");
        }
        // Wrap the instruction content so that indentation shifts the tokens.
        const content = document.createElement("span");
        if (depths[i] > 0) {
          content.style.paddingInlineStart = `${depths[i] * 1.5}em`;
        }
        const instr = instructions[i];
        for (const arg of instr.args) {
          content.append(this.#renderToken(arg));
          content.append(document.createTextNode(" "));
        }
        if (instr.cmd !== null) {
          const cmdEl = this.#makeSpan("token-cmd", instr.cmd);
          const opsName = cmdNames[instr.cmd];
          if (opsName) {
            cmdEl.title = opsName;
          }
          content.append(cmdEl);
        }
        line.append(content);
        return line;
      },
    });
    container.append(mc.element);
    return mc;
  }

  // Fills container with a raw-bytes virtual-scroll panel.
  #buildRawBytesPanel(rawBytes, container, actions = null) {
    const lines = rawBytes.split(/\r?\n|\r/);
    if (lines.at(-1) === "") {
      lines.pop();
    }
    const mc = new MultilineView({
      total: lines.length,
      lineClass: "content-stream raw-bytes-stream",
      getText: i => lines[i],
      actions,
      makeLineEl: (i, isHighlighted) => {
        const el = document.createElement("div");
        el.className = "content-stm-instruction";
        if (isHighlighted) {
          el.classList.add("mlc-match");
        }
        el.append(this.#formatBytes(lines[i]));
        return el;
      },
    });
    container.append(mc.element);
    return mc;
  }

  // Creates a "Parsed" toggle button. aria-pressed=true means the parsed view
  // is currently active; clicking switches to the other view.
  #makeParseToggleBtn(isParsed, onToggle) {
    const btn = document.createElement("button");
    btn.className = "mlc-nav-button";
    btn.textContent = "Parsed";
    btn.ariaPressed = String(isParsed);
    btn.title = isParsed ? "Show raw bytes" : "Show parsed instructions";
    btn.addEventListener("click", onToggle);
    return btn;
  }

  // Fills container with the content stream panel (parsed or raw), with a
  // toggle button in the toolbar that swaps the view in-place.
  #buildContentStreamPanel(val, container, labelEl = null) {
    let isParsed = true;
    let currentPanel = null;
    const rawBytes = val.rawBytes ?? val.bytes;
    const rawLines = rawBytes ? rawBytes.split(/\r?\n|\r/) : [];
    if (rawLines.at(-1) === "") {
      rawLines.pop();
    }
    const parsedLabel = `[Content Stream, ${val.instructions.length} instructions]`;
    const rawLabel = `[Content Stream, ${rawLines.length} lines]`;

    const rebuild = () => {
      currentPanel?.destroy();
      currentPanel = null;
      container.replaceChildren();
      if (labelEl) {
        labelEl.textContent = isParsed ? parsedLabel : rawLabel;
      }
      const btn = this.#makeParseToggleBtn(isParsed, () => {
        isParsed = !isParsed;
        rebuild();
      });
      currentPanel = isParsed
        ? this.#buildInstructionLines(val, container, btn)
        : this.#buildRawBytesPanel(rawBytes, container, btn);
    };

    rebuild();
  }

  /**
   * Render Page content stream as an expandable panel with a Parsed/Raw toggle.
   */
  #renderContentStream(val) {
    const label = `[Content Stream, ${val.instructions.length} instructions]`;
    const labelEl = this.#makeSpan("stream-label", label);
    return this.#makeExpandable(labelEl, label, container =>
      this.#buildContentStreamPanel(val, container, labelEl)
    );
  }

  /**
   * Render a value inline (primitive) or as an expandable widget.
   * Returns a Node or DocumentFragment suitable for appendChild().
   */
  #renderValue(value, doc) {
    // Ref string ("10 0 R") – lazy expandable via getRawData()
    if (typeof value === "string" && REF_RE.test(value)) {
      return this.#renderRef(value, doc);
    }

    // Ref object { num, gen } – lazy expandable via getRawData()
    if (this.#isRefObject(value)) {
      return this.#renderRef(value, doc);
    }

    // PDF Name → /Name
    if (this.#isPDFName(value)) {
      return this.#makeSpan("name-value", `/${value.name}`);
    }

    // Content stream (Page Contents) → expandable with Parsed/Raw toggle
    if (this.#isContentStream(value)) {
      return this.#renderContentStream(value);
    }

    // Stream → expandable showing dict entries + byte count or image preview
    if (this.#isStream(value)) {
      return this.#renderExpandable("[Stream]", "stream-label", container =>
        this.#buildChildren(value, doc, container)
      );
    }

    // Plain object (dict)
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return this.#makeSpan("bracket", "{}");
      }
      return this.#renderExpandable(`{${keys.length}}`, "bracket", container =>
        this.#buildChildren(value, doc, container)
      );
    }

    // Array
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return this.#makeSpan("bracket", "[]");
      }
      return this.#renderExpandable(`[${value.length}]`, "bracket", container =>
        this.#buildChildren(value, doc, container)
      );
    }

    // Primitives
    if (typeof value === "string") {
      return this.#makeSpan("str-value", JSON.stringify(value));
    }
    if (typeof value === "number") {
      return this.#makeSpan("num-value", String(value));
    }
    if (typeof value === "boolean") {
      return this.#makeSpan("bool-value", String(value));
    }
    return this.#makeSpan("null-value", "null");
  }

  /**
   * Build a lazy-loading expand/collapse widget for a ref (string or object).
   * Results are cached in #refCache keyed by "num:gen".
   */
  #renderRef(ref, doc) {
    // Derive the cache key and display label from whichever form we received.
    // String refs look like "10 0 R"; object refs are { num, gen }.
    let cacheKey, label;
    if (typeof ref === "string") {
      const parts = ref.split(" ");
      cacheKey = `${parts[0]}:${parts[1]}`;
      label = ref;
    } else {
      cacheKey = `${ref.num}:${ref.gen}`;
      label = this.#refLabel(ref);
    }
    return this.#makeExpandable(
      this.#makeSpan("ref", label),
      `reference ${label}`,
      childrenEl => {
        const spinner = document.createElement("div");
        spinner.role = "status";
        spinner.textContent = "Loading…";
        childrenEl.append(spinner);
        this.#onMarkLoading(1);
        if (!this.#refCache.has(cacheKey)) {
          this.#refCache.set(cacheKey, doc.getRawData({ ref }));
        }
        this.#refCache
          .get(cacheKey)
          .then(result => {
            childrenEl.replaceChildren();
            this.#buildChildren(result, doc, childrenEl);
          })
          .catch(err =>
            childrenEl.replaceChildren(this.#makeErrorNode(err.message))
          )
          .finally(() => this.#onMarkLoading(-1));
      }
    );
  }

  /**
   * Build a shared expand/collapse widget.
   * labelEl is the element shown between the toggle arrow and the children.
   * ariaLabel is used for the toggle and group aria-labels.
   * onFirstOpen(childrenEl) is called once when first expanded (may be async).
   */
  #makeExpandable(labelEl, ariaLabel, onFirstOpen) {
    const toggleEl = document.createElement("span");
    toggleEl.textContent = ARROW_COLLAPSED;
    toggleEl.role = "button";
    toggleEl.tabIndex = 0;
    toggleEl.ariaExpanded = "false";
    toggleEl.ariaLabel = `Expand ${ariaLabel}`;
    labelEl.ariaHidden = "true";

    const childrenEl = document.createElement("div");
    childrenEl.className = "hidden";
    childrenEl.role = "group";
    childrenEl.ariaLabel = `Contents of ${ariaLabel}`;

    let open = false,
      done = false;
    const toggle = () => {
      open = !open;
      toggleEl.textContent = open ? ARROW_EXPANDED : ARROW_COLLAPSED;
      toggleEl.ariaExpanded = String(open);
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
  #renderExpandable(label, labelClass, buildFn) {
    return this.#makeExpandable(
      this.#makeSpan(labelClass, label),
      label,
      buildFn
    );
  }

  /**
   * Render image data (RGBA Uint8ClampedArray) into a <canvas> node.
   */
  #renderImageData({ width, height, data }) {
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
    canvas.ariaLabel = `Image preview ${width}×${height}`;
    const ctx = canvas.getContext("2d");
    const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
    ctx.putImageData(imgData, 0, 0);
    node.append(canvas);
    return node;
  }

  #isMostlyText(str) {
    let printable = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0x20 && c <= 0x7e) {
        printable++;
      }
    }
    return str.length > 0 && printable / str.length >= 0.8;
  }

  #formatBytes(str) {
    const mostlyText = this.#isMostlyText(str);
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

  // Create a <span> with the given class and text content.
  #makeSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  #isPDFName(val) {
    return (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof val.name === "string" &&
      Object.keys(val).length === 1
    );
  }

  // Ref objects arrive as { num: N, gen: G } after structured clone.
  #isRefObject(val) {
    return (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof val.num === "number" &&
      typeof val.gen === "number" &&
      Object.keys(val).length === 2
    );
  }

  #refLabel(ref) {
    return ref.gen !== 0 ? `${ref.num}R${ref.gen}` : `${ref.num}R`;
  }

  // Page content streams:
  // { contentStream: true, instructions, cmdNames, rawContents }.
  #isContentStream(val) {
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
  #isStream(val) {
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

  #isImageStream(val) {
    return (
      this.#isStream(val) &&
      Object.prototype.hasOwnProperty.call(val, "imageData")
    );
  }

  #isFormXObjectStream(val) {
    return this.#isStream(val) && val.contentStream === true;
  }
}

export { TreeView };
