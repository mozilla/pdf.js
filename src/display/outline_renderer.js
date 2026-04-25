/* Copyright 2024 Mozilla Foundation
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

/**
 * OutlineRenderer — renders a PDF bookmark/outline tree as an interactive,
 * accessible HTML widget.
 *
 * Features:
 *   - Hierarchical expand/collapse of outline nodes
 *   - Jump-to-page navigation via click or Enter
 *   - Keyboard navigation (arrow keys, Home/End)
 *   - Search / filter within outline titles
 *   - Full ARIA tree semantics
 *   - Event delegation for performance (single listener on the root)
 */

/** @typedef {import("./api.js").PDFDocumentProxy} PDFDocumentProxy */

const OUTLINE_CSS_CLASS = "pdfjs-outline";
const NODE_CSS_CLASS = "pdfjs-outline-node";
const LEAF_CSS_CLASS = "pdfjs-outline-leaf";
const TOGGLE_CSS_CLASS = "pdfjs-outline-toggle";
const TITLE_CSS_CLASS = "pdfjs-outline-title";
const CHILDREN_CSS_CLASS = "pdfjs-outline-children";
const SEARCH_CSS_CLASS = "pdfjs-outline-search";
const HIDDEN_CSS_CLASS = "pdfjs-outline-hidden";

/**
 * Render a flat outline array (as returned by PDFDocumentProxy#getOutline)
 * into an interactive tree.
 */
class OutlineRenderer {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container  – element to host the outline tree
   * @param {Function}    options.onNavigate – callback(dest) invoked on click
   * @param {boolean}     [options.expandAll=false] – expand every node initially
   */
  constructor({ container, onNavigate, expandAll = false }) {
    if (!container) {
      throw new Error("OutlineRenderer: container element is required.");
    }
    this._container = container;
    this._onNavigate = onNavigate;
    this._expandAll = expandAll;
    this._searchInput = null;
    this._treeRoot = null;

    // Bind once so we can remove listeners later.
    this._handleClick = this._handleClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleSearch = this._handleSearch.bind(this);
  }

  /**
   * Build and attach the outline tree.
   * @param {Array|null} outlineItems – result of PDFDocumentProxy#getOutline()
   */
  render(outlineItems) {
    this.dispose();

    if (!outlineItems || outlineItems.length === 0) {
      this._container.textContent = "";
      const msg = document.createElement("p");
      msg.textContent = "No outline available.";
      msg.setAttribute("role", "status");
      this._container.appendChild(msg);
      return;
    }

    // Search input.
    this._searchInput = document.createElement("input");
    this._searchInput.type = "search";
    this._searchInput.placeholder = "Search outline\u2026";
    this._searchInput.className = SEARCH_CSS_CLASS;
    this._searchInput.setAttribute("aria-label", "Search outline");
    this._container.appendChild(this._searchInput);
    this._searchInput.addEventListener("input", this._handleSearch);

    // Tree root.
    this._treeRoot = document.createElement("ul");
    this._treeRoot.className = OUTLINE_CSS_CLASS;
    this._treeRoot.setAttribute("role", "tree");
    this._treeRoot.setAttribute("aria-label", "Document outline");
    this._container.appendChild(this._treeRoot);

    this._buildLevel(this._treeRoot, outlineItems, 1);

    // Single delegated listeners.
    this._treeRoot.addEventListener("click", this._handleClick);
    this._treeRoot.addEventListener("keydown", this._handleKeyDown);
  }

  /**
   * Recursively build one level of the tree.
   * @param {HTMLElement} parentEl
   * @param {Array} items
   * @param {number} level – ARIA level (1-based depth)
   */
  _buildLevel(parentEl, items, level) {
    for (const item of items) {
      const hasChildren = item.items && item.items.length > 0;
      const li = document.createElement("li");
      li.className = hasChildren ? NODE_CSS_CLASS : LEAF_CSS_CLASS;
      li.setAttribute("role", "treeitem");
      li.setAttribute("aria-level", String(level));
      li.setAttribute("tabindex", level === 1 ? "0" : "-1");

      if (hasChildren) {
        const expanded = this._expandAll;
        li.setAttribute("aria-expanded", String(expanded));

        const toggle = document.createElement("span");
        toggle.className = TOGGLE_CSS_CLASS;
        toggle.textContent = expanded ? "\u25BC" : "\u25B6";
        toggle.setAttribute("role", "button");
        toggle.setAttribute("aria-label", expanded ? "Collapse" : "Expand");
        li.appendChild(toggle);
      }

      const titleSpan = document.createElement("span");
      titleSpan.className = TITLE_CSS_CLASS;
      titleSpan.textContent = item.title || "(Untitled)";
      if (item.dest) {
        titleSpan.dataset.dest = JSON.stringify(item.dest);
      }
      if (item.url) {
        titleSpan.dataset.url = item.url;
      }
      li.appendChild(titleSpan);

      if (hasChildren) {
        const childUl = document.createElement("ul");
        childUl.className = CHILDREN_CSS_CLASS;
        childUl.setAttribute("role", "group");
        if (!this._expandAll) {
          childUl.style.display = "none";
        }
        this._buildLevel(childUl, item.items, level + 1);
        li.appendChild(childUl);
      }

      parentEl.appendChild(li);
    }
  }

  // -------------------------------------------------------------------
  //  Event handlers (delegated)
  // -------------------------------------------------------------------

  /** @param {MouseEvent} evt */
  _handleClick(evt) {
    const target = evt.target;

    // Toggle expand/collapse.
    if (target.classList.contains(TOGGLE_CSS_CLASS)) {
      const li = target.parentElement;
      this._toggleNode(li);
      evt.stopPropagation();
      return;
    }

    // Navigate.
    if (target.classList.contains(TITLE_CSS_CLASS)) {
      this._navigateToItem(target);
      evt.stopPropagation();
    }
  }

  /** @param {KeyboardEvent} evt */
  _handleKeyDown(evt) {
    const target = evt.target;
    if (!target || target.getAttribute("role") !== "treeitem") {
      return;
    }

    switch (evt.key) {
      case "Enter":
      case " ": {
        const title = target.querySelector(`.${TITLE_CSS_CLASS}`);
        if (title) {
          this._navigateToItem(title);
        }
        evt.preventDefault();
        break;
      }
      case "ArrowRight": {
        if (target.getAttribute("aria-expanded") === "false") {
          this._toggleNode(target);
        } else {
          const firstChild = target.querySelector(`[role="treeitem"]`);
          if (firstChild) {
            this._focusItem(firstChild);
          }
        }
        evt.preventDefault();
        break;
      }
      case "ArrowLeft": {
        if (target.getAttribute("aria-expanded") === "true") {
          this._toggleNode(target);
        } else {
          const parentLi = target.parentElement?.closest(`[role="treeitem"]`);
          if (parentLi) {
            this._focusItem(parentLi);
          }
        }
        evt.preventDefault();
        break;
      }
      case "ArrowDown": {
        const next = this._nextVisible(target);
        if (next) {
          this._focusItem(next);
        }
        evt.preventDefault();
        break;
      }
      case "ArrowUp": {
        const prev = this._prevVisible(target);
        if (prev) {
          this._focusItem(prev);
        }
        evt.preventDefault();
        break;
      }
      case "Home": {
        const first = this._treeRoot.querySelector(`[role="treeitem"]`);
        if (first) {
          this._focusItem(first);
        }
        evt.preventDefault();
        break;
      }
      case "End": {
        const all = this._allVisibleItems();
        if (all.length) {
          this._focusItem(all[all.length - 1]);
        }
        evt.preventDefault();
        break;
      }
    }
  }

  /** @param {Event} _evt */
  _handleSearch(_evt) {
    const query = (this._searchInput.value || "").toLowerCase().trim();
    if (!this._treeRoot) {
      return;
    }

    const items = this._treeRoot.querySelectorAll(`[role="treeitem"]`);
    if (query === "") {
      // Show everything, restore collapsed state.
      for (const item of items) {
        item.classList.remove(HIDDEN_CSS_CLASS);
      }
      return;
    }

    // Mark visibility based on title match (parent nodes stay visible if any
    // descendant matches).
    for (const item of items) {
      const title = item.querySelector(`.${TITLE_CSS_CLASS}`);
      const text = (title?.textContent || "").toLowerCase();
      const matches = text.includes(query);
      item.classList.toggle(HIDDEN_CSS_CLASS, !matches);

      // If a node matches, make all its ancestors visible.
      if (matches) {
        let ancestor = item.parentElement?.closest(`[role="treeitem"]`);
        while (ancestor) {
          ancestor.classList.remove(HIDDEN_CSS_CLASS);
          // Expand so the match is visible.
          if (ancestor.getAttribute("aria-expanded") === "false") {
            this._toggleNode(ancestor);
          }
          ancestor = ancestor.parentElement?.closest(`[role="treeitem"]`);
        }
      }
    }
  }

  // -------------------------------------------------------------------
  //  Navigation helpers
  // -------------------------------------------------------------------

  _toggleNode(li) {
    const expanded = li.getAttribute("aria-expanded") === "true";
    li.setAttribute("aria-expanded", String(!expanded));
    const toggle = li.querySelector(`.${TOGGLE_CSS_CLASS}`);
    if (toggle) {
      toggle.textContent = expanded ? "\u25B6" : "\u25BC";
      toggle.setAttribute("aria-label", expanded ? "Expand" : "Collapse");
    }
    const childUl = li.querySelector(`.${CHILDREN_CSS_CLASS}`);
    if (childUl) {
      childUl.style.display = expanded ? "none" : "";
    }
  }

  _navigateToItem(titleEl) {
    if (titleEl.dataset.dest && this._onNavigate) {
      try {
        const dest = JSON.parse(titleEl.dataset.dest);
        this._onNavigate(dest);
      } catch {
        // Ignore bad JSON.
      }
    } else if (titleEl.dataset.url) {
      window.open(titleEl.dataset.url, "_blank", "noopener");
    }
  }

  _focusItem(item) {
    // Reset old tabindex.
    const prev = this._treeRoot.querySelector(`[tabindex="0"]`);
    if (prev) {
      prev.setAttribute("tabindex", "-1");
    }
    item.setAttribute("tabindex", "0");
    item.focus();
  }

  _allVisibleItems() {
    const result = [];
    const walk = (parent) => {
      for (const li of parent.children) {
        if (li.getAttribute("role") !== "treeitem") continue;
        if (li.classList.contains(HIDDEN_CSS_CLASS)) continue;
        result.push(li);
        if (li.getAttribute("aria-expanded") === "true") {
          const childUl = li.querySelector(`:scope > .${CHILDREN_CSS_CLASS}`);
          if (childUl) walk(childUl);
        }
      }
    };
    walk(this._treeRoot);
    return result;
  }

  _nextVisible(current) {
    const all = this._allVisibleItems();
    const idx = all.indexOf(current);
    return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  }

  _prevVisible(current) {
    const all = this._allVisibleItems();
    const idx = all.indexOf(current);
    return idx > 0 ? all[idx - 1] : null;
  }

  /**
   * Remove all rendered content and detach listeners.
   */
  dispose() {
    if (this._treeRoot) {
      this._treeRoot.removeEventListener("click", this._handleClick);
      this._treeRoot.removeEventListener("keydown", this._handleKeyDown);
    }
    if (this._searchInput) {
      this._searchInput.removeEventListener("input", this._handleSearch);
    }
    this._container.textContent = "";
    this._treeRoot = null;
    this._searchInput = null;
  }
}

export { OutlineRenderer };
