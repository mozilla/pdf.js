/* Copyright 2020 Mozilla Foundation
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

const border = Object.freeze({
  s: "solid",
  d: "dashed",
  b: "beveled",
  i: "inset",
  u: "underline",
});
const cursor = Object.freeze({
  visible: 0,
  hidden: 1,
  delay: 2,
});
const display = Object.freeze({
  visible: 0,
  hidden: 1,
  noPrint: 2,
  noView: 3,
});
const font = Object.freeze({
  Times: "Times-Roman",
  TimesB: "Times-Bold",
  TimesI: "Times-Italic",
  TimesBI: "Times-BoldItalic",
  Helv: "Helvetica",
  HelvB: "Helvetica-Bold",
  HelvI: "Helvetica-Oblique",
  HelvBI: "Helvetica-BoldOblique",
  Cour: "Courier",
  CourB: "Courier-Bold",
  CourI: "Courier-Oblique",
  CourBI: "Courier-BoldOblique",
  Symbol: "Symbol",
  ZapfD: "ZapfDingbats",
  KaGo: "HeiseiKakuGo-W5-UniJIS-UCS2-H",
  KaMi: "HeiseiMin-W3-UniJIS-UCS2-H",
});
const highlight = Object.freeze({
  n: "none",
  i: "invert",
  p: "push",
  o: "outline",
});
const position = Object.freeze({
  textOnly: 0,
  iconOnly: 1,
  iconTextV: 2,
  textIconV: 3,
  iconTextH: 4,
  textIconH: 5,
  overlay: 6,
});
const scaleHow = Object.freeze({
  proportional: 0,
  anamorphic: 1,
});
const scaleWhen = Object.freeze({
  always: 0,
  never: 1,
  tooBig: 2,
  tooSmall: 3,
});
const style = Object.freeze({
  ch: "check",
  cr: "cross",
  di: "diamond",
  ci: "circle",
  st: "star",
  sq: "square",
});
const trans = Object.freeze({
  blindsH: "BlindsHorizontal",
  blindsV: "BlindsVertical",
  boxI: "BoxIn",
  boxO: "BoxOut",
  dissolve: "Dissolve",
  glitterD: "GlitterDown",
  glitterR: "GlitterRight",
  glitterRD: "GlitterRightDown",
  random: "Random",
  replace: "Replace",
  splitHI: "SplitHorizontalIn",
  splitHO: "SplitHorizontalOut",
  splitVI: "SplitVerticalIn",
  splitVO: "SplitVerticalOut",
  wipeD: "WipeDown",
  wipeL: "WipeLeft",
  wipeR: "WipeRight",
  wipeU: "WipeUp",
});
const zoomtype = Object.freeze({
  none: "NoVary",
  fitP: "FitPage",
  fitW: "FitWidth",
  fitH: "FitHeight",
  fitV: "FitVisibleWidth",
  pref: "Preferred",
  refW: "ReflowWidth",
});
const IDS_GREATER_THAN = "Invalid value: must be greater than or equal to % s.";
const IDS_GT_AND_LT =
  "Invalid value: must be greater than or equal to % s " +
  "and less than or equal to % s.";
const IDS_LESS_THAN = "Invalid value: must be less than or equal to % s.";
const IDS_INVALID_MONTH = "** Invalid **";
const IDS_INVALID_DATE =
  "Invalid date / time: please ensure that the date / time exists. Field";
const IDS_INVALID_DATE2 = " should match format ";
const IDS_INVALID_VALUE =
  "The value entered does not match the format of the field";
const IDS_AM = "am";
const IDS_PM = "pm";
const IDS_MONTH_INFO =
  "January[1] February[2] March[3] April[4] May[5] " +
  "June[6] July[7] August[8] September[9] October[10] " +
  "November[11] December[12] Sept[9] Jan[1] Feb[2] Mar[3] " +
  "Apr[4] Jun[6] Jul[7] Aug[8] Sep[9] Oct[10] Nov[11] Dec[12]";
const IDS_STARTUP_CONSOLE_MSG = "** ^ _ ^ **";
const RE_NUMBER_ENTRY_DOT_SEP = ["[+-]?\\d*\\.?\\d*"];
const RE_NUMBER_COMMIT_DOT_SEP = [
  // -1.0 or -1
  "[+-]?\\d+(\\.\\d+)?",
  // -.1
  "[+-]?\\.\\d+",
  // -1.
  "[+-]?\\d+\\.",
];
const RE_NUMBER_ENTRY_COMMA_SEP = ["[+-]?\\d*,?\\d*"];
const RE_NUMBER_COMMIT_COMMA_SEP = [
  // -1,0 or -1
  "[+-]?\\d+([.,]\\d+)?",
  // -,1
  "[+-]?[.,]\\d+",
  // -1,
  "[+-]?\\d+[.,]",
];
const RE_ZIP_ENTRY = ["\\d{0,5}"];
const RE_ZIP_COMMIT = ["\\d{5}"];
const RE_ZIP4_ENTRY = ["\\d{0,5}(\\.|[- ])?\\d{0,4}"];
const RE_ZIP4_COMMIT = ["\\d{5}(\\.|[- ])?\\d{4}"];
const RE_PHONE_ENTRY = [
  // 555-1234 or 408 555-1234
  "\\d{0,3}(\\.|[- ])?\\d{0,3}(\\.|[- ])?\\d{0,4}",
  // (408
  "\\(\\d{0,3}",
  // (408) 555-1234
  // (allow the addition of parens as an afterthought)
  "\\(\\d{0,3}\\)(\\.|[- ])?\\d{0,3}(\\.|[- ])?\\d{0,4}",
  // (408 555-1234
  "\\(\\d{0,3}(\\.|[- ])?\\d{0,3}(\\.|[- ])?\\d{0,4}",
  // 408) 555-1234
  "\\d{0,3}\\)(\\.|[- ])?\\d{0,3}(\\.|[- ])?\\d{0,4}",
  // international
  "011(\\.|[- \\d])*",
];
const RE_PHONE_COMMIT = [
  // 555-1234
  "\\d{3}(\\.|[- ])?\\d{4}",
  // 408 555-1234
  "\\d{3}(\\.|[- ])?\\d{3}(\\.|[- ])?\\d{4}",
  // (408) 555-1234
  "\\(\\d{3}\\)(\\.|[- ])?\\d{3}(\\.|[- ])?\\d{4}",
  // international
  "011(\\.|[- \\d])*",
];
const RE_SSN_ENTRY = ["\\d{0,3}(\\.|[- ])?\\d{0,2}(\\.|[- ])?\\d{0,4}"];
const RE_SSN_COMMIT = ["\\d{3}(\\.|[- ])?\\d{2}(\\.|[- ])?\\d{4}"];
const ADBE = {
  Reader_Value_Asked: true,
  Viewer_Value_Asked: true,
};

export {
  ADBE,
  border,
  cursor,
  display,
  font,
  highlight,
  IDS_AM,
  IDS_GREATER_THAN,
  IDS_GT_AND_LT,
  IDS_INVALID_DATE,
  IDS_INVALID_DATE2,
  IDS_INVALID_MONTH,
  IDS_INVALID_VALUE,
  IDS_LESS_THAN,
  IDS_MONTH_INFO,
  IDS_PM,
  IDS_STARTUP_CONSOLE_MSG,
  position,
  RE_NUMBER_COMMIT_COMMA_SEP,
  RE_NUMBER_COMMIT_DOT_SEP,
  RE_NUMBER_ENTRY_COMMA_SEP,
  RE_NUMBER_ENTRY_DOT_SEP,
  RE_PHONE_COMMIT,
  RE_PHONE_ENTRY,
  RE_SSN_COMMIT,
  RE_SSN_ENTRY,
  RE_ZIP_COMMIT,
  RE_ZIP_ENTRY,
  RE_ZIP4_COMMIT,
  RE_ZIP4_ENTRY,
  scaleHow,
  scaleWhen,
  style,
  trans,
  zoomtype,
};
