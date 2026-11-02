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

import {
  _isValidExplicitDest,
  isNodeJS,
  OPS,
  stringToBytes,
  warn,
} from "../shared/util.js";
import { MathClamp } from "../shared/math_clamp.js";

// Deprecated API function -- display regardless of the `verbosity` setting.
function deprecated(details) {
  // eslint-disable-next-line no-console
  console.log("Deprecated API usage: " + details);
}

function getImageScaleIntent(intentStates, cacheKey, viewport, outputScale) {
  let imageScale =
    2 **
    MathClamp(
      Math.ceil(Math.log2(viewport.scale * viewport.userUnit * outputScale)),
      -8,
      8
    );
  let finer = Infinity;
  for (const [key, state] of intentStates) {
    if (state.baseCacheKey !== cacheKey || state.streamFailed) {
      continue;
    }
    // An operator list without reduced images is valid for every
    // resolution, whereas one with reduced images is only valid for its
    // own resolution and coarser ones.
    if (state.operatorList.lastChunk && !state.operatorList.hasReducedImages) {
      return { cacheKey: key, imageScale: state.imageScale };
    }
    if (state.imageScale >= imageScale) {
      finer = Math.min(finer, state.imageScale);
    }
  }
  if (finer !== Infinity) {
    imageScale = finer;
  }
  return { cacheKey: `${cacheKey}_s${imageScale}`, imageScale };
}

function addPageObjIds(fnArray, argsArray, objIds) {
  for (let i = 0, ii = fnArray.length; i < ii; i++) {
    const args = argsArray[i];
    switch (fnArray[i]) {
      case OPS.dependency:
        for (const objId of args) {
          if (!objId.startsWith("g_")) {
            objIds.add(objId);
          }
        }
        break;
      case OPS.shadingFill:
        objIds.add(args[0]);
        break;
      case OPS.setFillColorN:
      case OPS.setStrokeColorN:
        if (args[0] === "Shading") {
          objIds.add(args[1]);
        } else if (args[0] === "TilingPattern") {
          addPageObjIds(args[2].fnArray, args[2].argsArray, objIds);
        }
        break;
    }
  }
}

function releaseReducedImages(intentStates, objs, transport, pageProxyId) {
  const keptStates = new Map();
  for (const state of intentStates.values()) {
    const { baseCacheKey, imageScale, operatorList, streamFailed } = state;
    if (!baseCacheKey || !operatorList.lastChunk || streamFailed) {
      continue;
    }
    const kept = keptStates.get(baseCacheKey);
    if (
      !kept ||
      (kept.operatorList.hasReducedImages &&
        (!operatorList.hasReducedImages || imageScale > kept.imageScale))
    ) {
      keptStates.set(baseCacheKey, state);
    }
  }
  const objIds = new Set();
  for (const [cacheKey, state] of intentStates) {
    const { baseCacheKey, operatorList, renderTasks } = state;
    const kept = keptStates.get(baseCacheKey);
    if (
      !kept ||
      kept === state ||
      !operatorList.lastChunk ||
      renderTasks.size > 0
    ) {
      continue;
    }
    addPageObjIds(operatorList.fnArray, operatorList.argsArray, objIds);
    intentStates.delete(cacheKey);
    transport.releaseOperatorList(pageProxyId, operatorList);
  }
  for (const objId of objIds) {
    objs.get(objId, () => {
      objs.delete(objId);
      transport.releaseObj(pageProxyId, objId);
    });
  }
}

function getUrlProp(val) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    return null; // The 'url' is unused with `PDFDataRangeTransport`.
  }
  if (val instanceof URL) {
    return val;
  }
  if (typeof val === "string") {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("GENERIC") &&
      isNodeJS
    ) {
      if (/^[a-z][a-z0-9\-+.]+:/i.test(val)) {
        return new URL(val);
      }
      // eslint-disable-next-line no-undef
      const url = process.getBuiltinModule("url");
      return new URL(url.pathToFileURL(val));
    }

    // The full path is required in the 'url' field.
    const url = URL.parse(val, window.location);
    if (url) {
      return url;
    }
  }
  throw new Error(
    "Invalid PDF url data: " +
      "either string or URL-object is expected in the url property."
  );
}

function getDataProp(val) {
  // Converting string or array-like data to Uint8Array.
  if (
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("GENERIC") &&
    isNodeJS &&
    typeof Buffer !== "undefined" && // eslint-disable-line no-undef
    val instanceof Buffer // eslint-disable-line no-undef
  ) {
    throw new Error(
      "Please provide binary data as `Uint8Array`, rather than `Buffer`."
    );
  }
  if (val instanceof Uint8Array && val.byteLength === val.buffer.byteLength) {
    // Use the data as-is when it's already a Uint8Array that completely
    // "utilizes" its underlying ArrayBuffer, to prevent any possible
    // issues when transferring it to the worker-thread.
    return val;
  }
  if (typeof val === "string") {
    return stringToBytes(val);
  }
  if (
    val instanceof ArrayBuffer ||
    ArrayBuffer.isView(val) ||
    (typeof val === "object" && !isNaN(val?.length))
  ) {
    return new Uint8Array(val);
  }
  throw new Error(
    "Invalid PDF binary data: either TypedArray, " +
      "string, or array-like object is expected in the data property."
  );
}

function getFactoryUrlProp(val) {
  if (typeof val !== "string") {
    return null;
  }
  if (val.endsWith("/")) {
    return val;
  }
  throw new Error(`Invalid factory url: "${val}" must include trailing slash.`);
}

const isRefProxy = v =>
  typeof v === "object" &&
  Number.isInteger(v?.num) &&
  v.num >= 0 &&
  Number.isInteger(v?.gen) &&
  v.gen >= 0;

const isNameProxy = v => typeof v === "object" && typeof v?.name === "string";

const isValidExplicitDest = _isValidExplicitDest.bind(
  null,
  /* validRef = */ isRefProxy,
  /* validName = */ isNameProxy
);

// Return false for invalid or opaque base URLs.
function isSameOrigin(baseUrl, otherUrl) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    return false;
  }
  const base = URL.parse(baseUrl);
  if (!base?.origin || base.origin === "null") {
    return false;
  }
  const other = new URL(otherUrl, base);
  return base.origin === other.origin;
}

// Wrap cross-origin workers in blob modules for generic builds.
function getWorkerSrc(src) {
  if (
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("GENERIC") &&
    !isSameOrigin(window.location, src)
  ) {
    const wrapper = `await import("${new URL(src, window.location).href}");`;
    return URL.createObjectURL(
      new Blob([wrapper], { type: "text/javascript" })
    );
  }
  return src;
}

class LoopbackPort {
  #listeners = new Map();

  #deferred = Promise.resolve();

  postMessage(obj, transfer) {
    const event = {
      data: structuredClone(obj, transfer ? { transfer } : null),
    };

    this.#deferred.then(() => {
      for (const [listener] of this.#listeners) {
        listener.call(this, event);
      }
    });
  }

  addEventListener(name, listener, options = null) {
    let rmAbort = null;
    if (options?.signal instanceof AbortSignal) {
      const { signal } = options;
      if (signal.aborted) {
        warn("LoopbackPort - cannot use an `aborted` signal.");
        return;
      }
      const onAbort = () => this.removeEventListener(name, listener);
      rmAbort = () => signal.removeEventListener("abort", onAbort);

      signal.addEventListener("abort", onAbort);
    }
    this.#listeners.set(listener, rmAbort);
  }

  removeEventListener(name, listener) {
    const rmAbort = this.#listeners.get(listener);
    rmAbort?.();

    this.#listeners.delete(listener);
  }

  terminate() {
    for (const [, rmAbort] of this.#listeners) {
      rmAbort?.();
    }
    this.#listeners.clear();
  }
}

class StatTimer {
  #started = new Map();

  times = [];

  time(name) {
    if (this.#started.has(name)) {
      warn(`Timer is already running for ${name}`);
    }
    this.#started.set(name, Date.now());
  }

  timeEnd(name) {
    if (!this.#started.has(name)) {
      warn(`Timer has not been started for ${name}`);
    }
    this.times.push({
      name,
      start: this.#started.get(name),
      end: Date.now(),
    });
    // Remove timer from started so it can be called again.
    this.#started.delete(name);
  }

  toString() {
    // Find the longest name for padding purposes.
    const longest = Math.max(...this.times.map(t => t.name.length));

    return this.times
      .map(t => `${t.name.padEnd(longest)} ${t.end - t.start}ms\n`)
      .join("");
  }
}

export {
  deprecated,
  getDataProp,
  getFactoryUrlProp,
  getImageScaleIntent,
  getUrlProp,
  getWorkerSrc,
  isNameProxy,
  isRefProxy,
  isSameOrigin,
  isValidExplicitDest,
  LoopbackPort,
  releaseReducedImages,
  StatTimer,
};
