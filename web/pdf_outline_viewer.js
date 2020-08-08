/* Copyright 2012 Mozilla Foundation
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

import { addLinkAttributes, LinkTarget } from "pdfjs-lib";
import { BaseTreeViewer } from "./base_tree_viewer.js";

/**
 * @typedef {Object} PDFOutlineViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * @typedef {Object} PDFOutlineViewerRenderParameters
 * @property {Array|null} outline - An array of outline objects.
 */

class PDFOutlineViewer extends BaseTreeViewer {
  /**
   * @param {PDFOutlineViewerOptions} options
   */
  constructor(options) {
    super(options);
    this.linkService = options.linkService;

    this.eventBus._on("toggleoutlinetree", this._toggleAllTreeItems.bind(this));
  }

  reset() {
    super.reset();
    this._outline = null;
  }

  /**
   * @private
   */
  _dispatchEvent(outlineCount) {
    this.eventBus.dispatch("outlineloaded", {
      source: this,
      outlineCount,
    });
  }

  /**
   * @private
   */
  _bindLink(element, { url, newWindow, dest }) {
    const { linkService } = this;

    if (url) {
      addLinkAttributes(element, {
        url,
        target: newWindow ? LinkTarget.BLANK : linkService.externalLinkTarget,
        rel: linkService.externalLinkRel,
        enabled: linkService.externalLinkEnabled,
      });
      return;
    }

    element.href = linkService.getDestinationHash(dest);
    element.onclick = () => {
      if (dest) {
        linkService.navigateTo(dest);
      }
      return false;
    };
  }

  /**
   * @private
   */
  _setStyles(element, { bold, italic }) {
    if (bold) {
      element.style.fontWeight = "bold";
    }
    if (italic) {
      element.style.fontStyle = "italic";
    }
  }

  /**
   * @private
   */
  _addToggleButton(div, { count, items }) {
    const hidden = count < 0 && Math.abs(count) === items.length;
    super._addToggleButton(div, hidden);
  }

  /**
   * @private
   */
  _toggleAllTreeItems() {
    if (!this._outline) {
      return;
    }
    super._toggleAllTreeItems();
  }

  /**
   * @param {PDFOutlineViewerRenderParameters} params
   */
  render({ outline }) {
    if (this._outline) {
      this.reset();
    }
    this._outline = outline || null;

    if (!outline) {
      this._dispatchEvent(/* outlineCount = */ 0);
      return;
    }

    const fragment = document.createDocumentFragment();
    const queue = [{ parent: fragment, items: outline }];
    let outlineCount = 0,
      hasAnyNesting = false;
    while (queue.length > 0) {
      const levelData = queue.shift();
      for (const item of levelData.items) {
        const div = document.createElement("div");
        div.className = "treeItem";

        const element = document.createElement("a");
        this._bindLink(element, item);
        this._setStyles(element, item);
        element.textContent = this._normalizeTextContent(item.title);

        div.appendChild(element);

        if (item.items.length > 0) {
          hasAnyNesting = true;
          this._addToggleButton(div, item);

          const itemsDiv = document.createElement("div");
          itemsDiv.className = "treeItems";
          div.appendChild(itemsDiv);

          queue.push({ parent: itemsDiv, items: item.items });
        }

        levelData.parent.appendChild(div);
        outlineCount++;
      }
    }
    if (hasAnyNesting) {
      this.container.classList.add("treeWithDeepNesting");

      this._lastToggleIsShow =
        fragment.querySelectorAll(".treeItemsHidden").length === 0;
    }

    this.container.appendChild(fragment);

    this._dispatchEvent(outlineCount);
  }
}

export { PDFOutlineViewer };
