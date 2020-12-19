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
/* eslint-disable no-var */

import { assert, unreachable } from "../shared/util.js";

var EOF = {};

var Name = (function NameClosure() {
  let nameCache = Object.create(null);

  // eslint-disable-next-line no-shadow
  function Name(name) {
    this.name = name;
  }

  Name.prototype = {};

  Name.get = function Name_get(name) {
    var nameValue = nameCache[name];
    // eslint-disable-next-line no-restricted-syntax
    return nameValue ? nameValue : (nameCache[name] = new Name(name));
  };

  Name._clearCache = function () {
    nameCache = Object.create(null);
  };

  return Name;
})();

var Cmd = (function CmdClosure() {
  let cmdCache = Object.create(null);

  // eslint-disable-next-line no-shadow
  function Cmd(cmd) {
    this.cmd = cmd;
  }

  Cmd.prototype = {};

  Cmd.get = function Cmd_get(cmd) {
    var cmdValue = cmdCache[cmd];
    // eslint-disable-next-line no-restricted-syntax
    return cmdValue ? cmdValue : (cmdCache[cmd] = new Cmd(cmd));
  };

  Cmd._clearCache = function () {
    cmdCache = Object.create(null);
  };

  return Cmd;
})();

var Dict = (function DictClosure() {
  var nonSerializable = function nonSerializableClosure() {
    return nonSerializable; // creating closure on some variable
  };

  // xref is optional
  // eslint-disable-next-line no-shadow
  function Dict(xref) {
    // Map should only be used internally, use functions below to access.
    this._map = Object.create(null);
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
    this.__nonSerializable__ = nonSerializable; // disable cloning of the Dict
  }

  Dict.prototype = {
    assignXref: function Dict_assignXref(newXref) {
      this.xref = newXref;
    },

    get size() {
      return Object.keys(this._map).length;
    },

    // automatically dereferences Ref objects
    get(key1, key2, key3) {
      let value = this._map[key1];
      if (value === undefined && key2 !== undefined) {
        value = this._map[key2];
        if (value === undefined && key3 !== undefined) {
          value = this._map[key3];
        }
      }
      if (value instanceof Ref && this.xref) {
        return this.xref.fetch(value, this.suppressEncryption);
      }
      return value;
    },

    // Same as get(), but returns a promise and uses fetchIfRefAsync().
    async getAsync(key1, key2, key3) {
      let value = this._map[key1];
      if (value === undefined && key2 !== undefined) {
        value = this._map[key2];
        if (value === undefined && key3 !== undefined) {
          value = this._map[key3];
        }
      }
      if (value instanceof Ref && this.xref) {
        return this.xref.fetchAsync(value, this.suppressEncryption);
      }
      return value;
    },

    // Same as get(), but dereferences all elements if the result is an Array.
    getArray(key1, key2, key3) {
      let value = this.get(key1, key2, key3);
      if (!Array.isArray(value) || !this.xref) {
        return value;
      }
      value = value.slice(); // Ensure that we don't modify the Dict data.
      for (let i = 0, ii = value.length; i < ii; i++) {
        if (!(value[i] instanceof Ref)) {
          continue;
        }
        value[i] = this.xref.fetch(value[i], this.suppressEncryption);
      }
      return value;
    },

    // no dereferencing
    getRaw: function Dict_getRaw(key) {
      return this._map[key];
    },

    getKeys: function Dict_getKeys() {
      return Object.keys(this._map);
    },

    // no dereferencing
    getRawValues: function Dict_getRawValues() {
      return Object.values(this._map);
    },

    set: function Dict_set(key, value) {
      if (
        (typeof PDFJSDev === "undefined" ||
          PDFJSDev.test("!PRODUCTION || TESTING")) &&
        value === undefined
      ) {
        unreachable('Dict.set: The "value" cannot be undefined.');
      }
      this._map[key] = value;
    },

    has: function Dict_has(key) {
      return this._map[key] !== undefined;
    },

    forEach: function Dict_forEach(callback) {
      for (var key in this._map) {
        callback(key, this.get(key));
      }
    },
  };

  Dict.empty = (function () {
    const emptyDict = new Dict(null);

    emptyDict.set = (key, value) => {
      unreachable("Should not call `set` on the empty dictionary.");
    };
    return emptyDict;
  })();

  Dict.merge = function ({ xref, dictArray, mergeSubDicts = false }) {
    const mergedDict = new Dict(xref);

    if (!mergeSubDicts) {
      for (const dict of dictArray) {
        if (!(dict instanceof Dict)) {
          continue;
        }
        for (const [key, value] of Object.entries(dict._map)) {
          if (mergedDict._map[key] === undefined) {
            mergedDict._map[key] = value;
          }
        }
      }
      return mergedDict.size > 0 ? mergedDict : Dict.empty;
    }
    const properties = new Map();

    for (const dict of dictArray) {
      if (!(dict instanceof Dict)) {
        continue;
      }
      for (const [key, value] of Object.entries(dict._map)) {
        let property = properties.get(key);
        if (property === undefined) {
          property = [];
          properties.set(key, property);
        }
        property.push(value);
      }
    }
    for (const [name, values] of properties) {
      if (values.length === 1 || !(values[0] instanceof Dict)) {
        mergedDict._map[name] = values[0];
        continue;
      }
      const subDict = new Dict(xref);

      for (const dict of values) {
        if (!(dict instanceof Dict)) {
          continue;
        }
        for (const [key, value] of Object.entries(dict._map)) {
          if (subDict._map[key] === undefined) {
            subDict._map[key] = value;
          }
        }
      }
      if (subDict.size > 0) {
        mergedDict._map[name] = subDict;
      }
    }
    properties.clear();

    return mergedDict.size > 0 ? mergedDict : Dict.empty;
  };

  return Dict;
})();

var Ref = (function RefClosure() {
  let refCache = Object.create(null);

  // eslint-disable-next-line no-shadow
  function Ref(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  Ref.prototype = {
    toString: function Ref_toString() {
      // This function is hot, so we make the string as compact as possible.
      // |this.gen| is almost always zero, so we treat that case specially.
      if (this.gen === 0) {
        return `${this.num}R`;
      }
      return `${this.num}R${this.gen}`;
    },
  };

  Ref.get = function (num, gen) {
    const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
    const refValue = refCache[key];
    // eslint-disable-next-line no-restricted-syntax
    return refValue ? refValue : (refCache[key] = new Ref(num, gen));
  };

  Ref._clearCache = function () {
    refCache = Object.create(null);
  };

  return Ref;
})();

// The reference is identified by number and generation.
// This structure stores only one instance of the reference.
class RefSet {
  constructor(parent = null) {
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || TESTING")) &&
      parent &&
      !(parent instanceof RefSet)
    ) {
      unreachable('RefSet: Invalid "parent" value.');
    }
    this._set = new Set(parent && parent._set);
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

  forEach(callback) {
    for (const ref of this._set.values()) {
      callback(ref);
    }
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

  forEach(callback) {
    for (const value of this._map.values()) {
      callback(value);
    }
  }

  clear() {
    this._map.clear();
  }
}

function isEOF(v) {
  return v === EOF;
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

function isRef(v) {
  return v instanceof Ref;
}

function isRefsEqual(v1, v2) {
  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("!PRODUCTION || TESTING")
  ) {
    assert(
      v1 instanceof Ref && v2 instanceof Ref,
      "isRefsEqual: Both parameters should be `Ref`s."
    );
  }
  return v1.num === v2.num && v1.gen === v2.gen;
}

function isStream(v) {
  return typeof v === "object" && v !== null && v.getBytes !== undefined;
}

function clearPrimitiveCaches() {
  Cmd._clearCache();
  Name._clearCache();
  Ref._clearCache();
}

export {
  EOF,
  clearPrimitiveCaches,
  Cmd,
  Dict,
  Name,
  Ref,
  RefSet,
  RefSetCache,
  isEOF,
  isCmd,
  isDict,
  isName,
  isRef,
  isRefsEqual,
  isStream,
};
