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

import {
  AbortException,
  AnnotationEditorParamsType,
  AnnotationEditorType,
  AnnotationMode,
  CMapCompressionType,
  createValidAbsoluteUrl,
  FeatureTest,
  ImageKind,
  InvalidPDFException,
  MissingPDFException,
  normalizeUnicode,
  OPS,
  PasswordResponses,
  PermissionFlag,
  PromiseCapability,
  shadow,
  UnexpectedResponseException,
  Util,
  VerbosityLevel,
} from "../../src/shared/util.js";
import {
  build,
  getDocument,
  PDFDataRangeTransport,
  PDFWorker,
  SVGGraphics,
  version,
} from "../../src/display/api.js";
import {
  getFilenameFromUrl,
  getPdfFilenameFromUrl,
  getXfaPageViewport,
  isDataScheme,
  isPdfFile,
  loadScript,
  PDFDateString,
  PixelsPerInch,
  RenderingCancelledException,
  setLayerDimensions,
} from "../../src/display/display_utils.js";
import {
  renderTextLayer,
  updateTextLayer,
} from "../../src/display/text_layer.js";
import { AnnotationEditorLayer } from "../../src/display/editor/annotation_editor_layer.js";
import { AnnotationEditorUIManager } from "../../src/display/editor/tools.js";
import { AnnotationLayer } from "../../src/display/annotation_layer.js";
import { GlobalWorkerOptions } from "../../src/display/worker_options.js";
import { XfaLayer } from "../../src/display/xfa_layer.js";

describe("pdfjs_api", function () {
  it("checks that the *official* PDF.js API exposes the expected functionality", async function () {
    // eslint-disable-next-line no-unsanitized/method
    const pdfjsAPI = await import(
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("LIB")
        ? "../../pdf.js"
        : "../../src/pdf.js"
    );

    // The imported Object contains an (automatically) inserted Symbol,
    // hence we copy the data to allow using a simple comparison below.
    expect({ ...pdfjsAPI }).toEqual({
      AbortException,
      AnnotationEditorLayer,
      AnnotationEditorParamsType,
      AnnotationEditorType,
      AnnotationEditorUIManager,
      AnnotationLayer,
      AnnotationMode,
      build,
      CMapCompressionType,
      createValidAbsoluteUrl,
      FeatureTest,
      getDocument,
      getFilenameFromUrl,
      getPdfFilenameFromUrl,
      getXfaPageViewport,
      GlobalWorkerOptions,
      ImageKind,
      InvalidPDFException,
      isDataScheme,
      isPdfFile,
      loadScript,
      MissingPDFException,
      normalizeUnicode,
      OPS,
      PasswordResponses,
      PDFDataRangeTransport,
      PDFDateString,
      PDFWorker,
      PermissionFlag,
      PixelsPerInch,
      PromiseCapability,
      RenderingCancelledException,
      renderTextLayer,
      setLayerDimensions,
      shadow,
      SVGGraphics,
      UnexpectedResponseException,
      updateTextLayer,
      Util,
      VerbosityLevel,
      version,
      XfaLayer,
    });
  });
});
