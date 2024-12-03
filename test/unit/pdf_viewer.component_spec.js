/* Copyright 2023 Mozilla Foundation
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

import { FindState, PDFFindController } from "../../web/pdf_find_controller.js";
import {
  LinkTarget,
  PDFLinkService,
  SimpleLinkService,
} from "../../web/pdf_link_service.js";
import {
  parseQueryString,
  ProgressBar,
  RenderingStates,
  ScrollMode,
  SpreadMode,
} from "../../web/ui_utils.js";
import { AnnotationLayerBuilder } from "../../web/annotation_layer_builder.js";
import { DownloadManager } from "../../web/download_manager.js";
import { EventBus } from "../../web/event_utils.js";
import { GenericL10n } from "../../web/genericl10n.js";
import { PDFHistory } from "../../web/pdf_history.js";
import { PDFPageView } from "../../web/pdf_page_view.js";
import { PDFScriptingManager } from "../../web/pdf_scripting_manager.component.js";
import { PDFSinglePageViewer } from "../../web/pdf_single_page_viewer.js";
import { PDFViewer } from "../../web/pdf_viewer.js";
import { StructTreeLayerBuilder } from "../../web/struct_tree_layer_builder.js";
import { TextLayerBuilder } from "../../web/text_layer_builder.js";
import { XfaLayerBuilder } from "../../web/xfa_layer_builder.js";

describe("pdfviewer_api", function () {
  it("checks that the *official* PDF.js-viewer API exposes the expected functionality", async function () {
    const pdfviewerAPI = await import("../../web/pdf_viewer.component.js");

    // The imported Object contains an (automatically) inserted Symbol,
    // hence we copy the data to allow using a simple comparison below.
    expect({ ...pdfviewerAPI }).toEqual({
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
    });
  });
});
