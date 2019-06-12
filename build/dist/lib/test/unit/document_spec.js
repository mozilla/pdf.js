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

var _test_utils = require("./test_utils");

describe('document', function () {
  describe('Page', function () {
    it('should create correct objId using the idFactory', function () {
      var idFactory1 = (0, _test_utils.createIdFactory)(0);
      var idFactory2 = (0, _test_utils.createIdFactory)(1);
      expect(idFactory1.createObjId()).toEqual('p0_1');
      expect(idFactory1.createObjId()).toEqual('p0_2');
      expect(idFactory1.getDocId()).toEqual('g_d0');
      expect(idFactory2.createObjId()).toEqual('p1_1');
      expect(idFactory2.createObjId()).toEqual('p1_2');
      expect(idFactory2.getDocId()).toEqual('g_d0');
      expect(idFactory1.createObjId()).toEqual('p0_3');
      expect(idFactory1.createObjId()).toEqual('p0_4');
      expect(idFactory1.getDocId()).toEqual('g_d0');
    });
  });
});