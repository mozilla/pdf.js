/* Copyright 2020 Mozilla Foundation
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

import { getPdfFilenameFromUrl } from "pdfjs-lib";

async function docProperties(pdfDocument) {
  const url = "",
    baseUrl = url.split("#", 1)[0];
  const { info, metadata, contentDispositionFilename, contentLength } =
    await pdfDocument.getMetadata();

  return {
    ...info,
    baseURL: baseUrl,
    filesize: contentLength || (await pdfDocument.getDownloadInfo()).length,
    filename: contentDispositionFilename || getPdfFilenameFromUrl(url),
    metadata: metadata?.getRaw(),
    authors: metadata?.get("dc:creator"),
    numPages: pdfDocument.numPages,
    URL: url,
  };
}

class GenericScripting {
  constructor(sandboxBundleSrc) {
    this._ready = new Promise((resolve, reject) => {
      const sandbox =
        typeof PDFJSDev === "undefined"
          ? import(sandboxBundleSrc) // eslint-disable-line no-unsanitized/method
          : __non_webpack_import__(sandboxBundleSrc);
      sandbox
        .then(pdfjsSandbox => {
          resolve(pdfjsSandbox.QuickJSSandbox());
        })
        .catch(reject);
    });
  }

  async createSandbox(data) {
    const sandbox = await this._ready;
    sandbox.create(data);
  }

  async dispatchEventInSandbox(event) {
    const sandbox = await this._ready;
    setTimeout(() => sandbox.dispatchEvent(event), 0);
  }

  async destroySandbox() {
    const sandbox = await this._ready;
    sandbox.nukeSandbox();
  }
}

export { docProperties, GenericScripting };
