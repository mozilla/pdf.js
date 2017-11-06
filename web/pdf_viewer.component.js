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

import {
  AnnotationLayerBuilder, DefaultAnnotationLayerFactory
} from './annotation_layer_builder.js';
import {
  DefaultTextLayerFactory, TextLayerBuilder
} from './text_layer_builder.js';
import { EventBus, NullL10n, ProgressBar } from './ui_utils.js';
import { PDFLinkService, SimpleLinkService } from './pdf_link_service.js';
import { DownloadManager } from './download_manager.js';
import { GenericL10n } from './genericl10n.js';
import { PDFFindController } from './pdf_find_controller.js';
import { PDFHistory } from './pdf_history.js';
import pdfjsLib from './pdfjs.js';
import { PDFPageView } from './pdf_page_view.js';
import { PDFSinglePageViewer } from './pdf_single_page_viewer';
import { PDFViewer } from './pdf_viewer.js';

let { PDFJS, } = pdfjsLib;

PDFJS.PDFViewer = PDFViewer;
PDFJS.PDFSinglePageViewer = PDFSinglePageViewer;
PDFJS.PDFPageView = PDFPageView;
PDFJS.PDFLinkService = PDFLinkService;
PDFJS.SimpleLinkService = SimpleLinkService;
PDFJS.TextLayerBuilder = TextLayerBuilder;
PDFJS.DefaultTextLayerFactory = DefaultTextLayerFactory;
PDFJS.AnnotationLayerBuilder = AnnotationLayerBuilder;
PDFJS.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;
PDFJS.PDFHistory = PDFHistory;
PDFJS.PDFFindController = PDFFindController;
PDFJS.EventBus = EventBus;

PDFJS.DownloadManager = DownloadManager;
PDFJS.ProgressBar = ProgressBar;
PDFJS.GenericL10n = GenericL10n;
PDFJS.NullL10n = NullL10n;

export {
  PDFJS,
};
