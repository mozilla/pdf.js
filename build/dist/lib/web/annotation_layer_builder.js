/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefaultAnnotationLayerFactory = exports.AnnotationLayerBuilder = void 0;

var _pdf = require("../pdf");

var _ui_utils = require("./ui_utils.js");

var _pdf_link_service = require("./pdf_link_service.js");

class AnnotationLayerBuilder {
  constructor({
    pageDiv,
    pdfPage,
    linkService,
    downloadManager,
    imageResourcesPath = "",
    renderInteractiveForms = false,
    l10n = _ui_utils.NullL10n
  }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderInteractiveForms = renderInteractiveForms;
    this.l10n = l10n;
    this.div = null;
    this._cancelled = false;
  }

  render(viewport, intent = "display") {
    this.pdfPage.getAnnotations({
      intent
    }).then(annotations => {
      if (this._cancelled) {
        return;
      }

      const parameters = {
        viewport: viewport.clone({
          dontFlip: true
        }),
        div: this.div,
        annotations,
        page: this.pdfPage,
        imageResourcesPath: this.imageResourcesPath,
        renderInteractiveForms: this.renderInteractiveForms,
        linkService: this.linkService,
        downloadManager: this.downloadManager
      };

      if (this.div) {
        _pdf.AnnotationLayer.update(parameters);
      } else {
        if (annotations.length === 0) {
          return;
        }

        this.div = document.createElement("div");
        this.div.className = "annotationLayer";
        this.pageDiv.appendChild(this.div);
        parameters.div = this.div;

        _pdf.AnnotationLayer.render(parameters);

        this.l10n.translate(this.div);
      }
    });
  }

  cancel() {
    this._cancelled = true;
  }

  hide() {
    if (!this.div) {
      return;
    }

    this.div.setAttribute("hidden", "true");
  }

}

exports.AnnotationLayerBuilder = AnnotationLayerBuilder;

class DefaultAnnotationLayerFactory {
  createAnnotationLayerBuilder(pageDiv, pdfPage, imageResourcesPath = "", renderInteractiveForms = false, l10n = _ui_utils.NullL10n) {
    return new AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      imageResourcesPath,
      renderInteractiveForms,
      linkService: new _pdf_link_service.SimpleLinkService(),
      l10n
    });
  }

}

exports.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;