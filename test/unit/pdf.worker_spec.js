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

import { WorkerMessageHandler } from "../../src/core/worker.js";

describe("pdfworker_api", function () {
  it("checks that the *official* PDF.js-worker API exposes the expected functionality", async function () {
    // eslint-disable-next-line no-unsanitized/method
    const pdfworkerAPI = await import(
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("LIB")
        ? "../../pdf.worker.js"
        : "../../src/pdf.worker.js"
    );

    // The imported Object contains an (automatically) inserted Symbol,
    // hence we copy the data to allow using a simple comparison below.
    expect({ ...pdfworkerAPI }).toEqual({
      WorkerMessageHandler,
    });
  });
});
