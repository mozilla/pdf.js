/* Copyright 2026 Mozilla Foundation
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

import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";
import { isNodeJS } from "../../src/shared/util.js";
import { TextLayerBuilder } from "../../web/text_layer_builder.js";

describe("TextLayerBuilder", function () {
  let loadingTask, pdfPage;

  beforeAll(async function () {
    if (isNodeJS) {
      return;
    }
    loadingTask = getDocument(buildGetDocumentParams("tracemonkey.pdf"));
    const pdfDocument = await loadingTask.promise;
    pdfPage = await pdfDocument.getPage(1);
  });

  afterAll(async function () {
    await loadingTask?.destroy();
    loadingTask = pdfPage = null;
  });

  beforeEach(function () {
    if (isNodeJS) {
      pending("Document is not supported in Node.js.");
    }
  });

  async function renderTextLayer(abortSignal) {
    const builder = new TextLayerBuilder({ pdfPage, abortSignal });
    document.body.append(builder.div);
    await builder.render({ viewport: pdfPage.getViewport({ scale: 1 }) });
    return builder;
  }

  function destroyTextLayers(...builders) {
    for (const builder of builders) {
      builder.cancel();
      builder.div.remove();
    }
  }

  function checkSelectingClassIsReset({ div }) {
    div.dispatchEvent(new MouseEvent("mousedown"));
    expect(div.classList.contains("selecting")).toEqual(true);

    document.dispatchEvent(new PointerEvent("pointerup"));
    expect(div.classList.contains("selecting")).toEqual(false);
  }

  it("keeps the selection listeners when another viewer is aborted (issue 22129)", async function () {
    const acA = new AbortController();
    const acB = new AbortController();
    const builderA = await renderTextLayer(acA.signal);
    const builderB = await renderTextLayer(acB.signal);

    acA.abort();
    checkSelectingClassIsReset(builderB);

    acB.abort();
    destroyTextLayers(builderA, builderB);
  });

  it("adds the selection listeners again for a new viewer once the previous one is aborted", async function () {
    const acA = new AbortController();
    const builderA = await renderTextLayer(acA.signal);
    // Abort the viewer without cancelling its text layer first.
    acA.abort();

    const acB = new AbortController();
    const builderB = await renderTextLayer(acB.signal);
    checkSelectingClassIsReset(builderB);

    acB.abort();
    destroyTextLayers(builderA, builderB);
  });
});
