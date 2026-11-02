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
  // Smallest valid module: the magic number and the version.
  const EMPTY_WASM = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  ]);

  function getContext(sendWithPromise) {
    return {
      handler: { sendWithPromise },
      options: { useWasm: true, useWorkerFetch: false },
    };
  }

  it("fetches and compiles a Wasm file once for back-to-back calls", async function () {
    const sendWithPromise = jasmine
      .createSpy("sendWithPromise")
      .and.resolveTo(EMPTY_WASM);
    const context = getContext(sendWithPromise);
    const init1 = jasmine.createSpy("init1");
    const init2 = jasmine.createSpy("init2");

    const loaded = await Promise.all([
      WasmLoader.load(context, "back_to_back.wasm", "unused.js", init1),
      WasmLoader.load(context, "back_to_back.wasm", "unused.js", init2),
    ]);
    expect(loaded).toEqual([true, true]);
    expect(sendWithPromise).toHaveBeenCalledOnceWith("FetchBinaryData", {
      kind: "wasmUrl",
      filename: "back_to_back.wasm",
    });
    expect(init1).toHaveBeenCalledOnceWith(jasmine.any(Function));
    expect(init2).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });

  it("fetches a Wasm file again after a failure", async function () {
    const sendWithPromise = jasmine
      .createSpy("sendWithPromise")
      .and.rejectWith(new Error("Fetch failed."));
    const context = getContext(sendWithPromise);
    const init = jasmine.createSpy("init");

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

  it("loads a JS fallback relative to the current directory in Node.js", async function () {
    if (!isNodeJS) {
      pending("Only for Node.js.");
    }
    const init = jasmine.createSpy("init");
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
