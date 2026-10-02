/* Copyright 2026 Mozilla Foundation
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

import { AbortException } from "../../src/shared/util.js";
import { ChunkedStreamManager } from "../../src/core/chunked_stream.js";
import { MissingDataException } from "../../src/core/core_utils.js";
import { NetworkPdfManager } from "../../src/core/pdf_manager.js";

const length = 1024;
const rangeChunkSize = 64;

// A range stream whose requests never complete, like a stalled connection.
function createStalledStream() {
  return {
    getRangeReader: () => ({
      read: () => new Promise(() => {}),
    }),
    cancelAllRequests() {},
  };
}

function createManager() {
  const manager = new ChunkedStreamManager(createStalledStream(), {
    length,
    rangeChunkSize,
    disableAutoFetch: true,
    msgHandler: null,
  });
  // `abort` also rejects the "loaded stream" promise, which is normally
  // observed through `requestLoadedStream`; mark it as handled here.
  manager.requestAllChunks(/* noFetch = */ true).catch(() => {});
  return manager;
}

describe("ChunkedStreamManager", function () {
  it("settles a pending request when aborted", async function () {
    const manager = createManager();
    const pending = manager.requestRange(0, 128);

    manager.abort(new AbortException("Worker was terminated."));
    await expectAsync(pending).toBeResolved();
  });

  it("rejects `requestRange` after abort", async function () {
    const manager = createManager();
    const reason = new AbortException("Worker was terminated.");
    manager.abort(reason);

    await expectAsync(manager.requestRange(0, 128)).toBeRejectedWith(reason);
  });

  it("rejects `requestRanges` after abort", async function () {
    const manager = createManager();
    const reason = new AbortException("Worker was terminated.");
    manager.abort(reason);

    await expectAsync(
      manager.requestRanges([{ begin: 0, end: 128 }])
    ).toBeRejectedWith(reason);
  });

  it("does not start any new range requests after abort", async function () {
    const manager = createManager();
    let numRequests = 0;
    manager.sendRequest = () => {
      numRequests++;
      return new Promise(() => {});
    };
    manager.abort(new AbortException("Worker was terminated."));

    await expectAsync(manager.requestRange(0, 128)).toBeRejected();
    expect(numRequests).toEqual(0);
  });
});

describe("NetworkPdfManager", function () {
  // Regression test for https://github.com/mozilla/pdf.js/issues/22051.
  it("stops retrying `ensure` when terminated while waiting for data", async function () {
    // Skip the constructor, since it sets up the whole document machinery.
    const manager = Object.create(NetworkPdfManager.prototype);
    manager.streamManager = createManager();

    let numCalls = 0;
    const obj = {
      needsData() {
        numCalls++;
        throw new MissingDataException(128, 192);
      },
    };

    const ensurePromise = manager.ensure(obj, "needsData");
    // Let the first request start, then terminate while it is still pending.
    await Promise.resolve();
    manager.terminate(new AbortException("Worker was terminated."));

    await expectAsync(ensurePromise).toBeRejectedWithError(
      "Worker was terminated."
    );
    expect(numCalls).toEqual(2);
  });
});
