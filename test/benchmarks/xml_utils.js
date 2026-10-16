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

import {
  captureCalls,
  captureMethodCalls,
  processPdf,
} from "./capture_utils.js";
import { $toPages } from "../../src/core/xfa/symbol_utils.js";
import { SimpleXMLParser } from "../../src/core/xml_parser.js";
import { XFAFactory } from "../../src/core/xfa/factory.js";
import { XFAParser } from "../../src/core/xfa/parser.js";

class XfaInput {
  constructor(xdp, resources) {
    this.xdp = xdp;
    this.data = new Map([["xdp:xdp", xdp]]);
    this.resources = resources;
  }

  /**
   * @param {XFAFactory} factory
   * @returns {object} Pages laid out using the captured fonts and images.
   */
  layout(factory) {
    for (const [name, args] of this.resources) {
      factory[name](...args);
    }
    const iterator = factory.form[$toPages]();
    let result;
    do {
      result = iterator.next();
    } while (!result.done);
    return result.value;
  }
}

/**
 * @param {string} filename
 * @returns {Promise<XfaInput>} XDP data and captured font and image resources.
 */
async function captureXfaDocument(filename) {
  // Keep a single list, since the resources must be replayed in call order.
  const resources = [];
  const recordResource = name => ({
    target: XFAFactory.prototype,
    name,
    snapshot: (factory, args) => {
      resources.push([name, args]);
    },
    before: true,
  });
  const [xdps] = await captureMethodCalls(
    () => processPdf(filename, { pages: [], enableXfa: true }),
    [
      {
        target: XFAParser.prototype,
        name: "parse",
        snapshot: (parser, [data]) => (parser._richText ? undefined : data),
        before: true,
      },
      recordResource("setFonts"),
      recordResource("appendFonts"),
      recordResource("setImages"),
    ]
  );
  if (xdps.length === 0) {
    throw new Error(`No XFA data in "${filename}".`);
  }
  const input = new XfaInput(xdps[0], resources);
  if (!input.layout(new XFAFactory(input.data))?.children.length) {
    throw new Error(`XFA document "${filename}" can't be laid out.`);
  }
  return input;
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<string>>} Annotation rich text strings.
 */
async function captureRichTexts(filename, options) {
  const richTexts = await captureCalls(
    XFAFactory,
    "getRichTextAsHtml",
    () => processPdf(filename, { ...options, operatorList: true }),
    (target, [rc]) => (typeof rc === "string" ? rc : undefined),
    { before: true }
  );
  if (richTexts.length === 0) {
    throw new Error(`No rich text in "${filename}".`);
  }
  return richTexts;
}

/**
 * @param {string} filename
 * @returns {Promise<Array<string>>} XMP strings passed to the XML parser.
 */
async function captureMetadata(filename) {
  const metadata = await captureCalls(
    SimpleXMLParser.prototype,
    "parseFromString",
    () => processPdf(filename, { pages: [], metadata: true }),
    (parser, [data]) => (parser._lowerCaseName ? data : undefined),
    { before: true }
  );
  if (metadata.length === 0) {
    throw new Error(`No XMP metadata in "${filename}".`);
  }
  return metadata;
}

export { captureMetadata, captureRichTexts, captureXfaDocument };
