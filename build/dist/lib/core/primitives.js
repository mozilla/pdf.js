/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.clearPrimitiveCaches = clearPrimitiveCaches;
exports.isEOF = isEOF;
exports.isCmd = isCmd;
exports.isDict = isDict;
exports.isName = isName;
exports.isRef = isRef;
exports.isRefsEqual = isRefsEqual;
exports.isStream = isStream;
exports.RefSetCache = exports.RefSet = exports.Ref = exports.Name = exports.Dict = exports.Cmd = exports.EOF = void 0;

var _util = require("../shared/util");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var EOF = {};
exports.EOF = EOF;

var Name = function NameClosure() {
  var nameCache = Object.create(null);

  function Name(name) {
    this.name = name;
  }

  Name.prototype = {};

  Name.get = function Name_get(name) {
    var nameValue = nameCache[name];
    return nameValue ? nameValue : nameCache[name] = new Name(name);
  };

  Name._clearCache = function () {
    nameCache = Object.create(null);
  };

  return Name;
}();

exports.Name = Name;

var Cmd = function CmdClosure() {
  var cmdCache = Object.create(null);

  function Cmd(cmd) {
    this.cmd = cmd;
  }

  Cmd.prototype = {};

  Cmd.get = function Cmd_get(cmd) {
    var cmdValue = cmdCache[cmd];
    return cmdValue ? cmdValue : cmdCache[cmd] = new Cmd(cmd);
  };

  Cmd._clearCache = function () {
    cmdCache = Object.create(null);
  };

  return Cmd;
}();

exports.Cmd = Cmd;

var Dict = function DictClosure() {
  var nonSerializable = function nonSerializableClosure() {
    return nonSerializable;
  };

  function Dict(xref) {
    this._map = Object.create(null);
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
    this.__nonSerializable__ = nonSerializable;
  }

  Dict.prototype = {
    assignXref: function Dict_assignXref(newXref) {
      this.xref = newXref;
    },
    get: function Dict_get(key1, key2, key3) {
      var value;
      var xref = this.xref,
          suppressEncryption = this.suppressEncryption;

      if (typeof (value = this._map[key1]) !== 'undefined' || key1 in this._map || typeof key2 === 'undefined') {
        return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
      }

      if (typeof (value = this._map[key2]) !== 'undefined' || key2 in this._map || typeof key3 === 'undefined') {
        return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
      }

      value = this._map[key3] || null;
      return xref ? xref.fetchIfRef(value, suppressEncryption) : value;
    },
    getAsync: function Dict_getAsync(key1, key2, key3) {
      var value;
      var xref = this.xref,
          suppressEncryption = this.suppressEncryption;

      if (typeof (value = this._map[key1]) !== 'undefined' || key1 in this._map || typeof key2 === 'undefined') {
        if (xref) {
          return xref.fetchIfRefAsync(value, suppressEncryption);
        }

        return Promise.resolve(value);
      }

      if (typeof (value = this._map[key2]) !== 'undefined' || key2 in this._map || typeof key3 === 'undefined') {
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
    getArray: function Dict_getArray(key1, key2, key3) {
      var value = this.get(key1, key2, key3);
      var xref = this.xref,
          suppressEncryption = this.suppressEncryption;

      if (!Array.isArray(value) || !xref) {
        return value;
      }

      value = value.slice();

      for (var i = 0, ii = value.length; i < ii; i++) {
        if (!isRef(value[i])) {
          continue;
        }

        value[i] = xref.fetch(value[i], suppressEncryption);
      }

      return value;
    },
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
    }
  };
  Dict.empty = new Dict(null);

  Dict.merge = function (xref, dictArray) {
    var mergedDict = new Dict(xref);

    for (var i = 0, ii = dictArray.length; i < ii; i++) {
      var dict = dictArray[i];

      if (!isDict(dict)) {
        continue;
      }

      for (var keyName in dict._map) {
        if (mergedDict._map[keyName] !== undefined) {
          continue;
        }

        mergedDict._map[keyName] = dict._map[keyName];
      }
    }

    return mergedDict;
  };

  return Dict;
}();

exports.Dict = Dict;

var Ref = function RefClosure() {
  var refCache = Object.create(null);

  function Ref(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  Ref.prototype = {
    toString: function Ref_toString() {
      if (this.gen === 0) {
        return "".concat(this.num, "R");
      }

      return "".concat(this.num, "R").concat(this.gen);
    }
  };

  Ref.get = function (num, gen) {
    var key = gen === 0 ? "".concat(num, "R") : "".concat(num, "R").concat(gen);
    var refValue = refCache[key];
    return refValue ? refValue : refCache[key] = new Ref(num, gen);
  };

  Ref._clearCache = function () {
    refCache = Object.create(null);
  };

  return Ref;
}();

exports.Ref = Ref;

var RefSet = function RefSetClosure() {
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
    }
  };
  return RefSet;
}();

exports.RefSet = RefSet;

var RefSetCache = function RefSetCacheClosure() {
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
    }
  };
  return RefSetCache;
}();

exports.RefSetCache = RefSetCache;

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
  return v instanceof Dict && (type === undefined || isName(v.get('Type'), type));
}

function isRef(v) {
  return v instanceof Ref;
}

function isRefsEqual(v1, v2) {
  return v1.num === v2.num && v1.gen === v2.gen;
}

function isStream(v) {
  return _typeof(v) === 'object' && v !== null && v.getBytes !== undefined;
}

function clearPrimitiveCaches() {
  Cmd._clearCache();

  Name._clearCache();

  Ref._clearCache();
}