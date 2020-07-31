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

import { createObjectURL, createValidAbsoluteUrl } from "pdfjs-lib";
import { viewerCompatibilityParams } from "./viewer_compatibility.js";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("CHROME || GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/download_manager" shall not be used ' +
      "outside CHROME and GENERIC builds."
  );
}

const DISABLE_CREATE_OBJECT_URL =
  viewerCompatibilityParams.disableCreateObjectURL || false;

function download(blobUrl, filename) {
  const a = document.createElement("a");
  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }

  // 追加変更
  // iOSのブラウザで閲覧時はダウンロードボタンを押した際に、_parentに表示するのではなく_topに表示するよう変更
  a.href = blobUrl;

  // TOPに表示することでアプリに渡したり、ファイルとして保存したり、印刷できる
  const isIOS = navigator.userAgent.match(/(iPhone|iPad|iPod)/);
  const isIPasOS = navigator.userAgent.toLowerCase().indexOf('macintosh') > -1 && 'ontouchend' in document;
  if (isIOS || isIPadOS) {
    const isIOS12 = navigator.userAgent.match(/iPhone OS 12/);
    if (isIOS12) {
      const f = location.href.split("file=")[1];
      location.href = '/pdf/web/download.php?file=' + f + '&filename=' + filename;
      return;
    }

    a.target = '_top';
  } else {
      a.target = '_parent';
  }

  if ('download' in a) {
    if (navigator.userAgent.toLowerCase().indexOf('crios') > -1 && 'ontouchend' in document) {
      // Chromeの場合はa.downloadをつけない
      } else {
        a.download = filename;
      }
  }
  // Use a.download if available. This increases the likelihood that
  // the file is downloaded instead of opened by another PDF plugin.

  // <a> must be in the document for IE and recent Firefox versions,
  // otherwise .click() is ignored.
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

class DownloadManager {
  constructor({ disableCreateObjectURL = DISABLE_CREATE_OBJECT_URL }) {
    this.disableCreateObjectURL = disableCreateObjectURL;
  }

  downloadUrl(url, filename) {
    if (!createValidAbsoluteUrl(url, "http://example.com")) {
      return; // restricted/invalid URL
    }
    download(url + "#pdfjs.action=download", filename);
  }

  downloadData(data, filename, contentType) {
    if (navigator.msSaveBlob) {
      // IE10 and above
      navigator.msSaveBlob(new Blob([data], { type: contentType }), filename);
      return;
    }
    const blobUrl = createObjectURL(
      data,
      contentType,
      this.disableCreateObjectURL
    );
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

    const blobUrl = URL.createObjectURL(blob);
    download(blobUrl, filename);
  }
}

export { DownloadManager };
