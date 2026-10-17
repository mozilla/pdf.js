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
import {
  captureMetadata,
  captureRichTexts,
  captureXfaDocument,
} from "./xml_utils.js";
import { MetadataParser } from "../../src/core/metadata_parser.js";
import { XFAFactory } from "../../src/core/xfa/factory.js";

const METADATA = await captureMetadata("issue11144_reduced.pdf");
const RICH_TEXTS = await captureRichTexts("issue13447.pdf");
const XFA_FORM = await captureXfaDocument("xfa_issue14315.pdf");
const XFA_DOCUMENTS = [
  { filename: "xfa_issue14315.pdf", input: XFA_FORM },
  {
    filename: "issue14130.pdf",
    input: await captureXfaDocument("issue14130.pdf"),
  },
];

describe("xml", () => {
  bench("MetadataParser: XMP (issue11144_reduced.pdf)", () =>
    METADATA.map(data => new MetadataParser(data).serializable)
  );

  bench("XFAFactory.getRichTextAsHtml (issue13447.pdf)", () =>
    RICH_TEXTS.map(rc => XFAFactory.getRichTextAsHtml(rc))
  );

  for (const { filename, input } of XFA_DOCUMENTS) {
    bench(
      `XFAFactory: parse and bind (${filename})`,
      () => new XFAFactory(input.data)
    );
  }

  bench("XFAFactory: parse, bind and layout (xfa_issue14315.pdf)", () =>
    XFA_FORM.layout(new XFAFactory(XFA_FORM.data))
  );
});
