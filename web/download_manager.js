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

import { BaseDownloadManager } from "./base_download_manager.js";
import { createValidAbsoluteUrl } from "pdfjs-lib";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("CHROME || GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/download_manager" shall not be used ' +
      "outside CHROME and GENERIC builds."
  );
}

class DownloadManager extends BaseDownloadManager {
  _triggerDownload(blobUrl, originalUrl, filename, isAttachment = false) {
    if (!blobUrl && !isAttachment) {
      // Fallback to downloading non-attachments by their URL.
      if (!createValidAbsoluteUrl(originalUrl, "http://example.com")) {
        throw new Error(`_triggerDownload - not a valid URL: ${originalUrl}`);
      }
      blobUrl = originalUrl + "#pdfjs.action=download";
    }

    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_parent";
    // Use a.download if available. This increases the likelihood that
    // the file is downloaded instead of opened by another PDF plugin.
    if ("download" in a) {
      a.download = filename;
    }
    // <a> must be in the document for recent Firefox versions,
    // otherwise .click() is ignored.
    (document.body || document.documentElement).append(a);
    a.click();
    a.remove();
  }

  _getOpenDataUrl(blobUrl, filename, dest = null) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("COMPONENTS")) {
      throw new Error("Opening data is not supported in `COMPONENTS` builds.");
    }
    // The current URL is the viewer, let's use it and append the file.
    let url = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
    if (dest) {
      url += `#${escape(dest)}`;
    }
    return url;
  }
}

export { DownloadManager };
