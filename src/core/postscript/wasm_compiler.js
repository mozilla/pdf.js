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

import {
  parsePostScriptFunction,
  PS_NODE,
  PS_VALUE_TYPE,
  PSStackToTree,
} from "./ast.js";
import { TOKEN } from "./lexer.js";

// Wasm opcodes — https://webassembly.github.io/spec/core/binary/instructions.html
const OP = {
  if: 0x04,
  else: 0x05,
  end: 0x0b,
  select: 0x1b,
  call: 0x10,
  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22,
  i32_const: 0x41,
  i32_eqz: 0x45,
  i32_and: 0x71,
  i32_or: 0x72,
  i32_xor: 0x73,
  i32_shl: 0x74,
  i32_shr_s: 0x75,
  i32_trunc_f64_s: 0xaa,
  f64_const: 0x44,
  f64_eq: 0x61,
  f64_ne: 0x62,
  f64_lt: 0x63,
  f64_gt: 0x64,
  f64_le: 0x65,
  f64_ge: 0x66,
  f64_abs: 0x99,
  f64_neg: 0x9a,
  f64_ceil: 0x9b,
  f64_floor: 0x9c,
  f64_trunc: 0x9d,
  f64_nearest: 0x9e,
  f64_sqrt: 0x9f,
  f64_add: 0xa0,
  f64_sub: 0xa1,
  f64_mul: 0xa2,
  f64_div: 0xa3,
  f64_min: 0xa4,
  f64_max: 0xa5,
  f64_convert_i32_s: 0xb7,
  f64_store: 0x39,
};

// https://webassembly.github.io/spec/core/binary/types.html#binary-comptype
const FUNC_TYPE = 0x60;
// https://webassembly.github.io/spec/core/binary/types.html#binary-valtype
const F64 = 0x7c;

// https://webassembly.github.io/spec/core/binary/modules.html
const SECTION = {
  type: 0x01,
  import: 0x02,
  function: 0x03,
  memory: 0x05,
  export: 0x07,
  code: 0x0a,
};

// https://webassembly.github.io/spec/core/binary/modules.html#binary-importdesc
const EXTERN_FUNC = 0x00;
// https://webassembly.github.io/spec/core/binary/modules.html#binary-exportdesc
const EXTERN_MEM = 0x02;

// https://webassembly.github.io/spec/core/binary/values.html#binary-int (unsigned LEB128)
function unsignedLEB128(n) {
  const out = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (n !== 0);
  return out;
}

function encodeASCIIString(s) {
  return [...unsignedLEB128(s.length), ...Array.from(s, c => c.charCodeAt(0))];
}

function section(id, data) {
  return [id, ...unsignedLEB128(data.length), ...data];
}

function vec(items) {
  const out = unsignedLEB128(items.length);
  for (const item of items) {
    if (typeof item === "number") {
      out.push(item);
      continue;
    }
    for (const byte of item) {
      out.push(byte);
    }
  }
  return out;
}

// Math functions unavailable as Wasm instructions — imported from JS.
const MATH_IMPORTS = [
  // name | module | field | params | results
  ["sin", "Math", "sin", [F64], [F64]],
  ["cos", "Math", "cos", [F64], [F64]],
  // atan2(dy, dx) — PS atan takes (dy dx) in that order
  ["atan2", "Math", "atan2", [F64, F64], [F64]],
  ["log", "Math", "log", [F64], [F64]], // natural log
  ["log10", "Math", "log10", [F64], [F64]],
  // pow(base, exp)
  ["pow", "Math", "pow", [F64, F64], [F64]],
];

// Import object for WebAssembly instantiation — only the functions declared
// in MATH_IMPORTS, keyed by their field name.
const _mathImportObject = {
  Math: Object.fromEntries(MATH_IMPORTS.map(([name]) => [name, Math[name]])),
};

// Walks each PSStackToTree output node and emits Wasm, leaving one f64 per
// output on the Wasm operand stack.  Ternary nodes compile to if/else/end.
class PsWasmCompiler {
  static #initialized = false;

  static #comparisonToOp = null;

  static #importIdx = null;

  static #degToRad = 0;

  static #radToDeg = 0;

  static #importTypeEntries = null;

  static #importSection = null;

  static #functionSection = null;

  static #memorySection = null;

  static #exportSection = null;

  static #wasmMagicVersion = null;

  // Shared buffer for f64 encoding — avoids per-call allocation.
  static #f64View = null;

  static #f64Arr = null;

  static #init() {
    // TOKEN comparison ids → Wasm f64 comparison opcodes (leave i32 on stack).
    this.#comparisonToOp = new Map([
      [TOKEN.eq, OP.f64_eq],
      [TOKEN.ne, OP.f64_ne],
      [TOKEN.lt, OP.f64_lt],
      [TOKEN.le, OP.f64_le],
      [TOKEN.gt, OP.f64_gt],
      [TOKEN.ge, OP.f64_ge],
    ]);
    // Index of each import function by name.
    this.#importIdx = Object.create(null);
    for (let i = 0; i < MATH_IMPORTS.length; i++) {
      this.#importIdx[MATH_IMPORTS[i][0]] = i;
    }
    this.#degToRad = Math.PI / 180;
    this.#radToDeg = 180 / Math.PI;
    // Import type entries are identical on every compilation — compute once.
    this.#importTypeEntries = MATH_IMPORTS.map(([, , , params, results]) => [
      FUNC_TYPE,
      ...vec(params),
      ...vec(results),
    ]);
    // Static Wasm sections that never change between compilations.
    this.#importSection = new Uint8Array(
      section(
        SECTION.import,
        vec(
          MATH_IMPORTS.map(([, mod, field], i) => [
            ...encodeASCIIString(mod),
            ...encodeASCIIString(field),
            EXTERN_FUNC, // import kind: function
            ...unsignedLEB128(i + 1), // type index (0 = main func type)
          ])
        )
      )
    );
    // One function, type index 0.
    this.#functionSection = new Uint8Array(
      section(SECTION.function, vec([[0]]))
    );
    // Min 1 page (64 KiB), no max.
    // https://webassembly.github.io/spec/core/binary/types.html#binary-limits
    this.#memorySection = new Uint8Array(
      section(SECTION.memory, vec([[0x00, 0x01]]))
    );
    // Export "fn" (func index = nImports) and "mem" (memory) for the wrapper.
    this.#exportSection = new Uint8Array(
      section(
        SECTION.export,
        vec([
          [
            ...encodeASCIIString("fn"),
            EXTERN_FUNC,
            ...unsignedLEB128(MATH_IMPORTS.length),
          ],
          [...encodeASCIIString("mem"), EXTERN_MEM, 0x00],
        ])
      )
    );
    // Wasm binary magic + version (constant).
    // https://webassembly.github.io/spec/core/binary/modules.html#binary-magic
    this.#wasmMagicVersion = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d, // \0asm
      0x01,
      0x00,
      0x00,
      0x00, // version 1
    ]);
    const f64Buf = new ArrayBuffer(8);
    this.#f64View = new DataView(f64Buf);
    this.#f64Arr = new Uint8Array(f64Buf);
    this.#initialized = true;
  }

  constructor(domain, range) {
    if (!PsWasmCompiler.#initialized) {
      PsWasmCompiler.#init();
    }
    this._nIn = domain.length >> 1;
    this._nOut = range.length >> 1;
    this._range = range;
    this._code = [];

    // Params 0..nIn-1 are locals; extra locals start at _nextLocal.
    this._nextLocal = this._nIn;

    this._freeLocals = [];
    this._sharedLocals = new Map(); // node → {local, remaining} for CSE
  }

  // Wasm emit helpers

  _allocLocal() {
    return this._freeLocals.pop() ?? this._nextLocal++;
  }

  _releaseLocal(idx) {
    this._freeLocals.push(idx);
  }

  _emitULEB128(n) {
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n !== 0) {
        b |= 0x80;
      }
      this._code.push(b);
    } while (n !== 0);
  }

  // `i32.const` immediates are signed LEB128 (Wasm spec), so they must be
  // emitted with sign extension — the unsigned encoder mis-encodes any value
  // whose final 7-bit group has bit 0x40 set (e.g. 64 → 0x40 → decoded as −64).
  _emitSLEB128(n) {
    for (;;) {
      const b = n & 0x7f;
      n >>= 7; // arithmetic shift keeps the sign bit
      if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) {
        this._code.push(b);
        return;
      }
      this._code.push(b | 0x80);
    }
  }

  _emitF64Const(value) {
    this._code.push(OP.f64_const);
    PsWasmCompiler.#f64View.setFloat64(0, value, true /* little-endian */);
    for (let i = 0; i < 8; i++) {
      this._code.push(PsWasmCompiler.#f64Arr[i]);
    }
  }

  _emitLocalGet(idx) {
    this._code.push(OP.local_get);
    this._emitULEB128(idx);
  }

  _emitLocalSet(idx) {
    this._code.push(OP.local_set);
    this._emitULEB128(idx);
  }

  _emitLocalTee(idx) {
    this._code.push(OP.local_tee);
    this._emitULEB128(idx);
  }

  // Tree node compilation

  /**
   * Emit Wasm instructions for `node`, leaving exactly one f64 on the Wasm
   * operand stack. Returns false if the node cannot be compiled.
   */
  _compileNode(node) {
    if (node.shared) {
      const entry = this._sharedLocals.get(node);
      if (entry !== undefined) {
        this._emitLocalGet(entry.local);
        if (--entry.remaining === 0) {
          this._releaseLocal(entry.local);
        }
        return true;
      }
      if (!this._compileNodeImpl(node)) {
        return false;
      }
      const local = this._allocLocal();
      this._sharedLocals.set(node, { local, remaining: node.sharedCount - 1 });
      this._emitLocalTee(local);
      return true;
    }
    return this._compileNodeImpl(node);
  }

  _compileNodeImpl(node) {
    switch (node.type) {
      case PS_NODE.arg:
        this._emitLocalGet(node.index);
        return true;

      case PS_NODE.const: {
        let v = node.value;
        if (typeof v === "boolean") {
          v = v ? 1 : 0;
        }
        this._emitF64Const(v);
        return true;
      }

      case PS_NODE.unary:
        return this._compileUnaryNode(node);

      case PS_NODE.binary:
        return this._compileBinaryNode(node);

      case PS_NODE.ternary:
        return this._compileTernaryNode(node);

      default:
        return false;
    }
  }

  _compileSinCosNode(node) {
    // PS sin/cos take degrees; normalize mod 360 before converting to radians
    // so that e.g. sin(360°) = 0, not Math.sin(2π) ≈ -2.4e-16.
    const local = this._allocLocal();
    try {
      if (!this._compileNode(node.operand)) {
        return false;
      }
      const code = this._code;
      this._emitLocalSet(local);
      this._emitLocalGet(local);
      this._emitLocalGet(local);
      this._emitF64Const(360);
      code.push(OP.f64_div, OP.f64_trunc);
      this._emitF64Const(360);
      code.push(OP.f64_mul, OP.f64_sub); // a mod 360
      this._emitF64Const(PsWasmCompiler.#degToRad);
      code.push(OP.f64_mul, OP.call);
      this._emitULEB128(
        PsWasmCompiler.#importIdx[node.op === TOKEN.sin ? "sin" : "cos"]
      );
      return true;
    } finally {
      this._releaseLocal(local);
    }
  }

  _compileUnaryNode(node) {
    const code = this._code;
    if (node.op === TOKEN.sin || node.op === TOKEN.cos) {
      return this._compileSinCosNode(node);
    }

    // `not` needs i32, not f64 — handle before the generic compilation below.
    if (node.op === TOKEN.not) {
      if (node.valueType === PS_VALUE_TYPE.boolean) {
        if (!this._compileNodeAsBoolI32(node.operand)) {
          return false;
        }
        code.push(OP.i32_eqz, OP.f64_convert_i32_s);
        return true;
      }
      if (node.valueType === PS_VALUE_TYPE.numeric) {
        // Bitwise NOT: ~n, implemented as n XOR -1.
        // i32.const -1 encodes as the single signed-LEB128 byte 0x7f.
        if (!this._compileNode(node.operand)) {
          return false;
        }
        code.push(
          OP.i32_trunc_f64_s,
          OP.i32_const,
          0x7f,
          OP.i32_xor,
          OP.f64_convert_i32_s
        );
        return true;
      }
      // Unknown type — cannot safely choose boolean or bitwise NOT.
      return false;
    }

    if (!this._compileNode(node.operand)) {
      return false;
    }
    switch (node.op) {
      case TOKEN.abs:
        code.push(OP.f64_abs);
        break;
      case TOKEN.neg:
        code.push(OP.f64_neg);
        break;
      case TOKEN.sqrt:
        code.push(OP.f64_sqrt);
        break;
      case TOKEN.floor:
        code.push(OP.f64_floor);
        break;
      case TOKEN.ceiling:
        code.push(OP.f64_ceil);
        break;
      case TOKEN.round:
        // PostScript `round` uses round-half-up (floor(x+0.5)), not the
        // banker's rounding that Wasm f64.nearest implements.
        this._emitF64Const(0.5);
        code.push(OP.f64_add, OP.f64_floor);
        break;
      case TOKEN.truncate:
        code.push(OP.f64_trunc);
        break;
      case TOKEN.cvi:
        // Truncate toward zero, keep as f64.
        code.push(OP.i32_trunc_f64_s, OP.f64_convert_i32_s);
        break;
      case TOKEN.cvr:
        // No-op: already f64.
        break;
      case TOKEN.ln:
        code.push(OP.call);
        this._emitULEB128(PsWasmCompiler.#importIdx.log);
        break;
      case TOKEN.log:
        code.push(OP.call);
        this._emitULEB128(PsWasmCompiler.#importIdx.log10);
        break;
      default:
        return false;
    }
    return true;
  }

  _compileSafeDivNode(first, second) {
    // Returns 0 when divisor == 0 (IEEE 754 gives ±Inf/NaN; pdfium returns 0).
    const tmp = this._allocLocal();
    try {
      if (!this._compileNode(second)) {
        return false;
      }
      if (!this._compileNode(first)) {
        return false;
      }
      const code = this._code;
      this._emitLocalTee(tmp);
      code.push(OP.f64_div);
      this._emitF64Const(0);
      this._emitLocalGet(tmp);
      this._emitF64Const(0);
      code.push(OP.f64_ne, OP.select);
      return true;
    } finally {
      this._releaseLocal(tmp);
    }
  }

  _compileSafeIdivNode(first, second) {
    // `trunc(second / first)` returning 0 when first == 0, matching pdfium.
    // Same select pattern as _compileSafeDivNode with an extra f64_trunc.
    const tmp = this._allocLocal();
    try {
      if (!this._compileNode(second)) {
        return false;
      }
      if (!this._compileNode(first)) {
        return false;
      }
      const code = this._code;
      this._emitLocalTee(tmp);
      code.push(OP.f64_div, OP.f64_trunc);
      this._emitF64Const(0);
      this._emitLocalGet(tmp);
      this._emitF64Const(0);
      code.push(OP.f64_ne, OP.select);
      return true;
    } finally {
      this._releaseLocal(tmp);
    }
  }

  _compileBitshiftNode(first, second) {
    if (first.type !== PS_NODE.const || !Number.isInteger(first.value)) {
      return false;
    }
    if (!this._compileNode(second)) {
      return false;
    }

    const code = this._code;
    code.push(OP.i32_trunc_f64_s);
    const shift = first.value;
    if (shift > 0) {
      code.push(OP.i32_const);
      this._emitSLEB128(shift);
      code.push(OP.i32_shl);
    } else if (shift < 0) {
      code.push(OP.i32_const);
      this._emitSLEB128(-shift);
      code.push(OP.i32_shr_s);
    }
    code.push(OP.f64_convert_i32_s);
    return true;
  }

  _compileModNode(first, second) {
    // a mod 0 → 0, matching pdfium. Const b=0: a is computed but discarded.
    if (first.type === PS_NODE.const && first.value === 0) {
      if (!this._compileNode(second)) {
        return false;
      }
      this._code.push(OP.drop);
      this._emitF64Const(0);
      return true;
    }

    const localA = this._allocLocal();
    try {
      if (!this._compileNode(second)) {
        return false;
      }
      this._emitLocalTee(localA);

      const code = this._code;
      if (first.type === PS_NODE.const) {
        // b≠0 guaranteed (b=0 handled above).
        this._emitLocalGet(localA);
        this._emitF64Const(first.value);
        code.push(OP.f64_div, OP.f64_trunc);
        this._emitF64Const(first.value);
        code.push(OP.f64_mul, OP.f64_sub);
      } else {
        const localB = this._allocLocal();
        try {
          if (!this._compileNode(first)) {
            return false;
          }
          this._emitLocalSet(localB);
          this._emitLocalGet(localA);
          this._emitLocalGet(localB);
          code.push(OP.f64_div, OP.f64_trunc);
          this._emitLocalGet(localB);
          code.push(OP.f64_mul, OP.f64_sub);
          // Guard: if b=0, return 0 instead of NaN.
          this._emitF64Const(0);
          this._emitLocalGet(localB);
          this._emitF64Const(0);
          code.push(OP.f64_ne, OP.select);
        } finally {
          this._releaseLocal(localB);
        }
      }
      return true;
    } finally {
      this._releaseLocal(localA);
    }
  }

  _compileAtanNode(first, second) {
    const localR = this._allocLocal();
    try {
      if (!this._compileNode(second)) {
        return false;
      }
      if (!this._compileNode(first)) {
        return false;
      }

      const code = this._code;
      code.push(OP.call);
      this._emitULEB128(PsWasmCompiler.#importIdx.atan2);
      this._emitF64Const(PsWasmCompiler.#radToDeg);
      code.push(OP.f64_mul);

      this._emitLocalTee(localR);
      this._emitF64Const(0);
      code.push(OP.f64_lt, OP.if, F64);
      this._emitLocalGet(localR);
      this._emitF64Const(360);
      code.push(OP.f64_add, OP.else);
      this._emitLocalGet(localR);
      code.push(OP.end);
      return true;
    } finally {
      this._releaseLocal(localR);
    }
  }

  _compileBitwiseNode(op, first, second) {
    if (!this._compileBitwiseOperandI32(second)) {
      return false;
    }
    if (!this._compileBitwiseOperandI32(first)) {
      return false;
    }
    const code = this._code;
    switch (op) {
      case TOKEN.and:
        code.push(OP.i32_and);
        break;
      case TOKEN.or:
        code.push(OP.i32_or);
        break;
      case TOKEN.xor:
        code.push(OP.i32_xor);
        break;
      default:
        return false;
    }
    code.push(OP.f64_convert_i32_s);
    return true;
  }

  _compileBitwiseOperandI32(node) {
    if (node.valueType === PS_VALUE_TYPE.boolean) {
      return this._compileNodeAsBoolI32(node);
    }
    if (!this._compileNode(node)) {
      return false;
    }
    this._code.push(OP.i32_trunc_f64_s);
    return true;
  }

  _compileStandardBinaryNode(op, first, second) {
    // Identical non-atomic operands: compile once, tee/get.
    // Skip when shared — _compileNode already handles that case.
    if (
      first === second &&
      first.type !== PS_NODE.arg &&
      first.type !== PS_NODE.const &&
      !first.shared
    ) {
      const tmp = this._allocLocal();
      try {
        if (!this._compileNode(first)) {
          return false;
        }
        this._emitLocalTee(tmp); // [x]  (also stores to tmp)
        this._emitLocalGet(tmp); // [x, x]
      } finally {
        this._releaseLocal(tmp);
      }
    } else {
      if (!this._compileNode(second)) {
        return false;
      }
      if (!this._compileNode(first)) {
        return false;
      }
    }

    const code = this._code;
    switch (op) {
      case TOKEN.add:
        code.push(OP.f64_add);
        break;
      case TOKEN.sub:
        code.push(OP.f64_sub);
        break;
      case TOKEN.mul:
        code.push(OP.f64_mul);
        break;
      case TOKEN.exp:
        code.push(OP.call);
        this._emitULEB128(PsWasmCompiler.#importIdx.pow);
        break;
      case TOKEN.eq:
        code.push(OP.f64_eq, OP.f64_convert_i32_s);
        break;
      case TOKEN.ne:
        code.push(OP.f64_ne, OP.f64_convert_i32_s);
        break;
      case TOKEN.lt:
        code.push(OP.f64_lt, OP.f64_convert_i32_s);
        break;
      case TOKEN.le:
        code.push(OP.f64_le, OP.f64_convert_i32_s);
        break;
      case TOKEN.gt:
        code.push(OP.f64_gt, OP.f64_convert_i32_s);
        break;
      case TOKEN.ge:
        code.push(OP.f64_ge, OP.f64_convert_i32_s);
        break;
      case TOKEN.min:
        code.push(OP.f64_min);
        break;
      case TOKEN.max:
        code.push(OP.f64_max);
        break;
      default:
        return false;
    }
    return true;
  }

  _compileBinaryNode(node) {
    const { op, first, second } = node;
    if (op === TOKEN.bitshift) {
      return this._compileBitshiftNode(first, second);
    }

    if (op === TOKEN.div) {
      return this._compileSafeDivNode(first, second);
    }

    if (op === TOKEN.idiv) {
      return this._compileSafeIdivNode(first, second);
    }

    if (op === TOKEN.mod) {
      return this._compileModNode(first, second);
    }

    if (op === TOKEN.atan) {
      return this._compileAtanNode(first, second);
    }

    if (op === TOKEN.and || op === TOKEN.or || op === TOKEN.xor) {
      return this._compileBitwiseNode(op, first, second);
    }

    return this._compileStandardBinaryNode(op, first, second);
  }

  /**
   * Compile `node` leaving an i32 (0 or 1) on the stack, short-circuiting
   * f64/i32 round-trips for comparisons, boolean and/or/xor, and boolean `not`.
   */
  _compileNodeAsBoolI32(node) {
    if (node.type === PS_NODE.binary) {
      // Comparison: leaves i32 directly.
      const wasmOp = PsWasmCompiler.#comparisonToOp.get(node.op);
      if (wasmOp !== undefined) {
        if (!this._compileNode(node.second)) {
          return false;
        }
        if (!this._compileNode(node.first)) {
          return false;
        }
        this._code.push(wasmOp);
        return true;
      }
      // Boolean and/or/xor: compile as i32, skipping f64.convert_i32_s.
      if (
        node.valueType === PS_VALUE_TYPE.boolean &&
        (node.op === TOKEN.and || node.op === TOKEN.or || node.op === TOKEN.xor)
      ) {
        if (!this._compileNodeAsBoolI32(node.second)) {
          return false;
        }
        if (!this._compileNodeAsBoolI32(node.first)) {
          return false;
        }
        switch (node.op) {
          case TOKEN.and:
            this._code.push(OP.i32_and);
            break;
          case TOKEN.or:
            this._code.push(OP.i32_or);
            break;
          case TOKEN.xor:
            this._code.push(OP.i32_xor);
            break;
        }
        return true;
      }
    }
    // Boolean not: i32.eqz.
    if (
      node.type === PS_NODE.unary &&
      node.op === TOKEN.not &&
      node.valueType === PS_VALUE_TYPE.boolean
    ) {
      if (!this._compileNodeAsBoolI32(node.operand)) {
        return false;
      }
      this._code.push(OP.i32_eqz);
      return true;
    }
    // Fallback: f64 then truncate (safe — boolean f64 is always 0.0 or 1.0).
    if (!this._compileNode(node)) {
      return false;
    }
    if (node.valueType === PS_VALUE_TYPE.boolean) {
      this._code.push(OP.i32_trunc_f64_s);
    } else {
      // Unknown type: f64.ne treats NaN as truthy (NaN != 0 → 1).
      this._emitF64Const(0);
      this._code.push(OP.f64_ne);
    }
    return true;
  }

  // Value-returning if/else/end; both branches leave one f64.
  _compileTernaryNode(node) {
    if (!this._compileNodeAsBoolI32(node.cond)) {
      return false;
    }
    this._code.push(OP.if, F64);
    if (!this._compileNode(node.then)) {
      return false;
    }
    this._code.push(OP.else);
    if (!this._compileNode(node.otherwise)) {
      return false;
    }
    this._code.push(OP.end);
    return true;
  }

  /**
   * Convert the parser AST to a tree, compile each output expression, clamp
   * results to the declared range, store to linear memory, and assemble the
   * Wasm binary.
   *
   * @param {import("./ast.js").PsProgram} program
   * @returns {Uint8Array|null}  Wasm binary, or null if compilation failed.
   */
  compile(program) {
    const outputs = new PSStackToTree().evaluate(program, this._nIn);
    if (!outputs || outputs.length < this._nOut) {
      return null;
    }

    // For each output: push memory offset, compile, clamp to [min, max], store.
    const code = this._code;
    for (let i = 0; i < this._nOut; i++) {
      const min = this._range[i * 2];
      const max = this._range[i * 2 + 1];
      code.push(OP.i32_const);
      this._emitSLEB128(i * 8);
      if (!this._compileNode(outputs[i])) {
        return null;
      }
      this._emitF64Const(max);
      code.push(OP.f64_min);
      this._emitF64Const(min);
      code.push(OP.f64_max, OP.f64_store, 0x03, 0x00);
    }
    code.push(OP.end); // end of function body

    // Assemble the Wasm module binary

    const nIn = this._nIn;
    const nLocals = this._nextLocal - nIn;

    // Type section: function type varies per compilation; imports precomputed.
    const paramTypes = Array(nIn).fill(F64);
    const resultTypes = []; // void: outputs are written to linear memory
    const funcType = [FUNC_TYPE, ...vec(paramTypes), ...vec(resultTypes)];
    const typeSectionBytes = new Uint8Array(
      section(
        SECTION.type,
        vec([funcType, ...PsWasmCompiler.#importTypeEntries])
      )
    );

    // Code section: local declarations + compiled body bytes.
    const localDecls =
      nLocals > 0
        ? vec([[...unsignedLEB128(nLocals), F64]]) // one group of nLocals f64s
        : vec([]);
    const funcBodyLen = localDecls.length + code.length;
    const codeSectionBytes = new Uint8Array(
      section(
        SECTION.code,
        vec([[...unsignedLEB128(funcBodyLen), ...localDecls, ...code]])
      )
    );

    // Section order per spec: type, import, function, memory, export, code.
    const magicVersion = PsWasmCompiler.#wasmMagicVersion;
    const importSection = PsWasmCompiler.#importSection;
    const functionSection = PsWasmCompiler.#functionSection;
    const memorySection = PsWasmCompiler.#memorySection;
    const exportSection = PsWasmCompiler.#exportSection;
    const totalLen =
      magicVersion.length +
      typeSectionBytes.length +
      importSection.length +
      functionSection.length +
      memorySection.length +
      exportSection.length +
      codeSectionBytes.length;
    const result = new Uint8Array(totalLen);
    let off = 0;
    result.set(magicVersion, off);
    off += magicVersion.length;
    result.set(typeSectionBytes, off);
    off += typeSectionBytes.length;
    result.set(importSection, off);
    off += importSection.length;
    result.set(functionSection, off);
    off += functionSection.length;
    result.set(memorySection, off);
    off += memorySection.length;
    result.set(exportSection, off);
    off += exportSection.length;
    result.set(codeSectionBytes, off);
    return result;
  }
}

/**
 * Parse and compile a PostScript Type 4 function source string into a Wasm
 * binary.  PSStackToTree handles constant folding and algebraic simplifications
 * during the parse-to-tree conversion, so no separate optimizer pass is needed.
 *
 * @param {string} source    – raw PostScript source (decoded PDF stream)
 * @param {number[]} domain  – flat [min0,max0, min1,max1, ...] array
 * @param {number[]} range   – flat [min0,max0, min1,max1, ...] array
 * @returns {Uint8Array|null}  – Wasm binary, or null if compilation failed
 */
function compilePostScriptToWasm(source, domain, range) {
  return new PsWasmCompiler(domain, range).compile(
    parsePostScriptFunction(source)
  );
}

/**
 * Build a JS wrapper around a compiled Wasm instance.
 *
 * The returned function has the signature `(src, srcOffset, dest, destOffset)`.
 * It reads nIn f64 inputs from `src` starting at `srcOffset`, and writes
 * nOut clamped f64 outputs to `dest` starting at `destOffset`.
 */
function _makeWrapper(exports, nIn, nOut) {
  const { fn, mem } = exports;
  const outView = new Float64Array(mem.buffer, 0, nOut);

  // Unrolled for common arities (1-4) to avoid loop overhead.
  let writeOut;
  switch (nOut) {
    case 1:
      writeOut = (dest, destOffset) => {
        dest[destOffset] = outView[0];
      };
      break;
    case 2:
      writeOut = (dest, destOffset) => {
        dest[destOffset] = outView[0];
        dest[destOffset + 1] = outView[1];
      };
      break;
    case 3:
      writeOut = (dest, destOffset) => {
        dest[destOffset] = outView[0];
        dest[destOffset + 1] = outView[1];
        dest[destOffset + 2] = outView[2];
      };
      break;
    case 4:
      writeOut = (dest, destOffset) => {
        dest[destOffset] = outView[0];
        dest[destOffset + 1] = outView[1];
        dest[destOffset + 2] = outView[2];
        dest[destOffset + 3] = outView[3];
      };
      break;
    default:
      writeOut = (dest, destOffset) => {
        for (let i = 0; i < nOut; i++) {
          dest[destOffset + i] = outView[i];
        }
      };
  }

  // Specialize the call site for each arity so that the engine sees a
  // fixed-argument call rather than a spread — avoiding the per-call
  // argument-array allocation that `fn(...inBuf)` would cause.
  switch (nIn) {
    case 1:
      return (src, srcOffset, dest, destOffset) => {
        fn(src[srcOffset]);
        writeOut(dest, destOffset);
      };
    case 2:
      return (src, srcOffset, dest, destOffset) => {
        fn(src[srcOffset], src[srcOffset + 1]);
        writeOut(dest, destOffset);
      };
    case 3:
      return (src, srcOffset, dest, destOffset) => {
        fn(src[srcOffset], src[srcOffset + 1], src[srcOffset + 2]);
        writeOut(dest, destOffset);
      };
    case 4:
      return (src, srcOffset, dest, destOffset) => {
        fn(
          src[srcOffset],
          src[srcOffset + 1],
          src[srcOffset + 2],
          src[srcOffset + 3]
        );
        writeOut(dest, destOffset);
      };
    default: {
      // Fallback for unusual arities: pre-allocate once, copy per call.
      const inBuf = new Float64Array(nIn);
      return (src, srcOffset, dest, destOffset) => {
        for (let i = 0; i < nIn; i++) {
          inBuf[i] = src[srcOffset + i];
        }
        fn(...inBuf);
        writeOut(dest, destOffset);
      };
    }
  }
}

/**
 * Parse, optimize, compile, and synchronously instantiate a PostScript Type 4
 * function source string as a callable JavaScript function backed by a Wasm
 * module.
 *
 * Note: synchronous Wasm compilation is only allowed for small modules
 * (< 4 KB in most browsers).  Type 4 functions always qualify.
 *
 * @param {string} source    – raw PostScript source (decoded PDF stream)
 * @param {number[]} domain  – flat [min0,max0, min1,max1, ...] array
 * @param {number[]} range   – flat [min0,max0, min1,max1, ...] array
 * @returns {Function|null}  – a `(src, srcOffset, dest, destOffset)` function
 *   that writes nOut clamped f64 outputs to `dest`, or null if compilation
 *   failed.
 */
function buildPostScriptWasmFunction(source, domain, range) {
  const bytes = compilePostScriptToWasm(source, domain, range);
  if (!bytes) {
    return null;
  }
  try {
    const instance = new WebAssembly.Instance(
      new WebAssembly.Module(bytes),
      _mathImportObject
    );
    return _makeWrapper(
      instance.exports,
      domain.length >> 1,
      range.length >> 1
    );
  } catch {
    return null;
  }
}

export { buildPostScriptWasmFunction, compilePostScriptToWasm };
