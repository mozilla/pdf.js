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
// eslint-disable-next-line max-len
/** @typedef {import("./annotation_layer_builder").AnnotationLayerBuilder} AnnotationLayerBuilder */
// eslint-disable-next-line max-len
/** @typedef {import("./annotation_editor_layer_builder").AnnotationEditorLayerBuilder} AnnotationEditorLayerBuilder */
/** @typedef {import("./event_utils").EventBus} EventBus */
// eslint-disable-next-line max-len
/** @typedef {import("./struct_tree_builder").StructTreeLayerBuilder} StructTreeLayerBuilder */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */
// eslint-disable-next-line max-len
/** @typedef {import("./text_layer_builder").TextLayerBuilder} TextLayerBuilder */
/** @typedef {import("./ui_utils").RenderingStates} RenderingStates */
/** @typedef {import("./xfa_layer_builder").XfaLayerBuilder} XfaLayerBuilder */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */

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

  /**
   * @param {number} pageNum - page number.
   * @param {Object} pageRef - reference to the page.
   */
  cachePageRef(pageNum, pageRef) {}

  /**
   * @param {number} pageNumber
   */
  isPageVisible(pageNumber) {}

  /**
   * @param {number} pageNumber
   */
  isPageCached(pageNumber) {}
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
  draw() {}
}

/**
 * @interface
 */
class IPDFTextLayerFactory {
  /**
   * @typedef {Object} CreateTextLayerBuilderParameters
   * @property {HTMLDivElement} textLayerDiv
   * @property {number} pageIndex
   * @property {PageViewport} viewport
   * @property {EventBus} eventBus
   * @property {TextHighlighter} highlighter
   * @property {TextAccessibilityManager} [accessibilityManager]
   */

  /**
   * @param {CreateTextLayerBuilderParameters}
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder({
    textLayerDiv,
    pageIndex,
    viewport,
    eventBus,
    highlighter,
    accessibilityManager,
  }) {}
}

/**
 * @interface
 */
class IPDFAnnotationLayerFactory {
  /**
   * @typedef {Object} CreateAnnotationLayerBuilderParameters
   * @property {HTMLDivElement} pageDiv
   * @property {PDFPageProxy} pdfPage
   * @property {AnnotationStorage} [annotationStorage] - Storage for annotation
   *   data in forms.
   * @property {string} [imageResourcesPath] - Path for image resources, mainly
   *   for annotation icons. Include trailing slash.
   * @property {boolean} renderForms
   * @property {IL10n} l10n
   * @property {boolean} [enableScripting]
   * @property {Promise<boolean>} [hasJSActionsPromise]
   * @property {Object} [mouseState]
   * @property {Promise<Object<string, Array<Object>> | null>}
   *   [fieldObjectsPromise]
   * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap] - Map some
   *   annotation ids with canvases used to render them.
   * @property {TextAccessibilityManager} [accessibilityManager]
   */

  /**
   * @param {CreateAnnotationLayerBuilderParameters}
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder({
    pageDiv,
    pdfPage,
    annotationStorage = null,
    imageResourcesPath = "",
    renderForms = true,
    l10n = undefined,
    enableScripting = false,
    hasJSActionsPromise = null,
    mouseState = null,
    fieldObjectsPromise = null,
    annotationCanvasMap = null,
    accessibilityManager = null,
  }) {}
}

/**
 * @interface
 */
class IPDFAnnotationEditorLayerFactory {
  /**
   * @typedef {Object} CreateAnnotationEditorLayerBuilderParameters
   * @property {AnnotationEditorUIManager} [uiManager]
   * @property {HTMLDivElement} pageDiv
   * @property {PDFPageProxy} pdfPage
   * @property {IL10n} l10n
   * @property {AnnotationStorage} [annotationStorage] - Storage for annotation
   * @property {TextAccessibilityManager} [accessibilityManager]
   *   data in forms.
   */

  /**
   * @param {CreateAnnotationEditorLayerBuilderParameters}
   * @returns {AnnotationEditorLayerBuilder}
   */
  createAnnotationEditorLayerBuilder({
    uiManager = null,
    pageDiv,
    pdfPage,
    l10n,
    annotationStorage = null,
    accessibilityManager,
  }) {}
}

/**
 * @interface
 */
class IPDFXfaLayerFactory {
  /**
   * @typedef {Object} CreateXfaLayerBuilderParameters
   * @property {HTMLDivElement} pageDiv
   * @property {PDFPageProxy} pdfPage
   * @property {AnnotationStorage} [annotationStorage] - Storage for annotation
   *   data in forms.
   */

  /**
   * @param {CreateXfaLayerBuilderParameters}
   * @returns {XfaLayerBuilder}
   */
  createXfaLayerBuilder({ pageDiv, pdfPage, annotationStorage = null }) {}
}

/**
 * @interface
 */
class IPDFStructTreeLayerFactory {
  /**
   * @typedef {Object} CreateStructTreeLayerBuilderParameters
   * @property {PDFPageProxy} pdfPage
   */

  /**
   * @param {CreateStructTreeLayerBuilderParameters}
   * @returns {StructTreeLayerBuilder}
   */
  createStructTreeLayerBuilder({ pdfPage }) {}
}

/**
 * @interface
 */
class IDownloadManager {
  /**
   * @param {string} url
   * @param {string} filename
   */
  downloadUrl(url, filename) {}

  /**
   * @param {Uint8Array} data
   * @param {string} filename
   * @param {string} [contentType]
   */
  downloadData(data, filename, contentType) {}

  /**
   * @param {HTMLElement} element
   * @param {Uint8Array} data
   * @param {string} filename
   * @returns {boolean} Indicating if the data was opened.
   */
  openOrDownloadData(element, data, filename) {}

  /**
   * @param {Blob} blob
   * @param {string} url
   * @param {string} filename
   */
  download(blob, url, filename) {}
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
   * @param {Object | null} [args]
   * @param {string} [fallback]
   * @returns {Promise<string>}
   */
  async get(key, args = null, fallback) {}

  /**
   * Translates HTML element.
   * @param {HTMLElement} element
   * @returns {Promise<void>}
   */
  async translate(element) {}
}

export {
  IDownloadManager,
  IL10n,
  IPDFAnnotationEditorLayerFactory,
  IPDFAnnotationLayerFactory,
  IPDFLinkService,
  IPDFStructTreeLayerFactory,
  IPDFTextLayerFactory,
  IPDFXfaLayerFactory,
  IRenderableView,
};
