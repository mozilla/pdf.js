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

var _murmurhash = require('../../core/murmurhash3');

describe('MurmurHash3_64', function () {
  it('instantiates without seed', function () {
    var hash = new _murmurhash.MurmurHash3_64();
    expect(hash).toEqual(jasmine.any(_murmurhash.MurmurHash3_64));
  });
  it('instantiates with seed', function () {
    var hash = new _murmurhash.MurmurHash3_64(1);
    expect(hash).toEqual(jasmine.any(_murmurhash.MurmurHash3_64));
  });
  var hexDigestExpected = 'f61cfdbfdae0f65e';
  var sourceText = 'test';
  var sourceCharCodes = [116, 101, 115, 116];
  it('correctly generates a hash from a string', function () {
    var hash = new _murmurhash.MurmurHash3_64();
    hash.update(sourceText);
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it('correctly generates a hash from a Uint8Array', function () {
    var hash = new _murmurhash.MurmurHash3_64();
    hash.update(new Uint8Array(sourceCharCodes));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it('correctly generates a hash from a Uint32Array', function () {
    var hash = new _murmurhash.MurmurHash3_64();
    hash.update(new Uint32Array(new Uint8Array(sourceCharCodes).buffer));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it('changes the hash after update without seed', function () {
    var hash = new _murmurhash.MurmurHash3_64();
    var hexdigest1, hexdigest2;
    hash.update(sourceText);
    hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });
  it('changes the hash after update with seed', function () {
    var hash = new _murmurhash.MurmurHash3_64(1);
    var hexdigest1, hexdigest2;
    hash.update(sourceText);
    hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });
});