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

const Border = Object.freeze({
  s: "solid",
  d: "dashed",
  b: "beveled",
  i: "inset",
  u: "underline",
});

const Cursor = Object.freeze({
  visible: 0,
  hidden: 1,
  delay: 2,
});

const Display = Object.freeze({
  visible: 0,
  hidden: 1,
  noPrint: 2,
  noView: 3,
});

const Font = Object.freeze({
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

const Highlight = Object.freeze({
  n: "none",
  i: "invert",
  p: "push",
  o: "outline",
});

const Position = Object.freeze({
  textOnly: 0,
  iconOnly: 1,
  iconTextV: 2,
  textIconV: 3,
  iconTextH: 4,
  textIconH: 5,
  overlay: 6,
});

const ScaleHow = Object.freeze({
  proportional: 0,
  anamorphic: 1,
});

const ScaleWhen = Object.freeze({
  always: 0,
  never: 1,
  tooBig: 2,
  tooSmall: 3,
});

const Style = Object.freeze({
  ch: "check",
  cr: "cross",
  di: "diamond",
  ci: "circle",
  st: "star",
  sq: "square",
});

const Trans = Object.freeze({
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

const ZoomType = Object.freeze({
  none: "NoVary",
  fitP: "FitPage",
  fitW: "FitWidth",
  fitH: "FitHeight",
  fitV: "FitVisibleWidth",
  pref: "Preferred",
  refW: "ReflowWidth",
});

export {
  Border,
  Cursor,
  Display,
  Font,
  Highlight,
  Position,
  ScaleHow,
  ScaleWhen,
  Style,
  Trans,
  ZoomType,
};
