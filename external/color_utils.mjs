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

import { styleText } from "util";

// NO_COLOR overrides TTY detection, FORCE_COLOR, and GitHub Actions.
const COLORS_ENABLED =
  !process.env.NO_COLOR &&
  (!!process.stdout.isTTY ||
    !!process.env.FORCE_COLOR ||
    process.env.GITHUB_ACTIONS === "true");

/**
 * @param {string | string[]} format - One or more `util.styleText` formats.
 * @param {string} text
 * @returns {string}
 */
function colorize(format, text) {
  return COLORS_ENABLED
    ? styleText(format, text, { validateStream: false })
    : text;
}

export { colorize, COLORS_ENABLED };
