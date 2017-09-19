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

var _document = require('../../core/document');

describe('document', function () {
  describe('Page', function () {
    it('should create correct objId using the idFactory', function () {
      var page1 = new _document.Page({}, null, 0, null, null, null, null);
      var page2 = new _document.Page({}, null, 1, null, null, null, null);
      var idFactory1 = page1.idFactory,
          idFactory2 = page2.idFactory;
      expect(idFactory1.createObjId()).toEqual('p0_1');
      expect(idFactory1.createObjId()).toEqual('p0_2');
      expect(idFactory2.createObjId()).toEqual('p1_1');
      expect(idFactory2.createObjId()).toEqual('p1_2');
      expect(idFactory1.createObjId()).toEqual('p0_3');
      expect(idFactory1.createObjId()).toEqual('p0_4');
    });
  });
});