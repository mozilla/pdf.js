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
  ArialBoldItalicWidths,
  ArialBoldWidths,
  ArialItalicWidths,
  ArialRegularWidths,
  CalibriBoldItalicWidths,
  CalibriBoldWidths,
  CalibriItalicWidths,
  CalibriRegularWidths,
  HelveticaBoldItalicWidths,
  HelveticaBoldWidths,
  HelveticaItalicWidths,
  HelveticaRegularWidths,
  MyriadProBoldItalicWidths,
  MyriadProBoldWidths,
  MyriadProItalicWidths,
  MyriadProRegularWidths,
  SegoeuiBoldItalicWidths,
  SegoeuiBoldWidths,
  SegoeuiItalicWidths,
  SegoeuiRegularWidths,
  XfaFontCodePoints,
} from "./xfa_font_widths.js";
import { Dict, Name } from "./primitives.js";
import { getLookupTableFactory } from "./core_utils.js";
import { normalizeFontName } from "./fonts_utils.js";

const DEFAULT_METRICS = { lineHeight: 1.2, lineGap: 0.2 };
const HELVETICA_ITALIC_METRICS = { lineHeight: 1.35, lineGap: 0.2 };

const getXFAFontMap = getLookupTableFactory(function (t) {
  const styles = [
    ["Regular", "Helvetica"],
    ["Bold", "Helvetica-Bold"],
    ["Italic", "Helvetica-Oblique"],
    ["BoldItalic", "Helvetica-BoldOblique"],
  ];
  for (const [family, widths, metrics] of [
    [
      "Arial",
      [
        ArialRegularWidths,
        ArialBoldWidths,
        ArialItalicWidths,
        ArialBoldItalicWidths,
      ],
      null,
    ],
    [
      "Calibri",
      [
        CalibriRegularWidths,
        CalibriBoldWidths,
        CalibriItalicWidths,
        CalibriBoldItalicWidths,
      ],
      { lineHeight: 1.2207, lineGap: 0.2207 },
    ],
    [
      "Helvetica",
      [
        HelveticaRegularWidths,
        HelveticaBoldWidths,
        HelveticaItalicWidths,
        HelveticaBoldItalicWidths,
      ],
      DEFAULT_METRICS,
    ],
    [
      "MyriadPro",
      [
        MyriadProRegularWidths,
        MyriadProBoldWidths,
        MyriadProItalicWidths,
        MyriadProBoldItalicWidths,
      ],
      DEFAULT_METRICS,
    ],
    [
      "Segoeui",
      [
        SegoeuiRegularWidths,
        SegoeuiBoldWidths,
        SegoeuiItalicWidths,
        SegoeuiBoldItalicWidths,
      ],
      { lineHeight: 1.33008, lineGap: 0 },
    ],
  ]) {
    for (const [i, [style, name]] of styles.entries()) {
      const font = {
        name,
        widths: widths[i],
      };
      if (metrics) {
        font.metrics =
          family === "Helvetica" && i >= 2 ? HELVETICA_ITALIC_METRICS : metrics;
      }
      t[`${family}-${style}`] = font;
    }
  }
  for (const [style] of styles) {
    t[`PdfJS-Fallback-${style}`] = t[`MyriadPro-${style}`];
  }
  t["MyriadPro-It"] = t["MyriadPro-Italic"];
  t["MyriadPro-BoldIt"] = t["MyriadPro-BoldItalic"];
  t.ArialMT = t.Arial = t["Arial-Regular"];
  t["Arial-BoldMT"] = t["Arial-Bold"];
  t["Arial-ItalicMT"] = t["Arial-Italic"];
  t["Arial-BoldItalicMT"] = t["Arial-BoldItalic"];
  t.Helvetica = t["Helvetica-Regular"];
});

function getXfaFontName(name) {
  return getXFAFontMap()[normalizeFontName(name)];
}

function getXfaFontDict(name) {
  const { widths } = getXfaFontName(name);
  // Widths array for composite font is:
  // CharCode1 [10, 20, 30] ...
  // which means:
  //   - CharCode1 has a width equal to 10
  //   - CharCode1+1 has a width equal to 20
  //   - CharCode1+2 has a width equal to 30
  const newWidths = [];
  for (let i = 0, j = 0, ii = XfaFontCodePoints.length; i < ii; i += 2) {
    const count = XfaFontCodePoints[i + 1];
    newWidths.push(XfaFontCodePoints[i], widths.slice(j, j + count));
    j += count;
  }
  const dict = new Dict(null);
  dict.set("BaseFont", Name.get(name));
  dict.set("Type", Name.get("Font"));
  dict.set("Subtype", Name.get("CIDFontType2"));
  dict.set("Encoding", Name.get("Identity-H"));
  dict.set("CIDToGIDMap", Name.get("Identity"));
  dict.set("W", newWidths);
  dict.set("FirstChar", newWidths[0]);
  dict.set("LastChar", newWidths.at(-2) + newWidths.at(-1).length - 1);
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
