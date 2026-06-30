/* Copyright 2024 Mozilla Foundation
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

class BaseExternalServices {
  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseExternalServices
    ) {
      throw new Error("Cannot initialize BaseExternalServices.");
    }
  }

  updateFindControlState(data) {}

  updateFindMatchesCount(data) {}

  initPassiveLoading() {}

  reportTelemetry(data) {}

  reportText(data) {}

  /**
   * @returns {Promise<L10n>}
   */
  async createL10n() {
    throw new Error("Not implemented: createL10n");
  }

  createScripting() {
    throw new Error("Not implemented: createScripting");
  }

  createSignatureStorage() {
    throw new Error("Not implemented: createSignatureStorage");
  }

  /**
   * Build a signature verifier for the Digital signature properties panel.
   *
   * The MOZCENTRAL build returns a verifier that calls into NSS via
   * the chrome bridge. The default GENERIC implementation returns
   * `null` — there is no portable cryptographic verification path
   * outside Firefox, so the toolbar button stays hidden and the
   * worker is never asked for `getSignatures()`.
   *
   * Downstream consumers of `pdfjs-dist` that want the Signature
   * Properties UI should subclass `BaseExternalServices` and return
   * an object exposing `verify(signature)` (and optionally
   * `viewCertificate(certificate)`) that resolves to a
   * `VerificationResult` — see `web/firefoxcom.js` for the exact
   * shape.
   *
   * @returns {Object|null}
   */
  createSignatureVerifier() {
    return null;
  }

  updateEditorStates(data) {
    throw new Error("Not implemented: updateEditorStates");
  }

  dispatchGlobalEvent(_event) {}
}

export { BaseExternalServices };
