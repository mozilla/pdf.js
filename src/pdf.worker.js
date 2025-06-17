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

// Safari compatibility polyfills for worker context
if (!Promise.withResolvers) {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (!URL.parse) {
  URL.parse = function(url, baseUrl) {
    try {
      return new URL(url, baseUrl);
    } catch {
      return null;
    }
  };
}

import { WorkerMessageHandler } from "./core/worker.js";

console.log("[PDF.js Worker] Starting worker initialization");
console.log("[PDF.js Worker] User agent:", navigator.userAgent);
console.log("[PDF.js Worker] Worker global scope:", typeof globalThis);

globalThis.pdfjsWorker = {
  WorkerMessageHandler,
};

console.log("[PDF.js Worker] Global pdfjsWorker object created:", globalThis.pdfjsWorker);

export { WorkerMessageHandler };
