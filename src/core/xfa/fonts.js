/* Copyright 2021 Mozilla Foundation
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

import { warn } from "../../shared/util.js";

class FontFinder {
  constructor(pdfFonts) {
    this.fonts = new Map();
    this.cache = new Map();
    this.warned = new Set();
    this.defaultFont = null;
    this.add(pdfFonts);
  }

  add(pdfFonts) {
    for (const pdfFont of pdfFonts) {
      this.addPdfFont(pdfFont);
    }
    for (const pdfFont of this.fonts.values()) {
      if (!pdfFont.regular) {
        pdfFont.regular = pdfFont.italic || pdfFont.bold || pdfFont.bolditalic;
      }
    }
  }

  addPdfFont(pdfFont) {
    const cssFontInfo = pdfFont.cssFontInfo;
    const name = cssFontInfo.fontFamily;
    let font = this.fonts.get(name);
    if (!font) {
      font = Object.create(null);
      this.fonts.set(name, font);
      if (!this.defaultFont) {
        this.defaultFont = font;
      }
    }
    let property = "";
    if (cssFontInfo.italicAngle !== "0") {
      if (parseFloat(cssFontInfo.fontWeight) >= 700) {
        property = "bolditalic";
      } else {
        property = "italic";
      }
    } else if (parseFloat(cssFontInfo.fontWeight) >= 700) {
      property = "bold";
    }

    if (!property) {
      if (
        pdfFont.name.includes("Bold") ||
        (pdfFont.psName && pdfFont.psName.includes("Bold"))
      ) {
        property = "bold";
      }
      if (
        pdfFont.name.includes("Italic") ||
        pdfFont.name.endsWith("It") ||
        (pdfFont.psName &&
          (pdfFont.psName.includes("Italic") || pdfFont.psName.endsWith("It")))
      ) {
        property += "italic";
      }
    }

    if (!property) {
      property = "regular";
    }

    font[property] = pdfFont;
  }

  getDefault() {
    return this.defaultFont;
  }

  find(fontName, mustWarn = true) {
    let font = this.fonts.get(fontName) || this.cache.get(fontName);
    if (font) {
      return font;
    }

    const pattern = /,|-| |bolditalic|bold|italic|regular|it/gi;
    let name = fontName.replace(pattern, "");
    font = this.fonts.get(name);
    if (font) {
      this.cache.set(fontName, font);
      return font;
    }
    name = name.toLowerCase();

    const maybe = [];
    for (const [family, pdfFont] of this.fonts.entries()) {
      if (family.replace(pattern, "").toLowerCase().startsWith(name)) {
        maybe.push(pdfFont);
      }
    }

    if (maybe.length === 0) {
      for (const [, pdfFont] of this.fonts.entries()) {
        if (
          pdfFont.regular.name &&
          pdfFont.regular.name
            .replace(pattern, "")
            .toLowerCase()
            .startsWith(name)
        ) {
          maybe.push(pdfFont);
        }
      }
    }

    if (maybe.length === 0) {
      name = name.replace(/psmt|mt/gi, "");
      for (const [family, pdfFont] of this.fonts.entries()) {
        if (family.replace(pattern, "").toLowerCase().startsWith(name)) {
          maybe.push(pdfFont);
        }
      }
    }

    if (maybe.length === 0) {
      for (const pdfFont of this.fonts.values()) {
        if (
          pdfFont.regular.name &&
          pdfFont.regular.name
            .replace(pattern, "")
            .toLowerCase()
            .startsWith(name)
        ) {
          maybe.push(pdfFont);
        }
      }
    }

    if (maybe.length >= 1) {
      if (maybe.length !== 1 && mustWarn) {
        warn(`XFA - Too many choices to guess the correct font: ${fontName}`);
      }
      this.cache.set(fontName, maybe[0]);
      return maybe[0];
    }

    if (mustWarn && !this.warned.has(fontName)) {
      this.warned.add(fontName);
      warn(`XFA - Cannot find the font: ${fontName}`);
    }
    return null;
  }
}

function selectFont(xfaFont, typeface) {
  if (xfaFont.posture === "italic") {
    if (xfaFont.weight === "bold") {
      return typeface.bolditalic;
    }
    return typeface.italic;
  } else if (xfaFont.weight === "bold") {
    return typeface.bold;
  }

  return typeface.regular;
}

export { FontFinder, selectFont };
