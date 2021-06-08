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

import { CFFCompiler, CFFParser } from "./cff_parser.js";
import { SEAC_ANALYSIS_ENABLED, type1FontGlyphMapping } from "./fonts_utils.js";
import { warn } from "../shared/util.js";

class CFFFont {
  constructor(file, properties) {
    this.properties = properties;

    const parser = new CFFParser(file, properties, SEAC_ANALYSIS_ENABLED);
    this.cff = parser.parse();
    this.cff.duplicateFirstGlyph();
    const compiler = new CFFCompiler(this.cff);
    this.seacs = this.cff.seacs;
    try {
      this.data = compiler.compile();
    } catch (e) {
      warn("Failed to compile font " + properties.loadedName);
      // There may have just been an issue with the compiler, set the data
      // anyway and hope the font loaded.
      this.data = file;
    }
    this._createBuiltInEncoding();
  }

  get numGlyphs() {
    return this.cff.charStrings.count;
  }

  getCharset() {
    return this.cff.charset.charset;
  }

  getGlyphMapping() {
    const cff = this.cff;
    const properties = this.properties;
    const charsets = cff.charset.charset;
    let charCodeToGlyphId;
    let glyphId;

    if (properties.composite) {
      charCodeToGlyphId = Object.create(null);
      let charCode;
      if (cff.isCIDFont) {
        // If the font is actually a CID font then we should use the charset
        // to map CIDs to GIDs.
        for (glyphId = 0; glyphId < charsets.length; glyphId++) {
          const cid = charsets[glyphId];
          charCode = properties.cMap.charCodeOf(cid);
          charCodeToGlyphId[charCode] = glyphId;
        }
      } else {
        // If it is NOT actually a CID font then CIDs should be mapped
        // directly to GIDs.
        for (glyphId = 0; glyphId < cff.charStrings.count; glyphId++) {
          charCode = properties.cMap.charCodeOf(glyphId);
          charCodeToGlyphId[charCode] = glyphId;
        }
      }
      return charCodeToGlyphId;
    }

    let encoding = cff.encoding ? cff.encoding.encoding : null;
    if (properties.isInternalFont) {
      encoding = properties.defaultEncoding;
    }
    charCodeToGlyphId = type1FontGlyphMapping(properties, encoding, charsets);
    return charCodeToGlyphId;
  }

  hasGlyphId(id) {
    return this.cff.hasGlyphId(id);
  }

  /**
   * @private
   */
  _createBuiltInEncoding() {
    const { charset, encoding } = this.cff;
    if (!charset || !encoding) {
      return;
    }
    const charsets = charset.charset,
      encodings = encoding.encoding;
    const map = [];

    for (const charCode in encodings) {
      const glyphId = encodings[charCode];
      if (glyphId >= 0) {
        const glyphName = charsets[glyphId];
        if (glyphName) {
          map[charCode] = glyphName;
        }
      }
    }
    if (map.length > 0) {
      this.properties.builtInEncoding = map;
    }
  }
}

export { CFFFont };
