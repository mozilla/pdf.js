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
import { Dict, Name } from "./primitives.js";
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
  LiberationSansBoldItalicMapping,
  LiberationSansBoldItalicWidths,
  LiberationSansBoldMapping,
  LiberationSansBoldWidths,
  LiberationSansItalicMapping,
  LiberationSansItalicWidths,
  LiberationSansRegularMapping,
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
    name: "Helvetica",
    factors: MyriadProRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    baseMapping: LiberationSansRegularMapping,
    metrics: MyriadProRegularMetrics,
  };
  t["MyriadPro-Bold"] = t["PdfJS-Fallback-Bold"] = {
    name: "Helvetica-Bold",
    factors: MyriadProBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    baseMapping: LiberationSansBoldMapping,
    metrics: MyriadProBoldMetrics,
  };
  t["MyriadPro-It"] =
    t["MyriadPro-Italic"] =
    t["PdfJS-Fallback-Italic"] =
      {
        name: "Helvetica-Oblique",
        factors: MyriadProItalicFactors,
        baseWidths: LiberationSansItalicWidths,
        baseMapping: LiberationSansItalicMapping,
        metrics: MyriadProItalicMetrics,
      };
  t["MyriadPro-BoldIt"] =
    t["MyriadPro-BoldItalic"] =
    t["PdfJS-Fallback-BoldItalic"] =
      {
        name: "Helvetica-BoldOblique",
        factors: MyriadProBoldItalicFactors,
        baseWidths: LiberationSansBoldItalicWidths,
        baseMapping: LiberationSansBoldItalicMapping,
        metrics: MyriadProBoldItalicMetrics,
      };
  t.ArialMT =
    t.Arial =
    t["Arial-Regular"] =
      {
        name: "Helvetica",
        baseWidths: LiberationSansRegularWidths,
        baseMapping: LiberationSansRegularMapping,
      };
  t["Arial-BoldMT"] = t["Arial-Bold"] = {
    name: "Helvetica-Bold",
    baseWidths: LiberationSansBoldWidths,
    baseMapping: LiberationSansBoldMapping,
  };
  t["Arial-ItalicMT"] = t["Arial-Italic"] = {
    name: "Helvetica-Oblique",
    baseWidths: LiberationSansItalicWidths,
    baseMapping: LiberationSansItalicMapping,
  };
  t["Arial-BoldItalicMT"] = t["Arial-BoldItalic"] = {
    name: "Helvetica-BoldOblique",
    baseWidths: LiberationSansBoldItalicWidths,
    baseMapping: LiberationSansBoldItalicMapping,
  };
  t["Calibri-Regular"] = {
    name: "Helvetica",
    factors: CalibriRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    baseMapping: LiberationSansRegularMapping,
    metrics: CalibriRegularMetrics,
  };
  t["Calibri-Bold"] = {
    name: "Helvetica-Bold",
    factors: CalibriBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    baseMapping: LiberationSansBoldMapping,
    metrics: CalibriBoldMetrics,
  };
  t["Calibri-Italic"] = {
    name: "Helvetica-Oblique",
    factors: CalibriItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    baseMapping: LiberationSansItalicMapping,
    metrics: CalibriItalicMetrics,
  };
  t["Calibri-BoldItalic"] = {
    name: "Helvetica-BoldOblique",
    factors: CalibriBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    baseMapping: LiberationSansBoldItalicMapping,
    metrics: CalibriBoldItalicMetrics,
  };
  t["Segoeui-Regular"] = {
    name: "Helvetica",
    factors: SegoeuiRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    baseMapping: LiberationSansRegularMapping,
    metrics: SegoeuiRegularMetrics,
  };
  t["Segoeui-Bold"] = {
    name: "Helvetica-Bold",
    factors: SegoeuiBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    baseMapping: LiberationSansBoldMapping,
    metrics: SegoeuiBoldMetrics,
  };
  t["Segoeui-Italic"] = {
    name: "Helvetica-Oblique",
    factors: SegoeuiItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    baseMapping: LiberationSansItalicMapping,
    metrics: SegoeuiItalicMetrics,
  };
  t["Segoeui-BoldItalic"] = {
    name: "Helvetica-BoldOblique",
    factors: SegoeuiBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    baseMapping: LiberationSansBoldItalicMapping,
    metrics: SegoeuiBoldItalicMetrics,
  };
  t["Helvetica-Regular"] = t.Helvetica = {
    name: "Helvetica",
    factors: HelveticaRegularFactors,
    baseWidths: LiberationSansRegularWidths,
    baseMapping: LiberationSansRegularMapping,
    metrics: HelveticaRegularMetrics,
  };
  t["Helvetica-Bold"] = {
    name: "Helvetica-Bold",
    factors: HelveticaBoldFactors,
    baseWidths: LiberationSansBoldWidths,
    baseMapping: LiberationSansBoldMapping,
    metrics: HelveticaBoldMetrics,
  };
  t["Helvetica-Italic"] = {
    name: "Helvetica-Oblique",
    factors: HelveticaItalicFactors,
    baseWidths: LiberationSansItalicWidths,
    baseMapping: LiberationSansItalicMapping,
    metrics: HelveticaItalicMetrics,
  };
  t["Helvetica-BoldItalic"] = {
    name: "Helvetica-BoldOblique",
    factors: HelveticaBoldItalicFactors,
    baseWidths: LiberationSansBoldItalicWidths,
    baseMapping: LiberationSansBoldItalicMapping,
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

  const { baseWidths, baseMapping, factors } = info;
  const rescaledBaseWidths = !factors
    ? baseWidths
    : baseWidths.map((w, i) => w * factors[i]);

  let currentCode = -2;
  let currentArray;

  // Widths array for composite font is:
  // CharCode1 [10, 20, 30] ...
  // which means:
  //   - CharCode1 has a width equal to 10
  //   - CharCode1+1 has a width equal to 20
  //   - CharCode1+2 has a width equal to 30
  //
  // The baseMapping array contains a map for glyph index to unicode.
  // So from baseMapping we'll get sorted unicodes and their positions
  // (i.e. glyph indices) and then we put widths in an array for the
  // the consecutive unicodes.
  const newWidths = [];
  for (const [unicode, glyphIndex] of baseMapping
    .map(
      (charUnicode, index) => [
        charUnicode,
        index,
      ] /* collect unicode and glyph index */
    )
    .sort(
      ([unicode1], [unicode2]) =>
        unicode1 - unicode2 /* order by unicode only */
    )) {
    if (unicode === -1) {
      continue;
    }

    if (unicode === currentCode + 1) {
      currentArray.push(rescaledBaseWidths[glyphIndex]);
      currentCode += 1;
    } else {
      currentCode = unicode;
      currentArray = [rescaledBaseWidths[glyphIndex]];
      newWidths.push(unicode, currentArray);
    }
  }

  return newWidths;
}

function getXfaFontDict(name) {
  const widths = getXfaFontWidths(name);
  const dict = new Dict(null);
  dict.set("BaseFont", Name.get(name));
  dict.set("Type", Name.get("Font"));
  dict.set("Subtype", Name.get("CIDFontType2"));
  dict.set("Encoding", Name.get("Identity-H"));
  dict.set("CIDToGIDMap", Name.get("Identity"));
  dict.set("W", widths);
  dict.set("FirstChar", widths[0]);
  dict.set("LastChar", widths.at(-2) + widths.at(-1).length - 1);
  const descriptor = new Dict(null);
  dict.set("FontDescriptor", descriptor);
  const systemInfo = new Dict(null);
  systemInfo.set("Ordering", "Identity");
  systemInfo.set("Registry", "Adobe");
  systemInfo.set("Supplement", 0);
  dict.set("CIDSystemInfo", systemInfo);

  return dict;
}

export { getXfaFontDict, getXfaFontName };
