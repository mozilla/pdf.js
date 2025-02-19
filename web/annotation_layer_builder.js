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
/** @typedef {import("./struct_tree_layer_builder.js").StructTreeLayerBuilder} StructTreeLayerBuilder */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/editor/tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */

import {
  AnnotationLayer,
  AnnotationType,
  setLayerDimensions,
  Util,
} from "pdfjs-lib";
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

/**
 * @typedef {Object} AnnotationLayerBuilderRenderOptions
 * @property {PageViewport} viewport
 * @property {string} [intent] - The default value is "display".
 * @property {StructTreeLayerBuilder} [structTreeLayer]
 */

/**
 * @typedef {Object} InjectLinkAnnotationsOptions
 * @property {Array<Object>} inferredLinks
 * @property {PageViewport} viewport
 * @property {StructTreeLayerBuilder} [structTreeLayer]
 */

class AnnotationLayerBuilder {
  #annotations = null;

  #externalHide = false;

  #onAppend = null;

  #eventAbortController = null;

  #linksInjected = false;

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
   * @param {AnnotationLayerBuilderRenderOptions} options
   * @returns {Promise<void>} A promise that is resolved when rendering of the
   *   annotations is complete.
   */
  async render({ viewport, intent = "display", structTreeLayer = null }) {
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
      this.#annotations = annotations;

      this.hide(/* internal = */ true);
      return;
    }

    this.#initAnnotationLayer(viewport, structTreeLayer);

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

    this.#annotations = annotations;

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

  #initAnnotationLayer(viewport, structTreeLayer) {
    this.annotationLayer = new AnnotationLayer({
      div: this.div,
      accessibilityManager: this._accessibilityManager,
      annotationCanvasMap: this._annotationCanvasMap,
      annotationEditorUIManager: this._annotationEditorUIManager,
      page: this.pdfPage,
      viewport: viewport.clone({ dontFlip: true }),
      structTreeLayer,
    });
  }

  cancel() {
    this._cancelled = true;

    this.#eventAbortController?.abort();
    this.#eventAbortController = null;
  }

  hide(internal = false) {
    this.#externalHide = !internal;
    if (!this.div) {
      return;
    }
    this.div.hidden = true;
  }

  hasEditableAnnotations() {
    return !!this.annotationLayer?.hasEditableAnnotations();
  }

  /**
   * @param {InjectLinkAnnotationsOptions} options
   * @returns {Promise<void>} A promise that is resolved when the inferred links
   *   are added to the annotation layer.
   */
  async injectLinkAnnotations({
    inferredLinks,
    viewport,
    structTreeLayer = null,
  }) {
    if (this.#annotations === null) {
      throw new Error(
        "`render` method must be called before `injectLinkAnnotations`."
      );
    }
    if (this._cancelled || this.#linksInjected) {
      return;
    }
    this.#linksInjected = true;

    const newLinks = this.#annotations.length
      ? this.#checkInferredLinks(inferredLinks)
      : inferredLinks;

    if (!newLinks.length) {
      return;
    }

    if (!this.annotationLayer) {
      this.#initAnnotationLayer(viewport, structTreeLayer);
      setLayerDimensions(this.div, viewport);
    }

    await this.annotationLayer.addLinkAnnotations(newLinks, this.linkService);
    // Don't show the annotation layer if it was explicitly hidden previously.
    if (!this.#externalHide) {
      this.div.hidden = false;
    }
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

  #checkInferredLinks(inferredLinks) {
    function annotationRects(annot) {
      if (!annot.quadPoints) {
        return [annot.rect];
      }
      const rects = [];
      for (let i = 2, ii = annot.quadPoints.length; i < ii; i += 8) {
        const trX = annot.quadPoints[i];
        const trY = annot.quadPoints[i + 1];
        const blX = annot.quadPoints[i + 2];
        const blY = annot.quadPoints[i + 3];
        rects.push([blX, blY, trX, trY]);
      }
      return rects;
    }

    function intersectAnnotations(annot1, annot2) {
      const intersections = [];
      const annot1Rects = annotationRects(annot1);
      const annot2Rects = annotationRects(annot2);
      for (const rect1 of annot1Rects) {
        for (const rect2 of annot2Rects) {
          const intersection = Util.intersect(rect1, rect2);
          if (intersection) {
            intersections.push(intersection);
          }
        }
      }
      return intersections;
    }

    function areaRects(rects) {
      let totalArea = 0;
      for (const rect of rects) {
        totalArea += Math.abs((rect[2] - rect[0]) * (rect[3] - rect[1]));
      }
      return totalArea;
    }

    return inferredLinks.filter(link => {
      let linkAreaRects;

      for (const annotation of this.#annotations) {
        if (
          annotation.annotationType !== AnnotationType.LINK ||
          !annotation.url
        ) {
          continue;
        }
        // TODO: Add a test case to verify that we can find the intersection
        //       between two annotations with quadPoints properly.
        const intersections = intersectAnnotations(annotation, link);

        if (intersections.length === 0) {
          continue;
        }
        linkAreaRects ??= areaRects(annotationRects(link));

        if (
          areaRects(intersections) / linkAreaRects >
          0.5 /* If the overlap is more than 50%. */
        ) {
          return false;
        }
      }
      return true;
    });
  }
}

export { AnnotationLayerBuilder };
