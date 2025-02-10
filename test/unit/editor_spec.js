/* Copyright 2022 Mozilla Foundation
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

import { CommandManager } from "../../src/display/editor/tools.js";
import { SignatureExtractor } from "../../src/display/editor/drawers/signaturedraw.js";

describe("editor", function () {
  describe("Command Manager", function () {
    it("should check undo/redo", function () {
      const manager = new CommandManager(4);
      let x = 0;
      const makeDoUndo = n => ({ cmd: () => (x += n), undo: () => (x -= n) });

      manager.add({ ...makeDoUndo(1), mustExec: true });
      expect(x).toEqual(1);

      manager.add({ ...makeDoUndo(2), mustExec: true });
      expect(x).toEqual(3);

      manager.add({ ...makeDoUndo(3), mustExec: true });
      expect(x).toEqual(6);

      manager.undo();
      expect(x).toEqual(3);

      manager.undo();
      expect(x).toEqual(1);

      manager.undo();
      expect(x).toEqual(0);

      manager.undo();
      expect(x).toEqual(0);

      manager.redo();
      expect(x).toEqual(1);

      manager.redo();
      expect(x).toEqual(3);

      manager.redo();
      expect(x).toEqual(6);

      manager.redo();
      expect(x).toEqual(6);

      manager.undo();
      expect(x).toEqual(3);

      manager.redo();
      expect(x).toEqual(6);
    });
  });

  it("should hit the limit of the manager", function () {
    const manager = new CommandManager(3);
    let x = 0;
    const makeDoUndo = n => ({ cmd: () => (x += n), undo: () => (x -= n) });

    manager.add({ ...makeDoUndo(1), mustExec: true }); // 1
    manager.add({ ...makeDoUndo(2), mustExec: true }); // 3
    manager.add({ ...makeDoUndo(3), mustExec: true }); // 6
    manager.add({ ...makeDoUndo(4), mustExec: true }); // 10
    expect(x).toEqual(10);

    manager.undo();
    manager.undo();
    expect(x).toEqual(3);

    manager.undo();
    expect(x).toEqual(1);

    manager.undo();
    expect(x).toEqual(1);

    manager.redo();
    manager.redo();
    expect(x).toEqual(6);
    manager.add({ ...makeDoUndo(5), mustExec: true });
    expect(x).toEqual(11);
  });

  it("should check signature compression/decompression", async () => {
    let gen = n => new Float32Array(crypto.getRandomValues(new Uint16Array(n)));
    let outlines = [102, 28, 254, 4536, 10, 14532, 512].map(gen);
    const signature = {
      outlines,
      areContours: false,
      thickness: 1,
      width: 123,
      height: 456,
    };
    let compressed = await SignatureExtractor.compressSignature(signature);
    let decompressed = await SignatureExtractor.decompressSignature(compressed);
    expect(decompressed).toEqual(signature);

    signature.thickness = 2;
    compressed = await SignatureExtractor.compressSignature(signature);
    decompressed = await SignatureExtractor.decompressSignature(compressed);
    expect(decompressed).toEqual(signature);

    signature.areContours = true;
    compressed = await SignatureExtractor.compressSignature(signature);
    decompressed = await SignatureExtractor.decompressSignature(compressed);
    expect(decompressed).toEqual(signature);

    // Numbers are small enough to be compressed with Uint8Array.
    gen = n =>
      new Float32Array(
        crypto.getRandomValues(new Uint8Array(n)).map(x => x / 10)
      );
    outlines = [100, 200, 300, 10, 80].map(gen);
    signature.outlines = outlines;
    compressed = await SignatureExtractor.compressSignature(signature);
    decompressed = await SignatureExtractor.decompressSignature(compressed);
    expect(decompressed).toEqual(signature);

    // Numbers are large enough to be compressed with Uint16Array.
    gen = n =>
      new Float32Array(
        crypto.getRandomValues(new Uint16Array(n)).map(x => x / 10)
      );
    outlines = [100, 200, 300, 10, 80].map(gen);
    signature.outlines = outlines;
    compressed = await SignatureExtractor.compressSignature(signature);
    decompressed = await SignatureExtractor.decompressSignature(compressed);
    expect(decompressed).toEqual(signature);
  });
});
