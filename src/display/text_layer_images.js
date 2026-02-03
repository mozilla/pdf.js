import { Util } from "../shared/util.js";

function percentage(value) {
  return `${(value * 100).toFixed(2)}%`;
}

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

      if (TextLayerImages.#activeImage === imgElement) {
        return;
      }
      if (TextLayerImages.#activeImage) {
        TextLayerImages.#activeImage.width = 0;
        TextLayerImages.#activeImage.height = 0;
      }
      TextLayerImages.#activeImage = imgElement;

      const { inverseTransform, x1, y1, width, height } = coords;

      const pageCanvas = this.#getPageCanvas();

      const widthRatio = pageCanvas.width / this.#pageWidth;
      const heightRatio = pageCanvas.height / this.#pageHeight;

      imgElement.width = width * widthRatio;
      imgElement.height = height * heightRatio;
      const ctx = imgElement.getContext("2d");
      ctx.setTransform(...inverseTransform);
      ctx.translate(-x1 * pageCanvas.width, -y1 * pageCanvas.height);
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
