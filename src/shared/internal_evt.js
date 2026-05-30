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

/**
 * Keep this file in sync with `web/internal_evt.js`.
 */

const INTERNAL_EVT =
  typeof PDFJSDev !== "undefined" && !PDFJSDev.test("TESTING")
    ? PDFJSDev.eval("INTERNAL_EVT")
    : "internalEvent";

const internalOpt = Object.freeze({ internal: INTERNAL_EVT });

export { INTERNAL_EVT, internalOpt };
