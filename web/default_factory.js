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
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */

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
    l10n = NullL10n,
    enableScripting = false,
    hasJSActionsPromise = null,
    mouseState = null,
    fieldObjectsPromise = null,
    annotationCanvasMap = null,
    accessibilityManager = null,
  }) {
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
      accessibilityManager,
    });
  }
}

/**
 * @implements IPDFAnnotationEditorLayerFactory
 */
class DefaultAnnotationEditorLayerFactory {
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
    accessibilityManager = null,
    l10n,
    annotationStorage = null,
  }) {
    return new AnnotationEditorLayerBuilder({
      uiManager,
      pageDiv,
      pdfPage,
      accessibilityManager,
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
   * @typedef {Object} CreateStructTreeLayerBuilderParameters
   * @property {PDFPageProxy} pdfPage
   */

  /**
   * @param {CreateStructTreeLayerBuilderParameters}
   * @returns {StructTreeLayerBuilder}
   */
  createStructTreeLayerBuilder({ pdfPage }) {
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
    accessibilityManager = null,
  }) {
    return new TextLayerBuilder({
      textLayerDiv,
      pageIndex,
      viewport,
      eventBus,
      highlighter,
      accessibilityManager,
    });
  }
}

/**
 * @implements IPDFXfaLayerFactory
 */
class DefaultXfaLayerFactory {
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
  createXfaLayerBuilder({ pageDiv, pdfPage, annotationStorage = null }) {
    return new XfaLayerBuilder({
      pageDiv,
      pdfPage,
      annotationStorage,
      linkService: new SimpleLinkService(),
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
