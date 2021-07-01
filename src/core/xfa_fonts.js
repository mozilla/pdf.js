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

import { CalibriBoldFactors } from "./calibri_bold.js";
import { CalibriBoldItalicFactors } from "./calibri_bold_italic.js";
import { CalibriItalicFactors } from "./calibri_italic.js";
import { CalibriRegularFactors } from "./calibri_regular.js";
import { getLookupTableFactory } from "./core_utils.js";
import { HelveticaBoldFactors } from "./helvetica_bold.js";
import { HelveticaBoldItalicFactors } from "./helvetica_bold_italic.js";
import { HelveticaItalicFactors } from "./helvetica_italic.js";
import { HelveticaRegularFactors } from "./helvetica_regular.js";
import { LiberationSansBoldItalicWidths } from "./liberationsans_bold_italic_widths.js";
import { LiberationSansBoldWidths } from "./liberationsans_bold_widths.js";
import { LiberationSansItalicWidths } from "./liberationsans_italic_widths.js";
import { LiberationSansRegularWidths } from "./liberationsans_regular_widths.js";
import { MyriadProBoldFactors } from "./myriadpro_bold.js";
import { MyriadProBoldItalicFactors } from "./myriadpro_bold_italic.js";
import { MyriadProItalicFactors } from "./myriadpro_italic.js";
import { MyriadProRegularFactors } from "./myriadpro_regular.js";
import { normalizeFontName } from "./fonts_utils.js";
import { SegoeuiBoldFactors } from "./segoeui_bold.js";
import { SegoeuiBoldItalicFactors } from "./segoeui_bold_italic.js";
import { SegoeuiItalicFactors } from "./segoeui_italic.js";
import { SegoeuiRegularFactors } from "./segoeui_regular.js";

const getXFAFontMap = getLookupTableFactory(function (t) {
  t["MyriadPro-Regular"] = {
    name: "LiberationSans-Regular",
    factors: MyriadProRegularFactors,
    baseWidths: LiberationSansRegularWidths,
  };
  t["MyriadPro-Bold"] = {
    name: "LiberationSans-Bold",
    factors: MyriadProBoldFactors,
    baseWidths: LiberationSansBoldWidths,
  };
  t["MyriadPro-It"] = {
    name: "LiberationSans-Italic",
    factors: MyriadProItalicFactors,
    baseWidths: LiberationSansItalicWidths,
  };
  t["MyriadPro-BoldIt"] = {
    name: "LiberationSans-BoldItalic",
    factors: MyriadProBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
  };
  t.ArialMT =
    t.Arial =
    t["Arial-Regular"] =
      {
        name: "LiberationSans-Regular",
        baseWidths: LiberationSansRegularWidths,
      };
  t["Arial-BoldMT"] = t["Arial-Bold"] = {
    name: "LiberationSans-Bold",
    baseWidths: LiberationSansBoldWidths,
  };
  t["Arial-ItalicMT"] = t["Arial-Italic"] = {
    name: "LiberationSans-Italic",
    baseWidths: LiberationSansItalicWidths,
  };
  t["Arial-BoldItalicMT"] = t["Arial-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    baseWidths: LiberationSansBoldItalicWidths,
  };
  t["Calibri-Regular"] = {
    name: "LiberationSans-Regular",
    factors: CalibriRegularFactors,
    baseWidths: LiberationSansRegularWidths,
  };
  t["Calibri-Bold"] = {
    name: "LiberationSans-Bold",
    factors: CalibriBoldFactors,
    baseWidths: LiberationSansBoldWidths,
  };
  t["Calibri-Italic"] = {
    name: "LiberationSans-Italic",
    factors: CalibriItalicFactors,
    baseWidths: LiberationSansItalicWidths,
  };
  t["Calibri-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: CalibriBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
  };
  t["Segoeui-Regular"] = {
    name: "LiberationSans-Regular",
    factors: SegoeuiRegularFactors,
    baseWidths: LiberationSansRegularWidths,
  };
  t["Segoeui-Bold"] = {
    name: "LiberationSans-Bold",
    factors: SegoeuiBoldFactors,
    baseWidths: LiberationSansBoldWidths,
  };
  t["Segoeui-Italic"] = {
    name: "LiberationSans-Italic",
    factors: SegoeuiItalicFactors,
    baseWidths: LiberationSansItalicWidths,
  };
  t["Segoeui-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: SegoeuiBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
  };
  t["Helvetica-Regular"] = {
    name: "LiberationSans-Regular",
    factors: HelveticaRegularFactors,
    baseWidths: LiberationSansRegularWidths,
  };
  t["Helvetica-Bold"] = {
    name: "LiberationSans-Bold",
    factors: HelveticaBoldFactors,
    baseWidths: LiberationSansBoldWidths,
  };
  t["Helvetica-Italic"] = {
    name: "LiberationSans-Italic",
    factors: HelveticaItalicFactors,
    baseWidths: LiberationSansItalicWidths,
  };
  t["Helvetica-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: HelveticaBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
  };
});

function getXfaFontName(name) {
  const fontName = normalizeFontName(name);
  const fontMap = getXFAFontMap();
  return fontMap[fontName];
}

function getXfaFontWidths(name) {
  const info = getXfaFontName(name);
  if (!info) {
    return null;
  }

  const { baseWidths, factors } = info;
  if (!factors) {
    return baseWidths;
  }
  return baseWidths.map((w, i) => w * factors[i]);
}

export { getXfaFontName, getXfaFontWidths };
