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
/*globals PDFJS, mozL10n, SimpleLinkService */

'use strict';

/**
 * @typedef {Object} AnnotationsLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {IPDFLinkService} linkService
 */

/**
 * @class
 */
var AnnotationsLayerBuilder = (function AnnotationsLayerBuilderClosure() {
  /**
   * @param {AnnotationsLayerBuilderOptions} options
   * @constructs AnnotationsLayerBuilder
   */
  function AnnotationsLayerBuilder(options) {
    this.pageDiv = options.pageDiv;
    this.pdfPage = options.pdfPage;
    this.linkService = options.linkService;

    this.div = null;
  }

  AnnotationsLayerBuilder.prototype =
      /** @lends AnnotationsLayerBuilder.prototype */ {

    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     */
    render: function AnnotationsLayerBuilder_render(viewport, intent) {
      var self = this;
      var parameters = {
        intent: (intent === undefined ? 'display' : intent),
      };

      this.pdfPage.getAnnotations(parameters).then(function (annotations) {
        viewport = viewport.clone({ dontFlip: true });

        if (self.div) {
          // If an annotationLayer already exists, refresh its children's
          // transformation matrices.
          PDFJS.AnnotationLayer.update(viewport, self.div, annotations);
        } else {
          // Create an annotation layer div and render the annotations
          // if there is at least one annotation.
          if (annotations.length === 0) {
            return;
          }

          self.div = document.createElement('div');
          self.div.className = 'annotationLayer';
          self.pageDiv.appendChild(self.div);

          PDFJS.AnnotationLayer.render(viewport, self.div, annotations,
                                       self.pdfPage, self.linkService);
          if (typeof mozL10n !== 'undefined') {
            mozL10n.translate(self.div);
          }
        }
      });
    },

    hide: function AnnotationsLayerBuilder_hide() {
      if (!this.div) {
        return;
      }
      this.div.setAttribute('hidden', 'true');
    }
  };

  return AnnotationsLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFAnnotationsLayerFactory
 */
function DefaultAnnotationsLayerFactory() {}
DefaultAnnotationsLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @returns {AnnotationsLayerBuilder}
   */
  createAnnotationsLayerBuilder: function (pageDiv, pdfPage) {
    return new AnnotationsLayerBuilder({
      pageDiv: pageDiv,
      pdfPage: pdfPage,
      linkService: new SimpleLinkService(),
    });
  }
};
