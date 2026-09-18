async function oldEmscripten() {
  var info = getWasmImports();
  return new Promise((resolve, reject) => {
    Module["instantiateWasm"](info, (inst, mod) => {
      resolve(receiveInstance(inst, mod));
    });
  });
}
async function newEmscripten() {
  var info = getWasmImports();
  var instantiateWasm = Module["instantiateWasm"];
  return new Promise(resolve => {
    instantiateWasm(info, inst => resolve(receiveInstance(inst)));
  });
}
async function instrumentedAlias() {
  var info = getWasmImports();
  var instantiateWasm = (count(), Module["instantiateWasm"]);
  return new Promise(resolve => {
    instantiateWasm(info, inst => resolve(receiveInstance(inst)));
  });
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
export { oldEmscripten, newEmscripten, instrumentedAlias, reassignedAlias, aliasBeforeInitialization };
