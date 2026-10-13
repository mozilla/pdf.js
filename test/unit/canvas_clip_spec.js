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

import { isNodeJS, Util } from "../../src/shared/util.js";
import { CanvasGraphics } from "../../src/display/canvas.js";
import { NodeCanvasFactory } from "../../src/display/node_utils.js";

/**
 * Stroke clipping, i.e. skipping strokes that cannot produce any visible
 * pixels because the path lies entirely outside the current clip box.
 *
 * Motivation is issue 6419: to render a page into several tiles the operator
 * list is replayed once per tile, and `fill` already skipped paths that fall
 * entirely outside a tile's clip box. `stroke` did not, so every tile paid the
 * full cost of stroking all the off-tile geometry. This suite pins that
 * behaviour so it cannot silently regress.
 *
 * These tests exercise `CanvasGraphics.stroke` directly (rather than going
 * through `page.render`) because the clip box is normally driven by the
 * current canvas size; setting `minMax` by hand lets a single test express
 * "this path is off-canvas" without needing a huge document.
 */
describe("CanvasGraphics stroke clipping", function () {
  const WIDTH = 100;
  const HEIGHT = 100;

  let canvasFactory, canvasAndCtx, strokeCalls, graphics;

  function newGraphics() {
    const g = new CanvasGraphics(
      canvasAndCtx.context,
      new Map(),
      new Map(),
      canvasFactory,
      canvasFactory,
      {}
    );
    g.beginDrawing({
      viewport: { transform: [1, 0, 0, 1, 0, 0], scale: 1 },
    });
    return g;
  }

  function pathFromPoints(points) {
    const path = new Path2D();
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i][0], points[i][1]);
    }
    return path;
  }

  beforeEach(function () {
    if (isNodeJS) {
      canvasFactory = new NodeCanvasFactory({ enableHWA: false });
    } else {
      pending("Only exercised under Node.js, where @napi-rs/canvas is used.");
    }
    canvasAndCtx = canvasFactory.create(WIDTH, HEIGHT);

    // Count the strokes that actually reach the canvas context. Everything
    // above `CanvasGraphics.stroke` is real work; this is the boundary we care
    // about.
    strokeCalls = 0;
    const ctx = canvasAndCtx.context;
    const realStroke = ctx.stroke.bind(ctx);
    ctx.stroke = function (...args) {
      strokeCalls++;
      return realStroke(...args);
    };
    graphics = newGraphics();
  });

  afterEach(function () {
    canvasFactory?.destroy(canvasAndCtx);
    canvasAndCtx = null;
    canvasFactory = null;
    graphics = null;
  });

  it("does not stroke a path lying entirely outside the canvas", function () {
    graphics.current.minMax.set([-200, -200, -100, -100], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [-200, -200],
        [-100, -100],
      ]),
      false
    );

    expect(strokeCalls).toEqual(0);
  });

  it("does not stroke a path lying entirely to the right of the canvas", function () {
    graphics.current.minMax.set([200, 10, 300, 20], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [200, 10],
        [300, 20],
      ]),
      false
    );

    expect(strokeCalls).toEqual(0);
  });

  it("does not stroke a path lying entirely below the canvas", function () {
    graphics.current.minMax.set([10, 200, 20, 300], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [10, 200],
        [20, 300],
      ]),
      false
    );

    expect(strokeCalls).toEqual(0);
  });

  it("strokes a path overlapping the canvas", function () {
    graphics.current.minMax.set([50, 50, 150, 150], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [50, 50],
        [150, 150],
      ]),
      false
    );

    expect(strokeCalls).toEqual(1);
  });

  it("strokes a path fully inside the canvas", function () {
    graphics.current.minMax.set([10, 10, 90, 90], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [10, 10],
        [90, 90],
      ]),
      false
    );

    expect(strokeCalls).toEqual(1);
  });

  it("strokes an off-canvas path when half the line width reaches it", function () {
    // A stroked path extends half the line width beyond its bounding box, so a
    // path starting just outside the canvas must still be stroked.
    graphics.current.lineWidth = 10;
    graphics.current.minMax.set([100, 10, 200, 20], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [100, 10],
        [200, 20],
      ]),
      false
    );

    expect(strokeCalls).toEqual(1);
  });

  it("does not stroke a path that is outside the canvas by more than half the line width", function () {
    graphics.current.lineWidth = 10;
    graphics.current.minMax.set([200, 10, 300, 20], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [200, 10],
        [300, 20],
      ]),
      false
    );

    expect(strokeCalls).toEqual(0);
  });

  it("honours a narrowed clip box, not just the canvas bounds", function () {
    // This is the tiling case: the canvas is large, but the clip box has been
    // narrowed to one tile. Strokes outside that tile must be skipped.
    graphics.current.clipBox.set([0, 0, 20, 20], 0);
    graphics.current.minMax.set([50, 50, 90, 90], 0);

    graphics.stroke(
      0,
      pathFromPoints([
        [50, 50],
        [90, 90],
      ]),
      false
    );
    expect(strokeCalls).toEqual(0);

    graphics.current.minMax.set([5, 5, 15, 15], 0);
    graphics.stroke(
      1,
      pathFromPoints([
        [5, 5],
        [15, 15],
      ]),
      false
    );
    expect(strokeCalls).toEqual(1);
  });

  it("still skips when content is invisible, as before", function () {
    graphics.contentVisible = false;
    graphics.current.minMax.set([10, 10, 90, 90], 0);
    graphics.stroke(
      0,
      pathFromPoints([
        [10, 10],
        [90, 90],
      ]),
      false
    );

    expect(strokeCalls).toEqual(0);
  });
});

/**
 * `Util.intersect` is the geometry primitive all of the above relies on.
 */
describe("Util.intersect", function () {
  it("returns null for disjoint boxes", function () {
    expect(Util.intersect([0, 0, 10, 10], [20, 20, 30, 30])).toEqual(null);
  });

  it("returns the overlapping region", function () {
    expect(Util.intersect([0, 0, 10, 10], [5, 5, 20, 20])).toEqual([
      5, 5, 10, 10,
    ]);
  });

  it("returns a zero-sized box for boxes that only touch at an edge", function () {
    // Util.intersect uses non-strict inequalities, so edge-touching rectangles
    // intersect in a degenerate (zero-area) box rather than yielding null.
    expect(Util.intersect([0, 0, 10, 10], [10, 0, 20, 10])).toEqual([
      10, 0, 10, 10,
    ]);
  });

  it("returns null for boxes separated by a gap", function () {
    expect(Util.intersect([0, 0, 10, 10], [10.5, 0, 20, 10])).toEqual(null);
  });
});
