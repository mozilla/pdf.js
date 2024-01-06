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
import { DefaultCanvasFactory, getDocument } from "../../src/display/api.js";
import { buildGetDocumentParams } from "./test_utils.js";
import { GlobalWorkerOptions } from "../../src/display/worker_options.js";

async function renderAndReturnImagedata() {
  const traceMonkeyGetDocumentParams =
    buildGetDocumentParams("tracemonkey.pdf");
  GlobalWorkerOptions.workerSrc = "./../../src/pdf.worker.js";
  const CanvasFactory = new DefaultCanvasFactory();
  const loadingTask = getDocument(traceMonkeyGetDocumentParams);
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
  const renderTask = page.render({
    canvasContext: canvasAndCtx.context,
    viewport,
  });
  await renderTask.promise;
  const imageData = canvasAndCtx.context.getImageData(
    0,
    0,
    viewport.width,
    viewport.height
  );

  CanvasFactory.destroy(canvasAndCtx);
  await loadingTask.destroy();
  return imageData;
}

export { renderAndReturnImagedata };
