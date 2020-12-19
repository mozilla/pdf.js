/* Copyright 2014 Mozilla Foundation
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

import { FormatError, info, Util } from "../shared/util.js";

const ShadingIRs = {};

function applyBoundingBox(ctx, bbox) {
  if (!bbox || typeof Path2D === "undefined") {
    return;
  }
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const region = new Path2D();
  region.rect(bbox[0], bbox[1], width, height);
  ctx.clip(region);
}

ShadingIRs.RadialAxial = {
  fromIR: function RadialAxial_fromIR(raw) {
    const type = raw[1];
    const bbox = raw[2];
    const colorStops = raw[3];
    const p0 = raw[4];
    const p1 = raw[5];
    const r0 = raw[6];
    const r1 = raw[7];
    return {
      getPattern: function RadialAxial_getPattern(ctx) {
        applyBoundingBox(ctx, bbox);
        let grad;
        if (type === "axial") {
          grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
        } else if (type === "radial") {
          grad = ctx.createRadialGradient(p0[0], p0[1], r0, p1[0], p1[1], r1);
        }

        for (let i = 0, ii = colorStops.length; i < ii; ++i) {
          const c = colorStops[i];
          grad.addColorStop(c[0], c[1]);
        }
        return grad;
      },
    };
  },
};

const createMeshCanvas = (function createMeshCanvasClosure() {
  function drawTriangle(data, context, p1, p2, p3, c1, c2, c3) {
    // Very basic Gouraud-shaded triangle rasterization algorithm.
    const coords = context.coords,
      colors = context.colors;
    const bytes = data.data,
      rowSize = data.width * 4;
    let tmp;
    if (coords[p1 + 1] > coords[p2 + 1]) {
      tmp = p1;
      p1 = p2;
      p2 = tmp;
      tmp = c1;
      c1 = c2;
      c2 = tmp;
    }
    if (coords[p2 + 1] > coords[p3 + 1]) {
      tmp = p2;
      p2 = p3;
      p3 = tmp;
      tmp = c2;
      c2 = c3;
      c3 = tmp;
    }
    if (coords[p1 + 1] > coords[p2 + 1]) {
      tmp = p1;
      p1 = p2;
      p2 = tmp;
      tmp = c1;
      c1 = c2;
      c2 = tmp;
    }
    const x1 = (coords[p1] + context.offsetX) * context.scaleX;
    const y1 = (coords[p1 + 1] + context.offsetY) * context.scaleY;
    const x2 = (coords[p2] + context.offsetX) * context.scaleX;
    const y2 = (coords[p2 + 1] + context.offsetY) * context.scaleY;
    const x3 = (coords[p3] + context.offsetX) * context.scaleX;
    const y3 = (coords[p3 + 1] + context.offsetY) * context.scaleY;
    if (y1 >= y3) {
      return;
    }
    const c1r = colors[c1],
      c1g = colors[c1 + 1],
      c1b = colors[c1 + 2];
    const c2r = colors[c2],
      c2g = colors[c2 + 1],
      c2b = colors[c2 + 2];
    const c3r = colors[c3],
      c3g = colors[c3 + 1],
      c3b = colors[c3 + 2];

    const minY = Math.round(y1),
      maxY = Math.round(y3);
    let xa, car, cag, cab;
    let xb, cbr, cbg, cbb;
    for (let y = minY; y <= maxY; y++) {
      if (y < y2) {
        let k;
        if (y < y1) {
          k = 0;
        } else if (y1 === y2) {
          k = 1;
        } else {
          k = (y1 - y) / (y1 - y2);
        }
        xa = x1 - (x1 - x2) * k;
        car = c1r - (c1r - c2r) * k;
        cag = c1g - (c1g - c2g) * k;
        cab = c1b - (c1b - c2b) * k;
      } else {
        let k;
        if (y > y3) {
          k = 1;
        } else if (y2 === y3) {
          k = 0;
        } else {
          k = (y2 - y) / (y2 - y3);
        }
        xa = x2 - (x2 - x3) * k;
        car = c2r - (c2r - c3r) * k;
        cag = c2g - (c2g - c3g) * k;
        cab = c2b - (c2b - c3b) * k;
      }

      let k;
      if (y < y1) {
        k = 0;
      } else if (y > y3) {
        k = 1;
      } else {
        k = (y1 - y) / (y1 - y3);
      }
      xb = x1 - (x1 - x3) * k;
      cbr = c1r - (c1r - c3r) * k;
      cbg = c1g - (c1g - c3g) * k;
      cbb = c1b - (c1b - c3b) * k;
      const x1_ = Math.round(Math.min(xa, xb));
      const x2_ = Math.round(Math.max(xa, xb));
      let j = rowSize * y + x1_ * 4;
      for (let x = x1_; x <= x2_; x++) {
        k = (xa - x) / (xa - xb);
        if (k < 0) {
          k = 0;
        } else if (k > 1) {
          k = 1;
        }
        bytes[j++] = (car - (car - cbr) * k) | 0;
        bytes[j++] = (cag - (cag - cbg) * k) | 0;
        bytes[j++] = (cab - (cab - cbb) * k) | 0;
        bytes[j++] = 255;
      }
    }
  }

  function drawFigure(data, figure, context) {
    const ps = figure.coords;
    const cs = figure.colors;
    let i, ii;
    switch (figure.type) {
      case "lattice":
        const verticesPerRow = figure.verticesPerRow;
        const rows = Math.floor(ps.length / verticesPerRow) - 1;
        const cols = verticesPerRow - 1;
        for (i = 0; i < rows; i++) {
          let q = i * verticesPerRow;
          for (let j = 0; j < cols; j++, q++) {
            drawTriangle(
              data,
              context,
              ps[q],
              ps[q + 1],
              ps[q + verticesPerRow],
              cs[q],
              cs[q + 1],
              cs[q + verticesPerRow]
            );
            drawTriangle(
              data,
              context,
              ps[q + verticesPerRow + 1],
              ps[q + 1],
              ps[q + verticesPerRow],
              cs[q + verticesPerRow + 1],
              cs[q + 1],
              cs[q + verticesPerRow]
            );
          }
        }
        break;
      case "triangles":
        for (i = 0, ii = ps.length; i < ii; i += 3) {
          drawTriangle(
            data,
            context,
            ps[i],
            ps[i + 1],
            ps[i + 2],
            cs[i],
            cs[i + 1],
            cs[i + 2]
          );
        }
        break;
      default:
        throw new Error("illegal figure");
    }
  }

  // eslint-disable-next-line no-shadow
  function createMeshCanvas(
    bounds,
    combinesScale,
    coords,
    colors,
    figures,
    backgroundColor,
    cachedCanvases,
    webGLContext
  ) {
    // we will increase scale on some weird factor to let antialiasing take
    // care of "rough" edges
    const EXPECTED_SCALE = 1.1;
    // MAX_PATTERN_SIZE is used to avoid OOM situation.
    const MAX_PATTERN_SIZE = 3000; // 10in @ 300dpi shall be enough
    // We need to keep transparent border around our pattern for fill():
    // createPattern with 'no-repeat' will bleed edges across entire area.
    const BORDER_SIZE = 2;

    const offsetX = Math.floor(bounds[0]);
    const offsetY = Math.floor(bounds[1]);
    const boundsWidth = Math.ceil(bounds[2]) - offsetX;
    const boundsHeight = Math.ceil(bounds[3]) - offsetY;

    const width = Math.min(
      Math.ceil(Math.abs(boundsWidth * combinesScale[0] * EXPECTED_SCALE)),
      MAX_PATTERN_SIZE
    );
    const height = Math.min(
      Math.ceil(Math.abs(boundsHeight * combinesScale[1] * EXPECTED_SCALE)),
      MAX_PATTERN_SIZE
    );
    const scaleX = boundsWidth / width;
    const scaleY = boundsHeight / height;

    const context = {
      coords,
      colors,
      offsetX: -offsetX,
      offsetY: -offsetY,
      scaleX: 1 / scaleX,
      scaleY: 1 / scaleY,
    };

    const paddedWidth = width + BORDER_SIZE * 2;
    const paddedHeight = height + BORDER_SIZE * 2;

    let canvas, tmpCanvas, i, ii;
    if (webGLContext.isEnabled) {
      canvas = webGLContext.drawFigures({
        width,
        height,
        backgroundColor,
        figures,
        context,
      });
      // https://bugzilla.mozilla.org/show_bug.cgi?id=972126
      tmpCanvas = cachedCanvases.getCanvas(
        "mesh",
        paddedWidth,
        paddedHeight,
        false
      );
      tmpCanvas.context.drawImage(canvas, BORDER_SIZE, BORDER_SIZE);
      canvas = tmpCanvas.canvas;
    } else {
      tmpCanvas = cachedCanvases.getCanvas(
        "mesh",
        paddedWidth,
        paddedHeight,
        false
      );
      const tmpCtx = tmpCanvas.context;

      const data = tmpCtx.createImageData(width, height);
      if (backgroundColor) {
        const bytes = data.data;
        for (i = 0, ii = bytes.length; i < ii; i += 4) {
          bytes[i] = backgroundColor[0];
          bytes[i + 1] = backgroundColor[1];
          bytes[i + 2] = backgroundColor[2];
          bytes[i + 3] = 255;
        }
      }
      for (i = 0; i < figures.length; i++) {
        drawFigure(data, figures[i], context);
      }
      tmpCtx.putImageData(data, BORDER_SIZE, BORDER_SIZE);
      canvas = tmpCanvas.canvas;
    }

    return {
      canvas,
      offsetX: offsetX - BORDER_SIZE * scaleX,
      offsetY: offsetY - BORDER_SIZE * scaleY,
      scaleX,
      scaleY,
    };
  }
  return createMeshCanvas;
})();

ShadingIRs.Mesh = {
  fromIR: function Mesh_fromIR(raw) {
    // var type = raw[1];
    const coords = raw[2];
    const colors = raw[3];
    const figures = raw[4];
    const bounds = raw[5];
    const matrix = raw[6];
    const bbox = raw[7];
    const background = raw[8];
    return {
      getPattern: function Mesh_getPattern(ctx, owner, shadingFill) {
        applyBoundingBox(ctx, bbox);
        let scale;
        if (shadingFill) {
          scale = Util.singularValueDecompose2dScale(ctx.mozCurrentTransform);
        } else {
          // Obtain scale from matrix and current transformation matrix.
          scale = Util.singularValueDecompose2dScale(owner.baseTransform);
          if (matrix) {
            const matrixScale = Util.singularValueDecompose2dScale(matrix);
            scale = [scale[0] * matrixScale[0], scale[1] * matrixScale[1]];
          }
        }

        // Rasterizing on the main thread since sending/queue large canvases
        // might cause OOM.
        const temporaryPatternCanvas = createMeshCanvas(
          bounds,
          scale,
          coords,
          colors,
          figures,
          shadingFill ? null : background,
          owner.cachedCanvases,
          owner.webGLContext
        );

        if (!shadingFill) {
          ctx.setTransform.apply(ctx, owner.baseTransform);
          if (matrix) {
            ctx.transform.apply(ctx, matrix);
          }
        }

        ctx.translate(
          temporaryPatternCanvas.offsetX,
          temporaryPatternCanvas.offsetY
        );
        ctx.scale(temporaryPatternCanvas.scaleX, temporaryPatternCanvas.scaleY);

        return ctx.createPattern(temporaryPatternCanvas.canvas, "no-repeat");
      },
    };
  },
};

ShadingIRs.Dummy = {
  fromIR: function Dummy_fromIR() {
    return {
      getPattern: function Dummy_fromIR_getPattern() {
        return "hotpink";
      },
    };
  },
};

function getShadingPatternFromIR(raw) {
  const shadingIR = ShadingIRs[raw[0]];
  if (!shadingIR) {
    throw new Error(`Unknown IR type: ${raw[0]}`);
  }
  return shadingIR.fromIR(raw);
}

/**
 * @type {any}
 */
const TilingPattern = (function TilingPatternClosure() {
  const PaintType = {
    COLORED: 1,
    UNCOLORED: 2,
  };

  const MAX_PATTERN_SIZE = 3000; // 10in @ 300dpi shall be enough

  // eslint-disable-next-line no-shadow
  function TilingPattern(IR, color, ctx, canvasGraphicsFactory, baseTransform) {
    this.operatorList = IR[2];
    this.matrix = IR[3] || [1, 0, 0, 1, 0, 0];
    this.bbox = IR[4];
    this.xstep = IR[5];
    this.ystep = IR[6];
    this.paintType = IR[7];
    this.tilingType = IR[8];
    this.color = color;
    this.canvasGraphicsFactory = canvasGraphicsFactory;
    this.baseTransform = baseTransform;
    this.ctx = ctx;
  }

  TilingPattern.prototype = {
    createPatternCanvas: function TilinPattern_createPatternCanvas(owner) {
      const operatorList = this.operatorList;
      const bbox = this.bbox;
      const xstep = this.xstep;
      const ystep = this.ystep;
      const paintType = this.paintType;
      const tilingType = this.tilingType;
      const color = this.color;
      const canvasGraphicsFactory = this.canvasGraphicsFactory;

      info("TilingType: " + tilingType);

      // A tiling pattern as defined by PDF spec 8.7.2 is a cell whose size is
      // described by bbox, and may repeat regularly by shifting the cell by
      // xstep and ystep.
      // Because the HTML5 canvas API does not support pattern repetition with
      // gaps in between, we use the xstep/ystep instead of the bbox's size.
      //
      // This has the following consequences (similarly for ystep):
      //
      // - If xstep is the same as bbox, then there is no observable difference.
      //
      // - If xstep is larger than bbox, then the pattern canvas is partially
      //   empty: the area bounded by bbox is painted, the outside area is void.
      //
      // - If xstep is smaller than bbox, then the pixels between xstep and the
      //   bbox boundary will be missing. This is INCORRECT behavior.
      //   "Figures on adjacent tiles should not overlap" (PDF spec 8.7.3.1),
      //   but overlapping cells without common pixels are still valid.
      //   TODO: Fix the implementation, to allow this scenario to be painted
      //   correctly.

      const x0 = bbox[0],
        y0 = bbox[1],
        x1 = bbox[2],
        y1 = bbox[3];

      // Obtain scale from matrix and current transformation matrix.
      const matrixScale = Util.singularValueDecompose2dScale(this.matrix);
      const curMatrixScale = Util.singularValueDecompose2dScale(
        this.baseTransform
      );
      const combinedScale = [
        matrixScale[0] * curMatrixScale[0],
        matrixScale[1] * curMatrixScale[1],
      ];

      // Use width and height values that are as close as possible to the end
      // result when the pattern is used. Too low value makes the pattern look
      // blurry. Too large value makes it look too crispy.
      const dimx = this.getSizeAndScale(
        xstep,
        this.ctx.canvas.width,
        combinedScale[0]
      );
      const dimy = this.getSizeAndScale(
        ystep,
        this.ctx.canvas.height,
        combinedScale[1]
      );

      const tmpCanvas = owner.cachedCanvases.getCanvas(
        "pattern",
        dimx.size,
        dimy.size,
        true
      );
      const tmpCtx = tmpCanvas.context;
      const graphics = canvasGraphicsFactory.createCanvasGraphics(tmpCtx);
      graphics.groupLevel = owner.groupLevel;

      this.setFillAndStrokeStyleToContext(graphics, paintType, color);

      graphics.transform(dimx.scale, 0, 0, dimy.scale, 0, 0);

      // transform coordinates to pattern space
      graphics.transform(1, 0, 0, 1, -x0, -y0);

      this.clipBbox(graphics, bbox, x0, y0, x1, y1);

      graphics.executeOperatorList(operatorList);

      this.ctx.transform(1, 0, 0, 1, x0, y0);

      // Rescale canvas so that the ctx.createPattern call generates a pattern
      // with the desired size.
      this.ctx.scale(1 / dimx.scale, 1 / dimy.scale);
      return tmpCanvas.canvas;
    },

    getSizeAndScale: function TilingPattern_getSizeAndScale(
      step,
      realOutputSize,
      scale
    ) {
      // xstep / ystep may be negative -- normalize.
      step = Math.abs(step);
      // MAX_PATTERN_SIZE is used to avoid OOM situation.
      // Use the destination canvas's size if it is bigger than the hard-coded
      // limit of MAX_PATTERN_SIZE to avoid clipping patterns that cover the
      // whole canvas.
      const maxSize = Math.max(MAX_PATTERN_SIZE, realOutputSize);
      let size = Math.ceil(step * scale);
      if (size >= maxSize) {
        size = maxSize;
      } else {
        scale = size / step;
      }
      return { scale, size };
    },

    clipBbox: function clipBbox(graphics, bbox, x0, y0, x1, y1) {
      if (Array.isArray(bbox) && bbox.length === 4) {
        const bboxWidth = x1 - x0;
        const bboxHeight = y1 - y0;
        graphics.ctx.rect(x0, y0, bboxWidth, bboxHeight);
        graphics.clip();
        graphics.endPath();
      }
    },

    setFillAndStrokeStyleToContext: function setFillAndStrokeStyleToContext(
      graphics,
      paintType,
      color
    ) {
      const context = graphics.ctx,
        current = graphics.current;
      switch (paintType) {
        case PaintType.COLORED:
          const ctx = this.ctx;
          context.fillStyle = ctx.fillStyle;
          context.strokeStyle = ctx.strokeStyle;
          current.fillColor = ctx.fillStyle;
          current.strokeColor = ctx.strokeStyle;
          break;
        case PaintType.UNCOLORED:
          const cssColor = Util.makeHexColor(color[0], color[1], color[2]);
          context.fillStyle = cssColor;
          context.strokeStyle = cssColor;
          // Set color needed by image masks (fixes issues 3226 and 8741).
          current.fillColor = cssColor;
          current.strokeColor = cssColor;
          break;
        default:
          throw new FormatError(`Unsupported paint type: ${paintType}`);
      }
    },

    getPattern: function TilingPattern_getPattern(ctx, owner) {
      ctx = this.ctx;
      // PDF spec 8.7.2 NOTE 1: pattern's matrix is relative to initial matrix.
      ctx.setTransform.apply(ctx, this.baseTransform);
      ctx.transform.apply(ctx, this.matrix);

      const temporaryPatternCanvas = this.createPatternCanvas(owner);

      return ctx.createPattern(temporaryPatternCanvas, "repeat");
    },
  };

  return TilingPattern;
})();

export { getShadingPatternFromIR, TilingPattern };
