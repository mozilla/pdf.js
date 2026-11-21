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
import { isRtlCodePoint, isStrongLtrCodePoint } from "./bidi.js";
import { DataBuilder } from "./data_builder.js";
import { OpenTypeFileBuilder } from "./opentype_file_builder.js";

const UNITS_PER_EM = 2048;
const KERNING_KEY_FACTOR = 0x110000;
// The length of a version 0 kern subtable is a uint16.
const MAX_KERNING_PAIRS = Math.floor((0xffff - 14) / 6);
const GAP_STEP = 5; // thousandths of an em
const MIN_KERNING_SHARE = 0.8;
const MAX_KERNING_VALUES_PER_PAIR = 8;
// A single small negative adjustment can be kerning in a sparsely used font.
const MAX_SINGLE_KERNING = 200;

// The advances are in 1/1000 em.
const DEFAULT_ASCENT = 0.8;
const DEFAULT_SPACE_ADVANCE = 250;
// The largest advance fitting in the hmtx table.
const MAX_ADVANCE = (0xffff * 1000) / UNITS_PER_EM;
// The browsers give no advance to nonspacing marks or default ignorables.
const ZERO_WIDTH_REGEXP = /^[\p{Mn}\p{Default_Ignorable_Code_Point}]+$/u;
// The browser shapes Thai and Lao SARA AM as a mark followed by SARA AA.
// https://searchfox.org/firefox-main/rev/bb52b0d2720259aa4babab6a376836bce6dde70e/gfx/harfbuzz/src/hb-ot-shaper-thai.cc#335
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

function roundTextGap(gap) {
  return Math.round(gap / GAP_STEP) * GAP_STEP;
}

function isZeroWidth(text) {
  // No such character is below U+00AD (soft hyphen).
  return text.charCodeAt(0) >= 0xad && ZERO_WIDTH_REGEXP.test(text);
}

function getKerningKey(left, right) {
  return left * KERNING_KEY_FACTOR + right;
}

function getAdvanceCodePoint(char) {
  const codePoint = char.codePointAt(0);
  return SARA_AM_DECOMPOSITIONS.get(codePoint)?.[1] ?? codePoint;
}

function getAdvanceCodePoints(text) {
  const codePoints = [];
  for (const char of text) {
    if (!isZeroWidth(char) && char.isWellFormed()) {
      codePoints.push(getAdvanceCodePoint(char));
    }
  }
  return codePoints;
}

/**
 * @param {string} text
 * @param {object} metrics - See `TextLayerFonts.getMetrics`.
 * @returns {number} The advance of the text shaped by the browser, in 1/1000
 *   em, or NaN if a character is missing.
 */
function getTextAdvance(text, metrics) {
  const { advances, kerning } = metrics;
  let width = 0,
    prev = -1;
  for (const char of text) {
    if (isZeroWidth(char)) {
      if (!advances.has(char.codePointAt(0))) {
        return NaN;
      }
      continue;
    }
    const codePoint = getAdvanceCodePoint(char);
    width += advances.get(codePoint);
    if (prev >= 0) {
      width += kerning.get(getKerningKey(prev, codePoint)) ?? 0;
    }
    prev = codePoint;
  }
  return width;
}

function createStats() {
  return {
    advances: new Map(),
    ligatures: new Map(),
    kerning: new Map(),
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
 * @param {number} [count]
 * @returns {Map<number, number>} Updated counts for the key.
 */
function addCount(samples, key, advance, count = 1) {
  const counts = samples.getOrInsertComputed(key, makeMap);
  return counts.set(advance, (counts.get(advance) || 0) + count);
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

function addKerningSample(samples, key, advance, count = 1) {
  if (samples.get(key) === null || !Number.isFinite(advance)) {
    return;
  }
  const counts = addCount(samples, key, roundTextGap(advance), count);
  if (counts.size > MAX_KERNING_VALUES_PER_PAIR) {
    samples.set(key, null);
  }
}

function selectKerningPairs(samples, ligaturePairs) {
  const candidates = [];
  for (const [key, counts] of samples) {
    if (!counts) {
      continue;
    }
    const value = getMostFrequent(counts);
    const count = counts.get(value);
    if (
      value &&
      Math.abs(value) <= 1000 &&
      (count >= 2 ||
        (value < 0 && value >= -MAX_SINGLE_KERNING) ||
        ligaturePairs?.has(key)) &&
      count >= MIN_KERNING_SHARE * counts.values().reduce((a, b) => a + b, 0)
    ) {
      candidates.push({ key, value, count });
    }
  }
  if (candidates.length > MAX_KERNING_PAIRS) {
    candidates.sort((a, b) => b.count - a.count);
    candidates.length = MAX_KERNING_PAIRS;
  }
  return new Map(candidates.map(({ key, value }) => [key, value]));
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

function getKerning({ kerning, ligatures }, advances) {
  if (!ligatures.size) {
    return selectKerningPairs(kerning);
  }
  // A ligature's remaining advance is distributed over its internal
  // pairs. Count those observations together with the gaps in the PDF.
  const samples = new Map(kerning);
  const ligaturePairs = new Set();
  for (const [unicode, counts] of ligatures) {
    const codePoints = getAdvanceCodePoints(unicode);
    if (codePoints.some(isRtlCodePoint)) {
      continue;
    }
    const width = codePoints.reduce(
      (sum, codePoint) => sum + advances.get(codePoint),
      0
    );
    for (let i = 1; i < codePoints.length; i++) {
      const key = getKerningKey(codePoints[i - 1], codePoints[i]);
      const observed = kerning.get(key);
      if (observed && samples.get(key) === observed) {
        samples.set(key, new Map(observed));
      }
      ligaturePairs.add(key);
      for (const [advance, frequency] of counts) {
        const value = (advance - width) / (codePoints.length - 1);
        addKerningSample(samples, key, value, frequency);
      }
    }
  }
  return selectKerningPairs(samples, ligaturePairs);
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

function createKerningPositioning(pairs) {
  const pairSets = Map.groupBy(pairs, ([left]) => left);
  const count = pairSets.size;
  const coverageOffset = 10 + 2 * count;
  const pairSetsOffset = coverageOffset + 4 + 2 * count;
  const pairPosLength = pairSetsOffset + 2 * count + 4 * pairs.length;
  if (pairPosLength > 0xffff) {
    return null;
  }

  const scriptList = 10;
  const featureList = scriptList + 20;
  const lookupList = featureList + 14;
  const lookup = lookupList + 4;
  const pairPos = lookup + 8;
  const data = new Uint8Array(pairPos + pairPosLength);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0x00010000); // version 1.0
  view.setUint16(4, scriptList);
  view.setUint16(6, featureList);
  view.setUint16(8, lookupList);

  // The default script and language select the first feature.
  view.setUint16(scriptList, 1);
  view.setUint32(scriptList + 2, 0x44464c54); // DFLT
  view.setUint16(scriptList + 6, 8); // Script offset
  view.setUint16(scriptList + 8, 4); // DefaultLangSys offset
  view.setUint16(scriptList + 14, 0xffff); // No required feature.
  view.setUint16(scriptList + 16, 1); // Feature count

  view.setUint16(featureList, 1);
  view.setUint32(featureList + 2, 0x6b65726e); // kern
  view.setUint16(featureList + 6, 8); // Feature offset
  view.setUint16(featureList + 10, 1); // Lookup count

  view.setUint16(lookupList, 1);
  view.setUint16(lookupList + 2, 4); // Lookup offset
  view.setUint16(lookup, 2); // Pair adjustment
  view.setUint16(lookup + 2, 0x0008); // Ignore marks.
  view.setUint16(lookup + 4, 1); // Subtable count
  view.setUint16(lookup + 6, 8); // First subtable offset

  // Adjust the full advance of the first glyph. This keeps the selection
  // boundary at the start of the second glyph.
  view.setUint16(pairPos, 1); // Pair positioning format 1
  view.setUint16(pairPos + 2, coverageOffset);
  view.setUint16(pairPos + 4, 4); // xAdvance
  view.setUint16(pairPos + 8, count);
  const coverage = pairPos + coverageOffset;
  view.setUint16(coverage, 1); // Coverage format 1
  view.setUint16(coverage + 2, count);

  let index = 0,
    offset = pairPos + pairSetsOffset;
  for (const [left, records] of pairSets) {
    view.setUint16(coverage + 4 + 2 * index, left);
    view.setUint16(pairPos + 10 + 2 * index++, offset - pairPos);
    view.setUint16(offset, records.length);
    offset += 2;
    for (const [, right, units] of records) {
      view.setUint16(offset, right);
      view.setInt16(offset + 2, units);
      offset += 4;
    }
  }
  return data;
}

function addKerningTable(builder, codePointPairs, charCodeToGlyphId) {
  // The legacy kern table uses visual order. GPOS preserves caret positions,
  // but its pairs use reading order, which must match the PDF's visual order.
  const useGpos =
    !charCodeToGlyphId.keys().some(isRtlCodePoint) ||
    codePointPairs.every(
      ([left, right]) =>
        isStrongLtrCodePoint(left) && isStrongLtrCodePoint(right)
    );

  const pairs = codePointPairs.map(([left, right, units]) => [
    charCodeToGlyphId.get(left),
    charCodeToGlyphId.get(right),
    units,
  ]);
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (useGpos) {
    const gpos = createKerningPositioning(pairs);
    if (gpos) {
      builder.addTable("GPOS", gpos);
      return;
    }
  }
  const count = pairs.length;
  const data = new Uint8Array(18 + 6 * count);
  const kern = new DataView(data.buffer);
  kern.setUint16(2, 1); // nTables
  kern.setUint16(6, 14 + 6 * count); // subtable length
  kern.setUint16(8, 1); // format 0, horizontal
  kern.setUint16(10, count);
  const { range, entry, rangeShift } = OpenTypeFileBuilder.getSearchParams(
    count,
    6
  );
  kern.setUint16(12, range);
  kern.setUint16(14, entry);
  kern.setUint16(16, rangeShift);
  let offset = 18;
  for (const [left, right, units] of pairs) {
    kern.setUint16(offset, left);
    kern.setUint16(offset + 2, right);
    kern.setInt16(offset + 4, units);
    offset += 6;
  }
  builder.addTable("kern", data);
}

/**
 * Build a TrueType font, with empty glyphs, for the text layer.
 * @param {Map<number, number>} advances - Advance by code point.
 * @param {number} ascent - Fraction of the em; the descent is the rest.
 * @param {boolean} [drawBoxes] - Debug: draw glyph bounds.
 * @param {number} [advanceScale] - PDF advance per unit of encoded advance.
 * @param {Map<number, number>} [kerning] - Advances by Unicode pair key.
 * @returns {Uint8Array|null} The font, or null if the advances don't fit.
 */
function buildTextLayerFont(
  advances,
  ascent,
  drawBoxes = false,
  advanceScale = 1,
  kerning
) {
  const kerned = new Set();
  const pairs = [];
  for (const [key, advance] of kerning || []) {
    const left = Math.floor(key / KERNING_KEY_FACTOR);
    const right = key % KERNING_KEY_FACTOR;
    const units = toFontUnits(advance / advanceScale);
    if (units && advances.has(left) && advances.has(right)) {
      kerned.add(left).add(right);
      pairs.push([left, right, units]);
    }
  }

  // Glyph 0 is .notdef. Unkerned characters with the same advance can share
  // a glyph. The kern table identifies a pair by glyph IDs, not code points.
  const hmtxAdvances = [0];
  const glyphIdByWidth = new Map();
  const charCodeToGlyphId = new Map();
  let advanceSum = 0,
    advanceMax = 0,
    firstChar = 0xffff,
    lastChar = 0;
  for (const [codePoint, advance] of advances) {
    const scaledAdvance = advance / advanceScale;
    const units = toFontUnits(scaledAdvance);
    // A positive advance rounded to zero would make the span impossible to fit.
    if (
      !(scaledAdvance >= 0 && scaledAdvance <= MAX_ADVANCE) ||
      (units === 0 && scaledAdvance > 0)
    ) {
      return null;
    }
    const hasKerning = kerned.has(codePoint);
    let glyphId = hasKerning ? undefined : glyphIdByWidth.get(units);
    if (glyphId === undefined) {
      glyphId = hmtxAdvances.push(units) - 1;
      if (!hasKerning) {
        glyphIdByWidth.set(units, glyphId);
      }
      advanceSum += units;
      advanceMax = Math.max(advanceMax, units);
    }
    charCodeToGlyphId.set(codePoint, glyphId);
    const char = Math.min(codePoint, 0xffff);
    firstChar = Math.min(firstChar, char);
    lastChar = Math.max(lastChar, char);
  }
  const numGlyphs = hmtxAdvances.length;
  if (numGlyphs > 0xffff) {
    return null;
  }
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

  if (pairs.length) {
    addKerningTable(builder, pairs, charCodeToGlyphId);
  }
  return builder.toArray();
}

/**
 * Collects PDF glyph advances and builds the fonts for the text layer.
 */
class TextLayerFonts {
  #drawBoxes;

  #heightScaled = new WeakSet();

  #idFactory;

  #advanceCodePoints = new Map();

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
   * @returns {object} The samples collected for the font.
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

  addKerning(font, leftText, rightText, advance) {
    if (font.vertical) {
      return;
    }
    const codePoints = this.#advanceCodePoints;
    const left = codePoints
      .getOrInsertComputed(leftText, getAdvanceCodePoints)
      .at(-1);
    const right = codePoints.getOrInsertComputed(
      rightText,
      getAdvanceCodePoints
    )[0];
    if (left !== undefined && right !== undefined) {
      addKerningSample(
        this.#getStats(font).kerning,
        getKerningKey(left, right),
        advance
      );
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
   * @returns {object|null} The advances and kerning for fitting the spans.
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
      if (!Number.isFinite(advance) || advance < 0) {
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
    // `addKerning` skips vertical fonts, but the ligatures still give samples.
    const kerning = font.vertical ? new Map() : getKerning(stats, advances);
    // Keep the fitter in PDF units, using the same advances as the font.
    const quantize = value =>
      (toFontUnits(value / advanceScale) * 1000 * advanceScale) / UNITS_PER_EM;
    for (const [key, value] of advances) {
      const advance = quantize(value);
      if (advance === 0 && value > 0) {
        return null;
      }
      advances.set(key, advance);
    }
    for (const [key, value] of kerning) {
      kerning.set(key, quantize(value));
    }
    return { advances, kerning, advanceScale };
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
    const { advances, kerning, advanceScale } = metrics;
    const data = buildTextLayerFont(
      advances,
      ascent,
      this.#drawBoxes,
      advanceScale,
      kerning
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

export {
  buildTextLayerFont,
  getTextAdvance,
  isZeroWidth,
  roundTextGap,
  TextLayerFonts,
};
