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

/** @typedef {import("../src/display/api").PDFDocumentProxy} PDFDocumentProxy */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */

import { binarySearchFirstItem, scrollIntoView } from "./ui_utils.js";
import { getCharacterType, getNormalizeWithNFKC } from "./pdf_find_utils.js";

const FindState = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
};

const FIND_TIMEOUT = 250; // ms
const MATCH_SCROLL_OFFSET_TOP = -50; // px
const MATCH_SCROLL_OFFSET_LEFT = -400; // px

const CHARACTERS_TO_NORMALIZE = {
  "\u2010": "-", // Hyphen
  "\u2018": "'", // Left single quotation mark
  "\u2019": "'", // Right single quotation mark
  "\u201A": "'", // Single low-9 quotation mark
  "\u201B": "'", // Single high-reversed-9 quotation mark
  "\u201C": '"', // Left double quotation mark
  "\u201D": '"', // Right double quotation mark
  "\u201E": '"', // Double low-9 quotation mark
  "\u201F": '"', // Double high-reversed-9 quotation mark
  "\u00BC": "1/4", // Vulgar fraction one quarter
  "\u00BD": "1/2", // Vulgar fraction one half
  "\u00BE": "3/4", // Vulgar fraction three quarters
};

// These diacritics aren't considered as combining diacritics
// when searching in a document:
//   https://searchfox.org/mozilla-central/source/intl/unicharutil/util/is_combining_diacritic.py.
// The combining class definitions can be found:
//   https://www.unicode.org/reports/tr44/#Canonical_Combining_Class_Values
// Category 0 corresponds to [^\p{Mn}].
const DIACRITICS_EXCEPTION = new Set([
  // UNICODE_COMBINING_CLASS_KANA_VOICING
  // https://www.compart.com/fr/unicode/combining/8
  0x3099, 0x309a,
  // UNICODE_COMBINING_CLASS_VIRAMA (under 0xFFFF)
  // https://www.compart.com/fr/unicode/combining/9
  0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d3b,
  0x0d3c, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba, 0x0f84, 0x1039, 0x103a, 0x1714,
  0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2, 0x1bf3, 0x2d7f,
  0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed,
  // 91
  // https://www.compart.com/fr/unicode/combining/91
  0x0c56,
  // 129
  // https://www.compart.com/fr/unicode/combining/129
  0x0f71,
  // 130
  // https://www.compart.com/fr/unicode/combining/130
  0x0f72, 0x0f7a, 0x0f7b, 0x0f7c, 0x0f7d, 0x0f80,
  // 132
  // https://www.compart.com/fr/unicode/combining/132
  0x0f74,
]);
let DIACRITICS_EXCEPTION_STR; // Lazily initialized, see below.

const DIACRITICS_REG_EXP = /\p{M}+/gu;
const SPECIAL_CHARS_REG_EXP =
  /([.*+?^${}()|[\]\\])|(\p{P})|(\s+)|(\p{M})|(\p{L})/gu;
const NOT_DIACRITIC_FROM_END_REG_EXP = /([^\p{M}])\p{M}*$/u;
const NOT_DIACRITIC_FROM_START_REG_EXP = /^\p{M}*([^\p{M}])/u;

// The range [AC00-D7AF] corresponds to the Hangul syllables.
// The few other chars are some CJK Compatibility Ideographs.
const SYLLABLES_REG_EXP = /[\uAC00-\uD7AF\uFA6C\uFACF-\uFAD1\uFAD5-\uFAD7]+/g;
const SYLLABLES_LENGTHS = new Map();
// When decomposed (in using NFD) the above syllables will start
// with one of the chars in this regexp.
const FIRST_CHAR_SYLLABLES_REG_EXP =
  "[\\u1100-\\u1112\\ud7a4-\\ud7af\\ud84a\\ud84c\\ud850\\ud854\\ud857\\ud85f]";

const NFKC_CHARS_TO_NORMALIZE = new Map();

let noSyllablesRegExp = null;
let withSyllablesRegExp = null;

function normalize(text) {
  // The diacritics in the text or in the query can be composed or not.
  // So we use a decomposed text using NFD (and the same for the query)
  // in order to be sure that diacritics are in the same order.

  // Collect syllables length and positions.
  const syllablePositions = [];
  let m;
  while ((m = SYLLABLES_REG_EXP.exec(text)) !== null) {
    let { index } = m;
    for (const char of m[0]) {
      let len = SYLLABLES_LENGTHS.get(char);
      if (!len) {
        len = char.normalize("NFD").length;
        SYLLABLES_LENGTHS.set(char, len);
      }
      syllablePositions.push([len, index++]);
    }
  }

  const hasSyllables = syllablePositions.length > 0;

  let normalizationRegex;
  if (!hasSyllables && noSyllablesRegExp) {
    normalizationRegex = noSyllablesRegExp;
  } else if (hasSyllables && withSyllablesRegExp) {
    normalizationRegex = withSyllablesRegExp;
  } else {
    // Compile the regular expression for text normalization once.
    const replace = Object.keys(CHARACTERS_TO_NORMALIZE).join("");
    const toNormalizeWithNFKC = getNormalizeWithNFKC();

    // 3040-309F: Hiragana
    // 30A0-30FF: Katakana
    const CJK = "(?:\\p{Ideographic}|[\u3040-\u30FF])";
    const HKDiacritics = "(?:\u3099|\u309A)";
    const BrokenWord = `\\p{Ll}-\\n(?=\\p{Ll})|\\p{Lu}-\\n(?=\\p{L})`;

    const regexps = [
      /* p1 */ `[${replace}]`,
      /* p2 */ `[${toNormalizeWithNFKC}]`,
      /* p3 */ `${HKDiacritics}\\n`,
      /* p4 */ "\\p{M}+(?:-\\n)?",
      /* p5 */ `${BrokenWord}`,
      /* p6 */ "\\S-\\n",
      /* p7 */ `${CJK}\\n`,
      /* p8 */ "\\n",
      /* p9 */ hasSyllables
        ? FIRST_CHAR_SYLLABLES_REG_EXP
        : // Most of the syllables belong to Hangul so there are no need
          // to search for them in a non-Hangul document.
          // We use the \0 in order to have the same number of groups.
          "\\u0000",
    ];
    normalizationRegex = new RegExp(
      regexps.map(r => `(${r})`).join("|"),
      "gum"
    );

    if (hasSyllables) {
      withSyllablesRegExp = normalizationRegex;
    } else {
      noSyllablesRegExp = normalizationRegex;
    }
  }

  // The goal of this function is to normalize the string and
  // be able to get from an index in the new string the
  // corresponding index in the old string.
  // For example if we have: abCd12ef456gh where C is replaced by ccc
  // and numbers replaced by nothing (it's the case for diacritics), then
  // we'll obtain the normalized string: abcccdefgh.
  // So here the reverse map is: [0,1,2,2,2,3,6,7,11,12].

  // The goal is to obtain the array: [[0, 0], [3, -1], [4, -2],
  // [6, 0], [8, 3]].
  // which can be used like this:
  //  - let say that i is the index in new string and j the index
  //    the old string.
  //  - if i is in [0; 3[ then j = i + 0
  //  - if i is in [3; 4[ then j = i - 1
  //  - if i is in [4; 6[ then j = i - 2
  //  ...
  // Thanks to a binary search it's easy to know where is i and what's the
  // shift.
  // Let say that the last entry in the array is [x, s] and we have a
  // substitution at index y (old string) which will replace o chars by n chars.
  // Firstly, if o === n, then no need to add a new entry: the shift is
  // the same.
  // Secondly, if o < n, then we push the n - o elements:
  // [y - (s - 1), s - 1], [y - (s - 2), s - 2], ...
  // Thirdly, if o > n, then we push the element: [y - (s - n), o + s - n]

  // Collect diacritics length and positions.
  const rawDiacriticsPositions = [];
  while ((m = DIACRITICS_REG_EXP.exec(text)) !== null) {
    rawDiacriticsPositions.push([m[0].length, m.index]);
  }

  let normalized = text.normalize("NFD");
  const positions = [0, 0];
  let rawDiacriticsIndex = 0;
  let syllableIndex = 0;
  let shift = 0;
  let shiftOrigin = 0;
  let eol = 0;
  let hasDiacritics = false;

  normalized = normalized.replace(
    normalizationRegex,
    (match, p1, p2, p3, p4, p5, p6, p7, p8, p9, i) => {
      i -= shiftOrigin;
      if (p1) {
        // Maybe fractions or quotations mark...
        const replacement = CHARACTERS_TO_NORMALIZE[p1];
        const jj = replacement.length;
        for (let j = 1; j < jj; j++) {
          positions.push(i - shift + j, shift - j);
        }
        shift -= jj - 1;
        return replacement;
      }

      if (p2) {
        // Use the NFKC representation to normalize the char.
        let replacement = NFKC_CHARS_TO_NORMALIZE.get(p2);
        if (!replacement) {
          replacement = p2.normalize("NFKC");
          NFKC_CHARS_TO_NORMALIZE.set(p2, replacement);
        }
        const jj = replacement.length;
        for (let j = 1; j < jj; j++) {
          positions.push(i - shift + j, shift - j);
        }
        shift -= jj - 1;
        return replacement;
      }

      if (p3) {
        // We've a Katakana-Hiragana diacritic followed by a \n so don't replace
        // the \n by a whitespace.
        hasDiacritics = true;

        // Diacritic.
        if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
          ++rawDiacriticsIndex;
        } else {
          // i is the position of the first diacritic
          // so (i - 1) is the position for the letter before.
          positions.push(i - 1 - shift + 1, shift - 1);
          shift -= 1;
          shiftOrigin += 1;
        }

        // End-of-line.
        positions.push(i - shift + 1, shift);
        shiftOrigin += 1;
        eol += 1;

        return p3.charAt(0);
      }

      if (p4) {
        const hasTrailingDashEOL = p4.endsWith("\n");
        const len = hasTrailingDashEOL ? p4.length - 2 : p4.length;

        // Diacritics.
        hasDiacritics = true;
        let jj = len;
        if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
          jj -= rawDiacriticsPositions[rawDiacriticsIndex][0];
          ++rawDiacriticsIndex;
        }

        for (let j = 1; j <= jj; j++) {
          // i is the position of the first diacritic
          // so (i - 1) is the position for the letter before.
          positions.push(i - 1 - shift + j, shift - j);
        }
        shift -= jj;
        shiftOrigin += jj;

        if (hasTrailingDashEOL) {
          // Diacritics are followed by a -\n.
          // See comments in `if (p6)` block.
          i += len - 1;
          positions.push(i - shift + 1, 1 + shift);
          shift += 1;
          shiftOrigin += 1;
          eol += 1;
          return p4.slice(0, len);
        }

        return p4;
      }

      if (p5) {
        // In "X-\ny", "-\n" is removed because an hyphen at the end of a line
        // between two letters is likely here to mark a break in a word.
        // If X is encoded with UTF-32 then it can have a length greater than 1.
        // The \n isn't in the original text so here y = i, n = X.len - 2 and
        // o = X.len - 1.
        const len = p5.length - 2;
        positions.push(i - shift + len, 1 + shift);
        shift += 1;
        shiftOrigin += 1;
        eol += 1;
        return p5.slice(0, -2);
      }

      if (p6) {
        // A - following a non-space character that is not detected as the
        // hyphen breaking a word in two lines needs to be preserved. It could
        // be, for example, in a compound word or in a date.
        // Only remove the newline.
        shiftOrigin += 1;
        eol += 1;
        return p6.slice(0, -1);
      }

      if (p7) {
        // An ideographic at the end of a line doesn't imply adding an extra
        // white space.
        // A CJK can be encoded in UTF-32, hence their length isn't always 1.
        const len = p7.length - 1;
        positions.push(i - shift + len, shift);
        shiftOrigin += 1;
        eol += 1;
        return p7.slice(0, -1);
      }

      if (p8) {
        // eol is replaced by space: "foo\nbar" is likely equivalent to
        // "foo bar".
        positions.push(i - shift + 1, shift - 1);
        shift -= 1;
        shiftOrigin += 1;
        eol += 1;
        return " ";
      }

      // p9
      if (i + eol === syllablePositions[syllableIndex]?.[1]) {
        // A syllable (1 char) is replaced with several chars (n) so
        // newCharsLen = n - 1.
        const newCharLen = syllablePositions[syllableIndex][0] - 1;
        ++syllableIndex;
        for (let j = 1; j <= newCharLen; j++) {
          positions.push(i - (shift - j), shift - j);
        }
        shift -= newCharLen;
        shiftOrigin += newCharLen;
      }
      return p9;
    }
  );

  positions.push(normalized.length, shift);
  const starts = new Uint32Array(positions.length >> 1);
  const shifts = new Int32Array(positions.length >> 1);
  for (let i = 0, ii = positions.length; i < ii; i += 2) {
    starts[i >> 1] = positions[i];
    shifts[i >> 1] = positions[i + 1];
  }

  return [normalized, [starts, shifts], hasDiacritics];
}

// Determine the original, non-normalized, match index such that highlighting of
// search results is correct in the `textLayer` for strings containing e.g. "½"
// characters; essentially "inverting" the result of the `normalize` function.
function getOriginalIndex(diffs, pos, len) {
  if (!diffs) {
    return [pos, len];
  }

  const [starts, shifts] = diffs;
  // First char in the new string.
  const start = pos;
  // Last char in the new string.
  const end = pos + len - 1;
  let i = binarySearchFirstItem(starts, x => x >= start);
  if (starts[i] > start) {
    --i;
  }

  let j = binarySearchFirstItem(starts, x => x >= end, i);
  if (starts[j] > end) {
    --j;
  }

  // First char in the old string.
  const oldStart = start + shifts[i];

  // Last char in the old string.
  const oldEnd = end + shifts[j];
  const oldLen = oldEnd + 1 - oldStart;

  return [oldStart, oldLen];
}

/**
 * @typedef {Object} PDFFindControllerOptions
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {EventBus} eventBus - The application event bus.
 * @property {boolean} [updateMatchesCountOnProgress] - True if the matches
 *   count must be updated on progress or only when the last page is reached.
 *   The default value is `true`.
 */

/**
 * Provides search functionality to find a given string in a PDF document.
 */
class PDFFindController {
  #state = null;

  #updateMatchesCountOnProgress = true;

  #visitedPagesCount = 0;

  /**
   * @param {PDFFindControllerOptions} options
   */
  constructor({ linkService, eventBus, updateMatchesCountOnProgress = true }) {
    this._linkService = linkService;
    this._eventBus = eventBus;
    this.#updateMatchesCountOnProgress = updateMatchesCountOnProgress;

    /**
     * Callback used to check if a `pageNumber` is currently visible.
     * @type {function}
     */
    this.onIsPageVisible = null;

    this.#reset();
    eventBus._on("find", this.#onFind.bind(this));
    eventBus._on("findbarclose", this.#onFindBarClose.bind(this));
  }

  get highlightMatches() {
    return this._highlightMatches;
  }

  get pageMatches() {
    return this._pageMatches;
  }

  get pageMatchesLength() {
    return this._pageMatchesLength;
  }

  get selected() {
    return this._selected;
  }

  get state() {
    return this.#state;
  }

  /**
   * Set a reference to the PDF document in order to search it.
   * Note that searching is not possible if this method is not called.
   *
   * @param {PDFDocumentProxy} pdfDocument - The PDF document to search.
   */
  setDocument(pdfDocument) {
    if (this._pdfDocument) {
      this.#reset();
    }
    if (!pdfDocument) {
      return;
    }
    this._pdfDocument = pdfDocument;
    this._firstPageCapability.resolve();
  }

  #onFind(state) {
    if (!state) {
      return;
    }
    const pdfDocument = this._pdfDocument;
    const { type } = state;

    if (this.#state === null || this.#shouldDirtyMatch(state)) {
      this._dirtyMatch = true;
    }
    this.#state = state;
    if (type !== "highlightallchange") {
      this.#updateUIState(FindState.PENDING);
    }

    this._firstPageCapability.promise.then(() => {
      // If the document was closed before searching began, or if the search
      // operation was relevant for a previously opened document, do nothing.
      if (
        !this._pdfDocument ||
        (pdfDocument && this._pdfDocument !== pdfDocument)
      ) {
        return;
      }
      this.#extractText();

      const findbarClosed = !this._highlightMatches;
      const pendingTimeout = !!this._findTimeout;

      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }
      if (!type) {
        // Trigger the find action with a small delay to avoid starting the
        // search when the user is still typing (saving resources).
        this._findTimeout = setTimeout(() => {
          this.#nextMatch();
          this._findTimeout = null;
        }, FIND_TIMEOUT);
      } else if (this._dirtyMatch) {
        // Immediately trigger searching for non-'find' operations, when the
        // current state needs to be reset and matches re-calculated.
        this.#nextMatch();
      } else if (type === "again") {
        this.#nextMatch();

        // When the findbar was previously closed, and `highlightAll` is set,
        // ensure that the matches on all active pages are highlighted again.
        if (findbarClosed && this.#state.highlightAll) {
          this.#updateAllPages();
        }
      } else if (type === "highlightallchange") {
        // If there was a pending search operation, synchronously trigger a new
        // search *first* to ensure that the correct matches are highlighted.
        if (pendingTimeout) {
          this.#nextMatch();
        } else {
          this._highlightMatches = true;
        }
        this.#updateAllPages(); // Update the highlighting on all active pages.
      } else {
        this.#nextMatch();
      }
    });
  }

  /**
   * @typedef {Object} PDFFindControllerScrollMatchIntoViewParams
   * @property {HTMLElement} element
   * @property {number} selectedLeft
   * @property {number} pageIndex
   * @property {number} matchIndex
   */

  /**
   * Scroll the current match into view.
   * @param {PDFFindControllerScrollMatchIntoViewParams}
   */
  scrollMatchIntoView({
    element = null,
    selectedLeft = 0,
    pageIndex = -1,
    matchIndex = -1,
  }) {
    if (!this._scrollMatches || !element) {
      return;
    } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
      return;
    } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
      return;
    }
    this._scrollMatches = false; // Ensure that scrolling only happens once.

    const spot = {
      top: MATCH_SCROLL_OFFSET_TOP,
      left: selectedLeft + MATCH_SCROLL_OFFSET_LEFT,
    };
    scrollIntoView(element, spot, /* scrollMatches = */ true);
  }

  #reset() {
    this._highlightMatches = false;
    this._scrollMatches = false;
    this._pdfDocument = null;
    this._pageMatches = [];
    this._pageMatchesLength = [];
    this.#visitedPagesCount = 0;
    this.#state = null;
    // Currently selected match.
    this._selected = {
      pageIdx: -1,
      matchIdx: -1,
    };
    // Where the find algorithm currently is in the document.
    this._offset = {
      pageIdx: null,
      matchIdx: null,
      wrapped: false,
    };
    this._extractTextPromises = [];
    this._pageContents = []; // Stores the normalized text for each page.
    this._pageDiffs = [];
    this._hasDiacritics = [];
    this._matchesCountTotal = 0;
    this._pagesToSearch = null;
    this._pendingFindMatches = new Set();
    this._resumePageIdx = null;
    this._dirtyMatch = false;
    clearTimeout(this._findTimeout);
    this._findTimeout = null;

    this._firstPageCapability = Promise.withResolvers();
  }

  /**
   * @type {string|Array} The (current) normalized search query.
   */
  get #query() {
    const { query } = this.#state;
    if (typeof query === "string") {
      if (query !== this._rawQuery) {
        this._rawQuery = query;
        [this._normalizedQuery] = normalize(query);
      }
      return this._normalizedQuery;
    }
    // We don't bother caching the normalized search query in the Array-case,
    // since this code-path is *essentially* unused in the default viewer.
    return (query || []).filter(q => !!q).map(q => normalize(q)[0]);
  }

  #shouldDirtyMatch(state) {
    // When the search query changes, regardless of the actual search command
    // used, always re-calculate matches to avoid errors (fixes bug 1030622).
    const newQuery = state.query,
      prevQuery = this.#state.query;
    const newType = typeof newQuery,
      prevType = typeof prevQuery;

    if (newType !== prevType) {
      return true;
    }
    if (newType === "string") {
      if (newQuery !== prevQuery) {
        return true;
      }
    } else if (
      /* isArray && */ JSON.stringify(newQuery) !== JSON.stringify(prevQuery)
    ) {
      return true;
    }

    switch (state.type) {
      case "again":
        const pageNumber = this._selected.pageIdx + 1;
        const linkService = this._linkService;
        // Only treat a 'findagain' event as a new search operation when it's
        // *absolutely* certain that the currently selected match is no longer
        // visible, e.g. as a result of the user scrolling in the document.
        //
        // NOTE: If only a simple `this._linkService.page` check was used here,
        // there's a risk that consecutive 'findagain' operations could "skip"
        // over matches at the top/bottom of pages thus making them completely
        // inaccessible when there's multiple pages visible in the viewer.
        return (
          pageNumber >= 1 &&
          pageNumber <= linkService.pagesCount &&
          pageNumber !== linkService.page &&
          !(this.onIsPageVisible?.(pageNumber) ?? true)
        );
      case "highlightallchange":
        return false;
    }
    return true;
  }

  /**
   * Determine if the search query constitutes a "whole word", by comparing the
   * first/last character type with the preceding/following character type.
   */
  #isEntireWord(content, startIdx, length) {
    let match = content
      .slice(0, startIdx)
      .match(NOT_DIACRITIC_FROM_END_REG_EXP);
    if (match) {
      const first = content.charCodeAt(startIdx);
      const limit = match[1].charCodeAt(0);
      if (getCharacterType(first) === getCharacterType(limit)) {
        return false;
      }
    }

    match = content
      .slice(startIdx + length)
      .match(NOT_DIACRITIC_FROM_START_REG_EXP);
    if (match) {
      const last = content.charCodeAt(startIdx + length - 1);
      const limit = match[1].charCodeAt(0);
      if (getCharacterType(last) === getCharacterType(limit)) {
        return false;
      }
    }

    return true;
  }

  #convertToRegExpString(query, hasDiacritics) {
    const { matchDiacritics } = this.#state;
    let isUnicode = false;
    query = query.replaceAll(
      SPECIAL_CHARS_REG_EXP,
      (
        match,
        p1 /* to escape */,
        p2 /* punctuation */,
        p3 /* whitespaces */,
        p4 /* diacritics */,
        p5 /* letters */
      ) => {
        // We don't need to use a \s for whitespaces since all the different
        // kind of whitespaces are replaced by a single " ".

        if (p1) {
          // Escape characters like *+?... to not interfer with regexp syntax.
          return `[ ]*\\${p1}[ ]*`;
        }
        if (p2) {
          // Allow whitespaces around punctuation signs.
          return `[ ]*${p2}[ ]*`;
        }
        if (p3) {
          // Replace spaces by \s+ to be sure to match any spaces.
          return "[ ]+";
        }
        if (matchDiacritics) {
          return p4 || p5;
        }

        if (p4) {
          // Diacritics are removed with few exceptions.
          return DIACRITICS_EXCEPTION.has(p4.charCodeAt(0)) ? p4 : "";
        }

        // A letter has been matched and it can be followed by any diacritics
        // in normalized text.
        if (hasDiacritics) {
          isUnicode = true;
          return `${p5}\\p{M}*`;
        }
        return p5;
      }
    );

    const trailingSpaces = "[ ]*";
    if (query.endsWith(trailingSpaces)) {
      // The [ ]* has been added in order to help to match "foo . bar" but
      // it doesn't make sense to match some whitespaces after the dot
      // when it's the last character.
      query = query.slice(0, query.length - trailingSpaces.length);
    }

    if (matchDiacritics) {
      // aX must not match aXY.
      if (hasDiacritics) {
        DIACRITICS_EXCEPTION_STR ||= String.fromCharCode(
          ...DIACRITICS_EXCEPTION
        );

        isUnicode = true;
        query = `${query}(?=[${DIACRITICS_EXCEPTION_STR}]|[^\\p{M}]|$)`;
      }
    }

    return [isUnicode, query];
  }

  #calculateMatch(pageIndex) {
    const query = this.#query;
    if (query.length === 0) {
      return; // Do nothing: the matches should be wiped out already.
    }
    const pageContent = this._pageContents[pageIndex];
    const matcherResult = this.match(query, pageContent, pageIndex);

    const matches = (this._pageMatches[pageIndex] = []);
    const matchesLength = (this._pageMatchesLength[pageIndex] = []);
    const diffs = this._pageDiffs[pageIndex];

    matcherResult?.forEach(({ index, length }) => {
      const [matchPos, matchLen] = getOriginalIndex(diffs, index, length);
      if (matchLen) {
        matches.push(matchPos);
        matchesLength.push(matchLen);
      }
    });

    // When `highlightAll` is set, ensure that the matches on previously
    // rendered (and still active) pages are correctly highlighted.
    if (this.#state.highlightAll) {
      this.#updatePage(pageIndex);
    }
    if (this._resumePageIdx === pageIndex) {
      this._resumePageIdx = null;
      this.#nextPageMatch();
    }

    // Update the match count.
    const pageMatchesCount = matches.length;
    this._matchesCountTotal += pageMatchesCount;
    if (this.#updateMatchesCountOnProgress) {
      if (pageMatchesCount > 0) {
        this.#updateUIResultsCount();
      }
    } else if (++this.#visitedPagesCount === this._linkService.pagesCount) {
      // For example, in GeckoView we want to have only the final update because
      // the Java side provides only one object to update the counts.
      this.#updateUIResultsCount();
    }
  }

  /**
   * @typedef {Object} FindMatch
   * @property {number} index - The start of the matched text in the page's
   *   string contents.
   * @property {number} length - The length of the matched text.
   */

  /**
   * @param {string | string[]} query - The search query.
   * @param {string} pageContent - The text content of the page to search in.
   * @param {number} pageIndex - The index of the page that is being processed.
   * @returns {FindMatch[] | undefined} An array of matches in the provided
   *   page.
   */
  match(query, pageContent, pageIndex) {
    const hasDiacritics = this._hasDiacritics[pageIndex];

    let isUnicode = false;
    if (typeof query === "string") {
      [isUnicode, query] = this.#convertToRegExpString(query, hasDiacritics);
    } else {
      // Words are sorted in reverse order to be sure that "foobar" is matched
      // before "foo" in case the query is "foobar foo".
      query = query
        .sort()
        .reverse()
        .map(q => {
          const [isUnicodePart, queryPart] = this.#convertToRegExpString(
            q,
            hasDiacritics
          );
          isUnicode ||= isUnicodePart;
          return `(${queryPart})`;
        })
        .join("|");
    }
    if (!query) {
      // The query can be empty because some chars like diacritics could have
      // been stripped out.
      return undefined;
    }

    const { caseSensitive, entireWord } = this.#state;
    const flags = `g${isUnicode ? "u" : ""}${caseSensitive ? "" : "i"}`;
    query = new RegExp(query, flags);

    const matches = [];
    let match;
    while ((match = query.exec(pageContent)) !== null) {
      if (
        entireWord &&
        !this.#isEntireWord(pageContent, match.index, match[0].length)
      ) {
        continue;
      }
      matches.push({ index: match.index, length: match[0].length });
    }
    return matches;
  }

  #extractText() {
    // Perform text extraction once if this method is called multiple times.
    if (this._extractTextPromises.length > 0) {
      return;
    }

    let deferred = Promise.resolve();
    const textOptions = { disableNormalization: true };
    for (let i = 0, ii = this._linkService.pagesCount; i < ii; i++) {
      const { promise, resolve } = Promise.withResolvers();
      this._extractTextPromises[i] = promise;

      deferred = deferred.then(() =>
        this._pdfDocument
          .getPage(i + 1)
          .then(pdfPage => pdfPage.getTextContent(textOptions))
          .then(
            textContent => {
              const strBuf = [];

              for (const textItem of textContent.items) {
                strBuf.push(textItem.str);
                if (textItem.hasEOL) {
                  strBuf.push("\n");
                }
              }

              // Store the normalized page content (text items) as one string.
              [
                this._pageContents[i],
                this._pageDiffs[i],
                this._hasDiacritics[i],
              ] = normalize(strBuf.join(""));
              resolve();
            },
            reason => {
              console.error(
                `Unable to get text content for page ${i + 1}`,
                reason
              );
              // Page error -- assuming no text content.
              this._pageContents[i] = "";
              this._pageDiffs[i] = null;
              this._hasDiacritics[i] = false;
              resolve();
            }
          )
      );
    }
  }

  #updatePage(index) {
    if (this._scrollMatches && this._selected.pageIdx === index) {
      // If the page is selected, scroll the page into view, which triggers
      // rendering the page, which adds the text layer. Once the text layer
      // is built, it will attempt to scroll the selected match into view.
      this._linkService.page = index + 1;
    }

    this._eventBus.dispatch("updatetextlayermatches", {
      source: this,
      pageIndex: index,
    });
  }

  #updateAllPages() {
    this._eventBus.dispatch("updatetextlayermatches", {
      source: this,
      pageIndex: -1,
    });
  }

  #nextMatch() {
    const previous = this.#state.findPrevious;
    const currentPageIndex = this._linkService.page - 1;
    const numPages = this._linkService.pagesCount;

    this._highlightMatches = true;

    if (this._dirtyMatch) {
      // Need to recalculate the matches, reset everything.
      this._dirtyMatch = false;
      this._selected.pageIdx = this._selected.matchIdx = -1;
      this._offset.pageIdx = currentPageIndex;
      this._offset.matchIdx = null;
      this._offset.wrapped = false;
      this._resumePageIdx = null;
      this._pageMatches.length = 0;
      this._pageMatchesLength.length = 0;
      this.#visitedPagesCount = 0;
      this._matchesCountTotal = 0;

      this.#updateAllPages(); // Wipe out any previously highlighted matches.

      for (let i = 0; i < numPages; i++) {
        // Start finding the matches as soon as the text is extracted.
        if (this._pendingFindMatches.has(i)) {
          continue;
        }
        this._pendingFindMatches.add(i);
        this._extractTextPromises[i].then(() => {
          this._pendingFindMatches.delete(i);
          this.#calculateMatch(i);
        });
      }
    }

    // If there's no query there's no point in searching.
    const query = this.#query;
    if (query.length === 0) {
      this.#updateUIState(FindState.FOUND);
      return;
    }
    // If we're waiting on a page, we return since we can't do anything else.
    if (this._resumePageIdx) {
      return;
    }

    const offset = this._offset;
    // Keep track of how many pages we should maximally iterate through.
    this._pagesToSearch = numPages;
    // If there's already a `matchIdx` that means we are iterating through a
    // page's matches.
    if (offset.matchIdx !== null) {
      const numPageMatches = this._pageMatches[offset.pageIdx].length;
      if (
        (!previous && offset.matchIdx + 1 < numPageMatches) ||
        (previous && offset.matchIdx > 0)
      ) {
        // The simple case; we just have advance the matchIdx to select
        // the next match on the page.
        offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;
        this.#updateMatch(/* found = */ true);
        return;
      }
      // We went beyond the current page's matches, so we advance to
      // the next page.
      this.#advanceOffsetPage(previous);
    }
    // Start searching through the page.
    this.#nextPageMatch();
  }

  #matchesReady(matches) {
    const offset = this._offset;
    const numMatches = matches.length;
    const previous = this.#state.findPrevious;

    if (numMatches) {
      // There were matches for the page, so initialize `matchIdx`.
      offset.matchIdx = previous ? numMatches - 1 : 0;
      this.#updateMatch(/* found = */ true);
      return true;
    }
    // No matches, so attempt to search the next page.
    this.#advanceOffsetPage(previous);
    if (offset.wrapped) {
      offset.matchIdx = null;
      if (this._pagesToSearch < 0) {
        // No point in wrapping again, there were no matches.
        this.#updateMatch(/* found = */ false);
        // While matches were not found, searching for a page
        // with matches should nevertheless halt.
        return true;
      }
    }
    // Matches were not found (and searching is not done).
    return false;
  }

  #nextPageMatch() {
    if (this._resumePageIdx !== null) {
      console.error("There can only be one pending page.");
    }

    let matches = null;
    do {
      const pageIdx = this._offset.pageIdx;
      matches = this._pageMatches[pageIdx];
      if (!matches) {
        // The matches don't exist yet for processing by `_matchesReady`,
        // so set a resume point for when they do exist.
        this._resumePageIdx = pageIdx;
        break;
      }
    } while (!this.#matchesReady(matches));
  }

  #advanceOffsetPage(previous) {
    const offset = this._offset;
    const numPages = this._linkService.pagesCount;
    offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
    offset.matchIdx = null;

    this._pagesToSearch--;

    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = previous ? numPages - 1 : 0;
      offset.wrapped = true;
    }
  }

  #updateMatch(found = false) {
    let state = FindState.NOT_FOUND;
    const wrapped = this._offset.wrapped;
    this._offset.wrapped = false;

    if (found) {
      const previousPage = this._selected.pageIdx;
      this._selected.pageIdx = this._offset.pageIdx;
      this._selected.matchIdx = this._offset.matchIdx;
      state = wrapped ? FindState.WRAPPED : FindState.FOUND;

      // Update the currently selected page to wipe out any selected matches.
      if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
        this.#updatePage(previousPage);
      }
    }

    this.#updateUIState(state, this.#state.findPrevious);
    if (this._selected.pageIdx !== -1) {
      // Ensure that the match will be scrolled into view.
      this._scrollMatches = true;

      this.#updatePage(this._selected.pageIdx);
    }
  }

  #onFindBarClose(evt) {
    const pdfDocument = this._pdfDocument;
    // Since searching is asynchronous, ensure that the removal of highlighted
    // matches (from the UI) is async too such that the 'updatetextlayermatches'
    // events will always be dispatched in the expected order.
    this._firstPageCapability.promise.then(() => {
      // Only update the UI if the document is open, and is the current one.
      if (
        !this._pdfDocument ||
        (pdfDocument && this._pdfDocument !== pdfDocument)
      ) {
        return;
      }
      // Ensure that a pending, not yet started, search operation is aborted.
      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }
      // Abort any long running searches, to avoid a match being scrolled into
      // view *after* the findbar has been closed. In this case `this._offset`
      // will most likely differ from `this._selected`, hence we also ensure
      // that any new search operation will always start with a clean slate.
      if (this._resumePageIdx) {
        this._resumePageIdx = null;
        this._dirtyMatch = true;
      }
      // Avoid the UI being in a pending state when the findbar is re-opened.
      this.#updateUIState(FindState.FOUND);

      this._highlightMatches = false;
      this.#updateAllPages(); // Wipe out any previously highlighted matches.
    });
  }

  #requestMatchesCount() {
    const { pageIdx, matchIdx } = this._selected;
    let current = 0,
      total = this._matchesCountTotal;
    if (matchIdx !== -1) {
      for (let i = 0; i < pageIdx; i++) {
        current += this._pageMatches[i]?.length || 0;
      }
      current += matchIdx + 1;
    }
    // When searching starts, this method may be called before the `pageMatches`
    // have been counted (in `#calculateMatch`). Ensure that the UI won't show
    // temporarily broken state when the active find result doesn't make sense.
    if (current < 1 || current > total) {
      current = total = 0;
    }
    return { current, total };
  }

  #updateUIResultsCount() {
    this._eventBus.dispatch("updatefindmatchescount", {
      source: this,
      matchesCount: this.#requestMatchesCount(),
    });
  }

  #updateUIState(state, previous = false) {
    if (
      !this.#updateMatchesCountOnProgress &&
      (this.#visitedPagesCount !== this._linkService.pagesCount ||
        state === FindState.PENDING)
    ) {
      // When this.#updateMatchesCountOnProgress is false we only send an update
      // when everything is ready.
      return;
    }

    this._eventBus.dispatch("updatefindcontrolstate", {
      source: this,
      state,
      previous,
      entireWord: this.#state?.entireWord ?? null,
      matchesCount: this.#requestMatchesCount(),
      rawQuery: this.#state?.query ?? null,
    });
  }
}

export { FindState, getOriginalIndex, normalize, PDFFindController };
