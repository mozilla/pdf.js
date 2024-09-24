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
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/annotation_storage").AnnotationStorage} AnnotationStorage */
/** @typedef {import("./interfaces").IDownloadManager} IDownloadManager */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/editor/tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */

import { AnnotationLayer } from "pdfjs-lib";
import { PresentationModeState } from "./ui_utils.js";

/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {IPDFLinkService} linkService
 * @property {IDownloadManager} [downloadManager]
 * @property {boolean} [enableScripting]
 * @property {Promise<boolean>} [hasJSActionsPromise]
 * @property {Promise<Object<string, Array<Object>> | null>}
 *   [fieldObjectsPromise]
 * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap]
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {AnnotationEditorUIManager} [annotationEditorUIManager]
 * @property {function} [onAppend]
 */

class AnnotationLayerBuilder {
  #onAppend = null;

  #eventAbortController = null;

  /**
   * @param {AnnotationLayerBuilderOptions} options
   */
  constructor({
    pdfPage,
    linkService,
    downloadManager,
    annotationStorage = null,
    imageResourcesPath = "",
    renderForms = true,
    enableScripting = false,
    hasJSActionsPromise = null,
    fieldObjectsPromise = null,
    annotationCanvasMap = null,
    accessibilityManager = null,
    annotationEditorUIManager = null,
    onAppend = null,
  }) {
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderForms = renderForms;
    this.annotationStorage = annotationStorage;
    this.enableScripting = enableScripting;
    this._hasJSActionsPromise = hasJSActionsPromise || Promise.resolve(false);
    this._fieldObjectsPromise = fieldObjectsPromise || Promise.resolve(null);
    this._annotationCanvasMap = annotationCanvasMap;
    this._accessibilityManager = accessibilityManager;
    this._annotationEditorUIManager = annotationEditorUIManager;
    this.#onAppend = onAppend;

    this.annotationLayer = null;
    this.div = null;
    this._cancelled = false;
    this._eventBus = linkService.eventBus;
  }

  /**
   * @param {PageViewport} viewport
   * @param {Object} options
   * @param {string} intent (default value is 'display')
   * @returns {Promise<void>} A promise that is resolved when rendering of the
   *   annotations is complete.
   */
  async render(viewport, options, intent = "display") {
    if (this.div) {
      if (this._cancelled || !this.annotationLayer) {
        return;
      }
      // If an annotationLayer already exists, refresh its children's
      // transformation matrices.
      this.annotationLayer.update({
        viewport: viewport.clone({ dontFlip: true }),
      });
      return;
    }

    const [annotations, hasJSActions, fieldObjects] = await Promise.all([
      this.pdfPage.getAnnotations({ intent }),
      this._hasJSActionsPromise,
      this._fieldObjectsPromise,
    ]);
    if (this._cancelled) {
      return;
    }

    // Create an annotation layer div and render the annotations
    // if there is at least one annotation.
    const div = (this.div = document.createElement("div"));
    div.className = "annotationLayer";
    this.#onAppend?.(div);

    if (annotations.length === 0) {
      this.hide();
      return;
    }

    this.annotationLayer = new AnnotationLayer({
      div,
      accessibilityManager: this._accessibilityManager,
      annotationCanvasMap: this._annotationCanvasMap,
      annotationEditorUIManager: this._annotationEditorUIManager,
      page: this.pdfPage,
      viewport: viewport.clone({ dontFlip: true }),
      structTreeLayer: options?.structTreeLayer || null,
    });

    await this.annotationLayer.render({
      annotations,
      imageResourcesPath: this.imageResourcesPath,
      renderForms: this.renderForms,
      linkService: this.linkService,
      downloadManager: this.downloadManager,
      annotationStorage: this.annotationStorage,
      enableScripting: this.enableScripting,
      hasJSActions,
      fieldObjects,
    });

    // Ensure that interactive form elements in the annotationLayer are
    // disabled while PresentationMode is active (see issue 12232).
    if (this.linkService.isInPresentationMode) {
      this.#updatePresentationModeState(PresentationModeState.FULLSCREEN);
    }
    if (!this.#eventAbortController) {
      this.#eventAbortController = new AbortController();

      this._eventBus?._on(
        "presentationmodechanged",
        evt => {
          this.#updatePresentationModeState(evt.state);
        },
        { signal: this.#eventAbortController.signal }
      );
    }
  }

  cancel() {
    this._cancelled = true;

    this.#eventAbortController?.abort();
    this.#eventAbortController = null;
  }

  hide() {
    if (!this.div) {
      return;
    }
    this.div.hidden = true;
  }

  hasEditableAnnotations() {
    return !!this.annotationLayer?.hasEditableAnnotations();
  }

  #updatePresentationModeState(state) {
    if (!this.div) {
      return;
    }
    let disableFormElements = false;

    switch (state) {
      case PresentationModeState.FULLSCREEN:
        disableFormElements = true;
        break;
      case PresentationModeState.NORMAL:
        break;
      default:
        return;
    }
    for (const section of this.div.childNodes) {
      if (section.hasAttribute("data-internal-link")) {
        continue;
      }
      section.inert = disableFormElements;
    }
  }
}

export { AnnotationLayerBuilder };
