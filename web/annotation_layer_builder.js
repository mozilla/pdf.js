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

// eslint-disable-next-line max-len
/** @typedef {import("./interfaces").IPDFAnnotationLayerFactory} IPDFAnnotationLayerFactory */

import { AnnotationLayer } from "pdfjs-lib";
import { NullL10n } from "./l10n_utils.js";
import { SimpleLinkService } from "./pdf_link_service.js";

/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 * @property {IL10n} l10n - Localization service.
 * @property {boolean} [enableScripting]
 * @property {Promise<boolean>} [hasJSActionsPromise]
 * @property {Promise<Object<string, Array<Object>> | null>}
 *   [fieldObjectsPromise]
 * @property {Object} [mouseState]
 */

class AnnotationLayerBuilder {
  /**
   * @param {AnnotationLayerBuilderOptions} options
   */
  constructor({
    pageDiv,
    pdfPage,
    linkService,
    downloadManager,
    annotationStorage = null,
    imageResourcesPath = "",
    renderForms = true,
    l10n = NullL10n,
    enableScripting = false,
    hasJSActionsPromise = null,
    fieldObjectsPromise = null,
    mouseState = null,
  }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderForms = renderForms;
    this.l10n = l10n;
    this.annotationStorage = annotationStorage;
    this.enableScripting = enableScripting;
    this._hasJSActionsPromise = hasJSActionsPromise;
    this._fieldObjectsPromise = fieldObjectsPromise;
    this._mouseState = mouseState;

    this.div = null;
    this._cancelled = false;
  }

  /**
   * @param {PageViewport} viewport
   * @param {string} intent (default value is 'display')
   * @returns {Promise<void>} A promise that is resolved when rendering of the
   *   annotations is complete.
   */
  async render(viewport, intent = "display") {
    const [annotations, hasJSActions = false, fieldObjects = null] =
      await Promise.all([
        this.pdfPage.getAnnotations({ intent }),
        this._hasJSActionsPromise,
        this._fieldObjectsPromise,
      ]);

    if (this._cancelled || annotations.length === 0) {
      return;
    }

    const parameters = {
      viewport: viewport.clone({ dontFlip: true }),
      div: this.div,
      annotations,
      page: this.pdfPage,
      imageResourcesPath: this.imageResourcesPath,
      renderForms: this.renderForms,
      linkService: this.linkService,
      downloadManager: this.downloadManager,
      annotationStorage: this.annotationStorage,
      enableScripting: this.enableScripting,
      hasJSActions,
      fieldObjects,
      mouseState: this._mouseState,
    };

    if (this.div) {
      // If an annotationLayer already exists, refresh its children's
      // transformation matrices.
      AnnotationLayer.update(parameters);
    } else {
      // Create an annotation layer div and render the annotations
      // if there is at least one annotation.
      this.div = document.createElement("div");
      this.div.className = "annotationLayer";
      this.pageDiv.appendChild(this.div);
      parameters.div = this.div;

      AnnotationLayer.render(parameters);
      this.l10n.translate(this.div);
    }
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
 * @implements IPDFAnnotationLayerFactory
 */
class DefaultAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
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
    fieldObjectsPromise = null
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
    });
  }
}

export { AnnotationLayerBuilder, DefaultAnnotationLayerFactory };
