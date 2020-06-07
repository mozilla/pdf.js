// npm module fast-levenshtein 2.0.6, converted to ES2015

const levenshtein_collator = Intl.Collator("generic", { sensitivity: "base" });

// arrays to re-use
const levenshtein_prevRow = [];
const levenshtein_str2Char = [];

export class Levenshtein {
  /**
   * Calculate levenshtein distance of the two strings.
   *
   * @param str1 String the first string.
   * @param str2 String the second string.
   * @param [options] Additional options.
   * @param [options.useCollator] Use `Intl.Collator` for locale-sensitive
   * string comparison.
   * @return Integer the levenshtein distance (0 and above).
   */
  static distance(str1, str2, options) {
    const useCollator = options && levenshtein_collator && options.useCollator;

    const str1Len = str1.length;
    const str2Len = str2.length;

    // base cases
    if (str1Len === 0) {
      return str2Len;
    }
    if (str2Len === 0) {
      return str1Len;
    }

    // two rows
    let curCol, nextCol, i, j, tmp;

    // initialise previous row
    for (i = 0; i < str2Len; ++i) {
      levenshtein_prevRow[i] = i;
      levenshtein_str2Char[i] = str2.charCodeAt(i);
    }
    levenshtein_prevRow[str2Len] = str2Len;

    let strCmp;
    if (useCollator) {
      // calculate current row distance from previous row using collator
      for (i = 0; i < str1Len; ++i) {
        nextCol = i + 1;

        for (j = 0; j < str2Len; ++j) {
          curCol = nextCol;

          // substution
          strCmp =
            levenshtein_collator.compare(
              str1.charAt(i),
              String.fromCharCode(levenshtein_str2Char[j])
            ) === 0;

          nextCol = levenshtein_prevRow[j] + (strCmp ? 0 : 1);

          // insertion
          tmp = curCol + 1;
          if (nextCol > tmp) {
            nextCol = tmp;
          }
          // deletion
          tmp = levenshtein_prevRow[j + 1] + 1;
          if (nextCol > tmp) {
            nextCol = tmp;
          }

          // copy current col value into previous (in preparation for next iteration)
          levenshtein_prevRow[j] = curCol;
        }

        // copy last col value into previous (in preparation for next iteration)
        levenshtein_prevRow[j] = nextCol;
      }
    } else {
      // calculate current row distance from previous row without collator
      for (i = 0; i < str1Len; ++i) {
        nextCol = i + 1;

        for (j = 0; j < str2Len; ++j) {
          curCol = nextCol;

          // substution
          strCmp = str1.charCodeAt(i) === levenshtein_str2Char[j];

          nextCol = levenshtein_prevRow[j] + (strCmp ? 0 : 1);

          // insertion
          tmp = curCol + 1;
          if (nextCol > tmp) {
            nextCol = tmp;
          }
          // deletion
          tmp = levenshtein_prevRow[j + 1] + 1;
          if (nextCol > tmp) {
            nextCol = tmp;
          }

          // copy current col value into previous (in preparation for next iteration)
          levenshtein_prevRow[j] = curCol;
        }

        // copy last col value into previous (in preparation for next iteration)
        levenshtein_prevRow[j] = nextCol;
      }
    }
    return nextCol;
  }
}
