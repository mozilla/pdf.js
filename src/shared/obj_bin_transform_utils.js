/* Copyright 2025 Mozilla Foundation
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

class CSS_FONT_INFO {
  static strings = ["fontFamily", "fontWeight", "italicAngle"];
}

class SYSTEM_FONT_INFO {
  static strings = ["css", "loadedName", "baseFontName", "src"];
}

class FONT_INFO {
  static bools = [
    "black",
    "bold",
    "disableFontFace",
    "fontExtraProperties",
    "isInvalidPDFjsFont",
    "isType3Font",
    "italic",
    "missingFile",
    "remeasure",
    "vertical",
  ];

  static numbers = ["ascent", "defaultWidth", "descent"];

  static strings = ["fallbackName", "loadedName", "mimetype", "name"];

  static OFFSET_NUMBERS = Math.ceil((this.bools.length * 2) / 8);

  static OFFSET_BBOX = this.OFFSET_NUMBERS + this.numbers.length * 8;

  static OFFSET_FONT_MATRIX = this.OFFSET_BBOX + 1 + 2 * 4;

  static OFFSET_DEFAULT_VMETRICS = this.OFFSET_FONT_MATRIX + 1 + 8 * 6;

  static OFFSET_STRINGS = this.OFFSET_DEFAULT_VMETRICS + 1 + 2 * 3;
}

class PATTERN_INFO {
  static KIND = 0; // 1=axial, 2=radial, 3=mesh

  static HAS_BBOX = 1; // 0/1

  static HAS_BACKGROUND = 2; // 0/1 (background for mesh patterns)

  static SHADING_TYPE = 3; // shadingType (only for mesh patterns)

  static N_COORD = 4; // number of coordinate pairs

  static N_COLOR = 8; // number of rgb triplets

  static N_STOP = 12; // number of gradient stops

  static N_FIGURES = 16; // number of figures
}

export { CSS_FONT_INFO, FONT_INFO, PATTERN_INFO, SYSTEM_FONT_INFO };
