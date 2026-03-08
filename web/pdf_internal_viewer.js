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

import { getDocument, GlobalWorkerOptions, PasswordResponses } from "pdfjs-lib";

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

// Cache for getRawData results, keyed by "num:gen". Cleared on each new
// document.
const refCache = new Map();

function updateParseCSClass() {
  document
    .getElementById("tree")
    .classList.toggle(
      "parse-cs-active",
      document.getElementById("parse-content-stream").checked
    );
}

async function loadTree(data, rootLabel = null) {
  const treeEl = document.getElementById("tree");
  const rootNode = renderNode(rootLabel, await pdfDoc.getRawData(data), pdfDoc);
  treeEl.replaceChildren(rootNode);
  rootNode.querySelector("[role='button']").click();
}

async function openDocument(source, name) {
  const statusEl = document.getElementById("status");
  const pdfInfoEl = document.getElementById("pdf-info");
  const gotoInput = document.getElementById("goto-input");

  statusEl.textContent = `Loading ${name}…`;
  pdfInfoEl.textContent = "";
  refCache.clear();

  if (pdfDoc) {
    await pdfDoc.destroy();
    pdfDoc = null;
  }

  const loadingTask = getDocument({ ...source, wasmUrl: "wasm/" });
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
  const msg = document.createElement("div");
  msg.setAttribute("role", "alert");
  msg.textContent = err.message;
  document.getElementById("tree").append(msg);
}

document.getElementById("file-input").value = "";

document
  .getElementById("parse-content-stream")
  .addEventListener("change", updateParseCSClass);

updateParseCSClass();

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

/**
 * Render one key/value pair as a <div class="node">.
 * @param {string|null} key   Dict key, array index, or null for root.
 * @param {*}           value
 * @param {PDFDocumentProxy} doc
 */
function renderNode(key, value, doc) {
  const node = document.createElement("div");
  node.className = "node";
  node.setAttribute("role", "treeitem");
  node.tabIndex = -1;

  if (key !== null) {
    const keyEl = document.createElement("span");
    keyEl.className = "key";
    keyEl.textContent = key;
    node.append(keyEl);
    const sep = document.createElement("span");
    sep.className = "separator";
    sep.textContent = ": ";
    node.append(sep);
  }

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
      const contentNode = document.createElement("div");
      contentNode.className = "node";
      contentNode.setAttribute("role", "treeitem");
      contentNode.tabIndex = -1;
      contentNode.append(makeSpan("key", "content"));
      contentNode.append(makeSpan("separator", ": "));

      const parsedEl = document.createElement("span");
      parsedEl.className = "content-stream-parsed";
      parsedEl.append(
        renderExpandable(
          `[Content Stream, ${value.instructions.length} instructions]`,
          "stream-label",
          c => buildInstructionLines(value, c)
        )
      );

      const rawEl = document.createElement("span");
      rawEl.className = "content-stream-raw";
      const byteLabel = makeSpan(
        "stream-label",
        `<${value.bytes.length} raw bytes>`
      );
      rawEl.append(byteLabel);
      const bytesContentEl = document.createElement("div");
      bytesContentEl.className = "bytes-content";
      bytesContentEl.append(formatBytes(value.bytes));
      rawEl.append(bytesContentEl);

      contentNode.append(parsedEl, rawEl);
      container.append(contentNode);
    } else {
      const byteNode = document.createElement("div");
      byteNode.className = "node";
      const keyEl = document.createElement("span");
      keyEl.className = "key";
      keyEl.textContent = "bytes";
      const sep = document.createElement("span");
      sep.className = "separator";
      sep.textContent = ": ";
      const valEl = document.createElement("span");
      valEl.className = "stream-label";
      valEl.textContent = `<${value.bytes.length} raw bytes>`;
      byteNode.append(keyEl, sep, valEl);
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
 * Populate container with one .cs-instruction div per instruction.
 * Shared by Page content streams and Form XObject streams.
 */
function buildInstructionLines(val, container) {
  const pre = document.createElement("div");
  pre.className = "content-stream";
  let depth = 0;
  for (const instr of val.instructions) {
    if (instr.cmd === "ET" || instr.cmd === "Q" || instr.cmd === "EMC") {
      depth = Math.max(0, depth - 1);
    }
    const line = document.createElement("div");
    line.className = "cs-instruction";
    if (depth > 0) {
      line.style.paddingInlineStart = `${depth * 1.5}em`;
    }
    for (const arg of instr.args) {
      line.append(renderToken(arg));
      line.append(document.createTextNode(" "));
    }
    if (instr.cmd !== null) {
      const cmdEl = makeSpan("token-cmd", instr.cmd);
      const opsName = val.cmdNames[instr.cmd];
      if (opsName) {
        cmdEl.title = opsName;
      }
      line.append(cmdEl);
    }
    pre.append(line);
    if (instr.cmd === "BT" || instr.cmd === "q" || instr.cmd === "BDC") {
      depth++;
    }
  }
  container.append(pre);
}

/**
 * Render Page content stream as two pre-built views toggled by CSS:
 *  - .content-stream-parsed: expandable colorized instruction widget
 *  - .content-stream-raw:    ref widget(s) mirroring the unparsed display
 * The active view is controlled by the "parse-cs-active" class on #tree.
 */
function renderContentStream(val, doc) {
  const frag = document.createDocumentFragment();

  const parsedEl = document.createElement("span");
  parsedEl.className = "content-stream-parsed";
  parsedEl.append(
    renderExpandable(
      `[Content Stream, ${val.instructions.length} instructions]`,
      "stream-label",
      container => buildInstructionLines(val, container)
    )
  );

  const rawEl = document.createElement("span");
  rawEl.className = "content-stream-raw";
  const rawVal =
    val.rawContents.length === 1 ? val.rawContents[0] : val.rawContents;
  rawEl.append(renderValue(rawVal, doc));

  frag.append(parsedEl, rawEl);
  return frag;
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

  // Content stream (Page Contents) → two pre-built views toggled by CSS
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

  const frag = document.createDocumentFragment();

  const toggleEl = document.createElement("span");
  toggleEl.textContent = ARROW_COLLAPSED;
  toggleEl.setAttribute("role", "button");
  toggleEl.setAttribute("tabindex", "0");
  toggleEl.setAttribute("aria-expanded", "false");
  toggleEl.setAttribute("aria-label", `Expand reference ${label}`);

  const refEl = document.createElement("span");
  refEl.className = "ref";
  refEl.textContent = label;
  refEl.setAttribute("aria-hidden", "true");

  const childrenEl = document.createElement("div");
  childrenEl.className = "hidden";
  childrenEl.setAttribute("role", "group");
  childrenEl.setAttribute("aria-label", `Contents of reference ${label}`);

  let open = false;
  let loaded = false;

  const onToggle = async () => {
    open = !open;
    toggleEl.textContent = open ? ARROW_EXPANDED : ARROW_COLLAPSED;
    toggleEl.setAttribute("aria-expanded", String(open));
    childrenEl.classList.toggle("hidden", !open);

    if (open && !loaded) {
      loaded = true;
      const spinner = document.createElement("div");
      spinner.setAttribute("role", "status");
      spinner.textContent = "Loading…";
      childrenEl.append(spinner);

      try {
        if (!refCache.has(cacheKey)) {
          refCache.set(cacheKey, doc.getRawData({ ref }));
        }
        const result = await refCache.get(cacheKey);
        childrenEl.replaceChildren();
        buildChildren(result, doc, childrenEl);
      } catch (err) {
        const errEl = document.createElement("div");
        errEl.setAttribute("role", "alert");
        errEl.textContent = "Error: " + err.message;
        childrenEl.replaceChildren(errEl);
      }
    }
  };

  toggleEl.addEventListener("click", onToggle);
  toggleEl.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  });
  refEl.addEventListener("click", onToggle);

  frag.append(toggleEl);
  frag.append(refEl);
  frag.append(childrenEl);
  return frag;
}

/**
 * Build a synchronous expand/collapse widget.
 * @param {string}   label      Text shown on the collapsed line.
 * @param {string}   labelClass CSS class for the label.
 * @param {function} buildFn    Called with (containerEl) on first open.
 */
function renderExpandable(label, labelClass, buildFn) {
  const frag = document.createDocumentFragment();

  const toggleEl = document.createElement("span");
  toggleEl.textContent = ARROW_COLLAPSED;
  toggleEl.setAttribute("role", "button");
  toggleEl.setAttribute("tabindex", "0");
  toggleEl.setAttribute("aria-expanded", "false");
  toggleEl.setAttribute("aria-label", `Expand ${label}`);

  const labelEl = document.createElement("span");
  labelEl.className = labelClass;
  labelEl.textContent = label;
  labelEl.setAttribute("aria-hidden", "true");

  const childrenEl = document.createElement("div");
  childrenEl.className = "hidden";
  childrenEl.setAttribute("role", "group");
  childrenEl.setAttribute("aria-label", `Contents of ${label}`);

  let open = false;
  let built = false;

  const onToggle = () => {
    open = !open;
    toggleEl.textContent = open ? ARROW_EXPANDED : ARROW_COLLAPSED;
    toggleEl.setAttribute("aria-expanded", String(open));
    childrenEl.classList.toggle("hidden", !open);
    if (open && !built) {
      built = true;
      buildFn(childrenEl);
    }
  };

  toggleEl.addEventListener("click", onToggle);
  toggleEl.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  });
  labelEl.addEventListener("click", onToggle);

  frag.append(toggleEl);
  frag.append(labelEl);
  frag.append(childrenEl);
  return frag;
}

/**
 * Build a DocumentFragment for the byte string.
 * Printable ASCII (0x20–0x7e) runs become plain text nodes.
 * Consecutive non-printable bytes are grouped into a single
 * <span class="bytes-hex"> with each byte as uppercase XX separated by
 * a narrow space.
 */
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
