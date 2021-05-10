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

const ON_CURVE_POINT = 1 << 0;
const X_SHORT_VECTOR = 1 << 1;
const Y_SHORT_VECTOR = 1 << 2;
const REPEAT_FLAG = 1 << 3;
const X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR = 1 << 4;
const Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR = 1 << 5;
const OVERLAP_SIMPLE = 1 << 6;

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
// const SCALED_COMPONENT_OFFSET = 1 << 11;
// const UNSCALED_COMPONENT_OFFSET = 1 << 12;

/**
 * GlyfTable object represents a glyf table containing glyph information:
 *  - glyph header (xMin, yMin, xMax, yMax);
 *  - contours if any;
 *  - components if the glyph is a composite.
 *
 * It's possible to re-scale each glyph in order to have a new font which
 * exactly fits an other one: the goal is to be able to build some substitution
 * font for well-known fonts (Myriad, Arial, ...).
 *
 * A full description of glyf table can be found here
 * https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
 */
class GlyfTable {
  constructor({ glyfTable, isGlyphLocationsLong, locaTable, numGlyphs }) {
    this.glyphs = [];
    const loca = new DataView(
      locaTable.buffer,
      locaTable.byteOffset,
      locaTable.byteLength
    );
    const glyf = new DataView(
      glyfTable.buffer,
      glyfTable.byteOffset,
      glyfTable.byteLength
    );
    const offsetSize = isGlyphLocationsLong ? 4 : 2;
    let prev = isGlyphLocationsLong ? loca.getUint32(0) : 2 * loca.getUint16(0);
    let pos = 0;
    for (let i = 0; i < numGlyphs; i++) {
      pos += offsetSize;
      const next = isGlyphLocationsLong
        ? loca.getUint32(pos)
        : 2 * loca.getUint16(pos);
      if (next === prev) {
        this.glyphs.push(new Glyph({}));
        continue;
      }

      const glyph = Glyph.parse(prev, glyf);
      this.glyphs.push(glyph);

      prev = next;
    }
  }

  getSize() {
    return this.glyphs.reduce((a, g) => {
      const size = g.getSize();
      // Round to next multiple of 4 if needed.
      return a + ((size + 3) & ~3);
    }, 0);
  }

  write() {
    const totalSize = this.getSize();
    const glyfTable = new DataView(new ArrayBuffer(totalSize));
    const isLocationLong = totalSize > /* 0xffff * 2 */ 0x1fffe;
    const offsetSize = isLocationLong ? 4 : 2;
    const locaTable = new DataView(
      new ArrayBuffer((this.glyphs.length + 1) * offsetSize)
    );

    if (isLocationLong) {
      locaTable.setUint32(0, 0);
    } else {
      locaTable.setUint16(0, 0);
    }

    let pos = 0;
    let locaIndex = 0;
    for (const glyph of this.glyphs) {
      pos += glyph.write(pos, glyfTable);
      // Round to next multiple of 4 if needed.
      pos = (pos + 3) & ~3;

      locaIndex += offsetSize;
      if (isLocationLong) {
        locaTable.setUint32(locaIndex, pos);
      } else {
        locaTable.setUint16(locaIndex, pos >> 1);
      }
    }

    return {
      isLocationLong,
      loca: new Uint8Array(locaTable.buffer),
      glyf: new Uint8Array(glyfTable.buffer),
    };
  }

  scale(factors) {
    for (let i = 0, ii = this.glyphs.length; i < ii; i++) {
      this.glyphs[i].scale(factors[i]);
    }
  }
}

class Glyph {
  constructor({ header = null, simple = null, composites = null }) {
    this.header = header;
    this.simple = simple;
    this.composites = composites;
  }

  static parse(pos, glyf) {
    const [read, header] = GlyphHeader.parse(pos, glyf);
    pos += read;

    if (header.numberOfContours < 0) {
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

      return new Glyph({ header, composites });
    }

    const simple = SimpleGlyph.parse(pos, glyf, header.numberOfContours);

    return new Glyph({ header, simple });
  }

  getSize() {
    if (!this.header) {
      return 0;
    }
    const size = this.simple
      ? this.simple.getSize()
      : this.composites.reduce((a, c) => a + c.getSize(), 0);
    return this.header.getSize() + size;
  }

  write(pos, buf) {
    if (!this.header) {
      return 0;
    }

    const spos = pos;
    pos += this.header.write(pos, buf);
    if (this.simple) {
      pos += this.simple.write(pos, buf);
    } else {
      for (const composite of this.composites) {
        pos += composite.write(pos, buf);
      }
    }

    return pos - spos;
  }

  scale(factor) {
    if (!this.header) {
      return;
    }

    const xMiddle = (this.header.xMin + this.header.xMax) / 2;
    this.header.scale(xMiddle, factor);
    if (this.simple) {
      this.simple.scale(xMiddle, factor);
    } else {
      for (const composite of this.composites) {
        composite.scale(xMiddle, factor);
      }
    }
  }
}

class GlyphHeader {
  constructor({ numberOfContours, xMin, yMin, xMax, yMax }) {
    this.numberOfContours = numberOfContours;
    this.xMin = xMin;
    this.yMin = yMin;
    this.xMax = xMax;
    this.yMax = yMax;
  }

  static parse(pos, glyf) {
    return [
      10,
      new GlyphHeader({
        numberOfContours: glyf.getInt16(pos),
        xMin: glyf.getInt16(pos + 2),
        yMin: glyf.getInt16(pos + 4),
        xMax: glyf.getInt16(pos + 6),
        yMax: glyf.getInt16(pos + 8),
      }),
    ];
  }

  getSize() {
    return 10;
  }

  write(pos, buf) {
    buf.setInt16(pos, this.numberOfContours);
    buf.setInt16(pos + 2, this.xMin);
    buf.setInt16(pos + 4, this.yMin);
    buf.setInt16(pos + 6, this.xMax);
    buf.setInt16(pos + 8, this.yMax);

    return 10;
  }

  scale(x, factor) {
    this.xMin = Math.round(x + (this.xMin - x) * factor);
    this.xMax = Math.round(x + (this.xMax - x) * factor);
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
  constructor({ contours, instructions }) {
    this.contours = contours;
    this.instructions = instructions;
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
    pos += 2;
    const instructions = new Uint8Array(glyf).slice(
      pos,
      pos + instructionLength
    );
    pos += instructionLength;

    const flags = [];
    for (let i = 0; i < numberOfPt; pos++, i++) {
      let flag = glyf.getUint8(pos);
      flags.push(flag);
      if (flag & REPEAT_FLAG) {
        const count = glyf.getUint8(++pos);
        flag = flag ^ REPEAT_FLAG;
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

      pointFlags.push((flag & ON_CURVE_POINT) | (flag & OVERLAP_SIMPLE));

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

    return new SimpleGlyph({
      contours,
      instructions,
    });
  }

  getSize() {
    let size = this.contours.length * 2 + 2 + this.instructions.length;
    let lastX = 0;
    let lastY = 0;
    for (const contour of this.contours) {
      size += contour.flags.length;
      for (let i = 0, ii = contour.xCoordinates.length; i < ii; i++) {
        const x = contour.xCoordinates[i];
        const y = contour.yCoordinates[i];
        let abs = Math.abs(x - lastX);
        if (abs > 255) {
          size += 2;
        } else if (abs > 0) {
          size += 1;
        }
        lastX = x;

        abs = Math.abs(y - lastY);
        if (abs > 255) {
          size += 2;
        } else if (abs > 0) {
          size += 1;
        }
        lastY = y;
      }
    }
    return size;
  }

  write(pos, buf) {
    const spos = pos;
    const xCoordinates = [];
    const yCoordinates = [];
    const flags = [];
    let lastX = 0;
    let lastY = 0;

    for (const contour of this.contours) {
      for (let i = 0, ii = contour.xCoordinates.length; i < ii; i++) {
        let flag = contour.flags[i];
        const x = contour.xCoordinates[i];
        let delta = x - lastX;
        if (delta === 0) {
          flag = flag | X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR;
          xCoordinates.push(0);
        } else {
          const abs = Math.abs(delta);
          if (abs <= 255) {
            flag =
              flag |
              (delta >= 0
                ? X_SHORT_VECTOR | X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR
                : X_SHORT_VECTOR);
            xCoordinates.push(abs);
          } else {
            xCoordinates.push(delta);
          }
        }
        lastX = x;

        const y = contour.yCoordinates[i];
        delta = y - lastY;
        if (delta === 0) {
          flag = flag | Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR;
          yCoordinates.push(0);
        } else {
          const abs = Math.abs(delta);
          if (abs <= 255) {
            flag =
              flag |
              (delta >= 0
                ? Y_SHORT_VECTOR | Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR
                : Y_SHORT_VECTOR);
            yCoordinates.push(abs);
          } else {
            yCoordinates.push(delta);
          }
        }
        lastY = y;

        flags.push(flag);
      }

      // Write endPtsOfContours entry.
      buf.setUint16(pos, xCoordinates.length - 1);
      pos += 2;
    }

    // Write instructionLength.
    buf.setUint16(pos, this.instructions.length);
    pos += 2;
    if (this.instructions.length) {
      // Write instructions.
      new Uint8Array(buf.buffer, 0, buf.buffer.byteLength).set(
        this.instructions,
        pos
      );
      pos += this.instructions.length;
    }

    // Write flags.
    for (const flag of flags) {
      buf.setUint8(pos++, flag);
    }

    // Write xCoordinates.
    for (let i = 0, ii = xCoordinates.length; i < ii; i++) {
      const x = xCoordinates[i];
      const flag = flags[i];
      if (flag & X_SHORT_VECTOR) {
        buf.setUint8(pos++, x);
      } else if (!(flag & X_IS_SAME_OR_POSITIVE_X_SHORT_VECTOR)) {
        buf.setInt16(pos, x);
        pos += 2;
      }
    }

    // Write yCoordinates.
    for (let i = 0, ii = yCoordinates.length; i < ii; i++) {
      const y = yCoordinates[i];
      const flag = flags[i];
      if (flag & Y_SHORT_VECTOR) {
        buf.setUint8(pos++, y);
      } else if (!(flag & Y_IS_SAME_OR_POSITIVE_Y_SHORT_VECTOR)) {
        buf.setInt16(pos, y);
        pos += 2;
      }
    }

    return pos - spos;
  }

  scale(x, factor) {
    for (const contour of this.contours) {
      if (contour.xCoordinates.length === 0) {
        continue;
      }

      for (let i = 0, ii = contour.xCoordinates.length; i < ii; i++) {
        contour.xCoordinates[i] = Math.round(
          x + (contour.xCoordinates[i] - x) * factor
        );
      }
    }
  }
}

class CompositeGlyph {
  constructor({
    flags,
    glyphIndex,
    argument1,
    argument2,
    transf,
    instructions,
  }) {
    this.flags = flags;
    this.glyphIndex = glyphIndex;
    this.argument1 = argument1;
    this.argument2 = argument2;
    this.transf = transf;
    this.instructions = instructions;
  }

  static parse(pos, glyf) {
    const spos = pos;
    const transf = [];
    let flags = glyf.getUint16(pos);
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
      flags = flags ^ ARG_1_AND_2_ARE_WORDS;
    } else {
      argument1 = glyf.getUint8(pos);
      argument2 = glyf.getUint8(pos + 1);
      if (flags & ARGS_ARE_XY_VALUES) {
        const abs1 = argument1 & 0x7f;
        argument1 = argument1 & 0x80 ? -abs1 : abs1;

        const abs2 = argument2 & 0x7f;
        argument2 = argument2 & 0x80 ? -abs2 : abs2;
      }
      pos += 2;
    }

    if (flags & WE_HAVE_A_SCALE) {
      // Single F2.14.
      transf.push(glyf.getUint16(pos));
      pos += 2;
    } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
      // Two F2.14.
      transf.push(glyf.getUint16(pos), glyf.getUint16(pos + 2));
      pos += 4;
    } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      // Four F2.14.
      transf.push(
        glyf.getUint16(pos),
        glyf.getUint16(pos + 2),
        glyf.getUint16(pos + 4),
        glyf.getUint16(pos + 6)
      );
      pos += 8;
    }

    let instructions = null;
    if (flags & WE_HAVE_INSTRUCTIONS) {
      const instructionLength = glyf.getUint16(pos);
      pos += 2;
      instructions = new Uint8Array(glyf).slice(pos, pos + instructionLength);
      pos += instructionLength;
    }

    return [
      pos - spos,
      new CompositeGlyph({
        flags,
        glyphIndex,
        argument1,
        argument2,
        transf,
        instructions,
      }),
    ];
  }

  getSize() {
    let size = 2 + 2 + this.transf.length * 2;
    if (this.flags & WE_HAVE_INSTRUCTIONS) {
      size += 2 + this.instructions.length;
    }

    size += 2;
    if (this.flags & 2) {
      // Arguments are signed.
      if (
        !(
          this.argument1 >= -128 &&
          this.argument1 <= 127 &&
          this.argument2 >= -128 &&
          this.argument2 <= 127
        )
      ) {
        size += 2;
      }
    } else {
      if (
        !(
          this.argument1 >= 0 &&
          this.argument1 <= 255 &&
          this.argument2 >= 0 &&
          this.argument2 <= 255
        )
      ) {
        size += 2;
      }
    }

    return size;
  }

  write(pos, buf) {
    const spos = pos;

    if (this.flags & ARGS_ARE_XY_VALUES) {
      // Arguments are signed.
      if (
        !(
          this.argument1 >= -128 &&
          this.argument1 <= 127 &&
          this.argument2 >= -128 &&
          this.argument2 <= 127
        )
      ) {
        this.flags = this.flags | ARG_1_AND_2_ARE_WORDS;
      }
    } else {
      if (
        !(
          this.argument1 >= 0 &&
          this.argument1 <= 255 &&
          this.argument2 >= 0 &&
          this.argument2 <= 255
        )
      ) {
        this.flags = this.flags | ARG_1_AND_2_ARE_WORDS;
      }
    }

    buf.setUint16(pos, this.flags);
    buf.setUint16(pos + 2, this.glyphIndex);
    pos += 4;

    if (this.flags & ARG_1_AND_2_ARE_WORDS) {
      if (this.flags & ARGS_ARE_XY_VALUES) {
        buf.setInt16(pos, this.argument1);
        buf.setInt16(pos + 2, this.argument2);
      } else {
        buf.setUint16(pos, this.argument1);
        buf.setUint16(pos + 2, this.argument2);
      }
      pos += 4;
    } else {
      buf.setUint8(pos, this.argument1);
      buf.setUint8(pos + 1, this.argument2);
      pos += 2;
    }

    if (this.flags & WE_HAVE_INSTRUCTIONS) {
      buf.setUint16(pos, this.instructions.length);
      pos += 2;
      // Write instructions.
      if (this.instructions.length) {
        new Uint8Array(buf.buffer, 0, buf.buffer.byteLength).set(
          this.instructions,
          pos
        );
        pos += this.instructions.length;
      }
    }

    return pos - spos;
  }

  scale(x, factor) {}
}

export { GlyfTable };
