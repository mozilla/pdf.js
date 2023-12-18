/* Copyright 2017 Mozilla Foundation
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

/** @typedef {import("./interfaces").IL10n} IL10n */

import "../external/webL10n/l10n.js";
import { fixupLangCode, getL10nFallback } from "./l10n_utils.js";

const webL10n = document.webL10n;

/**
 * @implements {IL10n}
 */
class GenericL10n {
  constructor(lang) {
    // MODIF - Aadd setLanguage function for next 5 lines
    this.setLanguage(lang);
  }
  
  // build lang properties for localization
  setLanguage(lang) {
    this._lang = lang;
    this._ready = new Promise((resolve, reject) => {
      // MODIF - change translations loading for next 23 lines
      let L10n = [];
      try {
        L10n = require(`../l10n/${lang}/viewer.properties`);
      } catch(e) {
        L10n = require(`../l10n/en-US/viewer.properties`);
      }
      const props = {};
      for (let token in L10n) {
        if (!L10n.hasOwnProperty) {
          return;
        }
        const [key, subKey] = token.split('.');
        if (subKey) {
          props[key] = {};
          props[key][subKey] = L10n[token];
        } else {
          props[key] = {
            textContent: L10n[token]
          }
        }
      }
      webL10n.setData(lang, props);
      resolve(webL10n);
    });
  }

  async getLanguage() {
    const l10n = await this._ready;
    return l10n.getLanguage();
  }

  async getDirection() {
    const l10n = await this._ready;
    return l10n.getDirection();
  }

  async get(key, args = null, fallback = getL10nFallback(key, args)) {
    const l10n = await this._ready;
    return l10n.get(key, args, fallback);
  }

  async translate(element) {
    const l10n = await this._ready;
    return l10n.translate(element);
  }
}

export { GenericL10n };
