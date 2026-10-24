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

import { Autolinker } from "../../web/autolinker.js";
import { benchmark } from "./bench_utils.js";
import { createPageView } from "./autolinker_utils.js";
import { describe } from "vitest";

const PAGES = [
  {
    kind: "2 links in each of 5000 text items",
    pageView: createPageView(
      Array.from(
        { length: 5000 },
        (_, i) => `Contact user${i}@example.org or see https://example.com/${i}`
      )
    ),
  },
  {
    kind: "10 links in each of 1000 text items",
    pageView: createPageView(Array(1000).fill("a@b.c[".repeat(10))),
  },
];

describe("autolinker", () => {
  for (const { kind, pageView } of PAGES) {
    benchmark(`Autolinker.processLinks: ${kind}`, () =>
      Autolinker.processLinks(pageView)
    );
  }
});
