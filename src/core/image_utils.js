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

import { assert, shadow, unreachable, warn } from "../shared/util.js";
import { RefSetCache } from "./primitives.js";

class BaseLocalCache {
  constructor(options) {
    if (this.constructor === BaseLocalCache) {
      unreachable("Cannot initialize BaseLocalCache.");
    }
    if (!options || !options.onlyRefs) {
      this._nameRefMap = new Map();
      this._imageMap = new Map();
    }
    this._imageCache = new RefSetCache();
  }

  getByName(name) {
    const ref = this._nameRefMap.get(name);
    if (ref) {
      return this.getByRef(ref);
    }
    return this._imageMap.get(name) || null;
  }

  getByRef(ref) {
    return this._imageCache.get(ref) || null;
  }

  set(name, ref, data) {
    unreachable("Abstract method `set` called.");
  }
}

class LocalImageCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (!name) {
      throw new Error('LocalImageCache.set - expected "name" argument.');
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

class LocalColorSpaceCache extends BaseLocalCache {
  set(name = null, ref = null, data) {
    if (!name && !ref) {
      throw new Error(
        'LocalColorSpaceCache.set - expected "name" and/or "ref" argument.'
      );
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      if (name) {
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

  getByName(name) {
    unreachable("Should not call `getByName` method.");
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
    if (!name) {
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
  set(name, ref = null, data) {
    if (!name) {
      throw new Error(
        'LocalTilingPatternCache.set - expected "name" argument.'
      );
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

class GlobalImageCache {
  static get NUM_PAGES_THRESHOLD() {
    return shadow(this, "NUM_PAGES_THRESHOLD", 2);
  }

  static get MIN_IMAGES_TO_CACHE() {
    return shadow(this, "MIN_IMAGES_TO_CACHE", 10);
  }

  static get MAX_BYTE_SIZE() {
    return shadow(this, "MAX_BYTE_SIZE", /* Forty megabytes = */ 40e6);
  }

  constructor() {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        GlobalImageCache.NUM_PAGES_THRESHOLD > 1,
        "GlobalImageCache - invalid NUM_PAGES_THRESHOLD constant."
      );
    }
    this._refCache = new RefSetCache();
    this._imageCache = new RefSetCache();
  }

  get _byteSize() {
    let byteSize = 0;
    this._imageCache.forEach(imageData => {
      byteSize += imageData.byteSize;
    });
    return byteSize;
  }

  get _cacheLimitReached() {
    if (this._imageCache.size < GlobalImageCache.MIN_IMAGES_TO_CACHE) {
      return false;
    }
    if (this._byteSize < GlobalImageCache.MAX_BYTE_SIZE) {
      return false;
    }
    return true;
  }

  shouldCache(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    const numPages = pageIndexSet
      ? pageIndexSet.size + (pageIndexSet.has(pageIndex) ? 0 : 1)
      : 1;

    if (numPages < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return false;
    }
    if (!this._imageCache.has(ref) && this._cacheLimitReached) {
      return false;
    }
    return true;
  }

  addPageIndex(ref, pageIndex) {
    let pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      pageIndexSet = new Set();
      this._refCache.put(ref, pageIndexSet);
    }
    pageIndexSet.add(pageIndex);
  }

  /**
   * PLEASE NOTE: Must be called *after* the `setData` method.
   */
  addByteSize(ref, byteSize) {
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return; // The image data isn't cached (the limit was reached).
    }
    if (imageData.byteSize) {
      return; // The byte-size has already been set.
    }
    imageData.byteSize = byteSize;
  }

  getData(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      return null;
    }
    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return null;
    }
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return null;
    }
    // Ensure that we keep track of all pages containing the image reference.
    pageIndexSet.add(pageIndex);

    return imageData;
  }

  setData(ref, data) {
    if (!this._refCache.has(ref)) {
      throw new Error(
        'GlobalImageCache.setData - expected "addPageIndex" to have been called.'
      );
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    if (this._cacheLimitReached) {
      warn("GlobalImageCache.setData - cache limit reached.");
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear(onlyData = false) {
    if (!onlyData) {
      this._refCache.clear();
    }
    this._imageCache.clear();
  }
}

export {
  GlobalImageCache,
  LocalColorSpaceCache,
  LocalFunctionCache,
  LocalGStateCache,
  LocalImageCache,
  LocalTilingPatternCache,
};
