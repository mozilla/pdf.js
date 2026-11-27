/* Copyright 2021 Mozilla Foundation
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

import { $appendChild, $nodeName, $text, $toHTML } from "./symbol_utils.js";
import { assert, warn } from "../../shared/util.js";
import { XFAParserBase } from "./parser_base.js";
import { XhtmlNamespace } from "./xhtml.js";

function getRichTextAsHtml(rc) {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
    assert(rc && typeof rc === "string", "Expected a non-empty string.");
  }

  try {
    let root = new XFAParserBase({
      namespaces: { xhtml: XhtmlNamespace },
      rootNamespace: XhtmlNamespace,
      richText: true,
    }).parse(rc);
    if (!["body", "xhtml"].includes(root[$nodeName])) {
      // No body, so create one.
      const newRoot = XhtmlNamespace.body({});
      newRoot[$appendChild](root);
      root = newRoot;
    }

    const result = root[$toHTML]();
    if (!result.success) {
      return null;
    }

    const { html } = result;
    const { attributes } = html;
    if (attributes) {
      attributes.class &&= attributes.class.filter(
        attr => !attr.startsWith("xfa")
      );
      attributes.dir = "auto";
    }

    return { html, str: root[$text]() };
  } catch (e) {
    warn(`XFA - an error occurred during parsing of rich text: ${e}`);
  }
  return null;
}

export { getRichTextAsHtml };
