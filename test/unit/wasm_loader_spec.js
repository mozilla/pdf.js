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

import { isNodeJS } from "../../src/shared/util.js";
import { WASM_URL } from "./test_utils.js";
import { WasmLoader } from "../../src/core/wasm_loader.js";

describe("WasmLoader", function () {
  // Wasm header: magic number and version.
  const EMPTY_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  ]);

  function getContext(sendWithPromise) {
    return {
      handler: { sendWithPromise },
      options: { useWasm: true, useWorkerFetch: false },
    };
  }

  let sendWithPromise, context, init;

  beforeEach(function () {
    sendWithPromise = jasmine
      .createSpy("sendWithPromise")
      .and.resolveTo(EMPTY_WASM);
    context = getContext(sendWithPromise);
    init = jasmine.createSpy("init");
  });

  it("shares a Wasm fetch between concurrent calls", async function () {
    const loaded = await Promise.all([
      WasmLoader.load(context, "back_to_back.wasm", "unused.js", init),
      WasmLoader.load(context, "back_to_back.wasm", "unused.js", init),
    ]);
    expect(loaded).toEqual([true, true]);
    expect(sendWithPromise).toHaveBeenCalledOnceWith("FetchBinaryData", {
      kind: "wasmUrl",
      filename: "back_to_back.wasm",
    });
    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledWith(jasmine.any(Function));
  });

  it("retries a failed fetch", async function () {
    sendWithPromise.and.rejectWith(new Error("Fetch failed."));

    expect(
      await WasmLoader.load(context, "retry.wasm", "unused.js", init)
    ).toBeFalse();
    expect(init).not.toHaveBeenCalled();

    sendWithPromise.and.resolveTo(EMPTY_WASM);
    expect(
      await WasmLoader.load(context, "retry.wasm", "unused.js", init)
    ).toBeTrue();
    expect(sendWithPromise).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });

  it("retries a failed shared fetch with its own context", async function () {
    const failingContext = getContext(
      jasmine.createSpy("failing").and.rejectWith(new Error("Fetch failed."))
    );
    const loaded = await Promise.all([
      WasmLoader.load(failingContext, "concurrent.wasm", "unused.js", init),
      WasmLoader.load(context, "concurrent.wasm", "unused.js", init),
    ]);
    expect(loaded).toEqual([false, true]);
    expect(sendWithPromise).toHaveBeenCalledOnceWith("FetchBinaryData", {
      kind: "wasmUrl",
      filename: "concurrent.wasm",
    });
    expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });

  it("stops retrying when all concurrent calls fail", async function () {
    sendWithPromise.and.rejectWith(new Error("Fetch failed."));

    const loaded = await Promise.all(
      Array.from({ length: 3 }, () =>
        WasmLoader.load(context, "failures.wasm", "unused.js", init)
      )
    );
    expect(loaded).toEqual([false, false, false]);
    expect(sendWithPromise).toHaveBeenCalledTimes(3);
    expect(init).not.toHaveBeenCalled();
  });

  it("resolves Node.js fallback paths from the working directory", async function () {
    if (!isNodeJS) {
      pending("Only for Node.js.");
    }
    const loaded = await WasmLoader.load(
      {
        options: {
          useWasm: false,
          wasmUrl: WASM_URL,
        },
      },
      "openjpeg.wasm",
      "openjpeg_nowasm_fallback.js",
      init
    );
    expect(loaded).toBeTrue();
    expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });
});
