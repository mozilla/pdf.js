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

import { Util } from "../shared/util.js";

function percentage(value) {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Used to manage paceholder <canvas> elements that, when right-clicked on,
 * are populated with the corresponding image extracted from the PDF page.
 */
class TextLayerImages {
  #coordinates = [];

  #coordinatesByElement = new Map();

  #getPageCanvas = null;

  #minSize = 0;

  #pageWidth = 0;

  #pageHeight = 0;

  static #activeImage = null;

  constructor(minSize, coordinates, viewport, getPageCanvas) {
    this.#minSize = minSize;
    this.#coordinates = coordinates;
    this.#pageWidth = viewport.rawDims.pageWidth;
    this.#pageHeight = viewport.rawDims.pageHeight;
    this.#getPageCanvas = getPageCanvas;
  }

  render() {
    const container = document.createElement("div");
    container.className = "textLayerImages";

    for (let i = 0; i < this.#coordinates.length; i += 6) {
      const el = this.#createImagePlaceholder(
        this.#coordinates.subarray(i, i + 6)
      );
      if (el) {
        container.append(el);
      }
    }

    container.addEventListener("contextmenu", event => {
      if (!(event.target instanceof HTMLCanvasElement)) {
        return;
      }
      const imgElement = event.target;
      const coords = this.#coordinatesByElement.get(imgElement);
      if (!coords) {
        return;
      }

      const activeImage = TextLayerImages.#activeImage?.deref();
      if (activeImage === imgElement) {
        return;
      }
      if (activeImage) {
        activeImage.width = 0;
        activeImage.height = 0;
      }
      TextLayerImages.#activeImage = new WeakRef(imgElement);

      const { inverseTransform, x1, y1, width, height } = coords;

      const pageCanvas = this.#getPageCanvas();

      const imageX1 = Math.ceil(x1 * pageCanvas.width);
      const imageY1 = Math.ceil(y1 * pageCanvas.height);
      const imageX2 = Math.floor(
        (x1 + width / this.#pageWidth) * pageCanvas.width
      );
      const imageY2 = Math.floor(
        (y1 + height / this.#pageHeight) * pageCanvas.height
      );

      imgElement.width = imageX2 - imageX1;
      imgElement.height = imageY2 - imageY1;

      const ctx = imgElement.getContext("2d");
      ctx.setTransform(...inverseTransform);
      ctx.translate(-imageX1, -imageY1);
      ctx.drawImage(pageCanvas, 0, 0);
    });

    return container;
  }

  #createImagePlaceholder(
    [x1, y1, x2, y2, x3, y3] // top left, bottom left, top right
  ) {
    const width = Math.hypot(
      (x3 - x1) * this.#pageWidth,
      (y3 - y1) * this.#pageHeight
    );
    const height = Math.hypot(
      (x2 - x1) * this.#pageWidth,
      (y2 - y1) * this.#pageHeight
    );

    if (width < this.#minSize || height < this.#minSize) {
      return null;
    }

    const transform = [
      ((x3 - x1) * this.#pageWidth) / width,
      ((y3 - y1) * this.#pageHeight) / width,
      ((x2 - x1) * this.#pageWidth) / height,
      ((y2 - y1) * this.#pageHeight) / height,
      0,
      0,
    ];
    const inverseTransform = Util.inverseTransform(transform);

    const imgElement = document.createElement("canvas");
    imgElement.className = "textLayerImagePlaceholder";
    imgElement.width = 0;
    imgElement.height = 0;
    Object.assign(imgElement.style, {
      opacity: 0,
      position: "absolute",
      left: percentage(x1),
      top: percentage(y1),
      width: percentage(width / this.#pageWidth),
      height: percentage(height / this.#pageHeight),
      transformOrigin: "0% 0%",
      transform: `matrix(${transform.join(",")})`,
    });

    this.#coordinatesByElement.set(imgElement, {
      inverseTransform,
      width,
      height,
      x1,
      y1,
    });

    return imgElement;
  }
}

export { TextLayerImages };
