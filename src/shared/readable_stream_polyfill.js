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

function installReadableStreamAsyncIterator(ReadableStreamClass) {
  if (typeof ReadableStreamClass.prototype.values !== "function") {
    Object.defineProperty(ReadableStreamClass.prototype, "values", {
      configurable: true,
      writable: true,
      async *value({ preventCancel = false } = {}) {
        const reader = this.getReader();
        let completed = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              completed = true;
              return;
            }
            yield value;
          }
        } finally {
          try {
            if (!completed && !preventCancel) {
              await reader.cancel();
            }
          } finally {
            reader.releaseLock();
          }
        }
      },
    });
  }
  if (
    typeof ReadableStreamClass.prototype[Symbol.asyncIterator] !== "function"
  ) {
    Object.defineProperty(ReadableStreamClass.prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value: ReadableStreamClass.prototype.values,
    });
  }
}

export { installReadableStreamAsyncIterator };
