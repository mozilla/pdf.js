/* Copyright 2026 Mozilla Foundation
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

import { PagesMapper } from "../../src/display/pages_mapper.js";

describe("PagesMapper", function () {
  it("should preserve page rotations through duplication and deletion", function () {
    const mapper = new PagesMapper();
    mapper.pagesNumber = 3;

    mapper.rotatePages([2], 90);
    expect(mapper.getRotationDelta(2)).toEqual(90);

    mapper.copyPages(Uint32Array.of(2));
    mapper.pastePages(2);
    expect(mapper.pagesNumber).toEqual(4);
    expect(mapper.getRotationDelta(2)).toEqual(90);
    expect(mapper.getRotationDelta(3)).toEqual(90);

    mapper.deletePages(Uint32Array.of(2));
    expect(mapper.pagesNumber).toEqual(3);
    expect(mapper.getRotationDelta(2)).toEqual(90);

    const params = mapper.getPageMappingForSaving();
    expect(params.flatMap(({ rotationDeltas }) => rotationDeltas)).toContain(
      90
    );
  });
});
