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
