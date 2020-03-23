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
Object.defineProperty(exports, "AnnotationLayerBuilder", {
  enumerable: true,
  get: function () {
    return _annotation_layer_builder.AnnotationLayerBuilder;
  }
});
Object.defineProperty(exports, "DefaultAnnotationLayerFactory", {
  enumerable: true,
  get: function () {
    return _annotation_layer_builder.DefaultAnnotationLayerFactory;
  }
});
Object.defineProperty(exports, "DefaultTextLayerFactory", {
  enumerable: true,
  get: function () {
    return _text_layer_builder.DefaultTextLayerFactory;
  }
});
Object.defineProperty(exports, "TextLayerBuilder", {
  enumerable: true,
  get: function () {
    return _text_layer_builder.TextLayerBuilder;
  }
});
Object.defineProperty(exports, "EventBus", {
  enumerable: true,
  get: function () {
    return _ui_utils.EventBus;
  }
});
Object.defineProperty(exports, "NullL10n", {
  enumerable: true,
  get: function () {
    return _ui_utils.NullL10n;
  }
});
Object.defineProperty(exports, "ProgressBar", {
  enumerable: true,
  get: function () {
    return _ui_utils.ProgressBar;
  }
});
Object.defineProperty(exports, "PDFLinkService", {
  enumerable: true,
  get: function () {
    return _pdf_link_service.PDFLinkService;
  }
});
Object.defineProperty(exports, "SimpleLinkService", {
  enumerable: true,
  get: function () {
    return _pdf_link_service.SimpleLinkService;
  }
});
Object.defineProperty(exports, "DownloadManager", {
  enumerable: true,
  get: function () {
    return _download_manager.DownloadManager;
  }
});
Object.defineProperty(exports, "GenericL10n", {
  enumerable: true,
  get: function () {
    return _genericl10n.GenericL10n;
  }
});
Object.defineProperty(exports, "PDFFindController", {
  enumerable: true,
  get: function () {
    return _pdf_find_controller.PDFFindController;
  }
});
Object.defineProperty(exports, "PDFHistory", {
  enumerable: true,
  get: function () {
    return _pdf_history.PDFHistory;
  }
});
Object.defineProperty(exports, "PDFPageView", {
  enumerable: true,
  get: function () {
    return _pdf_page_view.PDFPageView;
  }
});
Object.defineProperty(exports, "PDFSinglePageViewer", {
  enumerable: true,
  get: function () {
    return _pdf_single_page_viewer.PDFSinglePageViewer;
  }
});
Object.defineProperty(exports, "PDFViewer", {
  enumerable: true,
  get: function () {
    return _pdf_viewer.PDFViewer;
  }
});

var _annotation_layer_builder = require("./annotation_layer_builder.js");

var _text_layer_builder = require("./text_layer_builder.js");

var _ui_utils = require("./ui_utils.js");

var _pdf_link_service = require("./pdf_link_service.js");

var _download_manager = require("./download_manager.js");

var _genericl10n = require("./genericl10n.js");

var _pdf_find_controller = require("./pdf_find_controller.js");

var _pdf_history = require("./pdf_history.js");

var _pdf_page_view = require("./pdf_page_view.js");

var _pdf_single_page_viewer = require("./pdf_single_page_viewer.js");

var _pdf_viewer = require("./pdf_viewer.js");

const pdfjsVersion = '2.5.32';
const pdfjsBuild = 'b1e3b21b';