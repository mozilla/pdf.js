/* Copyright 2025 Mozilla Foundation
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

import { PatternInfo } from "../../src/shared/obj-bin-transform.js";

const axialPatternIR = [
  "RadialAxial",
  "axial",
  [0, 0, 100, 50],
  [
    [0, "#ff0000"],
    [0.5, "#00ff00"],
    [1, "#0000ff"],
  ],
  [10, 20],
  [90, 40],
  null,
  null,
];

const radialPatternIR = [
  "RadialAxial",
  "radial",
  [5, 5, 95, 45],
  [
    [0, "#ffff00"],
    [0.3, "#ff00ff"],
    [0.7, "#00ffff"],
    [1, "#ffffff"],
  ],
  [25, 25],
  [75, 35],
  5,
  25,
];

const meshPatternIR = [
  "Mesh",
  4,
  new Float32Array([
    0, 0, 50, 0, 100, 0, 0, 50, 50, 50, 100, 50, 0, 100, 50, 100, 100, 100,
  ]),
  new Uint8Array([
    255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 128, 128, 128, 255, 0, 255, 0,
    255, 255, 255, 128, 0, 128, 0, 128,
  ]),
  [
    {
      type: "triangles",
      coords: new Int32Array([0, 2, 4, 6, 8, 10, 12, 14, 16]),
      colors: new Int32Array([0, 2, 4, 6, 8, 10, 12, 14, 16]),
    },
    {
      type: "lattice",
      coords: new Int32Array([0, 2, 4, 6, 8, 10]),
      colors: new Int32Array([0, 2, 4, 6, 8, 10]),
      verticesPerRow: 3,
    },
  ],
  [0, 0, 100, 100],
  [0, 0, 100, 100],
  [128, 128, 128],
];

describe("obj-bin-transform PatternInfo", function () {
  describe("PatternInfo Axial Gradient", function () {
    it("must serialize and deserialize axial gradients correctly", function () {
      const buffer = PatternInfo.write(axialPatternIR);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);

      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[0]).toEqual("RadialAxial");
      expect(reconstructedIR[1]).toEqual("axial");
      expect(reconstructedIR[2]).toEqual([0, 0, 100, 50]);
      expect(reconstructedIR[3]).toEqual([
        [0, "#ff0000"],
        [0.5, "#00ff00"],
        [1, "#0000ff"],
      ]);
      expect(reconstructedIR[4]).toEqual([10, 20]);
      expect(reconstructedIR[5]).toEqual([90, 40]);
      expect(reconstructedIR[6]).toBeNull();
      expect(reconstructedIR[7]).toBeNull();
    });
  });

  describe("PatternInfo Radial Gradient", function () {
    it("must serialize and deserialize radial gradients correctly", function () {
      const buffer = PatternInfo.write(radialPatternIR);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);

      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[0]).toEqual("RadialAxial");
      expect(reconstructedIR[1]).toEqual("radial");
      expect(reconstructedIR[2]).toEqual([5, 5, 95, 45]);
      expect(reconstructedIR[3]).toEqual([
        [0, "#ffff00"],
        jasmine.objectContaining([jasmine.any(Number), "#ff00ff"]),
        jasmine.objectContaining([jasmine.any(Number), "#00ffff"]),
        [1, "#ffffff"],
      ]);
      expect(reconstructedIR[4]).toEqual([25, 25]);
      expect(reconstructedIR[5]).toEqual([75, 35]);
      expect(reconstructedIR[6]).toEqual(5);
      expect(reconstructedIR[7]).toEqual(25);
    });
  });

  describe("PatternInfo Mesh Patterns", function () {
    it("must serialize and deserialize mesh patterns with figures correctly", function () {
      const buffer = PatternInfo.write(meshPatternIR);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);

      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[0]).toEqual("Mesh");
      expect(reconstructedIR[1]).toEqual(4);

      expect(reconstructedIR[2]).toBeInstanceOf(Float32Array);
      expect(Array.from(reconstructedIR[2])).toEqual(
        Array.from(meshPatternIR[2])
      );

      expect(reconstructedIR[3]).toBeInstanceOf(Uint8Array);
      expect(Array.from(reconstructedIR[3])).toEqual(
        Array.from(meshPatternIR[3])
      );
      expect(reconstructedIR[4].length).toEqual(2);

      const fig1 = reconstructedIR[4][0];
      expect(fig1.type).toEqual("triangles");
      expect(fig1.coords).toBeInstanceOf(Int32Array);
      expect(Array.from(fig1.coords)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
      expect(fig1.colors).toBeInstanceOf(Int32Array);
      expect(Array.from(fig1.colors)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
      expect(fig1.verticesPerRow).toBeUndefined();

      const fig2 = reconstructedIR[4][1];
      expect(fig2.type).toEqual("lattice");
      expect(fig2.coords).toBeInstanceOf(Int32Array);
      expect(Array.from(fig2.coords)).toEqual([0, 2, 4, 6, 8, 10]);
      expect(fig2.colors).toBeInstanceOf(Int32Array);
      expect(Array.from(fig2.colors)).toEqual([0, 2, 4, 6, 8, 10]);
      expect(fig2.verticesPerRow).toEqual(3);

      expect(reconstructedIR[5]).toEqual([0, 0, 100, 100]);
      expect(reconstructedIR[6]).toEqual([0, 0, 100, 100]);
      expect(reconstructedIR[7]).toBeInstanceOf(Uint8Array);
      expect(Array.from(reconstructedIR[7])).toEqual([128, 128, 128]);
    });

    it("must handle mesh patterns with no figures", function () {
      const noFiguresIR = [
        "Mesh",
        4,
        new Float32Array([0, 0, 10, 10]),
        new Uint8Array([255, 0, 0]),
        [],
        [0, 0, 10, 10],
        [0, 0, 10, 10],
        null,
      ];

      const buffer = PatternInfo.write(noFiguresIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[4]).toEqual([]);
      expect(reconstructedIR[7]).toBeNull(); // background should be null
    });

    it("must preserve figure data integrity across serialization", function () {
      const buffer = PatternInfo.write(meshPatternIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      // Verify data integrity by checking exact values
      const originalFig = meshPatternIR[4][0];
      const reconstructedFig = reconstructedIR[4][0];

      for (let i = 0; i < originalFig.coords.length; i++) {
        expect(reconstructedFig.coords[i]).toEqual(originalFig.coords[i]);
      }

      for (let i = 0; i < originalFig.colors.length; i++) {
        expect(reconstructedFig.colors[i]).toEqual(originalFig.colors[i]);
      }
    });
  });

  describe("PatternInfo Buffer Size Calculations", function () {
    it("must calculate correct buffer sizes for different pattern types", function () {
      const axialBuffer = PatternInfo.write(axialPatternIR);
      const radialBuffer = PatternInfo.write(radialPatternIR);
      const meshBuffer = PatternInfo.write(meshPatternIR);

      expect(axialBuffer.byteLength).toBeLessThan(radialBuffer.byteLength);
      expect(meshBuffer.byteLength).toBeGreaterThan(axialBuffer.byteLength);
      expect(meshBuffer.byteLength).toBeGreaterThan(radialBuffer.byteLength);
    });

    it("must handle empty color stops correctly", function () {
      const emptyStopsIR = [...axialPatternIR];
      emptyStopsIR[3] = [];

      const buffer = PatternInfo.write(emptyStopsIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[3]).toEqual([]);
    });

    it("must handle figures with different type strings correctly", function () {
      const customFiguresIR = [
        "Mesh",
        6,
        new Float32Array([0, 0, 10, 10]),
        new Uint8Array([255, 128, 64]),
        [
          {
            type: "patch",
            coords: new Int32Array([0, 2]),
            colors: new Int32Array([0, 2]),
          },
          {
            type: "custom-figure-type",
            coords: new Int32Array([0]),
            colors: new Int32Array([0]),
          },
        ],
        [0, 0, 10, 10],
        null,
        null,
      ];

      const buffer = PatternInfo.write(customFiguresIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[4].length).toEqual(2);
      expect(reconstructedIR[4][0].type).toEqual("patch");
      expect(reconstructedIR[4][1].type).toEqual("custom-figure-type");
    });

    it("must handle mesh patterns with different background values", function () {
      const meshWithBgIR = [
        "Mesh",
        4,
        new Float32Array([0, 0, 10, 10]),
        new Uint8Array([255, 0, 0]),
        [],
        [0, 0, 10, 10],
        [0, 0, 10, 10],
        new Uint8Array([255, 128, 64]),
      ];

      const buffer = PatternInfo.write(meshWithBgIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[7]).toBeInstanceOf(Uint8Array);
      expect(Array.from(reconstructedIR[7])).toEqual([255, 128, 64]);
      const meshNoBgIR = [
        "Mesh",
        5,
        new Float32Array([0, 0, 5, 5]),
        new Uint8Array([0, 255, 0]),
        [],
        [0, 0, 5, 5],
        null,
        null,
      ];

      const buffer2 = PatternInfo.write(meshNoBgIR);
      const patternInfo2 = new PatternInfo(buffer2);
      const reconstructedIR2 = patternInfo2.getIR();

      expect(reconstructedIR2[7]).toBeNull();
    });

    it("must calculate bounds correctly from coordinates", function () {
      const customMeshIR = [
        "Mesh",
        4,
        new Float32Array([-10, -5, 20, 15, 0, 30]),
        new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]),
        [],
        null,
        null,
        null,
      ];

      const buffer = PatternInfo.write(customMeshIR);
      const patternInfo = new PatternInfo(buffer);
      const reconstructedIR = patternInfo.getIR();

      expect(reconstructedIR[5]).toEqual([-10, -5, 20, 30]);
      expect(reconstructedIR[7]).toBeNull();
    });
  });
});
