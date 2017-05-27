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

'use strict';

(function () {
  var baseLocation;
  if (typeof document !== 'undefined') {
    baseLocation = new URL('./', document.currentScript.src);
  } else if (typeof location !== 'undefined') {
    // Probably worker -- walking subfolders until we will reach root.
    baseLocation = location;
    while (baseLocation.href.includes('/src/')) {
      baseLocation = new URL('..', baseLocation);
    }
  } else {
    throw new Error('Cannot configure SystemJS');
  }

  var PluginBabelPath = 'node_modules/systemjs-plugin-babel/plugin-babel.js';
  var SystemJSPluginBabelPath =
    'node_modules/systemjs-plugin-babel/systemjs-babel-browser.js';
  var PluginBabelCachePath = 'external/systemjs/plugin-babel-cached.js';

  var isCachingPossible = typeof indexedDB !== 'undefined' &&
                          typeof TextEncoder !== 'undefined' &&
                          typeof crypto !== 'undefined' &&
                          typeof crypto.subtle !== 'undefined';

  SystemJS.config({
    packages: {
      '': {
        defaultExtension: 'js',
      }
    },
    paths: {
      'pdfjs': new URL('src', baseLocation).href,
      'pdfjs-web': new URL('web', baseLocation).href,
      'pdfjs-test': new URL('test', baseLocation).href,
    },
    meta: {
      '*': {
        scriptLoad: false,
        esModule: true,
        babelOptions: {
          es2015: false,
        },
      }
    },
    map: {
      'plugin-babel': new URL(PluginBabelPath, baseLocation).href,
      'systemjs-babel-build':
        new URL(SystemJSPluginBabelPath, baseLocation).href,
      'plugin-babel-cached': new URL(PluginBabelCachePath, baseLocation).href,
    },
    transpiler: isCachingPossible ? 'plugin-babel-cached' : 'plugin-babel'
  });

  // Workaround for fetch() mutiple-files-at-one-time bug
  if (typeof self !== 'undefined' && typeof self.fetch !== 'undefined' &&
      /\sChrom(e|ium)\//.test(navigator.userAgent)) {
    var oldFetch = self.fetch;
    var lastFetch = Promise.resolve();
    var deferred = function () {
      var result = {};
      result.promise = new Promise(function (resolve, reject) {
        result.resolve = resolve;
        result.reject = reject;
      });
      return result;
    };
    self.fetch = function () {
      var args = Array.prototype.slice.call(arguments, 0);
      var fetchDeferred = deferred();
      var resDeferred = deferred();
      lastFetch = lastFetch.then(function () {
        oldFetch.apply(null, args).then(function (res) {
          var oldText = res.text;
          res.text = function () {
            return oldText.call(this).then(function (text) {
              resDeferred.resolve();
              return text;
            }, resDeferred.reject);
          };
          fetchDeferred.resolve(res);
        }, fetchDeferred.reject);
        return resDeferred.promise;
      }).catch(function () { /* ignore errors */ });
      return fetchDeferred.promise;
    };
  }
})();
