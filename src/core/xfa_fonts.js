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
  };
  t["MyriadPro-Bold"] = {
    name: "LiberationSans-Bold",
    factors: MyriadProBoldFactors,
  };
  t["MyriadPro-It"] = {
    name: "LiberationSans-Italic",
    factors: MyriadProItalicFactors,
  };
  t["MyriadPro-BoldIt"] = {
    name: "LiberationSans-BoldItalic",
    factors: MyriadProBoldItalicFactors,
  };
  t.ArialMT = {
    name: "LiberationSans-Regular",
  };
  t["Arial-BoldMT"] = {
    name: "LiberationSans-Bold",
  };
  t["Arial-ItalicMT"] = {
    name: "LiberationSans-Italic",
  };
  t["Arial-BoldItalicMT"] = {
    name: "LiberationSans-BoldItalic",
  };
  t["Calibri-Regular"] = {
    name: "LiberationSans-Regular",
    factors: CalibriRegularFactors,
  };
  t["Calibri-Bold"] = {
    name: "LiberationSans-Bold",
    factors: CalibriBoldFactors,
  };
  t["Calibri-Italic"] = {
    name: "LiberationSans-Italic",
    factors: CalibriItalicFactors,
  };
  t["Calibri-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: CalibriBoldItalicFactors,
  };
  t["Segoeui-Regular"] = {
    name: "LiberationSans-Regular",
    factors: SegoeuiRegularFactors,
  };
  t["Segoeui-Bold"] = {
    name: "LiberationSans-Bold",
    factors: SegoeuiBoldFactors,
  };
  t["Segoeui-Italic"] = {
    name: "LiberationSans-Italic",
    factors: SegoeuiItalicFactors,
  };
  t["Segoeui-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: SegoeuiBoldItalicFactors,
  };
  t["Helvetica-Regular"] = {
    name: "LiberationSans-Regular",
    factors: HelveticaRegularFactors,
  };
  t["Helvetica-Bold"] = {
    name: "LiberationSans-Bold",
    factors: HelveticaBoldFactors,
  };
  t["Helvetica-Italic"] = {
    name: "LiberationSans-Italic",
    factors: HelveticaItalicFactors,
  };
  t["Helvetica-BoldItalic"] = {
    name: "LiberationSans-BoldItalic",
    factors: HelveticaBoldItalicFactors,
  };
});

function getXfaFontName(name) {
  const fontName = normalizeFontName(name);
  const fontMap = getXFAFontMap();
  return fontMap[fontName];
}

export { getXfaFontName };
