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

import { assert, shadow, unreachable } from "../shared/util.js";

const CIRCULAR_REF = Symbol("CIRCULAR_REF");
const EOF = Symbol("EOF");

let CmdCache = Object.create(null);
let NameCache = Object.create(null);
let RefCache = Object.create(null);

function clearPrimitiveCaches() {
  CmdCache = Object.create(null);
  NameCache = Object.create(null);
  RefCache = Object.create(null);
}

class Name {
  constructor(name) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      typeof name !== "string"
    ) {
      unreachable('Name: The "name" must be a string.');
    }
    this.name = name;
  }

  static get(name) {
    // eslint-disable-next-line no-restricted-syntax
    return (NameCache[name] ||= new Name(name));
  }
}

class Cmd {
  constructor(cmd) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      typeof cmd !== "string"
    ) {
      unreachable('Cmd: The "cmd" must be a string.');
    }
    this.cmd = cmd;
  }

  static get(cmd) {
    // eslint-disable-next-line no-restricted-syntax
    return (CmdCache[cmd] ||= new Cmd(cmd));
  }
}

const nonSerializable = function nonSerializableClosure() {
  return nonSerializable; // Creating closure on some variable.
};

class Dict {
  constructor(xref = null) {
    // Map should only be used internally, use functions below to access.
    this._map = new Map();
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
    this.__nonSerializable__ = nonSerializable; // Disable cloning of the Dict.
  }

  assignXref(newXref) {
    this.xref = newXref;
  }

  get size() {
    return this._map.size;
  }

  // Automatically dereferences Ref objects.
  get(key1, key2, key3) {
    let value = this._map.get(key1);
    if (value === undefined && key2 !== undefined) {
      if (
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
        key2.length < key1.length
      ) {
        unreachable("Dict.get: Expected keys to be ordered by length.");
      }
      value = this._map.get(key2);
      if (value === undefined && key3 !== undefined) {
        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
          key3.length < key2.length
        ) {
          unreachable("Dict.get: Expected keys to be ordered by length.");
        }
        value = this._map.get(key3);
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetch(value, this.suppressEncryption);
    }
    return value;
  }

  // Same as get(), but returns a promise and uses fetchIfRefAsync().
  async getAsync(key1, key2, key3) {
    let value = this._map.get(key1);
    if (value === undefined && key2 !== undefined) {
      if (
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
        key2.length < key1.length
      ) {
        unreachable("Dict.getAsync: Expected keys to be ordered by length.");
      }
      value = this._map.get(key2);
      if (value === undefined && key3 !== undefined) {
        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
          key3.length < key2.length
        ) {
          unreachable("Dict.getAsync: Expected keys to be ordered by length.");
        }
        value = this._map.get(key3);
      }
    }
    if (value instanceof Ref && this.xref) {
      return this.xref.fetchAsync(value, this.suppressEncryption);
    }
    return value;
  }

  // Same as get(), but dereferences all elements if the result is an Array.
  getArray(key1, key2, key3) {
    let value = this._map.get(key1);
    if (value === undefined && key2 !== undefined) {
      if (
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
        key2.length < key1.length
      ) {
        unreachable("Dict.getArray: Expected keys to be ordered by length.");
      }
      value = this._map.get(key2);
      if (value === undefined && key3 !== undefined) {
        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
          key3.length < key2.length
        ) {
          unreachable("Dict.getArray: Expected keys to be ordered by length.");
        }
        value = this._map.get(key3);
      }
    }
    if (value instanceof Ref && this.xref) {
      value = this.xref.fetch(value, this.suppressEncryption);
    }

    if (Array.isArray(value)) {
      value = value.slice(); // Ensure that we don't modify the Dict data.
      for (let i = 0, ii = value.length; i < ii; i++) {
        if (value[i] instanceof Ref && this.xref) {
          value[i] = this.xref.fetch(value[i], this.suppressEncryption);
        }
      }
    }
    return value;
  }

  // No dereferencing.
  getRaw(key) {
    return this._map.get(key);
  }

  getKeys() {
    return [...this._map.keys()];
  }

  // No dereferencing.
  getRawValues() {
    return [...this._map.values()];
  }

  set(key, value) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      if (typeof key !== "string") {
        unreachable('Dict.set: The "key" must be a string.');
      } else if (value === undefined) {
        unreachable('Dict.set: The "value" cannot be undefined.');
      }
    }
    this._map.set(key, value);
  }

  has(key) {
    return this._map.has(key);
  }

  *[Symbol.iterator]() {
    for (const [key, value] of this._map) {
      yield [
        key,
        value instanceof Ref && this.xref
          ? this.xref.fetch(value, this.suppressEncryption)
          : value,
      ];
    }
  }

  static get empty() {
    const emptyDict = new Dict(null);

    emptyDict.set = (key, value) => {
      unreachable("Should not call `set` on the empty dictionary.");
    };
    return shadow(this, "empty", emptyDict);
  }

  static merge({ xref, dictArray, mergeSubDicts = false }) {
    const mergedDict = new Dict(xref),
      properties = new Map();

    for (const dict of dictArray) {
      if (!(dict instanceof Dict)) {
        continue;
      }
      for (const [key, value] of dict._map) {
        let property = properties.get(key);
        if (property === undefined) {
          property = [];
          properties.set(key, property);
        } else if (!mergeSubDicts || !(value instanceof Dict)) {
          // Ignore additional entries, if either:
          //  - This is a "shallow" merge, where only the first element matters.
          //  - The value is *not* a `Dict`, since other types cannot be merged.
          continue;
        }
        property.push(value);
      }
    }
    for (const [name, values] of properties) {
      if (values.length === 1 || !(values[0] instanceof Dict)) {
        mergedDict._map.set(name, values[0]);
        continue;
      }
      const subDict = new Dict(xref);

      for (const dict of values) {
        for (const [key, value] of dict._map) {
          if (!subDict._map.has(key)) {
            subDict._map.set(key, value);
          }
        }
      }
      if (subDict.size > 0) {
        mergedDict._map.set(name, subDict);
      }
    }
    properties.clear();

    return mergedDict.size > 0 ? mergedDict : Dict.empty;
  }

  clone() {
    const dict = new Dict(this.xref);
    for (const key of this.getKeys()) {
      dict.set(key, this.getRaw(key));
    }
    return dict;
  }

  delete(key) {
    delete this._map[key];
  }
}

class Ref {
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  toString() {
    // This function is hot, so we make the string as compact as possible.
    // |this.gen| is almost always zero, so we treat that case specially.
    if (this.gen === 0) {
      return `${this.num}R`;
    }
    return `${this.num}R${this.gen}`;
  }

  static fromString(str) {
    const ref = RefCache[str];
    if (ref) {
      return ref;
    }
    const m = /^(\d+)R(\d*)$/.exec(str);
    if (!m || m[1] === "0") {
      return null;
    }

    // eslint-disable-next-line no-restricted-syntax
    return (RefCache[str] = new Ref(
      parseInt(m[1]),
      !m[2] ? 0 : parseInt(m[2])
    ));
  }

  static get(num, gen) {
    const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
    // eslint-disable-next-line no-restricted-syntax
    return (RefCache[key] ||= new Ref(num, gen));
  }
}

// The reference is identified by number and generation.
// This structure stores only one instance of the reference.
class RefSet {
  constructor(parent = null) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      parent &&
      !(parent instanceof RefSet)
    ) {
      unreachable('RefSet: Invalid "parent" value.');
    }
    this._set = new Set(parent?._set);
  }

  has(ref) {
    return this._set.has(ref.toString());
  }

  put(ref) {
    this._set.add(ref.toString());
  }

  remove(ref) {
    this._set.delete(ref.toString());
  }

  [Symbol.iterator]() {
    return this._set.values();
  }

  clear() {
    this._set.clear();
  }
}

class RefSetCache {
  constructor() {
    this._map = new Map();
  }

  get size() {
    return this._map.size;
  }

  get(ref) {
    return this._map.get(ref.toString());
  }

  has(ref) {
    return this._map.has(ref.toString());
  }

  put(ref, obj) {
    this._map.set(ref.toString(), obj);
  }

  putAlias(ref, aliasRef) {
    this._map.set(ref.toString(), this.get(aliasRef));
  }

  [Symbol.iterator]() {
    return this._map.values();
  }

  clear() {
    this._map.clear();
  }

  *values() {
    yield* this._map.values();
  }

  *items() {
    for (const [ref, value] of this._map) {
      yield [Ref.fromString(ref), value];
    }
  }
}

function isName(v, name) {
  return v instanceof Name && (name === undefined || v.name === name);
}

function isCmd(v, cmd) {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}

function isDict(v, type) {
  return (
    v instanceof Dict && (type === undefined || isName(v.get("Type"), type))
  );
}

function isRefsEqual(v1, v2) {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
    assert(
      v1 instanceof Ref && v2 instanceof Ref,
      "isRefsEqual: Both parameters should be `Ref`s."
    );
  }
  return v1.num === v2.num && v1.gen === v2.gen;
}

export {
  CIRCULAR_REF,
  clearPrimitiveCaches,
  Cmd,
  Dict,
  EOF,
  isCmd,
  isDict,
  isName,
  isRefsEqual,
  Name,
  Ref,
  RefSet,
  RefSetCache,
};
