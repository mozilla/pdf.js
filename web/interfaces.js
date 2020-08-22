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
  get externalLinkEnabled() {}

  /**
   * @param {boolean} value
   */
  set externalLinkEnabled(value) {}

  /**
   * @param dest - The PDF destination object.
   */
  navigateTo(dest) {}

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
   * @param {number} pageNum - page number.
   * @param {Object} pageRef - reference to the page.
   */
  cachePageRef(pageNum, pageRef) {}

  /**
   * @param {number} pageNumber
   */
  isPageVisible(pageNumber) {}
}

/**
 * @interface
 */
class IPDFHistory {
  /**
   * @param {Object} params
   */
  initialize({ fingerprint, resetHistory = false, updateUrl = false }) {}

  reset() {}

  /**
   * @param {Object} params
   */
  push({ namedDest = null, explicitDest, pageNumber }) {}

  pushCurrentPosition() {}

  back() {}

  forward() {}
}

/**
 * @interface
 */
class IRenderableView {
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
  draw() {}

  resume() {}
}

/**
 * @interface
 */
class IPDFTextLayerFactory {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @param {boolean} enhanceTextSelection
   * @param {EventBus} eventBus
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(
    textLayerDiv,
    pageIndex,
    viewport,
    enhanceTextSelection = false,
    eventBus
  ) {}
}

/**
 * @interface
 */
class IPDFAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @param {AnnotationStorage} [annotationStorage] - Storage for annotation
   *   data in forms.
   * @param {string} [imageResourcesPath] - Path for image resources, mainly
   *   for annotation icons. Include trailing slash.
   * @param {boolean} renderInteractiveForms
   * @param {IL10n} l10n
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder(
    pageDiv,
    pdfPage,
    annotationStorage = null,
    imageResourcesPath = "",
    renderInteractiveForms = true,
    l10n = undefined
  ) {}
}

/**
 * @interface
 */
class IL10n {
  /**
   * @returns {Promise<string>} - Resolves to the current locale.
   */
  async getLanguage() {}

  /**
   * @returns {Promise<string>} - Resolves to 'rtl' or 'ltr'.
   */
  async getDirection() {}

  /**
   * Translates text identified by the key and adds/formats data using the args
   * property bag. If the key was not found, translation falls back to the
   * fallback text.
   * @param {string} key
   * @param {object} args
   * @param {string} fallback
   * @returns {Promise<string>}
   */
  async get(key, args, fallback) {}

  /**
   * Translates HTML element.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  async translate(element) {}
}

export {
  IPDFLinkService,
  IPDFHistory,
  IRenderableView,
  IPDFTextLayerFactory,
  IPDFAnnotationLayerFactory,
  IL10n,
};
