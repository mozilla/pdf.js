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

/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./interfaces").IDownloadManager} IDownloadManager */
/** @typedef {import("./interfaces").IL10n} IL10n */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFAnnotationLayerFactory} IPDFAnnotationLayerFactory */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFAnnotationEditorLayerFactory} IPDFAnnotationEditorLayerFactory */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFStructTreeLayerFactory} IPDFStructTreeLayerFactory */
// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFTextLayerFactory} IPDFTextLayerFactory */
/** @typedef {import("./interfaces").IPDFXfaLayerFactory} IPDFXfaLayerFactory */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */

import { AnnotationEditorLayerBuilder } from "./annotation_editor_layer_builder.js";
import { AnnotationLayerBuilder } from "./annotation_layer_builder.js";
import { NullL10n } from "./l10n_utils.js";
import { SimpleLinkService } from "./pdf_link_service.js";
import { StructTreeLayerBuilder } from "./struct_tree_layer_builder.js";
import { TextLayerBuilder } from "./text_layer_builder.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";

/**
 * @implements IPDFAnnotationLayerFactory
 */
class DefaultAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPageProxy} pdfPage
   * @param {AnnotationStorage} [annotationStorage]
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
    l10n = NullL10n,
    enableScripting = false,
    hasJSActionsPromise = null,
    mouseState = null,
    fieldObjectsPromise = null,
    annotationCanvasMap = null
  ) {
    return new AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      imageResourcesPath,
      renderForms,
      linkService: new SimpleLinkService(),
      l10n,
      annotationStorage,
      enableScripting,
      hasJSActionsPromise,
      fieldObjectsPromise,
      mouseState,
      annotationCanvasMap,
    });
  }
}

/**
 * @implements IPDFAnnotationEditorLayerFactory
 */
class DefaultAnnotationEditorLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPageProxy} pdfPage
   * @param {IL10n} l10n
   * @param {AnnotationStorage} [annotationStorage]
   * @returns {AnnotationEditorLayerBuilder}
   */
  createAnnotationEditorLayerBuilder(
    pageDiv,
    pdfPage,
    l10n,
    annotationStorage = null
  ) {
    return new AnnotationEditorLayerBuilder({
      pageDiv,
      pdfPage,
      l10n,
      annotationStorage,
    });
  }
}

/**
 * @implements IPDFStructTreeLayerFactory
 */
class DefaultStructTreeLayerFactory {
  /**
   * @param {PDFPageProxy} pdfPage
   * @returns {StructTreeLayerBuilder}
   */
  createStructTreeLayerBuilder(pdfPage) {
    return new StructTreeLayerBuilder({
      pdfPage,
    });
  }
}

/**
 * @implements IPDFTextLayerFactory
 */
class DefaultTextLayerFactory {
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
  ) {
    return new TextLayerBuilder({
      textLayerDiv,
      pageIndex,
      viewport,
      enhanceTextSelection,
      eventBus,
      highlighter,
    });
  }
}

/**
 * @implements IPDFXfaLayerFactory
 */
class DefaultXfaLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPageProxy} pdfPage
   * @param {AnnotationStorage} [annotationStorage]
   * @param {Object} [xfaHtml]
   */
  createXfaLayerBuilder(
    pageDiv,
    pdfPage,
    annotationStorage = null,
    xfaHtml = null
  ) {
    return new XfaLayerBuilder({
      pageDiv,
      pdfPage,
      annotationStorage,
      linkService: new SimpleLinkService(),
      xfaHtml,
    });
  }
}

export {
  DefaultAnnotationEditorLayerFactory,
  DefaultAnnotationLayerFactory,
  DefaultStructTreeLayerFactory,
  DefaultTextLayerFactory,
  DefaultXfaLayerFactory,
};
