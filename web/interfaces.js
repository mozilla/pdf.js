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
class IPDFLinkService {
  /**
   * @type {number}
   */
  get pagesCount() {}

  /**
   * @type {number}
   */
  get page() {}

  /**
   * @param {number} value
   */
  set page(value) {}

  /**
   * @type {number}
   */
  get rotation() {}

  /**
   * @param {number} value
   */
  set rotation(value) {}

  /**
   * @type {boolean}
   */
  get isInPresentationMode() {}

  /**
   * @type {boolean}
   */
  get externalLinkEnabled() {}

  /**
   * @param {boolean} value
   */
  set externalLinkEnabled(value) {}

  /**
   * @param {string|Array} dest - The named, or explicit, PDF destination.
   */
  async goToDestination(dest) {}

  /**
   * @param {number|string} val - The page number, or page label.
   */
  goToPage(val) {}

  /**
   * @param {HTMLAnchorElement} link
   * @param {string} url
   * @param {boolean} [newWindow]
   */
  addLinkAttributes(link, url, newWindow = false) {}

  /**
   * @param dest - The PDF destination object.
   * @returns {string} The hyperlink to the PDF object.
   */
  getDestinationHash(dest) {}

  /**
   * @param hash - The PDF parameters/hash.
   * @returns {string} The hyperlink to the PDF object.
   */
  getAnchorUrl(hash) {}

  /**
   * @param {string} hash
   */
  setHash(hash) {}

  /**
   * @param {string} action
   */
  executeNamedAction(action) {}

  /**
   * @param {Object} action
   */
  executeSetOCGState(action) {}
}

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
class IL10n {
  /**
   * @returns {string} - The current locale.
   */
  getLanguage() {}

  /**
   * @returns {string} - 'rtl' or 'ltr'.
   */
  getDirection() {}

  /**
   * Translates text identified by the key and adds/formats data using the args
   * property bag. If the key was not found, translation falls back to the
   * fallback text.
   * @param {Array | string} ids
   * @param {Object | null} [args]
   * @param {string} [fallback]
   * @returns {Promise<string>}
   */
  async get(ids, args = null, fallback) {}

  /**
   * Translates HTML element.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  async translate(element) {}

  /**
   * Pause the localization.
   */
  pause() {}

  /**
   * Resume the localization.
   */
  resume() {}
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

export {
  IDownloadManager,
  IL10n,
  IPDFLinkService,
  IPDFPrintServiceFactory,
  IRenderableView,
};
