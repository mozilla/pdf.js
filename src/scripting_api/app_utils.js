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

const VIEWER_TYPE = "PDF.js";
const VIEWER_VARIATION = "Full";
const VIEWER_VERSION = 21.00720099;
const FORMS_VERSION = 21.00720099;

const USERACTIVATION_CALLBACKID = 0;
const USERACTIVATION_MAXTIME_VALIDITY = 5000;

// `uncurryThis(fn)` gives a function calling `fn` with an explicit receiver,
// e.g. `uncurryThis(WeakMap.prototype.get)(map, key)`.
const { apply } = Reflect;

function uncurryThis(fn) {
  return (thisArg, ...args) => apply(fn, thisArg, args);
}

function serializeError(error, prefix = "") {
  // Scripts can throw non-Error values.
  let message;
  try {
    message = String(error);
  } catch {
    message = "Unknown error";
  }
  let stack;
  try {
    stack = error?.stack;
  } catch {}
  const value = typeof stack === "string" ? `${message}\n${stack}` : message;
  return { command: "error", value: `${prefix}${value}` };
}

// Helpers for simple `Map.prototype.getOrInsertComputed()` invocations,
// to avoid duplicate function creation.
const makeArr = () => [];
const makeMap = () => new Map();

const publicPrototypes = new Map();
const publicFunctions = new WeakSet();

/**
 * Register some functions which `Function.prototype.toString` shows as native
 * ones, see `useNativeToStringForPublicFunctions`.
 */
function addPublicFunctions(...fns) {
  for (const fn of fns) {
    if (typeof fn === "function") {
      publicFunctions.add(fn);
    }
  }
}

/**
 * Make an object look like a plain one: its prototype is replaced by an object
 * with the methods and accessors of its class, over Object.prototype.
 * With `bindMethods`, the methods are bound to the object, otherwise the new
 * prototype is shared by the instances of the class.
 */
function exposeObject(object, bindMethods = false) {
  const prototype = Object.getPrototypeOf(object);
  let publicPrototype = !bindMethods && publicPrototypes.get(prototype);
  if (!publicPrototype) {
    const descriptors = Object.getOwnPropertyDescriptors(prototype);
    delete descriptors.constructor;

    for (const descriptor of Object.values(descriptors)) {
      const { value, get, set } = descriptor;
      addPublicFunctions(value, get, set);
      if (bindMethods && typeof value === "function") {
        descriptor.value = value.bind(object);
      }
    }
    publicPrototype = Object.create(Object.prototype, descriptors);
    if (!bindMethods) {
      publicPrototypes.set(prototype, publicPrototype);
    }
  }
  return Object.setPrototypeOf(object, publicPrototype);
}

/**
 * Make `Function.prototype.toString` show the registered API functions as
 * native ones, like the built-in functions.
 */
function useNativeToStringForPublicFunctions() {
  const nativeToString = Function.prototype.toString;
  const isPublic = uncurryThis(WeakSet.prototype.has);
  // Match the engine's native-function format.
  const [prefix, suffix] = apply(nativeToString, nativeToString, []).split(
    "toString"
  );

  // Method syntax avoids adding a `prototype` property.
  const { toString } = {
    toString() {
      return isPublic(publicFunctions, this)
        ? `${prefix}${this.name}${suffix}`
        : apply(nativeToString, this, []);
    },
  };
  publicFunctions.add(toString);
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Function.prototype, "toString", {
    value: toString,
    writable: true,
    configurable: true,
  });
}

export {
  addPublicFunctions,
  exposeObject,
  FORMS_VERSION,
  makeArr,
  makeMap,
  serializeError,
  uncurryThis,
  useNativeToStringForPublicFunctions,
  USERACTIVATION_CALLBACKID,
  USERACTIVATION_MAXTIME_VALIDITY,
  VIEWER_TYPE,
  VIEWER_VARIATION,
  VIEWER_VERSION,
};
