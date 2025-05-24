/* Copyright 2012 Mozilla Foundation
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

const INITIAL_DATA = Symbol("INITIAL_DATA");

/**
 * A PDF document and page is built of many objects. E.g. there are objects for
 * fonts, images, rendering code, etc. These objects may get processed inside of
 * a worker. This class implements some basic methods to manage these objects.
 */
class PDFObjects {
  #objs = Object.create(null);

  /**
   * Ensures there is an object defined for `objId`.
   *
   * @param {string} objId
   * @returns {Object}
   */
  #ensureObj(objId) {
    return (this.#objs[objId] ||= {
      ...Promise.withResolvers(),
      data: INITIAL_DATA,
    });
  }

  /**
   * If called *without* callback, this returns the data of `objId` but the
   * object needs to be resolved. If it isn't, this method throws.
   *
   * If called *with* a callback, the callback is called with the data of the
   * object once the object is resolved. That means, if you call this method
   * and the object is already resolved, the callback gets called right away.
   *
   * @param {string} objId
   * @param {function} [callback]
   * @returns {any}
   */
  get(objId, callback = null) {
    // If there is a callback, then the get can be async and the object is
    // not required to be resolved right now.
    if (callback) {
      const obj = this.#ensureObj(objId);
      obj.promise.then(() => callback(obj.data));
      return null;
    }
    // If there isn't a callback, the user expects to get the resolved data
    // directly.
    const obj = this.#objs[objId];
    // If there isn't an object yet or the object isn't resolved, then the
    // data isn't ready yet!
    if (!obj || obj.data === INITIAL_DATA) {
      throw new Error(`Requesting object that isn't resolved yet ${objId}.`);
    }
    return obj.data;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  has(objId) {
    const obj = this.#objs[objId];
    return !!obj && obj.data !== INITIAL_DATA;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  delete(objId) {
    const obj = this.#objs[objId];
    if (!obj || obj.data === INITIAL_DATA) {
      // Only allow removing the object *after* it's been resolved.
      return false;
    }
    delete this.#objs[objId];
    return true;
  }

  /**
   * Resolves the object `objId` with optional `data`.
   *
   * @param {string} objId
   * @param {any} [data]
   */
  resolve(objId, data = null) {
    const obj = this.#ensureObj(objId);
    obj.data = data;
    obj.resolve();
  }

  clear() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];
      data?.bitmap?.close(); // Release any `ImageBitmap` data.
    }
    this.#objs = Object.create(null);
  }

  *[Symbol.iterator]() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];

      if (data === INITIAL_DATA) {
        continue;
      }
      yield [objId, data];
    }
  }
}

export { PDFObjects };
