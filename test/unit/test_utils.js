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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-test/unit/test_utils', ['exports', 'pdfjs/shared/util'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/shared/util.js'));
  } else {
    factory((root.pdfjsTestUnitTestUtils = {}), root.pdfjsSharedUtil);
  }
}(this, function (exports, sharedUtil) {

var CMapCompressionType = sharedUtil.CMapCompressionType;

var NodeCMapReaderFactory = (function NodeCMapReaderFactoryClosure() {
  function NodeCMapReaderFactory(params) {
    this.baseUrl = params.baseUrl || null;
    this.isCompressed = params.isCompressed || false;
  }

  NodeCMapReaderFactory.prototype = {
    fetch: function(params) {
      var name = params.name;
      if (!name) {
        return Promise.reject(new Error('CMap name must be specified.'));
      }
      return new Promise(function (resolve, reject) {
        var url = this.baseUrl + name + (this.isCompressed ? '.bcmap' : '');

        var fs = require('fs');
        fs.readFile(url, function (error, data) {
          if (error || !data) {
            reject(new Error('Unable to load ' +
                             (this.isCompressed ? 'binary ' : '') +
                             'CMap at: ' + url));
            return;
          }
          resolve({
            cMapData: new Uint8Array(data),
            compressionType: this.isCompressed ?
              CMapCompressionType.BINARY : CMapCompressionType.NONE,
          });
        }.bind(this));
      }.bind(this));
    },
  };

  return NodeCMapReaderFactory;
})();

exports.NodeCMapReaderFactory = NodeCMapReaderFactory;
}));
