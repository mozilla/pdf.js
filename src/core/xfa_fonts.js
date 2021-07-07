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

import {
  CalibriBoldFactors,
  CalibriBoldItalicFactors,
  CalibriItalicFactors,
  CalibriRegularFactors,
} from "./calibri_factors.js";
import {
  HelveticaBoldFactors,
  HelveticaBoldItalicFactors,
  HelveticaItalicFactors,
  HelveticaRegularFactors,
} from "./helvetica_factors.js";
import {
  LiberationSansBoldItalicWidths,
  LiberationSansBoldWidths,
  LiberationSansItalicWidths,
  LiberationSansRegularWidths,
} from "./liberationsans_widths.js";
import {
  MyriadProBoldFactors,
  MyriadProBoldItalicFactors,
  MyriadProItalicFactors,
  MyriadProRegularFactors,
} from "./myriadpro_factors.js";
import {
  SegoeuiBoldFactors,
  SegoeuiBoldItalicFactors,
  SegoeuiItalicFactors,
  SegoeuiRegularFactors,
} from "./segoeui_factors.js";
import { getLookupTableFactory } from "./core_utils.js";
import { normalizeFontName } from "./fonts_utils.js";

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
