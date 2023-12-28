/* Copyright 2022 Mozilla Foundation
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
  renderTextLayer,
  TextLayerRenderTask,
} from "../../src/display/text_layer.js";
import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";
import { isNodeJS } from "../../src/shared/util.js";

describe("textLayer", function () {
  it("creates textLayer from ReadableStream", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    const textContentItemsStr = [];

    const textLayerRenderTask = renderTextLayer({
      textContentSource: page.streamTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport({ scale: 1 }),
      textContentItemsStr,
    });
    expect(textLayerRenderTask instanceof TextLayerRenderTask).toEqual(true);

    await textLayerRenderTask.promise;
    expect(textContentItemsStr).toEqual([
      "Table Of Content",
      "",
      "Chapter 1",
      " ",
      "..........................................................",
      " ",
      "2",
      "",
      "Paragraph 1.1",
      " ",
      "......................................................",
      " ",
      "3",
      "",
      "page 1 / 3",
    ]);
  });
});
