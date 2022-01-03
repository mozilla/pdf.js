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
/** @typedef {import("./event_utils").EventBus} EventBus */
// eslint-disable-next-line max-len
/** @typedef {import("./struct_tree_builder").StructTreeLayerBuilder} StructTreeLayerBuilder */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */
// eslint-disable-next-line max-len
/** @typedef {import("./text_layer_builder").TextLayerBuilder} TextLayerBuilder */
/** @typedef {import("./ui_utils").RenderingStates} RenderingStates */
/** @typedef {import("./xfa_layer_builder").XfaLayerBuilder} XfaLayerBuilder */

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
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @param {boolean} enhanceTextSelection
   * @param {EventBus} eventBus
   * @param {TextHighlighter} highlighter
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(
    textLayerDiv,
    pageIndex,
    viewport,
    enhanceTextSelection = false,
    eventBus,
    highlighter
  ) {}
}

/**
 * @interface
 */
class IPDFAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPageProxy} pdfPage
   * @param {AnnotationStorage} [annotationStorage] - Storage for annotation
   *   data in forms.
   * @param {string} [imageResourcesPath] - Path for image resources, mainly
   *   for annotation icons. Include trailing slash.
   * @param {boolean} renderForms
   * @param {IL10n} l10n
   * @param {boolean} [enableScripting]
   * @param {Promise<boolean>} [hasJSActionsPromise]
   * @param {Object} [mouseState]
   * @param {Promise<Object<string, Array<Object>> | null>}
   *   [fieldObjectsPromise]
   * @param {Map<string, HTMLCanvasElement>} [annotationCanvasMap] - Map some
   *   annotation ids with canvases used to render them.
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder(
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
    annotationCanvasMap = null
  ) {}
}

/**
 * @interface
 */
class IPDFXfaLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPageProxy} pdfPage
   * @param {AnnotationStorage} [annotationStorage]
   * @param {Object} [xfaHtml]
   * @returns {XfaLayerBuilder}
   */
  createXfaLayerBuilder(
    pageDiv,
    pdfPage,
    annotationStorage = null,
    xfaHtml = null
  ) {}
}

/**
 * @interface
 */
class IPDFStructTreeLayerFactory {
  /**
   * @param {PDFPageProxy} pdfPage
   * @returns {StructTreeLayerBuilder}
   */
  createStructTreeLayerBuilder(pdfPage) {}
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
   * @param {string} [sourceEventType]
   */
  download(blob, url, filename, sourceEventType = "download") {}
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
  IPDFAnnotationLayerFactory,
  IPDFLinkService,
  IPDFStructTreeLayerFactory,
  IPDFTextLayerFactory,
  IPDFXfaLayerFactory,
  IRenderableView,
};
