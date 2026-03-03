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

/**
 * This class manages the interaction of extracting the text content of the page
 * and passing it back to the external service.
 */
class PdfTextExtractor {
  /** @type {BaseExternalServices} */
  #externalServices;

  /** @type {?Promise<string>} */
  #textPromise;

  #capability = Promise.withResolvers();

  constructor(externalServices, pdfViewer, eventBus) {
    this.#externalServices = externalServices;

    eventBus._on("pagesinit", () => {
      this.#capability.resolve(pdfViewer);
    });
    eventBus._on("pagesdestroy", () => {
      this.#capability.reject(new Error("pagesdestroy"));
      this.#textPromise = null;

      this.#capability = Promise.withResolvers();
    });

    window.addEventListener("requestTextContent", ({ detail }) => {
      this.extractTextContent(detail.requestId);
    });
  }

  /**
   * Builds up all of the text from a PDF.
   *
   * @param {number} requestId
   */
  async extractTextContent(requestId) {
    if (!this.#textPromise) {
      const textPromise = (this.#textPromise = this.#capability.promise.then(
        pdfViewer => pdfViewer.getAllText()
      ));

      // After the text resolves, cache the text for a little bit in case
      // multiple consumers call it.
      textPromise.then(() => {
        setTimeout(() => {
          if (this.#textPromise === textPromise) {
            this.#textPromise = null;
          }
        }, 5000);
      });
    }

    this.#externalServices.reportText({
      text: await this.#textPromise,
      requestId,
    });
  }
}

export { PdfTextExtractor };
