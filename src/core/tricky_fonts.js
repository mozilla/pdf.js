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

import { computeOpenTypeChecksum } from "./opentype_file_builder.js";

// These TrueType fonts rely on their glyph programs to position components.
// FreeType identifies them by family name or hint table signature. OTS uses
// the family name, which is often lost when a PDF embeds a subset; without it,
// OTS fixes the glyph bounding boxes, which moves the components and garbles
// the glyphs on macOS.
// See https://gitlab.freedesktop.org/freetype/freetype/-/blob/d7339729da576614cbf107d04a72924d21f7ec5a/src/truetype/ttobjs.c#L163-L565

const TRICKY_FONT_NAMES = [
  "cpop",
  "DFGirl-W6-WIN-BF",
  "DFGothic-EB",
  "DFGyoSho-Lt",
  "DFHei",
  "DFHSGothic-W5",
  "DFHSMincho-W3",
  "DFHSMincho-W7",
  "DFKaiSho-SB",
  "DFKaiShu",
  "DFKai-SB",
  "DFMing",
  "DLC",
  "HuaTianKaiTi?",
  "HuaTianSongTi?",
  "Ming(for ISO10646)",
  "MingLiU",
  "MingMedium",
  "PMingLiU",
  "MingLi43",
];

// The family name followed by the checksum and the length of the `cvt `,
// `fpgm` and `prep` tables.
// The NEC fonts from the FreeType list are omitted: they don't have a family
// name known by OTS.
// prettier-ignore
const TRICKY_FONT_TABLES = [
  ["MingLiU", 0x05bcf058, 0x2e4, 0x28233bf1, 0x87c4, 0xa344a1ea, 0x1e1],
  ["MingLiU", 0x05bcf058, 0x2e4, 0x28233bf1, 0x87c4, 0xa344a1eb, 0x1e1],
  ["DFGothic-EB", 0x12c3ebb2, 0x350, 0xb680ee64, 0x87a7, 0xce939563, 0x758],
  ["DFGyoSho-Lt", 0x11e5ead4, 0x350, 0xce5956e9, 0xbc85, 0x8272f416, 0x45],
  ["DFHei-Md-HK-BF", 0x1257eb46, 0x350, 0xf699d160, 0x715f, 0xd222f568, 0x3bc],
  ["DFHSGothic-W5", 0x1262eb4e, 0x350, 0xe86a5d64, 0x7940, 0x7850f729, 0x5ff],
  ["DFHSMincho-W3", 0x122deb0a, 0x350, 0x3d16328a, 0x859b, 0xa93fc33b, 0x2cb],
  ["DFHSMincho-W7", 0x125feb26, 0x350, 0xa5acc982, 0x7ee1, 0x90999196, 0x41f],
  // The family name of kaiu.ttf (Windows) is DFKai-SB.
  ["DFKai-SB", 0x11e5ead4, 0x350, 0x5a30ca3b, 0x9063, 0x13a42602, 0x7e],
  ["DFKaiShu", 0x11e5ead4, 0x350, 0xa6e78c01, 0x8998, 0x13a42602, 0x7e],
  ["DFKaiShu-Md-HK-BF", 0x11e5ead4, 0x360, 0x9db282b2, 0xc06e, 0x53e6d7ca, 0x82],
  ["DFMing-Bd-HK-BF", 0x1243eb18, 0x350, 0xba0a8c30, 0x74ad, 0xf3d83409, 0x37b],
  ["DLCLiShu", 0x07dcf546, 0x308, 0x40fe7c90, 0x8e2a, 0x608174b5, 0x7a],
  ["DLCHayBold", 0xeb891238, 0x308, 0xd2e4dcd4, 0x676f, 0x8ea5f293, 0x3b8],
  ["HuaTianKaiTi?", 0xfffbfffc, 0x8, 0x9c9e48b8, 0xbea2, 0x70020112, 0x8],
  ["HuaTianSongTi?", 0xfffbfffc, 0x8, 0x0a5a0483, 0x17c39, 0x70020112, 0x8],
  ["MingLi43", 0x00170003, 0x60, 0xdbb4306e, 0x58aa, 0xd643482a, 0x35],
  ["DFHei-Bd-WIN-HK-BF", 0x1269eb58, 0x350, 0x5cd5957a, 0x6a4e, 0xf758323a, 0x380],
  ["DFMing-Md-WIN-HK-BF", 0x122feb0b, 0x350, 0x7f10919a, 0x70a9, 0x7cd7e7b7, 0x25c],
];

function getTrickyFontName(name) {
  if (!name) {
    return null;
  }
  const family = name.replace(/^[A-Z]{6}\+/, "");
  const match = TRICKY_FONT_NAMES.find(candidate => family.includes(candidate));
  if (!match) {
    return null;
  }
  // Use the ASCII match if writing the full name requires Mac Roman encoding.
  return /^[\x20-\x7e]+$/.test(family) ? family : match;
}

function getTrickyFontNameFromTables(tables) {
  const cvt = tables["cvt "],
    { fpgm, prep } = tables;
  if (!cvt || !fpgm || !prep) {
    return null;
  }
  let checksums = null;
  for (const [
    name,
    cvtChecksum,
    cvtLength,
    fpgmChecksum,
    fpgmLength,
    prepChecksum,
    prepLength,
  ] of TRICKY_FONT_TABLES) {
    if (
      cvtLength !== cvt.length ||
      fpgmLength !== fpgm.length ||
      prepLength !== prep.length
    ) {
      continue;
    }
    checksums ??= [cvt, fpgm, prep].map(({ view }) =>
      computeOpenTypeChecksum(view)
    );
    if (
      cvtChecksum === checksums[0] &&
      fpgmChecksum === checksums[1] &&
      prepChecksum === checksums[2]
    ) {
      return name;
    }
  }
  return null;
}

export { getTrickyFontName, getTrickyFontNameFromTables };
