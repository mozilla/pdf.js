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
/* eslint-disable no-multi-str */

import { shadow } from "../shared/util.js";

class WebGLContext {
  constructor({ enable = false }) {
    this._enabled = enable === true;
  }

  get isEnabled() {
    let enabled = this._enabled;
    if (enabled) {
      enabled = WebGLUtils.tryInitGL();
    }
    return shadow(this, "isEnabled", enabled);
  }

  composeSMask({ layer, mask, properties }) {
    return WebGLUtils.composeSMask(layer, mask, properties);
  }

  drawFigures({ width, height, backgroundColor, figures, context }) {
    return WebGLUtils.drawFigures(
      width,
      height,
      backgroundColor,
      figures,
      context
    );
  }

  clear() {
    WebGLUtils.cleanup();
  }
}

const WebGLUtils = (function WebGLUtilsClosure() {
  function loadShader(gl, code, shaderType) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
      const errorMsg = gl.getShaderInfoLog(shader);
      throw new Error("Error during shader compilation: " + errorMsg);
    }
    return shader;
  }
  function createVertexShader(gl, code) {
    return loadShader(gl, code, gl.VERTEX_SHADER);
  }
  function createFragmentShader(gl, code) {
    return loadShader(gl, code, gl.FRAGMENT_SHADER);
  }
  function createProgram(gl, shaders) {
    const program = gl.createProgram();
    for (let i = 0, ii = shaders.length; i < ii; ++i) {
      gl.attachShader(program, shaders[i]);
    }
    gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      const errorMsg = gl.getProgramInfoLog(program);
      throw new Error("Error during program linking: " + errorMsg);
    }
    return program;
  }
  function createTexture(gl, image, textureId) {
    gl.activeTexture(textureId);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  let currentGL, currentCanvas;
  function generateGL() {
    if (currentGL) {
      return;
    }

    // The temporary canvas is used in the WebGL context.
    currentCanvas = document.createElement("canvas");
    currentGL = currentCanvas.getContext("webgl", {
      premultipliedalpha: false,
    });
  }

  const smaskVertexShaderCode =
    "\
  attribute vec2 a_position;                                    \
  attribute vec2 a_texCoord;                                    \
                                                                \
  uniform vec2 u_resolution;                                    \
                                                                \
  varying vec2 v_texCoord;                                      \
                                                                \
  void main() {                                                 \
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;   \
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);          \
                                                                \
    v_texCoord = a_texCoord;                                    \
  }                                                             ";

  const smaskFragmentShaderCode =
    "\
  precision mediump float;                                      \
                                                                \
  uniform vec4 u_backdrop;                                      \
  uniform int u_subtype;                                        \
  uniform sampler2D u_image;                                    \
  uniform sampler2D u_mask;                                     \
                                                                \
  varying vec2 v_texCoord;                                      \
                                                                \
  void main() {                                                 \
    vec4 imageColor = texture2D(u_image, v_texCoord);           \
    vec4 maskColor = texture2D(u_mask, v_texCoord);             \
    if (u_backdrop.a > 0.0) {                                   \
      maskColor.rgb = maskColor.rgb * maskColor.a +             \
                      u_backdrop.rgb * (1.0 - maskColor.a);     \
    }                                                           \
    float lum;                                                  \
    if (u_subtype == 0) {                                       \
      lum = maskColor.a;                                        \
    } else {                                                    \
      lum = maskColor.r * 0.3 + maskColor.g * 0.59 +            \
            maskColor.b * 0.11;                                 \
    }                                                           \
    imageColor.a *= lum;                                        \
    imageColor.rgb *= imageColor.a;                             \
    gl_FragColor = imageColor;                                  \
  }                                                             ";

  let smaskCache = null;

  function initSmaskGL() {
    generateGL();
    const canvas = currentCanvas;
    currentCanvas = null;
    const gl = currentGL;
    currentGL = null;

    // setup a GLSL program
    const vertexShader = createVertexShader(gl, smaskVertexShaderCode);
    const fragmentShader = createFragmentShader(gl, smaskFragmentShaderCode);
    const program = createProgram(gl, [vertexShader, fragmentShader]);
    gl.useProgram(program);

    const cache = {};
    cache.gl = gl;
    cache.canvas = canvas;
    cache.resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    cache.positionLocation = gl.getAttribLocation(program, "a_position");
    cache.backdropLocation = gl.getUniformLocation(program, "u_backdrop");
    cache.subtypeLocation = gl.getUniformLocation(program, "u_subtype");

    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    const texLayerLocation = gl.getUniformLocation(program, "u_image");
    const texMaskLocation = gl.getUniformLocation(program, "u_mask");

    // provide texture coordinates for the rectangle.
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(texLayerLocation, 0);
    gl.uniform1i(texMaskLocation, 1);

    smaskCache = cache;
  }

  function composeSMask(layer, mask, properties) {
    const width = layer.width,
      height = layer.height;

    if (!smaskCache) {
      initSmaskGL();
    }
    const cache = smaskCache,
      canvas = cache.canvas,
      gl = cache.gl;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(cache.resolutionLocation, width, height);

    if (properties.backdrop) {
      gl.uniform4f(
        cache.resolutionLocation,
        properties.backdrop[0],
        properties.backdrop[1],
        properties.backdrop[2],
        1
      );
    } else {
      gl.uniform4f(cache.resolutionLocation, 0, 0, 0, 0);
    }
    gl.uniform1i(
      cache.subtypeLocation,
      properties.subtype === "Luminosity" ? 1 : 0
    );

    // Create a textures
    const texture = createTexture(gl, layer, gl.TEXTURE0);
    const maskTexture = createTexture(gl, mask, gl.TEXTURE1);

    // Create a buffer and put a single clipspace rectangle in
    // it (2 triangles)
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      width, 0,
      0, height,
      0, height,
      width, 0,
      width, height]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.positionLocation);
    gl.vertexAttribPointer(cache.positionLocation, 2, gl.FLOAT, false, 0, 0);

    // draw
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.flush();

    gl.deleteTexture(texture);
    gl.deleteTexture(maskTexture);
    gl.deleteBuffer(buffer);

    return canvas;
  }

  const figuresVertexShaderCode =
    "\
  attribute vec2 a_position;                                    \
  attribute vec3 a_color;                                       \
                                                                \
  uniform vec2 u_resolution;                                    \
  uniform vec2 u_scale;                                         \
  uniform vec2 u_offset;                                        \
                                                                \
  varying vec4 v_color;                                         \
                                                                \
  void main() {                                                 \
    vec2 position = (a_position + u_offset) * u_scale;          \
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;     \
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);          \
                                                                \
    v_color = vec4(a_color / 255.0, 1.0);                       \
  }                                                             ";

  const figuresFragmentShaderCode =
    "\
  precision mediump float;                                      \
                                                                \
  varying vec4 v_color;                                         \
                                                                \
  void main() {                                                 \
    gl_FragColor = v_color;                                     \
  }                                                             ";

  let figuresCache = null;

  function initFiguresGL() {
    generateGL();
    const canvas = currentCanvas;
    currentCanvas = null;
    const gl = currentGL;
    currentGL = null;

    // setup a GLSL program
    const vertexShader = createVertexShader(gl, figuresVertexShaderCode);
    const fragmentShader = createFragmentShader(gl, figuresFragmentShaderCode);
    const program = createProgram(gl, [vertexShader, fragmentShader]);
    gl.useProgram(program);

    const cache = {};
    cache.gl = gl;
    cache.canvas = canvas;
    cache.resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    cache.scaleLocation = gl.getUniformLocation(program, "u_scale");
    cache.offsetLocation = gl.getUniformLocation(program, "u_offset");
    cache.positionLocation = gl.getAttribLocation(program, "a_position");
    cache.colorLocation = gl.getAttribLocation(program, "a_color");

    figuresCache = cache;
  }

  function drawFigures(width, height, backgroundColor, figures, context) {
    if (!figuresCache) {
      initFiguresGL();
    }
    const cache = figuresCache,
      canvas = cache.canvas,
      gl = cache.gl;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(cache.resolutionLocation, width, height);

    // count triangle points
    let count = 0;
    for (let i = 0, ii = figures.length; i < ii; i++) {
      switch (figures[i].type) {
        case "lattice":
          const rows =
            (figures[i].coords.length / figures[i].verticesPerRow) | 0;
          count += (rows - 1) * (figures[i].verticesPerRow - 1) * 6;
          break;
        case "triangles":
          count += figures[i].coords.length;
          break;
      }
    }
    // transfer data
    const coords = new Float32Array(count * 2);
    const colors = new Uint8Array(count * 3);
    const coordsMap = context.coords,
      colorsMap = context.colors;
    let pIndex = 0,
      cIndex = 0;
    for (let i = 0, ii = figures.length; i < ii; i++) {
      const figure = figures[i],
        ps = figure.coords,
        cs = figure.colors;
      switch (figure.type) {
        case "lattice":
          const cols = figure.verticesPerRow;
          const rows = (ps.length / cols) | 0;
          for (let row = 1; row < rows; row++) {
            let offset = row * cols + 1;
            for (let col = 1; col < cols; col++, offset++) {
              coords[pIndex] = coordsMap[ps[offset - cols - 1]];
              coords[pIndex + 1] = coordsMap[ps[offset - cols - 1] + 1];
              coords[pIndex + 2] = coordsMap[ps[offset - cols]];
              coords[pIndex + 3] = coordsMap[ps[offset - cols] + 1];
              coords[pIndex + 4] = coordsMap[ps[offset - 1]];
              coords[pIndex + 5] = coordsMap[ps[offset - 1] + 1];
              colors[cIndex] = colorsMap[cs[offset - cols - 1]];
              colors[cIndex + 1] = colorsMap[cs[offset - cols - 1] + 1];
              colors[cIndex + 2] = colorsMap[cs[offset - cols - 1] + 2];
              colors[cIndex + 3] = colorsMap[cs[offset - cols]];
              colors[cIndex + 4] = colorsMap[cs[offset - cols] + 1];
              colors[cIndex + 5] = colorsMap[cs[offset - cols] + 2];
              colors[cIndex + 6] = colorsMap[cs[offset - 1]];
              colors[cIndex + 7] = colorsMap[cs[offset - 1] + 1];
              colors[cIndex + 8] = colorsMap[cs[offset - 1] + 2];

              coords[pIndex + 6] = coords[pIndex + 2];
              coords[pIndex + 7] = coords[pIndex + 3];
              coords[pIndex + 8] = coords[pIndex + 4];
              coords[pIndex + 9] = coords[pIndex + 5];
              coords[pIndex + 10] = coordsMap[ps[offset]];
              coords[pIndex + 11] = coordsMap[ps[offset] + 1];
              colors[cIndex + 9] = colors[cIndex + 3];
              colors[cIndex + 10] = colors[cIndex + 4];
              colors[cIndex + 11] = colors[cIndex + 5];
              colors[cIndex + 12] = colors[cIndex + 6];
              colors[cIndex + 13] = colors[cIndex + 7];
              colors[cIndex + 14] = colors[cIndex + 8];
              colors[cIndex + 15] = colorsMap[cs[offset]];
              colors[cIndex + 16] = colorsMap[cs[offset] + 1];
              colors[cIndex + 17] = colorsMap[cs[offset] + 2];
              pIndex += 12;
              cIndex += 18;
            }
          }
          break;
        case "triangles":
          for (let j = 0, jj = ps.length; j < jj; j++) {
            coords[pIndex] = coordsMap[ps[j]];
            coords[pIndex + 1] = coordsMap[ps[j] + 1];
            colors[cIndex] = colorsMap[cs[j]];
            colors[cIndex + 1] = colorsMap[cs[j] + 1];
            colors[cIndex + 2] = colorsMap[cs[j] + 2];
            pIndex += 2;
            cIndex += 3;
          }
          break;
      }
    }

    // draw
    if (backgroundColor) {
      gl.clearColor(
        backgroundColor[0] / 255,
        backgroundColor[1] / 255,
        backgroundColor[2] / 255,
        1.0
      );
    } else {
      gl.clearColor(0, 0, 0, 0);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    const coordsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, coordsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.positionLocation);
    gl.vertexAttribPointer(cache.positionLocation, 2, gl.FLOAT, false, 0, 0);

    const colorsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(cache.colorLocation);
    gl.vertexAttribPointer(
      cache.colorLocation,
      3,
      gl.UNSIGNED_BYTE,
      false,
      0,
      0
    );

    gl.uniform2f(cache.scaleLocation, context.scaleX, context.scaleY);
    gl.uniform2f(cache.offsetLocation, context.offsetX, context.offsetY);

    gl.drawArrays(gl.TRIANGLES, 0, count);

    gl.flush();

    gl.deleteBuffer(coordsBuffer);
    gl.deleteBuffer(colorsBuffer);

    return canvas;
  }

  return {
    tryInitGL() {
      try {
        generateGL();
        return !!currentGL;
      } catch (ex) {}
      return false;
    },

    composeSMask,

    drawFigures,

    cleanup() {
      if (smaskCache?.canvas) {
        smaskCache.canvas.width = 0;
        smaskCache.canvas.height = 0;
      }
      if (figuresCache?.canvas) {
        figuresCache.canvas.width = 0;
        figuresCache.canvas.height = 0;
      }
      smaskCache = null;
      figuresCache = null;
    },
  };
})();

export { WebGLContext };
