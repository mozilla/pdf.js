async function oldEmscripten() {
  function findWasmBinary() {
    return new URL("file.wasm", import.meta.url).href;
  }
  var info = getWasmImports();
  if (Module["instantiateWasm"]) {
    return new Promise((resolve, reject) => {
      Module["instantiateWasm"](info, (inst, mod) => {
        resolve(receiveInstance(inst, mod));
      });
    });
  }
  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  return receiveInstantiationResult(result);
}

async function newEmscripten() {
  function findWasmBinary() {
    return new URL("file.wasm", import.meta.url).href;
  }
  var info = getWasmImports();
  var instantiateWasm = Module["instantiateWasm"];
  if (instantiateWasm) {
    return new Promise(resolve => {
      instantiateWasm(info, inst => resolve(receiveInstance(inst)));
    });
  }
  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  return receiveInstantiationResult(result);
}

async function instrumentedAlias() {
  var info = getWasmImports();
  var instantiateWasm = (count(), Module["instantiateWasm"]);
  if (instantiateWasm) {
    return new Promise(resolve => {
      instantiateWasm(info, inst => resolve(receiveInstance(inst)));
    });
  }
  return instantiateAsync(info);
}

function reassignedAlias(disabled) {
  var instantiateWasm = Module["instantiateWasm"];
  if (disabled) {
    instantiateWasm = null;
  }
  if (instantiateWasm) {
    return "custom";
  }
  return "fallback";
}

function aliasBeforeInitialization() {
  function getMode() {
    if (instantiateWasm) {
      return "custom";
    }
    return "fallback";
  }
  var mode = getMode();
  var instantiateWasm = Module["instantiateWasm"];
  return mode;
}

export {
  oldEmscripten,
  newEmscripten,
  instrumentedAlias,
  reassignedAlias,
  aliasBeforeInitialization,
};
