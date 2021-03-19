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

const converters = {
  pt: x => x,
  cm: x => Math.round((x / 2.54) * 72),
  mm: x => Math.round((x / (10 * 2.54)) * 72),
  in: x => Math.round(x * 72),
};

function measureToString(m) {
  const conv = converters[m.unit];
  if (conv) {
    return `${conv(m.value)}px`;
  }
  return `${m.value}${m.unit}`;
}

function setWidthHeight(node, style) {
  if (node.w) {
    style.width = measureToString(node.w);
  } else {
    if (node.maxW && node.maxW.value > 0) {
      style.maxWidth = measureToString(node.maxW);
    }
    if (node.minW && node.minW.value > 0) {
      style.minWidth = measureToString(node.minW);
    }
  }

  if (node.h) {
    style.height = measureToString(node.h);
  } else {
    if (node.maxH && node.maxH.value > 0) {
      style.maxHeight = measureToString(node.maxH);
    }
    if (node.minH && node.minH.value > 0) {
      style.minHeight = measureToString(node.minH);
    }
  }
}

function setPosition(node, style) {
  style.transform = "";
  if (node.rotate) {
    style.transform = `rotate(-${node.rotate}deg) `;
    style.transformOrigin = "top left";
  }

  if (node.x !== "" || node.y !== "") {
    style.position = "absolute";
    style.left = node.x ? measureToString(node.x) : "0pt";
    style.top = node.y ? measureToString(node.y) : "0pt";
  }
}

export { measureToString, setPosition, setWidthHeight };
