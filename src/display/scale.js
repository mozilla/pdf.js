import { ImageKind } from "../shared/util.js";

class ScaleJS {
  isMobile() {
    if (typeof navigator !== "undefined") {
      return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        window &&
        !window.MSStream
      );
    }
    return false;
  }

  determineScale(width, height) {
    var testColor = "#ffffff";
    var colorData = new Uint8ClampedArray(4);
    var scale = 0;
    if (typeof window !== "undefined" && this.isMobile()) {
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d");
      while (colorData[0] !== 255) {
        scale += 1;
        canvas.width = width / scale;
        canvas.height = height / scale;
        context.fillStyle = testColor;
        context.fillRect(0, 0, 1, 1);
        colorData = context.getImageData(0, 0, 1, 1).data;
      }
    }
    return scale;
  }

  // Determine if we need to scale the PDF image
  needsScale(width, height, colorSpace, bpc) {
    var scaleObj = { width, height, scale: 1, transformImage: false };

    var scale = this.determineScale(width, height);

    if (scale > 1) {
      scaleObj.transformImage = true;
      scaleObj.scale = scale;
      if (colorSpace === "DeviceGray" && bpc === 1 && scaleObj.scale > 2) {
        scaleObj.scale = 4;
      }
      scaleObj.width = Math.ceil(width / scaleObj.scale);
      scaleObj.height = Math.ceil(height / scaleObj.scale);
    }
    return scaleObj;
  }

  scaleImg(imgData) {
    if (!imgData.scaleProcessed) {
      var imgScaleObj;
      if (imgData.kind === ImageKind.GRAYSCALE_1BPP) {
        imgScaleObj = this.needsScale(
          imgData.width,
          imgData.height,
          "DeviceGray",
          1
        );
        if (imgScaleObj.transformImage) {
          imgData.kind = ImageKind.GRAYSCALE_8BPP;
          imgData.data = this.scaleBWImage(
            imgData.data,
            imgData.width,
            imgData.height,
            (imgData.width + 7) >> 3,
            imgScaleObj.scale
          );
          imgData.width = imgScaleObj.width;
          imgData.height = imgScaleObj.height;
        }
      } else if (imgData.kind === ImageKind.RGB_24BPP) {
        imgScaleObj = this.needsScale(imgData.width, imgData.height, "RGB", 1);
        if (imgScaleObj.transformImage) {
          imgData.data = this.scaleRGBImage(
            imgData.data,
            imgData.width,
            imgData.height,
            imgScaleObj.scale
          );
          imgData.width = imgScaleObj.width;
          imgData.height = imgScaleObj.height;
        }
      }
      imgData.scaleProcessed = true;
    }
    return imgData;
  }

  scaleMask(imgData) {
    if (!imgData.scaleProcessed) {
      imgData.isMaskScaled = false;
      var imgScaleObj = this.needsScale(
        imgData.width,
        imgData.height,
        "DeviceGray",
        1
      );
      if (imgScaleObj.transformImage) {
        imgData.data = this.scaleBWImage(
          imgData.data,
          imgData.width,
          imgData.height,
          (imgData.width + 7) >> 3,
          imgScaleObj.scale
        );
        imgData.width = imgScaleObj.width;
        imgData.height = imgScaleObj.height;
        imgData.isMaskScaled = true;
      }
      imgData.scaleProcessed = true;
    }
    return imgData;
  }

  // Counts the bits set in an integer
  bitCount(n) {
    var count = 0;
    while (n) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }

  /* Resize the original image in case the image array size
      is less than (originalHeight * rowBytes) */
  resizeOriginalImage(originalImage, originalHeight, rowBytes) {
    var drawImage = new Uint8ClampedArray(originalHeight * rowBytes);
    drawImage.set(originalImage);
    drawImage.fill(255, originalImage.length, originalHeight * rowBytes);
    return drawImage;
  }

  scaleMainArea(newImage, img, rowBytes, newRowBytes, stopRow, stopCol, scale) {
    /* m is a lookup tables; it maps the number of white pixels
        (that will be converted to a new pixel), with the color value
        for the new pixel */
    var m;
    // idx is the index of the new Image array
    var idx;
    // Indexes used to parse the main image area
    var row, col;

    if (scale === 2) {
      m = [0, 64, 64, 128];

      for (row = 0; row < stopRow; row += scale) {
        for (col = 0; col < stopCol; col++) {
          // Calculate the new image pixel index
          idx = (row * newRowBytes) / 2 + col * 4;
          // Calculate and set each new pixel
          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 6) & 0x03] +
            m[(img[(row + 1) * rowBytes + col] >> 6) & 0x03];

          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 4) & 0x03] +
            m[(img[(row + 1) * rowBytes + col] >> 4) & 0x03];

          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 2) & 0x03] +
            m[(img[(row + 1) * rowBytes + col] >> 2) & 0x03];

          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 0) & 0x03] +
            m[(img[(row + 1) * rowBytes + col] >> 0) & 0x03];
        }
      }
    } else if (scale === 4) {
      m = [0, 16, 16, 32, 16, 32, 32, 48, 16, 32, 32, 48, 32, 48, 48, 64];

      for (row = 0; row < stopRow; row += scale) {
        for (col = 0; col < stopCol; col++) {
          // Calculate the new image pixel index from the group
          idx = (row * newRowBytes) / 4 + col * 2;
          // Calculate and set each new pixel
          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 4) & 0x0f] +
            m[(img[(row + 1) * rowBytes + col] >> 4) & 0x0f] +
            m[(img[(row + 2) * rowBytes + col] >> 4) & 0x0f] +
            m[(img[(row + 3) * rowBytes + col] >> 4) & 0x0f];

          newImage[idx++] =
            m[(img[row * rowBytes + col] >> 0) & 0x0f] +
            m[(img[(row + 1) * rowBytes + col] >> 0) & 0x0f] +
            m[(img[(row + 2) * rowBytes + col] >> 0) & 0x0f] +
            m[(img[(row + 3) * rowBytes + col] >> 0) & 0x0f];
        }
      }
    }
  }

  // Scale Other Areas function for the B&W images scaling
  scaleOtherAreas(
    newImage,
    img,
    rowBytes,
    newRowBytes,
    startRow,
    stopRow,
    startCol,
    stopCol,
    offsetX,
    offsetY,
    scale
  ) {
    // Set the default mask
    var mask = 0x03;
    if (scale === 4) {
      mask = 0x0f;
    }

    // Set the default multiplication factors
    var multFactor = 256 / (scale * offsetY);

    // Calculate how many groups of pixels we have on the last column
    var lastColPixelGroups = Math.ceil(offsetX / scale);

    // Calculate offsetX mod and div by scale
    var offsetXMod = offsetX % scale;
    var offsetXDiv = Math.floor(offsetX / scale);

    var shiftValue, pixValue;

    /* Parse the selected image area
        (between startRow - stopRow and startCol - stopCol) */
    for (var row = startRow; row < stopRow; row += scale) {
      for (var col = startCol; col < stopCol; col++) {
        // Calculate the new image pixel index
        var idx = (row * newRowBytes) / scale + col * (8 / scale);
        // Parse a group of max scale pixels from the last column
        for (var colGroup = 0; colGroup < lastColPixelGroups; colGroup++) {
          /* Calculate the bitsShift value for the current pixels group.
              For the first scale bits will be (8 - scale) and will decrease
              in increments of scale as we move to the least significant bit */
          shiftValue = 8 - scale - scale * colGroup;
          /* If (offset % scale) != 0 and the (offset / scale) == the current
              pixels group, we have the last group of pixels. This group
              will have a different mask and multiplication factors since
              the number of pixels in the group is not standard  */
          if (offsetXMod !== 0 && offsetXDiv === colGroup) {
            if (scale === 2) {
              mask = 0x02;
            } else {
              switch (offsetXMod) {
                case 3:
                  mask = 0x0e;
                  break;
                case 2:
                  mask = 0x0c;
                  break;
                case 1:
                  mask = 0x08;
                  break;
              }
            }
            multFactor = 256 / (offsetXMod * offsetY);
          }

          // Calculate the new pixel value
          pixValue = 0;

          for (var j = 0; j < offsetY; j++) {
            pixValue +=
              this.bitCount(
                (img[(row + j) * rowBytes + col] >> shiftValue) & mask
              ) * multFactor;
          }

          // Set the new pixel value
          newImage[idx++] = pixValue;
        }
      }
    }
  }

  // Scale a B&W image
  scaleBWImage(img, originalWidth, originalHeight, rowBytes, scale) {
    var image = img;

    if (img.length < originalHeight * rowBytes) {
      image = this.resizeOriginalImage(img, originalHeight, rowBytes);
    }

    /* We only support scale by 2 or 4 for B&W images.
        However, given the fact that the image scales
        on both horizontal and vertical. The image pixels
        will decreas with a factor of 4 respectively 16. */
    if (scale !== 2 && scale !== 4) {
      scale = scale > 2 ? 4 : 2;
    }

    // Calculate the new image row bytes
    var newRowBytes = Math.ceil(originalWidth / scale);
    // Calculate the new image height
    var newHeight = Math.ceil(originalHeight / scale);
    // Allocate memory for the new image
    var newImage = new Uint8ClampedArray(newHeight * newRowBytes);

    /* Calculate offsets. If the image width is not a multiple of 8
        then we have less than 8 pixels in the last byte. These are
        special cases that we are going to address separate of the
        main area scale. If the image widht is a multiple of 8 that means
        that is a multiple of 2 or 4, so it covers the scale too.
        If the image height is not a multiple of scale then we have
        extra rows that we will have to address separate */
    var offsetX = originalWidth % 8;
    var offsetY = originalHeight % scale;

    /* Stop Row and Stop Column is the row / column pair to which the main
        image area scale will stop. While the last row of the main image area
        will be image height - the Y offset, the last column will always be 1
        for any offset, since we are reading a Byte and the offset is in bits,
        maximum X offset being 7. */
    var stopRow = originalHeight - offsetY;
    var stopCol = rowBytes - (offsetX === 0 ? 0 : 1);

    /* Below we will use two functions to scale the image.
        We are dividing the image in four quadrants:
        1. The Main Area
        2. The Extra column(s)
        3. The Extra row(s)
        4. The Bottom right corner
        We will use scaleMainArea to scale the Main Area of the image, and
        scaleOtherAreas to scale the other 3 areas of the image.
    */

    // Scaling the main area of the image
    this.scaleMainArea(
      newImage,
      image,
      rowBytes,
      newRowBytes,
      stopRow,
      stopCol,
      scale
    );

    // Scaling extra columns(s)
    if (offsetX !== 0) {
      this.scaleOtherAreas(
        newImage,
        image,
        rowBytes,
        newRowBytes,
        0,
        stopRow,
        rowBytes - 1,
        rowBytes,
        offsetX,
        scale,
        scale
      );
    }

    // Scaling extra line(s)
    if (offsetY !== 0) {
      this.scaleOtherAreas(
        newImage,
        image,
        rowBytes,
        newRowBytes,
        originalHeight - offsetY,
        originalHeight,
        0,
        stopCol,
        8,
        offsetY,
        scale
      );
    }

    // Scaling the bottom right corner
    if (offsetX !== 0 && offsetY !== 0) {
      this.scaleOtherAreas(
        newImage,
        image,
        rowBytes,
        newRowBytes,
        originalHeight - offsetY,
        originalHeight,
        rowBytes - 1,
        rowBytes,
        offsetX,
        offsetY,
        scale
      );
    }

    return newImage;
  }

  // FillArea function for the RGB images scaling
  filterArea(
    origImg,
    filteredImg,
    scale,
    rowBytes,
    newRowBytes,
    numComps,
    filterData
  ) {
    var sumR, sumG, sumB;
    var boxRow, boxCol;
    var destIdx = 0,
      srcCol,
      srcRowIdx,
      srcPixelIdx;
    var scaleByScale = filterData.rowWindow * filterData.colWindow;

    // Filter the given area of the image
    for (var row = filterData.startRow; row < filterData.endRow; row++) {
      var srcRow = row * scale;
      for (
        var col = filterData.startCol;
        col < filterData.endCol;
        col += numComps
      ) {
        destIdx = row * newRowBytes + col;
        srcCol = col * scale;
        sumR = 0;
        sumG = 0;
        sumB = 0;
        /* Get the average color of all of the pixels that are being downsized
            into one. The box of pixels will be based on the given scale. */
        for (boxRow = 0; boxRow < filterData.rowWindow; boxRow++) {
          srcRowIdx = srcCol + rowBytes * (srcRow + boxRow);
          for (boxCol = 0; boxCol < filterData.colWindow; boxCol++) {
            srcPixelIdx = srcRowIdx + numComps * boxCol;
            sumR += origImg[srcPixelIdx];
            sumG += origImg[srcPixelIdx + 1];
            sumB += origImg[srcPixelIdx + 2];
          }
        }
        filteredImg[destIdx++] = sumR / scaleByScale;
        filteredImg[destIdx++] = sumG / scaleByScale;
        filteredImg[destIdx++] = sumB / scaleByScale;
      }
    }
  }

  // Scale an RGB image
  scaleRGBImage(img, originalWidth, originalHeight, scale) {
    var drawWidth = Math.ceil(originalWidth / scale);
    var drawHeight = Math.ceil(originalHeight / scale);
    var numComps = 3; // 3 bytes per pixel (RGB)
    // Number of Bytes in a row in the original image
    var rowBytes = originalWidth * numComps;
    // Number of Bytes in a row in the new image
    var newRowBytes = drawWidth * numComps;

    var newImage = new Uint8ClampedArray(drawHeight * newRowBytes);

    // Calculate Overflow
    var overflowRowCnt = originalHeight % scale;
    // The last row index in newImage
    var overflowDestRow = overflowRowCnt > 0 ? drawHeight - 1 : originalHeight;

    var overflowColCnt = originalWidth % scale;
    // The last column index in newImage
    var overflowDestCol =
      overflowColCnt > 0 ? newRowBytes - numComps : newRowBytes;

    // Fill in Main Area
    this.filterArea(img, newImage, scale, rowBytes, newRowBytes, numComps, {
      startRow: 0,
      endRow: overflowDestRow,
      startCol: 0,
      endCol: overflowDestCol,
      rowWindow: scale,
      colWindow: scale,
    });

    // Fill in overflow row area
    if (overflowRowCnt !== 0) {
      this.filterArea(img, newImage, scale, rowBytes, newRowBytes, numComps, {
        startRow: overflowDestRow,
        endRow: drawHeight,
        startCol: 0,
        endCol: overflowDestCol,
        rowWindow: overflowRowCnt,
        colWindow: scale,
      });
    }

    // Fill in overflow column area
    if (overflowColCnt !== 0) {
      this.filterArea(img, newImage, scale, rowBytes, newRowBytes, numComps, {
        startRow: 0,
        endRow: overflowDestRow,
        startCol: overflowDestCol,
        endCol: newRowBytes,
        rowWindow: scale,
        colWindow: overflowColCnt,
      });
    }

    // Fill in overflow corner area
    if (overflowRowCnt !== 0 && overflowColCnt !== 0) {
      this.filterArea(img, newImage, scale, rowBytes, newRowBytes, numComps, {
        startRow: overflowDestRow,
        endRow: drawHeight,
        startCol: overflowDestCol,
        endCol: newRowBytes,
        rowWindow: overflowRowCnt,
        colWindow: overflowColCnt,
      });
    }

    return newImage;
  }
}

export { ScaleJS };
