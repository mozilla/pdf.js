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
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */
/** @typedef {import("./interfaces").IPDFXfaLayerFactory} IPDFXfaLayerFactory */

import { SimpleLinkService } from "./pdf_link_service.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";

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

export { DefaultXfaLayerFactory };
