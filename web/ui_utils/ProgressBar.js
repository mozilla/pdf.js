import clamp from './clamp';

export default class ProgressBar {
  constructor(id, { height, width, units, } = {}) {
    this.visible = true;

    // Fetch the sub-elements for later.
    this.div = document.querySelector(id + ' .progress');
    // Get the loading bar element, so it can be resized to fit the viewer.
    this.bar = this.div.parentNode;

    // Get options, with sensible defaults.
    this.height = height || 100;
    this.width = width || 100;
    this.units = units || '%';

    // Initialize heights.
    this.div.style.height = this.height + this.units;
    this.percent = 0;
  }

  _updateBar() {
    if (this._indeterminate) {
      this.div.classList.add('indeterminate');
      this.div.style.width = this.width + this.units;
      return;
    }

    this.div.classList.remove('indeterminate');
    let progressSize = this.width * this._percent / 100;
    this.div.style.width = progressSize + this.units;
  }

  get percent() {
    return this._percent;
  }

  set percent(val) {
    this._indeterminate = isNaN(val);
    this._percent = clamp(val, 0, 100);
    this._updateBar();
  }

  setWidth(viewer) {
    if (!viewer) {
      return;
    }
    let container = viewer.parentNode;
    let scrollbarWidth = container.offsetWidth - viewer.offsetWidth;
    if (scrollbarWidth > 0) {
      this.bar.setAttribute('style', 'width: calc(100% - ' +
                                      scrollbarWidth + 'px);');
    }
  }

  hide() {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.bar.classList.add('hidden');
    document.body.classList.remove('loadingInProgress');
  }

  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    document.body.classList.add('loadingInProgress');
    this.bar.classList.remove('hidden');
  }
}
