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

import { XfaLayer } from "pdfjs-lib";

/**
 * @typedef {Object} XfaLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 */

class XfaLayerBuilder {
  /**
   * @param {XfaLayerBuilderOptions} options
   */
  constructor({ pageDiv, pdfPage, xfaHtml, annotationStorage }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.xfaHtml = xfaHtml;
    this.annotationStorage = annotationStorage;

    this.div = null;
    this._cancelled = false;
  }

  /**
   * @param {PageViewport} viewport
   * @param {string} intent (default value is 'display')
   * @returns {Promise<void>} A promise that is resolved when rendering of the
   *   annotations is complete.
   */
  render(viewport, intent = "display") {
    if (intent === "print") {
      const parameters = {
        viewport: viewport.clone({ dontFlip: true }),
        div: this.div,
        xfa: this.xfaHtml,
        page: null,
        annotationStorage: this.annotationStorage,
        intent,
      };

      // Create an xfa layer div and render the form
      const div = document.createElement("div");
      this.pageDiv.appendChild(div);
      parameters.div = div;

      XfaLayer.render(parameters);
      return Promise.resolve();
    }

    // intent === "display"
    return this.pdfPage
      .getXfa()
      .then(xfa => {
        if (this._cancelled) {
          return;
        }
        const parameters = {
          viewport: viewport.clone({ dontFlip: true }),
          div: this.div,
          xfa,
          page: this.pdfPage,
          annotationStorage: this.annotationStorage,
          intent,
        };

        if (this.div) {
          XfaLayer.update(parameters);
        } else {
          // Create an xfa layer div and render the form
          this.div = document.createElement("div");
          this.pageDiv.appendChild(this.div);
          parameters.div = this.div;

          XfaLayer.render(parameters);
        }
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
      xfaHtml,
    });
  }
}

export { DefaultXfaLayerFactory, XfaLayerBuilder };
