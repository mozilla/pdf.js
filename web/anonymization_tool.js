/* eslint-disable no-var */

import { MathClamp } from "pdfjs-lib";

/**
 * Construct a AnonymizationTool instance for a given HTML element.
 * @param {object} options
 * @param {Element} options.element
 * @param {EventBus} options.eventBus
 * @param {PDFViewer} options.pdfViewer
 * @param {Function} [options.ignoreTarget] - See `ignoreTarget(node)`.
 * @param {Function} [options.onActiveChanged] - Called when the tool
 *   is (de)activated. The first argument is a boolean that shows whether the
 *   tool is activated.
 */
function AnonymizationTool(options) {
  this.element = options.element;
  this.document = options.element.ownerDocument;
  this.eventBus = options.eventBus;
  this.pdfViewer = options.pdfViewer;
  if (typeof options.ignoreTarget === "function") {
    this.ignoreTarget = options.ignoreTarget;
  }
  this.onActiveChanged = options.onActiveChanged;

  // Bind the contexts to ensure that `this` always points to
  // the AnonymizationTool instance.
  this.activate = this.activate.bind(this);
  this.deactivate = this.deactivate.bind(this);
  this.toggle = this.toggle.bind(this);
  this._onmousedown = this._onmousedown.bind(this);
  this._onmousemove = this._onmousemove.bind(this);
  this._onmouseup = this._onmouseup.bind(this);
  this._onAfterDraw = this._onAfterDraw.bind(this);

  // Rubber-band rectangle shown while a redaction is being drawn.
  this.curs = this.document.createElement("div");
  this.curs.className = "rectangle";

  this.drawing = false;
  // The page being drawn on: { pageNumber, viewport, wrapper }.
  this.drawPage = null;
  // Redactions, in PDF page coordinates, so that they can be painted at any
  // scale and rotation: { pageNumber, rect: [x1, y1, x2, y2] }.
  this.blocks = [];
  this.redoStack = [];
  this.eventBus.on("pagerendered", this._onAfterDraw);
}
AnonymizationTool.prototype = {
  /**
   * Bind a mousedown event to the element to enable drawing.
   */
  activate: function AnonymizationTool_activate() {
    if (!this.active) {
      this.active = true;
      this.element.addEventListener("mousedown", this._onmousedown, true);
      this.pdfViewer.container.style.cursor = "crosshair";
      if (this.onActiveChanged) {
        this.onActiveChanged(true);
      }
    }
  },

  /**
   * Removes all events. Any pending drawing is immediately stopped.
   */
  deactivate: function AnonymizationTool_deactivate() {
    if (this.active) {
      this.active = false;
      this.element.removeEventListener("mousedown", this._onmousedown, true);
      this._cancelDraw();
      this.pdfViewer.container.style.cursor = "";

      if (this.onActiveChanged) {
        this.onActiveChanged(false);
      }
    }
  },

  toggle: function AnonymizationTool_toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  },

  undo: function AnonymizationTool_undo() {
    const block = this.blocks.pop();
    if (block) {
      this.redoStack.push(block);
      // The redaction was painted into the canvas, so re-render the page.
      this.pdfViewer.getPageView(block.pageNumber - 1)?.reset();
      this.pdfViewer.forceRendering();
    }
  },

  redo: function AnonymizationTool_redo() {
    const block = this.redoStack.pop();
    if (block) {
      this.blocks.push(block);
      this._repaintPage(block.pageNumber);
    }
  },

  forget: function AnonymizationTool_forget() {
    this.redoStack = [];
  },

  /**
   * Discard all redactions, e.g. when the document is closed; they're tied to
   * its pages and must never be applied to another document.
   */
  reset: function AnonymizationTool_reset() {
    this._cancelDraw();
    this.blocks = [];
    this.redoStack = [];
  },

  /**
   * Paint the redactions of a page into a canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} pageNumber
   * @param {PageViewport} viewport - The viewport the canvas was rendered with.
   * @param {Array<number>} transform - Maps viewport coordinates to canvas
   *   pixels.
   */
  drawRedactions: function AnonymizationTool_drawRedactions(
    ctx,
    pageNumber,
    viewport,
    transform
  ) {
    for (const block of this.blocks) {
      if (block.pageNumber !== pageNumber) {
        continue;
      }
      const [x1, y1] = viewport.convertToViewportPoint(
        block.rect[0],
        block.rect[1]
      );
      const [x2, y2] = viewport.convertToViewportPoint(
        block.rect[2],
        block.rect[3]
      );
      ctx.save();
      ctx.setTransform(...transform);
      ctx.shadowColor = "gray";
      ctx.shadowBlur = 5;
      ctx.fillStyle = "white";
      ctx.fillRect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1)
      );
      ctx.restore();
    }
  },

  /**
   * Whether to not draw if the target element is clicked.
   * Override this method to change the default behaviour.
   * @param {Element} node - The target of the event.
   * @returns {boolean} Whether to not react to the click event.
   */
  ignoreTarget: function AnonymizationTool_ignoreTarget(node) {
    // Use matchesSelector to check whether the clicked element
    // is (a child of) an input element / link
    return node[matchesSelector](
      "a[href], a[href] *, input, textarea, button, button *, select, option"
    );
  },

  /**
   * @private
   */
  _onmousedown: function AnonymizationTool__onmousedown(event) {
    if (event.button !== 0 || this.drawing || this.ignoreTarget(event.target)) {
      return;
    }
    const pageDiv = event.target.closest(".page");
    const wrapper = pageDiv?.querySelector(".canvasWrapper");
    if (!wrapper) {
      return;
    }
    const pageNumber = parseInt(pageDiv.dataset.pageNumber, 10);
    const viewport = this.pdfViewer.getPageView(pageNumber - 1)?.viewport;
    if (!viewport) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    this.drawPage = { pageNumber, viewport, wrapper };
    this.start = this.current = this._getViewportPoint(event);
    this.drawing = true;
    this._updateCursorRect();
    wrapper.append(this.curs);

    this.document.addEventListener("mousemove", this._onmousemove, true);
    this.document.addEventListener("mouseup", this._onmouseup, true);
  },

  /**
   * @private
   */
  _onmousemove: function AnonymizationTool__onmousemove(event) {
    if (this.drawing) {
      this.current = this._getViewportPoint(event);
      this._updateCursorRect();
    }
  },

  /**
   * @private
   */
  _onmouseup: function AnonymizationTool__onmouseup(event) {
    if (!this.drawing) {
      return;
    }
    this.current = this._getViewportPoint(event);
    const { pageNumber, viewport } = this.drawPage;
    const [x1, y1] = this.start;
    const [x2, y2] = this.current;
    this._cancelDraw();

    // Ignore plain clicks, and accidental tiny drags.
    if (Math.abs(x2 - x1) < 2 || Math.abs(y2 - y1) < 2) {
      return;
    }
    const [px1, py1] = viewport.convertToPdfPoint(x1, y1);
    const [px2, py2] = viewport.convertToPdfPoint(x2, y2);
    this.blocks.push({
      pageNumber,
      rect: [
        Math.min(px1, px2),
        Math.min(py1, py2),
        Math.max(px1, px2),
        Math.max(py1, py2),
      ],
    });
    this.redoStack = [];
    this._repaintPage(pageNumber);
  },

  /**
   * Returns the mouse position in the viewport coordinates of the page being
   * drawn on, clamped to the page. The position is computed relative to the
   * on-screen size of the page, so it's also correct while zooming.
   * @private
   */
  _getViewportPoint: function AnonymizationTool__getViewportPoint(event) {
    const { viewport, wrapper } = this.drawPage;
    const { left, top, width, height } = wrapper.getBoundingClientRect();
    const clamp = v => MathClamp(v, 0, 1);
    return [
      clamp((event.clientX - left) / width) * viewport.width,
      clamp((event.clientY - top) / height) * viewport.height,
    ];
  },

  /**
   * @private
   */
  _updateCursorRect: function AnonymizationTool__updateCursorRect() {
    const { viewport } = this.drawPage;
    const [x1, y1] = this.start;
    const [x2, y2] = this.current;
    const { style } = this.curs;
    style.left = `${(Math.min(x1, x2) * 100) / viewport.width}%`;
    style.top = `${(Math.min(y1, y2) * 100) / viewport.height}%`;
    style.width = `${(Math.abs(x2 - x1) * 100) / viewport.width}%`;
    style.height = `${(Math.abs(y2 - y1) * 100) / viewport.height}%`;
  },

  /**
   * Paint the redactions into the canvases currently displaying a page.
   * @private
   */
  _repaintPage: function AnonymizationTool__repaintPage(pageNumber) {
    const pageView = this.pdfViewer.getPageView(pageNumber - 1);
    if (!pageView) {
      return;
    }
    this._paintView(pageView, /* isDetailView = */ false);
    if (pageView.detailView) {
      this._paintView(pageView.detailView, /* isDetailView = */ true);
    }
  },

  /**
   * @private
   */
  _paintView: function AnonymizationTool__paintView(view, isDetailView) {
    const pageView = isDetailView ? view.pageView : view;
    const { canvas } = view;
    const { viewport } = pageView;
    if (!canvas || !viewport) {
      return;
    }
    let sx = canvas.width / viewport.width,
      sy = canvas.height / viewport.height,
      tx = 0,
      ty = 0;

    if (isDetailView) {
      // A detail view only covers part of the page; its position and size are
      // set, as percentages of the page, on the canvas style.
      const { style } = canvas;
      sx = canvas.width / ((parseFloat(style.width) / 100) * viewport.width);
      sy = canvas.height / ((parseFloat(style.height) / 100) * viewport.height);
      tx = -((parseFloat(style.left) / 100) * viewport.width) * sx;
      ty = -((parseFloat(style.top) / 100) * viewport.height) * sy;
    }
    this.drawRedactions(canvas.getContext("2d"), pageView.id, viewport, [
      sx,
      0,
      0,
      sy,
      tx,
      ty,
    ]);
  },

  /**
   * @private
   */
  _cancelDraw: function AnonymizationTool__cancelDraw() {
    this.drawing = false;
    this.drawPage = null;
    // Note: ChildNode.remove doesn't throw if the parentNode is undefined.
    this.curs.remove();
    this.document.removeEventListener("mousemove", this._onmousemove, true);
    this.document.removeEventListener("mouseup", this._onmouseup, true);
  },

  _onAfterDraw: function AnonymizationTool__onAfterDraw(evt) {
    // With `cssTransform` the canvas was only scaled with CSS, and it still
    // contains the redactions painted after its last actual rendering.
    if (evt.cssTransform || evt.error) {
      return;
    }
    this._paintView(evt.source, evt.isDetailView);
  },
};

// Get the correct (vendor-prefixed) name of the matches method.
var matchesSelector;
["webkitM", "mozM", "msM", "oM", "m"].some(function (prefix) {
  var name = prefix + "atches";
  if (name in document.documentElement) {
    matchesSelector = name;
  }
  name += "Selector";
  if (name in document.documentElement) {
    matchesSelector = name;
  }
  return matchesSelector; // If found, then truthy, and [].some() ends.
});

export { AnonymizationTool };
