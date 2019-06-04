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

import { assert } from '../shared/util';
import { SimpleXMLParser } from './xml_parser';

class Metadata {
  constructor(data) {
    assert(typeof data === 'string', 'Metadata: input is not a string');

    // Ghostscript may produce invalid metadata, so try to repair that first.
    data = this._repair(data);

    // Convert the string to an XML document.
    let parser = new SimpleXMLParser();
    const xmlDocument = parser.parseFromString(data);

    this._metadata = Object.create(null);

    if (xmlDocument) {
      this._parse(xmlDocument);
    }
  }

  _repair(data) {
    // Start by removing any "junk" before the first tag (see issue 10395).
    return data.replace(/^([^<]+)/, '').replace(/>\\376\\377([^<]+)/g,
        function(all, codes) {
      let bytes = codes.replace(/\\([0-3])([0-7])([0-7])/g,
          function(code, d1, d2, d3) {
        return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
      }).replace(/&(amp|apos|gt|lt|quot);/g, function(str, name) {
        switch (name) {
          case 'amp':
            return '&';
          case 'apos':
            return '\'';
          case 'gt':
            return '>';
          case 'lt':
            return '<';
          case 'quot':
            return '\"';
        }
        throw new Error(`_repair: ${name} isn't defined.`);
      });

      let chars = '';
      for (let i = 0, ii = bytes.length; i < ii; i += 2) {
        let code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);
        if (code >= 32 && code < 127 && code !== 60 && code !== 62 &&
            code !== 38) {
          chars += String.fromCharCode(code);
        } else {
          chars += '&#x' + (0x10000 + code).toString(16).substring(1) + ';';
        }
      }

      return '>' + chars;
    });
  }

  _parse(xmlDocument) {
    let rdf = xmlDocument.documentElement;

    if (rdf.nodeName.toLowerCase() !== 'rdf:rdf') { // Wrapped in <xmpmeta>
      rdf = rdf.firstChild;
      while (rdf && rdf.nodeName.toLowerCase() !== 'rdf:rdf') {
        rdf = rdf.nextSibling;
      }
    }

    let nodeName = rdf ? rdf.nodeName.toLowerCase() : null;
    if (!rdf || nodeName !== 'rdf:rdf' || !rdf.hasChildNodes()) {
      return;
    }

    let children = rdf.childNodes;
    for (let i = 0, ii = children.length; i < ii; i++) {
      let desc = children[i];
      if (desc.nodeName.toLowerCase() !== 'rdf:description') {
        continue;
      }

      for (let j = 0, jj = desc.childNodes.length; j < jj; j++) {
        if (desc.childNodes[j].nodeName.toLowerCase() !== '#text') {
          let entry = desc.childNodes[j];
          let name = entry.nodeName.toLowerCase();

          this._metadata[name] = entry.textContent.trim();
        }
      }
    }
  }

  get(name) {
    const data = this._metadata[name];
    return (typeof data !== 'undefined' ? data : null);
  }

  getAll() {
    return this._metadata;
  }

  has(name) {
    return typeof this._metadata[name] !== 'undefined';
  }
}

export {
  Metadata,
};
