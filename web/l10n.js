/* Copyright 2023 Mozilla Foundation
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

/**
 * NOTE: The L10n-implementations should use lowercase language-codes
 *       internally.
 * @implements {IL10n}
 */
class L10n {
  #dir;

  #elements;

  #lang;

  #l10n;

  constructor({ lang, isRTL }, l10n = null) {
    this.#lang = L10n.#fixupLangCode(lang);
    this.#l10n = l10n;
    this.#dir = (isRTL ?? L10n.#isRTL(this.#lang)) ? "rtl" : "ltr";
  }

  _setL10n(l10n) {
    this.#l10n = l10n;
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      document.l10n = l10n;
    }
  }

  /** @inheritdoc */
  getLanguage() {
    return this.#lang;
  }

  /** @inheritdoc */
  getDirection() {
    return this.#dir;
  }

  /** @inheritdoc */
  async get(ids, args = null, fallback) {
    if (Array.isArray(ids)) {
      ids = ids.map(id => ({ id }));
      const messages = await this.#l10n.formatMessages(ids);
      return messages.map(message => message.value);
    }

    const messages = await this.#l10n.formatMessages([
      {
        id: ids,
        args,
      },
    ]);
    return messages[0]?.value || fallback;
  }

  /** @inheritdoc */
  async translate(element) {
    (this.#elements ||= new Set()).add(element);
    try {
      this.#l10n.connectRoot(element);
      await this.#l10n.translateRoots();
    } catch {
      // Element is under an existing root, so there is no need to add it again.
    }
  }

  /** @inheritdoc */
  async translateOnce(element) {
    try {
      await this.#l10n.translateElements([element]);
    } catch (ex) {
      console.error("translateOnce:", ex);
    }
  }

  /** @inheritdoc */
  async destroy() {
    if (this.#elements) {
      for (const element of this.#elements) {
        this.#l10n.disconnectRoot(element);
      }
      this.#elements.clear();
      this.#elements = null;
    }
    this.#l10n.pauseObserving();
  }

  /** @inheritdoc */
  pause() {
    this.#l10n.pauseObserving();
  }

  /** @inheritdoc */
  resume() {
    this.#l10n.resumeObserving();
  }

  static #fixupLangCode(langCode) {
    // Use only lowercase language-codes internally, and fallback to English.
    langCode = langCode?.toLowerCase() || "en-us";

    // Try to support "incompletely" specified language codes (see issue 13689).
    const PARTIAL_LANG_CODES = {
      en: "en-us",
      es: "es-es",
      fy: "fy-nl",
      ga: "ga-ie",
      gu: "gu-in",
      hi: "hi-in",
      hy: "hy-am",
      nb: "nb-no",
      ne: "ne-np",
      nn: "nn-no",
      pa: "pa-in",
      pt: "pt-pt",
      sv: "sv-se",
      zh: "zh-cn",
    };
    return PARTIAL_LANG_CODES[langCode] || langCode;
  }

  static #isRTL(lang) {
    const shortCode = lang.split("-", 1)[0];
    return ["ar", "he", "fa", "ps", "ur"].includes(shortCode);
  }
}

const GenericL10n = null;

export { GenericL10n, L10n };
