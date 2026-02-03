/* Copyright 2024 Mozilla Foundation
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

import { closePages, loadAndWait } from "./test_utils.mjs";

describe("Text layer", () => {
  describe("Images", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "images.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
        undefined,
        undefined,
        { enableOptimizedPartialRendering: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should render images in the text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const images = await page.$$eval(
            `.page[data-page-number="1"] > .textLayer > .textLayerImages > canvas`,
            els => els.map(el => JSON.stringify(el.getBoundingClientRect()))
          );

          expect(images.length).withContext(`In ${browserName}`).toEqual(5);
        })
      );
    });

    it("when right-clicking an image it should get the contents", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const imageCanvas = await page.$(
            `.page[data-page-number="1"] > .textLayer > .textLayerImages > canvas`
          );

          expect(await page.evaluate(el => el.width, imageCanvas))
            .withContext(`Initial width, in ${browserName}`)
            .toBe(0);
          expect(await page.evaluate(el => el.height, imageCanvas))
            .withContext(`Initial height, in ${browserName}`)
            .toBe(0);

          await imageCanvas.click({ button: "right" });

          expect(await page.evaluate(el => el.width, imageCanvas))
            .withContext(`Final width, in ${browserName}`)
            .toBeGreaterThan(0);
          expect(await page.evaluate(el => el.height, imageCanvas))
            .withContext(`Final height, in ${browserName}`)
            .toBeGreaterThan(0);

          expect(
            await page.evaluate(el => {
              const ctx = el.getContext("2d");
              const imageData = ctx.getImageData(0, 0, el.width, el.height);
              const pixels = new Uint32Array(imageData.data.buffer);
              const firstPixel = pixels[0];
              return pixels.some(pixel => pixel !== firstPixel);
            }, imageCanvas)
          )
            .withContext(`Image is not all the same pixel, in ${browserName}`)
            .toBe(true);
        })
      );
    });

    it("the three copies of the PDF.js logo have different rotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const getRotation = async nth =>
            page.evaluate(n => {
              const canvas = document.querySelectorAll(
                `.page[data-page-number="1"] > .textLayer > .textLayerImages > canvas`
              )[n];
              const cssTransform = getComputedStyle(canvas).transform;
              if (cssTransform && cssTransform !== "none") {
                const matrixValues = cssTransform
                  .slice(7, -1)
                  .split(", ")
                  .map(parseFloat);
                return (
                  Math.atan2(matrixValues[1], matrixValues[0]) * (180 / Math.PI)
                );
              }
              return 0;
            }, nth);

          const rotation1 = await getRotation(1);
          const rotation2 = await getRotation(2);
          const rotation4 = await getRotation(4);

          expect(Math.abs(rotation1 - rotation2))
            .withContext(`Rotation between 1 and 2, in ${browserName}`)
            .toBeGreaterThan(10);
          expect(Math.abs(rotation1 - rotation4))
            .withContext(`Rotation between 1 and 4, in ${browserName}`)
            .toBeGreaterThan(10);
          expect(Math.abs(rotation2 - rotation4))
            .withContext(`Rotation between 2 and 4, in ${browserName}`)
            .toBeGreaterThan(10);
        })
      );
    });

    it("the three copies of the PDF.js logo have the same size", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const getSize = async nth =>
            page.evaluate(n => {
              const canvas = document.querySelectorAll(
                `.page[data-page-number="1"] > .textLayer > .textLayerImages > canvas`
              )[n];
              return { width: canvas.width, height: canvas.height };
            }, nth);

          const size1 = await getSize(1);
          const size2 = await getSize(2);
          const size4 = await getSize(4);

          const EPSILON = 3;

          expect(size1.width)
            .withContext(`1-2 width, in ${browserName}`)
            .toBeCloseTo(size2.width, EPSILON);
          expect(size1.height)
            .withContext(`1-2 height, in ${browserName}`)
            .toBeCloseTo(size2.height, EPSILON);

          expect(size1.width)
            .withContext(`1-4 width, in ${browserName}`)
            .toBeCloseTo(size4.width, EPSILON);
          expect(size1.height)
            .withContext(`1-4 height, in ${browserName}`)
            .toBeCloseTo(size4.height, EPSILON);
        })
      );
    });
  });
});
