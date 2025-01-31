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

import { AbortException, isNodeJS } from "../../src/shared/util.js";
import { getCrossOriginHostname, TestPdfsServer } from "./test_utils.js";

// Common tests to verify behavior across implementations of the IPDFStream
// interface:
// - PDFNetworkStream by network_spec.js
// - PDFFetchStream by fetch_stream_spec.js
async function testCrossOriginRedirects({
  PDFStreamClass,
  redirectIfRange,
  testRangeReader,
}) {
  const basicApiUrl = TestPdfsServer.resolveURL("basicapi.pdf").href;
  const basicApiFileLength = 105779;

  const rangeSize = 32768;
  const stream = new PDFStreamClass({
    url: getCrossOriginUrlWithRedirects(basicApiUrl, redirectIfRange),
    length: basicApiFileLength,
    rangeChunkSize: rangeSize,
    disableStream: true,
    disableRange: false,
  });

  const fullReader = stream.getFullReader();

  await fullReader.headersReady;
  // Sanity check: We can only test range requests if supported:
  expect(fullReader.isRangeSupported).toEqual(true);
  // ^ When range requests are supported (and streaming is disabled), the full
  // initial request is aborted and we do not need to call fullReader.cancel().

  const rangeReader = stream.getRangeReader(
    basicApiFileLength - rangeSize,
    basicApiFileLength
  );

  try {
    await testRangeReader(rangeReader);
  } finally {
    rangeReader.cancel(new AbortException("Don't need rangeReader"));
  }
}

/**
 * @param {string} testserverUrl - A URL handled that supports CORS and
 *   redirects (see crossOriginHandler and redirectHandler in webserver.mjs).
 * @param {boolean} redirectIfRange - Whether Range requests should be
 *   redirected to a different origin compared to the initial request.
 * @returns {string} A URL that will be redirected by the server.
 */
function getCrossOriginUrlWithRedirects(testserverUrl, redirectIfRange) {
  const url = new URL(testserverUrl);
  if (!isNodeJS) {
    // The responses are going to be cross-origin. In Node.js, fetch() allows
    // cross-origin requests for any request, but in browser environments we
    // need to enable CORS.
    // This option depends on crossOriginHandler in webserver.mjs.
    url.searchParams.set("cors", "withoutCredentials");
  }

  // This redirect options depend on redirectHandler in webserver.mjs.

  // We will change the host to a cross-origin domain so that the initial
  // request will be cross-origin. Set "redirectToHost" to the original host
  // to force a cross-origin redirect (relative to the initial URL).
  url.searchParams.set("redirectToHost", url.hostname);
  url.hostname = getCrossOriginHostname(url.hostname);
  if (redirectIfRange) {
    url.searchParams.set("redirectIfRange", "1");
  }
  return url.href;
}

export { testCrossOriginRedirects };
