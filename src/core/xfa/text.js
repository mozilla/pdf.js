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

import { selectFont } from "./fonts.js";

const WIDTH_FACTOR = 1.01;

class FontInfo {
  constructor(xfaFont, margin, lineHeight, fontFinder) {
    this.lineHeight = lineHeight;
    this.paraMargin = margin || {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    };

    if (!xfaFont) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fontFinder);
      return;
    }

    this.xfaFont = {
      typeface: xfaFont.typeface,
      posture: xfaFont.posture,
      weight: xfaFont.weight,
      size: xfaFont.size,
      letterSpacing: xfaFont.letterSpacing,
    };
    const typeface = fontFinder.find(xfaFont.typeface);
    if (!typeface) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fontFinder);
      return;
    }

    this.pdfFont = selectFont(xfaFont, typeface);

    if (!this.pdfFont) {
      [this.pdfFont, this.xfaFont] = this.defaultFont(fontFinder);
    }
  }

  defaultFont(fontFinder) {
    // TODO: Add a default font based on Liberation.
    const font =
      fontFinder.find("Helvetica", false) ||
      fontFinder.find("Myriad Pro", false) ||
      fontFinder.find("Arial", false) ||
      fontFinder.getDefault();
    if (font && font.regular) {
      const pdfFont = font.regular;
      const info = pdfFont.cssFontInfo;
      const xfaFont = {
        typeface: info.fontFamily,
        posture: "normal",
        weight: "normal",
        size: 10,
        letterSpacing: 0,
      };
      return [pdfFont, xfaFont];
    }

    const xfaFont = {
      typeface: "Courier",
      posture: "normal",
      weight: "normal",
      size: 10,
      letterSpacing: 0,
    };
    return [null, xfaFont];
  }
}

class FontSelector {
  constructor(
    defaultXfaFont,
    defaultParaMargin,
    defaultLineHeight,
    fontFinder
  ) {
    this.fontFinder = fontFinder;
    this.stack = [
      new FontInfo(
        defaultXfaFont,
        defaultParaMargin,
        defaultLineHeight,
        fontFinder
      ),
    ];
  }

  pushData(xfaFont, margin, lineHeight) {
    const lastFont = this.stack[this.stack.length - 1];
    for (const name of [
      "typeface",
      "posture",
      "weight",
      "size",
      "letterSpacing",
    ]) {
      if (!xfaFont[name]) {
        xfaFont[name] = lastFont.xfaFont[name];
      }
    }

    for (const name of ["top", "bottom", "left", "right"]) {
      if (isNaN(margin[name])) {
        margin[name] = lastFont.paraMargin[name];
      }
    }

    const fontInfo = new FontInfo(
      xfaFont,
      margin,
      lineHeight || lastFont.lineHeight,
      this.fontFinder
    );
    if (!fontInfo.pdfFont) {
      fontInfo.pdfFont = lastFont.pdfFont;
    }

    this.stack.push(fontInfo);
  }

  popFont() {
    this.stack.pop();
  }

  topFont() {
    return this.stack[this.stack.length - 1];
  }
}

/**
 * Compute a text area dimensions based on font metrics.
 */
class TextMeasure {
  constructor(defaultXfaFont, defaultParaMargin, defaultLineHeight, fonts) {
    this.glyphs = [];
    this.fontSelector = new FontSelector(
      defaultXfaFont,
      defaultParaMargin,
      defaultLineHeight,
      fonts
    );
    this.extraHeight = 0;
  }

  pushData(xfaFont, margin, lineHeight) {
    this.fontSelector.pushData(xfaFont, margin, lineHeight);
  }

  popFont(xfaFont) {
    return this.fontSelector.popFont();
  }

  addPara() {
    const lastFont = this.fontSelector.topFont();
    this.extraHeight += lastFont.paraMargin.top + lastFont.paraMargin.bottom;
  }

  addString(str) {
    if (!str) {
      return;
    }

    const lastFont = this.fontSelector.topFont();
    const fontSize = lastFont.xfaFont.size;
    if (lastFont.pdfFont) {
      const letterSpacing = lastFont.xfaFont.letterSpacing;
      const pdfFont = lastFont.pdfFont;
      const lineHeight =
        lastFont.lineHeight ||
        Math.ceil(Math.max(1.2, pdfFont.lineHeight) * fontSize);
      const scale = fontSize / 1000;

      for (const line of str.split(/[\u2029\n]/)) {
        const encodedLine = pdfFont.encodeString(line).join("");
        const glyphs = pdfFont.charsToGlyphs(encodedLine);

        for (const glyph of glyphs) {
          this.glyphs.push([
            glyph.width * scale + letterSpacing,
            lineHeight,
            glyph.unicode === " ",
            false,
          ]);
        }

        this.glyphs.push([0, 0, false, true]);
      }
      this.glyphs.pop();
      return;
    }

    // When we have no font in the pdf, just use the font size as default width.
    for (const line of str.split(/[\u2029\n]/)) {
      for (const char of line.split("")) {
        this.glyphs.push([fontSize, fontSize, char === " ", false]);
      }

      this.glyphs.push([0, 0, false, true]);
    }
    this.glyphs.pop();
  }

  compute(maxWidth) {
    let lastSpacePos = -1,
      lastSpaceWidth = 0,
      width = 0,
      height = 0,
      currentLineWidth = 0,
      currentLineHeight = 0;
    let isBroken = false;

    for (let i = 0, ii = this.glyphs.length; i < ii; i++) {
      const [glyphWidth, glyphHeight, isSpace, isEOL] = this.glyphs[i];
      if (isEOL) {
        width = Math.max(width, currentLineWidth);
        currentLineWidth = 0;
        height += currentLineHeight;
        currentLineHeight = glyphHeight;
        lastSpacePos = -1;
        lastSpaceWidth = 0;
        continue;
      }

      if (isSpace) {
        if (currentLineWidth + glyphWidth > maxWidth) {
          // We can break here but the space is not taken into account.
          width = Math.max(width, currentLineWidth);
          currentLineWidth = 0;
          height += currentLineHeight;
          currentLineHeight = glyphHeight;
          lastSpacePos = -1;
          lastSpaceWidth = 0;
          isBroken = true;
        } else {
          currentLineHeight = Math.max(glyphHeight, currentLineHeight);
          lastSpaceWidth = currentLineWidth;
          currentLineWidth += glyphWidth;
          lastSpacePos = i;
        }
        continue;
      }

      if (currentLineWidth + glyphWidth > maxWidth) {
        // We must break to the last white position (if available)
        height += currentLineHeight;
        currentLineHeight = glyphHeight;
        if (lastSpacePos !== -1) {
          i = lastSpacePos;
          width = Math.max(width, lastSpaceWidth);
          currentLineWidth = 0;
          lastSpacePos = -1;
          lastSpaceWidth = 0;
        } else {
          // Just break in the middle of the word
          width = Math.max(width, currentLineWidth);
          currentLineWidth = glyphWidth;
        }
        isBroken = true;

        continue;
      }

      currentLineWidth += glyphWidth;
      currentLineHeight = Math.max(glyphHeight, currentLineHeight);
    }

    width = Math.max(width, currentLineWidth);
    height += currentLineHeight + this.extraHeight;

    return { width: WIDTH_FACTOR * width, height, isBroken };
  }
}

export { TextMeasure };
