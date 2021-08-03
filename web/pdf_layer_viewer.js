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

import { BaseTreeViewer } from "./base_tree_viewer.js";

/**
 * @typedef {Object} PDFLayerViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IL10n} l10n - Localization service.
 */

/**
 * @typedef {Object} PDFLayerViewerRenderParameters
 * @property {OptionalContentConfig|null} optionalContentConfig - An
 *   {OptionalContentConfig} instance.
 * @property {PDFDocument} pdfDocument - A {PDFDocument} instance.
 */

class PDFLayerViewer extends BaseTreeViewer {
  constructor(options) {
    super(options);
    this.l10n = options.l10n;

    this.eventBus._on("resetlayers", this._resetLayers.bind(this));
    this.eventBus._on("togglelayerstree", this._toggleAllTreeItems.bind(this));
  }

  reset() {
    super.reset();
    this._optionalContentConfig = null;
  }

  /**
   * @private
   */
  _dispatchEvent(layersCount) {
    this.eventBus.dispatch("layersloaded", {
      source: this,
      layersCount,
    });
  }

  /**
   * @private
   */
  _bindLink(element, { groupId, input }) {
    const setVisibility = () => {
      this._optionalContentConfig.setVisibility(groupId, input.checked);

      this.eventBus.dispatch("optionalcontentconfig", {
        source: this,
        promise: Promise.resolve(this._optionalContentConfig),
      });
    };

    element.onclick = evt => {
      if (evt.target === input) {
        setVisibility();
        return true;
      } else if (evt.target !== element) {
        return true; // The target is the "label", which is handled above.
      }
      input.checked = !input.checked;
      setVisibility();
      return false;
    };
  }

  /**
   * @private
   */
  async _setNestedName(element, { name = null }) {
    if (typeof name === "string") {
      element.textContent = this._normalizeTextContent(name);
      return;
    }
    element.textContent = await this.l10n.get("additional_layers");
    element.style.fontStyle = "italic";
  }

  /**
   * @private
   */
  _addToggleButton(div, { name = null }) {
    super._addToggleButton(div, /* hidden = */ name === null);
  }

  /**
   * @private
   */
  _toggleAllTreeItems() {
    if (!this._optionalContentConfig) {
      return;
    }
    super._toggleAllTreeItems();
  }

  /**
   * @param {PDFLayerViewerRenderParameters} params
   */
  render({ optionalContentConfig, pdfDocument }) {
    if (this._optionalContentConfig) {
      this.reset();
    }
    this._optionalContentConfig = optionalContentConfig || null;
    this._pdfDocument = pdfDocument || null;

    const groups = optionalContentConfig?.getOrder();
    if (!groups) {
      this._dispatchEvent(/* layersCount = */ 0);
      return;
    }

    const fragment = document.createDocumentFragment(),
      queue = [{ parent: fragment, groups }];
    let layersCount = 0,
      hasAnyNesting = false;
    while (queue.length > 0) {
      const levelData = queue.shift();
      for (const groupId of levelData.groups) {
        const div = document.createElement("div");
        div.className = "treeItem";

        const element = document.createElement("a");
        div.appendChild(element);

        if (typeof groupId === "object") {
          hasAnyNesting = true;
          this._addToggleButton(div, groupId);
          this._setNestedName(element, groupId);

          const itemsDiv = document.createElement("div");
          itemsDiv.className = "treeItems";
          div.appendChild(itemsDiv);

          queue.push({ parent: itemsDiv, groups: groupId.order });
        } else {
          const group = optionalContentConfig.getGroup(groupId);

          const input = document.createElement("input");
          this._bindLink(element, { groupId, input });
          input.type = "checkbox";
          input.id = groupId;
          input.checked = group.visible;

          const label = document.createElement("label");
          label.setAttribute("for", groupId);
          label.textContent = this._normalizeTextContent(group.name);

          element.appendChild(input);
          element.appendChild(label);

          layersCount++;
        }

        levelData.parent.appendChild(div);
      }
    }

    this._finishRendering(fragment, layersCount, hasAnyNesting);
  }

  /**
   * @private
   */
  async _resetLayers() {
    if (!this._optionalContentConfig) {
      return;
    }
    // Fetch the default optional content configuration...
    const optionalContentConfig =
      await this._pdfDocument.getOptionalContentConfig();

    this.eventBus.dispatch("optionalcontentconfig", {
      source: this,
      promise: Promise.resolve(optionalContentConfig),
    });

    // ... and reset the sidebarView to the default state.
    this.render({
      optionalContentConfig,
      pdfDocument: this._pdfDocument,
    });
  }
}

export { PDFLayerViewer };
