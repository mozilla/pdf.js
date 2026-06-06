/* Copyright 2022 Mozilla Foundation
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

import { DrawLayer } from "pdfjs-lib";

/**
 * @typedef DrawLayerBuilderOptions
 *   Configuration for {@linkcode DrawLayerBuilder}.
 * @property {number} pageIndex
 *   Zero-based page index.
 * @property {Element | null} [textLayer]
 *   Text layer element (optional).
 * @property {Object | null} [filterFactory]
 *   Filter factory used to style selections (optional).
 * @property {Object | null} [pageColors]
 *   Page foreground/background colors for HCM (optional).
 */

/**
 * @typedef {Object} DrawLayerBuilderRenderOptions
 * @property {string} [intent] - The default value is "display".
 */

class DrawLayerBuilder {
  #drawLayer = null;

  /**
   * @param {DrawLayerBuilderOptions} options
   *   Configuration.
   * @returns
   *   Instance.
   */
  constructor(options) {
    this.pageIndex = options.pageIndex;
    this.textLayer = options.textLayer || null;
    this.filterFactory = options.filterFactory || null;
    this.pageColors = options.pageColors || null;
  }

  /**
   * @param {DrawLayerBuilderRenderOptions} options
   * @returns {Promise<void>}
   */
  async render({ intent = "display" }) {
    if (intent !== "display" || this.#drawLayer || this._cancelled) {
      return;
    }
    this.#drawLayer = new DrawLayer({
      pageIndex: this.pageIndex,
      textLayer: this.textLayer,
      filterFactory: this.filterFactory,
      pageColors: this.pageColors,
    });
  }

  cancel() {
    this._cancelled = true;

    this.#drawLayer?.destroy();
    this.#drawLayer = null;
  }

  setParent(parent) {
    this.#drawLayer?.setParent(parent);
  }

  getDrawLayer() {
    return this.#drawLayer;
  }
}

export { DrawLayerBuilder };
