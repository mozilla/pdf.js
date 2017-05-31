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

import '../external/webL10n/l10n';

var webL10n = document.webL10n;

class GenericL10n {
  constructor(lang) {
    this._lang = lang;
    this._ready = new Promise((resolve, reject) => {
      webL10n.setLanguage(lang, () => {
        resolve(webL10n);
      });
    });
  }

  getDirection() {
    return this._ready.then((l10n) => {
      return l10n.getDirection();
    });
  }

  get(property, args, fallback) {
    return this._ready.then((l10n) => {
      return l10n.get(property, args, fallback);
    });
  }

  translate(element) {
    return this._ready.then((l10n) => {
      return l10n.translate(element);
    });
  }
}

export {
  GenericL10n,
};
