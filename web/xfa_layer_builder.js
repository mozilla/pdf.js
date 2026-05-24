/* Copyright 2021 Mozilla Foundation
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
/** @typedef {import("../src/display/annotation_storage").AnnotationStorage} AnnotationStorage */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/page_viewport").PageViewport} PageViewport */
/** @typedef {import("./pdf_link_service.js").PDFLinkService} PDFLinkService */

import { XfaLayer } from "pdfjs-lib";

/**
 * @typedef {Object} XfaLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {PDFLinkService} linkService
 * @property {Object} [xfaHtml]
 */

/**
 * @typedef {Object} XfaLayerBuilderRenderOptions
 * @property {PageViewport} viewport
 * @property {string} [intent] - The default value is "display".
 */

class XfaLayerBuilder {
  #cancelled = false;

  div = null;

  /**
   * @param {XfaLayerBuilderOptions} options
   */
  constructor({
    pdfPage,
    annotationStorage = null,
    linkService,
    xfaHtml = null,
  }) {
    this.pdfPage = pdfPage;
    this.annotationStorage = annotationStorage;
    this.linkService = linkService;
    this.xfaHtml = xfaHtml;
  }

  /**
   * @param {XfaLayerBuilderRenderOptions} viewport
   * @returns {Promise<Object | void>} A promise that is resolved when rendering
   *   of the XFA layer is complete. The first rendering will return an object
   *   with a `textDivs` property that can be used with the TextHighlighter.
   */
  async render({ viewport, intent = "display" }) {
    let xfaHtml;
    if (intent === "print") {
      xfaHtml = this.xfaHtml;
    } else {
      xfaHtml = await this.pdfPage.getXfa();

      if (this.#cancelled || !xfaHtml) {
        return { textDivs: [] };
      }
    }

    // Create an xfa layer div and render the form
    const hasDiv = !!this.div;
    const params = {
      viewport: viewport.clone({ dontFlip: true }),
      div: (this.div ??= document.createElement("div")),
      xfaHtml,
      annotationStorage: this.annotationStorage,
      linkService: this.linkService,
      intent,
    };

    return hasDiv ? XfaLayer.update(params) : XfaLayer.render(params);
  }

  cancel() {
    this.#cancelled = true;
  }

  hide() {
    if (!this.div) {
      return;
    }
    this.div.hidden = true;
  }
}

export { XfaLayerBuilder };
