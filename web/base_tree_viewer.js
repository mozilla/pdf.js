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

import { removeNullCharacters } from "./ui_utils.js";

const TREEITEM_OFFSET_TOP = -100; // px
const TREEITEM_SELECTED_CLASS = "selected";

class BaseTreeViewer {
  constructor(options) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseTreeViewer
    ) {
      throw new Error("Cannot initialize BaseTreeViewer.");
    }
    this.container = options.container;
    this.eventBus = options.eventBus;
    this._l10n = options.l10n;

    this.reset();
  }

  reset() {
    this._pdfDocument = null;
    this._lastToggleIsShow = true;
    this._currentTreeItem = null;

    // Remove the tree from the DOM.
    this.container.textContent = "";
    // Ensure that the left (right in RTL locales) margin is always reset,
    // to prevent incorrect tree alignment if a new document is opened.
    this.container.classList.remove("treeWithDeepNesting");
  }

  /**
   * @protected
   */
  _dispatchEvent(count) {
    throw new Error("Not implemented: _dispatchEvent");
  }

  /**
   * @protected
   */
  _bindLink(element, params) {
    throw new Error("Not implemented: _bindLink");
  }

  /**
   * @private
   */
  _normalizeTextContent(str) {
    // Chars in range [0x01-0x1F] will be replaced with a white space
    // and 0x00 by "".
    return (
      removeNullCharacters(str, /* replaceInvisible */ true) ||
      /* en dash = */ "\u2013"
    );
  }

  /**
   * Prepend a button before a tree item which allows the user to collapse or
   * expand all tree items at that level; see `_toggleTreeItem`.
   * @param {HTMLDivElement} div
   * @param {boolean|object} [hidden]
   * @protected
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
    div.prepend(toggler);
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
    // Pause translation when collapsing/expanding the subtree.
    this._l10n.pause();

    this._lastToggleIsShow = show;
    for (const toggler of root.querySelectorAll(".treeItemToggler")) {
      toggler.classList.toggle("treeItemsHidden", !show);
    }
    this._l10n.resume();
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
    // Pause translation when inserting the tree into the DOM.
    this._l10n.pause();
    this.container.append(fragment);
    this._l10n.resume();

    this._dispatchEvent(count);
  }

  render(params) {
    throw new Error("Not implemented: render");
  }

  /**
   * @private
   */
  _updateCurrentTreeItem(treeItem = null) {
    if (this._currentTreeItem) {
      // Ensure that the current treeItem-selection is always removed.
      this._currentTreeItem.classList.remove(TREEITEM_SELECTED_CLASS);
      this._currentTreeItem = null;
    }
    if (treeItem) {
      treeItem.classList.add(TREEITEM_SELECTED_CLASS);
      this._currentTreeItem = treeItem;
    }
  }

  /**
   * @private
   */
  _scrollToCurrentTreeItem(treeItem) {
    if (!treeItem) {
      return;
    }
    // Pause translation when expanding the treeItem.
    this._l10n.pause();
    // Ensure that the treeItem is *fully* expanded, such that it will first of
    // all be visible and secondly that scrolling it into view works correctly.
    let currentNode = treeItem.parentNode;
    while (currentNode && currentNode !== this.container) {
      if (currentNode.classList.contains("treeItem")) {
        const toggler = currentNode.firstElementChild;
        toggler?.classList.remove("treeItemsHidden");
      }
      currentNode = currentNode.parentNode;
    }
    this._l10n.resume();

    this._updateCurrentTreeItem(treeItem);

    this.container.scrollTo(
      treeItem.offsetLeft,
      treeItem.offsetTop + TREEITEM_OFFSET_TOP
    );
  }
}

export { BaseTreeViewer };
