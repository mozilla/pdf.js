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

const NON_ASCII_SPACES = new Set([
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x202f, 0x205f, 0x3000,
]);

const COMMONLY_MAPPED_TO_NOTHING = new Set([
  0x00ad, 0x034f, 0x1806, 0x180b, 0x180c, 0x180d, 0x200b, 0x200c, 0x200d,
  0x2060, 0xfe00, 0xfe01, 0xfe02, 0xfe03, 0xfe04, 0xfe05, 0xfe06, 0xfe07,
  0xfe08, 0xfe09, 0xfe0a, 0xfe0b, 0xfe0c, 0xfe0d, 0xfe0e, 0xfe0f, 0xfeff,
]);

function saslPrep(str) {
  let mapped = "";
  for (const char of str) {
    const code = char.codePointAt(0);
    if (NON_ASCII_SPACES.has(code)) {
      mapped += " ";
    } else if (!COMMONLY_MAPPED_TO_NOTHING.has(code)) {
      mapped += char;
    }
  }

  // SASLprep also specifies prohibited-output and bidirectional-text checks.
  // They are intentionally omitted here since this function is only used to
  // derive password candidates when opening PDFs. Being permissive lets us
  // handle non-conforming files whose producers omitted those checks too; the
  // derived candidate must still pass the PDF password verification.

  // TODO: SASLprep is based on Unicode 3.2, whereas String.prototype.normalize
  // uses the Unicode version provided by the JavaScript runtime. Use frozen
  // Unicode 3.2 normalization data if this difference causes interoperability
  // problems in practice.
  return mapped.normalize("NFKC");
}

export { saslPrep };
