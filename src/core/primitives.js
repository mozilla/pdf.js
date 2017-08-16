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

import { isArray } from '../shared/util';

var EOF = {};

var Name = (function NameClosure() {
  function Name(name) {
    this.name = name;
  }

  Name.prototype = {};

  var nameCache = Object.create(null);

  Name.get = function Name_get(name) {
    var nameValue = nameCache[name];
    return (nameValue ? nameValue : (nameCache[name] = new Name(name)));
  };

  return Name;
})();

var Cmd = (function CmdClosure() {
  function Cmd(cmd) {
    this.cmd = cmd;
  }

  Cmd.prototype = {};

  var cmdCache = Object.create(null);

  Cmd.get = function Cmd_get(cmd) {
    var cmdValue = cmdCache[cmd];
    return (cmdValue ? cmdValue : (cmdCache[cmd] = new Cmd(cmd)));
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
    get: function Dict_get(key1, key2, key3) {
      var value;
      var xref = this.xref, suppressEncryption = this.suppressEncryption;
      if (typeof (value = this._map[key1]) !== 'undefined' ||
          key1 in this._map || typeof key2 === 'undefined') {
        return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
      }
      if (typeof (value = this._map[key2]) !== 'undefined' ||
          key2 in this._map || typeof key3 === 'undefined') {
        return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
      }
      value = this._map[key3] || null;
      return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
    },

    // Same as get(), but returns a promise and uses fetchIfRefAsync().
    getAsync: function Dict_getAsync(key1, key2, key3) {
      var value;
      var xref = this.xref, suppressEncryption = this.suppressEncryption;
      if (typeof (value = this._map[key1]) !== 'undefined' ||
          key1 in this._map || typeof key2 === 'undefined') {
        if (xref) {
          return xref.fetchIfRefAsync(value, suppressEncryption);
        }
        return Promise.resolve(value);
      }
      if (typeof (value = this._map[key2]) !== 'undefined' ||
          key2 in this._map || typeof key3 === 'undefined') {
        if (xref) {
          return xref.fetchIfRefAsync(value, suppressEncryption);
        }
        return Promise.resolve(value);
      }
      value = this._map[key3] || null;
      if (xref) {
        return xref.fetchIfRefAsync(value, suppressEncryption);
      }
      return Promise.resolve(value);
    },

    // Same as get(), but dereferences all elements if the result is an Array.
    getArray: function Dict_getArray(key1, key2, key3) {
      var value = this.get(key1, key2, key3);
      var xref = this.xref, suppressEncryption = this.suppressEncryption;
      if (!isArray(value) || !xref) {
        return value;
      }
      value = value.slice(); // Ensure that we don't modify the Dict data.
      for (var i = 0, ii = value.length; i < ii; i++) {
        if (!isRef(value[i])) {
          continue;
        }
        value[i] = xref.fetch(value[i], suppressEncryption);
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
    let mergedDict = new Dict(xref);

    for (let i = 0, ii = dictArray.length; i < ii; i++) {
      let dict = dictArray[i];
      if (!isDict(dict)) {
        continue;
      }
      for (let keyName in dict._map) {
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
  function Ref(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  Ref.prototype = {
    toString: function Ref_toString() {
      // This function is hot, so we make the string as compact as possible.
      // |this.gen| is almost always zero, so we treat that case specially.
      var str = this.num + 'R';
      if (this.gen !== 0) {
        str += this.gen;
      }
      return str;
    },
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
  return (v === EOF);
}

function isName(v, name) {
  return v instanceof Name && (name === undefined || v.name === name);
}

function isCmd(v, cmd) {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}

function isDict(v, type) {
  return v instanceof Dict &&
         (type === undefined || isName(v.get('Type'), type));
}

function isRef(v) {
  return v instanceof Ref;
}

function isRefsEqual(v1, v2) {
  return v1.num === v2.num && v1.gen === v2.gen;
}

function isStream(v) {
  return typeof v === 'object' && v !== null && v.getBytes !== undefined;
}

export {
  EOF,
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
