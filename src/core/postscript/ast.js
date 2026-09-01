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

import { FormatError, warn } from "../../shared/util.js";
import { Lexer, TOKEN } from "./lexer.js";

// Value types for tree nodes — used to select the correct code-generation
// path for type-sensitive operators (currently `not`).
const PS_VALUE_TYPE = {
  numeric: 0, // known to be a number (f64 in Wasm)
  boolean: 1, // known to be a boolean (0.0 = false, 1.0 = true in f64)
  unknown: 2, // indeterminate at compile time
};

// AST node type constants

const PS_NODE = {
  // Parser AST node types (produced by Parser / parsePostScriptFunction)
  program: 0,
  block: 1,
  number: 2,
  operator: 3,
  if: 4,
  ifelse: 5,
  // Tree AST node types (produced by PSStackToTree)
  arg: 6,
  const: 7,
  unary: 8,
  binary: 9,
  ternary: 10,
};

// AST node classes

class PsNode {
  constructor(type) {
    this.type = type;
  }
}

/**
 * The root node.  Wraps the outermost `{ … }` of a Type 4 function body.
 */
class PsProgram extends PsNode {
  constructor(body) {
    super(PS_NODE.program);
    /** @type {PsBlock} */
    this.body = body;
  }
}

class PsBlock extends PsNode {
  constructor(instructions) {
    super(PS_NODE.block);
    /** @type {Array<PsNumber|PsOperator|PsIf|PsIfElse>} */
    this.instructions = instructions;
  }
}

class PsNumber extends PsNode {
  /** @param {number} value */
  constructor(value) {
    super(PS_NODE.number);
    this.value = value;
  }
}

/** A regular PS operator (not `if` / `ifelse`). */
class PsOperator extends PsNode {
  /** @param {number} op — one of the TOKEN.* constants from lexer.js */
  constructor(op) {
    super(PS_NODE.operator);
    this.op = op;
  }
}

/**
 * `<cond> { thenBlock } if`
 *
 * The condition value is consumed from the operand stack at runtime.
 */
class PsIf extends PsNode {
  /** @param {PsBlock} then */
  constructor(then) {
    super(PS_NODE.if);
    this.then = then;
  }
}

/**
 * `<cond> { thenBlock } { elseBlock } ifelse`
 *
 * The condition value is consumed from the operand stack at runtime.
 */
class PsIfElse extends PsNode {
  /**
   * @param {PsBlock} then
   * @param {PsBlock} otherwise
   */
  constructor(then, otherwise) {
    super(PS_NODE.ifelse);
    this.then = then;
    this.otherwise = otherwise;
  }
}

// Tree AST node classes  (produced by PSStackToTree)

/**
 * A function input argument.  `index` is the zero-based position in the
 * domain — in0 has index 0, in1 has index 1, etc.
 */
class PsArgNode extends PsNode {
  /** @param {number} index */
  constructor(index) {
    super(PS_NODE.arg);
    this.index = index;
    this.valueType = PS_VALUE_TYPE.numeric;
  }
}

/**
 * A folded constant — a numeric or boolean literal that is known at
 * compile time.
 */
class PsConstNode extends PsNode {
  /** @param {number|boolean} value */
  constructor(value) {
    super(PS_NODE.const);
    this.value = value;
    this.valueType =
      typeof value === "boolean"
        ? PS_VALUE_TYPE.boolean
        : PS_VALUE_TYPE.numeric;
  }
}

/**
 * A unary operation.
 */
class PsUnaryNode extends PsNode {
  /**
   * @param {number} op — TOKEN.* constant
   * @param {PsNode} operand
   * @param {number} [valueType]
   */
  constructor(op, operand, valueType = PS_VALUE_TYPE.unknown) {
    super(PS_NODE.unary);
    this.op = op;
    this.operand = operand;
    this.valueType = valueType;
  }
}

/**
 * A binary operation.
 *
 * `first` was the top-of-stack operand (popped first);
 * `second` was the operand just below it (popped second).
 *
 * For non-commutative operators the mathematical meaning is
 *   second OP first
 * e.g. `a b sub` → second = a, first = b → a − b.
 */
class PsBinaryNode extends PsNode {
  /**
   * @param {number} op — TOKEN.* constant
   * @param {PsNode} first — was on top of stack
   * @param {PsNode} second — was below top
   * @param {number} [valueType]
   */
  constructor(op, first, second, valueType = PS_VALUE_TYPE.unknown) {
    super(PS_NODE.binary);
    this.op = op;
    this.first = first;
    this.second = second;
    this.valueType = valueType;
  }
}

/**
 * A conditional expression: `cond ? then : otherwise`.
 *
 * Represents both PostScript `if` (where `otherwise` is the pre-existing
 * stack value that would remain unchanged when the condition is false) and
 * `ifelse` constructs, after the stack-to-tree conversion.
 */
class PsTernaryNode extends PsNode {
  /**
   * @param {PsNode} cond
   * @param {PsNode} then
   * @param {PsNode} otherwise
   * @param {number} [valueType]
   */
  constructor(cond, then, otherwise, valueType = PS_VALUE_TYPE.unknown) {
    super(PS_NODE.ternary);
    this.cond = cond;
    this.then = then;
    this.otherwise = otherwise;
    this.valueType = valueType;
  }
}

class Parser {
  constructor(lexer) {
    this.lexer = lexer;
    this._token = null;
  }

  static _isRegularOperator(id) {
    return id >= TOKEN.true && id < TOKEN.if;
  }

  // Fetch the next token from the lexer.
  _advance() {
    this._token = this.lexer.next();
  }

  // Assert that the current token has the given id, consume it, and return it.
  _expect(id) {
    if (this._token.id !== id) {
      throw new FormatError(
        `PostScript function: expected token id ${id}, got ${this._token.id}.`
      );
    }
    const tok = this._token;
    this._advance();
    return tok;
  }

  /**
   * Parse the full Type 4 function body.
   *
   * Grammar (simplified):
   *   program   ::= '{' block '}'
   *   block     ::= instruction*
   *   instruction ::= number
   *                 | operator          (any PS_OPERATOR except if / ifelse)
   *                 | '{' block '}' 'if'
   *                 | '{' block '}' '{' block '}' 'ifelse'
   * @returns {PsProgram}
   */
  parse() {
    this._advance();
    this._expect(TOKEN.lbrace);
    const block = this._parseBlock();
    this._expect(TOKEN.rbrace);
    if (this._token.id !== TOKEN.eof) {
      warn("PostScript function: unexpected content after closing brace.");
    }
    return new PsProgram(block);
  }

  _parseBlock() {
    const instructions = [];

    while (true) {
      const tok = this._token;
      switch (tok.id) {
        case TOKEN.number:
          instructions.push(new PsNumber(tok.value));
          this._advance();
          break;

        case TOKEN.lbrace: {
          // Start of a sub-procedure: must be followed by 'if' or '{ } ifelse'.
          this._advance();
          const thenBlock = this._parseBlock();
          this._expect(TOKEN.rbrace);

          if (this._token.id === TOKEN.if) {
            this._advance();
            instructions.push(new PsIf(thenBlock));
          } else if (this._token.id === TOKEN.lbrace) {
            this._advance();
            const elseBlock = this._parseBlock();
            this._expect(TOKEN.rbrace);
            this._expect(TOKEN.ifelse);
            instructions.push(new PsIfElse(thenBlock, elseBlock));
          } else {
            throw new FormatError(
              "PostScript function: a procedure block must be followed by 'if' or '{…} ifelse'."
            );
          }
          break;
        }

        case TOKEN.rbrace:
        case TOKEN.eof:
          // End of this block; let the caller consume the '}'.
          return new PsBlock(instructions);

        case TOKEN.if:
        case TOKEN.ifelse:
          // 'if'/'ifelse' without a preceding block.
          throw new FormatError(
            `PostScript function: unexpected '${tok.value}' operator.`
          );

        default:
          if (Parser._isRegularOperator(tok.id)) {
            instructions.push(new PsOperator(tok.id));
            this._advance();
            break;
          }
          throw new FormatError(
            `PostScript function: unexpected token id ${tok.id}.`
          );
      }
    }
  }
}

/**
 * Convenience function: tokenize and parse a PostScript Type 4 function body
 * given as a plain string (already decoded from the PDF stream).
 * @param {string} source
 * @returns {PsProgram}
 */
function parsePostScriptFunction(source) {
  return new Parser(new Lexer(source)).parse();
}

// Stack-to-tree transformation

/**
 * Structural equality for tree nodes.
 * Returns true when `a` and `b` represent the same sub-expression.
 * Reference equality (`a === b`) is checked first, so shared nodes
 * produced by `dup` are handled in O(1).
 */
function _nodesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a.type !== b.type) {
    return false;
  }
  switch (a.type) {
    case PS_NODE.arg:
      return a.index === b.index;
    case PS_NODE.const:
      return a.value === b.value;
    case PS_NODE.unary:
      return a.op === b.op && _nodesEqual(a.operand, b.operand);
    case PS_NODE.binary:
      return (
        a.op === b.op &&
        _nodesEqual(a.first, b.first) &&
        _nodesEqual(a.second, b.second)
      );
    case PS_NODE.ternary:
      return (
        _nodesEqual(a.cond, b.cond) &&
        _nodesEqual(a.then, b.then) &&
        _nodesEqual(a.otherwise, b.otherwise)
      );
    default:
      return false;
  }
}

/**
 * Evaluate a binary PostScript operator on two compile-time-known values.
 * `a` is the second operand (was below top); `b` is the first (was on top).
 * Returns `undefined` when the operation cannot be safely folded.
 */
function _evalBinaryConst(op, a, b) {
  switch (op) {
    case TOKEN.add:
      return a + b;
    case TOKEN.sub:
      return a - b;
    case TOKEN.mul:
      return a * b;
    case TOKEN.div:
      return b !== 0 ? a / b : 0; // div by zero → 0
    case TOKEN.idiv:
      return b !== 0 ? Math.trunc(a / b) : 0; // div by zero → 0
    case TOKEN.mod:
      return b !== 0 ? a - Math.trunc(a / b) * b : 0; // div by zero → 0
    case TOKEN.exp: {
      const r = a ** b;
      return Number.isFinite(r) ? r : undefined;
    }
    case TOKEN.atan: {
      // PostScript: dy dx atan → angle in degrees in [0, 360)
      let deg = Math.atan2(a, b) * (180 / Math.PI);
      if (deg < 0) {
        deg += 360;
      }
      return deg;
    }
    case TOKEN.eq:
      return a === b;
    case TOKEN.ne:
      return a !== b;
    case TOKEN.gt:
      return a > b;
    case TOKEN.ge:
      return a >= b;
    case TOKEN.lt:
      return a < b;
    case TOKEN.le:
      return a <= b;
    case TOKEN.and:
      return typeof a === "boolean" ? a && b : (a & b) | 0;
    case TOKEN.or:
      return typeof a === "boolean" ? a || b : a | b | 0;
    case TOKEN.xor:
      return typeof a === "boolean" ? a !== b : (a ^ b) | 0;
    case TOKEN.bitshift:
      return b >= 0 ? (a << b) | 0 : (a >> -b) | 0;
    case TOKEN.min:
      return Math.min(a, b);
    case TOKEN.max:
      return Math.max(a, b);
    default:
      return undefined;
  }
}

/**
 * Evaluate a unary PostScript operator on a compile-time-known value.
 * Returns `undefined` when the operation cannot be safely folded.
 */
function _evalUnaryConst(op, v) {
  switch (op) {
    case TOKEN.abs:
      return Math.abs(v);
    case TOKEN.neg:
      return -v;
    case TOKEN.ceiling:
      return Math.ceil(v);
    case TOKEN.floor:
      return Math.floor(v);
    case TOKEN.round:
      return Math.round(v);
    case TOKEN.truncate:
      return Math.trunc(v);
    case TOKEN.sqrt: {
      const r = Math.sqrt(v);
      return Number.isFinite(r) ? r : undefined;
    }
    case TOKEN.sin:
      return Math.sin(((v % 360) * Math.PI) / 180);
    case TOKEN.cos:
      return Math.cos(((v % 360) * Math.PI) / 180);
    case TOKEN.ln: {
      const r = Math.log(v);
      return Number.isFinite(r) ? r : undefined;
    }
    case TOKEN.log: {
      const r = Math.log10(v);
      return Number.isFinite(r) ? r : undefined;
    }
    case TOKEN.cvi:
      return Math.trunc(v);
    case TOKEN.cvr:
      return v;
    case TOKEN.not:
      return typeof v === "boolean" ? !v : ~v;
    default:
      return undefined;
  }
}

// Maximum number of nodes allowed on the virtual stack at any point during
// the stack-to-tree conversion.  Programs that exceed this are rejected.
const MAX_STACK_SIZE = 100;

// Determine the PS_VALUE_TYPE of a unary operation's result.
// `not` propagates its operand's type (boolean not → boolean, integer not →
// numeric); every other unary op always yields a numeric result.
function _unaryValueType(op, operandType) {
  return op === TOKEN.not ? operandType : PS_VALUE_TYPE.numeric;
}

// Determine the PS_VALUE_TYPE of a binary operation's result.
function _binaryValueType(op, firstType, secondType) {
  switch (op) {
    // Comparison operators always produce a boolean.
    case TOKEN.eq:
    case TOKEN.ne:
    case TOKEN.gt:
    case TOKEN.ge:
    case TOKEN.lt:
    case TOKEN.le:
      return PS_VALUE_TYPE.boolean;
    // and / or / xor preserve the type when both operands are the same known
    // type (both boolean or both numeric); otherwise the type is unknown.
    case TOKEN.and:
    case TOKEN.or:
    case TOKEN.xor:
      return firstType === secondType && firstType !== PS_VALUE_TYPE.unknown
        ? firstType
        : PS_VALUE_TYPE.unknown;
    // All arithmetic / bitshift operators produce a numeric result.
    default:
      return PS_VALUE_TYPE.numeric;
  }
}

/**
 * Converts a stack-based PostScript parser AST (PsProgram) into a stack-free
 * expression tree.
 *
 * The virtual operand stack is initialized with one PsArgNode per function
 * input; each instruction then manipulates the stack just as it would at
 * runtime, but instead of numbers the stack holds tree nodes.
 *
 * Algebraic optimizations are applied eagerly as each node is constructed:
 * constant folding, identity/absorbing elements, and double-negation
 * elimination.
 *
 * When the program finishes the remaining stack entries are the output
 * expressions — one per function output channel.
 *
 * Usage:
 *   const outputs = new PSStackToTree().evaluate(program, numInputs);
 */
class PSStackToTree {
  static #binaryOps = null;

  static #unaryOps = null;

  static #idempotentUnary = null;

  static #negatedComparison = null;

  static #init() {
    // Binary operator ids — used by _evalOp.
    this.#binaryOps = new Set([
      TOKEN.add,
      TOKEN.sub,
      TOKEN.mul,
      TOKEN.div,
      TOKEN.idiv,
      TOKEN.mod,
      TOKEN.exp,
      TOKEN.atan,
      TOKEN.eq,
      TOKEN.ne,
      TOKEN.gt,
      TOKEN.ge,
      TOKEN.lt,
      TOKEN.le,
      TOKEN.and,
      TOKEN.or,
      TOKEN.xor,
      TOKEN.bitshift,
    ]);
    // Unary operator ids.
    this.#unaryOps = new Set([
      TOKEN.abs,
      TOKEN.neg,
      TOKEN.ceiling,
      TOKEN.floor,
      TOKEN.round,
      TOKEN.truncate,
      TOKEN.sqrt,
      TOKEN.sin,
      TOKEN.cos,
      TOKEN.ln,
      TOKEN.log,
      TOKEN.cvi,
      TOKEN.cvr,
      TOKEN.not,
    ]);
    // Unary operators where f(f(x)) = f(x) — applying them twice is the same
    // as applying them once.
    this.#idempotentUnary = new Set([
      TOKEN.abs,
      TOKEN.ceiling,
      TOKEN.cvi,
      TOKEN.cvr,
      TOKEN.floor,
      TOKEN.round,
      TOKEN.truncate,
    ]);
    // Maps each comparison operator to its logical negation.
    // Used to simplify not(comparison) → negated-comparison.
    this.#negatedComparison = new Map([
      [TOKEN.eq, TOKEN.ne],
      [TOKEN.ne, TOKEN.eq],
      [TOKEN.lt, TOKEN.ge],
      [TOKEN.le, TOKEN.gt],
      [TOKEN.gt, TOKEN.le],
      [TOKEN.ge, TOKEN.lt],
    ]);
  }

  /**
   * @param {PsProgram} program
   * @param {number} numInputs — number of domain values placed on the stack
   *   before the program runs (i.e. the length of the domain array / 2).
   * @returns {Array<PsNode>} — one tree node per output value.
   */
  evaluate(program, numInputs) {
    if (!PSStackToTree.#binaryOps) {
      PSStackToTree.#init();
    }
    this._failed = false;
    if (numInputs > MAX_STACK_SIZE) {
      return null;
    }
    const stack = [];
    for (let i = 0; i < numInputs; i++) {
      stack.push(new PsArgNode(i));
    }
    this._evalBlock(program.body, stack);
    if (this._failed) {
      return null;
    }
    PSStackToTree.#markShared(stack);
    return stack;
  }

  // Set node.shared / sharedCount on non-atomic nodes referenced more than
  // once.  arg/const are excluded — they are cheap to re-emit inline.
  static #markShared(outputs) {
    const refCount = new Map();
    const visit = node => {
      if (!node || node.type === PS_NODE.arg || node.type === PS_NODE.const) {
        return;
      }
      const prev = refCount.get(node) ?? 0;
      refCount.set(node, prev + 1);
      if (prev > 0) {
        return;
      }
      switch (node.type) {
        case PS_NODE.unary:
          visit(node.operand);
          break;
        case PS_NODE.binary:
          visit(node.first);
          visit(node.second);
          break;
        case PS_NODE.ternary:
          visit(node.cond);
          visit(node.then);
          visit(node.otherwise);
          break;
      }
    };
    for (const output of outputs) {
      visit(output);
    }
    for (const [node, count] of refCount) {
      if (count > 1) {
        node.shared = true;
        node.sharedCount = count;
      }
    }
  }

  _evalBlock(block, stack) {
    this._evalBlockFrom(block.instructions, 0, stack);
  }

  /**
   * Core evaluation loop.  Processes `instructions[startIdx…]` in order,
   * mutating `stack` as each instruction executes.
   *
   * When a `{ body } if` instruction grows the stack (the PostScript "early
   * exit / guard" idiom), the remaining instructions in the current array are
   * evaluated on **both** the true-branch stack and the false-branch stack,
   * then the two results are merged into PsTernaryNodes.  This handles
   * patterns like:
   *
   *   cond { pop R G B sentinel } if
   *   … more guards …
   *   sentinel 0 gt { defaultR defaultG defaultB } if
   */
  _evalBlockFrom(instructions, startIdx, stack) {
    for (let idx = startIdx; idx < instructions.length; idx++) {
      if (this._failed) {
        break;
      }
      const instr = instructions[idx];
      switch (instr.type) {
        case PS_NODE.number:
          stack.push(new PsConstNode(instr.value));
          if (stack.length > MAX_STACK_SIZE) {
            this._failed = true;
          }
          break;

        case PS_NODE.operator:
          this._evalOp(instr.op, stack);
          break;

        case PS_NODE.if: {
          // Pop condition, snapshot the stack, run the then-block on a copy,
          // then merge.
          if (stack.length < 1) {
            this._failed = true;
            break;
          }
          const cond = stack.pop();
          const saved = stack.slice();
          this._evalBlock(instr.then, stack);
          if (this._failed) {
            break;
          }
          if (stack.length === saved.length) {
            // Normal case: depth preserved — positions that changed become
            // PsTernaryNode(cond, thenValue, originalValue).
            for (let i = 0; i < stack.length; i++) {
              if (stack[i] !== saved[i]) {
                stack[i] = this._makeTernary(cond, stack[i], saved[i]);
              }
            }
          } else if (stack.length > saved.length) {
            // "Guard / early-exit" pattern: the if-body pushed extra values.
            if (cond.type === PS_NODE.const) {
              // Condition is a compile-time constant: short-circuit without
              // forking.  For a false condition restore the saved stack; for a
              // true condition keep the body result already on `stack`.
              if (!cond.value) {
                stack.length = 0;
                stack.push(...saved);
              }
              break;
            }
            // Non-constant condition: evaluate the *rest* of this block on
            // both the true-branch stack and the false-branch stack, then
            // merge the two results into PsTernaryNodes.
            const trueStack = stack.slice();
            this._evalBlockFrom(instructions, idx + 1, trueStack);
            if (this._failed) {
              break;
            }
            const falseStack = saved;
            this._evalBlockFrom(instructions, idx + 1, falseStack);
            if (this._failed) {
              break;
            }
            if (trueStack.length !== falseStack.length) {
              // The two paths produced different stack depths.  For
              // well-formed PostScript functions this happens when the
              // remaining code still has a "default value" guard that fires
              // unconditionally for one path but not the other.  Pad the
              // shorter result with PsConstNode(0) so both have the same
              // length; the padding zeros end up in ternary branches that
              // are never selected at runtime.
              const zero = new PsConstNode(0);
              while (trueStack.length < falseStack.length) {
                trueStack.push(zero);
              }
              while (falseStack.length < trueStack.length) {
                falseStack.push(zero);
              }
            }
            stack.length = 0;
            for (let i = 0; i < trueStack.length; i++) {
              stack.push(this._makeTernary(cond, trueStack[i], falseStack[i]));
            }
            return; // Remaining instructions already consumed above.
          } else {
            // Stack-shrinking if — cannot represent as a tree.
            this._failed = true;
          }
          break;
        }

        case PS_NODE.ifelse: {
          // Pop condition; run each branch on an independent copy of the
          // current stack; zip the two resulting stacks into PsTernaryNodes
          // wherever the branches disagree.
          if (stack.length < 1) {
            this._failed = true;
            break;
          }
          const cond = stack.pop();
          const snapshot = stack.slice();

          const thenStack = snapshot.slice();
          this._evalBlock(instr.then, thenStack);
          if (this._failed) {
            break;
          }

          const elseStack = snapshot.slice();
          this._evalBlock(instr.otherwise, elseStack);
          if (this._failed) {
            break;
          }

          if (thenStack.length !== elseStack.length) {
            // Pad the shorter branch with zeros so both have the same depth.
            // For well-formed functions the extra zeros land in branches that
            // are never selected at runtime.
            const zero = new PsConstNode(0);
            while (thenStack.length < elseStack.length) {
              thenStack.push(zero);
            }
            while (elseStack.length < thenStack.length) {
              elseStack.push(zero);
            }
          }
          stack.length = 0;
          for (let i = 0; i < thenStack.length; i++) {
            stack.push(this._makeTernary(cond, thenStack[i], elseStack[i]));
          }
          break;
        }
      }
    }
  }

  _evalOp(op, stack) {
    if (PSStackToTree.#binaryOps.has(op)) {
      if (stack.length < 2) {
        this._failed = true;
        return;
      }
      const first = stack.pop();
      const second = stack.pop();
      stack.push(this._makeBinary(op, first, second));
      return;
    }

    if (PSStackToTree.#unaryOps.has(op)) {
      if (stack.length < 1) {
        this._failed = true;
        return;
      }
      stack.push(this._makeUnary(op, stack.pop()));
      return;
    }

    switch (op) {
      case TOKEN.true:
        stack.push(new PsConstNode(true));
        if (stack.length > MAX_STACK_SIZE) {
          this._failed = true;
        }
        break;

      case TOKEN.false:
        stack.push(new PsConstNode(false));
        if (stack.length > MAX_STACK_SIZE) {
          this._failed = true;
        }
        break;

      case TOKEN.dup:
        if (stack.length < 1) {
          this._failed = true;
          break;
        }
        stack.push(stack.at(-1));
        if (stack.length > MAX_STACK_SIZE) {
          this._failed = true;
        }
        break;

      case TOKEN.exch: {
        if (stack.length < 2) {
          this._failed = true;
          break;
        }
        const a = stack.pop();
        const b = stack.pop();
        stack.push(a, b);
        break;
      }

      case TOKEN.pop:
        if (stack.length < 1) {
          this._failed = true;
          break;
        }
        stack.pop();
        break;

      case TOKEN.copy: {
        if (stack.length < 1) {
          this._failed = true;
          break;
        }
        const nNode = stack.pop();
        if (nNode.type === PS_NODE.const) {
          const n = nNode.value | 0;
          if (n === 0) {
            // n === 0 is a no-op
          } else if (n < 0 || n > stack.length) {
            this._failed = true;
          } else {
            stack.push(...stack.slice(-n));
            if (stack.length > MAX_STACK_SIZE) {
              this._failed = true;
            }
          }
        } else {
          // Runtime n — cannot resolve at compile time.
          this._failed = true;
        }
        break;
      }

      case TOKEN.index: {
        if (stack.length < 1) {
          this._failed = true;
          break;
        }
        const nNode = stack.pop();
        if (nNode.type === PS_NODE.const) {
          const n = nNode.value | 0;
          if (n < 0 || n >= stack.length) {
            this._failed = true;
          } else {
            // 0 index = dup of top; n index = copy of nth element from top
            stack.push(stack.at(-n - 1));
          }
        } else {
          // Runtime n — cannot resolve at compile time.
          this._failed = true;
        }
        break;
      }

      case TOKEN.roll: {
        if (stack.length < 2) {
          this._failed = true;
          break;
        }
        const jNode = stack.pop();
        const nNode = stack.pop();
        if (nNode.type === PS_NODE.const && jNode.type === PS_NODE.const) {
          const n = nNode.value | 0;
          if (n === 0) {
            // n === 0 is a no-op
          } else if (n < 0 || n > stack.length) {
            this._failed = true;
          } else {
            // Normalize j into [0, n): positive j moves the top element(s) to
            // the bottom of the window.
            const j = (((jNode.value | 0) % n) + n) % n;
            if (j > 0) {
              const slice = stack.splice(-n, n);
              // slice[n-j…n-1] → new bottom; slice[0…n-j-1] → new top.
              stack.push(...slice.slice(n - j), ...slice.slice(0, n - j));
            }
          }
        } else {
          // Runtime n or j — cannot resolve at compile time.
          this._failed = true;
        }
        break;
      }

      default:
        this._failed = true;
        break;
    }
  }

  /**
   * Create a binary tree node, applying optimizations eagerly:
   *
   * 1. Constant folding — both operands are PsConstNode → fold to PsConstNode.
   * 2. Reflexive simplifications — x−x→0, x xor x→0, x eq x→true, etc.
   * 3. Algebraic simplifications with one known operand — identity elements
   *    (x+0→x, x*1→x, …), absorbing elements (x*0→0, x and false→false, …),
   *    and strength reductions (x*-1→neg(x), x^0.5→sqrt(x), x^2→x*x, …).
   *
   * Recall: `first` was on top of the stack (right operand for non-commutative
   * ops), `second` was below (left operand). So `a b sub` → second=a, first=b
   * → a − b.
   */
  _makeBinary(op, first, second) {
    // 1. Constant folding
    if (first.type === PS_NODE.const && second.type === PS_NODE.const) {
      const v = _evalBinaryConst(op, second.value, first.value);
      if (v !== undefined) {
        return new PsConstNode(v);
      }
    }

    // 2. Reflexive simplifications: both operands are the same expression.
    if (_nodesEqual(first, second)) {
      switch (op) {
        case TOKEN.sub:
          return new PsConstNode(0); // x − x → 0
        case TOKEN.xor:
          // Boolean operands: true xor true = false xor false = false.
          // Integer operands: n xor n = 0.
          return new PsConstNode(
            first.valueType === PS_VALUE_TYPE.boolean ? false : 0
          );
        // TOKEN.mod, TOKEN.div, TOKEN.idiv are NOT simplified here:
        // x op x is undefined when x = 0, so we cannot fold without knowing
        // that x is non-zero.
        case TOKEN.and:
        case TOKEN.or:
          return first; // x and x → x; x or x → x
        case TOKEN.min:
        case TOKEN.max:
          return first; // min(x,x) → x; max(x,x) → x
        case TOKEN.eq:
        case TOKEN.ge:
        case TOKEN.le:
          return new PsConstNode(true);
        case TOKEN.ne:
        case TOKEN.gt:
        case TOKEN.lt:
          return new PsConstNode(false);
      }
    }

    // 3. Algebraic simplifications — b = first.value, a = second.value.
    if (first.type === PS_NODE.const) {
      const b = first.value;
      switch (op) {
        case TOKEN.add:
          if (b === 0) {
            return second; // x + 0 → x
          }
          break;
        case TOKEN.sub:
          if (b === 0) {
            return second; // x − 0 → x
          }
          break;
        case TOKEN.mul:
          if (b === 1) {
            return second; // x * 1 → x
          }
          if (b === 0) {
            return first; // x * 0 → 0  (reuse the PsConstNode(0))
          }
          if (b === -1) {
            return this._makeUnary(TOKEN.neg, second); // x * -1 → neg(x)
          }
          break;
        case TOKEN.div:
          // x / c → x * (1/c): replace division by a constant with the
          // equivalent multiplication (1/1=1 is caught by the mul identity).
          if (b !== 0) {
            return this._makeBinary(TOKEN.mul, new PsConstNode(1 / b), second);
          }
          break;
        case TOKEN.idiv:
          if (b === 1) {
            return second; // x idiv 1 → x
          }
          break;
        case TOKEN.exp:
          if (b === 1) {
            return second; // x ^ 1 → x
          }
          if (b === -1) {
            return this._makeBinary(TOKEN.div, second, new PsConstNode(1));
          }
          if (b === 0.5) {
            return this._makeUnary(TOKEN.sqrt, second); // x ^ 0.5 → sqrt(x)
          }
          if (b === 0.25) {
            // x ^ 0.25 → sqrt(sqrt(x)): two native f64.sqrt calls instead
            // of the pow() import.
            const sqrtOnce = this._makeUnary(TOKEN.sqrt, second);
            return this._makeUnary(TOKEN.sqrt, sqrtOnce);
          }
          if (b === 2) {
            // x ^ 2 → x * x: avoids the pow() import call entirely.
            return this._makeBinary(TOKEN.mul, second, second);
          }
          if (b === 3) {
            // x ^ 3 → (x * x) * x: avoids the pow() import call entirely.
            return this._makeBinary(
              TOKEN.mul,
              this._makeBinary(TOKEN.mul, second, second),
              second
            );
          }
          if (b === 4) {
            // x ^ 4 → (x * x) * (x * x): avoids the pow() import call entirely.
            const square = this._makeBinary(TOKEN.mul, second, second);
            return this._makeBinary(TOKEN.mul, square, square);
          }
          if (b === 0) {
            return new PsConstNode(1); // x ^ 0 → 1
          }
          break;
        case TOKEN.and:
          if (b === true) {
            return second; // x and true → x
          }
          if (b === false) {
            return first; // x and false → false
          }
          break;
        case TOKEN.or:
          if (b === false) {
            return second; // x or false → x
          }
          if (b === true) {
            return first; // x or true → true
          }
          break;
        case TOKEN.min:
          // min(max(x, c2), c1) where c2 ≥ c1 → c1:
          // max(x, c2) ≥ c2 ≥ c1, so min with c1 always returns c1.
          if (
            second.type === PS_NODE.binary &&
            second.op === TOKEN.max &&
            second.first.type === PS_NODE.const &&
            second.first.value >= b
          ) {
            return first;
          }
          break;
        case TOKEN.max:
          // max(min(x, c1), c2) where c2 ≥ c1 → c2:
          // min(x, c1) ≤ c1 ≤ c2, so max with c2 always returns c2.
          if (
            second.type === PS_NODE.binary &&
            second.op === TOKEN.min &&
            second.first.type === PS_NODE.const &&
            second.first.value <= b
          ) {
            return first;
          }
          break;
      }
    }

    if (second.type === PS_NODE.const) {
      const a = second.value;
      switch (op) {
        case TOKEN.add:
          if (a === 0) {
            return first; // 0 + x → x
          }
          break;
        case TOKEN.sub:
          if (a === 0) {
            return this._makeUnary(TOKEN.neg, first); // 0 − x → neg(x)
          }
          break;
        case TOKEN.mul:
          if (a === 1) {
            return first; // 1 * x → x
          }
          if (a === 0) {
            return second; // 0 * x → 0  (reuse the PsConstNode(0))
          }
          if (a === -1) {
            return this._makeUnary(TOKEN.neg, first); // -1 * x → neg(x)
          }
          break;
        case TOKEN.and:
          if (a === true) {
            return first; // true and x → x
          }
          if (a === false) {
            return second; // false and x → false
          }
          break;
        case TOKEN.or:
          if (a === false) {
            return first; // false or x → x
          }
          if (a === true) {
            return second; // true or x → true
          }
          break;
      }
    }

    return new PsBinaryNode(
      op,
      first,
      second,
      _binaryValueType(op, first.valueType, second.valueType)
    );
  }

  /**
   * Create a unary tree node, applying optimizations eagerly:
   *
   * 1. Constant folding.
   * 2. not(comparison) → negated comparison: not(a eq b) → a ne b, etc.
   * 3. neg(a − b) → b − a.
   * 4. Double-negation: neg(neg(x)) → x, not(not(x)) → x.
   * 5. abs(neg(x)) → abs(x).
   * 6. Idempotent: f(f(x)) → f(x) for abs, ceiling, floor, round, etc.
   */
  _makeUnary(op, operand) {
    // 1. Constant folding
    if (operand.type === PS_NODE.const) {
      const v = _evalUnaryConst(op, operand.value);
      if (v !== undefined) {
        return new PsConstNode(v);
      }
    }

    // 2.
    if (op === TOKEN.not && operand.type === PS_NODE.binary) {
      const negated = PSStackToTree.#negatedComparison.get(operand.op);
      if (negated !== undefined) {
        return new PsBinaryNode(
          negated,
          operand.first,
          operand.second,
          PS_VALUE_TYPE.boolean
        );
      }
    }

    // 3. (_makeBinary may fold further if one operand is 0)
    if (
      op === TOKEN.neg &&
      operand.type === PS_NODE.binary &&
      operand.op === TOKEN.sub
    ) {
      return this._makeBinary(TOKEN.sub, operand.second, operand.first);
    }

    if (operand.type === PS_NODE.unary) {
      // 4. (not(not(x)) only reachable when x is not a comparison)
      if (
        (op === TOKEN.neg && operand.op === TOKEN.neg) ||
        (op === TOKEN.not && operand.op === TOKEN.not)
      ) {
        return operand.operand;
      }
      // 5.
      if (op === TOKEN.abs && operand.op === TOKEN.neg) {
        return this._makeUnary(TOKEN.abs, operand.operand);
      }
      // 6.
      if (PSStackToTree.#idempotentUnary.has(op) && op === operand.op) {
        return operand;
      }
    }

    return new PsUnaryNode(op, operand, _unaryValueType(op, operand.valueType));
  }

  /**
   * Create a ternary node, applying optimizations eagerly:
   *
   * 1. Constant condition — fold to the live branch.
   * 2. Identical branches — the condition is irrelevant, return either branch.
   * 3. Boolean branch constants — `cond ? true : false` → cond,
   *    `cond ? false : true` → not(cond).
   * 4. Ternary → branchless min/max when the condition compares two numeric
   *    expressions that are also the two branches.
   */
  _makeTernary(cond, then, otherwise) {
    // 1. Constant condition
    if (cond.type === PS_NODE.const) {
      return cond.value ? then : otherwise;
    }
    // 2. Both branches are the same expression
    if (_nodesEqual(then, otherwise)) {
      return then;
    }
    // 3. Boolean branch constants
    if (then.type === PS_NODE.const && otherwise.type === PS_NODE.const) {
      if (then.value === true && otherwise.value === false) {
        return cond; // cond ? true : false → cond
      }
      if (then.value === false && otherwise.value === true) {
        return this._makeUnary(TOKEN.not, cond); // cond ? false : true → !cond
      }
    }

    // 4. Ternary → branchless min/max folding.
    //
    // When the condition is a numeric comparison between two expressions A and
    // B, and the two branches are exactly those two expressions (in some
    // order), the ternary collapses to a single f64.min / f64.max instruction:
    //
    //   (A gt B) ? B : A  →  min(A, B)   (A ge B) ? B : A  →  min(A, B)
    //   (A lt B) ? B : A  →  max(A, B)   (A le B) ? B : A  →  max(A, B)
    //   (A gt B) ? A : B  →  max(A, B)   (A ge B) ? A : B  →  max(A, B)
    //   (A lt B) ? A : B  →  min(A, B)   (A le B) ? A : B  →  min(A, B)
    //
    // Here A = cond.second (left operand) and B = cond.first (right operand),
    // following the PS stack convention: `A B gt` → second=A, first=B.
    if (cond.type === PS_NODE.binary) {
      const { op: cop, first: cf, second: cs } = cond;
      if (cop === TOKEN.gt || cop === TOKEN.ge) {
        // cond: cs > cf
        if (_nodesEqual(then, cf) && _nodesEqual(otherwise, cs)) {
          return this._makeBinary(TOKEN.min, cf, cs); // cs>cf ? cf:cs → min
        }
        if (_nodesEqual(then, cs) && _nodesEqual(otherwise, cf)) {
          return this._makeBinary(TOKEN.max, cf, cs); // cs>cf ? cs:cf → max
        }
      } else if (cop === TOKEN.lt || cop === TOKEN.le) {
        // cond: cs < cf
        if (_nodesEqual(then, cf) && _nodesEqual(otherwise, cs)) {
          return this._makeBinary(TOKEN.max, cf, cs); // cs<cf ? cf:cs → max
        }
        if (_nodesEqual(then, cs) && _nodesEqual(otherwise, cf)) {
          return this._makeBinary(TOKEN.min, cf, cs); // cs<cf ? cs:cf → min
        }
      }
    }

    return new PsTernaryNode(
      cond,
      then,
      otherwise,
      then.valueType === otherwise.valueType
        ? then.valueType
        : PS_VALUE_TYPE.unknown
    );
  }
}

export {
  parsePostScriptFunction,
  Parser,
  PS_NODE,
  PS_VALUE_TYPE,
  PsArgNode,
  PsBinaryNode,
  PsBlock,
  PsConstNode,
  PsIf,
  PsIfElse,
  PsNode,
  PsNumber,
  PsOperator,
  PsProgram,
  PSStackToTree,
  PsTernaryNode,
  PsUnaryNode,
};
