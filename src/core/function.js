/* Copyright 2012 Mozilla Foundation
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

import { Dict, Ref } from "./primitives.js";
import {
  FeatureTest,
  FormatError,
  info,
  MathClamp,
  shadow,
  unreachable,
} from "../shared/util.js";
import { PostScriptLexer, PostScriptParser } from "./ps_parser.js";
import { BaseStream } from "./base_stream.js";
import { isNumberArray } from "./core_utils.js";
import { LocalFunctionCache } from "./image_utils.js";

class PDFFunctionFactory {
  constructor({ xref, isEvalSupported = true }) {
    this.xref = xref;
    this.isEvalSupported = isEvalSupported !== false;
  }

  create(fn, parseArray = false) {
    let fnRef, parsedFn;

    // Check if the Function is cached first, to avoid re-parsing it.
    if (fn instanceof Ref) {
      fnRef = fn;
    } else if (fn instanceof Dict) {
      fnRef = fn.objId;
    } else if (fn instanceof BaseStream) {
      fnRef = fn.dict?.objId;
    }
    if (fnRef) {
      const cachedFn = this._localFunctionCache.getByRef(fnRef);
      if (cachedFn) {
        return cachedFn;
      }
    }

    const fnObj = this.xref.fetchIfRef(fn);
    if (Array.isArray(fnObj)) {
      if (!parseArray) {
        throw new Error(
          'PDFFunctionFactory.create - expected "parseArray" argument.'
        );
      }
      parsedFn = PDFFunction.parseArray(this, fnObj);
    } else {
      parsedFn = PDFFunction.parse(this, fnObj);
    }

    // Attempt to cache the parsed Function, by reference.
    if (fnRef) {
      this._localFunctionCache.set(/* name = */ null, fnRef, parsedFn);
    }
    return parsedFn;
  }

  /**
   * @private
   */
  get _localFunctionCache() {
    return shadow(this, "_localFunctionCache", new LocalFunctionCache());
  }
}

function toNumberArray(arr) {
  if (!Array.isArray(arr)) {
    return null;
  }
  if (!isNumberArray(arr, null)) {
    // Non-number is found -- convert all items to numbers.
    return arr.map(x => +x);
  }
  return arr;
}

class PDFFunction {
  static getSampleArray(size, outputSize, bps, stream) {
    let i, ii;
    let length = 1;
    for (i = 0, ii = size.length; i < ii; i++) {
      length *= size[i];
    }
    length *= outputSize;

    const array = new Array(length);
    let codeSize = 0;
    let codeBuf = 0;
    // 32 is a valid bps so shifting won't work
    const sampleMul = 1.0 / (2.0 ** bps - 1);

    const strBytes = stream.getBytes((length * bps + 7) / 8);
    let strIdx = 0;
    for (i = 0; i < length; i++) {
      while (codeSize < bps) {
        codeBuf <<= 8;
        codeBuf |= strBytes[strIdx++];
        codeSize += 8;
      }
      codeSize -= bps;
      array[i] = (codeBuf >> codeSize) * sampleMul;
      codeBuf &= (1 << codeSize) - 1;
    }
    return array;
  }

  static parse(factory, fn) {
    const dict = fn.dict || fn;
    const typeNum = dict.get("FunctionType");

    switch (typeNum) {
      case 0:
        return this.constructSampled(factory, fn, dict);
      case 1:
        break;
      case 2:
        return this.constructInterpolated(factory, dict);
      case 3:
        return this.constructStiched(factory, dict);
      case 4:
        return this.constructPostScript(factory, fn, dict);
    }
    throw new FormatError("Unknown type of function");
  }

  static parseArray(factory, fnObj) {
    const { xref } = factory;

    const fnArray = [];
    for (const fn of fnObj) {
      fnArray.push(this.parse(factory, xref.fetchIfRef(fn)));
    }
    return function (src, srcOffset, dest, destOffset) {
      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        fnArray[i](src, srcOffset, dest, destOffset + i);
      }
    };
  }

  static constructSampled(factory, fn, dict) {
    function toMultiArray(arr) {
      const inputLength = arr.length;
      const out = [];
      let index = 0;
      for (let i = 0; i < inputLength; i += 2) {
        out[index++] = [arr[i], arr[i + 1]];
      }
      return out;
    }
    // See chapter 3, page 109 of the PDF reference
    function interpolate(x, xmin, xmax, ymin, ymax) {
      return ymin + (x - xmin) * ((ymax - ymin) / (xmax - xmin));
    }

    let domain = toNumberArray(dict.getArray("Domain"));
    let range = toNumberArray(dict.getArray("Range"));

    if (!domain || !range) {
      throw new FormatError("No domain or range");
    }

    const inputSize = domain.length / 2;
    const outputSize = range.length / 2;

    domain = toMultiArray(domain);
    range = toMultiArray(range);

    const size = toNumberArray(dict.getArray("Size"));
    const bps = dict.get("BitsPerSample");
    const order = dict.get("Order") || 1;
    if (order !== 1) {
      // No description how cubic spline interpolation works in PDF32000:2008
      // As in poppler, ignoring order, linear interpolation may work as good
      info("No support for cubic spline interpolation: " + order);
    }

    let encode = toNumberArray(dict.getArray("Encode"));
    if (!encode) {
      encode = [];
      for (let i = 0; i < inputSize; ++i) {
        encode.push([0, size[i] - 1]);
      }
    } else {
      encode = toMultiArray(encode);
    }

    let decode = toNumberArray(dict.getArray("Decode"));
    decode = !decode ? range : toMultiArray(decode);

    const samples = this.getSampleArray(size, outputSize, bps, fn);
    // const mask = 2 ** bps - 1;

    return function constructSampledFn(src, srcOffset, dest, destOffset) {
      // See chapter 3, page 110 of the PDF reference.

      // Building the cube vertices: its part and sample index
      // http://rjwagner49.com/Mathematics/Interpolation.pdf
      const cubeVertices = 1 << inputSize;
      const cubeN = new Float64Array(cubeVertices).fill(1);
      const cubeVertex = new Uint32Array(cubeVertices);
      let i, j;

      let k = outputSize,
        pos = 1;
      // Map x_i to y_j for 0 <= i < m using the sampled function.
      for (i = 0; i < inputSize; ++i) {
        // x_i' = min(max(x_i, Domain_2i), Domain_2i+1)
        const domain_2i = domain[i][0];
        const domain_2i_1 = domain[i][1];
        const xi = MathClamp(src[srcOffset + i], domain_2i, domain_2i_1);

        // e_i = Interpolate(x_i', Domain_2i, Domain_2i+1,
        //                   Encode_2i, Encode_2i+1)
        let e = interpolate(
          xi,
          domain_2i,
          domain_2i_1,
          encode[i][0],
          encode[i][1]
        );

        // e_i' = min(max(e_i, 0), Size_i - 1)
        const size_i = size[i];
        e = MathClamp(e, 0, size_i - 1);

        // Adjusting the cube: N and vertex sample index
        const e0 = e < size_i - 1 ? Math.floor(e) : e - 1; // e1 = e0 + 1;
        const n0 = e0 + 1 - e; // (e1 - e) / (e1 - e0);
        const n1 = e - e0; // (e - e0) / (e1 - e0);
        const offset0 = e0 * k;
        const offset1 = offset0 + k; // e1 * k
        for (j = 0; j < cubeVertices; j++) {
          if (j & pos) {
            cubeN[j] *= n1;
            cubeVertex[j] += offset1;
          } else {
            cubeN[j] *= n0;
            cubeVertex[j] += offset0;
          }
        }

        k *= size_i;
        pos <<= 1;
      }

      for (j = 0; j < outputSize; ++j) {
        // Sum all cube vertices' samples portions
        let rj = 0;
        for (i = 0; i < cubeVertices; i++) {
          rj += samples[cubeVertex[i] + j] * cubeN[i];
        }

        // r_j' = Interpolate(r_j, 0, 2^BitsPerSample - 1,
        //                    Decode_2j, Decode_2j+1)
        rj = interpolate(rj, 0, 1, decode[j][0], decode[j][1]);

        // y_j = min(max(r_j, range_2j), range_2j+1)
        dest[destOffset + j] = MathClamp(rj, range[j][0], range[j][1]);
      }
    };
  }

  static constructInterpolated(factory, dict) {
    const c0 = toNumberArray(dict.getArray("C0")) || [0];
    const c1 = toNumberArray(dict.getArray("C1")) || [1];
    const n = dict.get("N");

    const diff = [];
    for (let i = 0, ii = c0.length; i < ii; ++i) {
      diff.push(c1[i] - c0[i]);
    }
    const length = diff.length;

    return function constructInterpolatedFn(src, srcOffset, dest, destOffset) {
      const x = n === 1 ? src[srcOffset] : src[srcOffset] ** n;

      for (let j = 0; j < length; ++j) {
        dest[destOffset + j] = c0[j] + x * diff[j];
      }
    };
  }

  static constructStiched(factory, dict) {
    const domain = toNumberArray(dict.getArray("Domain"));

    if (!domain) {
      throw new FormatError("No domain");
    }

    const inputSize = domain.length / 2;
    if (inputSize !== 1) {
      throw new FormatError("Bad domain for stiched function");
    }
    const { xref } = factory;

    const fns = [];
    for (const fn of dict.get("Functions")) {
      fns.push(this.parse(factory, xref.fetchIfRef(fn)));
    }

    const bounds = toNumberArray(dict.getArray("Bounds"));
    const encode = toNumberArray(dict.getArray("Encode"));
    const tmpBuf = new Float32Array(1);

    return function constructStichedFn(src, srcOffset, dest, destOffset) {
      // Clamp to domain.
      const v = MathClamp(src[srcOffset], domain[0], domain[1]);
      // calculate which bound the value is in
      const length = bounds.length;
      let i;
      for (i = 0; i < length; ++i) {
        if (v < bounds[i]) {
          break;
        }
      }

      // encode value into domain of function
      let dmin = domain[0];
      if (i > 0) {
        dmin = bounds[i - 1];
      }
      let dmax = domain[1];
      if (i < bounds.length) {
        dmax = bounds[i];
      }

      const rmin = encode[2 * i];
      const rmax = encode[2 * i + 1];

      // Prevent the value from becoming NaN as a result
      // of division by zero (fixes issue6113.pdf).
      tmpBuf[0] =
        dmin === dmax
          ? rmin
          : rmin + ((v - dmin) * (rmax - rmin)) / (dmax - dmin);

      // call the appropriate function
      fns[i](tmpBuf, 0, dest, destOffset);
    };
  }

  static constructPostScript(factory, fn, dict) {
    const domain = toNumberArray(dict.getArray("Domain"));
    const range = toNumberArray(dict.getArray("Range"));

    if (!domain) {
      throw new FormatError("No domain.");
    }

    if (!range) {
      throw new FormatError("No range.");
    }

    const lexer = new PostScriptLexer(fn);
    const parser = new PostScriptParser(lexer);
    const code = parser.parse();

    if (factory.isEvalSupported && FeatureTest.isEvalSupported) {
      const compiled = new PostScriptCompiler().compile(code, domain, range);
      if (compiled) {
        // Compiled function consists of simple expressions such as addition,
        // subtraction, Math.max, and also contains 'var' and 'return'
        // statements. See the generation in the PostScriptCompiler below.
        // eslint-disable-next-line no-new-func
        return new Function("src", "srcOffset", "dest", "destOffset", compiled);
      }
    }
    info("Unable to compile PS function");

    const numOutputs = range.length >> 1;
    const numInputs = domain.length >> 1;
    const evaluator = new PostScriptEvaluator(code);
    // Cache the values for a big speed up, the cache size is limited though
    // since the number of possible values can be huge from a PS function.
    const cache = Object.create(null);
    // The MAX_CACHE_SIZE is set to ~4x the maximum number of distinct values
    // seen in our tests.
    const MAX_CACHE_SIZE = 2048 * 4;
    let cache_available = MAX_CACHE_SIZE;
    const input = new Float32Array(numInputs);

    return function constructPostScriptFn(src, srcOffset, dest, destOffset) {
      let i, value;
      let key = "";
      for (i = 0; i < numInputs; i++) {
        value = src[srcOffset + i];
        input[i] = value;
        key += value + "_";
      }

      const cachedValue = cache[key];
      if (cachedValue !== undefined) {
        dest.set(cachedValue, destOffset);
        return;
      }

      const output = new Float32Array(numOutputs);
      const stack = evaluator.execute(input);
      const stackIndex = stack.length - numOutputs;
      for (i = 0; i < numOutputs; i++) {
        value = stack[stackIndex + i];
        let bound = range[i * 2];
        if (value < bound) {
          value = bound;
        } else {
          bound = range[i * 2 + 1];
          if (value > bound) {
            value = bound;
          }
        }
        output[i] = value;
      }
      if (cache_available > 0) {
        cache_available--;
        cache[key] = output;
      }
      dest.set(output, destOffset);
    };
  }
}

function isPDFFunction(v) {
  let fnDict;
  if (v instanceof Dict) {
    fnDict = v;
  } else if (v instanceof BaseStream) {
    fnDict = v.dict;
  } else {
    return false;
  }
  return fnDict.has("FunctionType");
}

class PostScriptStack {
  static MAX_STACK_SIZE = 100;

  constructor(initialStack) {
    this.stack = initialStack ? Array.from(initialStack) : [];
  }

  push(value) {
    if (this.stack.length >= PostScriptStack.MAX_STACK_SIZE) {
      throw new Error("PostScript function stack overflow.");
    }
    this.stack.push(value);
  }

  pop() {
    if (this.stack.length <= 0) {
      throw new Error("PostScript function stack underflow.");
    }
    return this.stack.pop();
  }

  copy(n) {
    if (this.stack.length + n >= PostScriptStack.MAX_STACK_SIZE) {
      throw new Error("PostScript function stack overflow.");
    }
    const stack = this.stack;
    for (let i = stack.length - n, j = n - 1; j >= 0; j--, i++) {
      stack.push(stack[i]);
    }
  }

  index(n) {
    this.push(this.stack[this.stack.length - n - 1]);
  }

  // rotate the last n stack elements p times
  roll(n, p) {
    const stack = this.stack;
    const l = stack.length - n;
    const r = stack.length - 1;
    const c = l + (p - Math.floor(p / n) * n);

    for (let i = l, j = r; i < j; i++, j--) {
      const t = stack[i];
      stack[i] = stack[j];
      stack[j] = t;
    }
    for (let i = l, j = c - 1; i < j; i++, j--) {
      const t = stack[i];
      stack[i] = stack[j];
      stack[j] = t;
    }
    for (let i = c, j = r; i < j; i++, j--) {
      const t = stack[i];
      stack[i] = stack[j];
      stack[j] = t;
    }
  }
}

class PostScriptEvaluator {
  constructor(operators) {
    this.operators = operators;
  }

  execute(initialStack) {
    const stack = new PostScriptStack(initialStack);
    let counter = 0;
    const operators = this.operators;
    const length = operators.length;
    let operator, a, b;
    while (counter < length) {
      operator = operators[counter++];
      if (typeof operator === "number") {
        // Operator is really an operand and should be pushed to the stack.
        stack.push(operator);
        continue;
      }
      switch (operator) {
        // non standard ps operators
        case "jz": // jump if false
          b = stack.pop();
          a = stack.pop();
          if (!a) {
            counter = b;
          }
          break;
        case "j": // jump
          a = stack.pop();
          counter = a;
          break;

        // all ps operators in alphabetical order (excluding if/ifelse)
        case "abs":
          a = stack.pop();
          stack.push(Math.abs(a));
          break;
        case "add":
          b = stack.pop();
          a = stack.pop();
          stack.push(a + b);
          break;
        case "and":
          b = stack.pop();
          a = stack.pop();
          if (typeof a === "boolean" && typeof b === "boolean") {
            stack.push(a && b);
          } else {
            stack.push(a & b);
          }
          break;
        case "atan":
          b = stack.pop();
          a = stack.pop();
          a = (Math.atan2(a, b) / Math.PI) * 180;
          if (a < 0) {
            a += 360;
          }
          stack.push(a);
          break;
        case "bitshift":
          b = stack.pop();
          a = stack.pop();
          if (a > 0) {
            stack.push(a << b);
          } else {
            stack.push(a >> b);
          }
          break;
        case "ceiling":
          a = stack.pop();
          stack.push(Math.ceil(a));
          break;
        case "copy":
          a = stack.pop();
          stack.copy(a);
          break;
        case "cos":
          a = stack.pop();
          stack.push(Math.cos(((a % 360) / 180) * Math.PI));
          break;
        case "cvi":
          a = stack.pop() | 0;
          stack.push(a);
          break;
        case "cvr":
          // noop
          break;
        case "div":
          b = stack.pop();
          a = stack.pop();
          stack.push(a / b);
          break;
        case "dup":
          stack.copy(1);
          break;
        case "eq":
          b = stack.pop();
          a = stack.pop();
          stack.push(a === b);
          break;
        case "exch":
          stack.roll(2, 1);
          break;
        case "exp":
          b = stack.pop();
          a = stack.pop();
          stack.push(a ** b);
          break;
        case "false":
          stack.push(false);
          break;
        case "floor":
          a = stack.pop();
          stack.push(Math.floor(a));
          break;
        case "ge":
          b = stack.pop();
          a = stack.pop();
          stack.push(a >= b);
          break;
        case "gt":
          b = stack.pop();
          a = stack.pop();
          stack.push(a > b);
          break;
        case "idiv":
          b = stack.pop();
          a = stack.pop();
          stack.push((a / b) | 0);
          break;
        case "index":
          a = stack.pop();
          stack.index(a);
          break;
        case "le":
          b = stack.pop();
          a = stack.pop();
          stack.push(a <= b);
          break;
        case "ln":
          a = stack.pop();
          stack.push(Math.log(a));
          break;
        case "log":
          a = stack.pop();
          stack.push(Math.log10(a));
          break;
        case "lt":
          b = stack.pop();
          a = stack.pop();
          stack.push(a < b);
          break;
        case "mod":
          b = stack.pop();
          a = stack.pop();
          stack.push(a % b);
          break;
        case "mul":
          b = stack.pop();
          a = stack.pop();
          stack.push(a * b);
          break;
        case "ne":
          b = stack.pop();
          a = stack.pop();
          stack.push(a !== b);
          break;
        case "neg":
          a = stack.pop();
          stack.push(-a);
          break;
        case "not":
          a = stack.pop();
          if (typeof a === "boolean") {
            stack.push(!a);
          } else {
            stack.push(~a);
          }
          break;
        case "or":
          b = stack.pop();
          a = stack.pop();
          if (typeof a === "boolean" && typeof b === "boolean") {
            stack.push(a || b);
          } else {
            stack.push(a | b);
          }
          break;
        case "pop":
          stack.pop();
          break;
        case "roll":
          b = stack.pop();
          a = stack.pop();
          stack.roll(a, b);
          break;
        case "round":
          a = stack.pop();
          stack.push(Math.round(a));
          break;
        case "sin":
          a = stack.pop();
          stack.push(Math.sin(((a % 360) / 180) * Math.PI));
          break;
        case "sqrt":
          a = stack.pop();
          stack.push(Math.sqrt(a));
          break;
        case "sub":
          b = stack.pop();
          a = stack.pop();
          stack.push(a - b);
          break;
        case "true":
          stack.push(true);
          break;
        case "truncate":
          a = stack.pop();
          a = a < 0 ? Math.ceil(a) : Math.floor(a);
          stack.push(a);
          break;
        case "xor":
          b = stack.pop();
          a = stack.pop();
          if (typeof a === "boolean" && typeof b === "boolean") {
            stack.push(a !== b);
          } else {
            stack.push(a ^ b);
          }
          break;
        default:
          throw new FormatError(`Unknown operator ${operator}`);
      }
    }
    return stack.stack;
  }
}

class AstNode {
  constructor(type) {
    this.type = type;
  }

  visit(visitor) {
    unreachable("abstract method");
  }
}

class AstArgument extends AstNode {
  constructor(index, min, max) {
    super("args");
    this.index = index;
    this.min = min;
    this.max = max;
  }

  visit(visitor) {
    visitor.visitArgument(this);
  }
}

class AstLiteral extends AstNode {
  constructor(number) {
    super("literal");
    this.number = number;
    this.min = number;
    this.max = number;
  }

  visit(visitor) {
    visitor.visitLiteral(this);
  }
}

class AstBinaryOperation extends AstNode {
  constructor(op, arg1, arg2, min, max) {
    super("binary");
    this.op = op;
    this.arg1 = arg1;
    this.arg2 = arg2;
    this.min = min;
    this.max = max;
  }

  visit(visitor) {
    visitor.visitBinaryOperation(this);
  }
}

class AstMin extends AstNode {
  constructor(arg, max) {
    super("max");
    this.arg = arg;
    this.min = arg.min;
    this.max = max;
  }

  visit(visitor) {
    visitor.visitMin(this);
  }
}

class AstVariable extends AstNode {
  constructor(index, min, max) {
    super("var");
    this.index = index;
    this.min = min;
    this.max = max;
  }

  visit(visitor) {
    visitor.visitVariable(this);
  }
}

class AstVariableDefinition extends AstNode {
  constructor(variable, arg) {
    super("definition");
    this.variable = variable;
    this.arg = arg;
  }

  visit(visitor) {
    visitor.visitVariableDefinition(this);
  }
}

class ExpressionBuilderVisitor {
  constructor() {
    this.parts = [];
  }

  visitArgument(arg) {
    this.parts.push(
      "Math.max(",
      arg.min,
      ", Math.min(",
      arg.max,
      ", src[srcOffset + ",
      arg.index,
      "]))"
    );
  }

  visitVariable(variable) {
    this.parts.push("v", variable.index);
  }

  visitLiteral(literal) {
    this.parts.push(literal.number);
  }

  visitBinaryOperation(operation) {
    this.parts.push("(");
    operation.arg1.visit(this);
    this.parts.push(" ", operation.op, " ");
    operation.arg2.visit(this);
    this.parts.push(")");
  }

  visitVariableDefinition(definition) {
    this.parts.push("var ");
    definition.variable.visit(this);
    this.parts.push(" = ");
    definition.arg.visit(this);
    this.parts.push(";");
  }

  visitMin(max) {
    this.parts.push("Math.min(");
    max.arg.visit(this);
    this.parts.push(", ", max.max, ")");
  }

  toString() {
    return this.parts.join("");
  }
}

function buildAddOperation(num1, num2) {
  if (num2.type === "literal" && num2.number === 0) {
    // optimization: second operand is 0
    return num1;
  }
  if (num1.type === "literal" && num1.number === 0) {
    // optimization: first operand is 0
    return num2;
  }
  if (num2.type === "literal" && num1.type === "literal") {
    // optimization: operands operand are literals
    return new AstLiteral(num1.number + num2.number);
  }
  return new AstBinaryOperation(
    "+",
    num1,
    num2,
    num1.min + num2.min,
    num1.max + num2.max
  );
}

function buildMulOperation(num1, num2) {
  if (num2.type === "literal") {
    // optimization: second operands is a literal...
    if (num2.number === 0) {
      return new AstLiteral(0); // and it's 0
    } else if (num2.number === 1) {
      return num1; // and it's 1
    } else if (num1.type === "literal") {
      // ... and first operands is a literal too
      return new AstLiteral(num1.number * num2.number);
    }
  }
  if (num1.type === "literal") {
    // optimization: first operands is a literal...
    if (num1.number === 0) {
      return new AstLiteral(0); // and it's 0
    } else if (num1.number === 1) {
      return num2; // and it's 1
    }
  }
  const min = Math.min(
    num1.min * num2.min,
    num1.min * num2.max,
    num1.max * num2.min,
    num1.max * num2.max
  );
  const max = Math.max(
    num1.min * num2.min,
    num1.min * num2.max,
    num1.max * num2.min,
    num1.max * num2.max
  );
  return new AstBinaryOperation("*", num1, num2, min, max);
}

function buildSubOperation(num1, num2) {
  if (num2.type === "literal") {
    // optimization: second operands is a literal...
    if (num2.number === 0) {
      return num1; // ... and it's 0
    } else if (num1.type === "literal") {
      // ... and first operands is a literal too
      return new AstLiteral(num1.number - num2.number);
    }
  }
  if (
    num2.type === "binary" &&
    num2.op === "-" &&
    num1.type === "literal" &&
    num1.number === 1 &&
    num2.arg1.type === "literal" &&
    num2.arg1.number === 1
  ) {
    // optimization for case: 1 - (1 - x)
    return num2.arg2;
  }
  return new AstBinaryOperation(
    "-",
    num1,
    num2,
    num1.min - num2.max,
    num1.max - num2.min
  );
}

function buildMinOperation(num1, max) {
  if (num1.min >= max) {
    // optimization: num1 min value is not less than required max
    return new AstLiteral(max); // just returning max
  } else if (num1.max <= max) {
    // optimization: num1 max value is not greater than required max
    return num1; // just returning an argument
  }
  return new AstMin(num1, max);
}

// Most of the PDFs functions consist of simple operations such as:
//   roll, exch, sub, cvr, pop, index, dup, mul, if, gt, add.
//
// We can compile most of such programs, and at the same moment, we can
// optimize some expressions using basic math properties. Keeping track of
// min/max values will allow us to avoid extra Math.min/Math.max calls.
class PostScriptCompiler {
  compile(code, domain, range) {
    const stack = [];
    const instructions = [];
    const inputSize = domain.length >> 1,
      outputSize = range.length >> 1;
    let lastRegister = 0;
    let n, j;
    let num1, num2, ast1, ast2, tmpVar, item;
    for (let i = 0; i < inputSize; i++) {
      stack.push(new AstArgument(i, domain[i * 2], domain[i * 2 + 1]));
    }

    for (let i = 0, ii = code.length; i < ii; i++) {
      item = code[i];
      if (typeof item === "number") {
        stack.push(new AstLiteral(item));
        continue;
      }

      switch (item) {
        case "add":
          if (stack.length < 2) {
            return null;
          }
          num2 = stack.pop();
          num1 = stack.pop();
          stack.push(buildAddOperation(num1, num2));
          break;
        case "cvr":
          if (stack.length < 1) {
            return null;
          }
          break;
        case "mul":
          if (stack.length < 2) {
            return null;
          }
          num2 = stack.pop();
          num1 = stack.pop();
          stack.push(buildMulOperation(num1, num2));
          break;
        case "sub":
          if (stack.length < 2) {
            return null;
          }
          num2 = stack.pop();
          num1 = stack.pop();
          stack.push(buildSubOperation(num1, num2));
          break;
        case "exch":
          if (stack.length < 2) {
            return null;
          }
          ast1 = stack.pop();
          ast2 = stack.pop();
          stack.push(ast1, ast2);
          break;
        case "pop":
          if (stack.length < 1) {
            return null;
          }
          stack.pop();
          break;
        case "index":
          if (stack.length < 1) {
            return null;
          }
          num1 = stack.pop();
          if (num1.type !== "literal") {
            return null;
          }
          n = num1.number;
          if (n < 0 || !Number.isInteger(n) || stack.length < n) {
            return null;
          }
          ast1 = stack[stack.length - n - 1];
          if (ast1.type === "literal" || ast1.type === "var") {
            stack.push(ast1);
            break;
          }
          tmpVar = new AstVariable(lastRegister++, ast1.min, ast1.max);
          stack[stack.length - n - 1] = tmpVar;
          stack.push(tmpVar);
          instructions.push(new AstVariableDefinition(tmpVar, ast1));
          break;
        case "dup":
          if (stack.length < 1) {
            return null;
          }
          if (
            typeof code[i + 1] === "number" &&
            code[i + 2] === "gt" &&
            code[i + 3] === i + 7 &&
            code[i + 4] === "jz" &&
            code[i + 5] === "pop" &&
            code[i + 6] === code[i + 1]
          ) {
            // special case of the commands sequence for the min operation
            num1 = stack.pop();
            stack.push(buildMinOperation(num1, code[i + 1]));
            i += 6;
            break;
          }
          ast1 = stack.at(-1);
          if (ast1.type === "literal" || ast1.type === "var") {
            // we don't have to save into intermediate variable a literal or
            // variable.
            stack.push(ast1);
            break;
          }
          tmpVar = new AstVariable(lastRegister++, ast1.min, ast1.max);
          stack[stack.length - 1] = tmpVar;
          stack.push(tmpVar);
          instructions.push(new AstVariableDefinition(tmpVar, ast1));
          break;
        case "roll":
          if (stack.length < 2) {
            return null;
          }
          num2 = stack.pop();
          num1 = stack.pop();
          if (num2.type !== "literal" || num1.type !== "literal") {
            // both roll operands must be numbers
            return null;
          }
          j = num2.number;
          n = num1.number;
          if (
            n <= 0 ||
            !Number.isInteger(n) ||
            !Number.isInteger(j) ||
            stack.length < n
          ) {
            // ... and integers
            return null;
          }
          j = ((j % n) + n) % n;
          if (j === 0) {
            break; // just skipping -- there are nothing to rotate
          }
          stack.push(...stack.splice(stack.length - n, n - j));
          break;
        default:
          return null; // unsupported operator
      }
    }

    if (stack.length !== outputSize) {
      return null;
    }

    const result = [];
    for (const instruction of instructions) {
      const statementBuilder = new ExpressionBuilderVisitor();
      instruction.visit(statementBuilder);
      result.push(statementBuilder.toString());
    }
    for (let i = 0, ii = stack.length; i < ii; i++) {
      const expr = stack[i],
        statementBuilder = new ExpressionBuilderVisitor();
      expr.visit(statementBuilder);
      const min = range[i * 2],
        max = range[i * 2 + 1];
      const out = [statementBuilder.toString()];
      if (min > expr.min) {
        out.unshift("Math.max(", min, ", ");
        out.push(")");
      }
      if (max < expr.max) {
        out.unshift("Math.min(", max, ", ");
        out.push(")");
      }
      out.unshift("dest[destOffset + ", i, "] = ");
      out.push(";");
      result.push(out.join(""));
    }
    return result.join("\n");
  }
}

export {
  isPDFFunction,
  PDFFunctionFactory,
  PostScriptCompiler,
  PostScriptEvaluator,
};
