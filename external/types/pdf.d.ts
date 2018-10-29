/* Copyright 2017 Mozilla Foundation
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

/// <reference path="dom.d.ts" />
/// <reference path="shared.d.ts" />
/// <reference path="core.d.ts" />
/// <reference path="display.d.ts" />
/// <reference path="web.d.ts" />

declare module 'pdfjs-dist' {
  //
  // src/pdf.js
  //
  export import build = _pdfjs.build;
  export import version = _pdfjs.version;
  export import getDocument = _pdfjs.getDocument;
  export import LoopbackPort = _pdfjs.LoopbackPort;
  export import PDFDataRangeTransport = _pdfjs.PDFDataRangeTransport;
  export import PDFWorker = _pdfjs.PDFWorker;
  export import renderTextLayer = _pdfjs.renderTextLayer;
  export import AnnotationLayer = _pdfjs.AnnotationLayer;
  export import createPromiseCapability = _pdfjs.createPromiseCapability;
  export import PasswordResponses = _pdfjs.PasswordResponses;
  export import InvalidPDFException = _pdfjs.InvalidPDFException;
  export import MissingPDFException = _pdfjs.MissingPDFException;
  export import SVGGraphics = _pdfjs.SVGGraphics;
  export import NativeImageDecoding = _pdfjs.NativeImageDecoding;
  export import UnexpectedResponseException = _pdfjs.UnexpectedResponseException;
  export import OPS = _pdfjs.OPS;
  export import VerbosityLevel = _pdfjs.VerbosityLevel;
  export import UNSUPPORTED_FEATURES = _pdfjs.UNSUPPORTED_FEATURES;
  export import createValidAbsoluteUrl = _pdfjs.createValidAbsoluteUrl;
  export import createObjectURL = _pdfjs.createObjectURL;
  export import removeNullCharacters = _pdfjs.removeNullCharacters;
  export import shadow = _pdfjs.shadow;
  export import createBlob = _pdfjs.createBlob;
  export import Util = _pdfjs.Util;
  export import RenderingCancelledException = _pdfjs.RenderingCancelledException;
  export import getFilenameFromUrl = _pdfjs.getFilenameFromUrl;
  export import LinkTarget = _pdfjs.LinkTarget;
  export import addLinkAttributes = _pdfjs.addLinkAttributes;
  export import GlobalWorkerOptions = _pdfjs.GlobalWorkerOptions;
  export import apiCompatibilityParams = _pdfjs.apiCompatibilityParams;

  //
  // Convenience types that are used often.
  //
  export import PDFDocumentProxy = _pdfjs.PDFDocumentProxy;
  export import DocumentInitParameters = _pdfjs.DocumentInitParameters;
  export import PDFPageProxy = _pdfjs.PDFPageProxy;
  export import PDFDocumentLoadingTask = _pdfjs.PDFDocumentLoadingTask;
  export import PageIndex = _pdfjs.PageIndex;
  export import Outline = _pdfjs.Outline;
  export import Transform = _pdfjs.Transform;
  export import Point = _pdfjs.Point;
  export import Rect = _pdfjs.Rect;
  export import PDFObjects = _pdfjs.PDFObjects;
  export import PDFOperatorList = _pdfjs.PDFOperatorList;
  export import PageViewport = _pdfjs.PageViewport;
  export import Annotation = _pdfjs.Annotation;
  export import RenderParameters = _pdfjs.RenderParameters;
  export import PDFViewerOptions = _pdfjs.PDFViewerOptions;
  export import DocumentLoadingProgress = _pdfjs.DocumentLoadingProgress;

  //
  // All other types. Warning: this should only be used to access types, not
  // functions or variables.
  //
  export import types = _pdfjs;
}

declare module 'pdfjs-dist/web/pdf_viewer' {
  //
  // web/pdf_viewer.component.js
  //
  export import PDFViewer = _pdfjs.PDFViewer;
  export import PDFSinglePageViewer = _pdfjs.PDFSinglePageViewer;
  export import PDFPageView = _pdfjs.PDFPageView;
  export import PDFLinkService = _pdfjs.PDFLinkService;
  export import SimpleLinkService = _pdfjs.SimpleLinkService;
  export import TextLayerBuilder = _pdfjs.TextLayerBuilder;
  export import DefaultTextLayerFactory = _pdfjs.DefaultTextLayerFactory;
  export import AnnotationLayerBuilder = _pdfjs.AnnotationLayerBuilder;
  export import DefaultAnnotationLayerFactory = _pdfjs.DefaultAnnotationLayerFactory;
  export import PDFHistory = _pdfjs.PDFHistory;
  export import PDFFindController = _pdfjs.PDFFindController;
  export import EventBus = _pdfjs.EventBus;
  export import DownloadManager = _pdfjs.DownloadManager;
  export import ProgressBar = _pdfjs.ProgressBar;
  export import GenericL10n = _pdfjs.GenericL10n;
  export import NullL10n = _pdfjs.NullL10n;
}

// Webpack version.
declare module 'pdfjs-dist/webpack' {
  export * from 'pdfjs-dist';
}
