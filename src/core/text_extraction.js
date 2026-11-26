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

import { AbortException, TEXT_CONTENT_CHUNK_SIZE } from "../shared/util.js";
import {
  getTextAdvance,
  isZeroWidth,
  TextLayerFonts,
} from "./text_layer_font.js";
import { bidi } from "./bidi.js";

// These scripts can be fitted using the generated font's advances and the
// visual glyph order. Fullwidth digits and Kana prolonged sound marks have
// script Common. Contextual and mixed-direction runs use width fitting.
const SIMPLE_TEXT =
  /^[ 0-9\u30fc\uff10-\uff19\uff70\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{Mn}\p{P}\p{Sc}\p{Sm}\p{Sk}]+$/u;
const SIMPLE_RTL_TEXT =
  /^[ \ufb50-\ufdff\ufe70-\ufefc\p{sc=Hebr}\p{Mn}\p{P}]+$/u;
const GAP_STEP = 5; // thousandths of an em
const MIN_SPACE_GAP = 30;
const MAX_GLYPH_OVERLAP = 200;
const MAX_INLINE_SPACE = 600; // thousandths of an em
// In page units, how far the cursor can move back before the previous glyph's
// origin and stay in its run.
const POSITION_TOLERANCE = 0.75;
// The word space heuristics of the original text extraction: a gap narrower
// than 0.102 em is tracking, and a font space wider than 1/3 em is unreliable.
const MIN_SPACE_THRESHOLD = 102; // thousandths of an em
const MAX_SPACE_WIDTH = 333; // thousandths of an em
// For Type 3 fonts, a fraction of the narrower adjacent glyph.
const TYPE3_SPACE_FACTOR = 0.25;

// Offsets and advances along the baseline are in thousandths of an em.
function transformAt(transform, offset, vertical) {
  const result = new Float32Array(transform);
  result[4] += ((vertical ? -transform[2] : transform[0]) * offset) / 1000;
  result[5] += ((vertical ? -transform[3] : transform[1]) * offset) / 1000;
  return result;
}

function makeItem(str, dir, transform, length, fontName) {
  const vertical = dir === "ttb";
  return {
    str,
    dir,
    transform,
    width: vertical ? Math.hypot(transform[0], transform[1]) : length,
    height: vertical ? length : Math.hypot(transform[2], transform[3]),
    fontName,
    hasEOL: false,
  };
}

function makeSpaceItem(transform, advance, length, fontName, dir) {
  return makeItem(
    " ",
    dir,
    transformAt(transform, advance, dir === "ttb"),
    Math.max(0, length),
    fontName
  );
}

function getSpaceThreshold(spaceWidth, leftAdvance, rightAdvance) {
  if (spaceWidth === null) {
    // Type 3 glyph widths can be far outside the usual range of an em.
    const left = Math.abs(leftAdvance);
    const right = Math.abs(rightAdvance);
    return (
      TYPE3_SPACE_FACTOR * (Math.min(left, right) || left || right) ||
      MIN_SPACE_THRESHOLD
    );
  }
  // Half of the font space, between 0.102 and 0.1665 em.
  return Math.max(
    MIN_SPACE_THRESHOLD,
    Math.min(spaceWidth || 0, MAX_SPACE_WIDTH) / 2
  );
}

function hasSameAxes(left, right) {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

// For a reflected transform with d > 0, move the origin along the baseline
// by the item width, then reverse the baseline direction.
function unmirrorTransform(transform, width) {
  const a = transform[0];
  const b = transform[1];
  const c = transform[2];
  const d = transform[3];
  if (a * d - b * c >= 0 || d <= 0) {
    return false;
  }
  const scale = width / Math.hypot(a, b);
  transform[0] = -a;
  transform[1] = -b;
  transform[4] += a * scale;
  transform[5] += b * scale;
  return true;
}

// The move across the baseline from the origin `from` to `to`, in page units,
// without the text rise change.
function getLineShift(from, fromRise, to, toRise, pa, pb, baselineLength) {
  const dx = to[4] - from[4] - (toRise[0] - fromRise[0]),
    dy = to[5] - from[5] - (toRise[1] - fromRise[1]);
  return (dy * pa - dx * pb) / baselineLength;
}

// The evaluator walks each content stream in PDF drawing order. A run retains
// the cursor positions on one baseline and with one font and text transform.
class TextRuns {
  #emit;

  #run = null;

  // The run of the last glyph, which may already be flushed.
  #prevRun = null;

  #prevGlyph = null;

  // Copied, since the caller reuses its transform for the next glyph.
  #prevTransform = new Float32Array(6);

  #prevTextRise = null;

  #space = false;

  #trackingStart = false;

  constructor(emit) {
    this.#emit = emit;
  }

  addSpace() {
    this.#space = true;
  }

  resetTracking() {
    this.#trackingStart = true;
  }

  addGlyph(
    fontName,
    transform,
    textRise,
    unicode,
    isUnicodeVisual,
    advance,
    charSpacing,
    spaceWidth,
    vertical
  ) {
    // Project onto the writing axis: +x for horizontal text, -y for vertical.
    const axis = vertical ? 2 : 0;
    const sign = vertical ? -1 : 1;
    const a = sign * transform[axis],
      b = sign * transform[axis + 1],
      x = transform[4],
      y = transform[5];

    const scale = Math.hypot(a, b) / 1000;
    if (!scale || !Number.isFinite(scale)) {
      return;
    }

    let leadingSpace = null;
    const prevRun = this.#prevRun;
    if (prevRun && prevRun.vertical !== vertical) {
      this.reset();
    } else if (prevRun) {
      const base = this.#prevGlyph,
        prevTransform = this.#prevTransform,
        prevTextRise = this.#prevTextRise;
      const {
        scale: prevScale,
        spaceWidth: prevSpaceWidth,
        fontName: prevFontName,
      } = prevRun;
      const pa = sign * prevTransform[axis],
        pb = sign * prevTransform[axis + 1];
      const baselineLength = 1000 * prevScale;
      const along =
        ((x - prevTransform[4]) * pa + (y - prevTransform[5]) * pb) /
        baselineLength;
      const lineShift = getLineShift(
        prevTransform,
        prevTextRise,
        transform,
        textRise,
        pa,
        pb,
        baselineLength
      );
      const height = Math.hypot(
        prevTransform[2 - axis],
        prevTransform[3 - axis]
      );
      const run = this.#run;
      const sameFontAndAxes =
        prevFontName === fontName && hasSameAxes(transform, prevTransform);
      if (
        run &&
        sameFontAndAxes &&
        !this.#space &&
        Math.abs(lineShift) <= height &&
        isZeroWidth(unicode)
      ) {
        // Keep the mark with its base for bidi and kerning. Preserve the
        // PDF advance and text-state spacing when the mark moves the cursor.
        base.unicode += unicode;
        base.advance += advance;
        base.charSpacing += charSpacing;
        return;
      }
      const gap = along / prevScale - base.advance;
      // The cursor can move back from the end of a glyph, e.g. when a
      // spacing accent is overprinted on the next glyph. Allow rounding
      // errors at the cutoff so a 200-unit TJ can still be kerning.
      const backwards =
        along < -POSITION_TOLERANCE ||
        gap + 1e-6 < Math.min(base.charSpacing, 0) - MAX_GLYPH_OVERLAP;
      const newLine = Math.abs(lineShift) > height * (backwards ? 0.5 : 1);
      if (newLine) {
        this.flush(true);
      } else if (
        !run ||
        !sameFontAndAxes ||
        backwards ||
        Math.abs((y - run.transform[5]) * pa - (x - run.transform[4]) * pb) >
          baselineLength * 0.25
      ) {
        this.flush();
        // A gap to a mirrored glyph isn't measured from its edge.
        if (
          !backwards &&
          a * pa + b * pb > 0 &&
          ((this.#space && gap > MIN_SPACE_GAP) ||
            gap - base.charSpacing >
              getSpaceThreshold(prevSpaceWidth, base.advance, advance))
        ) {
          leadingSpace = makeSpaceItem(
            prevTransform,
            base.advance,
            gap * prevScale,
            prevFontName,
            vertical ? "ttb" : "ltr"
          );
        }
      }
    }

    this.#run ??= {
      fontName,
      transform: transform.slice(),
      scale,
      spaceWidth,
      vertical,
      leadingSpace,
      glyphs: [],
      hasEOL: false,
    };
    const { glyphs, transform: start } = this.#run;
    const offset =
      ((x - start[4]) * a + (y - start[5]) * b) / (1000 * scale * scale);
    const glyph = {
      unicode,
      isUnicodeVisual,
      offset,
      advance,
      charSpacing,
      space: glyphs.length > 0 && this.#space,
      trackingStart: this.#trackingStart,
    };
    glyphs.push(glyph);
    this.#prevRun = this.#run;
    this.#prevGlyph = glyph;
    this.#prevTransform.set(transform);
    this.#prevTextRise = textRise;
    this.#space = false;
    this.#trackingStart = false;
  }

  // Text without glyphs, e.g. an empty line in a form field, can end a line.
  addEmptyText(transform, textRise, vertical) {
    const prevRun = this.#prevRun;
    if (prevRun?.vertical !== vertical) {
      return;
    }
    const axis = vertical ? 2 : 0;
    const sign = vertical ? -1 : 1;
    const prevTransform = this.#prevTransform;
    const lineShift = getLineShift(
      prevTransform,
      this.#prevTextRise,
      transform,
      textRise,
      sign * prevTransform[axis],
      sign * prevTransform[axis + 1],
      1000 * prevRun.scale
    );
    // Nothing is drawn, hence half a line is enough, as when the cursor moves
    // back for a glyph.
    if (
      Math.abs(lineShift) >
      0.5 * Math.hypot(prevTransform[2 - axis], prevTransform[3 - axis])
    ) {
      this.flush(true);
    }
  }

  flush(hasEOL = false) {
    const run = this.#run;
    if (run) {
      run.hasEOL = hasEOL;
      this.#emit(run);
      this.#run = null;
    } else if (hasEOL && this.#prevRun) {
      const { vertical, fontName } = this.#prevRun;
      this.#emit({
        str: "",
        dir: vertical ? "ttb" : "ltr",
        transform: this.#prevTransform.slice(),
        fontName,
        width: 0,
        height: 0,
        hasEOL,
      });
    }
  }

  reset() {
    this.flush();
    this.#prevRun = this.#prevGlyph = null;
    this.#space = false;
  }
}

function getGap(left, right) {
  return right.offset - left.offset - left.advance;
}

function inferTracking(glyphs, start, end, threshold) {
  const bins = new Map();
  let samples = 0;
  for (let i = start + 1; i < end; i++) {
    const left = glyphs[i - 1],
      right = glyphs[i];
    if (right.space) {
      continue;
    }
    const gap = getGap(left, right) - left.charSpacing;
    const value = Math.round(gap / GAP_STEP) * GAP_STEP;
    const bin = bins.get(value);
    if (bin) {
      bin.count++;
      bin.differentPairs ||=
        left.unicode !== bin.left || right.unicode !== bin.right;
    } else {
      bins.set(value, {
        left: left.unicode,
        right: right.unicode,
        count: 1,
        differentPairs: false,
      });
    }
    samples++;
  }

  // Prefer the gap closest to zero when two bins are equally frequent.
  let value = 0,
    count = 0;
  for (const [gap, { count: frequency }] of bins) {
    if (
      frequency > count ||
      (frequency === count && Math.abs(gap) < Math.abs(value))
    ) {
      value = gap;
      count = frequency;
    }
  }
  // A repeated pair alone is evidence of kerning. Repeated narrow gaps
  // between different pairs are tracking.
  if (!value || count < 2 || !bins.get(value).differentPairs) {
    return 0;
  }
  if (Math.abs(value) <= threshold) {
    return value;
  }
  // For wider gaps, look for a separate group of even wider word spaces.
  const maxTracking = bins.keys().some(gap => gap > value + threshold)
    ? 2.5 * threshold
    : 1.5 * threshold;
  return value > 0 && value < maxTracking && 2 * count >= samples ? value : 0;
}

function inferSpaces({ glyphs, spaceWidth }, fonts, font) {
  for (let start = 0, end; start < glyphs.length; start = end) {
    end = start + 1;
    while (end < glyphs.length && !glyphs[end].trackingStart) {
      end++;
    }
    const tracking =
      spaceWidth === null
        ? 0
        : inferTracking(glyphs, start, end, getSpaceThreshold(spaceWidth));
    for (let i = Math.max(1, start); i < end; i++) {
      const left = glyphs[i - 1],
        right = glyphs[i];
      const gap = getGap(left, right);
      // A line-positioning operator starts a new tracking measurement. There
      // is no inferred tracking across the boundary between measurements.
      const pairTracking = i === start ? 0 : tracking;
      const adjustedGap = gap - left.charSpacing - pairTracking;
      const threshold = getSpaceThreshold(
        spaceWidth,
        left.advance,
        right.advance
      );
      // Tracking also increases word spacing, but can occupy part of a word
      // gap already encoded by the author.
      right.space = right.space
        ? gap > MIN_SPACE_GAP
        : adjustedGap > (pairTracking > 0 ? 0.8 : 1) * threshold;
      if (right.space && adjustedGap > 0) {
        fonts?.addSpaceGap(font, adjustedGap);
      }
    }
  }
}

function makeTextItem(
  run,
  first,
  last,
  str,
  dir = run.vertical ? "ttb" : "ltr"
) {
  const { glyphs, scale, fontName } = run;
  const start = glyphs[first].offset;
  const { offset, advance } = glyphs[last];
  const end = offset + advance;
  return makeItem(
    str,
    dir,
    transformAt(run.transform, start, run.vertical),
    Math.abs(end - start) * scale,
    fontName
  );
}

function getTextParts(glyphs, first, last) {
  const text = [glyphs[first].unicode];
  for (let i = first + 1; i <= last; i++) {
    const { space, unicode } = glyphs[i];
    if (space) {
      text.push(" ");
    }
    text.push(unicode);
  }
  return text;
}

// Contextual shaping and mixed bidi need browser measurement.
function hasSimpleGlyphOrder({ str, dir }, parts, visualText) {
  return dir === "rtl"
    ? SIMPLE_RTL_TEXT.test(str) && str === parts.toReversed().join("")
    : SIMPLE_TEXT.test(str) && str === visualText;
}

function widthFittedItem(item, { advances }, visualText) {
  const { str } = item;
  // Even with simple glyph order, mirroring, variation selectors or NFC
  // composition can change which glyphs the browser measures.
  if (
    str.length > 1 &&
    /\S/.test(str) &&
    (item.dir !== "rtl" || !/\p{Bidi_Mirrored}/u.test(visualText)) &&
    !/\p{Variation_Selector}/u.test(visualText) &&
    visualText === visualText.normalize("NFC")
  ) {
    const width = getTextAdvance(visualText, advances);
    if (width > 0) {
      item.textLayerAdvance = width / 1000;
    }
  }
  return item;
}

function makeSpan(run, first, last, dir, metrics) {
  const parts = getTextParts(run.glyphs, first, last);
  const visualText = parts.join("");
  const str = dir === "rtl" ? parts.reverse().join("") : visualText;
  return widthFittedItem(
    makeTextItem(run, first, last, str, dir),
    metrics,
    visualText
  );
}

function getBidiRun(run, onMirror) {
  const { glyphs, vertical } = run;
  const fullItem = makeTextItem(run, 0, glyphs.length - 1, "");
  const unmirrored =
    !vertical && unmirrorTransform(fullItem.transform, fullItem.width);
  // The glyphs tell bidi whether their Unicode is the shape to mirror.
  const parts = [];
  for (const glyph of glyphs) {
    if (glyph.space) {
      parts.push(" ");
    }
    parts.push(glyph);
  }
  if (unmirrored) {
    parts.reverse();
  }
  Object.assign(fullItem, bidi(parts, -1, vertical, onMirror));
  return {
    run,
    item: fullItem,
    text: parts.map(part => part.unicode ?? part),
    unmirrored,
  };
}

function layoutRun({ run, item, text, unmirrored }, metrics, items) {
  const visualText = text.join("");
  if (!hasSimpleGlyphOrder(item, text, visualText)) {
    items.push(item);
    return;
  }
  const { glyphs } = run;
  const { dir } = item;
  const start = items.length;
  let first = 0;
  // A wide gap, e.g. between two table cells, starts a new span.
  for (let i = 1; !unmirrored && i < glyphs.length; i++) {
    const left = glyphs[i - 1];
    const gap = glyphs[i].space ? getGap(left, glyphs[i]) : 0;
    if (gap > MAX_INLINE_SPACE) {
      items.push(
        makeSpan(run, first, i - 1, dir, metrics),
        makeSpaceItem(
          run.transform,
          left.offset + left.advance,
          gap * run.scale,
          run.fontName,
          dir
        )
      );
      first = i;
    }
  }
  if (first === 0) {
    items.push(widthFittedItem(item, metrics, visualText));
    return;
  }
  items.push(makeSpan(run, first, glyphs.length - 1, dir, metrics));
  if (dir === "rtl") {
    for (let i = start, j = items.length - 1; i < j; i++, j--) {
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }
}

// The intersector gets the glyphs, and the spaces and line breaks between them,
// in drawing order.
function intersectRun(intersector, run) {
  const { glyphs, transform, vertical } = run;
  if (run.leadingSpace) {
    intersector.addExtraChar(" ");
  }
  const a = vertical ? -transform[2] : transform[0],
    b = vertical ? -transform[3] : transform[1];
  for (const { unicode, offset, advance, space } of glyphs) {
    if (space) {
      intersector.addExtraChar(" ");
    }
    // The middle of the glyph advance on the baseline.
    const middle = (offset + advance / 2) / 1000;
    intersector.addGlyph(
      transform[4] + a * middle,
      transform[5] + b * middle,
      unicode
    );
  }
  if (run.hasEOL) {
    intersector.addExtraChar("\n");
  }
}

/**
 * Infers the word spaces of the runs. With the text layer fonts, buffers the
 * page to fit the spans to the advances of the generated fonts.
 */
class TextExtraction {
  #chunks = [];

  #fonts = new Map();

  #intersector;

  #sink;

  // The number of chunks enqueued by the evaluator.
  chunkCount = 0;

  /**
   * @param {object | null} sink - Receives the text content, if any.
   * @param {object} [options]
   * @param {object} [options.idFactory] - To generate the text layer fonts.
   * @param {boolean} [options.debugFonts]
   * @param {Intersector} [options.intersector] - Gets the glyphs instead of the
   *   sink.
   */
  constructor(
    sink,
    { idFactory = null, debugFonts = false, intersector = null } = {}
  ) {
    this.#sink = sink;
    this.#intersector = intersector;
    this.fonts = idFactory ? new TextLayerFonts(idFactory, debugFonts) : null;
  }

  get ready() {
    if (!this.fonts) {
      return this.#sink?.ready ?? Promise.resolve();
    }
    return this.#sink.isCancelled
      ? Promise.reject(new AbortException("Text content stream cancelled."))
      : Promise.resolve();
  }

  get desiredSize() {
    if (this.fonts) {
      // The whole page is buffered to generate the fonts.
      return Infinity;
    }
    return this.#sink ? this.#sink.desiredSize : TEXT_CONTENT_CHUNK_SIZE;
  }

  enqueue(chunk) {
    this.chunkCount++;
    const { fonts } = this;
    const intersector = this.#intersector;
    const { items } = chunk;
    for (let i = 0, ii = items.length; i < ii; i++) {
      const run = items[i];
      if (!run.glyphs) {
        if (run.hasEOL) {
          intersector?.addExtraChar("\n");
        }
        continue;
      }
      const font = this.#fonts.get(run.fontName);
      inferSpaces(run, fonts, font);
      if (intersector) {
        intersectRun(intersector, run);
        continue;
      }
      // The text has the logical characters of the mirrored glyphs, hence the
      // generated font needs them too.
      items[i] = getBidiRun(
        run,
        fonts &&
          ((glyph, unicode) => fonts.addGlyph(font, unicode, glyph.advance))
      );
    }
    if (intersector) {
      return;
    }
    if (fonts) {
      this.#chunks.push({ ...chunk });
      return;
    }
    const laidOut = this.#layoutItems(items, null);
    this.#sink?.enqueue({ ...chunk, items: laidOut }, laidOut.length);
  }

  #layoutItems(items, getMetrics) {
    const result = [];
    for (const entry of items) {
      const { run } = entry;
      if (!run) {
        result.push(entry);
        continue;
      }
      if (run.leadingSpace) {
        result.push(run.leadingSpace);
      }
      const metrics = getMetrics?.(entry.item.fontName);
      if (metrics) {
        layoutRun(entry, metrics, result);
      } else {
        result.push(entry.item);
      }
      result.at(-1).hasEOL = run.hasEOL;
    }
    return result;
  }

  addFont(name, font, heightScaled = false) {
    this.#fonts.set(name, font);
    if (heightScaled) {
      this.fonts?.addHeightScaledFont(font);
    }
  }

  send() {
    const { fonts } = this;
    if (!fonts || this.#sink.isCancelled) {
      return;
    }
    // The spans and the fonts use the same metrics.
    const metrics = new Map();
    const computeMetrics = font => fonts.getMetrics(font);
    const getFontMetrics = font =>
      metrics.getOrInsertComputed(font, computeMetrics);
    const getMetrics = name => getFontMetrics(this.#fonts.get(name));
    for (const chunk of this.#chunks) {
      chunk.items = this.#layoutItems(chunk.items, getMetrics);
    }
    const textLayerFonts = new Map();
    const build = font => fonts.build(font, getFontMetrics(font));
    for (const chunk of this.#chunks) {
      for (const [name, style] of Object.entries(chunk.styles)) {
        const textLayerFont = textLayerFonts.getOrInsertComputed(
          this.#fonts.get(name),
          build
        );
        if (textLayerFont) {
          style.textLayerFont = textLayerFont;
        }
      }
      this.#sink.enqueue(chunk, chunk.items.length);
    }
  }
}

export { TextExtraction, TextRuns };
