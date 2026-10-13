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

export {
  FORMS_VERSION,
  makeArr,
  makeMap,
  serializeError,
  USERACTIVATION_CALLBACKID,
  USERACTIVATION_MAXTIME_VALIDITY,
  VIEWER_TYPE,
  VIEWER_VARIATION,
  VIEWER_VERSION,
};
