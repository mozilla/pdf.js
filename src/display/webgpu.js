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

import { MeshFigureType } from "../shared/util.js";

// WGSL shader for Gouraud-shaded triangle mesh rasterization.
// Vertices arrive in PDF content-space coordinates; the vertex shader
// applies the affine transform supplied via a uniform buffer to map them
// to NDC (X: -1..1 left→right, Y: -1..1 bottom→top).
// Colors are delivered as unorm8x4 (r,g,b,_) and passed through as-is.
const MESH_WGSL = /* wgsl */ `
struct Uniforms {
  offsetX      : f32,
  offsetY      : f32,
  scaleX       : f32,
  scaleY       : f32,
  paddedWidth  : f32,
  paddedHeight : f32,
  borderSize   : f32,
  _pad         : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertexInput {
  @location(0) position : vec2<f32>,
  @location(1) color    : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0)       color    : vec3<f32>,
};

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  let cx = (in.position.x + u.offsetX) * u.scaleX;
  let cy = (in.position.y + u.offsetY) * u.scaleY;
  out.position = vec4<f32>(
    ((cx + u.borderSize) / u.paddedWidth) * 2.0 - 1.0,
    1.0 - ((cy + u.borderSize) / u.paddedHeight) * 2.0,
    0.0,
    1.0
  );
  out.color = in.color.rgb;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
`;

class WebGPU {
  #initPromise = null;

  #device = null;

  #meshPipeline = null;

  // Format chosen to match the OffscreenCanvas swapchain on this device.
  #preferredFormat = null;

  // Per-shader pipeline cache for compiled PostScript function shaders.
  // Key: WGSL source string.  Value: GPURenderPipeline.
  #psFunctionPipelines = new Map();

  async #initGPU() {
    if (!globalThis.navigator?.gpu) {
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return false;
      }
      this.#preferredFormat = navigator.gpu.getPreferredCanvasFormat();
      this.#device = await adapter.requestDevice();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start GPU initialization.
   * @returns {Promise<boolean>}  true when a GPU device is available.
   */
  init() {
    return (this.#initPromise ||= this.#initGPU());
  }

  get isReady() {
    return this.#device !== null;
  }

  /**
   * Compile (and cache) the Gouraud-mesh pipeline.
   */
  loadMeshShader() {
    if (!this.#device || this.#meshPipeline) {
      return;
    }
    const shaderModule = this.#device.createShaderModule({ code: MESH_WGSL });
    this.#meshPipeline = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            // Buffer 0: PDF content-space coords, 2 × float32 per vertex.
            arrayStride: 2 * 4,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            // Buffer 1: vertex colors, 4 × unorm8 per vertex (r, g, b, _).
            arrayStride: 4,
            attributes: [{ shaderLocation: 1, offset: 0, format: "unorm8x4" }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        // Use the canvas-preferred format so the OffscreenCanvas swapchain
        // and the pipeline output format always agree.
        targets: [{ format: this.#preferredFormat }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  /**
   * Build flat Float32Array (positions) and Uint8Array (colors) vertex
   * streams for non-indexed triangle-list rendering.
   *
   * Coords and colors intentionally use separate lookup indices.  For patch
   * mesh figures (types 6/7 converted to LATTICE in the worker), the coord
   * index-space and color index-space differ because the stream interleaves
   * them at different densities (12 coords but 4 colors per flag-0 patch).
   * A single shared index buffer cannot represent both simultaneously, so we
   * expand each triangle vertex individually into the two flat streams.
   *
   * @param {Array}  figures
   * @param {Object} context  coords/colors/offsetX/offsetY/scaleX/scaleY
   * @returns {{ posData: Float32Array, colData: Uint8Array,
   *   vertexCount: number }}
   */
  #buildVertexStreams(figures, context) {
    const { coords, colors } = context;

    // Count vertices first so we can allocate the typed arrays exactly once.
    let vertexCount = 0;
    for (const figure of figures) {
      const ps = figure.coords;
      if (figure.type === MeshFigureType.TRIANGLES) {
        vertexCount += ps.length;
      } else if (figure.type === MeshFigureType.LATTICE) {
        const vpr = figure.verticesPerRow;
        // 2 triangles × 3 vertices per quad cell
        vertexCount += (Math.floor(ps.length / vpr) - 1) * (vpr - 1) * 6;
      }
    }

    // posData: 2 × float32 per vertex (raw PDF content-space x, y).
    // colData: 4 × uint8 per vertex (r, g, b, unused — required by unorm8x4).
    const posData = new Float32Array(vertexCount * 2);
    const colData = new Uint8Array(vertexCount * 4);
    let pOff = 0,
      cOff = 0;

    // pi and ci are raw vertex indices; coords is stride-2, colors stride-4.
    const addVertex = (pi, ci) => {
      posData[pOff++] = coords[pi * 2];
      posData[pOff++] = coords[pi * 2 + 1];
      colData[cOff++] = colors[ci * 4];
      colData[cOff++] = colors[ci * 4 + 1];
      colData[cOff++] = colors[ci * 4 + 2];
      cOff++; // alpha channel — unused in the fragment shader
    };

    for (const figure of figures) {
      const ps = figure.coords;
      const cs = figure.colors;
      if (figure.type === MeshFigureType.TRIANGLES) {
        for (let i = 0, ii = ps.length; i < ii; i += 3) {
          addVertex(ps[i], cs[i]);
          addVertex(ps[i + 1], cs[i + 1]);
          addVertex(ps[i + 2], cs[i + 2]);
        }
      } else if (figure.type === MeshFigureType.LATTICE) {
        const vpr = figure.verticesPerRow;
        const rows = Math.floor(ps.length / vpr) - 1;
        const cols = vpr - 1;
        for (let i = 0; i < rows; i++) {
          let q = i * vpr;
          for (let j = 0; j < cols; j++, q++) {
            // Upper-left triangle:  q, q+1, q+vpr
            addVertex(ps[q], cs[q]);
            addVertex(ps[q + 1], cs[q + 1]);
            addVertex(ps[q + vpr], cs[q + vpr]);
            // Lower-right triangle: q+vpr+1, q+1, q+vpr
            addVertex(ps[q + vpr + 1], cs[q + vpr + 1]);
            addVertex(ps[q + 1], cs[q + 1]);
            addVertex(ps[q + vpr], cs[q + vpr]);
          }
        }
      }
    }

    return { posData, colData, vertexCount };
  }

  /**
   * Render a mesh shading to an ImageBitmap using WebGPU.
   *
   * Two flat vertex streams (positions and colors) are uploaded from the
   * packed IR typed arrays. A uniform buffer carries the affine transform
   * so the vertex shader maps PDF content-space coordinates to NDC without
   * any CPU arithmetic per vertex.
   *
   * After `device.queue.submit()`, `transferToImageBitmap()` presents the
   * current GPU frame synchronously – the browser ensures all submitted GPU
   * commands are complete before returning.  The resulting ImageBitmap stays
   * GPU-resident; `ctx2d.drawImage(bitmap)` is a zero-copy GPU-to-GPU blit.
   *
   * The GPU device must already be initialized (`this.isReady === true`).
   *
   * @param {Array} figures
   * @param {Object} context coords/colors/offsetX/offsetY/…
   * @param {Uint8Array|null} backgroundColor  [r,g,b] or null for transparent
   * @param {number} paddedWidth  render-target width
   * @param {number} paddedHeight render-target height
   * @param {number} borderSize  transparent border size in pixels
   * @returns {ImageBitmap}
   */
  draw(
    figures,
    context,
    backgroundColor,
    paddedWidth,
    paddedHeight,
    borderSize
  ) {
    // Lazily compile the mesh pipeline the first time we need to draw.
    this.loadMeshShader();

    const device = this.#device;
    const { offsetX, offsetY, scaleX, scaleY } = context;
    const { posData, colData, vertexCount } = this.#buildVertexStreams(
      figures,
      context
    );

    // Upload vertex positions (raw PDF coords) and colors as separate buffers.
    // GPUBufferUsage requires size > 0.
    const posBuffer = device.createBuffer({
      size: Math.max(posData.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (posData.byteLength > 0) {
      device.queue.writeBuffer(posBuffer, 0, posData);
    }

    const colBuffer = device.createBuffer({
      size: Math.max(colData.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (colData.byteLength > 0) {
      device.queue.writeBuffer(colBuffer, 0, colData);
    }

    // Uniform buffer: affine transform parameters for the vertex shader.
    const uniformBuffer = device.createBuffer({
      size: 8 * 4, // 8 × float32 = 32 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([
        offsetX,
        offsetY,
        scaleX,
        scaleY,
        paddedWidth,
        paddedHeight,
        borderSize,
        0, // padding to 32 bytes
      ])
    );

    const bindGroup = device.createBindGroup({
      layout: this.#meshPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // The canvas covers the full padded area so the border is naturally clear.
    const offscreen = new OffscreenCanvas(paddedWidth, paddedHeight);
    const gpuCtx = offscreen.getContext("webgpu");
    gpuCtx.configure({
      device,
      format: this.#preferredFormat,
      // "premultiplied" allows fully transparent border pixels when there is
      // no backgroundColor; "opaque" is slightly more efficient otherwise.
      alphaMode: backgroundColor ? "opaque" : "premultiplied",
    });

    const clearValue = backgroundColor
      ? {
          r: backgroundColor[0] / 255,
          g: backgroundColor[1] / 255,
          b: backgroundColor[2] / 255,
          a: 1,
        }
      : { r: 0, g: 0, b: 0, a: 0 };

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuCtx.getCurrentTexture().createView(),
          clearValue,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (vertexCount > 0) {
      renderPass.setPipeline(this.#meshPipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.setVertexBuffer(0, posBuffer);
      renderPass.setVertexBuffer(1, colBuffer);
      renderPass.draw(vertexCount);
    }
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    posBuffer.destroy();
    colBuffer.destroy();
    uniformBuffer.destroy();

    // Present the current GPU frame and capture it as an ImageBitmap.
    // The browser flushes all pending GPU commands before returning, so this
    // is synchronous from the JavaScript perspective.  The ImageBitmap is
    // GPU-resident; drawing it onto a 2D canvas is a GPU-to-GPU blit.
    return offscreen.transferToImageBitmap();
  }

  /**
   * Return (creating and caching if necessary) a render pipeline for a
   * compiled PostScript WGSL shader. The shader is expected to follow the
   * layout produced by {@link PsWgslCompiler}:
   *   @location(0) pos:   vec2f  — NDC position
   *   @location(1) coord: vec2f  — PS-domain (i, j) coordinate
   *
   * @param {string} wgslShader
   * @returns {GPURenderPipeline}
   */
  #getOrCreatePsPipeline(wgslShader) {
    let pipeline = this.#psFunctionPipelines.get(wgslShader);
    if (pipeline) {
      return pipeline;
    }
    const module = this.#device.createShaderModule({ code: wgslShader });
    pipeline = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {
            // Interleaved: [pos.x, pos.y, coord.x, coord.y] — 4 × float32.
            arrayStride: 4 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 2 * 4, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format: this.#preferredFormat }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.#psFunctionPipelines.set(wgslShader, pipeline);
    return pipeline;
  }

  /**
   * Evaluate a compiled PostScript WGSL shader over a full-canvas quad.
   *
   * `vertices` is a Float32Array with 6 vertices (2 triangles covering the
   * entire output canvas). Each vertex carries four floats:
   *   [pos.x, pos.y, coord.x, coord.y]
   * where (pos.x, pos.y) are NDC coordinates in [−1, 1]² and
   * (coord.x, coord.y) are the PostScript-domain (i, j) values that the
   * fragment shader should evaluate. The GPU interpolates (coord) linearly
   * across the quad so every fragment receives its correct domain coordinate.
   *
   * @param {string}         wgslShader
   * @param {Float32Array}   vertices      6 × 4 floats
   * @param {number}         paddedWidth
   * @param {number}         paddedHeight
   * @param {Uint8Array|null} backgroundColor  [r,g,b] or null
   * @returns {ImageBitmap}
   */
  drawPsFunction(
    wgslShader,
    vertices,
    paddedWidth,
    paddedHeight,
    backgroundColor
  ) {
    const device = this.#device;
    const pipeline = this.#getOrCreatePsPipeline(wgslShader);

    const vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    const offscreen = new OffscreenCanvas(paddedWidth, paddedHeight);
    const gpuCtx = offscreen.getContext("webgpu");
    gpuCtx.configure({
      device,
      format: this.#preferredFormat,
      alphaMode: backgroundColor ? "opaque" : "premultiplied",
    });

    const clearValue = backgroundColor
      ? {
          r: backgroundColor[0] / 255,
          g: backgroundColor[1] / 255,
          b: backgroundColor[2] / 255,
          a: 1,
        }
      : { r: 0, g: 0, b: 0, a: 0 };

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuCtx.getCurrentTexture().createView(),
          clearValue,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(pipeline);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.draw(6); // 6 vertices = 2 triangles covering the full quad
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    vertexBuffer.destroy();

    return offscreen.transferToImageBitmap();
  }
}

const _webGPU = new WebGPU();

/**
 * Start GPU initialization as early as possible.
 * @returns {Promise<boolean>}  true if a GPU device was acquired.
 */
function initGPU() {
  return _webGPU.init();
}

function isGPUReady() {
  return _webGPU.isReady;
}

/**
 * Pre-compile the Gouraud-mesh WGSL pipeline.
 */
function loadMeshShader() {
  _webGPU.loadMeshShader();
}

function drawMeshWithGPU(
  figures,
  context,
  backgroundColor,
  paddedWidth,
  paddedHeight,
  borderSize
) {
  return _webGPU.draw(
    figures,
    context,
    backgroundColor,
    paddedWidth,
    paddedHeight,
    borderSize
  );
}

function drawPsFunctionWithGPU(
  wgslShader,
  vertices,
  paddedWidth,
  paddedHeight,
  backgroundColor
) {
  return _webGPU.drawPsFunction(
    wgslShader,
    vertices,
    paddedWidth,
    paddedHeight,
    backgroundColor
  );
}

export {
  drawMeshWithGPU,
  drawPsFunctionWithGPU,
  initGPU,
  isGPUReady,
  loadMeshShader,
};
