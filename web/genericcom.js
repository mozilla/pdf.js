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

import { AppOptions } from "./app_options.js";
import { BaseExternalServices } from "./external_services.js";
import { BasePreferences } from "./preferences.js";
import { GenericL10n } from "./genericl10n.js";
import { GenericScripting } from "./generic_scripting.js";
import { SignatureStorage } from "./generic_signature_storage.js";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/genericcom" shall not be used outside GENERIC build.'
  );
}

function initCom(app) {}

class Preferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    localStorage.setItem("pdfjs.preferences", JSON.stringify(prefObj));
  }

  async _readFromStorage(prefObj) {
    return { prefs: JSON.parse(localStorage.getItem("pdfjs.preferences")) };
  }
}

class ExternalServices extends BaseExternalServices {
  async createL10n() {
    return new GenericL10n(AppOptions.get("localeProperties")?.lang);
  }

  createScripting() {
    return new GenericScripting(AppOptions.get("sandboxBundleSrc"));
  }

  createSignatureStorage(eventBus, signal) {
    return new SignatureStorage(eventBus, signal);
  }
}

class MLManager {
  async isEnabledFor(_name) {
    return false;
  }

  async deleteModel(_service) {
    return null;
  }

  isReady(_name) {
    return false;
  }

  guess(_data) {}

  toggleService(_name, _enabled) {}

  static getFakeMLManager(options) {
    return new FakeMLManager(options);
  }
}

class FakeMLManager {
  eventBus = null;

  hasProgress = false;

  constructor({ enableGuessAltText, enableAltTextModelDownload }) {
    this.enableGuessAltText = enableGuessAltText;
    this.enableAltTextModelDownload = enableAltTextModelDownload;
  }

  setEventBus(eventBus, abortSignal) {
    this.eventBus = eventBus;
  }

  async isEnabledFor(_name) {
    return this.enableGuessAltText;
  }

  async deleteModel(_name) {
    this.enableAltTextModelDownload = false;
    return null;
  }

  async loadModel(_name) {}

  async downloadModel(_name) {
    // Simulate downloading the model but with progress.
    // The progress can be seen in the new alt-text dialog.
    this.hasProgress = true;

    const { promise, resolve } = Promise.withResolvers();
    const total = 1e8;
    const end = 1.5 * total;
    const increment = 5e6;
    let loaded = 0;
    const id = setInterval(() => {
      loaded += increment;
      if (loaded <= end) {
        this.eventBus.dispatch("loadaiengineprogress", {
          source: this,
          detail: {
            total,
            totalLoaded: loaded,
            finished: loaded + increment >= end,
          },
        });
        return;
      }
      clearInterval(id);
      this.hasProgress = false;
      this.enableAltTextModelDownload = true;
      resolve(true);
    }, 900);
    return promise;
  }

  isReady(_name) {
    return this.enableAltTextModelDownload;
  }

  guess({ request: { data } }) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(data ? { output: "Fake alt text." } : { error: true });
      }, 3000);
    });
  }

  toggleService(_name, enabled) {
    this.enableGuessAltText = enabled;
  }
}

export { ExternalServices, initCom, MLManager, Preferences };
