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

import { FormatError, makeSet, Util } from "../shared/util.js";

const ON_CURVE_POINT = 1 << 0;
const X_SHORT_VECTOR = 1 << 1;
const Y_SHORT_VECTOR = 1 << 2;
const REPEAT_FLAG = 1 << 3;
const X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR = 1 << 4;
const Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR = 1 << 5;

const ARG_1_AND_2_ARE_WORDS = 1 << 0;
const ARGS_ARE_XY_VALUES = 1 << 1;
// const ROUND_XY_TO_GRID = 1 << 2;
const WE_HAVE_A_SCALE = 1 << 3;
const MORE_COMPONENTS = 1 << 5;
const WE_HAVE_AN_X_AND_Y_SCALE = 1 << 6;
const WE_HAVE_A_TWO_BY_TWO = 1 << 7;
const WE_HAVE_INSTRUCTIONS = 1 << 8;
// const USE_MY_METRICS = 1 << 9;
// const OVERLAP_COMPOUND = 1 << 10;
const SCALED_COMPONENT_OFFSET = 1 << 11;
// const UNSCALED_COMPONENT_OFFSET = 1 << 12;

const GLYPH_HEADER_SIZE = 10;

function getFloat214(glyf, pos) {
  return glyf.getInt16(pos) / 16384;
}

function parseGlyph(code) {
  const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
  return Glyph.parse(0, view);
}

/**
 * GlyfTable object parses the glyphs of a glyf table, and places the
 * components of the composite ones.
 *
 * A full description of glyf table can be found here
 * https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
 */
class GlyfTable {
  // Nested composite glyphs would be resolved again for each of their parents.
  #components = new Map();

  #points = new Map();

  /**
   * @param {Array<Uint8Array>} glyphs - The data of each glyph.
   */
  constructor(glyphs) {
    this.glyphs = glyphs;
  }

  /**
   * @returns {object} The `contours` of a simple glyph, or the `components`
   *   of a composite one with the transforms placing them.
   */
  getGlyph(code, visitedGlyphs) {
    const components = this.#components.get(code);
    if (components) {
      return { contours: null, components };
    }
    const { simple, composites } = parseGlyph(code);
    if (simple) {
      return { contours: simple.contours, components: null };
    }
    return {
      contours: null,
      components: this.#getComponents(code, composites, visitedGlyphs),
    };
  }

  #getComponents(code, composites, visitedGlyphs) {
    let components = this.#components.get(code);
    if (components) {
      return components;
    }
    components = [];
    for (const { glyphIndex, transform, matchedPoints } of composites) {
      const glyph = this.glyphs[glyphIndex];
      if (matchedPoints) {
        // Match the point `arg2` of the component with the point `arg1` of the
        // previous components.
        const [arg1, arg2] = matchedPoints;
        const points = this.#getComponentsPoints(components, visitedGlyphs);
        const componentPoints = this.#getPoints(glyph, visitedGlyphs);
        if (2 * arg1 >= points.length || 2 * arg2 >= componentPoints.length) {
          throw new FormatError("Invalid composite glyph point.");
        }
        const point = componentPoints.slice(2 * arg2, 2 * arg2 + 2);
        Util.applyTransform(point, transform);
        transform[4] = points[2 * arg1] - point[0];
        transform[5] = points[2 * arg1 + 1] - point[1];
      }
      components.push({ glyph, transform });
    }
    this.#components.set(code, components);
    return components;
  }

  /**
   * @returns {Array<number>} The `[x0, y0, x1, y1, ...]` points of a glyph, in
   *   the order used to position the components of a composite glyph. They
   *   must not be modified.
   */
  #getPoints(code, visitedGlyphs) {
    if (!code?.length || visitedGlyphs.has(code)) {
      return [];
    }
    let points = this.#points.get(code);
    if (points) {
      return points;
    }
    const { simple, composites } = parseGlyph(code);
    if (simple) {
      points = [];
      for (const { xCoordinates, yCoordinates } of simple.contours) {
        for (let i = 0, ii = xCoordinates.length; i < ii; i++) {
          points.push(xCoordinates[i], yCoordinates[i]);
        }
      }
    } else {
      visitedGlyphs.add(code);
      points = this.#getComponentsPoints(
        this.#getComponents(code, composites, visitedGlyphs),
        visitedGlyphs
      );
      visitedGlyphs.delete(code);
    }
    this.#points.set(code, points);
    return points;
  }

  #getComponentsPoints(components, visitedGlyphs) {
    const points = [];
    for (const { glyph, transform } of components) {
      const componentPoints = this.#getPoints(glyph, visitedGlyphs);
      for (let i = 0, ii = componentPoints.length; i < ii; i += 2) {
        points.push(
          componentPoints[i] * transform[0] +
            componentPoints[i + 1] * transform[2] +
            transform[4],
          componentPoints[i] * transform[1] +
            componentPoints[i + 1] * transform[3] +
            transform[5]
        );
      }
    }
    return points;
  }
}

/**
 * Glyph object represents a glyph of a glyf table: its contours, or its
 * components if it's a composite.
 */
class Glyph {
  constructor({ simple = null, composites = null }) {
    this.simple = simple;
    this.composites = composites;
  }

  static parse(pos, glyf) {
    const numberOfContours = glyf.getInt16(pos);
    pos += GLYPH_HEADER_SIZE;

    if (numberOfContours < 0) {
      // Composite glyph.
      const composites = [];
      while (true) {
        const [n, composite] = CompositeGlyph.parse(pos, glyf);
        pos += n;
        composites.push(composite);
        if (!(composite.flags & MORE_COMPONENTS)) {
          break;
        }
      }

      return new Glyph({ composites });
    }

    const simple = SimpleGlyph.parse(pos, glyf, numberOfContours);

    return new Glyph({ simple });
  }
}

class Contour {
  constructor({ flags, xCoordinates, yCoordinates }) {
    this.xCoordinates = xCoordinates;
    this.yCoordinates = yCoordinates;
    this.flags = flags;
  }
}

class SimpleGlyph {
  constructor({ contours }) {
    this.contours = contours;
  }

  static parse(pos, glyf, numberOfContours) {
    const endPtsOfContours = [];
    for (let i = 0; i < numberOfContours; i++) {
      const endPt = glyf.getUint16(pos);
      pos += 2;
      endPtsOfContours.push(endPt);
    }
    const numberOfPt = endPtsOfContours[numberOfContours - 1] + 1;
    const instructionLength = glyf.getUint16(pos);
    pos += 2 + instructionLength;

    const flags = [];
    for (let i = 0; i < numberOfPt; pos++, i++) {
      let flag = glyf.getUint8(pos);
      flags.push(flag);
      if (flag & REPEAT_FLAG) {
        const count = glyf.getUint8(++pos);
        flag ^= REPEAT_FLAG;
        for (let m = 0; m < count; m++) {
          flags.push(flag);
        }
        i += count;
      }
    }

    const allXCoordinates = [];
    let xCoordinates = [];
    let yCoordinates = [];
    let pointFlags = [];
    const contours = [];
    let endPtsOfContoursIndex = 0;
    let lastCoordinate = 0;

    // Get x coordinates.
    for (let i = 0; i < numberOfPt; i++) {
      const flag = flags[i];
      if (flag & X_SHORT_VECTOR) {
        // 8-bits unsigned value.
        const x = glyf.getUint8(pos++);
        lastCoordinate += flag & X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR ? x : -x;
        xCoordinates.push(lastCoordinate);
      } else if (flag & X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR) {
        // IS_SAME.
        xCoordinates.push(lastCoordinate);
      } else {
        lastCoordinate += glyf.getInt16(pos);
        pos += 2;
        xCoordinates.push(lastCoordinate);
      }

      if (endPtsOfContours[endPtsOfContoursIndex] === i) {
        // Next entry is the first one of a new contour.
        endPtsOfContoursIndex++;
        allXCoordinates.push(xCoordinates);
        xCoordinates = [];
      }
    }

    lastCoordinate = 0;
    endPtsOfContoursIndex = 0;
    for (let i = 0; i < numberOfPt; i++) {
      const flag = flags[i];
      if (flag & Y_SHORT_VECTOR) {
        // 8-bits unsigned value.
        const y = glyf.getUint8(pos++);
        lastCoordinate += flag & Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR ? y : -y;
        yCoordinates.push(lastCoordinate);
      } else if (flag & Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR) {
        // IS_SAME.
        yCoordinates.push(lastCoordinate);
      } else {
        lastCoordinate += glyf.getInt16(pos);
        pos += 2;
        yCoordinates.push(lastCoordinate);
      }

      pointFlags.push(flag & ON_CURVE_POINT);

      if (endPtsOfContours[endPtsOfContoursIndex] === i) {
        // Next entry is the first one of a new contour.
        xCoordinates = allXCoordinates[endPtsOfContoursIndex];
        endPtsOfContoursIndex++;
        contours.push(
          new Contour({
            flags: pointFlags,
            xCoordinates,
            yCoordinates,
          })
        );
        yCoordinates = [];
        pointFlags = [];
      }
    }

    return new SimpleGlyph({ contours });
  }
}

class CompositeGlyph {
  constructor({ flags, glyphIndex, transform, matchedPoints }) {
    this.flags = flags;
    this.glyphIndex = glyphIndex;
    this.transform = transform;
    // The point of the previous components and the one of this component
    // to put on it, when the offset isn't given.
    this.matchedPoints = matchedPoints;
  }

  static parse(pos, glyf) {
    const spos = pos;
    const flags = glyf.getUint16(pos);
    const glyphIndex = glyf.getUint16(pos + 2);
    pos += 4;

    let argument1, argument2;
    if (flags & ARG_1_AND_2_ARE_WORDS) {
      if (flags & ARGS_ARE_XY_VALUES) {
        argument1 = glyf.getInt16(pos);
        argument2 = glyf.getInt16(pos + 2);
      } else {
        argument1 = glyf.getUint16(pos);
        argument2 = glyf.getUint16(pos + 2);
      }
      pos += 4;
    } else {
      if (flags & ARGS_ARE_XY_VALUES) {
        argument1 = glyf.getInt8(pos);
        argument2 = glyf.getInt8(pos + 1);
      } else {
        argument1 = glyf.getUint8(pos);
        argument2 = glyf.getUint8(pos + 1);
      }
      pos += 2;
    }

    const transform = [1, 0, 0, 1, 0, 0];
    if (flags & WE_HAVE_A_SCALE) {
      // Single F2.14.
      transform[0] = transform[3] = getFloat214(glyf, pos);
      pos += 2;
    } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
      // Two F2.14.
      transform[0] = getFloat214(glyf, pos);
      transform[3] = getFloat214(glyf, pos + 2);
      pos += 4;
    } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      // Four F2.14.
      transform[0] = getFloat214(glyf, pos);
      transform[1] = getFloat214(glyf, pos + 2);
      transform[2] = getFloat214(glyf, pos + 4);
      transform[3] = getFloat214(glyf, pos + 6);
      pos += 8;
    }

    let matchedPoints = null;
    if (flags & ARGS_ARE_XY_VALUES) {
      // Like FreeType, only scale the offset when it's explicitly asked.
      const scaleOffset =
        !!(
          flags &
          (WE_HAVE_A_SCALE | WE_HAVE_AN_X_AND_Y_SCALE | WE_HAVE_A_TWO_BY_TWO)
        ) && !!(flags & SCALED_COMPONENT_OFFSET);
      transform[4] = scaleOffset
        ? argument1 * Math.hypot(transform[0], transform[2])
        : argument1;
      transform[5] = scaleOffset
        ? argument2 * Math.hypot(transform[3], transform[1])
        : argument2;
    } else {
      matchedPoints = [argument1, argument2];
    }

    return [
      pos - spos,
      new CompositeGlyph({ flags, glyphIndex, transform, matchedPoints }),
    ];
  }
}

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

export { GlyfTable, pruneCompositeGlyphCycles };
