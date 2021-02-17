/* Copyright 2021 Mozilla Foundation
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

import { Lexer, TOKEN } from "./formcalc_lexer.js";

const Errors = {
  assignment: "Invalid token in assignment.",
  block: "Invalid token in do ... end declaration.",
  elseif: "Invalid elseif declaration.",
  for: "Invalid token in for ... endfor declaration.",
  foreach: "Invalid token in foreach ... endfor declaration.",
  func: "Invalid token in func declaration.",
  if: "Invalid token if ... endif declaration.",
  index: "Invalid token in index.",
  params: "Invalid token in parameter list.",
  var: "Invalid token in var declaration.",
  while: "Invalid token while ... endwhile declaration.",
};

const BUILTINS = new Set([
  // Arithmetic.
  "abs",
  "avg",
  "ceil",
  "count",
  "floor",
  "max",
  "min",
  "mod",
  "round",
  "sum",
  // Date and time.
  "date",
  "date2num",
  "datefmt",
  "isodate2num",
  "isotime2num",
  "localdatefmt",
  "localtimefmt",
  "num2date",
  "num2gmtime",
  "num2time",
  "time",
  "time2num",
  "timefmt",
  // Financial.
  "apr",
  "cterm",
  "fv",
  "ipmt",
  "npv",
  "pmt",
  "ppmt",
  "pv",
  "rate",
  "term",
  // Logical.
  "choose",
  "exists",
  "hasvalue",
  "oneof",
  "within",
  // String.
  "at",
  "concat",
  "decode",
  "encode",
  "format",
  "left",
  "len",
  "lower",
  "ltrim",
  "parse",
  "replace",
  "right",
  "rtrim",
  "space",
  "str",
  "stuff",
  "substr",
  "uuid",
  "upper",
  "wordnum",
  // Url.
  "get",
  "post",
  "put",
  // Miscellaneous.
  "eval",
  "ref",
  "unitvalue",
  "unittype",
  // Undocumented.
  "acos",
  "asin",
  "atan",
  "cos",
  "deg2rad",
  "exp",
  "log",
  "pi",
  "pow",
  "rad2deg",
  "sin",
  "sqrt",
  "tan",
]);

const LTR = true;
const RTL = false;

const Operators = {
  dot: { id: 0, prec: 0, assoc: RTL, nargs: 0, repr: "." },
  dotDot: { id: 1, prec: 0, assoc: RTL, nargs: 0, repr: ".." },
  dotHash: { id: 2, prec: 0, assoc: RTL, nargs: 0, repr: ".#" },

  call: { id: 1, prec: 1, assoc: LTR, nargs: 0 },

  // Unary operators.
  minus: { id: 4, nargs: 1, prec: 2, assoc: RTL, repr: "-", op: x => -x },
  plus: { id: 5, nargs: 1, prec: 2, assoc: RTL, repr: "+", op: x => +x },
  not: {
    id: 6,
    nargs: 1,
    prec: 2,
    assoc: RTL,
    repr: "!",
    op: x => (!x ? 1 : 0),
  },

  mul: { id: 7, nargs: 2, prec: 3, assoc: LTR, repr: "*", op: (x, y) => x * y },
  div: { id: 8, nargs: 2, prec: 3, assoc: LTR, repr: "/", op: (x, y) => x / y },

  add: { id: 9, nargs: 2, prec: 4, assoc: LTR, repr: "+", op: (x, y) => x + y },
  sub: {
    id: 10,
    nargs: 2,
    prec: 4,
    assoc: LTR,
    repr: "-",
    op: (x, y) => x - y,
  },

  lt: {
    id: 11,
    nargs: 2,
    prec: 5,
    assoc: LTR,
    repr: "<",
    op: (x, y) => (x < y ? 1 : 0),
  },
  le: {
    id: 12,
    nargs: 2,
    prec: 5,
    assoc: LTR,
    repr: "<=",
    op: (x, y) => (x <= y ? 1 : 0),
  },
  gt: {
    id: 13,
    nargs: 2,
    prec: 5,
    assoc: LTR,
    repr: ">",
    op: (x, y) => (x > y ? 1 : 0),
  },
  ge: {
    id: 14,
    nargs: 2,
    prec: 5,
    assoc: LTR,
    repr: ">=",
    op: (x, y) => (x >= y ? 1 : 0),
  },

  eq: {
    id: 15,
    nargs: 2,
    prec: 6,
    assoc: LTR,
    repr: "===",
    op: (x, y) => (x === y ? 1 : 0),
  },
  ne: {
    id: 16,
    nargs: 2,
    prec: 6,
    assoc: LTR,
    repr: "!==",
    op: (x, y) => (x !== y ? 1 : 0),
  },

  and: {
    id: 17,
    nargs: 2,
    prec: 7,
    assoc: LTR,
    repr: "&&",
    op: (x, y) => (x && y ? 1 : 0),
  },

  or: {
    id: 18,
    nargs: 2,
    prec: 8,
    assoc: LTR,
    repr: "||",
    op: (x, y) => (x || y ? 1 : 0),
  },

  // Not real operators.
  paren: { id: 19, prec: 9, assoc: RTL, nargs: 0 },
  subscript: { id: 20, prec: 9, assoc: RTL, nargs: 0 },
};

const OPERATOR = true;
const OPERAND = false;

// How it works...
//
// There is two stacks: one for operands and one for operators.
// Each time an operand is met (number, identifier, ...),
// it's pushed on operands stack.
// Unary operators such as + or - are guessed according to the last pushed
// thing:
// for example, if an operand has been push then a '-' is a subtraction
// but if an operator has been push (e.g. '*') then a '-' is the negate
// operation ('... * - ...' can't be a subtraction).
// Each time an operator is met its precedence is compared with the one of the
// operator on top of operators stack:
//  - if top has precendence on operator then top is applied to the operands
//    on their stack;
//  - else just push the operator.
// For example: 1 + 2 * 3
//  round 1: operands: [1], operators: []
//  round 2: operands: [1], operators: [+]
//  round 3: operands: [1, 2], operators: [+]
//
//  + has not the precedence on *
//  round 4: operands: [1, 2], operators: [+, *]
//  round 5: operands: [1, 2, 3], operators: [+, *]
// no more token: apply operators on operands:
//  round 6: operands: [1, 6], operators: [+]
//  round 7: operands: [7], operators: []
// Parenthesis are treated like an operator with no precedence on the real ones.
// As a consequence, any operation is done before this fake one and when
// a right parenthesis is met then we can apply operators to operands
// until the opening parenthesis is met.
//
class SimpleExprParser {
  constructor(lexer) {
    this.lexer = lexer;
    this.operands = [];
    this.operators = [];
    this.last = OPERATOR;
  }

  reset() {
    this.operands.length = 0;
    this.operators.length = 0;
    this.last = OPERATOR;
  }

  parse(tok) {
    tok = tok || this.lexer.next();

    while (true) {
      // Token ids (see form_lexer.js) are consecutive in order
      // to have switch table with no holes.
      switch (tok.id) {
        case TOKEN.and:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.and);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.divide:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.div);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.dot:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.dot);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.dotDot:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.dotDot);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.dotHash:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.dotHash);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.dotStar:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.dot);
            this.pushOperand(new AstEveryOccurence());
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.eq:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.eq);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.ge:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.ge);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.gt:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.gt);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.le:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.le);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.leftBracket:
          if (this.last === OPERAND) {
            this.flushWithOperator(Operators.subscript);
            const operand = this.operands.pop();
            const index = SimpleExprParser.parseIndex(this.lexer);
            this.operands.push(new AstSubscript(operand, index));
            this.last = OPERAND;
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.leftParen:
          if (this.last === OPERAND) {
            const lastOperand = this.operands[this.operands.length - 1];
            if (!(lastOperand instanceof AstIdentifier)) {
              return [tok, this.getNode()];
            }
            lastOperand.toLowerCase();
            const name = lastOperand.id;

            this.flushWithOperator(Operators.call);
            const callee = this.operands.pop();
            const params = SimpleExprParser.parseParams(this.lexer);

            if (callee instanceof AstIdentifier && BUILTINS.has(name)) {
              this.operands.push(new AstBuiltinCall(name, params));
            } else {
              this.operands.push(new AstCall(callee, params));
            }

            this.last = OPERAND;
          } else {
            this.operators.push(Operators.paren);
            this.last = OPERATOR;
          }
          break;
        case TOKEN.lt:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.lt);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.minus:
          if (this.last === OPERATOR) {
            this.pushOperator(Operators.minus);
          } else {
            this.pushOperator(Operators.sub);
          }
          break;
        case TOKEN.ne:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.ne);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.not:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.not);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.null:
          if (this.last === OPERATOR) {
            this.pushOperand(new AstNull());
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.number:
          if (this.last === OPERATOR) {
            this.pushOperand(new AstNumber(tok.value));
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.or:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.or);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.plus:
          if (this.last === OPERATOR) {
            this.pushOperator(Operators.plus);
          } else {
            this.pushOperator(Operators.add);
          }
          break;
        case TOKEN.rightBracket:
          if (!this.flushUntil(Operators.subscript.id)) {
            return [tok, this.getNode()];
          }
          break;
        case TOKEN.rightParen:
          if (!this.flushUntil(Operators.paren.id)) {
            return [tok, this.getNode()];
          }
          break;
        case TOKEN.string:
          if (this.last === OPERATOR) {
            this.pushOperand(new AstString(tok.value));
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.this:
          if (this.last === OPERATOR) {
            this.pushOperand(new AstThis());
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.times:
          if (this.last === OPERAND) {
            this.pushOperator(Operators.mul);
            break;
          }
          return [tok, this.getNode()];
        case TOKEN.identifier:
          if (this.last === OPERATOR) {
            this.pushOperand(new AstIdentifier(tok.value));
            break;
          }
          return [tok, this.getNode()];
        default:
          return [tok, this.getNode()];
      }
      tok = this.lexer.next();
    }
  }

  static parseParams(lexer) {
    const parser = new SimpleExprParser(lexer);
    const params = [];
    while (true) {
      const [tok, param] = parser.parse();
      if (param) {
        params.push(param);
      }
      if (tok.id === TOKEN.rightParen) {
        return params;
      } else if (tok.id !== TOKEN.comma) {
        throw new Error(Errors.params);
      }
      parser.reset();
    }
  }

  static parseIndex(lexer) {
    let tok = lexer.next();
    if (tok.id === TOKEN.times) {
      tok = lexer.next();
      if (tok.id !== TOKEN.rightBracket) {
        throw new Error(Errors.index);
      }
      return new AstEveryOccurence();
    }
    const [token, expr] = new SimpleExprParser(lexer).parse(tok);
    if (token.id !== TOKEN.rightBracket) {
      throw new Error(Errors.index);
    }
    return expr;
  }

  pushOperator(op) {
    this.flushWithOperator(op);
    this.operators.push(op);
    this.last = OPERATOR;
  }

  pushOperand(op) {
    this.operands.push(op);
    this.last = OPERAND;
  }

  operate(op) {
    if (op.nargs === 1) {
      const arg = this.operands.pop();
      this.operands.push(AstUnaryOperator.getOperatorOrValue(op, arg));
    } else {
      const arg2 = this.operands.pop();
      const arg1 = this.operands.pop();
      this.operands.push(AstBinaryOperator.getOperatorOrValue(op, arg1, arg2));
    }
  }

  flushWithOperator(op) {
    while (true) {
      const top = this.operators[this.operators.length - 1];
      if (top) {
        if (top.id >= 0 && SimpleExprParser.checkPrecedence(top, op)) {
          this.operators.pop();
          this.operate(top);
          continue;
        }
      }
      return;
    }
  }

  flush() {
    while (true) {
      const op = this.operators.pop();
      if (!op) {
        return;
      }
      this.operate(op);
    }
  }

  flushUntil(id) {
    while (true) {
      const op = this.operators.pop();
      if (!op) {
        return false;
      }
      if (op.id === id) {
        return true;
      }
      this.operate(op);
    }
  }

  getNode() {
    this.flush();
    return this.operands.pop();
  }

  static checkPrecedence(left, right) {
    return (
      left.prec < right.prec || (left.prec === right.prec && left.assoc === LTR)
    );
  }
}

class Leaf {
  dump() {
    throw new Error("Not implemented method");
  }

  isSomPredicate() {
    return false;
  }

  isDotExpression() {
    return false;
  }

  isConstant() {
    return false;
  }

  toNumber() {
    return 0;
  }

  toComparable() {
    return null;
  }
}

class AstCall extends Leaf {
  constructor(callee, params) {
    super();
    this.callee = callee;
    this.params = params;
  }

  dump() {
    return {
      callee: this.callee.dump(),
      params: this.params.map(x => x.dump()),
    };
  }
}

class AstBuiltinCall extends Leaf {
  constructor(id, params) {
    super();
    this.id = id;
    this.params = params;
  }

  dump() {
    return {
      builtin: this.id,
      params: this.params.map(x => x.dump()),
    };
  }
}

class AstSubscript extends Leaf {
  constructor(operand, index) {
    super();
    this.operand = operand;
    this.index = index;
  }

  dump() {
    return {
      operand: this.operand.dump(),
      index: this.index.dump(),
    };
  }
}

class AstBinaryOperator extends Leaf {
  constructor(id, left, right, repr) {
    super();
    this.id = id;
    this.left = left;
    this.right = right;
    this.repr = repr;
  }

  dump() {
    return {
      operator: this.repr,
      left: this.left.dump(),
      right: this.right.dump(),
    };
  }

  isDotExpression() {
    return Operators.id.dot <= this.id && this.id <= Operators.id.dotHash;
  }

  isSomPredicate() {
    return (
      this.isDotExpression() ||
      (Operators.id.lt <= this.id &&
        this.id <= Operators.id.or &&
        ((this.left.isDotExpression() && this.right.isConstant()) ||
          (this.left.isConstant() && this.right.isDotExpression()) ||
          (this.left.isDotExpression() && this.right.isDotExpression())))
    );
  }

  static getOperatorOrValue(operator, left, right) {
    if (!left.isConstant() || !right.isConstant()) {
      return new AstBinaryOperator(operator.id, left, right, operator.repr);
    }

    if (
      Operators.lt.id <= operator.id &&
      operator.id <= Operators.ne.id &&
      !(left instanceof AstNumber) &&
      !(right instanceof AstNumber)
    ) {
      return new AstNumber(
        operator.op(left.toComparable(), right.toComparable())
      );
    }

    return new AstNumber(operator.op(left.toNumber(), right.toNumber()));
  }
}

class AstUnaryOperator extends Leaf {
  constructor(id, arg, repr) {
    super();
    this.id = id;
    this.arg = arg;
    this.repr = repr;
  }

  dump() {
    return {
      operator: this.repr,
      arg: this.arg.dump(),
    };
  }

  static getOperatorOrValue(operator, arg) {
    if (!arg.isConstant()) {
      return new AstUnaryOperator(operator.id, arg, operator.repr);
    }

    return new AstNumber(operator.op(arg.toNumber()));
  }
}

class AstNumber extends Leaf {
  constructor(number) {
    super();
    this.number = number;
  }

  dump() {
    return this.number;
  }

  isConstant() {
    return true;
  }

  toNumber() {
    return this.number;
  }
}

class AstString extends Leaf {
  constructor(str) {
    super();
    this.str = str;
  }

  dump() {
    return this.str;
  }

  isConstant() {
    return true;
  }

  toNumber() {
    return !isNaN(this.str) ? parseFloat(this.str) : 0;
  }

  toComparable() {
    return this.str;
  }
}

class AstThis extends Leaf {
  dump() {
    return { special: "this" };
  }
}

class AstIdentifier extends Leaf {
  constructor(id) {
    super();
    this.id = id;
  }

  dump() {
    return { id: this.id };
  }

  toLowerCase() {
    this.id = this.id.toLowerCase();
  }
}

class AstNull extends Leaf {
  dump() {
    return { special: null };
  }

  isConstant() {
    return true;
  }

  toComparable() {
    return null;
  }
}

class AstEveryOccurence {
  dump() {
    return { special: "*" };
  }
}

class VarDecl extends Leaf {
  constructor(id, expr) {
    super();
    this.id = id;
    this.expr = expr;
  }

  dump() {
    return {
      var: this.id,
      expr: this.expr.dump(),
    };
  }
}

class Assignment extends Leaf {
  constructor(id, expr) {
    super();
    this.id = id;
    this.expr = expr;
  }

  dump() {
    return {
      assignment: this.id,
      expr: this.expr.dump(),
    };
  }
}

class FuncDecl extends Leaf {
  constructor(id, params, body) {
    super();
    this.id = id;
    this.params = params;
    this.body = body;
  }

  dump() {
    return {
      func: this.id,
      params: this.params,
      body: this.body.dump(),
    };
  }
}

class IfDecl extends Leaf {
  constructor(condition, thenClause, elseIfClause, elseClause) {
    super();
    this.condition = condition;
    this.then = thenClause;
    this.elseif = elseIfClause;
    this.else = elseClause;
  }

  dump() {
    return {
      decl: "if",
      condition: this.condition.dump(),
      then: this.then.dump(),
      elseif: this.elseif ? this.elseif.map(x => x.dump()) : null,
      else: this.else ? this.else.dump() : null,
    };
  }
}

class ElseIfDecl extends Leaf {
  constructor(condition, thenClause) {
    super();
    this.condition = condition;
    this.then = thenClause;
  }

  dump() {
    return {
      decl: "elseif",
      condition: this.condition.dump(),
      then: this.then.dump(),
    };
  }
}

class WhileDecl extends Leaf {
  constructor(condition, whileClause) {
    super();
    this.condition = condition;
    this.body = whileClause;
  }

  dump() {
    return {
      decl: "while",
      condition: this.condition.dump(),
      body: this.body.dump(),
    };
  }
}

class ForDecl extends Leaf {
  constructor(assignment, upto, end, step, body) {
    super();
    this.assignment = assignment;
    this.upto = upto;
    this.end = end;
    this.step = step;
    this.body = body;
  }

  dump() {
    return {
      decl: "for",
      assignment: this.assignment.dump(),
      type: this.upto ? "upto" : "downto",
      end: this.end.dump(),
      step: this.step ? this.step.dump() : null,
      body: this.body.dump(),
    };
  }
}

class ForeachDecl extends Leaf {
  constructor(id, params, body) {
    super();
    this.id = id;
    this.params = params;
    this.body = body;
  }

  dump() {
    return {
      decl: "foreach",
      id: this.id,
      params: this.params.map(x => x.dump()),
      body: this.body.dump(),
    };
  }
}

class BlockDecl extends Leaf {
  constructor(body) {
    super();
    this.body = body;
  }

  dump() {
    return {
      decl: "block",
      body: this.body.dump(),
    };
  }
}

class ExprList extends Leaf {
  constructor(expressions) {
    super();
    this.expressions = expressions;
  }

  dump() {
    return this.expressions.map(x => x.dump());
  }
}

class BreakDecl extends Leaf {
  dump() {
    return { special: "break" };
  }
}

class ContinueDecl extends Leaf {
  dump() {
    return { special: "continue" };
  }
}

class Parser {
  constructor(code) {
    this.lexer = new Lexer(code);
  }

  parse() {
    const [tok, decls] = this.parseExprList();
    if (tok.id !== TOKEN.eof) {
      throw new Error("Invalid token in Form code");
    }
    return decls;
  }

  parseExprList() {
    const expressions = [];
    let tok = null,
      expr;
    while (true) {
      [tok, expr] = this.parseExpr(tok);
      if (!expr) {
        return [tok, new ExprList(expressions)];
      }
      expressions.push(expr);
    }
  }

  parseExpr(tok) {
    tok = tok || this.lexer.next();
    switch (tok.id) {
      case TOKEN.identifier:
        return this.parseAssigmentOrExpr(tok);
      case TOKEN.break:
        return [null, new BreakDecl()];
      case TOKEN.continue:
        return [null, new ContinueDecl()];
      case TOKEN.do:
        return this.parseBlock();
      case TOKEN.for:
        return this.parseFor();
      case TOKEN.foreach:
        return this.parseForeach();
      case TOKEN.func:
        return this.parseFuncDecl();
      case TOKEN.if:
        return this.parseIf();
      case TOKEN.var:
        return this.parseVarDecl();
      case TOKEN.while:
        return this.parseWhile();
      default:
        return this.parseSimpleExpr(tok);
    }
  }

  parseAssigmentOrExpr(tok) {
    const savedTok = tok;

    tok = this.lexer.next();
    if (tok.id === TOKEN.assign) {
      const [tok1, expr] = this.parseSimpleExpr(null);
      return [tok1, new Assignment(savedTok.value, expr)];
    }

    const parser = new SimpleExprParser(this.lexer);
    parser.pushOperand(new AstIdentifier(savedTok.value));

    return parser.parse(tok);
  }

  parseBlock() {
    const [tok1, body] = this.parseExprList();

    const tok = tok1 || this.lexer.next();
    if (tok.id !== TOKEN.end) {
      throw new Error(Errors.block);
    }

    return [null, new BlockDecl(body)];
  }

  parseVarDecl() {
    // 'var' Identifier ('=' SimpleExpression)?
    let tok = this.lexer.next();
    if (tok.id !== TOKEN.identifier) {
      throw new Error(Errors.var);
    }

    const identifier = tok.value;

    tok = this.lexer.next();
    if (tok.id !== TOKEN.assign) {
      return [tok, new VarDecl(identifier, null)];
    }

    const [tok1, expr] = this.parseSimpleExpr();
    return [tok1, new VarDecl(identifier, expr)];
  }

  parseFuncDecl() {
    // 'func' Identifier ParameterList 'do' ExpressionList 'endfunc'.
    let tok = this.lexer.next();
    if (tok.id !== TOKEN.identifier) {
      throw new Error(Errors.func);
    }

    const identifier = tok.value;
    const params = this.parseParamList();

    tok = this.lexer.next();
    if (tok.id !== TOKEN.do) {
      throw new Error(Errors.func);
    }

    const [tok1, body] = this.parseExprList();

    tok = tok1 || this.lexer.next();
    if (tok.id !== TOKEN.endfunc) {
      throw new Error(Errors.func);
    }

    return [null, new FuncDecl(identifier, params, body)];
  }

  parseParamList() {
    // '(' Identifier * ')'.
    const params = [];

    let tok = this.lexer.next();
    if (tok.id !== TOKEN.leftParen) {
      throw new Error(Errors.func);
    }

    tok = this.lexer.next();
    if (tok.id === TOKEN.rightParen) {
      return params;
    }

    while (true) {
      if (tok.id !== TOKEN.identifier) {
        throw new Error(Errors.func);
      }
      params.push(tok.value);
      tok = this.lexer.next();
      if (tok.id === TOKEN.rightParen) {
        return params;
      }
      if (tok.id !== TOKEN.comma) {
        throw new Error(Errors.func);
      }
      tok = this.lexer.next();
    }
  }

  parseSimpleExpr(tok = null) {
    return new SimpleExprParser(this.lexer).parse(tok);
  }

  parseIf() {
    // 'if' '(' SimpleExpression ')' then ExpressionList
    // ('elseif' '(' SimpleExpression ')' then ExpressionList )*
    // ('else' ExpressionList)?
    // 'endif'.
    let elseIfClause = [];
    let tok = this.lexer.next();
    if (tok.id !== TOKEN.leftParen) {
      throw new Error(Errors.if);
    }

    const [tok1, condition] = this.parseSimpleExpr();

    tok = tok1 || this.lexer.next();
    if (tok.id !== TOKEN.rightParen) {
      throw new Error(Errors.if);
    }

    tok = this.lexer.next();
    if (tok.id !== TOKEN.then) {
      throw new Error(Errors.if);
    }

    const [tok2, thenClause] = this.parseExprList();
    tok = tok2 || this.lexer.next();

    while (tok.id === TOKEN.elseif) {
      tok = this.lexer.next();
      if (tok.id !== TOKEN.leftParen) {
        throw new Error(Errors.elseif);
      }

      const [tok3, elseIfCondition] = this.parseSimpleExpr();

      tok = tok3 || this.lexer.next();
      if (tok.id !== TOKEN.rightParen) {
        throw new Error(Errors.elseif);
      }

      tok = this.lexer.next();
      if (tok.id !== TOKEN.then) {
        throw new Error(Errors.elseif);
      }

      const [tok4, elseIfThenClause] = this.parseExprList();
      elseIfClause.push(new ElseIfDecl(elseIfCondition, elseIfThenClause));

      tok = tok4 || this.lexer.next();
    }

    if (elseIfClause.length === 0) {
      elseIfClause = null;
    }

    if (tok.id === TOKEN.endif) {
      return [null, new IfDecl(condition, thenClause, elseIfClause, null)];
    }

    if (tok.id !== TOKEN.else) {
      throw new Error(Errors.if);
    }

    const [tok5, elseClause] = this.parseExprList();

    tok = tok5 || this.lexer.next();
    if (tok.id !== TOKEN.endif) {
      throw new Error(Errors.if);
    }

    return [null, new IfDecl(condition, thenClause, elseIfClause, elseClause)];
  }

  parseWhile() {
    // 'while' '(' SimpleExpression ')' 'do' ExprList 'endwhile'
    let tok = this.lexer.next();
    if (tok.id !== TOKEN.leftParen) {
      throw new Error(Errors.while);
    }

    const [tok1, condition] = this.parseSimpleExpr();

    tok = tok1 || this.lexer.next();
    if (tok.id !== TOKEN.rightParen) {
      throw new Error(Errors.while);
    }

    tok = this.lexer.next();
    if (tok.id !== TOKEN.do) {
      throw new Error(Errors.while);
    }

    const [tok2, whileClause] = this.parseExprList();

    tok = tok2 || this.lexer.next();
    if (tok.id !== TOKEN.endwhile) {
      throw new Error(Errors.while);
    }

    return [null, new WhileDecl(condition, whileClause)];
  }

  parseAssignment() {
    let tok = this.lexer.next();
    let hasVar = false;
    if (tok.id === TOKEN.var) {
      hasVar = true;
      tok = this.lexer.next();
    }

    if (tok.id !== TOKEN.identifier) {
      throw new Error(Errors.assignment);
    }

    const identifier = tok.value;

    tok = this.lexer.next();
    if (tok.id !== TOKEN.assign) {
      throw new Error(Errors.assignment);
    }

    const [tok1, expr] = this.parseSimpleExpr();
    if (hasVar) {
      return [tok1, new VarDecl(identifier, expr)];
    }
    return [tok1, new Assignment(identifier, expr)];
  }

  parseFor() {
    // 'for' Assignment ('upto'|'downto') Expr ('step' Expr)? 'do'
    // ExprList 'endfor'
    let tok,
      step = null;
    let upto = false;
    const [tok1, assignment] = this.parseAssignment();

    tok = tok1 || this.lexer.next();
    if (tok.id === TOKEN.upto) {
      upto = true;
    } else if (tok.id !== TOKEN.downto) {
      throw new Error(Errors.for);
    }

    const [tok2, end] = this.parseSimpleExpr();

    tok = tok2 || this.lexer.next();
    if (tok.id === TOKEN.step) {
      [tok, step] = this.parseSimpleExpr();
      tok = tok || this.lexer.next();
    }

    if (tok.id !== TOKEN.do) {
      throw new Error(Errors.for);
    }

    const [tok3, body] = this.parseExprList();

    tok = tok3 || this.lexer.next();
    if (tok.id !== TOKEN.endfor) {
      throw new Error(Errors.for);
    }

    return [null, new ForDecl(assignment, upto, end, step, body)];
  }

  parseForeach() {
    // 'for' Identifier 'in' '(' ArgumentList ')' 'do'
    // ExprList 'endfor'
    let tok = this.lexer.next();
    if (tok.id !== TOKEN.identifier) {
      throw new Error(Errors.foreach);
    }

    const identifier = tok.value;

    tok = this.lexer.next();
    if (tok.id !== TOKEN.in) {
      throw new Error(Errors.foreach);
    }

    tok = this.lexer.next();
    if (tok.id !== TOKEN.leftParen) {
      throw new Error(Errors.foreach);
    }

    const params = SimpleExprParser.parseParams(this.lexer);

    tok = this.lexer.next();
    if (tok.id !== TOKEN.do) {
      throw new Error(Errors.foreach);
    }

    const [tok1, body] = this.parseExprList();

    tok = tok1 || this.lexer.next();
    if (tok.id !== TOKEN.endfor) {
      throw new Error(Errors.foreach);
    }

    return [null, new ForeachDecl(identifier, params, body)];
  }
}

export { Errors, Parser };
