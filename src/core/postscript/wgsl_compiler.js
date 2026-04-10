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

import { FunctionType, getSampleArray } from "../function.js";
import {
  parsePostScriptFunction,
  PS_NODE,
  PS_VALUE_TYPE,
  PSStackToTree,
} from "./ast.js";
import { BaseStream } from "../base_stream.js";
import { Dict } from "../primitives.js";
import { TOKEN } from "./lexer.js";

const _RAD_TO_DEG = (180 / Math.PI).toPrecision(17);

// Comparison operator symbols shared by _binary (wraps in f32()) and
// _nodeAsBool (wraps in parentheses for use as a WGSL bool condition).
const _CMP_OPS = new Map([
  [TOKEN.eq, "=="],
  [TOKEN.ne, "!="],
  [TOKEN.gt, ">"],
  [TOKEN.ge, ">="],
  [TOKEN.lt, "<"],
  [TOKEN.le, "<="],
]);

/**
 * Format a JS number as a WGSL f32 literal, or null for NaN/Infinity.
 * @param {number|boolean} v
 * @returns {string|null}
 */
function f32Lit(v) {
  if (typeof v === "boolean") {
    return v ? "1.0" : "0.0";
  }
  if (!isFinite(v)) {
    return null;
  }
  // WGSL abstract-float literals must contain a '.' or an exponent.
  const s = String(v);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
}

/**
 * Wrap body lines in the standard vertex + fragment shader boilerplate.
 * `prelude` is inserted at module scope before the structs (e.g. a
 * `const _samples = …` declaration for Type-0 shaders).
 * @param {string[]} body    – fs_main body lines (let-bindings + return)
 * @param {number}   nOut    – 1 (grey) or 3 (RGB)
 * @param {string}   prelude – optional module-scope WGSL declarations
 * @returns {string}
 */
function _wgslShader(body, nOut, prelude = "") {
  const ret =
    nOut === 1 ? "vec4f(_o0, _o0, _o0, 1.0)" : "vec4f(_o0, _o1, _o2, 1.0)";
  const prefix = prelude ? `${prelude}\n` : "";
  return `${prefix}
struct VertexInput {
  @location(0) pos:   vec2f,
  @location(1) coord: vec2f,
};

struct VertexOutput {
  @builtin(position) pos:   vec4f,
  @location(0)       coord: vec2f,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.pos   = vec4f(in.pos, 0.0, 1.0);
  out.coord = in.coord;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
${body.join("\n")}
  return ${ret};
}`;
}

/** Compiles a PostScript expression tree into a WGSL fragment shader. */
class PsWgslCompiler {
  /**
   * @param {number[]} domain – flat [i_min, i_max, j_min, j_max]
   * @param {number[]} range  – flat [c0_min, c0_max, …]
   */
  constructor(domain, range, varPrefix = "") {
    this.nIn = domain.length >> 1; // must be 2
    this.nOut = range.length >> 1; // 1 (grey) or 3 (RGB)
    this.range = range;
    this._lines = []; // let-bindings emitted so far
    this._cse = new Map(); // shared node → temp variable name
    this._tmpCount = 0;
    this._varPrefix = varPrefix;
  }

  /**
   * Run the PSStackToTree evaluator on `program`, then lower the first
   * `count` output nodes to WGSL expressions.
   * @param {import("./ast.js").PsProgram} program
   * @param {number} count
   * @returns {string[]|null}
   */
  _evaluate(program, count) {
    const outputs = new PSStackToTree().evaluate(program, this.nIn);
    if (!outputs || outputs.length < count) {
      return null;
    }
    const exprs = [];
    for (let i = 0; i < count; i++) {
      const expr = this._node(outputs[i]);
      if (expr === null) {
        return null;
      }
      exprs.push(expr);
    }
    return exprs;
  }

  /**
   * Compile a PS program to a complete WGSL shader (nIn=2, nOut=1 or 3).
   * @param {import("./ast.js").PsProgram} program
   * @returns {string|null}
   */
  compile(program) {
    const { nIn, nOut } = this;
    if (nIn !== 2 || (nOut !== 1 && nOut !== 3)) {
      return null;
    }
    const outExprs = this._evaluate(program, nOut);
    if (!outExprs) {
      return null;
    }
    return this._buildShader(outExprs);
  }

  /**
   * Like compile(), but returns body lines only (for embedding in a
   * multi-component shader). Only nIn=2, nOut=1 functions are supported.
   *
   * @param {import("./ast.js").PsProgram} program
   * @param {number} outputIndex
   * @returns {string[]|null}
   */
  compileToBody(program, outputIndex) {
    if (this.nIn !== 2 || this.nOut !== 1) {
      return null;
    }
    const exprs = this._evaluate(program, 1);
    if (!exprs) {
      return null;
    }
    const rMin = f32Lit(this.range[0]);
    const rMax = f32Lit(this.range[1]);
    if (rMin === null || rMax === null) {
      return null;
    }
    const lines = this._lines.slice();
    lines.push(
      `  let _o${outputIndex} = clamp(${exprs[0]}, ${rMin}, ${rMax});`
    );
    return lines;
  }

  /**
   * Compile a node to a WGSL f32 expression.  Shared (CSE) nodes are
   * let-bound on first visit; arg/const nodes are always inlined.
   * @param {import("./ast.js").PsNode} node
   * @returns {string|null}
   */
  _node(node) {
    if (node.type === PS_NODE.arg) {
      return node.index === 0 ? "in.coord.x" : "in.coord.y";
    }
    if (node.type === PS_NODE.const) {
      return f32Lit(node.value);
    }

    if (node.shared) {
      const cached = this._cse.get(node);
      if (cached !== undefined) {
        return cached;
      }
      const expr = this._nodeExpr(node);
      if (expr === null) {
        return null;
      }
      const name = `_${this._varPrefix}t${this._tmpCount++}`;
      this._lines.push(`  let ${name} = ${expr};`);
      this._cse.set(node, name);
      return name;
    }

    return this._nodeExpr(node);
  }

  /**
   * Dispatch a non-leaf node to its type-specific compiler.
   * @param {import("./ast.js").PsNode} node
   * @returns {string|null}
   */
  _nodeExpr(node) {
    switch (node.type) {
      case PS_NODE.unary:
        return this._unary(node);
      case PS_NODE.binary:
        return this._binary(node);
      case PS_NODE.ternary:
        return this._ternary(node);
      default:
        return null;
    }
  }

  /**
   * @param {import("./ast.js").PsUnaryNode} node
   * @returns {string|null}
   */
  _unary(node) {
    const x = this._node(node.operand);
    if (x === null) {
      return null;
    }
    switch (node.op) {
      case TOKEN.abs:
        return `abs(${x})`;
      case TOKEN.neg:
        return `-(${x})`;
      case TOKEN.ceiling:
        return `ceil(${x})`;
      case TOKEN.floor:
        return `floor(${x})`;
      case TOKEN.round:
        // PS round = floor(x + 0.5), not WGSL round-half-to-even.
        return `floor(${x} + 0.5)`;
      case TOKEN.truncate:
        return `trunc(${x})`;
      case TOKEN.sqrt:
        return `sqrt(${x})`;
      case TOKEN.sin:
        // PS takes degrees; reduce mod 360 before converting to radians so
        // that exact multiples of 360 produce exactly 0.
        return `sin((${x} % 360.0) * 0.017453292519943295)`;
      case TOKEN.cos:
        return `cos((${x} % 360.0) * 0.017453292519943295)`;
      case TOKEN.ln:
        return `log(${x})`;
      case TOKEN.log:
        // WGSL log() is natural log; multiply by 1/ln(10) for log₁₀.
        return `(log(${x}) * 0.4342944819032518)`;
      case TOKEN.cvi:
        return `f32(i32(trunc(${x})))`;
      case TOKEN.cvr:
        return x; // no-op: values are already f32
      case TOKEN.not:
        // The tree compiler already resolved the type at compile time.
        if (node.valueType === PS_VALUE_TYPE.boolean) {
          return `(1.0 - ${x})`;
        }
        if (node.valueType === PS_VALUE_TYPE.numeric) {
          return `f32(~i32(${x}))`;
        }
        return null; // PS_VALUE_TYPE.unknown — cannot generate correct code
      default:
        return null;
    }
  }

  /**
   * @param {import("./ast.js").PsBinaryNode} node
   * @returns {string|null}
   */
  _binary(node) {
    // PS stack order: "a b op" → node.second = a, node.first = b.
    const lhs = this._node(node.second);
    const rhs = this._node(node.first);
    if (lhs === null || rhs === null) {
      return null;
    }
    switch (node.op) {
      case TOKEN.add:
        return `(${lhs} + ${rhs})`;
      case TOKEN.sub:
        return `(${lhs} - ${rhs})`;
      case TOKEN.mul:
        return `(${lhs} * ${rhs})`;
      // Safe division: return 0 when divisor is 0.
      case TOKEN.div:
        return `select(0.0, ${lhs} / ${rhs}, ${rhs} != 0.0)`;
      case TOKEN.idiv:
        return `select(0.0, trunc(${lhs} / ${rhs}), ${rhs} != 0.0)`;
      case TOKEN.mod:
        // PS mod = remainder (truncation toward zero), same as WGSL %.
        return `select(0.0, ${lhs} % ${rhs}, ${rhs} != 0.0)`;
      case TOKEN.exp:
        return `pow(${lhs}, ${rhs})`;
      case TOKEN.min:
        return `min(${lhs}, ${rhs})`;
      case TOKEN.max:
        return `max(${lhs}, ${rhs})`;
      // Bitwise ops: cast to i32, operate, cast back to f32.
      case TOKEN.and:
        return `f32(i32(${lhs}) & i32(${rhs}))`;
      case TOKEN.or:
        return `f32(i32(${lhs}) | i32(${rhs}))`;
      case TOKEN.xor:
        return `f32(i32(${lhs}) ^ i32(${rhs}))`;
      case TOKEN.atan: {
        // PS atan(dy, dx) returns degrees in [0, 360).
        const deg = `_${this._varPrefix}t${this._tmpCount++}`;
        this._lines.push(
          `  let ${deg} = atan2(${lhs}, ${rhs}) * ${_RAD_TO_DEG};`
        );
        return `select(${deg} + 360.0, ${deg}, ${deg} >= 0.0)`;
      }
      case TOKEN.bitshift: {
        // Positive shift amount = left, negative = right.  select() discards
        // the unused branch, so the u32() wrap-around is harmless.
        const vi = `_${this._varPrefix}t${this._tmpCount++}`;
        const vn = `_${this._varPrefix}t${this._tmpCount++}`;
        this._lines.push(
          `  let ${vi} = i32(${lhs});`,
          `  let ${vn} = i32(${rhs});`
        );
        return `select(f32(${vi} >> u32(-${vn})), f32(${vi} << u32(${vn})), ${vn} >= 0)`;
      }
    }
    // Comparisons: f32(bool) → 0.0 or 1.0.
    const cmpOp = _CMP_OPS.get(node.op);
    return cmpOp ? `f32(${lhs} ${cmpOp} ${rhs})` : null;
  }

  /**
   * Compile a node to a WGSL bool for use as a branch condition.
   * Non-shared comparison nodes are emitted directly; everything else
   * falls back to `(expr) != 0.0`.
   * @param {import("./ast.js").PsNode} node
   * @returns {string|null}
   */
  _nodeAsBool(node) {
    if (!node.shared && node.type === PS_NODE.binary) {
      const lhs = this._node(node.second);
      const rhs = this._node(node.first);
      if (lhs === null || rhs === null) {
        return null;
      }
      const cmpOp = _CMP_OPS.get(node.op);
      if (cmpOp) {
        return `(${lhs} ${cmpOp} ${rhs})`;
      }
    }
    const expr = this._node(node);
    if (expr === null) {
      return null;
    }
    return `(${expr}) != 0.0`;
  }

  /**
   * @param {import("./ast.js").PsTernaryNode} node
   * @returns {string|null}
   */
  _ternary(node) {
    const cond = this._nodeAsBool(node.cond);
    const then = this._node(node.then);
    const otherwise = this._node(node.otherwise);
    if (cond === null || then === null || otherwise === null) {
      return null;
    }
    return `select(${otherwise}, ${then}, ${cond})`;
  }

  /**
   * Assemble the final WGSL shader from accumulated CSE lines and output
   * expressions, clamping each output to its declared range.
   * @param {string[]} outExprs – one WGSL expression per output channel
   * @returns {string|null}
   */
  _buildShader(outExprs) {
    const { range, nOut } = this;

    // CSE let-bindings first, then clamped outputs.
    const body = [...this._lines];
    for (let i = 0; i < nOut; i++) {
      const rMin = f32Lit(range[i * 2]);
      const rMax = f32Lit(range[i * 2 + 1]);
      if (rMin === null || rMax === null) {
        return null;
      }
      body.push(`  let _o${i} = clamp(${outExprs[i]}, ${rMin}, ${rMax});`);
    }
    return _wgslShader(body, nOut);
  }
}

/**
 * Compile a Type-4 PostScript function to a WGSL shader, or null on failure
 * (variable stack depth, or nIn ≠ 2, or nOut ∉ {1, 3}).
 * @param {import("./ast.js").PsProgram} program
 * @param {number[]} domain – flat [i_min, i_max, j_min, j_max]
 * @param {number[]} range  – flat [c0_min, c0_max, …]
 * @returns {string|null}
 */
function buildPostScriptWgslShader(program, domain, range) {
  return new PsWgslCompiler(domain, range).compile(program);
}

/**
 * WGSL expression for `xVar ^ n`, or null when n can't be represented as f32.
 * Special-cases n=0 (→ "1.0") and n=1 (→ xVar) to avoid pow(x, 0.0) = NaN.
 * @param {number} n
 * @param {string} xVar – WGSL variable name for the base
 * @returns {string|null}
 */
function _powExpr(n, xVar) {
  if (n === 0) {
    return "1.0"; // x^0 = 1; pow(x, 0.0) is NaN in WGSL when x=0.
  }
  if (n === 1) {
    return xVar;
  }
  const nLit = f32Lit(n);
  return nLit !== null ? `pow(${xVar}, ${nLit})` : null;
}

/**
 * Compile a Type-2 (Exponential Interpolation) PDF function to a WGSL shader.
 * The output uses in.coord.x as input; in.coord.y is ignored.
 *
 * @param {number[]} c0           – output values at x = 0 (length nOut)
 * @param {number[]} c1           – output values at x = 1 (length nOut)
 * @param {number}   n            – interpolation exponent (N)
 * @param {number[]} domain       – [xmin, xmax]
 * @param {number[]|null} range   – flat [c0_min, c0_max, …], or null → [0, 1]
 * @returns {string|null}
 */
function buildExponentialWgslShader(c0, c1, n, domain, range) {
  const nOut = c0.length;
  if (nOut !== 1 && nOut !== 3) {
    return null;
  }
  const xMin = f32Lit(domain[0]);
  const xMax = f32Lit(domain[1]);
  if (xMin === null || xMax === null) {
    return null;
  }
  const pow = _powExpr(n, "x");
  if (pow === null) {
    return null;
  }
  const body = [`  let x = clamp(in.coord.x, ${xMin}, ${xMax});`];
  for (let j = 0; j < nOut; j++) {
    const c0j = f32Lit(c0[j]);
    const diffj = f32Lit(c1[j] - c0[j]);
    const rMin = range ? f32Lit(range[j * 2]) : "0.0";
    const rMax = range ? f32Lit(range[j * 2 + 1]) : "1.0";
    if (c0j === null || diffj === null || rMin === null || rMax === null) {
      return null;
    }
    body.push(
      `  let _o${j} = clamp(${c0j} + ${pow} * ${diffj}, ${rMin}, ${rMax});`
    );
  }
  return _wgslShader(body, nOut);
}

/**
 * Compile a Type-0 (Sampled) PDF function to a WGSL shader using bilinear
 * interpolation.  Only 2-input (nIn = 2) functions are supported.
 * @param {number[]} samples – normalized sample values (from getSampleArray)
 * @param {number[]} size    – [sx, sy] grid dimensions (each ≥ 2)
 * @param {number[]} encode  – flat [eX0, eX1, eY0, eY1]
 * @param {number[]} decode  – flat [d0_min, d0_max, …]
 * @param {number[]} domain  – flat [x0, x1, y0, y1]
 * @param {number[]} range   – flat [c0_min, c0_max, …]
 * @returns {string|null}
 */
function buildSampledWgslShader(samples, size, encode, decode, domain, range) {
  if (domain.length !== 4) {
    return null; // only nIn = 2 supported
  }
  const nOut = range.length / 2;
  if (nOut !== 1 && nOut !== 3) {
    return null;
  }
  const preludes = [];
  const bodyLines = [];
  for (let j = 0; j < nOut; j++) {
    const varPrefix = nOut > 1 ? `c${j}_` : "";
    const jSamples =
      nOut === 1
        ? samples
        : Array.from(
            { length: size[0] * size[1] },
            (_, k) => samples[k * nOut + j]
          );
    const result = _sampledComponentBody(
      jSamples,
      size,
      encode,
      decode.slice(j * 2, j * 2 + 2),
      domain,
      range.slice(j * 2, j * 2 + 2),
      j,
      varPrefix
    );
    if (!result) {
      return null;
    }
    preludes.push(result.prelude);
    bodyLines.push(...result.lines);
  }
  return _wgslShader(bodyLines, nOut, preludes.join("\n"));
}

/**
 * Build WGSL body lines for one 2-in 1-out Type-0 (Sampled) component.
 * Variable names are prefixed with `varPrefix` to avoid collisions when
 * multiple components share the same fs_main body.
 * @param {number[]} samples     – normalised to [0, 1]
 * @param {number[]} size        – [sx, sy]
 * @param {number[]} encode      – [eX0, eX1, eY0, eY1]
 * @param {number[]} decode      – [d_min, d_max]
 * @param {number[]} domain      – [x0, x1, y0, y1]
 * @param {number[]} range       – [r_min, r_max]
 * @param {number}   outputIndex – index used to name the result `_o{N}`
 * @param {string}   varPrefix   – prefix for intermediate variable names
 * @returns {{ prelude: string, lines: string[] }|null}
 */
function _sampledComponentBody(
  samples,
  size,
  encode,
  decode,
  domain,
  range,
  outputIndex,
  varPrefix
) {
  if (domain.length !== 4 || range.length !== 2) {
    return null;
  }
  const sx = size[0];
  const sy = size[1];
  if (sx < 2 || sy < 2) {
    return null;
  }
  const nSamples = sx * sy; // nOut = 1
  if (nSamples > 65536) {
    return null;
  }

  const sampleLits = [];
  for (let i = 0; i < nSamples; i++) {
    const lit = f32Lit(samples[i]);
    if (lit === null) {
      return null;
    }
    sampleLits.push(lit);
  }

  const xMin = f32Lit(domain[0]);
  const xMax = f32Lit(domain[1]);
  const yMin = f32Lit(domain[2]);
  const yMax = f32Lit(domain[3]);
  if (xMin === null || xMax === null || yMin === null || yMax === null) {
    return null;
  }
  if (domain[0] === domain[1] || domain[2] === domain[3]) {
    return null;
  }

  const scaleX = f32Lit((encode[1] - encode[0]) / (domain[1] - domain[0]));
  const scaleY = f32Lit((encode[3] - encode[2]) / (domain[3] - domain[2]));
  if (scaleX === null || scaleY === null) {
    return null;
  }

  const eX0 = f32Lit(encode[0]);
  const eY0 = f32Lit(encode[2]);
  if (eX0 === null || eY0 === null) {
    return null;
  }

  const d0 = f32Lit(decode[0]);
  const diff = f32Lit(decode[1] - decode[0]);
  const rMin = f32Lit(range[0]);
  const rMax = f32Lit(range[1]);
  if (d0 === null || diff === null || rMin === null || rMax === null) {
    return null;
  }

  const sxM1 = f32Lit(sx - 1);
  const syM1 = f32Lit(sy - 1);
  const sxM2 = f32Lit(sx - 2);
  const syM2 = f32Lit(sy - 2);
  const p = varPrefix;
  const sArr = `_samples_${outputIndex}`;
  const sxU = `${sx}u`;

  const lines = [
    `  let _${p}xi = clamp(in.coord.x, ${xMin}, ${xMax});`,
    `  let _${p}yi = clamp(in.coord.y, ${yMin}, ${yMax});`,
    `  let _${p}ex = clamp(${scaleX} * (_${p}xi - ${xMin}) + ${eX0}, 0.0, ${sxM1});`,
    `  let _${p}ey = clamp(${scaleY} * (_${p}yi - ${yMin}) + ${eY0}, 0.0, ${syM1});`,
    `  let _${p}x0 = u32(min(_${p}ex, ${sxM2}));`,
    `  let _${p}x1 = _${p}x0 + 1u;`,
    `  let _${p}y0 = u32(min(_${p}ey, ${syM2}));`,
    `  let _${p}y1 = _${p}y0 + 1u;`,
    `  let _${p}nx1 = _${p}ex - f32(_${p}x0);`,
    `  let _${p}nx0 = 1.0 - _${p}nx1;`,
    `  let _${p}ny1 = _${p}ey - f32(_${p}y0);`,
    `  let _${p}ny0 = 1.0 - _${p}ny1;`,
    `  let _${p}s00 = ${sArr}[_${p}x0 + _${p}y0 * ${sxU}];`,
    `  let _${p}s10 = ${sArr}[_${p}x1 + _${p}y0 * ${sxU}];`,
    `  let _${p}s01 = ${sArr}[_${p}x0 + _${p}y1 * ${sxU}];`,
    `  let _${p}s11 = ${sArr}[_${p}x1 + _${p}y1 * ${sxU}];`,
    `  let _${p}r = _${p}nx0 * (_${p}ny0 * _${p}s00 + _${p}ny1 * _${p}s01)`,
    `    + _${p}nx1 * (_${p}ny0 * _${p}s10 + _${p}ny1 * _${p}s11);`,
    `  let _o${outputIndex} = clamp(${d0} + _${p}r * ${diff}, ${rMin}, ${rMax});`,
  ];

  const prelude = `const ${sArr} = array<f32, ${nSamples}>(${sampleLits.join(", ")});`;
  return { prelude, lines };
}

/**
 * Build body lines for one Type-4 (PostScript) component of an array function.
 * @param {BaseStream} f
 * @param {import("../primitives.js").Dict} fnDict
 * @param {number} outputIndex
 * @param {string} varPrefix
 * @returns {{ prelude: null, lines: string[] }|null}
 */
function _componentBodyPS(f, fnDict, outputIndex, varPrefix) {
  if (!(f instanceof BaseStream)) {
    return null;
  }
  const fnDomain = fnDict.getArray("Domain");
  const fnRange = fnDict.getArray("Range");
  if (!Array.isArray(fnDomain) || !Array.isArray(fnRange)) {
    return null;
  }
  const program = parsePostScriptFunction(f.getString());
  const lines = new PsWgslCompiler(fnDomain, fnRange, varPrefix).compileToBody(
    program,
    outputIndex
  );
  return lines ? { prelude: null, lines } : null;
}

/**
 * Build body lines for one Type-0 (Sampled) component of an array function.
 * @param {BaseStream} f
 * @param {import("../primitives.js").Dict} fnDict
 * @param {number} outputIndex
 * @param {string} varPrefix
 * @returns {{ prelude: string, lines: string[] }|null}
 */
function _componentBodySampled(f, fnDict, outputIndex, varPrefix) {
  if (!(f instanceof BaseStream)) {
    return null;
  }
  const fnDomain = fnDict.getArray("Domain");
  const fnRange = fnDict.getArray("Range");
  if (
    !Array.isArray(fnDomain) ||
    fnDomain.length !== 4 ||
    !Array.isArray(fnRange) ||
    fnRange.length !== 2
  ) {
    return null;
  }
  const size = fnDict.getArray("Size");
  const bps = fnDict.get("BitsPerSample");
  if (!Array.isArray(size) || size.length !== 2 || !(bps > 0)) {
    return null;
  }
  let encode = fnDict.getArray("Encode");
  if (!Array.isArray(encode)) {
    encode = [0, size[0] - 1, 0, size[1] - 1];
  }
  const decode = fnDict.getArray("Decode") || fnRange;
  return _sampledComponentBody(
    getSampleArray(size, 1, bps, f),
    size,
    encode,
    decode,
    fnDomain,
    fnRange,
    outputIndex,
    varPrefix
  );
}

/**
 * Build body lines for one Type-2 (Exponential) component of an array function.
 * @param {import("../primitives.js").Dict} fnDict
 * @param {number} outputIndex
 * @param {string} varPrefix
 * @returns {{ prelude: null, lines: string[] }|null}
 */
function _componentBodyExponential(fnDict, outputIndex, varPrefix) {
  const fnDomain = fnDict.getArray("Domain");
  const c0 = fnDict.getArray("C0")?.[0] ?? 0;
  const c1 = fnDict.getArray("C1")?.[0] ?? 1;
  const n = fnDict.get("N");
  if (
    !Array.isArray(fnDomain) ||
    fnDomain.length < 2 ||
    typeof n !== "number"
  ) {
    return null;
  }
  const xVar = `${varPrefix}x`;
  const xMinLit = f32Lit(fnDomain[0]);
  const xMaxLit = f32Lit(fnDomain[1]);
  const pow = _powExpr(n, xVar);
  const c0Lit = f32Lit(c0);
  const diffLit = f32Lit(c1 - c0);
  const fnRange = fnDict.getArray("Range");
  const rMin = Array.isArray(fnRange) ? f32Lit(fnRange[0]) : "0.0";
  const rMax = Array.isArray(fnRange) ? f32Lit(fnRange[1]) : "1.0";
  if (
    !xMinLit ||
    !xMaxLit ||
    pow === null ||
    !c0Lit ||
    !diffLit ||
    !rMin ||
    !rMax
  ) {
    return null;
  }
  return {
    prelude: null,
    lines: [
      `  let ${xVar} = clamp(in.coord.x, ${xMinLit}, ${xMaxLit});`,
      `  let _o${outputIndex} = clamp(${c0Lit} + ${pow} * ${diffLit}, ${rMin}, ${rMax});`,
    ],
  };
}

/**
 * Read a Type-2 (Exponential) function from a dict and compile it to a WGSL
 * shader.  Works for both BaseStream.dict and a bare Dict.
 * @param {import("../primitives.js").Dict} fnDict
 * @returns {string|null}
 */
function _buildExponentialFromDict(fnDict) {
  const fnDomain = fnDict.getArray("Domain");
  const fnRange = fnDict.getArray("Range");
  const c0 = fnDict.getArray("C0") || [0];
  const c1 = fnDict.getArray("C1") || [1];
  const n = fnDict.get("N");
  if (
    !Array.isArray(fnDomain) ||
    !Array.isArray(c0) ||
    !Array.isArray(c1) ||
    typeof n !== "number"
  ) {
    return null;
  }
  return buildExponentialWgslShader(
    c0,
    c1,
    n,
    fnDomain,
    Array.isArray(fnRange) ? fnRange : null
  );
}

/**
 * Compile a PDF shading /Function to a WGSL shader string, or null on failure.
 * Handles Types 0 (Sampled), 2 (Exponential), and 4 (PostScript), both as a
 * single function and as an array of per-component functions.
 * @returns {string|null}
 */
function buildFunctionBasedWgslShader(xref, fnObj) {
  const resolvedFn = xref.fetchIfRef(fnObj);

  if (resolvedFn instanceof BaseStream) {
    const fnDict = resolvedFn.dict;
    const fnDomain = fnDict.getArray("Domain");
    const fnRange = fnDict.getArray("Range");
    switch (fnDict.get("FunctionType")) {
      case FunctionType.POSTSCRIPT_CALCULATOR: {
        if (!Array.isArray(fnDomain) || !Array.isArray(fnRange)) {
          return null;
        }
        const program = parsePostScriptFunction(resolvedFn.getString());
        return buildPostScriptWgslShader(program, fnDomain, fnRange);
      }
      case FunctionType.EXPONENTIAL_INTERPOLATION:
        return _buildExponentialFromDict(fnDict);
      case FunctionType.SAMPLED: {
        const size = fnDict.getArray("Size");
        const bps = fnDict.get("BitsPerSample");
        if (
          !Array.isArray(fnDomain) ||
          fnDomain.length !== 4 ||
          !Array.isArray(fnRange) ||
          !Array.isArray(size) ||
          size.length !== 2 ||
          !(bps > 0)
        ) {
          return null;
        }
        const nOut = fnRange.length / 2;
        let encode = fnDict.getArray("Encode");
        if (!Array.isArray(encode)) {
          encode = [0, size[0] - 1, 0, size[1] - 1];
        }
        const decode = fnDict.getArray("Decode") || fnRange;
        return buildSampledWgslShader(
          getSampleArray(size, nOut, bps, resolvedFn),
          size,
          encode,
          decode,
          fnDomain,
          fnRange
        );
      }
    }
    return null;
  }

  if (resolvedFn instanceof Dict) {
    // Inline (non-stream) single function — only Type-2 fits here.
    if (
      resolvedFn.get("FunctionType") !== FunctionType.EXPONENTIAL_INTERPOLATION
    ) {
      return null;
    }
    return _buildExponentialFromDict(resolvedFn);
  }

  if (!Array.isArray(resolvedFn)) {
    return null;
  }

  // Array of n per-component functions, each producing one output channel.
  // Types 0 (Sampled, 2-in), 2 (Exponential, 1-in), and 4 (PostScript, 2-in)
  // are all handled inline; per-component variable prefixes avoid collisions.
  const fnObjs = resolvedFn.map(f => xref.fetchIfRef(f));
  const nOut = fnObjs.length;
  if (nOut !== 1 && nOut !== 3) {
    return null;
  }
  const preludes = [];
  const bodyLines = [];
  for (let k = 0; k < nOut; k++) {
    const f = fnObjs[k];
    const varPrefix = `c${k}_`;
    let fnDict = null;
    if (f instanceof BaseStream) {
      fnDict = f.dict;
    } else if (f instanceof Dict) {
      fnDict = f;
    }
    if (!fnDict) {
      return null;
    }
    let result = null;
    switch (fnDict.get("FunctionType")) {
      case FunctionType.POSTSCRIPT_CALCULATOR:
        result = _componentBodyPS(f, fnDict, k, varPrefix);
        break;
      case FunctionType.SAMPLED:
        result = _componentBodySampled(f, fnDict, k, varPrefix);
        break;
      case FunctionType.EXPONENTIAL_INTERPOLATION:
        result = _componentBodyExponential(fnDict, k, varPrefix);
        break;
    }
    if (!result) {
      return null;
    }
    if (result.prelude) {
      preludes.push(result.prelude);
    }
    bodyLines.push(...result.lines);
  }
  return _wgslShader(bodyLines, nOut, preludes.join("\n"));
}

export {
  buildExponentialWgslShader,
  buildFunctionBasedWgslShader,
  buildPostScriptWgslShader,
  buildSampledWgslShader,
};
