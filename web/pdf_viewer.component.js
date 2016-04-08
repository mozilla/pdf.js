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
/*jshint globalstrict: false */

(function pdfViewerWrapper() {
  'use strict';

  var root = this;
  if (!root.pdfjsLib) {
    Object.defineProperty(root, 'pdfjsLib', {
      get: function () {
        return root.pdfjsDistBuildPdf || root.pdfjsDistBuildPdfCombined ||
               root.pdfjsMainLoader;
      },
      enumerable: true,
      configurable: true
    });
  }

  var pdfViewerLibs = {};
  (function () {
//#expand __BUNDLE__
  }).call(pdfViewerLibs);

  var PDFJS = window.PDFJS || (window.PDFJS = {});

  PDFJS.PDFViewer = pdfViewerLibs.pdfjsWebPDFViewer.PDFViewer;
  PDFJS.PDFPageView = pdfViewerLibs.pdfjsWebPDFPageView.PDFPageView;
  PDFJS.PDFLinkService = pdfViewerLibs.pdfjsWebPDFLinkService.PDFLinkService;
  PDFJS.TextLayerBuilder =
    pdfViewerLibs.pdfjsWebTextLayerBuilder.TextLayerBuilder;
  PDFJS.DefaultTextLayerFactory =
    pdfViewerLibs.pdfjsWebTextLayerBuilder.DefaultTextLayerFactory;
  PDFJS.AnnotationLayerBuilder =
    pdfViewerLibs.pdfjsWebAnnotationLayerBuilder.AnnotationLayerBuilder;
  PDFJS.DefaultAnnotationLayerFactory =
    pdfViewerLibs.pdfjsWebAnnotationLayerBuilder.DefaultAnnotationLayerFactory;
  PDFJS.PDFHistory = pdfViewerLibs.pdfjsWebPDFHistory.PDFHistory;

  PDFJS.DownloadManager = pdfViewerLibs.pdfjsWebDownloadManager.DownloadManager;
  PDFJS.ProgressBar = pdfViewerLibs.pdfjsWebUIUtils.ProgressBar;
}).call((typeof window === 'undefined') ? this : window);
