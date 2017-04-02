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
    },
    transpiler: 'plugin-babel'
  });
})();
