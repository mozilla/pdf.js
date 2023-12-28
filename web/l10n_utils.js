/* Copyright 2021 Mozilla Foundation
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

import { fetchData, shadow } from "pdfjs-lib";
import { FluentBundle, FluentResource } from "fluent-bundle";
import { DOMLocalization } from "fluent-dom";
import { L10n } from "./l10n.js";

/**
 * @implements {IL10n}
 */
class ConstL10n extends L10n {
  constructor(lang) {
    super({ lang });
    this._setL10n(
      new DOMLocalization([], ConstL10n.#generateBundles.bind(ConstL10n, lang))
    );
  }

  static async *#generateBundles(lang) {
    const text =
      typeof PDFJSDev === "undefined"
        ? await fetchData(
            new URL(`./locale/${lang}/viewer.ftl`, window.location.href),
            /* type = */ "text"
          )
        : PDFJSDev.eval("DEFAULT_FTL");

    const resource = new FluentResource(text);
    const bundle = new FluentBundle(lang);
    const errors = bundle.addResource(resource);
    if (errors.length) {
      console.error("L10n errors", errors);
    }
    yield bundle;
  }

  static get instance() {
    return shadow(this, "instance", new ConstL10n("en-us"));
  }
}

/**
 * No-op implementation of the localization service.
 * @implements {IL10n}
 */
const NullL10n = {
  getLanguage() {
    return ConstL10n.instance.getLanguage();
  },

  getDirection() {
    return ConstL10n.instance.getDirection();
  },

  async get(ids, args = null, fallback) {
    return ConstL10n.instance.get(ids, args, fallback);
  },

  async translate(element) {
    return ConstL10n.instance.translate(element);
  },

  pause() {
    return ConstL10n.instance.pause();
  },

  resume() {
    return ConstL10n.instance.resume();
  },
};

export { NullL10n };
