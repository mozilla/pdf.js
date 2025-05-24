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
  stringToBytes,
  warn,
} from "../shared/util.js";

function getUrlProp(val) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    return null; // The 'url' is unused with `PDFDataRangeTransport`.
  }
  if (val instanceof URL) {
    return val.href;
  }
  if (typeof val === "string") {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("GENERIC") &&
      isNodeJS
    ) {
      return val; // Use the url as-is in Node.js environments.
    }

    // The full path is required in the 'url' field.
    const url = URL.parse(val, window.location);
    if (url) {
      return url.href;
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

export {
  getDataProp,
  getFactoryUrlProp,
  getUrlProp,
  isNameProxy,
  isRefProxy,
  isValidExplicitDest,
  LoopbackPort,
};
