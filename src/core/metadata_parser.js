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

import { SimpleXMLParser } from "./xml_parser.js";

class MetadataParser {
  constructor(data) {
    // Ghostscript may produce invalid metadata, so try to repair that first.
    data = this._repair(data);

    // Convert the string to an XML document.
    const parser = new SimpleXMLParser({ lowerCaseName: true });
    const xmlDocument = parser.parseFromString(data);

    this._metadataMap = new Map();
    this._data = data;

    if (xmlDocument) {
      this._parse(xmlDocument);
    }
  }

  _repair(data) {
    // Start by removing any "junk" before the first tag (see issue 10395).
    return data
      .replace(/^[^<]+/, "")
      .replaceAll(/>\\376\\377([^<]+)/g, function (all, codes) {
        const bytes = codes
          .replaceAll(/\\([0-3])([0-7])([0-7])/g, function (code, d1, d2, d3) {
            return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
          })
          .replaceAll(/&(amp|apos|gt|lt|quot);/g, function (str, name) {
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

        const charBuf = [">"];
        for (let i = 0, ii = bytes.length; i < ii; i += 2) {
          const code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);
          if (
            code >= /* Space = */ 32 &&
            code < /* Delete = */ 127 &&
            code !== /* '<' = */ 60 &&
            code !== /* '>' = */ 62 &&
            code !== /* '&' = */ 38
          ) {
            charBuf.push(String.fromCharCode(code));
          } else {
            charBuf.push(
              "&#x" + (0x10000 + code).toString(16).substring(1) + ";"
            );
          }
        }
        return charBuf.join("");
      });
  }

  _getSequence(entry) {
    const name = entry.nodeName;
    if (name !== "rdf:bag" && name !== "rdf:seq" && name !== "rdf:alt") {
      return null;
    }
    return entry.childNodes.filter(node => node.nodeName === "rdf:li");
  }

  _parseArray(entry) {
    if (!entry.hasChildNodes()) {
      return;
    }
    // Child must be a Bag (unordered array) or a Seq.
    const [seqNode] = entry.childNodes;
    const sequence = this._getSequence(seqNode) || [];

    this._metadataMap.set(
      entry.nodeName,
      sequence.map(node => node.textContent.trim())
    );
  }

  _parse(xmlDocument) {
    let rdf = xmlDocument.documentElement;

    if (rdf.nodeName !== "rdf:rdf") {
      // Wrapped in <xmpmeta>
      rdf = rdf.firstChild;
      while (rdf && rdf.nodeName !== "rdf:rdf") {
        rdf = rdf.nextSibling;
      }
    }

    if (!rdf || rdf.nodeName !== "rdf:rdf" || !rdf.hasChildNodes()) {
      return;
    }

    for (const desc of rdf.childNodes) {
      if (desc.nodeName !== "rdf:description") {
        continue;
      }

      for (const entry of desc.childNodes) {
        const name = entry.nodeName;
        switch (name) {
          case "#text":
            continue;
          case "dc:creator":
          case "dc:subject":
            this._parseArray(entry);
            continue;
        }
        this._metadataMap.set(name, entry.textContent.trim());
      }
    }
  }

  get serializable() {
    return {
      parsedData: this._metadataMap,
      rawData: this._data,
    };
  }
}

export { MetadataParser };
