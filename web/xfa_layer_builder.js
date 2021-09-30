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

/** @typedef {import("./interfaces").IPDFXfaLayerFactory} IPDFXfaLayerFactory */

import { SimpleLinkService } from "./pdf_link_service.js";
import { XfaLayer } from "pdfjs-lib";

/**
 * @typedef {Object} XfaLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {IPDFLinkService} linkService
 * @property {Object} [xfaHtml]
 */

class XfaLayerBuilder {
  /**
   * @param {XfaLayerBuilderOptions} options
   */
  constructor({ pageDiv, pdfPage, annotationStorage, linkService, xfaHtml }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.annotationStorage = annotationStorage;
    this.linkService = linkService;
    this.xfaHtml = xfaHtml;

    this.div = null;
    this._cancelled = false;
  }

  /**
   * @param {PageViewport} viewport
   * @param {string} intent (default value is 'display')
   * @returns {Promise<Object | void>} A promise that is resolved when rendering
   *   of the XFA layer is complete. The first rendering will return an object
   *   with a `textDivs` property that  can be used with the TextHighlighter.
   */
  render(viewport, intent = "display") {
    if (intent === "print") {
      const parameters = {
        viewport: viewport.clone({ dontFlip: true }),
        div: this.div,
        xfa: this.xfaHtml,
        page: null,
        annotationStorage: this.annotationStorage,
        linkService: this.linkService,
        intent,
      };

      // Create an xfa layer div and render the form
      const div = document.createElement("div");
      this.pageDiv.appendChild(div);
      parameters.div = div;

      const result = XfaLayer.render(parameters);
      return Promise.resolve(result);
    }

    // intent === "display"
    return this.pdfPage
      .getXfa()
      .then(xfa => {
        if (this._cancelled || !xfa) {
          return { textDivs: [] };
        }

        const parameters = {
          viewport: viewport.clone({ dontFlip: true }),
          div: this.div,
          xfa,
          page: this.pdfPage,
          annotationStorage: this.annotationStorage,
          linkService: this.linkService,
          intent,
        };

        if (this.div) {
          return XfaLayer.update(parameters);
        }
        // Create an xfa layer div and render the form
        this.div = document.createElement("div");
        this.pageDiv.appendChild(this.div);
        parameters.div = this.div;
        return XfaLayer.render(parameters);
      })
      .catch(error => {
        console.error(error);
      });
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

/**
 * @implements IPDFXfaLayerFactory
 */
class DefaultXfaLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
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

export { DefaultXfaLayerFactory, XfaLayerBuilder };
