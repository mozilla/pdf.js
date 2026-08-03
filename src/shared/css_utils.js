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

const CONTROL_CHAR_REGEXP = /\p{Cc}/u;

/**
 * Checks if the given value already is a well-formed CSS <string>, i.e. a
 * value which can be used verbatim since it cannot introduce delimiters.
 * See https://drafts.csswg.org/css-syntax/#string-token-diagram.
 * @param {string} str
 * @returns {boolean}
 */
function isCSSString(str) {
  const quote = str[0];
  if (
    str.length < 2 ||
    (quote !== `"` && quote !== `'`) ||
    str.at(-1) !== quote
  ) {
    return false;
  }
  const end = str.length - 1;
  for (let i = 1; i < end; i++) {
    const char = str[i];
    if (char === quote || CONTROL_CHAR_REGEXP.test(char)) {
      return false;
    }
    if (char === "\\") {
      // Skip the escaped character. A trailing backslash would instead escape
      // the closing quote, and control characters must not occur in a CSS
      // <string> even when escaped this way.
      if (++i >= end || CONTROL_CHAR_REGEXP.test(str[i])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Serializes a font family, originating from the PDF document, such that it
 * can safely be interpolated into CSS.
 * @param {string} fontFamily
 * @returns {string}
 */
function serializeFontFamily(fontFamily) {
  if (isCSSString(fontFamily)) {
    return fontFamily;
  }
  // Always emit a <string>, rather than a <custom-ident> sequence, since both
  // denote the same family name but only the former cannot be mistaken for a
  // generic family (e.g. `serif`) or a CSS-wide keyword (e.g. `inherit`);
  // those are not valid font family names and would be ignored.
  // Control characters use hexadecimal escapes, since CSS line terminators
  // cannot be escaped by simply prefixing them with a backslash.
  const escaped = fontFamily.replaceAll(/["\\\p{Cc}]/gu, char =>
    char === `"` || char === "\\"
      ? `\\${char}`
      : `\\${char.codePointAt(0).toString(16)} `
  );
  return `"${escaped}"`;
}

export { CONTROL_CHAR_REGEXP, serializeFontFamily };
