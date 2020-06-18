/* Copyright 2012 Mozilla Foundation
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
  addLinkAttributes,
  getFilenameFromUrl,
  isFetchSupported,
  isValidFetchUrl,
  LinkTarget,
  loadScript,
  PDFDateString,
  RenderingCancelledException,
} from "./display/display_utils.js";
import {
  build,
  getDocument,
  LoopbackPort,
  PDFDataRangeTransport,
  PDFWorker,
  setPDFNetworkStreamFactory,
  version,
} from "./display/api.js";
import {
  CMapCompressionType,
  createObjectURL,
  createPromiseCapability,
  createValidAbsoluteUrl,
  InvalidPDFException,
  MissingPDFException,
  OPS,
  PasswordResponses,
  PermissionFlag,
  removeNullCharacters,
  shadow,
  UnexpectedResponseException,
  UNSUPPORTED_FEATURES,
  Util,
  VerbosityLevel,
} from "./shared/util.js";
import { AnnotationLayer } from "./display/annotation_layer.js";
import { apiCompatibilityParams } from "./display/api_compatibility.js";
import { GlobalWorkerOptions } from "./display/worker_options.js";
import { renderTextLayer } from "./display/text_layer.js";
import { SVGGraphics } from "./display/svg.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : void 0;
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : void 0;

if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")) {
  const streamsPromise = Promise.all([
    import("pdfjs/display/network.js"),
    import("pdfjs/display/fetch_stream.js"),
  ]);
  setPDFNetworkStreamFactory(params => {
    return streamsPromise.then(streams => {
      const [{ PDFNetworkStream }, { PDFFetchStream }] = streams;
      if (isFetchSupported() && isValidFetchUrl(params.url)) {
        return new PDFFetchStream(params);
      }
      return new PDFNetworkStream(params);
    });
  });
} else if (PDFJSDev.test("GENERIC")) {
  const { isNodeJS } = require("./shared/is_node.js");
  if (isNodeJS) {
    const PDFNodeStream = require("./display/node_stream.js").PDFNodeStream;
    setPDFNetworkStreamFactory(params => {
      return new PDFNodeStream(params);
    });
  } else {
    const PDFNetworkStream = require("./display/network.js").PDFNetworkStream;
    let PDFFetchStream;
    if (isFetchSupported()) {
      PDFFetchStream = require("./display/fetch_stream.js").PDFFetchStream;
    }
    setPDFNetworkStreamFactory(params => {
      if (PDFFetchStream && isValidFetchUrl(params.url)) {
        return new PDFFetchStream(params);
      }
      return new PDFNetworkStream(params);
    });
  }
} else if (PDFJSDev.test("CHROME")) {
  const PDFNetworkStream = require("./display/network.js").PDFNetworkStream;
  let PDFFetchStream;
  const isChromeWithFetchCredentials = function () {
    // fetch does not include credentials until Chrome 61.0.3138.0 and later.
    // https://chromium.googlesource.com/chromium/src/+/2e231cf052ca5e68e22baf0008ac9e5e29121707
    try {
      // Indexed properties on window are read-only in Chrome 61.0.3151.0+
      // https://chromium.googlesource.com/chromium/src.git/+/58ab4a971b06dec13e4edf9de8382ca6847f6190
      window[999] = 123; // should throw. Note: JS strict mode MUST be enabled.
      delete window[999];
      return false;
    } catch (e) {
      return true;
    }
  };
  if (isFetchSupported() && isChromeWithFetchCredentials()) {
    PDFFetchStream = require("./display/fetch_stream.js").PDFFetchStream;
  }
  setPDFNetworkStreamFactory(params => {
    if (PDFFetchStream && isValidFetchUrl(params.url)) {
      return new PDFFetchStream(params);
    }
    return new PDFNetworkStream(params);
  });
}

export {
  // From "./display/display_utils.js":
  addLinkAttributes,
  getFilenameFromUrl,
  LinkTarget,
  loadScript,
  PDFDateString,
  RenderingCancelledException,
  // From "./display/api.js":
  build,
  getDocument,
  LoopbackPort,
  PDFDataRangeTransport,
  PDFWorker,
  version,
  // From "./shared/util.js":
  CMapCompressionType,
  createObjectURL,
  createPromiseCapability,
  createValidAbsoluteUrl,
  InvalidPDFException,
  MissingPDFException,
  OPS,
  PasswordResponses,
  PermissionFlag,
  removeNullCharacters,
  shadow,
  UnexpectedResponseException,
  UNSUPPORTED_FEATURES,
  Util,
  VerbosityLevel,
  // From "./display/annotation_layer.js":
  AnnotationLayer,
  // From "./display/api_compatibility.js":
  apiCompatibilityParams,
  // From "./display/worker_options.js":
  GlobalWorkerOptions,
  // From "./display/text_layer.js":
  renderTextLayer,
  // From "./display/svg.js":
  SVGGraphics,
};
