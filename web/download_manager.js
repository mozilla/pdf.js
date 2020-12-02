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

function download(blobUrl, filename) {
  const a = document.createElement("a");
  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }
  a.href = blobUrl;
  a.target = "_parent";
  // Use a.download if available. This increases the likelihood that
  // the file is downloaded instead of opened by another PDF plugin.
  if ("download" in a) {
    a.download = filename;
  }
  // <a> must be in the document for recent Firefox versions,
  // otherwise .click() is ignored.
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

class DownloadManager {
  downloadUrl(url, filename) {
    if (!createValidAbsoluteUrl(url, "http://example.com")) {
      return; // restricted/invalid URL
    }
    download(url + "#pdfjs.action=download", filename);
  }

  downloadData(data, filename, contentType) {
    const blobUrl = createObjectURL(
      data,
      contentType,
      viewerCompatibilityParams.disableCreateObjectURL
    );
    download(blobUrl, filename);
  }

  /**
   * @param sourceEventType {string} Used to signal what triggered the download.
   *   The version of PDF.js integrated with Firefox uses this to to determine
   *   which dialog to show. "save" triggers "save as" and "download" triggers
   *   the "open with" dialog.
   */
  download(blob, url, filename, sourceEventType = "download") {
    if (viewerCompatibilityParams.disableCreateObjectURL) {
      // URL.createObjectURL is not supported
      this.downloadUrl(url, filename);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    download(blobUrl, filename);
  }
}

export { DownloadManager };
