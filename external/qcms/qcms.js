/* THIS FILE IS GENERATED - DO NOT EDIT */
import { copy_result, copy_rgb, make_cssRGB } from './qcms_utils.js';

let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {Uint8Array} src
 */
export function qcms_convert_array(transformer, src) {
    const ptr0 = passArray8ToWasm0(src, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.qcms_convert_array(transformer, ptr0, len0);
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {number} src
 * @param {boolean} css
 */
export function qcms_convert_one(transformer, src, css) {
    wasm.qcms_convert_one(transformer, src, css);
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {number} transformer
 * @param {number} src1
 * @param {number} src2
 * @param {number} src3
 * @param {boolean} css
 */
export function qcms_convert_three(transformer, src1, src2, src3, css) {
    wasm.qcms_convert_three(transformer, src1, src2, src3, css);
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
 * @param {boolean} css
 */
export function qcms_convert_four(transformer, src1, src2, src3, src4, css) {
    wasm.qcms_convert_four(transformer, src1, src2, src3, src4, css);
}

/**
 * # Safety
 *
 * This function is called directly from JavaScript.
 * @param {Uint8Array} mem
 * @param {DataType} in_type
 * @param {Intent} intent
 * @returns {number}
 */
export function qcms_transformer_from_memory(mem, in_type, intent) {
    const ptr0 = passArray8ToWasm0(mem, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.qcms_transformer_from_memory(ptr0, len0, in_type, intent);
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

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
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
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_copyresult_b08ee7d273f295dd = function(arg0, arg1) {
        copy_result(arg0 >>> 0, arg1 >>> 0);
    };
    imports.wbg.__wbg_copyrgb_d60ce17bb05d9b67 = function(arg0) {
        copy_rgb(arg0 >>> 0);
    };
    imports.wbg.__wbg_makecssRGB_893bf0cd9fdb302d = function(arg0) {
        make_cssRGB(arg0 >>> 0);
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
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

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
