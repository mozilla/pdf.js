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

import { makeSet } from "../shared/util.js";

const ARG_1_AND_2_ARE_WORDS = 1 << 0;
// const ARGS_ARE_XY_VALUES = 1 << 1;
// const ROUND_XY_TO_GRID = 1 << 2;
const WE_HAVE_A_SCALE = 1 << 3;
const MORE_COMPONENTS = 1 << 5;
const WE_HAVE_AN_X_AND_Y_SCALE = 1 << 6;
const WE_HAVE_A_TWO_BY_TWO = 1 << 7;
const WE_HAVE_INSTRUCTIONS = 1 << 8;
// const USE_MY_METRICS = 1 << 9;
// const OVERLAP_COMPOUND = 1 << 10;
// const SCALED_COMPONENT_OFFSET = 1 << 11;
// const UNSCALED_COMPONENT_OFFSET = 1 << 12;

const GLYPH_HEADER_SIZE = 10;

function pruneCompositeGlyphCycles(glyfTable, locaEntries, numGlyphs) {
  const glyf = new DataView(
    glyfTable.buffer,
    glyfTable.byteOffset,
    glyfTable.byteLength
  );
  const components = new Array(numGlyphs);
  for (let i = 0; i < numGlyphs; i++) {
    const offset = locaEntries[i].offset;
    const endOffset = Math.min(locaEntries[i].endOffset, glyf.byteLength);
    if (endOffset - offset <= GLYPH_HEADER_SIZE || glyf.getInt16(offset) >= 0) {
      continue;
    }
    const comps = [];
    let p = offset + GLYPH_HEADER_SIZE;
    while (p + 4 <= endOffset) {
      const flags = glyf.getUint16(p);
      const gid = glyf.getUint16(p + 2);
      let size = 4 + (flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2);
      if (flags & WE_HAVE_A_SCALE) {
        size += 2;
      } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
        size += 4;
      } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
        size += 8;
      }
      comps.push({ gid, offset: p, size, flags });
      p += size;
      if (!(flags & MORE_COMPONENTS)) {
        break;
      }
    }
    if (comps.length) {
      components[i] = comps;
    }
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const state = new Uint8Array(numGlyphs);
  const backEdges = new Map();
  for (let start = 0; start < numGlyphs; start++) {
    if (state[start] !== WHITE || !components[start]) {
      continue;
    }
    const stack = [{ node: start, idx: 0 }];
    state[start] = GRAY;
    while (stack.length > 0) {
      const top = stack.at(-1);
      const comps = components[top.node];
      if (!comps || top.idx >= comps.length) {
        state[top.node] = BLACK;
        stack.pop();
        continue;
      }
      const compIdx = top.idx++;
      const next = comps[compIdx].gid;
      if (next >= numGlyphs || state[next] === BLACK) {
        continue;
      }
      if (state[next] === WHITE) {
        state[next] = GRAY;
        stack.push({ node: next, idx: 0 });
        continue;
      }
      backEdges.getOrInsertComputed(top.node, makeSet).add(compIdx);
    }
  }

  const droppedGlyphs = new Set();
  for (const [gIdx, removeSet] of backEdges) {
    const comps = components[gIdx];
    const remaining = [];
    for (let ci = 0; ci < comps.length; ci++) {
      if (!removeSet.has(ci)) {
        remaining.push(comps[ci]);
      }
    }
    if (remaining.length === 0) {
      droppedGlyphs.add(gIdx);
      continue;
    }
    const start = locaEntries[gIdx].offset;
    const endOffset = Math.min(locaEntries[gIdx].endOffset, glyf.byteLength);
    let writePos = start + GLYPH_HEADER_SIZE;
    for (let ci = 0; ci < remaining.length; ci++) {
      const c = remaining[ci];
      const isLast = ci === remaining.length - 1;
      let newFlags = c.flags & ~WE_HAVE_INSTRUCTIONS;
      newFlags = isLast
        ? newFlags & ~MORE_COMPONENTS
        : newFlags | MORE_COMPONENTS;
      if (writePos !== c.offset) {
        glyfTable.copyWithin(writePos, c.offset, c.offset + c.size);
      }
      glyf.setUint16(writePos, newFlags);
      writePos += c.size;
    }
    if (writePos < endOffset) {
      glyfTable.fill(0, writePos, endOffset);
    }
  }
  return droppedGlyphs;
}

export { pruneCompositeGlyphCycles };
