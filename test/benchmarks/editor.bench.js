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

import { bench, describe } from "vitest";
import { createImage } from "../../src/core/editor/pdf_images.js";
import { loadTestImage } from "./editor_utils.js";

const IMAGES = [
  { kind: "stamp", filename: "firefox_logo.png" },
  { kind: "signature", filename: "samplesignature.png" },
];
for (const entry of IMAGES) {
  entry.bitmap = await loadTestImage(entry.filename);
}

describe("editor", () => {
  for (const { kind, filename, bitmap } of IMAGES) {
    bench(`createImage: ${kind} (${filename})`, async () =>
      createImage(bitmap, /* xref = */ null)
    );
  }
});
