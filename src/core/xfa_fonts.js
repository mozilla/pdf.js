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
  CalibriBoldItalicMetrics,
  CalibriBoldMetrics,
  CalibriItalicFactors,
  CalibriItalicMetrics,
  CalibriRegularFactors,
  CalibriRegularMetrics,
} from "./calibri_factors.js";
import {
  HelveticaBoldFactors,
  HelveticaBoldItalicFactors,
  HelveticaBoldItalicMetrics,
  HelveticaBoldMetrics,
  HelveticaItalicFactors,
  HelveticaItalicMetrics,
  HelveticaRegularFactors,
  HelveticaRegularMetrics,
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
  MyriadProBoldItalicMetrics,
  MyriadProBoldMetrics,
  MyriadProItalicFactors,
  MyriadProItalicMetrics,
  MyriadProRegularFactors,
  MyriadProRegularMetrics,
} from "./myriadpro_factors.js";
import {
  SegoeuiBoldFactors,
  SegoeuiBoldItalicFactors,
  SegoeuiBoldItalicMetrics,
  SegoeuiBoldMetrics,
  SegoeuiItalicFactors,
  SegoeuiItalicMetrics,
  SegoeuiRegularFactors,
  SegoeuiRegularMetrics,
} from "./segoeui_factors.js";
import { getLookupTableFactory } from "./core_utils.js";
import { normalizeFontName } from "./fonts_utils.js";

const getXFAFontMap = getLookupTableFactory(function (t) {
  t["MyriadPro-Regular"] = t["PdfJS-Fallback-Regular"] = {
    name: "LiberationSans-Regular",
    factors: MyriadProRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    metrics: MyriadProRegularMetrics,
  };
  t["MyriadPro-Bold"] = t["PdfJS-Fallback-Bold"] = {
    name: "LiberationSans-Bold",
    factors: MyriadProBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    metrics: MyriadProBoldMetrics,
  };
  t["MyriadPro-It"] =
    t["MyriadPro-Italic"] =
    t["PdfJS-Fallback-Italic"] =
      {
        name: "LiberationSans-Italic",
        factors: MyriadProItalicFactors,
        baseWidths: LiberationSansItalicWidths,
        metrics: MyriadProItalicMetrics,
      };
  t["MyriadPro-BoldIt"] =
    t["MyriadPro-BoldItalic"] =
    t["PdfJS-Fallback-BoldItalic"] =
      {
        name: "LiberationSans-BoldItalic",
        factors: MyriadProBoldItalicFactors,
        baseWidths: LiberationSansBoldItalicWidths,
        metrics: MyriadProBoldItalicMetrics,
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
    metrics: CalibriRegularMetrics,
  };
  t["Calibri-Bold"] = {
    name: "LiberationSans-Bold",
    factors: CalibriBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    metrics: CalibriBoldMetrics,
  };
  t["Calibri-Italic"] = {
    name: "LiberationSans-Italic",
    factors: CalibriItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    metrics: CalibriItalicMetrics,
  };
  t["Calibri-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: CalibriBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    metrics: CalibriBoldItalicMetrics,
  };
  t["Segoeui-Regular"] = {
    name: "LiberationSans-Regular",
    factors: SegoeuiRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    metrics: SegoeuiRegularMetrics,
  };
  t["Segoeui-Bold"] = {
    name: "LiberationSans-Bold",
    factors: SegoeuiBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    metrics: SegoeuiBoldMetrics,
  };
  t["Segoeui-Italic"] = {
    name: "LiberationSans-Italic",
    factors: SegoeuiItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    metrics: SegoeuiItalicMetrics,
  };
  t["Segoeui-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: SegoeuiBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    metrics: SegoeuiBoldItalicMetrics,
  };
  t["Helvetica-Regular"] = t.Helvetica = {
    name: "LiberationSans-Regular",
    factors: HelveticaRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    metrics: HelveticaRegularMetrics,
  };
  t["Helvetica-Bold"] = {
    name: "LiberationSans-Bold",
    factors: HelveticaBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    metrics: HelveticaBoldMetrics,
  };
  t["Helvetica-Italic"] = {
    name: "LiberationSans-Italic",
    factors: HelveticaItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    metrics: HelveticaItalicMetrics,
  };
  t["Helvetica-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: HelveticaBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    metrics: HelveticaBoldItalicMetrics,
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
