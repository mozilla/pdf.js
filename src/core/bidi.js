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

import { warn } from "../shared/util.js";

// Character types for symbols from 0000 to 00FF.
// Source: ftp://ftp.unicode.org/Public/UNIDATA/UnicodeData.txt
// prettier-ignore
const baseTypes = [
  "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "S", "B", "S",
  "WS", "B", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN",
  "BN", "BN", "BN", "BN", "B", "B", "B", "S", "WS", "ON", "ON", "ET",
  "ET", "ET", "ON", "ON", "ON", "ON", "ON", "ES", "CS", "ES", "CS", "CS",
  "EN", "EN", "EN", "EN", "EN", "EN", "EN", "EN", "EN", "EN", "CS", "ON",
  "ON", "ON", "ON", "ON", "ON", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "ON", "ON", "ON", "ON", "ON", "ON", "L", "L", "L",
  "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "L", "L", "L", "L", "L", "ON", "ON", "ON", "ON",
  "BN", "BN", "BN", "BN", "BN", "BN", "B", "BN", "BN", "BN", "BN", "BN",
  "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN",
  "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "CS", "ON", "ET",
  "ET", "ET", "ET", "ON", "ON", "ON", "ON", "L", "ON", "ON", "BN", "ON",
  "ON", "ET", "ET", "EN", "EN", "ON", "L", "ON", "ON", "ON", "EN", "L",
  "ON", "ON", "ON", "ON", "ON", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "ON", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L", "L",
  "L", "L", "L", "L", "L", "ON", "L", "L", "L", "L", "L", "L", "L", "L"
];

// Character types for symbols from 0600 to 06FF.
// Source: ftp://ftp.unicode.org/Public/UNIDATA/UnicodeData.txt
// Note that 061D does not exist in the Unicode standard (see
// http://unicode.org/charts/PDF/U0600.pdf), so we replace it with an
// empty string and issue a warning if we encounter this character. The
// empty string is required to properly index the items after it.
// prettier-ignore
const arabicTypes = [
  "AN", "AN", "AN", "AN", "AN", "AN", "ON", "ON", "AL", "ET", "ET", "AL",
  "CS", "AL", "ON", "ON", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM",
  "NSM", "NSM", "NSM", "NSM", "AL", "AL", "", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM",
  "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM",
  "NSM", "NSM", "NSM", "NSM", "AN", "AN", "AN", "AN", "AN", "AN", "AN",
  "AN", "AN", "AN", "ET", "AN", "AN", "AL", "AL", "AL", "NSM", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL", "AL",
  "AL", "AL", "AL", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "AN",
  "ON", "NSM", "NSM", "NSM", "NSM", "NSM", "NSM", "AL", "AL", "NSM", "NSM",
  "ON", "NSM", "NSM", "NSM", "NSM", "AL", "AL", "EN", "EN", "EN", "EN",
  "EN", "EN", "EN", "EN", "EN", "EN", "AL", "AL", "AL", "AL", "AL", "AL"
];

function isOdd(i) {
  return (i & 1) !== 0;
}

function isEven(i) {
  return (i & 1) === 0;
}

function findUnequal(arr, start, value) {
  let j, jj;
  for (j = start, jj = arr.length; j < jj; ++j) {
    if (arr[j] !== value) {
      return j;
    }
  }
  return j;
}

function reverseValues(arr, start, end) {
  for (let i = start, j = end - 1; i < j; ++i, --j) {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
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

function bidi(str, startLevel = -1, vertical = false) {
  let isLTR = true;
  const strLength = str.length;
  if (strLength === 0 || vertical) {
    return createBidiText(str, isLTR, vertical);
  }

  // Get types and fill arrays
  chars.length = strLength;
  types.length = strLength;
  let numBidi = 0;

  let i, ii;
  for (i = 0; i < strLength; ++i) {
    chars[i] = str.charAt(i);

    const charCode = str.charCodeAt(i);
    let charType = "L";
    if (charCode <= 0x00ff) {
      charType = baseTypes[charCode];
    } else if (0x0590 <= charCode && charCode <= 0x05f4) {
      charType = "R";
    } else if (0x0600 <= charCode && charCode <= 0x06ff) {
      charType = arabicTypes[charCode & 0xff];
      if (!charType) {
        warn("Bidi: invalid Unicode character " + charCode.toString(16));
      }
    } else if (
      (0x0700 <= charCode && charCode <= 0x08ac) ||
      (0xfb50 <= charCode && charCode <= 0xfdff) ||
      (0xfe70 <= charCode && charCode <= 0xfeff)
    ) {
      charType = "AL";
    }
    if (charType === "R" || charType === "AL" || charType === "AN") {
      numBidi++;
    }
    types[i] = charType;
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
    // Improved base direction detection for consistent Hebrew text rendering
    // This fixes issue #20336 where Hebrew text renders inconsistently across contexts
    
    let hasStrongRTL = false;
    let hasStrongLTR = false;
    
    // Scan for strong directional characters
    for (let j = 0; j < strLength; j++) {
      const type = types[j];
      if (type === "R" || type === "AL") {
        hasStrongRTL = true;
      } else if (type === "L") {
        hasStrongLTR = true;
      }
      
      // Early termination if we found both types
      if (hasStrongRTL && hasStrongLTR) break;
    }
    
    if (hasStrongRTL && !hasStrongLTR) {
      // Pure RTL content (like pure Hebrew)
      startLevel = 1;
      isLTR = false;
    } else if (!hasStrongRTL && hasStrongLTR) {
      // Pure LTR content
      startLevel = 0;
      isLTR = true;
    } else {
      // Mixed content - use improved heuristic
      // For mixed content, if RTL characters form a significant portion
      // or if the string is short, treat as RTL to preserve RTL text integrity
      if (numBidi / strLength >= 0.3 || strLength <= 4) {
        startLevel = 1; // RTL
        isLTR = false;
      } else {
        // For mixed content with low RTL percentage, still use LTR base
        // but the RTL segments will be properly handled by the algorithm
        startLevel = 0; // LTR
        isLTR = true;
      }
    }
  }

  const levels = [];
  for (i = 0; i < strLength; ++i) {
    levels[i] = startLevel;
  }

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
   */
  for (i = 0; i < strLength; ++i) {
    if (types[i] === "ON") {
      const end = findUnequal(types, i + 1, "ON");
      let before = sor;
      if (i > 0) {
        before = types[i - 1];
      }

      let after = eor;
      if (end + 1 < strLength) {
        after = types[end + 1];
      }
      if (before !== "L") {
        before = "R";
      }
      if (after !== "L") {
        after = "R";
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

  /*
   L4. A character that possesses the mirrored property as specified by
   Section 4.7, Mirrored, must be depicted by a mirrored glyph if the resolved
   directionality of that character is R.
   */

  // don't mirror as characters are already mirrored in the pdf

  // Finally, return string
  for (i = 0, ii = chars.length; i < ii; ++i) {
    const ch = chars[i];
    if (ch === "<" || ch === ">") {
      chars[i] = "";
    }
  }
  return createBidiText(chars.join(""), isLTR);
}

export { bidi };
