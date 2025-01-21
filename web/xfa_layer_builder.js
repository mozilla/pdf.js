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
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */

import { XfaLayer } from "pdfjs-lib";

/**
 * @typedef {Object} XfaLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {IPDFLinkService} linkService
 * @property {Object} [xfaHtml]
 */

/**
 * @typedef {Object} XfaLayerBuilderRenderOptions
 * @property {PageViewport} viewport
 * @property {string} [intent] - The default value is "display".
 */

class XfaLayerBuilder {
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

    this.div = null;
    this._cancelled = false;
  }

  /**
   * @param {XfaLayerBuilderRenderOptions} viewport
   * @returns {Promise<Object | void>} A promise that is resolved when rendering
   *   of the XFA layer is complete. The first rendering will return an object
   *   with a `textDivs` property that can be used with the TextHighlighter.
   */
  async render({ viewport, intent = "display" }) {
    if (intent === "print") {
      const parameters = {
        viewport: viewport.clone({ dontFlip: true }),
        div: this.div,
        xfaHtml: this.xfaHtml,
        annotationStorage: this.annotationStorage,
        linkService: this.linkService,
        intent,
      };

      // Create an xfa layer div and render the form
      this.div = document.createElement("div");
      parameters.div = this.div;

      return XfaLayer.render(parameters);
    }

    // intent === "display"
    const xfaHtml = await this.pdfPage.getXfa();
    if (this._cancelled || !xfaHtml) {
      return { textDivs: [] };
    }

    const parameters = {
      viewport: viewport.clone({ dontFlip: true }),
      div: this.div,
      xfaHtml,
      annotationStorage: this.annotationStorage,
      linkService: this.linkService,
      intent,
    };

    if (this.div) {
      return XfaLayer.update(parameters);
    }
    // Create an xfa layer div and render the form
    this.div = document.createElement("div");
    parameters.div = this.div;

    return XfaLayer.render(parameters);
  }

  cancel() {
    this._cancelled = true;
  }

  hide() {
    if (!this.div) {
      return;
    }
    this.div.hidden = true;
  }
}

export { XfaLayerBuilder };
