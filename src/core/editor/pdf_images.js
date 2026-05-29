/* Copyright 2026 Mozilla Foundation
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

import { Dict, Name } from "../primitives.js";
import { FeatureTest } from "../../shared/util.js";
import { Stream } from "../stream.js";

// Below this many distinct RGB triples, Flate+Predictor 15 (PNG-style) is
// generally smaller than JPEG at visually equivalent quality, since the data
// is dominated by flat regions and sharp edges where JPEG performs poorly.
const FLATE_COLOR_COUNT_THRESHOLD = 16384;

function createImageDict(xref, width, height, colorSpace) {
  const image = new Dict(xref);
  image.set("Type", Name.get("XObject"));
  image.set("Subtype", Name.get("Image"));
  image.set("BitsPerComponent", 8);
  image.setIfName("ColorSpace", colorSpace);
  image.set("Width", width);
  image.set("Height", height);

  return image;
}

function createRawImage(buffer, dict) {
  return new Stream(buffer, 0, buffer.length, dict);
}

function paethPredictor(left, above, upperLeft) {
  const p = left + above - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - above);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  return pb <= pc ? above : upperLeft;
}

function applyPNGOptimumFilter(data, width, height, bytesPerPixel) {
  const rowSize = width * bytesPerPixel;
  const out = new Uint8Array(height * (rowSize + 1));
  const candidates = [
    new Uint8Array(rowSize), // 0: None
    new Uint8Array(rowSize), // 1: Sub
    new Uint8Array(rowSize), // 2: Up
    new Uint8Array(rowSize), // 3: Average
    new Uint8Array(rowSize), // 4: Paeth
  ];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    const prevRowOffset = rowOffset - rowSize;
    const scores = [0, 0, 0, 0, 0];
    for (let x = 0; x < rowSize; x++) {
      const offset = rowOffset + x;
      const cur = data[offset];
      const left = x >= bytesPerPixel ? data[offset - bytesPerPixel] : 0;
      const above = y > 0 ? data[prevRowOffset + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? data[prevRowOffset + x - bytesPerPixel]
          : 0;
      candidates[0][x] = cur;
      candidates[1][x] = (cur - left) & 0xff;
      candidates[2][x] = (cur - above) & 0xff;
      candidates[3][x] = (cur - ((left + above) >> 1)) & 0xff;
      candidates[4][x] = (cur - paethPredictor(left, above, upperLeft)) & 0xff;
      // Sum of absolute signed-byte values: the standard "minimum sum"
      // heuristic for picking the best filter per row.
      for (let f = 0; f < 5; f++) {
        const v = candidates[f][x];
        scores[f] += v < 128 ? v : 256 - v;
      }
    }

    let bestFilter = 0;
    for (let f = 1; f < 5; f++) {
      if (scores[f] < scores[bestFilter]) {
        bestFilter = f;
      }
    }

    const outOffset = y * (rowSize + 1);
    out[outOffset] = bestFilter;
    out.set(candidates[bestFilter], outOffset + 1);
  }

  return out;
}

async function deflate(bytes) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const writePromise = (async () => {
    try {
      await writer.ready;
      await writer.write(bytes);
      await writer.ready;
      await writer.close();
    } catch (reason) {
      await writer.abort(reason).catch(() => {});
      throw reason;
    }
  })();
  const [compressed] = await Promise.all([
    new Response(cs.readable).bytes(),
    writePromise.then(() => null),
  ]);
  return compressed;
}

async function createPNGLikeImage(buffer, width, height, dict) {
  const bytesPerPixel = buffer.length / (width * height);
  let compressed;
  if (typeof CompressionStream === "function") {
    try {
      const filtered = applyPNGOptimumFilter(
        buffer,
        width,
        height,
        bytesPerPixel
      );
      compressed = await deflate(filtered);
    } catch {}
  }

  if (!compressed) {
    return createRawImage(buffer, dict);
  }

  dict.setIfName("Filter", "FlateDecode");
  const decodeParms = new Dict(dict.xref);
  decodeParms.set("Predictor", 15);
  decodeParms.set("Columns", width);
  decodeParms.set("Colors", bytesPerPixel);
  decodeParms.set("BitsPerComponent", 8);
  dict.set("DecodeParms", decodeParms);

  return createRawImage(compressed, dict);
}

async function createImage(bitmap, xref, { closeBitmap = false } = {}) {
  // TODO: when printing, we could have a specific internal colorspace
  // (e.g. something like DeviceRGBA) in order avoid any conversion (i.e. no
  // jpeg, no rgba to rgb conversion, etc...)

  const { width, height } = bitmap;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    if (closeBitmap) {
      bitmap.close?.();
    }
    throw new Error(
      `createImage: invalid bitmap dimensions ${width}x${height}`
    );
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });

  let data;
  try {
    ctx.drawImage(bitmap, 0, 0);
    data = ctx.getImageData(0, 0, width, height).data;
  } finally {
    if (closeBitmap) {
      bitmap.close?.();
    }
  }
  const buf32 = new Uint32Array(
    data.buffer,
    data.byteOffset,
    data.byteLength >> 2
  );

  // Bitwise masks are signed in JS, so extracting alpha via `(v & 0xff000000)`
  // would misclassify every opaque pixel as transparent on little-endian
  // platforms — use the byte-level shift/mask instead.
  const isLE = FeatureTest.isLittleEndian;
  const rgbMask = isLE ? 0x00ffffff : 0xffffff00;
  const colorCounter = new Set();
  let hasAlpha = false;
  let useFlate = true;
  for (let i = 0, ii = buf32.length; i < ii; i++) {
    const v = buf32[i];
    if ((isLE ? v >>> 24 : v & 0xff) !== 0xff) {
      hasAlpha = true;
      break;
    }
    if (useFlate) {
      colorCounter.add((v & rgbMask) >>> 0);
      if (colorCounter.size > FLATE_COLOR_COUNT_THRESHOLD) {
        useFlate = false;
        colorCounter.clear();
      }
    }
  }

  if (hasAlpha) {
    // JPEG can bleed hidden/edge RGB into semi-transparent pixels. Keep alpha
    // images lossless instead.
    useFlate = true;
  }

  const image = createImageDict(xref, width, height, "DeviceRGB");

  let imageStreamPromise;
  let imageRenderStream = null;
  if (useFlate) {
    // Pack RGB triples without compositing over white: the SMask carries the
    // original alpha and the lossless RGB stream stays exact.
    const rgbBuffer = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0, ii = data.length; i < ii; i += 4, j += 3) {
      rgbBuffer[j] = data[i];
      rgbBuffer[j + 1] = data[i + 1];
      rgbBuffer[j + 2] = data[i + 2];
    }
    imageStreamPromise = createPNGLikeImage(rgbBuffer, width, height, image);
    imageRenderStream = createRawImage(
      rgbBuffer,
      createImageDict(xref, width, height, "DeviceRGB")
    );
  } else {
    image.setIfName("Filter", "DCTDecode");
    imageStreamPromise = canvas
      .convertToBlob({ type: "image/jpeg", quality: 1 })
      .then(blob => blob.bytes())
      .then(bytes => createRawImage(bytes, image));
  }

  let smaskStreamPromise = Promise.resolve(null);
  let smaskRenderStream = null;
  if (hasAlpha) {
    const alphaBuffer = new Uint8Array(buf32.length);
    if (isLE) {
      for (let i = 0, ii = buf32.length; i < ii; i++) {
        alphaBuffer[i] = buf32[i] >>> 24;
      }
    } else {
      for (let i = 0, ii = buf32.length; i < ii; i++) {
        alphaBuffer[i] = buf32[i] & 0xff;
      }
    }

    const smask = createImageDict(xref, width, height, "DeviceGray");
    const smaskRenderDict = createImageDict(xref, width, height, "DeviceGray");

    smaskStreamPromise = createPNGLikeImage(alphaBuffer, width, height, smask);
    smaskRenderStream = createRawImage(alphaBuffer, smaskRenderDict);
  }

  const [imageStream, smaskStream] = await Promise.all([
    imageStreamPromise,
    smaskStreamPromise,
  ]);

  return {
    imageStream,
    imageRenderStream,
    smaskStream,
    smaskRenderStream,
    width,
    height,
  };
}

export { createImage };
