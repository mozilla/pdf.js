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

import { Cmd, Dict, EOF, Name, Ref } from "./primitives.js";
import { Lexer, Parser } from "./parser.js";
import { OPS, shadow } from "../shared/util.js";
import {
  parsePostScriptFunction,
  PS_NODE,
  PS_VALUE_TYPE,
  PSStackToTree,
} from "./postscript/ast.js";
import { Lexer as PsLexer, TOKEN } from "./postscript/lexer.js";
import { BaseStream } from "./base_stream.js";
import { EvaluatorPreprocessor } from "./evaluator.js";

if (
  typeof PDFJSDev !== "undefined" &&
  !PDFJSDev.test("TESTING || INTERNAL_VIEWER")
) {
  throw new Error("Not implemented: InternalViewerUtils");
}

// JS operator precedence levels.
const PREC = {
  ATOM: 100, // literals, identifiers, calls — never need parens
  UNARY: 14,
  POW: 13, // right-associative
  MUL: 12,
  ADD: 11,
  SHIFT: 10,
  CMP: 9,
  EQ: 8,
  BAND: 7,
  BXOR: 6,
  BOR: 5,
  TERNARY: 3,
};

// Wrap left (or commutative) operand when child prec < op prec.
function _wrapLeft(child, opPrec) {
  return child.prec < opPrec ? `(${child.expr})` : child.expr;
}

// Wrap right operand (or left of **) when child prec <= op prec.
function _wrapRight(child, opPrec) {
  return child.prec <= opPrec ? `(${child.expr})` : child.expr;
}

function _nodeToExpr(node, argNames, cseMap) {
  if (cseMap?.has(node)) {
    return { expr: cseMap.get(node), prec: PREC.ATOM };
  }
  switch (node.type) {
    case PS_NODE.arg:
      return { expr: argNames[node.index], prec: PREC.ATOM };
    case PS_NODE.const: {
      const v = node.value;
      return {
        expr: String(typeof v === "boolean" ? Number(v) : v),
        prec: PREC.ATOM,
      };
    }
    case PS_NODE.unary:
      return _unaryToExpr(node, argNames, cseMap);
    case PS_NODE.binary:
      return _binaryToExpr(node, argNames, cseMap);
    case PS_NODE.ternary:
      return _ternaryToExpr(node, argNames, cseMap);
    default:
      return null;
  }
}

function _unaryToExpr(node, argNames, cseMap) {
  const { op, operand, valueType } = node;
  if (op === TOKEN.cvr) {
    return _nodeToExpr(operand, argNames, cseMap);
  }
  const x = _nodeToExpr(operand, argNames, cseMap);
  if (x === null) {
    return null;
  }
  switch (op) {
    case TOKEN.abs:
      return { expr: `Math.abs(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.neg:
      return { expr: `-${_wrapLeft(x, PREC.UNARY)}`, prec: PREC.UNARY };
    case TOKEN.ceiling:
      return { expr: `Math.ceil(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.floor:
      return { expr: `Math.floor(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.round:
      return {
        expr: `Math.floor(${_wrapLeft(x, PREC.ADD)} + 0.5)`,
        prec: PREC.ATOM,
      };
    case TOKEN.truncate:
      return { expr: `Math.trunc(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.sqrt:
      return { expr: `Math.sqrt(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.sin:
      return {
        expr: `Math.sin(${_wrapLeft(x, PREC.MUL)} % 360 * (Math.PI / 180))`,
        prec: PREC.ATOM,
      };
    case TOKEN.cos:
      return {
        expr: `Math.cos(${_wrapLeft(x, PREC.MUL)} % 360 * (Math.PI / 180))`,
        prec: PREC.ATOM,
      };
    case TOKEN.ln:
      return { expr: `Math.log(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.log:
      return { expr: `Math.log10(${x.expr})`, prec: PREC.ATOM };
    case TOKEN.cvi:
      return { expr: `(Math.trunc(${x.expr}) | 0)`, prec: PREC.ATOM };
    case TOKEN.not:
      if (valueType === PS_VALUE_TYPE.boolean) {
        return {
          expr: `(${_wrapLeft(x, PREC.EQ)} === 0 ? 1 : 0)`,
          prec: PREC.ATOM,
        };
      }
      if (valueType === PS_VALUE_TYPE.numeric) {
        return {
          expr: `~(${_wrapLeft(x, PREC.BOR)} | 0)`,
          prec: PREC.UNARY,
        };
      }
      return null;
    default:
      return null;
  }
}

function _binaryToExpr(node, argNames, cseMap) {
  const { op, first, second } = node;
  if (op === TOKEN.bitshift) {
    if (first.type !== PS_NODE.const || !Number.isInteger(first.value)) {
      return null;
    }
    const s = _nodeToExpr(second, argNames, cseMap);
    if (s === null) {
      return null;
    }
    const amt = first.value;
    const base = `(${_wrapLeft(s, PREC.BOR)} | 0)`;
    if (amt > 0) {
      return { expr: `${base} << ${amt}`, prec: PREC.SHIFT };
    }
    return amt < 0
      ? { expr: `${base} >> ${-amt}`, prec: PREC.SHIFT }
      : { expr: base, prec: PREC.ATOM };
  }
  // second is left operand (below on stack), first is right (top).
  const a = _nodeToExpr(second, argNames, cseMap);
  const b = _nodeToExpr(first, argNames, cseMap);
  if (a === null || b === null) {
    return null;
  }
  switch (op) {
    case TOKEN.add:
      return {
        expr: `${_wrapLeft(a, PREC.ADD)} + ${_wrapLeft(b, PREC.ADD)}`,
        prec: PREC.ADD,
      };
    case TOKEN.sub:
      return {
        expr: `${_wrapLeft(a, PREC.ADD)} - ${_wrapRight(b, PREC.ADD)}`,
        prec: PREC.ADD,
      };
    case TOKEN.mul:
      return {
        expr: `${_wrapLeft(a, PREC.MUL)} * ${_wrapLeft(b, PREC.MUL)}`,
        prec: PREC.MUL,
      };
    case TOKEN.div:
      return {
        expr:
          `(${b.expr} !== 0 ? ` +
          `${_wrapLeft(a, PREC.MUL)} / ${_wrapRight(b, PREC.MUL)} : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.idiv:
      return {
        expr:
          `(${b.expr} !== 0 ? ` +
          `Math.trunc(${_wrapLeft(a, PREC.MUL)} / ${_wrapRight(b, PREC.MUL)}) : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.mod:
      return {
        expr:
          `(${b.expr} !== 0 ? ` +
          `${_wrapLeft(a, PREC.MUL)} % ${_wrapRight(b, PREC.MUL)} : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.exp:
      return {
        expr: `${_wrapRight(a, PREC.POW)} ** ${_wrapLeft(b, PREC.POW)}`,
        prec: PREC.POW,
      };
    case TOKEN.eq:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} === ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.ne:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} !== ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.gt:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} > ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.ge:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} >= ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.lt:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} < ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.le:
      return {
        expr: `(${_wrapLeft(a, PREC.CMP)} <= ${_wrapLeft(b, PREC.CMP)} ? 1 : 0)`,
        prec: PREC.ATOM,
      };
    case TOKEN.and:
      return {
        expr: `(${_wrapLeft(a, PREC.BOR)} | 0) & (${_wrapLeft(b, PREC.BOR)} | 0)`,
        prec: PREC.BAND,
      };
    case TOKEN.or:
      return {
        expr: `(${_wrapLeft(a, PREC.BOR)} | 0) | (${_wrapLeft(b, PREC.BOR)} | 0)`,
        prec: PREC.BOR,
      };
    case TOKEN.xor:
      return {
        expr: `(${_wrapLeft(a, PREC.BOR)} | 0) ^ (${_wrapLeft(b, PREC.BOR)} | 0)`,
        prec: PREC.BXOR,
      };
    case TOKEN.atan:
      // atan2 result in degrees [0, 360).
      return {
        expr: `(Math.atan2(${a.expr}, ${b.expr}) * (180 / Math.PI) + 360) % 360`,
        prec: PREC.MUL,
      };
    case TOKEN.min:
      return { expr: `Math.min(${a.expr}, ${b.expr})`, prec: PREC.ATOM };
    case TOKEN.max:
      return { expr: `Math.max(${a.expr}, ${b.expr})`, prec: PREC.ATOM };
    default:
      return null;
  }
}

function _ternaryToExpr(node, argNames, cseMap) {
  const cond = _nodeToExpr(node.cond, argNames, cseMap);
  const then = _nodeToExpr(node.then, argNames, cseMap);
  const otherwise = _nodeToExpr(node.otherwise, argNames, cseMap);
  if (cond === null || then === null || otherwise === null) {
    return null;
  }
  return {
    expr:
      `(${_wrapLeft(cond, PREC.EQ)} !== 0 ? ` +
      `${_wrapLeft(then, PREC.TERNARY)} : ${_wrapLeft(otherwise, PREC.TERNARY)})`,
    prec: PREC.ATOM,
  };
}

const InternalViewerUtils = {
  tokenizeStream(stream, xref) {
    const tokens = [];
    const parser = new Parser({
      lexer: new Lexer(stream),
      xref,
      allowStreams: false,
    });
    while (true) {
      let obj;
      try {
        obj = parser.getObj();
      } catch {
        break;
      }
      if (obj === EOF) {
        break;
      }
      const token = this.tokenToJSObject(obj);
      if (token !== null) {
        tokens.push(token);
      }
    }
    return tokens;
  },

  getContentTokens(contentsVal, xref) {
    // Contents may be a Ref to a stream, a direct array of Refs, or a Ref to
    // an array of Refs.  Resolve one level to detect the array case.
    const resolvedVal = xref.fetchIfRef(contentsVal);
    const refs = Array.isArray(resolvedVal) ? resolvedVal : [contentsVal];
    const rawContents = [];
    const tokens = [];
    const rawBytesArr = [];
    for (const rawRef of refs) {
      if (rawRef instanceof Ref) {
        rawContents.push({ num: rawRef.num, gen: rawRef.gen });
      }
      const stream = xref.fetchIfRef(rawRef);
      if (!(stream instanceof BaseStream)) {
        continue;
      }
      rawBytesArr.push(stream.getString());
      stream.reset();
      for (const token of this.tokenizeStream(stream, xref)) {
        tokens.push(token);
      }
    }
    const rawBytes = rawBytesArr.join("\n");
    const { instructions, cmdNames } = this.groupIntoInstructions(tokens);
    return {
      contentStream: true,
      instructions,
      cmdNames,
      rawContents,
      rawBytes,
    };
  },

  // Lazily-built reverse map: OPS numeric id → property name string.
  get opsIdToName() {
    const opsIdToName = Object.create(null);
    for (const [name, id] of Object.entries(OPS)) {
      opsIdToName[id] = name;
    }
    return shadow(this, "opsIdToName", opsIdToName);
  },

  groupIntoInstructions(tokens) {
    const { opMap } = EvaluatorPreprocessor;
    const instructions = [];
    const cmdNames = Object.create(null);
    const argBuffer = [];
    for (const token of tokens) {
      if (token.type !== "cmd") {
        argBuffer.push(token);
        continue;
      }
      const op = opMap[token.value];
      if (op && !(token.value in cmdNames)) {
        cmdNames[token.value] = this.opsIdToName[op.id];
      }
      let args;
      if (!op || op.variableArgs) {
        // Unknown command or variable args: consume all pending args.
        args = argBuffer.splice(0);
      } else {
        // Fixed args: consume exactly numArgs, orphan the rest.
        const orphanCount = Math.max(0, argBuffer.length - op.numArgs);
        for (let i = 0; i < orphanCount; i++) {
          instructions.push({ cmd: null, args: [argBuffer.shift()] });
        }
        args = argBuffer.splice(0);
      }
      instructions.push({ cmd: token.value, args });
    }
    for (const t of argBuffer) {
      instructions.push({ cmd: null, args: [t] });
    }
    return { instructions, cmdNames };
  },

  // Tokenize a PS Type 4 source into display lines: each line groups args with
  // the operator that consumes them; braces get their own indented lines.
  tokenizePSSource(source) {
    const lexer = new PsLexer(source);
    const lines = [];
    let indent = 0;
    let buffer = [];

    const flush = () => {
      if (buffer.length > 0) {
        lines.push({ indent, tokens: buffer });
        buffer = [];
      }
    };

    while (true) {
      const tok = lexer.next();
      if (tok.id === TOKEN.eof) {
        break;
      }
      if (tok.id === TOKEN.lbrace) {
        flush();
        lines.push({ indent, tokens: [{ type: "brace", value: "{" }] });
        indent++;
      } else if (tok.id === TOKEN.rbrace) {
        flush();
        indent = Math.max(0, indent - 1);
        lines.push({ indent, tokens: [{ type: "brace", value: "}" }] });
      } else if (tok.id === TOKEN.number) {
        buffer.push({ type: "number", value: tok.value });
      } else if (tok.id === TOKEN.true) {
        buffer.push({ type: "boolean", value: true });
      } else if (tok.id === TOKEN.false) {
        buffer.push({ type: "boolean", value: false });
      } else if (tok.value !== null) {
        buffer.push({ type: "cmd", value: tok.value });
        flush();
      }
    }
    flush();
    return lines;
  },

  postScriptToJSCode(source, domain, range) {
    const program = parsePostScriptFunction(source);
    const nIn = domain.length >> 1;
    const nOut = range.length >> 1;
    const outputs = new PSStackToTree().evaluate(program, nIn);
    if (!outputs || outputs.length < nOut) {
      return null;
    }

    // Named input variables: single input → "x", multiple → "x0", "x1", …
    const argNames =
      nIn === 1 ? ["x"] : Array.from({ length: nIn }, (_, i) => `x${i}`);

    // Build cseMap in topological order using shared marks from the AST.
    const cseMap = new Map();
    const tmpDecls = [];
    let tmpIdx = 0;
    const visited = new Set();
    const ensureShared = node => {
      if (
        !node ||
        node.type === PS_NODE.arg ||
        node.type === PS_NODE.const ||
        visited.has(node)
      ) {
        return;
      }
      visited.add(node);
      switch (node.type) {
        case PS_NODE.unary:
          ensureShared(node.operand);
          break;
        case PS_NODE.binary:
          ensureShared(node.first);
          ensureShared(node.second);
          break;
        case PS_NODE.ternary:
          ensureShared(node.cond);
          ensureShared(node.then);
          ensureShared(node.otherwise);
          break;
      }
      if (node.shared) {
        const result = _nodeToExpr(node, argNames, cseMap);
        if (result !== null) {
          const name = `t${tmpIdx++}`;
          cseMap.set(node, name);
          tmpDecls.push(`  const ${name} = ${result.expr};`);
        }
      }
    };
    for (let i = 0; i < nOut; i++) {
      ensureShared(outputs[i]);
    }

    const decls = argNames.map(
      (name, i) => `  const ${name} = src[srcOffset + ${i}];`
    );

    const assignments = [];
    for (let i = 0; i < nOut; i++) {
      const result = _nodeToExpr(outputs[i], argNames, cseMap);
      if (result === null) {
        return null;
      }
      const min = range[i * 2];
      const max = range[i * 2 + 1];
      assignments.push(
        `  dest[destOffset + ${i}] = ` +
          `Math.max(Math.min(${result.expr}, ${max}), ${min});`
      );
    }

    const lines = [...decls, ""];
    if (tmpDecls.length > 0) {
      lines.push(...tmpDecls, "");
    }
    lines.push(...assignments);
    return `(src, srcOffset, dest, destOffset) => {\n${lines.join("\n")}\n}`;
  },

  tokenToJSObject(obj) {
    if (obj instanceof Cmd) {
      return { type: "cmd", value: obj.cmd };
    }
    if (obj instanceof Name) {
      return { type: "name", value: obj.name };
    }
    if (obj instanceof Ref) {
      return { type: "ref", num: obj.num, gen: obj.gen };
    }
    if (Array.isArray(obj)) {
      return { type: "array", value: obj.map(this.tokenToJSObject) };
    }
    if (obj instanceof Dict) {
      const result = Object.create(null);
      for (const [key, val] of obj.getRawEntries()) {
        result[key] = this.tokenToJSObject(val);
      }
      return { type: "dict", value: result };
    }
    if (typeof obj === "number") {
      return { type: "number", value: obj };
    }
    if (typeof obj === "string") {
      return { type: "string", value: obj };
    }
    if (typeof obj === "boolean") {
      return { type: "boolean", value: obj };
    }
    return obj === null ? { type: "null" } : null;
  },
};

export { InternalViewerUtils };
