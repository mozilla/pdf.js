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

import { FindState, PDFFindController } from "./pdf_find_controller.js";
import {
  LinkTarget,
  PDFLinkService,
  SimpleLinkService,
} from "./pdf_link_service.js";
import {
  parseQueryString,
  ProgressBar,
  RenderingStates,
  ScrollMode,
  SpreadMode,
} from "./ui_utils.js";
import { AnnotationLayerBuilder } from "./annotation_layer_builder.js";
import { DownloadManager } from "./download_manager.js";
import { EventBus } from "./event_utils.js";
import { GenericL10n } from "./genericl10n.js";
import { PDFHistory } from "./pdf_history.js";
import { PDFPageView } from "./pdf_page_view.js";
import { PDFScriptingManager } from "./pdf_scripting_manager.component.js";
import { PDFSinglePageViewer } from "./pdf_single_page_viewer.js";
import { PDFViewer } from "./pdf_viewer.js";
import { StructTreeLayerBuilder } from "./struct_tree_layer_builder.js";
import { TextLayerBuilder } from "./text_layer_builder.js";
import { XfaLayerBuilder } from "./xfa_layer_builder.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : void 0;
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : void 0;

export {
  AnnotationLayerBuilder,
  DownloadManager,
  EventBus,
  FindState,
  GenericL10n,
  LinkTarget,
  parseQueryString,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFPageView,
  PDFScriptingManager,
  PDFSinglePageViewer,
  PDFViewer,
  ProgressBar,
  RenderingStates,
  ScrollMode,
  SimpleLinkService,
  SpreadMode,
  StructTreeLayerBuilder,
  TextLayerBuilder,
  XfaLayerBuilder,
};
