/* Copyright 2018 Mozilla Foundation
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
/* eslint-disable getter-return */

/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./ui_utils").RenderingStates} RenderingStates */

/**
 * @interface
 */
class IRenderableView {
  constructor() {
    /** @type {function | null} */
    this.resume = null;
  }

  /**
   * @type {string} - Unique ID for rendering queue.
   */
  get renderingId() {}

  /**
   * @type {RenderingStates}
   */
  get renderingState() {}

  /**
   * @returns {Promise} Resolved on draw completion.
   */
  async draw() {}
}

/**
 * @interface
 */
class IDownloadManager {
  /**
   * @param {Uint8Array} data
   * @param {string} filename
   * @param {string} [contentType]
   */
  downloadData(data, filename, contentType) {}

  /**
   * @param {Uint8Array} data
   * @param {string} filename
   * @param {string | null} [dest]
   * @returns {boolean} Indicating if the data was opened.
   */
  openOrDownloadData(data, filename, dest = null) {}

  /**
   * @param {Uint8Array} data
   * @param {string} url
   * @param {string} filename
   */
  download(data, url, filename) {}
}

/**
 * @interface
 */
class IPDFPrintServiceFactory {
  static initGlobals() {}

  static get supportsPrinting() {
    return false;
  }

  static createPrintService() {
    throw new Error("Not implemented: createPrintService");
  }
}

export { IDownloadManager, IPDFPrintServiceFactory, IRenderableView };
