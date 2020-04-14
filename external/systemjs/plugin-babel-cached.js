/* Copyright 2017 Mozilla Foundation
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
var babel = require("plugin-babel");

var cacheExpiration = 60 /* min */ * 60 * 1000;
var dbVersion = 1;
var dbName = "babelcache";
var dbCacheTable = "translated";
var dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = function () {
        var db = request.result;
        db.createObjectStore(dbCacheTable, { keyPath: "address" });
      };
      request.onsuccess = function () {
        var db = request.result;
        resolve(db);
      };
      request.onerror = function () {
        console.warn("getDb: " + request.error);
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function storeCache(address, hashCode, translated, format) {
  return getDb().then(function (db) {
    var tx = db.transaction(dbCacheTable, "readwrite");
    var store = tx.objectStore(dbCacheTable);
    store.put({
      address: address,
      hashCode: hashCode,
      translated: translated,
      expires: Date.now() + cacheExpiration,
      format: format,
    });
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        resolve();
      };
    });
  });
}

function loadCache(address, hashCode) {
  return getDb().then(function (db) {
    var tx = db.transaction(dbCacheTable, "readonly");
    var store = tx.objectStore(dbCacheTable);
    var getAddress = store.get(address);
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        var found = getAddress.result;
        var isValid =
          found && found.hashCode === hashCode && Date.now() < found.expires;
        resolve(
          isValid
            ? {
                translated: found.translated,
                format: found.format,
              }
            : null
        );
      };
      tx.onerror = function () {
        resolve(null);
      };
    });
  });
}

var encoder = new TextEncoder("utf-8");
function sha256(str) {
  var buffer = encoder.encode(str);
  return crypto.subtle.digest("SHA-256", buffer).then(function (hash) {
    var data = new Int32Array(hash);
    return (
      data[0].toString(36) +
      "-" +
      data[1].toString(36) +
      "-" +
      data[2].toString(36) +
      "-" +
      data[3].toString(36)
    );
  });
}

exports.translate = function (load, opt) {
  var savedHashCode, babelTranslateError;
  return sha256(load.source)
    .then(function (hashCode) {
      savedHashCode = hashCode;
      return loadCache(load.address, hashCode);
    })
    .then(
      function (cache) {
        if (cache) {
          load.metadata.format = cache.format;
          return cache.translated;
        }
        return babel.translate.call(this, load, opt).then(
          function (translated) {
            return storeCache(
              load.address,
              savedHashCode,
              translated,
              load.metadata.format
            ).then(function () {
              return translated;
            });
          },
          function (reason) {
            throw (babelTranslateError = reason);
          }
        );
      }.bind(this)
    )
    .catch(
      function (reason) {
        if (babelTranslateError) {
          throw babelTranslateError;
        }
        return babel.translate.call(this, load, opt);
      }.bind(this)
    );
};
