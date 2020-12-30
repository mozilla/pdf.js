/* Copyright 2020 Mozilla Foundation
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

import { removeNullCharacters } from "pdfjs-lib";

class BaseTreeViewer {
  constructor(options) {
    if (this.constructor === BaseTreeViewer) {
      throw new Error("Cannot initialize BaseTreeViewer.");
    }
    this.container = options.container;
    this.eventBus = options.eventBus;

    this.reset();
  }

  reset() {
    this._lastToggleIsShow = true;

    // Remove the tree from the DOM.
    this.container.textContent = "";
    // Ensure that the left (right in RTL locales) margin is always reset,
    // to prevent incorrect tree alignment if a new document is opened.
    this.container.classList.remove("treeWithDeepNesting");
  }

  /**
   * @private
   */
  _dispatchEvent(count) {
    throw new Error("Not implemented: _dispatchEvent");
  }

  /**
   * @private
   */
  _bindLink(element, params) {
    throw new Error("Not implemented: _bindLink");
  }

  /**
   * @private
   */
  _normalizeTextContent(str) {
    return removeNullCharacters(str) || /* en dash = */ "\u2013";
  }

  /**
   * Prepend a button before a tree item which allows the user to collapse or
   * expand all tree items at that level; see `_toggleTreeItem`.
   * @private
   */
  _addToggleButton(div, hidden = false) {
    const toggler = document.createElement("div");
    toggler.className = "treeItemToggler";
    if (hidden) {
      toggler.classList.add("treeItemsHidden");
    }
    toggler.onclick = evt => {
      evt.stopPropagation();
      toggler.classList.toggle("treeItemsHidden");

      if (evt.shiftKey) {
        const shouldShowAll = !toggler.classList.contains("treeItemsHidden");
        this._toggleTreeItem(div, shouldShowAll);
      }
    };
    div.insertBefore(toggler, div.firstChild);
  }

  /**
   * Collapse or expand the subtree of a tree item.
   *
   * @param {Element} root - the root of the item (sub)tree.
   * @param {boolean} show - whether to show the item (sub)tree. If false,
   *   the item subtree rooted at `root` will be collapsed.
   * @private
   */
  _toggleTreeItem(root, show = false) {
    this._lastToggleIsShow = show;
    for (const toggler of root.querySelectorAll(".treeItemToggler")) {
      toggler.classList.toggle("treeItemsHidden", !show);
    }
  }

  /**
   * Collapse or expand all subtrees of the `container`.
   * @private
   */
  _toggleAllTreeItems() {
    this._toggleTreeItem(this.container, !this._lastToggleIsShow);
  }

  /**
   * @private
   */
  _finishRendering(fragment, count, hasAnyNesting = false) {
    if (hasAnyNesting) {
      this.container.classList.add("treeWithDeepNesting");

      this._lastToggleIsShow = !fragment.querySelector(".treeItemsHidden");
    }
    this.container.appendChild(fragment);

    this._dispatchEvent(count);
  }

  render(params) {
    throw new Error("Not implemented: render");
  }
}

export { BaseTreeViewer };
