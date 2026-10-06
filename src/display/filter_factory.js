/* Copyright 2015 Mozilla Foundation
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

import { unreachable } from "../shared/util.js";

class BaseFilterFactory {
  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseFilterFactory
    ) {
      unreachable("Cannot initialize BaseFilterFactory.");
    }
  }

  addFilter(maps) {
    return "none";
  }

  addHCMFilter(fgColor, bgColor) {
    return "none";
  }

  addAlphaFilter(map) {
    return "none";
  }

  addLuminosityFilter(map) {
    return "none";
  }

  addKnockoutFilter(alpha = 0) {
    return "none";
  }

  addHighlightHCMFilter(filterName, fgColor, bgColor, newFgColor, newBgColor) {
    return "none";
  }

  /**
   * Create a filter for the selection of text, given colors.
   * @param {string} fgColor
   * @param {string} bgColor
   * @returns {string}
   */
  addSelectionHCMFilter(fgColor, bgColor) {
    return "none";
  }

  /**
   * Create a filter for the selection of text.
   * @returns {string}
   */
  addSelectionFilter() {
    return "none";
  }

  /**
   * @param {object} [pageColors]
   * @param {string} [pageColors.background]
   * @param {string} [pageColors.foreground]
   * @returns {Record<string, string> | null}
   */
  createSelectionStyle(pageColors = null) {
    return null;
  }

  destroy(keepHCM = false) {}
}

export { BaseFilterFactory };
