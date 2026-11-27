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

import { BidiClassRanges, BidiMirroringPairs } from "./bidi_tables.js";

// Implements a subset of the Unicode Bidirectional Algorithm (UBA).
// Specification: https://www.unicode.org/reports/tr9/tr9-48.html

// The first class, L, is the default and has no ranges.
const BidiClasses = Object.keys(BidiClassRanges);

// Class indices for the BMP and sorted ranges for the other planes, built on
// first use.
let bmpClasses = null;
let astralRanges = null;
let mirroredChars = null;

function initBidiClasses() {
  bmpClasses = new Uint8Array(0x10000);
  const astral = [];
  for (let i = 1, ii = BidiClasses.length; i < ii; i++) {
    const ranges = BidiClassRanges[BidiClasses[i]];
    for (let j = 0, jj = ranges.length; j < jj; j += 2) {
      const start = ranges[j],
        end = ranges[j + 1];
      if (start <= 0xffff) {
        bmpClasses.fill(i, start, Math.min(end, 0xffff) + 1);
      }
      if (end > 0xffff) {
        astral.push([Math.max(start, 0x10000), end, i]);
      }
    }
  }
  astral.sort((x, y) => x[0] - y[0]);
  astralRanges = astral;
}

function getMirroredChar(char) {
  if (!mirroredChars) {
    mirroredChars = new Map();
    for (let i = 0, ii = BidiMirroringPairs.length; i < ii; i += 2) {
      const a = String.fromCodePoint(BidiMirroringPairs[i]),
        b = String.fromCodePoint(BidiMirroringPairs[i + 1]);
      mirroredChars.set(a, b).set(b, a);
    }
  }
  return mirroredChars.get(char);
}

function getBidiClass(cp) {
  if (cp <= 0xffff) {
    return BidiClasses[bmpClasses[cp]];
  }
  let lo = 0,
    hi = astralRanges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end, cls] = astralRanges[mid];
    if (cp < start) {
      hi = mid - 1;
    } else if (cp > end) {
      lo = mid + 1;
    } else {
      return BidiClasses[cls];
    }
  }
  return "L";
}

function isOdd(i) {
  return (i & 1) !== 0;
}

function isEven(i) {
  return (i & 1) === 0;
}

function findUnequal(arr, start, value, end = arr.length) {
  for (let j = start; j < end; ++j) {
    if (arr[j] !== value) {
      return j;
    }
  }
  return end;
}

function reverseValues(arr, start, end) {
  for (let i = start, j = end - 1; i < j; ++i, --j) {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

function mirrorCharacters(levels, start, end) {
  let changed = false;
  for (let i = start; i < end; ++i) {
    if (!isOdd(levels[i])) {
      continue;
    }
    const mirrored = getMirroredChar(chars[i]);
    if (mirrored) {
      chars[i] = mirrored;
      changed = true;
    }
  }
  return changed;
}

function createBidiText(str, isLTR, vertical = false) {
  let dir = "ltr";
  if (vertical) {
    dir = "ttb";
  } else if (!isLTR) {
    dir = "rtl";
  }
  return { str, dir };
}

// These are used in bidi(), which is called frequently. We re-use them on
// each call to avoid unnecessary allocations.
const chars = [];
const types = [];
const glyphTexts = [];

/**
 * @param {string|Array<string|{unicode: string, isUnicodeVisual: boolean}>}
 *   text - Text to reorder, or glyphs in visual order. Each glyph's text is
 *   kept intact if all its characters resolve to the same bidi level. A string
 *   is mirrored as visual text, a glyph only with `isUnicodeVisual`.
 * @param {number} startLevel - The paragraph level, or -1 to infer it.
 * @param {boolean} vertical - Whether the text runs from top to bottom.
 * @param {Function} [onMirror] - Receives a mirrored glyph object and its
 *   updated Unicode text.
 */
function bidi(text, startLevel = -1, vertical = false, onMirror = null) {
  let isLTR = true;
  const glyphs = Array.isArray(text) ? text : null;
  let str = text;
  if (glyphs) {
    const ii = glyphs.length;
    glyphTexts.length = ii;
    for (let i = 0; i < ii; i++) {
      glyphTexts[i] = glyphs[i].unicode ?? glyphs[i];
    }
    str = glyphTexts.join("");
  }
  const strLength = str.length;
  if (strLength === 0 || vertical) {
    return createBidiText(str, isLTR, vertical);
  }

  // Get types and fill arrays
  chars.length = strLength;
  types.length = strLength;
  let numBidi = 0;
  let numChars = strLength;

  let i, ii;
  if (!bmpClasses) {
    initBidiClasses();
  }
  for (i = 0; i < strLength; ++i) {
    const charCode = str.codePointAt(i);
    const charType = getBidiClass(charCode);
    if (charType === "R" || charType === "AL" || charType === "AN") {
      numBidi++;
    }
    types[i] = charType;
    if (charCode > 0xffff) {
      // Keep the surrogate pair together, the empty slot preserves indices.
      chars[i] = str.slice(i, i + 2);
      chars[++i] = "";
      types[i] = charType;
      numChars--;
    } else {
      chars[i] = str.charAt(i);
    }
  }

  // Detect the bidi method
  // - If there are no rtl characters then no bidi needed
  // - If less than 30% chars are rtl then string is primarily ltr,
  //   unless the string is very short.
  // - If more than 30% chars are rtl then string is primarily rtl
  if (numBidi === 0) {
    isLTR = true;
    return createBidiText(str, isLTR);
  }

  if (startLevel === -1) {
    if (numBidi / numChars < 0.3 && numChars > 4) {
      isLTR = true;
      startLevel = 0;
    } else {
      isLTR = false;
      startLevel = 1;
    }
  }
  const levels = new Array(strLength).fill(startLevel);

  /*
   X1-X10: skip most of this, since we are NOT doing the embeddings.
   */
  const e = isOdd(startLevel) ? "R" : "L";
  const sor = e;
  const eor = sor;

  /*
   W1. Examine each non-spacing mark (NSM) in the level run, and change the
   type of the NSM to the type of the previous character. If the NSM is at the
   start of the level run, it will get the type of sor.
   */
  let lastType = sor;
  for (i = 0; i < strLength; ++i) {
    if (types[i] === "NSM") {
      types[i] = lastType;
    } else {
      lastType = types[i];
    }
  }

  /*
   W2. Search backwards from each instance of a European number until the
   first strong type (R, L, AL, or sor) is found.  If an AL is found, change
   the type of the European number to Arabic number.
   */
  lastType = sor;
  let t;
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === "EN") {
      types[i] = lastType === "AL" ? "AN" : "EN";
    } else if (t === "R" || t === "L" || t === "AL") {
      lastType = t;
    }
  }

  /*
   W3. Change all ALs to R.
   */
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === "AL") {
      types[i] = "R";
    }
  }

  /*
   W4. A single European separator between two European numbers changes to a
   European number. A single common separator between two numbers of the same
   type changes to that type:
   */
  for (i = 1; i < strLength - 1; ++i) {
    if (types[i] === "ES" && types[i - 1] === "EN" && types[i + 1] === "EN") {
      types[i] = "EN";
    }
    if (
      types[i] === "CS" &&
      (types[i - 1] === "EN" || types[i - 1] === "AN") &&
      types[i + 1] === types[i - 1]
    ) {
      types[i] = types[i - 1];
    }
  }

  /*
   W5. A sequence of European terminators adjacent to European numbers changes
   to all European numbers:
   */
  for (i = 0; i < strLength; ++i) {
    if (types[i] === "EN") {
      // do before
      for (let j = i - 1; j >= 0; --j) {
        if (types[j] !== "ET") {
          break;
        }
        types[j] = "EN";
      }
      // do after
      for (let j = i + 1; j < strLength; ++j) {
        if (types[j] !== "ET") {
          break;
        }
        types[j] = "EN";
      }
    }
  }

  /*
   W6. Otherwise, separators and terminators change to Other Neutral:
   */
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === "WS" || t === "ES" || t === "ET" || t === "CS") {
      types[i] = "ON";
    }
  }

  /*
   W7. Search backwards from each instance of a European number until the
   first strong type (R, L, or sor) is found. If an L is found,  then change
   the type of the European number to L.
   */
  lastType = sor;
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === "EN") {
      types[i] = lastType === "L" ? "L" : "EN";
    } else if (t === "R" || t === "L") {
      lastType = t;
    }
  }

  /*
   N1. A sequence of neutrals takes the direction of the surrounding strong
   text if the text on both sides has the same direction. European and Arabic
   numbers are treated as though they were R. Start-of-level-run (sor) and
   end-of-level-run (eor) are used at level run boundaries.
   See https://www.unicode.org/reports/tr9/tr9-48.html#N1
   */
  for (i = 0; i < strLength; ++i) {
    if (types[i] === "ON") {
      const end = findUnequal(types, i + 1, "ON");

      // Scan left past non-strong types to find the nearest strong context
      // (L, R, EN, or AN), falling back to sor at the level-run boundary.
      let before = sor;
      for (let j = i - 1; j >= 0; j--) {
        const tt = types[j];
        if (tt === "L") {
          before = "L";
          break;
        }
        if (tt === "R" || tt === "EN" || tt === "AN") {
          before = "R";
          break;
        }
      }

      // Scan right past non-strong types to find the nearest strong context,
      // falling back to eor at the level-run boundary.
      let after = eor;
      for (let j = end; j < strLength; j++) {
        const tt = types[j];
        if (tt === "L") {
          after = "L";
          break;
        }
        if (tt === "R" || tt === "EN" || tt === "AN") {
          after = "R";
          break;
        }
      }

      if (before === after) {
        types.fill(before, i, end);
      }
      i = end - 1; // reset to end (-1 so next iteration is ok)
    }
  }

  /*
   N2. Any remaining neutrals take the embedding direction.
   */
  for (i = 0; i < strLength; ++i) {
    if (types[i] === "ON") {
      types[i] = e;
    }
  }

  /*
   I1. For all characters with an even (left-to-right) embedding direction,
   those of type R go up one level and those of type AN or EN go up two
   levels.
   I2. For all characters with an odd (right-to-left) embedding direction,
   those of type L, EN or AN go up one level.
   */
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (isEven(levels[i])) {
      if (t === "R") {
        levels[i] += 1;
      } else if (t === "AN" || t === "EN") {
        levels[i] += 2;
      }
    } else if (/* isOdd && */ t === "L" || t === "AN" || t === "EN") {
      levels[i] += 1;
    }
  }

  /*
   L1. On each line, reset the embedding level of the following characters to
   the paragraph embedding level:

   segment separators,
   paragraph separators,
   any sequence of whitespace characters preceding a segment separator or
   paragraph separator, and any sequence of white space characters at the end
   of the line.
   */

  // don't bother as text is only single line

  /*
   L2. From the highest level found in the text to the lowest odd level on
   each line, reverse any contiguous sequence of characters that are at that
   level or higher.
   */

  // find highest level & lowest odd level
  let highestLevel = -1;
  let lowestOddLevel = 99;
  let level;
  for (i = 0, ii = levels.length; i < ii; ++i) {
    level = levels[i];
    if (highestLevel < level) {
      highestLevel = level;
    }
    if (lowestOddLevel > level && isOdd(level)) {
      lowestOddLevel = level;
    }
  }

  if (glyphs) {
    let pos = 0;
    for (const glyph of glyphs) {
      const { unicode = glyph, isUnicodeVisual } = glyph;
      const end = pos + unicode.length;
      if (
        unicode.length > 1 &&
        findUnequal(levels, pos + 1, levels[pos], end) === end
      ) {
        // Store the whole glyph in one slot. Empty strings in the remaining
        // slots preserve the indices used by the character levels.
        chars[pos] = unicode;
        chars.fill("", pos + 1, end);
      }
      // Undo L4 for the glyphs whose Unicode is the shape's character.
      if (isUnicodeVisual && mirrorCharacters(levels, pos, end) && onMirror) {
        onMirror(glyph, chars.slice(pos, end).join(""));
      }
      pos = end;
    }
  } else {
    mirrorCharacters(levels, 0, strLength);
  }

  // now reverse between those limits
  for (level = highestLevel; level >= lowestOddLevel; --level) {
    // find segments to reverse
    let start = -1;
    for (i = 0, ii = levels.length; i < ii; ++i) {
      if (levels[i] < level) {
        if (start >= 0) {
          reverseValues(chars, start, i);
          start = -1;
        }
      } else if (start < 0) {
        start = i;
      }
    }
    if (start >= 0) {
      reverseValues(chars, start, levels.length);
    }
  }

  /*
   L3. Combining marks applied to a right-to-left base character will at this
   point precede their base character. If the rendering engine expects them to
   follow the base characters in the final display process, then the ordering
   of the marks and the base character must be reversed.
   */

  // don't bother for now

  // Finally, return string
  return createBidiText(chars.join(""), isLTR);
}

export { bidi, getMirroredChar };
