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
import { BaseStream } from "./base_stream.js";
import { EvaluatorPreprocessor } from "./evaluator.js";

if (
  typeof PDFJSDev !== "undefined" &&
  !PDFJSDev.test("TESTING || INTERNAL_VIEWER")
) {
  throw new Error("Not implemented: InternalViewerUtils");
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
    const refs = Array.isArray(contentsVal) ? contentsVal : [contentsVal];
    const rawContents = [];
    const tokens = [];
    for (const rawRef of refs) {
      if (rawRef instanceof Ref) {
        rawContents.push({ num: rawRef.num, gen: rawRef.gen });
      }
      const stream = xref.fetchIfRef(rawRef);
      if (!(stream instanceof BaseStream)) {
        continue;
      }
      tokens.push(...this.tokenizeStream(stream, xref));
    }
    const { instructions, cmdNames } = this.groupIntoInstructions(tokens);
    return { contentStream: true, instructions, cmdNames, rawContents };
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
    if (obj === null) {
      return { type: "null" };
    }
    return null;
  },
};

export { InternalViewerUtils };
