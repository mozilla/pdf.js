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

import { getDocument, PDFPageProxy } from "../../src/display/api.js";
import { buildGetDocumentParams } from "./test_utils.js";
import { PixelsPerInch } from "../../src/display/display_utils.js";

describe("dependencies tracking", function () {
  let dependencies;

  beforeAll(() => {
    globalThis.StepperManager = {
      enabled: true,
      create: () => ({
        init() {},
        updateOperatorList() {},
        getNextBreakPoint: () => null,
        nextBreakPoint: null,
        shouldSkip: () => false,
        setOperatorBBoxes(_bboxes, deps) {
          dependencies = deps;
        },
      }),
    };
  });

  afterEach(() => {
    dependencies = null;
  });

  afterAll(() => {
    delete globalThis.StepperManager;
  });

  it("pattern fill", async () => {
    const loadingTask = getDocument(
      buildGetDocumentParams("22060_A1_01_Plans.pdf")
    );
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    expect(page).toBeInstanceOf(PDFPageProxy);
    page._pdfBug = true;

    const viewport = page.getViewport({
      scale: PixelsPerInch.PDF_TO_CSS_UNITS,
    });

    const { canvas } = pdfDocument.canvasFactory.create(
      viewport.width,
      viewport.height
    );

    const renderTask = page.render({
      canvas,
      viewport,
      recordOperations: true,
    });
    await renderTask.promise;

    expect(dependencies.get(14)).toEqual({
      dependencies: new Set([0, 1, 2, 6, 7, 8, 12, 13]),
      isRenderingOperation: true,
    });

    await loadingTask.destroy();
  });
});
