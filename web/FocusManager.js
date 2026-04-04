export class FocusManager {
  static instances = [];
  constructor(div) {
    this.div = div;

    this._focusLines = null;
    this._focusScrollBound = false;

    this._focusWidthRatio = 0.2; // default (20% of container height)

     FocusManager.instances.push(this);
  }

  init() {
    requestAnimationFrame(() => {
      this._initFocusLines();
      this._bindFocusScroll();
    });
  }

  _initFocusLines() {
    const spans = Array.from(this.div.querySelectorAll("span"))
      .map(span => ({
        span,
        rect: span.getBoundingClientRect()
      }))
      .sort((a, b) => a.rect.top - b.rect.top);

    this._focusLines = this._groupByY(spans);
    this._updateFocusLine();
  }

  _groupByY(items, tolerance = 4) {
    const lines = [];
    let currentLine = null;

    for (const { span, rect } of items) {
      const y = rect.top + rect.height / 2;

      if (!currentLine || Math.abs(currentLine.y - y) > tolerance) {
        currentLine = { y, spans: [], rects: [] };
        lines.push(currentLine);
      }

      currentLine.spans.push(span);
      currentLine.rects.push(rect);
    }

    for (const line of lines) {
      const top = Math.min(...line.rects.map(r => r.top));
      const bottom = Math.max(...line.rects.map(r => r.bottom));
      line.rect = { top, bottom, center: (top + bottom) / 2 };
    }

    return lines;
  }

  _updateFocusLine() {
    if (this.div.classList.contains("selecting")) return;
    if (!this._focusLines?.length) return;

    const container =
      this.div.closest("#viewerContainer") || document.documentElement;

    const bounds = container.getBoundingClientRect();

    const centerY = bounds.top + bounds.height / 2;
    const halfHeight = (bounds.height * this._focusWidthRatio) / 2;

    const focusTop = centerY - halfHeight;
    const focusBottom = centerY + halfHeight;

    for (const line of this._focusLines) {
      const { top, bottom } = line.rect;

      const inFocus = bottom >= focusTop && top <= focusBottom;

      for (const span of line.spans) {
        span.style.opacity = inFocus ? "1" : "0";
      }
    }
  }

  _bindFocusScroll() {
    if (this._focusScrollBound) return;
    this._focusScrollBound = true;

    const scrollContainer =
      this.div.closest("#viewerContainer") || window;

    let ticking = false;

    scrollContainer.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        if (this.div.classList.contains("selecting")) return;

        this._recalculateLinePositions();
      });
    }, { passive: true });
  }

  _recalculateLinePositions() {
    if (!this._focusLines) return;

    for (const line of this._focusLines) {
      const rects = line.spans.map(s => s.getBoundingClientRect());
      const top = Math.min(...rects.map(r => r.top));
      const bottom = Math.max(...rects.map(r => r.bottom));
      line.rect = { top, bottom, center: (top + bottom) / 1.2 };
    }

    this._updateFocusLine();
  }

  setFocusWidth(value) {
    // value expected: 0 → 100 (slider)
    this._focusWidthRatio = value / 100;

    this._updateFocusLine();
  }
}