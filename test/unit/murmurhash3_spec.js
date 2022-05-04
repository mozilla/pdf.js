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

import { MurmurHash3_64 } from "../../src/shared/murmurhash3.js";

describe("MurmurHash3_64", function () {
  it("instantiates without seed", function () {
    const hash = new MurmurHash3_64();
    expect(hash).toEqual(jasmine.any(MurmurHash3_64));
  });
  it("instantiates with seed", function () {
    const hash = new MurmurHash3_64(1);
    expect(hash).toEqual(jasmine.any(MurmurHash3_64));
  });

  const hexDigestExpected = "f61cfdbfdae0f65e";
  const sourceText = "test";
  const sourceCharCodes = [116, 101, 115, 116]; // 't','e','s','t'
  it("correctly generates a hash from a string", function () {
    const hash = new MurmurHash3_64();
    hash.update(sourceText);
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it("correctly generates a hash from a Uint8Array", function () {
    const hash = new MurmurHash3_64();
    hash.update(new Uint8Array(sourceCharCodes));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it("correctly generates a hash from a Uint32Array", function () {
    const hash = new MurmurHash3_64();
    hash.update(new Uint32Array(new Uint8Array(sourceCharCodes).buffer));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });

  it("changes the hash after update without seed", function () {
    const hash = new MurmurHash3_64();
    hash.update(sourceText);
    const hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    const hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });
  it("changes the hash after update with seed", function () {
    const hash = new MurmurHash3_64(1);
    hash.update(sourceText);
    const hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    const hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });

  it(
    "generates correct hashes for TypedArrays which share the same " +
      "underlying ArrayBuffer (issue 12533)",
    function () {
      // prettier-ignore
      const typedArray = new Uint8Array([
        0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1
      ]);
      const startArray = new Uint8Array(typedArray.buffer, 0, 10);
      const endArray = new Uint8Array(typedArray.buffer, 10, 10);

      expect(startArray).not.toEqual(endArray);

      const startHash = new MurmurHash3_64();
      startHash.update(startArray);
      const startHexdigest = startHash.hexdigest();

      const endHash = new MurmurHash3_64();
      endHash.update(endArray);
      const endHexdigest = endHash.hexdigest();

      // The two hashes *must* be different.
      expect(startHexdigest).not.toEqual(endHexdigest);

      expect(startHexdigest).toEqual("a49de339cc5b0819");
      expect(endHexdigest).toEqual("f81a92d9e214ab35");
    }
  );
});
