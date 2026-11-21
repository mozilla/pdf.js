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

import { bytesToString, shadow } from "../../src/shared/util.js";
import { FontRendererFactory } from "../../src/core/font_renderer.js";

class FontTestData {
  #data;

  constructor(data) {
    this.#data = data;
    const view = (this.view = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength
    ));
    this.tables = new Map();
    for (let i = 0, ii = view.getUint16(4); i < ii; i++) {
      const offset = 12 + 16 * i;
      const tag = bytesToString(data.subarray(offset, offset + 4));
      this.tables.set(tag, {
        offset: view.getUint32(offset + 8),
        length: view.getUint32(offset + 12),
      });
    }
  }

  get renderer() {
    return shadow(
      this,
      "renderer",
      FontRendererFactory.create({ data: this.#data })
    );
  }

  get unitsPerEm() {
    return this.view.getUint16(this.tables.get("head").offset + 18);
  }

  getGlyphId(codePoint) {
    const range = this.renderer.cmap.find(
      ({ start, end }) => codePoint >= start && codePoint <= end
    );
    return (
      ((range.ids?.[codePoint - range.start] ?? codePoint) + range.idDelta) &
      0xffff
    );
  }

  getAdvance(codePoint) {
    // Glyphs past the last long horizontal metric share its advance.
    const count = this.view.getUint16(this.tables.get("hhea").offset + 34);
    const index = Math.min(this.getGlyphId(codePoint), count - 1);
    const offset = this.tables.get("hmtx").offset + 4 * index;
    return (this.view.getUint16(offset) * 1000) / this.unitsPerEm;
  }

  getKerningPairs() {
    const gpos = this.tables.get("GPOS");
    if (gpos) {
      const { view, unitsPerEm } = this;
      const lookupList = gpos.offset + view.getUint16(gpos.offset + 8);
      const lookup = lookupList + view.getUint16(lookupList + 2);
      const pairPos = lookup + view.getUint16(lookup + 6);
      const coverage = pairPos + view.getUint16(pairPos + 2);
      const count = view.getUint16(pairPos + 8);
      const pairs = [];
      for (let i = 0; i < count; i++) {
        const left = view.getUint16(coverage + 4 + 2 * i);
        const pairSet = pairPos + view.getUint16(pairPos + 10 + 2 * i);
        const end = pairSet + 2 + 4 * view.getUint16(pairSet);
        for (let offset = pairSet + 2; offset < end; offset += 4) {
          pairs.push([
            left,
            view.getUint16(offset),
            (view.getInt16(offset + 2) * 1000) / unitsPerEm,
          ]);
        }
      }
      return pairs;
    }
    const table = this.tables.get("kern");
    if (!table) {
      return [];
    }
    const { view, unitsPerEm } = this;
    const count = view.getUint16(table.offset + 10);
    const pairs = [];
    for (let i = 0, offset = table.offset + 18; i < count; i++, offset += 6) {
      pairs.push([
        view.getUint16(offset),
        view.getUint16(offset + 2),
        (view.getInt16(offset + 4) * 1000) / unitsPerEm,
      ]);
    }
    return pairs;
  }

  expectKerningPairs(pairs) {
    expect(
      this.getKerningPairs().map(([left, right, advance]) => [
        left,
        right,
        Math.round(advance),
      ])
    ).toEqual(
      pairs.map(([left, right, advance]) => [
        this.getGlyphId(left.codePointAt(0)),
        this.getGlyphId(right.codePointAt(0)),
        advance,
      ])
    );
  }
}

export { FontTestData };
