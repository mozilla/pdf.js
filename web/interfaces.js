/* Copyright 2014 Mozilla Foundation
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
/* eslint-disable no-unused-vars */

'use strict';

/**
 * @interface
 */
class IPDFLinkService {
  /**
   * @returns {number}
   */
  get page() {}

  /**
   * @param {number} value
   */
  set page(value) {}

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
   * @param {Object} params
   */
  onFileAttachmentAnnotation({ id, filename, content, }) {}

  /**
   * @param {number} pageNum - page number.
   * @param {Object} pageRef - reference to the page.
   */
  cachePageRef(pageNum, pageRef) {}
}

/**
 * @interface
 */
class IPDFHistory {
  forward() {}
  back() {}
  push(params) {}
  updateNextHashParam(hash) {}
}

/**
 * @interface
 */
class IRenderableView {
  /**
   * @returns {string} - Unique ID for rendering queue.
   */
  get renderingId() {}

  /**
   * @returns {RenderingStates}
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
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(textLayerDiv, pageIndex, viewport,
                         enhanceTextSelection = false) {}
}

/**
 * @interface
 */
class IPDFAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @param {IL10n} l10n
   * @param {boolean} renderInteractiveForms
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder(pageDiv, pdfPage,
                               renderInteractiveForms = false,
                               l10n = undefined) {}
}

/**
 * @interface
 */
class IL10n {
  /**
   * @returns {Promise<string>} - Resolves to 'rtl' or 'ltr'.
   */
  getDirection() {}

  /**
   * Translates text identified by the key and adds/formats data using the args
   * property bag. If the key was not found, translation falls back to the
   * fallback text.
   * @param {string} key
   * @param {object} args
   * @param {string} fallback
   * @returns {Promise<string>}
   */
  get(key, args, fallback) { }

  /**
   * Translates HTML element.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  translate(element) { }
}
