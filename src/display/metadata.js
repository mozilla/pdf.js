/* Copyright 2012 Mozilla Foundation
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

import { assert, objectFromEntries } from "../shared/util.js";
import { SimpleXMLParser } from "../shared/xml_parser.js";

class Metadata {
  constructor(data) {
    assert(typeof data === "string", "Metadata: input is not a string");

    // Ghostscript may produce invalid metadata, so try to repair that first.
    data = this._repair(data);

    // Convert the string to an XML document.
    const parser = new SimpleXMLParser();
    const xmlDocument = parser.parseFromString(data);

    this._metadataMap = new Map();

    if (xmlDocument) {
      this._parse(xmlDocument);
    }
  }

  _repair(data) {
    // Start by removing any "junk" before the first tag (see issue 10395).
    return data
      .replace(/^[^<]+/, "")
      .replace(/>\\376\\377([^<]+)/g, function (all, codes) {
        const bytes = codes
          .replace(/\\([0-3])([0-7])([0-7])/g, function (code, d1, d2, d3) {
            return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
          })
          .replace(/&(amp|apos|gt|lt|quot);/g, function (str, name) {
            switch (name) {
              case "amp":
                return "&";
              case "apos":
                return "'";
              case "gt":
                return ">";
              case "lt":
                return "<";
              case "quot":
                return '"';
            }
            throw new Error(`_repair: ${name} isn't defined.`);
          });

        let chars = "";
        for (let i = 0, ii = bytes.length; i < ii; i += 2) {
          const code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);
          if (
            code >= /* Space = */ 32 &&
            code < /* Delete = */ 127 &&
            code !== /* '<' = */ 60 &&
            code !== /* '>' = */ 62 &&
            code !== /* '&' = */ 38
          ) {
            chars += String.fromCharCode(code);
          } else {
            chars += "&#x" + (0x10000 + code).toString(16).substring(1) + ";";
          }
        }

        return ">" + chars;
      });
  }

  _parse(xmlDocument) {
    let rdf = xmlDocument.documentElement;

    if (rdf.nodeName.toLowerCase() !== "rdf:rdf") {
      // Wrapped in <xmpmeta>
      rdf = rdf.firstChild;
      while (rdf && rdf.nodeName.toLowerCase() !== "rdf:rdf") {
        rdf = rdf.nextSibling;
      }
    }

    const nodeName = rdf ? rdf.nodeName.toLowerCase() : null;
    if (!rdf || nodeName !== "rdf:rdf" || !rdf.hasChildNodes()) {
      return;
    }

    const children = rdf.childNodes;
    for (let i = 0, ii = children.length; i < ii; i++) {
      const desc = children[i];
      if (desc.nodeName.toLowerCase() !== "rdf:description") {
        continue;
      }

      for (let j = 0, jj = desc.childNodes.length; j < jj; j++) {
        if (desc.childNodes[j].nodeName.toLowerCase() !== "#text") {
          const entry = desc.childNodes[j];
          const name = entry.nodeName.toLowerCase();

          this._metadataMap.set(name, entry.textContent.trim());
        }
      }
    }
  }

  get(name) {
    return this._metadataMap.has(name) ? this._metadataMap.get(name) : null;
  }

  getAll() {
    return objectFromEntries(this._metadataMap);
  }

  has(name) {
    return this._metadataMap.has(name);
  }
}

export { Metadata };
