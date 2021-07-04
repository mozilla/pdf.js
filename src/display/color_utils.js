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
const themeCacheKeys = ["brightness", "contrast", "sepia"];

function getCacheId(rgb, theme) {
  return rgbCacheKeys
    .map(k => rgb[k])
    .concat(themeCacheKeys.map(k => theme[k]))
    .join(";");
}

function getNumbersFromString(str, splitter, range, units) {
  const raw = str.split(splitter).filter(x => x);
  const unitsList = Object.entries(units);
  const numbers = raw
    .map(r => r.trim())
    .map((r, i) => {
      let n;
      const unit = unitsList.find(([u]) => r.endsWith(u));
      if (unit) {
        n =
          (parseFloat(r.substring(0, r.length - unit[0].length)) / unit[1]) *
          range[i];
      } else {
        n = parseFloat(r);
      }
      if (range[i] > 1) {
        return Math.round(n);
      }
      return n;
    });
  return numbers;
}

const rgbSplitter = /rgba?|\(|\)|\/|,|\s/gi;
const rgbRange = [255, 255, 255, 1];
const rgbUnits = { "%": 100 };

function parseRGB($rgb) {
  const [r, g, b, a = 1] = getNumbersFromString(
    $rgb,
    rgbSplitter,
    rgbRange,
    rgbUnits
  );
  return { r, g, b, a };
}

function modifyColorWithCache(rgb, theme) {
  const id = getCacheId(rgb, theme);
  if (colorModificationCache.has(id)) {
    return colorModificationCache.get(id);
  }
  const matrix = createFilterMatrix(theme);
  const { r, g, b } = rgb;
  const [rf, gf, bf] = applyColorMatrix([r, g, b], matrix);

  colorModificationCache.set(id, [rf, gf, bf]);
  return [rf, gf, bf];
}

function modifyColor(rgb) {
  return modifyColorWithCache(rgb, { mode: 1, sepia: 15, brightness: 80 });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyColorMatrix([r, g, b], matrix) {
  const rgb = [[r / 255], [g / 255], [b / 255], [1], [1]];
  const result = multiplyMatrices(matrix, rgb);
  return [0, 1, 2].map(i => clamp(Math.round(result[i][0] * 255), 0, 255));
}

function createFilterMatrix(config) {
  let m = Matrix.identity();
  if (config.sepia && config.sepia !== 0) {
    m = multiplyMatrices(m, Matrix.sepia(config.sepia / 100));
  }
  if (config.contrast && config.contrast !== 100) {
    m = multiplyMatrices(m, Matrix.contrast(config.contrast / 100));
  }
  if (config.brightness && config.brightness !== 100) {
    m = multiplyMatrices(m, Matrix.brightness(config.brightness / 100));
  }
  if (config.mode && config.mode === 1) {
    m = multiplyMatrices(m, Matrix.invertNHue());
  }
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

  contrast(v) {
    const t = (1 - v) / 2;
    return [
      [v, 0, 0, 0, t],
      [0, v, 0, 0, t],
      [0, 0, v, 0, t],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  sepia(v) {
    return [
      [
        0.393 + 0.607 * (1 - v),
        0.769 - 0.769 * (1 - v),
        0.189 - 0.189 * (1 - v),
        0,
        0,
      ],
      [
        0.349 - 0.349 * (1 - v),
        0.686 + 0.314 * (1 - v),
        0.168 - 0.168 * (1 - v),
        0,
        0,
      ],
      [
        0.272 - 0.272 * (1 - v),
        0.534 - 0.534 * (1 - v),
        0.131 + 0.869 * (1 - v),
        0,
        0,
      ],
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

export { modifyColor, parseRGB };
