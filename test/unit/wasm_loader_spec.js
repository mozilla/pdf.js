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

  function loadWasm(filename, loadContext = context) {
    return WasmLoader.load(loadContext, filename, "unused.js", init);
  }

  beforeEach(function () {
    sendWithPromise = jasmine
      .createSpy("sendWithPromise")
      .and.resolveTo(EMPTY_WASM);
    context = getContext(sendWithPromise);
    init = jasmine.createSpy("init");
  });

  it("shares a Wasm fetch between concurrent calls", async function () {
    const loaded = await Promise.all([
      loadWasm("back_to_back.wasm"),
      loadWasm("back_to_back.wasm"),
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

    expect(await loadWasm("retry.wasm")).toBeFalse();
    expect(init).not.toHaveBeenCalled();

    sendWithPromise.and.resolveTo(EMPTY_WASM);
    expect(await loadWasm("retry.wasm")).toBeTrue();
    expect(sendWithPromise).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });

  it("retries a failed shared fetch with its own context", async function () {
    const failingContext = getContext(
      jasmine.createSpy("failing").and.rejectWith(new Error("Fetch failed."))
    );
    const loaded = await Promise.all([
      loadWasm("concurrent.wasm", failingContext),
      loadWasm("concurrent.wasm"),
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
      Array.from({ length: 3 }, () => loadWasm("failures.wasm"))
    );
    expect(loaded).toEqual([false, false, false]);
    expect(sendWithPromise).toHaveBeenCalledTimes(3);
    expect(init).not.toHaveBeenCalled();
  });

  describe("worker compilation", function () {
    let fetchSpy, compile, compileStreaming;

    beforeEach(function () {
      context.options.useWorkerFetch = true;
      context.options.wasmUrl = "https://example.com/";
      fetchSpy = spyOn(globalThis, "fetch");
      compile = spyOn(WebAssembly, "compile").and.callThrough();
      compileStreaming = spyOn(
        WebAssembly,
        "compileStreaming"
      ).and.callThrough();
    });

    async function expectStreamingCompilation(contentType) {
      const filename = `${contentType}.wasm`;
      fetchSpy.and.resolveTo(
        new Response(EMPTY_WASM, {
          headers: { "Content-Type": contentType },
        })
      );

      expect(await loadWasm(filename)).toBeTrue();
      expect(fetchSpy).toHaveBeenCalledOnceWith(
        `${context.options.wasmUrl}${filename}`
      );
      expect(sendWithPromise).not.toHaveBeenCalled();
      expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
      expect(compileStreaming).toHaveBeenCalledTimes(1);
      expect(compile).not.toHaveBeenCalled();
    }

    it("streams the Wasm MIME type", async function () {
      await expectStreamingCompilation("application/wasm");
    });

    it("streams a generic binary MIME type", async function () {
      await expectStreamingCompilation("application/octet-stream");
    });

    it("streams a Wasm MIME type with parameters", async function () {
      await expectStreamingCompilation("application/wasm;charset=UTF-8");
    });
  });

  it("resolves Node.js fallback paths from the working directory", async function () {
    if (!isNodeJS) {
      pending("Only for Node.js.");
    }
    context.options.useWasm = false;
    context.options.wasmUrl = WASM_URL;
    const loaded = await WasmLoader.load(
      context,
      "openjpeg.wasm",
      "openjpeg_nowasm_fallback.js",
      init
    );
    expect(loaded).toBeTrue();
    expect(init).toHaveBeenCalledOnceWith(jasmine.any(Function));
  });
});
