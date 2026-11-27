/* THIS FILE IS GENERATED - DO NOT EDIT */
import { copy_result } from './qcms_utils.js';


/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5}
 */
export const DataType = Object.freeze({
    RGB8: 0, "0": "RGB8",
    RGBA8: 1, "1": "RGBA8",
    BGRA8: 2, "2": "BGRA8",
    Gray8: 3, "3": "Gray8",
    GrayA8: 4, "4": "GrayA8",
    CMYK: 5, "5": "CMYK",
});

/**
 * @enum {0 | 1 | 2 | 3}
 */
export const Intent = Object.freeze({
    Perceptual: 0, "0": "Perceptual",
    RelativeColorimetric: 1, "1": "RelativeColorimetric",
    Saturation: 2, "2": "Saturation",
    AbsoluteColorimetric: 3, "3": "AbsoluteColorimetric",
});

/**
 * Converts `src` and hands the result to `copy_result`, laid out as RGB, or as
 * RGBA with an opaque alpha when `add_alpha` is set.
 *
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {Uint8Array | number[]} src
 * @param {boolean} add_alpha
 */
export function qcms_convert_array(transformer, src, add_alpha) {
    const val2 = +transformer;
    const val3 = +add_alpha;
    const ptr0 = passArray8ToWasm0(src, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.qcms_convert_array(val2, ptr0, len0, val3);
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {number} src1
 * @param {number} src2
 * @param {number} src3
 * @param {number} src4
 * @returns {number}
 */
export function qcms_convert_four(transformer, src1, src2, src3, src4) {
    const ret = wasm.qcms_convert_four(transformer, src1, src2, src3, src4);
    return ret >>> 0;
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {number} src
 * @returns {number}
 */
export function qcms_convert_one(transformer, src) {
    const ret = wasm.qcms_convert_one(transformer, src);
    return ret >>> 0;
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {number} src1
 * @param {number} src2
 * @param {number} src3
 * @returns {number}
 */
export function qcms_convert_three(transformer, src1, src2, src3) {
    const ret = wasm.qcms_convert_three(transformer, src1, src2, src3);
    return ret >>> 0;
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 */
export function qcms_drop_transformer(transformer) {
    wasm.qcms_drop_transformer(transformer);
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {Uint8Array | number[]} mem
 * @param {DataType} in_type
 * @param {Intent} intent
 * @returns {number}
 */
export function qcms_transformer_from_memory(mem, in_type, intent) {
    const val2 = +in_type;
    const val3 = +intent;
    const ptr0 = passArray8ToWasm0(mem, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.qcms_transformer_from_memory(ptr0, len0, val2, val3);
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_copy_result_0d15f3bf9d9012ae: function(arg0, arg1) {
            copy_result(arg0 >>> 0, arg1 >>> 0);
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./qcms_bg.js": import0,
    };
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }


    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
