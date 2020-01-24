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
/* uses XRef */

import { assert } from "../shared/util.js";

var EOF = {};

var Name = (function NameClosure() {
  let nameCache = Object.create(null);

  function Name(name) {
    this.name = name;
  }

  Name.prototype = {};

  Name.get = function Name_get(name) {
    var nameValue = nameCache[name];
    return nameValue ? nameValue : (nameCache[name] = new Name(name));
  };

  Name._clearCache = function() {
    nameCache = Object.create(null);
  };

  return Name;
})();

var Cmd = (function CmdClosure() {
  let cmdCache = Object.create(null);

  function Cmd(cmd) {
    this.cmd = cmd;
  }

  Cmd.prototype = {};

  Cmd.get = function Cmd_get(cmd) {
    var cmdValue = cmdCache[cmd];
    return cmdValue ? cmdValue : (cmdCache[cmd] = new Cmd(cmd));
  };

  Cmd._clearCache = function() {
    cmdCache = Object.create(null);
  };

  return Cmd;
})();

var Dict = (function DictClosure() {
  var nonSerializable = function nonSerializableClosure() {
    return nonSerializable; // creating closure on some variable
  };

  // xref is optional
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

    // automatically dereferences Ref objects
    get(key1, key2, key3) {
      let value = this._map[key1];
      if (value === undefined && !(key1 in this._map) && key2 !== undefined) {
        value = this._map[key2];
        if (value === undefined && !(key2 in this._map) && key3 !== undefined) {
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
      if (value === undefined && !(key1 in this._map) && key2 !== undefined) {
        value = this._map[key2];
        if (value === undefined && !(key2 in this._map) && key3 !== undefined) {
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

    set: function Dict_set(key, value) {
      this._map[key] = value;
    },

    has: function Dict_has(key) {
      return key in this._map;
    },

    forEach: function Dict_forEach(callback) {
      for (var key in this._map) {
        callback(key, this.get(key));
      }
    },
  };

  Dict.empty = new Dict(null);

  Dict.merge = function(xref, dictArray) {
    const mergedDict = new Dict(xref);

    for (let i = 0, ii = dictArray.length; i < ii; i++) {
      const dict = dictArray[i];
      if (!isDict(dict)) {
        continue;
      }
      for (const keyName in dict._map) {
        if (mergedDict._map[keyName] !== undefined) {
          continue;
        }
        mergedDict._map[keyName] = dict._map[keyName];
      }
    }
    return mergedDict;
  };

  return Dict;
})();

var Ref = (function RefClosure() {
  let refCache = Object.create(null);

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

  Ref.get = function(num, gen) {
    const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
    const refValue = refCache[key];
    return refValue ? refValue : (refCache[key] = new Ref(num, gen));
  };

  Ref._clearCache = function() {
    refCache = Object.create(null);
  };

  return Ref;
})();

// The reference is identified by number and generation.
// This structure stores only one instance of the reference.
var RefSet = (function RefSetClosure() {
  function RefSet() {
    this.dict = Object.create(null);
  }

  RefSet.prototype = {
    has: function RefSet_has(ref) {
      return ref.toString() in this.dict;
    },

    put: function RefSet_put(ref) {
      this.dict[ref.toString()] = true;
    },

    remove: function RefSet_remove(ref) {
      delete this.dict[ref.toString()];
    },
  };

  return RefSet;
})();

var RefSetCache = (function RefSetCacheClosure() {
  function RefSetCache() {
    this.dict = Object.create(null);
  }

  RefSetCache.prototype = {
    get: function RefSetCache_get(ref) {
      return this.dict[ref.toString()];
    },

    has: function RefSetCache_has(ref) {
      return ref.toString() in this.dict;
    },

    put: function RefSetCache_put(ref, obj) {
      this.dict[ref.toString()] = obj;
    },

    putAlias: function RefSetCache_putAlias(ref, aliasRef) {
      this.dict[ref.toString()] = this.get(aliasRef);
    },

    forEach: function RefSetCache_forEach(fn, thisArg) {
      for (var i in this.dict) {
        fn.call(thisArg, this.dict[i]);
      }
    },

    clear: function RefSetCache_clear() {
      this.dict = Object.create(null);
    },
  };

  return RefSetCache;
})();

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
