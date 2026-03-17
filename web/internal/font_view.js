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

const FONT_HIGHLIGHT_COLOR_KEY = "debugger.fontHighlightColor";
const DEFAULT_FONT_HIGHLIGHT_COLOR = "#0070c1";

// Maps MIME types to file extensions used when downloading fonts.
const MIMETYPE_TO_EXTENSION = new Map([
  ["font/opentype", "otf"],
  ["font/otf", "otf"],
  ["font/woff", "woff"],
  ["font/woff2", "woff2"],
  ["application/x-font-ttf", "ttf"],
  ["font/truetype", "ttf"],
  ["font/ttf", "ttf"],
  ["application/x-font-type1", "pfb"],
]);

// Maps MIME types reported by FontFaceObject to human-readable font format
// names.
const MIMETYPE_TO_FORMAT = new Map([
  ["font/opentype", "OpenType"],
  ["font/otf", "OpenType"],
  ["font/woff", "WOFF"],
  ["font/woff2", "WOFF2"],
  ["application/x-font-ttf", "TrueType"],
  ["font/truetype", "TrueType"],
  ["font/ttf", "TrueType"],
  ["application/x-font-type1", "Type1"],
]);

class FontView {
  // Persistent map of all fonts seen since the document was opened,
  // keyed by loadedName (= the PDF resource name / CSS font-family).
  // Never cleared on page navigation so fonts cached in commonObjs
  // (which only trigger fontAdded once per document) are always available.
  #fontMap = new Map();

  #container;

  #list = (() => {
    const ul = document.createElement("ul");
    ul.className = "font-list";
    return ul;
  })();

  #onSelect;

  #selectedName = null;

  #downloadBtn;

  constructor(containerEl, { onSelect } = {}) {
    this.#container = containerEl;
    this.#onSelect = onSelect;

    this.#container.append(this.#buildToolbar(), this.#list);
  }

  #buildToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "font-toolbar";

    // Color picker button + hidden input.
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.hidden = true;

    const colorSwatch = document.createElement("span");
    colorSwatch.className = "font-color-swatch";

    const colorBtn = document.createElement("button");
    colorBtn.className = "font-color-button";
    colorBtn.title = "Highlight color";
    colorBtn.append(colorSwatch);

    const applyColor = color => {
      colorInput.value = color;
      document.documentElement.style.setProperty(
        "--font-highlight-color",
        color
      );
    };
    applyColor(
      localStorage.getItem(FONT_HIGHLIGHT_COLOR_KEY) ??
        DEFAULT_FONT_HIGHLIGHT_COLOR
    );

    colorBtn.addEventListener("click", () => colorInput.click());
    colorInput.addEventListener("input", () => {
      applyColor(colorInput.value);
      localStorage.setItem(FONT_HIGHLIGHT_COLOR_KEY, colorInput.value);
    });

    // Download button — enabled only when a font with data is selected.
    const downloadBtn = (this.#downloadBtn = document.createElement("button"));
    downloadBtn.className = "font-download-button";
    downloadBtn.title = "Download selected font";
    downloadBtn.disabled = true;
    downloadBtn.addEventListener("click", () => {
      const font = this.#fontMap.get(this.#selectedName);
      if (!font?.data) {
        return;
      }
      const ext = MIMETYPE_TO_EXTENSION.get(font.mimetype) ?? "font";
      const name = (font.name || font.loadedName).replaceAll(
        /[^a-z0-9_-]/gi,
        "_"
      );
      const blob = new Blob([font.data], { type: font.mimetype });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });

    toolbar.append(colorBtn, colorInput, downloadBtn);
    return toolbar;
  }

  get element() {
    return this.#container;
  }

  // Called by FontInspector.fontAdded whenever a font face is bound.
  fontAdded(font) {
    this.#fontMap.set(font.loadedName, font);
  }

  // Show the subset of known fonts that appear in the given op list.
  // Uses setFont ops to determine which fonts are actually used on the page.
  showForOpList({ fnArray, argsArray }, OPS) {
    const usedNames = new Set();
    for (let i = 0, len = fnArray.length; i < len; i++) {
      if (fnArray[i] === OPS.setFont) {
        usedNames.add(argsArray[i][0]);
      }
    }

    const fonts = [];
    for (const name of usedNames) {
      const font = this.#fontMap.get(name);
      if (font) {
        fonts.push(font);
      }
    }
    this.#render(fonts);
  }

  clear() {
    this.#selectedName = null;
    this.#downloadBtn.disabled = true;
    this.#list.replaceChildren();
  }

  #render(fonts) {
    if (fonts.length === 0) {
      const li = document.createElement("li");
      li.className = "font-empty";
      li.textContent = "No fonts on this page.";
      this.#list.replaceChildren(li);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const font of fonts) {
      const li = document.createElement("li");
      li.className = "font-item";
      li.dataset.loadedName = font.loadedName;
      if (font.loadedName === this.#selectedName) {
        li.classList.add("selected");
      }
      li.addEventListener("click", () => {
        const next =
          font.loadedName === this.#selectedName ? null : font.loadedName;
        this.#selectedName = next;
        for (const item of this.#list.querySelectorAll(".font-item")) {
          item.classList.toggle("selected", item.dataset.loadedName === next);
        }
        const selectedFont = next ? this.#fontMap.get(next) : null;
        this.#downloadBtn.disabled = !selectedFont?.data;
        this.#onSelect?.(next);
      });

      const nameEl = document.createElement("div");
      nameEl.className = "font-name";
      nameEl.textContent = font.name || font.loadedName;
      li.append(nameEl);

      const tags = [];
      const fmt = MIMETYPE_TO_FORMAT.get(font.mimetype);
      if (fmt) {
        tags.push(fmt);
      }
      if (font.isType3Font) {
        tags.push("Type3");
      }
      if (font.bold) {
        tags.push("Bold");
      }
      if (font.italic) {
        tags.push("Italic");
      }
      if (font.vertical) {
        tags.push("Vertical");
      }
      if (font.disableFontFace) {
        tags.push("System");
      }
      if (font.missingFile) {
        tags.push("Missing");
      }

      if (tags.length) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "font-tags";
        for (const tag of tags) {
          const span = document.createElement("span");
          span.className = "font-tag";
          span.textContent = tag;
          tagsEl.append(span);
        }
        li.append(tagsEl);
      }

      const loadedEl = document.createElement("div");
      loadedEl.className = "font-loaded-name";
      loadedEl.textContent = font.loadedName;
      li.append(loadedEl);

      frag.append(li);
    }
    this.#list.replaceChildren(frag);
  }
}

export { FontView };
