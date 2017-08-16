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

'use strict';

var pdfjsLib = require('./pdfjs.js');
var pdfjsWebPDFViewer = require('./pdf_viewer.js');
var pdfjsWebPDFPageView = require('./pdf_page_view.js');
var pdfjsWebPDFLinkService = require('./pdf_link_service.js');
var pdfjsWebTextLayerBuilder = require('./text_layer_builder.js');
var pdfjsWebAnnotationLayerBuilder = require('./annotation_layer_builder.js');
var pdfjsWebPDFHistory = require('./pdf_history.js');
var pdfjsWebPDFFindController = require('./pdf_find_controller.js');
var pdfjsWebUIUtils = require('./ui_utils.js');
var pdfjsWebDownloadManager = require('./download_manager.js');
var pdfjsWebGenericL10n = require('./genericl10n.js');

var PDFJS = pdfjsLib.PDFJS;

PDFJS.PDFViewer = pdfjsWebPDFViewer.PDFViewer;
PDFJS.PDFPageView = pdfjsWebPDFPageView.PDFPageView;
PDFJS.PDFLinkService = pdfjsWebPDFLinkService.PDFLinkService;
PDFJS.TextLayerBuilder = pdfjsWebTextLayerBuilder.TextLayerBuilder;
PDFJS.DefaultTextLayerFactory =
  pdfjsWebTextLayerBuilder.DefaultTextLayerFactory;
PDFJS.AnnotationLayerBuilder =
  pdfjsWebAnnotationLayerBuilder.AnnotationLayerBuilder;
PDFJS.DefaultAnnotationLayerFactory =
  pdfjsWebAnnotationLayerBuilder.DefaultAnnotationLayerFactory;
PDFJS.PDFHistory = pdfjsWebPDFHistory.PDFHistory;
PDFJS.PDFFindController = pdfjsWebPDFFindController.PDFFindController;
PDFJS.EventBus = pdfjsWebUIUtils.EventBus;

PDFJS.DownloadManager = pdfjsWebDownloadManager.DownloadManager;
PDFJS.ProgressBar = pdfjsWebUIUtils.ProgressBar;
PDFJS.GenericL10n = pdfjsWebGenericL10n.GenericL10n;
PDFJS.NullL10n = pdfjsWebUIUtils.NullL10n;

exports.PDFJS = PDFJS;
