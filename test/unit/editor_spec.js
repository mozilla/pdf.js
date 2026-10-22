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

import {
  CommandManager,
  KeyboardManager,
} from "../../src/display/editor/tools.js";
import {
  InkDrawOutline,
  InkDrawOutliner,
} from "../../src/display/editor/drawers/inkdraw.js";
import { FeatureTest } from "../../src/shared/util.js";
import { InputSmoother } from "../../src/display/editor/drawers/input_smoother.js";
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

  describe("Keyboard Manager", function () {
    function makeEvent(props) {
      return {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {},
        ...props,
      };
    }

    function withPlatform(isMac, callback) {
      const descriptor = Object.getOwnPropertyDescriptor(
        FeatureTest,
        "platform"
      );
      Object.defineProperty(FeatureTest, "platform", {
        value: { isMac },
        configurable: true,
      });
      try {
        callback();
      } finally {
        Object.defineProperty(FeatureTest, "platform", descriptor);
      }
    }

    it("should match a shortcut by event.key", function () {
      let called = 0;
      const manager = new KeyboardManager([[["ctrl+a"], () => called++]]);

      manager.exec(null, makeEvent({ key: "a", code: "KeyA", ctrlKey: true }));
      expect(called).toEqual(1);
    });

    it("should not fire when the modifiers don't match", function () {
      let called = 0;
      const manager = new KeyboardManager([[["ctrl+a"], () => called++]]);

      manager.exec(null, makeEvent({ key: "a", code: "KeyA", metaKey: true }));
      expect(called).toEqual(0);
    });

    it("should fall back to event.code on a non-Latin layout", function () {
      let called = 0;
      const manager = new KeyboardManager([[["ctrl+a"], () => called++]]);

      manager.exec(null, makeEvent({ key: "ф", code: "KeyA", ctrlKey: true }));
      expect(called).toEqual(1);
    });

    it("should not remap a Latin letter via event.code", function () {
      let called = 0;
      const manager = new KeyboardManager([[["ctrl+q"], () => called++]]);

      manager.exec(null, makeEvent({ key: "a", code: "KeyQ", ctrlKey: true }));
      expect(called).toEqual(0);

      manager.exec(null, makeEvent({ key: "q", code: "KeyA", ctrlKey: true }));
      expect(called).toEqual(1);
    });

    it("should match an uppercase event.key (e.g. shift on mac)", function () {
      let called = 0;
      const manager = new KeyboardManager([
        [["ctrl+shift+z", "ctrl+shift+Z"], () => called++],
      ]);

      manager.exec(
        null,
        makeEvent({ key: "Z", code: "KeyZ", ctrlKey: true, shiftKey: true })
      );
      expect(called).toEqual(1);
    });

    it("should use the mac+ shortcut on macOS", function () {
      withPlatform(true, () => {
        let called = 0;
        const manager = new KeyboardManager([
          [["ctrl+a", "mac+meta+a"], () => called++],
        ]);

        manager.exec(
          null,
          makeEvent({ key: "a", code: "KeyA", metaKey: true })
        );
        expect(called).toEqual(1);

        manager.exec(
          null,
          makeEvent({ key: "a", code: "KeyA", ctrlKey: true })
        );
        expect(called).toEqual(1);
      });
    });

    it("should use the bare shortcut on non-macOS", function () {
      withPlatform(false, () => {
        let called = 0;
        const manager = new KeyboardManager([
          [["ctrl+a", "mac+meta+a"], () => called++],
        ]);

        manager.exec(
          null,
          makeEvent({ key: "a", code: "KeyA", ctrlKey: true })
        );
        expect(called).toEqual(1);

        manager.exec(
          null,
          makeEvent({ key: "a", code: "KeyA", metaKey: true })
        );
        expect(called).toEqual(1);
      });
    });
  });

  describe("Input Smoother", function () {
    function smooth(samples) {
      const smoother = new InputSmoother(...samples[0]);
      const points = [];
      for (let i = 1; i < samples.length; i++) {
        points.push(...smoother.add(...samples[i]));
      }
      points.push(...smoother.end());
      return points;
    }

    it("must keep a line drawn at a constant speed", function () {
      const samples = [];
      for (let t = 0; t <= 100; t += 4) {
        samples.push([t, 2 * t + 1, 1000 + t]);
      }
      const points = smooth(samples);
      // One point every 4ms: no upsampling.
      expect(points.length).toEqual(2 * (samples.length - 1));
      for (let i = 0; i < points.length; i += 2) {
        expect(points[i]).toBeCloseTo(4 * (i / 2 + 1), 10);
        expect(points[i + 1]).toBeCloseTo(2 * points[i] + 1, 10);
      }
    });

    it("must remove the jitter of a quantized input", function () {
      // Quantize the x-coordinate of a slow line to whole pixels.
      const samples = [];
      for (let t = 0; t <= 200; t++) {
        samples.push([Math.round(t / 20), t / 2, t]);
      }
      const points = smooth(samples);
      let maxError = 0;
      // Exclude the narrower windows near the endpoints.
      for (let i = 40; i < points.length - 40; i += 2) {
        maxError = Math.max(maxError, Math.abs(points[i] - points[i + 1] / 10));
      }
      expect(maxError).toBeLessThan(0.05);
    });

    it("must end at the last sample", function () {
      const smoother = new InputSmoother(0, 0, 0);
      // The latest sample is still pending.
      expect(smoother.add(10, 0, 8)).toEqual([]);
      expect(smoother.pendingPoints.slice(-2)).toEqual([10, 0]);

      smoother.add(10, 10, 16);
      expect(smoother.pendingPoints.slice(-2)).toEqual([10, 10]);
      expect(smoother.end().slice(-2)).toEqual([10, 10]);
    });

    it("must upsample sparse samples", function () {
      const smoother = new InputSmoother(0, 0, 0);
      const points = [...smoother.add(90, 0, 50), ...smoother.end()];
      // 50ms at 180Hz.
      expect(points.length).toEqual(2 * 9);
      for (let i = 0; i < points.length; i += 2) {
        expect(points[i]).toBeCloseTo((90 * (i / 2 + 1)) / 9, 10);
      }
    });

    it("must keep the samples having the same timestamp", function () {
      const points = smooth([
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
      ]);
      expect(points.slice(-2)).toEqual([10, 10]);
    });

    it("must preserve averaging across a turn after a long stroke", function () {
      // Vary the turn's timing relative to buffer compaction.
      for (let end = 1000; end < 1040; end += 4) {
        const smoother = new InputSmoother(0, 0, 0);
        for (let t = 4; t <= end; t += 4) {
          smoother.add(0, 0, t);
        }
        smoother.add(20, 0, end + 4);
        smoother.add(20, 20, end + 8);
        smoother.add(40, 20, end + 12);
        expect(smoother.add(40, 40, end + 16)).toEqual([16, 8.5]);
        expect(smoother.pendingPoints).toEqual([25, 15, 35, 25, 40, 40]);
        expect(smoother.end()).toEqual([25, 15, 35, 25, 40, 40]);
      }
    });
  });

  describe("Ink Draw Outliner", function () {
    // The points are normalized to [0, 1] relative to the parent dimensions,
    // and `Outline.svgRound` multiplies them by 10000 in the SVG path, to
    // match the "0 0 10000 10000" viewBox of the drawing.
    const getLastPoint = d =>
      d
        .match(/-?[\d.]+/g)
        .slice(-2)
        .map(Number);

    it("must end a line on its last point", function () {
      const outliner = new InkDrawOutliner(0, 0, 1000, 1000, 0, 1);
      for (let i = 1; i <= 5; i++) {
        outliner.add(10 * i, 5 * i * i);
      }
      expect(getLastPoint(outliner.end().path.d)).toEqual([500, 1250]);
    });

    it("must end a deserialized line on its last point", function () {
      const outline = InkDrawOutline.deserialize(0, 0, 100, 100, 0, {
        paths: { points: [new Float32Array([0, 0, 10, 20, 30, 20, 40, 0])] },
        rotation: 0,
        thickness: 1,
      });
      expect(getLastPoint(outline.toSVGPath())).toEqual([4000, 10000]);
    });

    it("must keep the other lines when the last one is removed", function () {
      const outliner = new InkDrawOutliner(0, 0, 1000, 1000, 0, 1);
      for (let i = 1; i <= 10; i++) {
        outliner.add(10 * i, 0);
      }
      outliner.end();
      // A line with only two points.
      outliner.startNew(0, 100, 1000, 1000, 0);
      outliner.add(50, 100);
      outliner.end();
      outliner.startNew(0, 200, 1000, 1000, 0);
      for (let i = 1; i <= 10; i++) {
        outliner.add(10 * i, 200);
      }
      const { d } = outliner.end().path;

      expect(outliner.removeLastElement().path.d).toEqual(
        d.slice(0, d.lastIndexOf("M"))
      );
    });

    it("must check that a short smoothed line is cancellable", function () {
      // Upsampling must not count toward the five-input cancellation threshold.
      const outliner = new InkDrawOutliner(0, 0, 1000, 1000, 0, 1, 0);
      outliner.add(20, 0, 50);
      expect(outliner.isCancellable()).toBeTrue();

      for (let i = 1; i <= 4; i++) {
        outliner.add(20 + 10 * i, 0, 50 + 8 * i);
      }
      expect(outliner.isCancellable()).toBeFalse();
    });
  });
});
