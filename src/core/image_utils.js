/* Copyright 2019 Mozilla Foundation
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
  assert,
  FeatureTest,
  makeSet,
  unreachable,
  warn,
} from "../shared/util.js";
import { RefMap, RefSet } from "./primitives.js";
import { ImageResizer } from "./image_resizer.js";

function getUsableImage(data, targetSize) {
  if (!data) {
    return null;
  }
  const { jpx } = data;
  if (!jpx) {
    return data;
  }
  const isFineEnough = part =>
    !part ||
    ImageResizer.getReducePowerForTargetSize(part, targetSize) >= part.reduce;
  return isFineEnough(jpx.image) && isFineEnough(jpx.alpha) ? data : null;
}

function getJpxReduceLevels(jpx) {
  return jpx && { image: jpx.image.reduce, alpha: jpx.alpha?.reduce ?? null };
}

function setJpxReduceLevels(jpx, { image, alpha }) {
  jpx.image.reduce = image;
  if (jpx.alpha) {
    jpx.alpha.reduce = alpha;
  }
}

function isJpxReduceAtMost(jpxReduce, otherJpxReduce) {
  return (
    jpxReduce.image <= otherJpxReduce.image &&
    jpxReduce.alpha <= otherJpxReduce.alpha
  );
}

function isFinerJpxReduce(jpxReduce, otherJpxReduce) {
  return (
    !!jpxReduce &&
    isJpxReduceAtMost(jpxReduce, otherJpxReduce) &&
    !isJpxReduceAtMost(otherJpxReduce, jpxReduce)
  );
}

function canReplaceImage(cachedData, data) {
  return (
    !cachedData ||
    isFinerJpxReduce(
      getJpxReduceLevels(data.jpx),
      getJpxReduceLevels(cachedData.jpx)
    )
  );
}

class BaseLocalCache {
  constructor(options) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseLocalCache
    ) {
      unreachable("Cannot initialize BaseLocalCache.");
    }
    this._onlyRefs = options?.onlyRefs === true;

    if (!this._onlyRefs) {
      this._nameRefMap = new Map();
      this._imageMap = new Map();
    }
    this._imageCache = new RefMap();
  }

  getByName(name) {
    if (this._onlyRefs) {
      unreachable("Should not call `getByName` method.");
    }
    const ref = this._nameRefMap.get(name);
    return ref ? this.getByRef(ref) : this._imageMap.get(name) || null;
  }

  getByRef(ref) {
    return this._imageCache.get(ref) || null;
  }

  set(name, ref, data) {
    unreachable("Abstract method `set` called.");
  }
}

class LocalImageCache extends BaseLocalCache {
  getByName(name, targetSize = null) {
    const ref = this._nameRefMap.get(name);
    return ref
      ? this.getByRef(ref, targetSize)
      : getUsableImage(this._imageMap.get(name), targetSize);
  }

  getByRef(ref, targetSize = null) {
    return getUsableImage(this._imageCache.get(ref), targetSize);
  }

  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalImageCache.set - expected "name" argument.');
    }
    if (ref) {
      if (!canReplaceImage(this._imageCache.get(ref), data)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (!canReplaceImage(this._imageMap.get(name), data)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalColorSpaceCache extends BaseLocalCache {
  set(name = null, ref = null, data) {
    if (typeof name !== "string" && !ref) {
      throw new Error(
        'LocalColorSpaceCache.set - expected "name" and/or "ref" argument.'
      );
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      if (name !== null) {
        // Optional when `ref` is defined.
        this._nameRefMap.set(name, ref);
      }
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalFunctionCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalFunctionCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class LocalGStateCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalGStateCache.set - expected "name" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalTilingPatternCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalTilingPatternCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class RegionalImageCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  getByRef(ref, targetSize = null) {
    return getUsableImage(this._imageCache.get(ref), targetSize);
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('RegionalImageCache.set - expected "ref" argument.');
    }
    if (!canReplaceImage(this._imageCache.get(ref), data)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class GlobalColorSpaceCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('GlobalColorSpaceCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear() {
    this._imageCache.clear();
  }
}

class GlobalImageCache {
  static NUM_PAGES_THRESHOLD = 2;

  static MIN_IMAGES_TO_CACHE = 10;

  static MAX_BYTE_SIZE = 5e7; // Fifty megabytes.

  #decodeFailedSet = new RefSet();

  // Page images kept as VideoFrames for global reuse.
  #decodedImages = new RefMap();

  constructor() {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        GlobalImageCache.NUM_PAGES_THRESHOLD > 1,
        "GlobalImageCache - invalid NUM_PAGES_THRESHOLD constant."
      );
    }
    this._refCache = new RefMap();
    this._imageCache = new RefMap();
  }

  get #byteSize() {
    let byteSize = 0;
    for (const imageData of this._imageCache) {
      byteSize += imageData.byteSize;
    }
    return byteSize;
  }

  get #cacheLimitReached() {
    return (
      this._imageCache.size >= GlobalImageCache.MIN_IMAGES_TO_CACHE &&
      this.#byteSize >= GlobalImageCache.MAX_BYTE_SIZE
    );
  }

  shouldCache(ref, pageIndex, targetSize = null) {
    const pageIndexSet = this._refCache.getOrPutComputed(ref, makeSet);
    pageIndexSet.add(pageIndex);

    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return false;
    }
    if (
      !getUsableImage(this._imageCache.get(ref), targetSize) &&
      this.#cacheLimitReached
    ) {
      return false;
    }
    return true;
  }

  addDecodeFailed(ref) {
    this.#decodeFailedSet.put(ref);
  }

  hasDecodeFailed(ref) {
    return this.#decodeFailedSet.has(ref);
  }

  /**
   * Track the page before decoding so cleanup can discard the entry.
   * A finer image, kept or being decoded, isn't replaced by a coarser one.
   */
  startDecodedImage(ref, pageProxyId, jpxReduce = null) {
    if (!FeatureTest.isVideoFrameSupported) {
      return;
    }
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !FeatureTest.platform.isFirefox
    ) {
      return;
    }
    const entry = this.#decodedImages.get(ref);
    if (
      entry &&
      isFinerJpxReduce(entry.imgData?.jpxReduce ?? entry.jpxReduce, jpxReduce)
    ) {
      return;
    }
    entry?.imgData?.bitmap.close();
    this.#decodedImages.put(ref, { pageProxyId, jpxReduce, imgData: null });
  }

  setDecodedImage(ref, imgData) {
    const entry = this.#decodedImages.get(ref);
    if (
      !entry ||
      (entry.imgData &&
        !isFinerJpxReduce(imgData.jpxReduce, entry.imgData.jpxReduce))
    ) {
      return;
    }
    const { bitmap } = imgData;
    const prevImgData = entry.imgData;
    try {
      if (bitmap instanceof ImageBitmap) {
        entry.imgData = {
          ...imgData,
          bitmap: new VideoFrame(bitmap, { timestamp: 0 }),
        };
      } else if (bitmap instanceof VideoFrame) {
        entry.imgData = { ...imgData, bitmap: bitmap.clone() };
      }
    } catch (reason) {
      warn(`GlobalImageCache.setDecodedImage - "${reason}".`);
    }
    if (entry.imgData !== prevImgData) {
      prevImgData?.bitmap.close();
    } else if (!entry.imgData) {
      this.#decodedImages.remove(ref);
    }
  }

  /**
   * @returns {object | null} The cached image, owned by the caller, or null.
   */
  takeDecodedImage(ref, jpxReduce) {
    const imgData = this.#decodedImages.get(ref)?.imgData;
    if (!imgData) {
      return null;
    }
    this.#decodedImages.remove(ref);
    if (jpxReduce && !isJpxReduceAtMost(imgData.jpxReduce, jpxReduce)) {
      imgData.bitmap.close();
      return null;
    }
    return imgData;
  }

  cleanupPage(pageProxyId) {
    for (const [ref, entry] of this.#decodedImages.items()) {
      if (entry.pageProxyId === pageProxyId) {
        entry.imgData?.bitmap.close();
        this.#decodedImages.remove(ref);
      }
    }
  }

  /**
   * PLEASE NOTE: Must be called *after* the `setData` method.
   */
  addByteSize(ref, byteSize) {
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return; // The image data isn't cached (the limit was reached).
    }
    imageData.byteSize = Math.max(imageData.byteSize, byteSize);
  }

  getData(ref, pageIndex, targetSize = null) {
    const pageIndexSet = this._refCache.get(ref);
    if (
      !pageIndexSet ||
      pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD
    ) {
      return null;
    }
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return null;
    }
    // Ensure that we keep track of all pages containing the image reference.
    pageIndexSet.add(pageIndex);

    return getUsableImage(imageData, targetSize);
  }

  setData(ref, data) {
    if (!this._refCache.has(ref)) {
      throw new Error(
        'GlobalImageCache.setData - expected "shouldCache" to have been called.'
      );
    }
    if (!canReplaceImage(this._imageCache.get(ref), data)) {
      return;
    }
    if (this.#cacheLimitReached) {
      warn("GlobalImageCache.setData - cache limit reached.");
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear(onlyData = false) {
    if (!onlyData) {
      this.#decodeFailedSet.clear();
      this._refCache.clear();
    }
    this._imageCache.clear();

    for (const { imgData } of this.#decodedImages.values()) {
      imgData?.bitmap.close();
    }
    this.#decodedImages.clear();
  }
}

export {
  getJpxReduceLevels,
  GlobalColorSpaceCache,
  GlobalImageCache,
  LocalColorSpaceCache,
  LocalFunctionCache,
  LocalGStateCache,
  LocalImageCache,
  LocalTilingPatternCache,
  RegionalImageCache,
  setJpxReduceLevels,
};
