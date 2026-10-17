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

class ProxyHandler {
  get(obj, prop) {
    // script may add some properties to the object
    if (prop in obj._expandos) {
      const val = obj._expandos[prop];
      return typeof val === "function" ? val.bind(obj) : val;
    }

    if (typeof prop === "string" && !prop.startsWith("_") && prop in obj) {
      // return only public properties
      // i.e. the ones not starting with a '_'
      const val = obj[prop];
      return typeof val === "function" ? val.bind(obj) : val;
    }

    return undefined;
  }

  set(obj, prop, value) {
    if (typeof prop === "string" && !prop.startsWith("_") && prop in obj) {
      // The setters update the view and the descendant fields.
      obj[prop] = value;
    } else {
      obj._expandos[prop] = value;
    }
    return true;
  }

  has(obj, prop) {
    return (
      prop in obj._expandos ||
      (typeof prop === "string" && !prop.startsWith("_") && prop in obj)
    );
  }

  getPrototypeOf(obj) {
    return null;
  }

  setPrototypeOf(obj, proto) {
    return false;
  }

  isExtensible(obj) {
    return true;
  }

  preventExtensions(obj) {
    return false;
  }

  getOwnPropertyDescriptor(obj, prop) {
    if (prop in obj._expandos) {
      return {
        configurable: true,
        enumerable: true,
        value: obj._expandos[prop],
      };
    }

    return typeof prop === "string" && !prop.startsWith("_") && prop in obj
      ? { configurable: true, enumerable: true, value: obj[prop] }
      : undefined;
  }

  defineProperty(obj, key, descriptor) {
    Object.defineProperty(obj._expandos, key, descriptor);
    return true;
  }

  deleteProperty(obj, prop) {
    if (prop in obj._expandos) {
      delete obj._expandos[prop];
    }
  }

  ownKeys(obj) {
    const fromExpandos = Reflect.ownKeys(obj._expandos);
    const fromObj = Reflect.ownKeys(obj).filter(k => !k.startsWith("_"));
    return fromExpandos.concat(fromObj);
  }
}

export { ProxyHandler };
