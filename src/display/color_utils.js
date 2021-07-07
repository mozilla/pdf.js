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

const colorModificationCache = new Map();
const rgbCacheKeys = ["r", "g", "b"];

function getCacheId(rgb) {
  return rgbCacheKeys.map(k => rgb[k]).join(";");
}

function modifyColorWithCache(rgb) {
  const id = getCacheId(rgb);
  if (colorModificationCache.has(id)) {
    return colorModificationCache.get(id);
  }
  const matrix = createFilterMatrix();
  const [r, g, b] = applyColorMatrix(id.split(";"), matrix);

  colorModificationCache.set(id, [r, g, b]);
  return [r, g, b];
}

function modifyColor(rgb) {
  return modifyColorWithCache(rgb);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyColorMatrix([r, g, b], matrix) {
  const rgb = [[r / 255], [g / 255], [b / 255], [1], [1]];
  const result = multiplyMatrices(matrix, rgb);
  return [0, 1, 2].map(i => clamp(Math.round(result[i][0] * 255), 0, 255));
}

const BRIGHTNESS_VALUE = 80;
function createFilterMatrix() {
  let m = Matrix.identity();
  m = multiplyMatrices(m, Matrix.brightness(BRIGHTNESS_VALUE / 100));
  m = multiplyMatrices(m, Matrix.invertNHue());
  return m;
}

const Matrix = {
  identity() {
    return [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  invertNHue() {
    return [
      [0.333, -0.667, -0.667, 0, 1],
      [-0.667, 0.333, -0.667, 0, 1],
      [-0.667, -0.667, 0.333, 0, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  brightness(v) {
    return [
      [v, 0, 0, 0, 0],
      [0, v, 0, 0, 0],
      [0, 0, v, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },
};

function multiplyMatrices(m1, m2) {
  const result = [];
  for (let i = 0, len = m1.length; i < len; i++) {
    result[i] = [];
    for (let j = 0, len2 = m2[0].length; j < len2; j++) {
      let sum = 0;
      for (let k = 0, len3 = m1[0].length; k < len3; k++) {
        sum += m1[i][k] * m2[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

export { modifyColor };
