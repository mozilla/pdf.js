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

import { BBOX_INIT, makeMap, Util } from "../shared/util.js";
import { createCmapTable, createNameTable, createPostTable } from "./fonts.js";
import { DataBuilder } from "./data_builder.js";
import { OpenTypeFileBuilder } from "./opentype_file_builder.js";

const UNITS_PER_EM = 2048;

// The advances are in 1/1000 em.
const DEFAULT_ASCENT = 0.8;
const DEFAULT_SPACE_ADVANCE = 250;
// The largest advance fitting in the hmtx table.
const MAX_ADVANCE = (0xffff * 1000) / UNITS_PER_EM;
// The browsers give no advance to these characters.
const ZERO_WIDTH_REGEXP = /^[\p{Mn}\p{Default_Ignorable_Code_Point}]+$/u;
// The browser shapes Thai and Lao SARA AM as a mark followed by SARA AA.
const SARA_AM_DECOMPOSITIONS = new Map([
  [0x0e33, [0x0e4d, 0x0e32]],
  [0x0eb3, [0x0ecd, 0x0eb2]],
]);
// For debugging, the glyphs can be their boxes, in font units.
const DEBUG_STROKE_WIDTH = 80;

let nameTable;
let postTable;

function toFontUnits(advance) {
  return Math.round((advance * UNITS_PER_EM) / 1000);
}

function roundFontAdvance(advance) {
  return (toFontUnits(advance) * 1000) / UNITS_PER_EM;
}

function isZeroWidth(text) {
  // No such character is below U+00AD (soft hyphen).
  return text.charCodeAt(0) >= 0xad && ZERO_WIDTH_REGEXP.test(text);
}

/**
 * @param {string} text
 * @param {Map<number, number>} advances
 * @returns {number} The advance of the text shaped by the browser, in 1/1000
 *   em, or NaN if a character is missing.
 */
function getTextAdvance(text, advances) {
  let width = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (!isZeroWidth(char)) {
      width += roundFontAdvance(
        advances.get(SARA_AM_DECOMPOSITIONS.get(codePoint)?.[1] ?? codePoint)
      );
    } else if (!advances.has(codePoint)) {
      return NaN;
    }
  }
  return width;
}

function createStats() {
  return {
    advances: new Map(),
    ligatures: new Map(),
    spaceGaps: [],
  };
}

/**
 * @param {Font} font
 * @returns {number} The fraction of the em above the baseline.
 */
function getAscentRatio(
  { ascent, descent, bbox, glyphBBox, fontMatrix, isType3Font },
  heightScaled = false
) {
  const isValid = ratio => ratio > 0.5 && ratio < 0.95;
  // The descent sometimes has the wrong sign.
  const ratio = ascent / (ascent + Math.abs(descent));
  if (isValid(ratio)) {
    return ratio;
  }
  if (!bbox) {
    return DEFAULT_ASCENT;
  }
  if (isType3Font && fontMatrix && !heightScaled) {
    // The glyph space of Type3 fonts may be flipped, unless the item height
    // already carries that flip. The d1 bounds are more reliable than the
    // FontBBox (bug 1245391).
    const bounds = BBOX_INIT.slice();
    Util.axialAlignedBoundingBox(glyphBBox ?? bbox, fontMatrix, bounds);
    bbox = bounds;
  }
  const [, yMin, , yMax] = bbox;
  const height = yMax - yMin;
  if (!(height > 0 && Number.isFinite(height))) {
    return DEFAULT_ASCENT;
  }
  const bboxRatio = yMax / height;
  // Type 3 glyphs can be arbitrary drawings, with the baseline at either
  // edge of their box. Keep that baseline when it lies within the bounds.
  if (isType3Font && yMin <= 0 && yMax >= 0) {
    return bboxRatio;
  }
  return isValid(bboxRatio) ? bboxRatio : DEFAULT_ASCENT;
}

/**
 * @param {Map} samples - Advance counts by character or ligature.
 * @param {number|string} key
 * @param {number} advance
 */
function addCount(samples, key, advance) {
  const counts = samples.getOrInsertComputed(key, makeMap);
  counts.set(advance, (counts.get(advance) || 0) + 1);
}

/**
 * @param {Map<number, number>} counts - Count by value.
 * @returns {number} The most frequent value.
 */
function getMostFrequent(counts) {
  let best = NaN,
    bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function getAdvances(stats) {
  const advances = new Map();
  for (const [codePoint, counts] of stats.advances) {
    let advance = getMostFrequent(counts);
    if (advance === 0 && counts.size > 1) {
      // A nonzero glyph can be scaled to either width.
      advance = counts.keys().find(width => width > 0) ?? 0;
    }
    advances.set(codePoint, advance);
  }
  // A character only drawn in ligatures gets what the others leave.
  for (const [unicode, counts] of stats.ligatures) {
    let known = 0;
    const missing = [];
    for (const char of unicode) {
      const codePoint = char.codePointAt(0);
      const advance = advances.get(codePoint);
      if (advance === undefined) {
        missing.push(codePoint);
      } else {
        known += advance;
      }
    }
    if (!missing.length) {
      continue;
    }
    const advance =
      Math.max(getMostFrequent(counts) - known, 0) / missing.length;
    for (const codePoint of missing) {
      advances.set(codePoint, advance);
    }
  }
  for (const [codePoint, [mark, base]] of SARA_AM_DECOMPOSITIONS) {
    const advance = advances.get(codePoint);
    if (advance !== undefined) {
      advances.getOrInsert(mark, 0);
      advances.getOrInsert(base, advance);
    }
  }
  // Without a space glyph, e.g. with TeX fonts, a space gets the median gap.
  if (!advances.has(0x20) && stats.spaceGaps.length > 0) {
    const gaps = stats.spaceGaps.sort((a, b) => a - b);
    advances.set(0x20, gaps[gaps.length >> 1]);
  }
  return advances;
}

/**
 * @param {number} width
 * @param {number} yMin
 * @param {number} yMax
 * @returns {Uint8Array|null} A box outline, or null if too narrow.
 */
function createBoxGlyph(width, yMin, yMax) {
  const xMax = Math.min(width, 0x7fff);
  const s = Math.min(DEBUG_STROKE_WIDTH, Math.floor(xMax / 4));
  if (s === 0) {
    return null;
  }
  // Clockwise outer contour; counterclockwise inner contour.
  // prettier-ignore
  const points = [
    0, yMin, 0, yMax, xMax, yMax, xMax, yMin,
    s, yMin + s, xMax - s, yMin + s, xMax - s, yMax - s, s, yMax - s,
  ];
  const glyph = new Uint8Array(56);
  const view = new DataView(glyph.buffer);
  view.setInt16(0, 2); // numberOfContours
  view.setInt16(4, yMin);
  view.setInt16(6, xMax);
  view.setInt16(8, yMax);
  view.setUint16(10, 3); // endPtsOfContours
  view.setUint16(12, 7);
  // No instructions; on-curve points with 16-bit deltas.
  glyph.fill(0x01, 16, 24);
  for (let i = 0, x = 0, y = 0; i < 8; i++) {
    view.setInt16(24 + 2 * i, points[2 * i] - x);
    view.setInt16(40 + 2 * i, points[2 * i + 1] - y);
    x = points[2 * i];
    y = points[2 * i + 1];
  }
  return glyph;
}

/**
 * Build a TrueType font, with empty glyphs, for the text layer.
 * @param {Map<number, number>} advances - Advance by code point.
 * @param {number} ascent - Fraction of the em; the descent is the rest.
 * @param {boolean} [drawBoxes] - Debug: draw glyph bounds.
 * @param {number} [advanceScale] - PDF advance per unit of encoded advance.
 * @returns {Uint8Array|null} The font, or null if the advances don't fit.
 */
function buildTextLayerFont(
  advances,
  ascent,
  drawBoxes = false,
  advanceScale = 1
) {
  // Glyph 0 is .notdef. The characters with the same advance share a glyph.
  const hmtxAdvances = [0];
  const glyphIds = new Map();
  const charCodeToGlyphId = new Map();
  let advanceSum = 0,
    advanceMax = 0,
    firstChar = 0xffff,
    lastChar = 0;
  for (const [codePoint, advance] of advances) {
    const scaledAdvance = advance / advanceScale;
    const units = Math.round((scaledAdvance * UNITS_PER_EM) / 1000);
    // A positive advance rounded to zero would make the span impossible to fit.
    if (
      !(scaledAdvance >= 0 && scaledAdvance <= MAX_ADVANCE) ||
      (units === 0 && scaledAdvance > 0)
    ) {
      return null;
    }
    let glyphId = glyphIds.get(units);
    if (glyphId === undefined) {
      glyphId = hmtxAdvances.push(units) - 1;
      glyphIds.set(units, glyphId);
      advanceSum += units;
      advanceMax = Math.max(advanceMax, units);
    }
    charCodeToGlyphId.set(codePoint, glyphId);
    const char = Math.min(codePoint, 0xffff);
    firstChar = Math.min(firstChar, char);
    lastChar = Math.max(lastChar, char);
  }
  const numGlyphs = hmtxAdvances.length;
  // The advances are unsigned, unlike xAvgCharWidth.
  const avgCharWidth = Math.round(advanceSum / (numGlyphs - 1));
  const ascender = Math.round(ascent * UNITS_PER_EM);
  const descender = ascender - UNITS_PER_EM;

  const builder = new OpenTypeFileBuilder("true");
  function createTable(tag, length) {
    const data = new Uint8Array(length);
    builder.addTable(tag, data);
    return new DataView(data.buffer);
  }

  const head = createTable("head", 54);
  head.setUint32(0, 0x00010000); // version
  head.setUint32(4, 0x00010000); // fontRevision
  head.setUint32(12, 0x5f0f3cf5); // magicNumber
  head.setUint16(16, 0x0003); // flags
  head.setUint16(18, UNITS_PER_EM);
  head.setInt16(38, descender); // yMin
  head.setInt16(42, ascender); // yMax
  head.setUint16(46, 8); // lowestRecPPEM
  head.setInt16(48, 2); // fontDirectionHint

  const hhea = createTable("hhea", 36);
  hhea.setUint32(0, 0x00010000); // version
  hhea.setInt16(4, ascender);
  hhea.setInt16(6, descender);
  hhea.setUint16(10, advanceMax);
  hhea.setInt16(18, 1); // caretSlopeRise
  hhea.setUint16(34, numGlyphs); // numberOfHMetrics

  const maxp = createTable("maxp", 32);
  maxp.setUint32(0, 0x00010000); // version
  maxp.setUint16(4, numGlyphs);
  maxp.setUint16(14, 2); // maxZones

  const os2 = createTable("OS/2", 96);
  os2.setUint16(0, 4); // version
  os2.setInt16(2, Math.min(avgCharWidth, 0x7fff)); // xAvgCharWidth
  os2.setUint16(4, 400); // usWeightClass
  os2.setUint16(6, 5); // usWidthClass
  os2.setUint32(58, 0x5044464a, /* littleEndian = */ false); // achVendID ("PDFJ")
  os2.setUint16(62, 0xc0); // fsSelection: REGULAR, USE_TYPO_METRICS
  os2.setUint16(64, firstChar);
  os2.setUint16(66, lastChar);
  os2.setInt16(68, ascender); // sTypoAscender
  os2.setInt16(70, descender); // sTypoDescender
  // Windows rejects a font with no usWinAscent.
  os2.setUint16(74, Math.max(ascender, 1)); // usWinAscent
  os2.setUint16(76, -descender); // usWinDescent
  os2.setUint16(92, 0x20); // usBreakChar
  os2.setUint16(94, 1); // usMaxContext

  const hmtx = createTable("hmtx", 4 * numGlyphs);
  for (let i = 0; i < numGlyphs; i++) {
    hmtx.setUint16(4 * i, hmtxAdvances[i]);
  }

  if (drawBoxes) {
    const loca = createTable("loca", 4 * (numGlyphs + 1));
    const glyf = new DataBuilder({ exactLength: 56 * numGlyphs });
    for (let i = 0; i < numGlyphs; i++) {
      const glyph = createBoxGlyph(hmtxAdvances[i], descender, ascender);
      if (glyph) {
        glyf.setArray(glyph);
      }
      loca.setUint32(4 * (i + 1), glyf.length);
    }
    if (!glyf.length) {
      glyf.skip(1);
    }
    const xMax = Math.min(advanceMax, 0x7fff);
    head.setInt16(40, xMax);
    head.setInt16(50, 1); // indexToLocFormat: long offsets
    hhea.setInt16(16, xMax); // xMaxExtent
    maxp.setUint16(6, 8); // maxPoints
    maxp.setUint16(8, 2); // maxContours
    builder.addTable("glyf", glyf.data);
  } else {
    // Empty glyphs use zero loca offsets and a nonempty glyf table.
    builder.addTable("loca", new Uint8Array(2 * (numGlyphs + 1)));
    builder.addTable("glyf", new Uint8Array(1));
  }
  builder.addTable("cmap", createCmapTable(charCodeToGlyphId, null, numGlyphs));
  builder.addTable("name", (nameTable ??= createNameTable("PDFJSTextLayer")));
  builder.addTable("post", (postTable ??= createPostTable({ italicAngle: 0 })));

  return builder.toArray();
}

/**
 * Collects PDF glyph advances and builds the fonts for the text layer.
 */
class TextLayerFonts {
  #drawBoxes;

  #heightScaled = new WeakSet();

  #idFactory;

  #stats = new Map();

  /**
   * @param {object} idFactory
   * @param {boolean} [drawBoxes] - Debug: draw glyph bounds.
   */
  constructor(idFactory, drawBoxes = false) {
    this.#idFactory = idFactory;
    this.#drawBoxes = drawBoxes;
  }

  /**
   * @param {Font} font
   * @returns {object} The advance, ligature and space gap samples.
   */
  #getStats(font) {
    return this.#stats.getOrInsertComputed(font, createStats);
  }

  /**
   * @param {Font} font
   * @param {string} unicode - The text of the glyph.
   * @param {number} advance - In 1/1000 em.
   */
  addGlyph(font, unicode, advance) {
    if (!unicode) {
      return;
    }
    const { advances, ligatures } = this.#getStats(font);
    // Most PDF glyphs map to one UTF-16 code unit.
    if (unicode.length === 1) {
      if (unicode.isWellFormed()) {
        addCount(
          advances,
          unicode.charCodeAt(0),
          isZeroWidth(unicode) ? 0 : advance
        );
      }
      return;
    }
    let text = "",
      length = 0;
    for (const char of unicode) {
      if (!char.isWellFormed()) {
        continue;
      }
      if (isZeroWidth(char)) {
        addCount(advances, char.codePointAt(0), 0);
      } else {
        text += char;
        length++;
      }
    }
    if (length === 1) {
      addCount(advances, text.codePointAt(0), advance);
    } else if (length > 1) {
      addCount(ligatures, text, advance);
    }
  }

  /**
   * @param {Font} font
   * @param {number} gap - The gap replaced by a space, in 1/1000 em.
   */
  addSpaceGap(font, gap) {
    if (Number.isFinite(gap)) {
      this.#getStats(font).spaceGaps.push(gap);
    }
  }

  /**
   * @param {Font} font - A Type 3 font whose item height is its bbox height.
   */
  addHeightScaledFont(font) {
    this.#heightScaled.add(font);
  }

  /**
   * @param {Font} font
   * @returns {object|null} The advances for fitting the spans.
   */
  getMetrics(font) {
    const stats = this.#stats.get(font);
    if (!stats) {
      return null;
    }
    const advances = getAdvances(stats);
    // Use the smallest power of two that fits every advance in hmtx.
    let advanceScale = 1;
    for (const advance of advances.values()) {
      if (!Number.isFinite(advance)) {
        return null;
      }
      while (advance > MAX_ADVANCE * advanceScale) {
        advanceScale *= 2;
      }
    }
    // A default space must occupy at least one encoded unit.
    advances.getOrInsert(
      0x20,
      Math.max(DEFAULT_SPACE_ADVANCE, (advanceScale * 1000) / UNITS_PER_EM)
    );
    if (advanceScale !== 1) {
      // Keep the fitter in PDF units, quantized to exactly the advances the
      // generated font will use.
      for (const [key, value] of advances) {
        const advance = roundFontAdvance(value / advanceScale) * advanceScale;
        if (advance === 0 && value > 0) {
          // See `buildTextLayerFont`.
          return null;
        }
        advances.set(key, advance);
      }
    }
    return { advances, advanceScale };
  }

  /**
   * @param {Font} font
   * @param {object|null} [metrics] - See `getMetrics`.
   * @returns {object|null} See `TextLayerFont` in the API.
   */
  build(font, metrics = this.getMetrics(font)) {
    if (!metrics) {
      return null;
    }
    // Vertical glyphs are centered on their column.
    const ascent = font.vertical
      ? 0.5
      : getAscentRatio(font, this.#heightScaled.has(font));
    const { advances, advanceScale } = metrics;
    const data = buildTextLayerFont(
      advances,
      ascent,
      this.#drawBoxes,
      advanceScale
    );
    if (!data) {
      return null;
    }
    return {
      name: `${this.#idFactory.getDocId()}_t${this.#idFactory.createFontId()}`,
      data,
      ascent,
      advanceScale,
    };
  }
}

export { buildTextLayerFont, getTextAdvance, isZeroWidth, TextLayerFonts };
