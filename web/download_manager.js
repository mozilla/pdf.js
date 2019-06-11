/* Copyright 2013 Mozilla Foundation
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

import {
  apiCompatibilityParams, createObjectURL, createValidAbsoluteUrl, URL
} from 'pdfjs-lib';

if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('CHROME || GENERIC')) {
  throw new Error('Module "pdfjs-web/download_manager" shall not be used ' +
                  'outside CHROME and GENERIC builds.');
}

const DISABLE_CREATE_OBJECT_URL =
  apiCompatibilityParams.disableCreateObjectURL || false;

function download(blobUrl, filename) {
  let a = document.createElement('a');
  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }
  a.href = blobUrl;
  a.target = '_parent';
  // Use a.download if available. This increases the likelihood that
  // the file is downloaded instead of opened by another PDF plugin.
  if ('download' in a) {
    a.download = filename;
  }
  // <a> must be in the document for IE and recent Firefox versions,
  // otherwise .click() is ignored.
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

class DownloadManager {
  constructor({ disableCreateObjectURL = DISABLE_CREATE_OBJECT_URL, }) {
    this.disableCreateObjectURL = disableCreateObjectURL;
  }

  downloadUrl(url, filename) {
    if (!createValidAbsoluteUrl(url, 'http://example.com')) {
      return; // restricted/invalid URL
    }
    download(url + '#pdfjs.action=download', filename);
  }

  downloadData(data, filename, contentType) {
    if (navigator.msSaveBlob) { // IE10 and above
      navigator.msSaveBlob(new Blob([data], { type: contentType, }), filename);
      return;
    }
    let blobUrl = createObjectURL(data, contentType,
                                  this.disableCreateObjectURL);
    download(blobUrl, filename);
  }

  download(blob, url, filename) {
    if (navigator.msSaveBlob) {
      // IE10 / IE11
      if (!navigator.msSaveBlob(blob, filename)) {
        this.downloadUrl(url, filename);
      }
      return;
    }

    if (this.disableCreateObjectURL) {
      // URL.createObjectURL is not supported
      this.downloadUrl(url, filename);
      return;
    }

    let blobUrl = URL.createObjectURL(blob);
    download(blobUrl, filename);
  }
}

export {
  DownloadManager,
};
