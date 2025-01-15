/* Copyright 2012 Mozilla Foundation
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
  assert,
  FeatureTest,
  FormatError,
  ImageKind,
  warn,
} from "../shared/util.js";
import {
  convertBlackAndWhiteToRGBA,
  convertToRGBA,
} from "../shared/image_utils.js";
import { BaseStream } from "./base_stream.js";
import { ColorSpace } from "./colorspace.js";
import { DecodeStream } from "./decode_stream.js";
import { ImageResizer } from "./image_resizer.js";
import { JpegStream } from "./jpeg_stream.js";
import { JpxImage } from "./jpx.js";
import { Name } from "./primitives.js";

/**
 * Decode and clamp a value. The formula is different from the spec because we
 * don't decode to float range [0,1], we decode it in the [0,max] range.
 */
function decodeAndClamp(value, addend, coefficient, max) {
  value = addend + value * coefficient;
  // Clamp the value to the range
  if (value < 0) {
    value = 0;
  } else if (value > max) {
    value = max;
  }
  return value;
}

/**
 * Resizes an image mask with 1 component.
 * @param {TypedArray} src - The source buffer.
 * @param {number} bpc - Number of bits per component.
 * @param {number} w1 - Original width.
 * @param {number} h1 - Original height.
 * @param {number} w2 - New width.
 * @param {number} h2 - New height.
 * @returns {TypedArray} The resized image mask buffer.
 */
function resizeImageMask(src, bpc, w1, h1, w2, h2) {
  const length = w2 * h2;
  let dest;
  if (bpc <= 8) {
    dest = new Uint8Array(length);
  } else if (bpc <= 16) {
    dest = new Uint16Array(length);
  } else {
    dest = new Uint32Array(length);
  }
  const xRatio = w1 / w2;
  const yRatio = h1 / h2;
  let i,
    j,
    py,
    newIndex = 0,
    oldIndex;
  const xScaled = new Uint16Array(w2);
  const w1Scanline = w1;

  for (i = 0; i < w2; i++) {
    xScaled[i] = Math.floor(i * xRatio);
  }
  for (i = 0; i < h2; i++) {
    py = Math.floor(i * yRatio) * w1Scanline;
    for (j = 0; j < w2; j++) {
      oldIndex = py + xScaled[j];
      dest[newIndex++] = src[oldIndex];
    }
  }
  return dest;
}

class PDFImage {
  constructor({
    xref,
    res,
    image,
    isInline = false,
    smask = null,
    mask = null,
    isMask = false,
    pdfFunctionFactory,
    localColorSpaceCache,
  }) {
    this.image = image;
    const dict = image.dict;

    const filter = dict.get("F", "Filter");
    let filterName;
    if (filter instanceof Name) {
      filterName = filter.name;
    } else if (Array.isArray(filter)) {
      const filterZero = xref.fetchIfRef(filter[0]);
      if (filterZero instanceof Name) {
        filterName = filterZero.name;
      }
    }
    switch (filterName) {
      case "JPXDecode":
        ({
          width: image.width,
          height: image.height,
          componentsCount: image.numComps,
          bitsPerComponent: image.bitsPerComponent,
        } = JpxImage.parseImageProperties(image.stream));
        image.stream.reset();
        this.jpxDecoderOptions = {
          numComponents: 0,
          isIndexedColormap: false,
          smaskInData: dict.has("SMaskInData"),
        };
        break;
      case "JBIG2Decode":
        image.bitsPerComponent = 1;
        image.numComps = 1;
        break;
    }

    let width = dict.get("W", "Width");
    let height = dict.get("H", "Height");

    if (
      Number.isInteger(image.width) &&
      image.width > 0 &&
      Number.isInteger(image.height) &&
      image.height > 0 &&
      (image.width !== width || image.height !== height)
    ) {
      warn(
        "PDFImage - using the Width/Height of the image data, " +
          "rather than the image dictionary."
      );
      width = image.width;
      height = image.height;
    }
    if (width < 1 || height < 1) {
      throw new FormatError(
        `Invalid image width: ${width} or height: ${height}`
      );
    }
    this.width = width;
    this.height = height;

    this.interpolate = dict.get("I", "Interpolate");
    this.imageMask = dict.get("IM", "ImageMask") || false;
    this.matte = dict.get("Matte") || false;

    let bitsPerComponent = image.bitsPerComponent;
    if (!bitsPerComponent) {
      bitsPerComponent = dict.get("BPC", "BitsPerComponent");
      if (!bitsPerComponent) {
        if (this.imageMask) {
          bitsPerComponent = 1;
        } else {
          throw new FormatError(
            `Bits per component missing in image: ${this.imageMask}`
          );
        }
      }
    }
    this.bpc = bitsPerComponent;

    if (!this.imageMask) {
      let colorSpace = dict.getRaw("CS") || dict.getRaw("ColorSpace");
      const hasColorSpace = !!colorSpace;
      if (!hasColorSpace) {
        if (this.jpxDecoderOptions) {
          colorSpace = Name.get("DeviceRGBA");
        } else {
          switch (image.numComps) {
            case 1:
              colorSpace = Name.get("DeviceGray");
              break;
            case 3:
              colorSpace = Name.get("DeviceRGB");
              break;
            case 4:
              colorSpace = Name.get("DeviceCMYK");
              break;
            default:
              throw new Error(
                `Images with ${image.numComps} color components not supported.`
              );
          }
        }
      } else if (this.jpxDecoderOptions?.smaskInData) {
        // If the jpx image has a color space then it mustn't be used in order
        // to be able to use the color space that comes from the pdf.
        colorSpace = Name.get("DeviceRGBA");
      }

      this.colorSpace = ColorSpace.parse({
        cs: colorSpace,
        xref,
        resources: isInline ? res : null,
        pdfFunctionFactory,
        localColorSpaceCache,
      });
      this.numComps = this.colorSpace.numComps;

      if (this.jpxDecoderOptions) {
        this.jpxDecoderOptions.numComponents = hasColorSpace
          ? this.numComps
          : 0;
        // If the jpx image has a color space then it musn't be used in order to
        // be able to use the color space that comes from the pdf.
        this.jpxDecoderOptions.isIndexedColormap =
          this.colorSpace.name === "Indexed";
      }
    }

    this.decode = dict.getArray("D", "Decode");
    this.needsDecode = false;
    if (
      this.decode &&
      ((this.colorSpace &&
        !this.colorSpace.isDefaultDecode(this.decode, bitsPerComponent)) ||
        (isMask &&
          !ColorSpace.isDefaultDecode(this.decode, /* numComps = */ 1)))
    ) {
      this.needsDecode = true;
      // Do some preprocessing to avoid more math.
      const max = (1 << bitsPerComponent) - 1;
      this.decodeCoefficients = [];
      this.decodeAddends = [];
      const isIndexed = this.colorSpace?.name === "Indexed";
      for (let i = 0, j = 0; i < this.decode.length; i += 2, ++j) {
        const dmin = this.decode[i];
        const dmax = this.decode[i + 1];
        this.decodeCoefficients[j] = isIndexed
          ? (dmax - dmin) / max
          : dmax - dmin;
        this.decodeAddends[j] = isIndexed ? dmin : max * dmin;
      }
    }

    if (smask) {
      this.smask = new PDFImage({
        xref,
        res,
        image: smask,
        isInline,
        pdfFunctionFactory,
        localColorSpaceCache,
      });
    } else if (mask) {
      if (mask instanceof BaseStream) {
        const maskDict = mask.dict,
          imageMask = maskDict.get("IM", "ImageMask");
        if (!imageMask) {
          warn("Ignoring /Mask in image without /ImageMask.");
        } else {
          this.mask = new PDFImage({
            xref,
            res,
            image: mask,
            isInline,
            isMask: true,
            pdfFunctionFactory,
            localColorSpaceCache,
          });
        }
      } else {
        // Color key mask (just an array).
        this.mask = mask;
      }
    }
  }

  /**
   * Handles processing of image data and returns the Promise that is resolved
   * with a PDFImage when the image is ready to be used.
   */
  static async buildImage({
    xref,
    res,
    image,
    isInline = false,
    pdfFunctionFactory,
    localColorSpaceCache,
  }) {
    const imageData = image;
    let smaskData = null;
    let maskData = null;

    const smask = image.dict.get("SMask");
    const mask = image.dict.get("Mask");

    if (smask) {
      if (smask instanceof BaseStream) {
        smaskData = smask;
      } else {
        warn("Unsupported /SMask format.");
      }
    } else if (mask) {
      if (mask instanceof BaseStream || Array.isArray(mask)) {
        maskData = mask;
      } else {
        warn("Unsupported /Mask format.");
      }
    }

    return new PDFImage({
      xref,
      res,
      image: imageData,
      isInline,
      smask: smaskData,
      mask: maskData,
      pdfFunctionFactory,
      localColorSpaceCache,
    });
  }

  static createRawMask({
    imgArray,
    width,
    height,
    imageIsFromDecodeStream,
    inverseDecode,
    interpolate,
  }) {
    // |imgArray| might not contain full data for every pixel of the mask, so
    // we need to distinguish between |computedLength| and |actualLength|.
    // In particular, if inverseDecode is true, then the array we return must
    // have a length of |computedLength|.

    const computedLength = ((width + 7) >> 3) * height;
    const actualLength = imgArray.byteLength;
    const haveFullData = computedLength === actualLength;
    let data, i;

    if (imageIsFromDecodeStream && (!inverseDecode || haveFullData)) {
      // imgArray came from a DecodeStream and its data is in an appropriate
      // form, so we can just transfer it.
      data = imgArray;
    } else if (!inverseDecode) {
      data = new Uint8Array(imgArray);
    } else {
      data = new Uint8Array(computedLength);
      data.set(imgArray);
      data.fill(0xff, actualLength);
    }

    // If necessary, invert the original mask data (but not any extra we might
    // have added above). It's safe to modify the array -- whether it's the
    // original or a copy, we're about to transfer it anyway, so nothing else
    // in this thread can be relying on its contents.
    if (inverseDecode) {
      for (i = 0; i < actualLength; i++) {
        data[i] ^= 0xff;
      }
    }

    return { data, width, height, interpolate };
  }

  static async createMask({
    imgArray,
    width,
    height,
    imageIsFromDecodeStream,
    inverseDecode,
    interpolate,
    isOffscreenCanvasSupported = false,
  }) {
    const isSingleOpaquePixel =
      width === 1 &&
      height === 1 &&
      inverseDecode === (imgArray.length === 0 || !!(imgArray[0] & 128));

    if (isSingleOpaquePixel) {
      return { isSingleOpaquePixel };
    }

    if (isOffscreenCanvasSupported) {
      if (ImageResizer.needsToBeResized(width, height)) {
        const data = new Uint8ClampedArray(width * height * 4);
        convertBlackAndWhiteToRGBA({
          src: imgArray,
          dest: data,
          width,
          height,
          nonBlackColor: 0,
          inverseDecode,
        });
        return ImageResizer.createImage({
          kind: ImageKind.RGBA_32BPP,
          data,
          width,
          height,
          interpolate,
        });
      }

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      const imgData = ctx.createImageData(width, height);
      convertBlackAndWhiteToRGBA({
        src: imgArray,
        dest: imgData.data,
        width,
        height,
        nonBlackColor: 0,
        inverseDecode,
      });

      ctx.putImageData(imgData, 0, 0);
      const bitmap = canvas.transferToImageBitmap();

      return {
        data: null,
        width,
        height,
        interpolate,
        bitmap,
      };
    }

    // Get the data almost as they're and they'll be decoded
    // just before being drawn.
    return this.createRawMask({
      imgArray,
      width,
      height,
      inverseDecode,
      imageIsFromDecodeStream,
      interpolate,
    });
  }

  get drawWidth() {
    return Math.max(this.width, this.smask?.width || 0, this.mask?.width || 0);
  }

  get drawHeight() {
    return Math.max(
      this.height,
      this.smask?.height || 0,
      this.mask?.height || 0
    );
  }

  decodeBuffer(buffer) {
    const bpc = this.bpc;
    const numComps = this.numComps;

    const decodeAddends = this.decodeAddends;
    const decodeCoefficients = this.decodeCoefficients;
    const max = (1 << bpc) - 1;
    let i, ii;

    if (bpc === 1) {
      // If the buffer needed decode that means it just needs to be inverted.
      for (i = 0, ii = buffer.length; i < ii; i++) {
        buffer[i] = +!buffer[i];
      }
      return;
    }
    let index = 0;
    for (i = 0, ii = this.width * this.height; i < ii; i++) {
      for (let j = 0; j < numComps; j++) {
        buffer[index] = decodeAndClamp(
          buffer[index],
          decodeAddends[j],
          decodeCoefficients[j],
          max
        );
        index++;
      }
    }
  }

  getComponents(buffer) {
    const bpc = this.bpc;

    // This image doesn't require any extra work.
    if (bpc === 8) {
      return buffer;
    }

    const width = this.width;
    const height = this.height;
    const numComps = this.numComps;

    const length = width * height * numComps;
    let bufferPos = 0;
    let output;
    if (bpc <= 8) {
      output = new Uint8Array(length);
    } else if (bpc <= 16) {
      output = new Uint16Array(length);
    } else {
      output = new Uint32Array(length);
    }
    const rowComps = width * numComps;

    const max = (1 << bpc) - 1;
    let i = 0,
      ii,
      buf;

    if (bpc === 1) {
      // Optimization for reading 1 bpc images.
      let mask, loop1End, loop2End;
      for (let j = 0; j < height; j++) {
        loop1End = i + (rowComps & ~7);
        loop2End = i + rowComps;

        // unroll loop for all full bytes
        while (i < loop1End) {
          buf = buffer[bufferPos++];
          output[i] = (buf >> 7) & 1;
          output[i + 1] = (buf >> 6) & 1;
          output[i + 2] = (buf >> 5) & 1;
          output[i + 3] = (buf >> 4) & 1;
          output[i + 4] = (buf >> 3) & 1;
          output[i + 5] = (buf >> 2) & 1;
          output[i + 6] = (buf >> 1) & 1;
          output[i + 7] = buf & 1;
          i += 8;
        }

        // handle remaining bits
        if (i < loop2End) {
          buf = buffer[bufferPos++];
          mask = 128;
          while (i < loop2End) {
            output[i++] = +!!(buf & mask);
            mask >>= 1;
          }
        }
      }
    } else {
      // The general case that handles all other bpc values.
      let bits = 0;
      buf = 0;
      for (i = 0, ii = length; i < ii; ++i) {
        if (i % rowComps === 0) {
          buf = 0;
          bits = 0;
        }

        while (bits < bpc) {
          buf = (buf << 8) | buffer[bufferPos++];
          bits += 8;
        }

        const remainingBits = bits - bpc;
        let value = buf >> remainingBits;
        if (value < 0) {
          value = 0;
        } else if (value > max) {
          value = max;
        }
        output[i] = value;
        buf &= (1 << remainingBits) - 1;
        bits = remainingBits;
      }
    }
    return output;
  }

  async fillOpacity(rgbaBuf, width, height, actualHeight, image) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        rgbaBuf instanceof Uint8ClampedArray,
        'PDFImage.fillOpacity: Unsupported "rgbaBuf" type.'
      );
    }
    const smask = this.smask;
    const mask = this.mask;
    let alphaBuf, sw, sh, i, ii, j;

    if (smask) {
      sw = smask.width;
      sh = smask.height;
      alphaBuf = new Uint8ClampedArray(sw * sh);
      await smask.fillGrayBuffer(alphaBuf);
      if (sw !== width || sh !== height) {
        alphaBuf = resizeImageMask(alphaBuf, smask.bpc, sw, sh, width, height);
      }
    } else if (mask) {
      if (mask instanceof PDFImage) {
        sw = mask.width;
        sh = mask.height;
        alphaBuf = new Uint8ClampedArray(sw * sh);
        mask.numComps = 1;
        await mask.fillGrayBuffer(alphaBuf);

        // Need to invert values in rgbaBuf
        for (i = 0, ii = sw * sh; i < ii; ++i) {
          alphaBuf[i] = 255 - alphaBuf[i];
        }

        if (sw !== width || sh !== height) {
          alphaBuf = resizeImageMask(alphaBuf, mask.bpc, sw, sh, width, height);
        }
      } else if (Array.isArray(mask)) {
        // Color key mask: if any of the components are outside the range
        // then they should be painted.
        alphaBuf = new Uint8ClampedArray(width * height);
        const numComps = this.numComps;
        for (i = 0, ii = width * height; i < ii; ++i) {
          let opacity = 0;
          const imageOffset = i * numComps;
          for (j = 0; j < numComps; ++j) {
            const color = image[imageOffset + j];
            const maskOffset = j * 2;
            if (color < mask[maskOffset] || color > mask[maskOffset + 1]) {
              opacity = 255;
              break;
            }
          }
          alphaBuf[i] = opacity;
        }
      } else {
        throw new FormatError("Unknown mask format.");
      }
    }

    if (alphaBuf) {
      for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
        rgbaBuf[j] = alphaBuf[i];
      }
    } else {
      // No mask.
      for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
        rgbaBuf[j] = 255;
      }
    }
  }

  undoPreblend(buffer, width, height) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        buffer instanceof Uint8ClampedArray,
        'PDFImage.undoPreblend: Unsupported "buffer" type.'
      );
    }
    const matte = this.smask?.matte;
    if (!matte) {
      return;
    }
    const matteRgb = this.colorSpace.getRgb(matte, 0);
    const matteR = matteRgb[0];
    const matteG = matteRgb[1];
    const matteB = matteRgb[2];
    const length = width * height * 4;
    for (let i = 0; i < length; i += 4) {
      const alpha = buffer[i + 3];
      if (alpha === 0) {
        // according formula we have to get Infinity in all components
        // making it white (typical paper color) should be okay
        buffer[i] = 255;
        buffer[i + 1] = 255;
        buffer[i + 2] = 255;
        continue;
      }
      const k = 255 / alpha;
      buffer[i] = (buffer[i] - matteR) * k + matteR;
      buffer[i + 1] = (buffer[i + 1] - matteG) * k + matteG;
      buffer[i + 2] = (buffer[i + 2] - matteB) * k + matteB;
    }
  }

  async createImageData(forceRGBA = false, isOffscreenCanvasSupported = false) {
    const drawWidth = this.drawWidth;
    const drawHeight = this.drawHeight;
    const imgData = {
      width: drawWidth,
      height: drawHeight,
      interpolate: this.interpolate,
      kind: 0,
      data: null,
      // Other fields are filled in below.
    };

    const numComps = this.numComps;
    const originalWidth = this.width;
    const originalHeight = this.height;
    const bpc = this.bpc;

    // Rows start at byte boundary.
    const rowBytes = (originalWidth * numComps * bpc + 7) >> 3;
    const mustBeResized =
      isOffscreenCanvasSupported &&
      ImageResizer.needsToBeResized(drawWidth, drawHeight);

    if (!this.smask && !this.mask && this.colorSpace.name === "DeviceRGBA") {
      imgData.kind = ImageKind.RGBA_32BPP;
      const imgArray = (imgData.data = await this.getImageBytes(
        originalHeight * originalWidth * 4,
        {}
      ));

      if (isOffscreenCanvasSupported) {
        if (!mustBeResized) {
          return this.createBitmap(
            ImageKind.RGBA_32BPP,
            drawWidth,
            drawHeight,
            imgArray
          );
        }
        return ImageResizer.createImage(imgData, false);
      }

      return imgData;
    }

    if (!forceRGBA) {
      // If it is a 1-bit-per-pixel grayscale (i.e. black-and-white) image
      // without any complications, we pass a same-sized copy to the main
      // thread rather than expanding by 32x to RGBA form. This saves *lots*
      // of memory for many scanned documents. It's also much faster.
      //
      // Similarly, if it is a 24-bit-per pixel RGB image without any
      // complications, we avoid expanding by 1.333x to RGBA form.
      let kind;
      if (this.colorSpace.name === "DeviceGray" && bpc === 1) {
        kind = ImageKind.GRAYSCALE_1BPP;
      } else if (
        this.colorSpace.name === "DeviceRGB" &&
        bpc === 8 &&
        !this.needsDecode
      ) {
        kind = ImageKind.RGB_24BPP;
      }
      if (
        kind &&
        !this.smask &&
        !this.mask &&
        drawWidth === originalWidth &&
        drawHeight === originalHeight
      ) {
        const image = await this.#getImage(originalWidth, originalHeight);
        if (image) {
          return image;
        }
        const data = await this.getImageBytes(originalHeight * rowBytes, {});
        if (isOffscreenCanvasSupported) {
          if (mustBeResized) {
            return ImageResizer.createImage(
              {
                data,
                kind,
                width: drawWidth,
                height: drawHeight,
                interpolate: this.interpolate,
              },
              this.needsDecode
            );
          }
          return this.createBitmap(kind, originalWidth, originalHeight, data);
        }
        imgData.kind = kind;
        imgData.data = data;

        if (this.needsDecode) {
          // Invert the buffer (which must be grayscale if we reached here).
          assert(
            kind === ImageKind.GRAYSCALE_1BPP,
            "PDFImage.createImageData: The image must be grayscale."
          );
          const buffer = imgData.data;
          for (let i = 0, ii = buffer.length; i < ii; i++) {
            buffer[i] ^= 0xff;
          }
        }
        return imgData;
      }
      if (
        this.image instanceof JpegStream &&
        !this.smask &&
        !this.mask &&
        !this.needsDecode
      ) {
        let imageLength = originalHeight * rowBytes;
        if (isOffscreenCanvasSupported && !mustBeResized) {
          let isHandled = false;
          switch (this.colorSpace.name) {
            case "DeviceGray":
              // Avoid truncating the image, since `JpegImage.getData`
              // will expand the image data when `forceRGB === true`.
              imageLength *= 4;
              isHandled = true;
              break;
            case "DeviceRGB":
              imageLength = (imageLength / 3) * 4;
              isHandled = true;
              break;
            case "DeviceCMYK":
              isHandled = true;
              break;
          }

          if (isHandled) {
            const image = await this.#getImage(drawWidth, drawHeight);
            if (image) {
              return image;
            }
            const rgba = await this.getImageBytes(imageLength, {
              drawWidth,
              drawHeight,
              forceRGBA: true,
            });
            return this.createBitmap(
              ImageKind.RGBA_32BPP,
              drawWidth,
              drawHeight,
              rgba
            );
          }
        } else {
          switch (this.colorSpace.name) {
            case "DeviceGray":
              imageLength *= 3;
            /* falls through */
            case "DeviceRGB":
            case "DeviceCMYK":
              imgData.kind = ImageKind.RGB_24BPP;
              imgData.data = await this.getImageBytes(imageLength, {
                drawWidth,
                drawHeight,
                forceRGB: true,
              });
              if (mustBeResized) {
                // The image is too big so we resize it.
                return ImageResizer.createImage(imgData);
              }
              return imgData;
          }
        }
      }
    }

    const imgArray = await this.getImageBytes(originalHeight * rowBytes, {
      internal: true,
    });
    // imgArray can be incomplete (e.g. after CCITT fax encoding).
    const actualHeight =
      0 | (((imgArray.length / rowBytes) * drawHeight) / originalHeight);

    const comps = this.getComponents(imgArray);

    // If opacity data is present, use RGBA_32BPP form. Otherwise, use the
    // more compact RGB_24BPP form if allowable.
    let alpha01, maybeUndoPreblend;

    let canvas, ctx, canvasImgData, data;
    if (isOffscreenCanvasSupported && !mustBeResized) {
      canvas = new OffscreenCanvas(drawWidth, drawHeight);
      ctx = canvas.getContext("2d");
      canvasImgData = ctx.createImageData(drawWidth, drawHeight);
      data = canvasImgData.data;
    }

    imgData.kind = ImageKind.RGBA_32BPP;

    if (!forceRGBA && !this.smask && !this.mask) {
      if (!isOffscreenCanvasSupported || mustBeResized) {
        imgData.kind = ImageKind.RGB_24BPP;
        data = new Uint8ClampedArray(drawWidth * drawHeight * 3);
        alpha01 = 0;
      } else {
        const arr = new Uint32Array(data.buffer);
        arr.fill(FeatureTest.isLittleEndian ? 0xff000000 : 0x000000ff);
        alpha01 = 1;
      }
      maybeUndoPreblend = false;
    } else {
      if (!isOffscreenCanvasSupported || mustBeResized) {
        data = new Uint8ClampedArray(drawWidth * drawHeight * 4);
      }

      alpha01 = 1;
      maybeUndoPreblend = true;

      // Color key masking (opacity) must be performed before decoding.
      await this.fillOpacity(data, drawWidth, drawHeight, actualHeight, comps);
    }

    if (this.needsDecode) {
      this.decodeBuffer(comps);
    }
    this.colorSpace.fillRgb(
      data,
      originalWidth,
      originalHeight,
      drawWidth,
      drawHeight,
      actualHeight,
      bpc,
      comps,
      alpha01
    );
    if (maybeUndoPreblend) {
      this.undoPreblend(data, drawWidth, actualHeight);
    }

    if (isOffscreenCanvasSupported && !mustBeResized) {
      ctx.putImageData(canvasImgData, 0, 0);
      const bitmap = canvas.transferToImageBitmap();

      return {
        data: null,
        width: drawWidth,
        height: drawHeight,
        bitmap,
        interpolate: this.interpolate,
      };
    }

    imgData.data = data;
    if (mustBeResized) {
      return ImageResizer.createImage(imgData);
    }
    return imgData;
  }

  async fillGrayBuffer(buffer) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        buffer instanceof Uint8ClampedArray,
        'PDFImage.fillGrayBuffer: Unsupported "buffer" type.'
      );
    }
    const numComps = this.numComps;
    if (numComps !== 1) {
      throw new FormatError(
        `Reading gray scale from a color image: ${numComps}`
      );
    }

    const width = this.width;
    const height = this.height;
    const bpc = this.bpc;

    // rows start at byte boundary
    const rowBytes = (width * numComps * bpc + 7) >> 3;
    const imgArray = await this.getImageBytes(height * rowBytes, {
      internal: true,
    });

    const comps = this.getComponents(imgArray);
    let i, length;

    if (bpc === 1) {
      // inline decoding (= inversion) for 1 bpc images
      length = width * height;
      if (this.needsDecode) {
        // invert and scale to {0, 255}
        for (i = 0; i < length; ++i) {
          buffer[i] = (comps[i] - 1) & 255;
        }
      } else {
        // scale to {0, 255}
        for (i = 0; i < length; ++i) {
          buffer[i] = -comps[i] & 255;
        }
      }
      return;
    }

    if (this.needsDecode) {
      this.decodeBuffer(comps);
    }
    length = width * height;
    // we aren't using a colorspace so we need to scale the value
    const scale = 255 / ((1 << bpc) - 1);
    for (i = 0; i < length; ++i) {
      buffer[i] = scale * comps[i];
    }
  }

  createBitmap(kind, width, height, src) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    let imgData;
    if (kind === ImageKind.RGBA_32BPP) {
      imgData = new ImageData(src, width, height);
    } else {
      imgData = ctx.createImageData(width, height);
      convertToRGBA({
        kind,
        src,
        dest: new Uint32Array(imgData.data.buffer),
        width,
        height,
        inverseDecode: this.needsDecode,
      });
    }
    ctx.putImageData(imgData, 0, 0);
    const bitmap = canvas.transferToImageBitmap();

    return {
      data: null,
      width,
      height,
      bitmap,
      interpolate: this.interpolate,
    };
  }

  async #getImage(width, height) {
    const bitmap = await this.image.getTransferableImage();
    if (!bitmap) {
      return null;
    }
    return {
      data: null,
      width,
      height,
      bitmap,
      interpolate: this.interpolate,
    };
  }

  async getImageBytes(
    length,
    {
      drawWidth,
      drawHeight,
      forceRGBA = false,
      forceRGB = false,
      internal = false,
    }
  ) {
    this.image.reset();
    this.image.drawWidth = drawWidth || this.width;
    this.image.drawHeight = drawHeight || this.height;
    this.image.forceRGBA = !!forceRGBA;
    this.image.forceRGB = !!forceRGB;
    const imageBytes = await this.image.getImageData(
      length,
      this.jpxDecoderOptions
    );

    // If imageBytes came from a DecodeStream, we're safe to transfer it
    // (and thus detach its underlying buffer) because it will constitute
    // the entire DecodeStream's data.  But if it came from a Stream, we
    // need to copy it because it'll only be a portion of the Stream's
    // data, and the rest will be read later on.
    if (internal || this.image instanceof DecodeStream) {
      return imageBytes;
    }
    assert(
      imageBytes instanceof Uint8Array,
      'PDFImage.getImageBytes: Unsupported "imageBytes" type.'
    );
    return new Uint8Array(imageBytes);
  }
}

export { PDFImage };
