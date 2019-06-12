"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Toolbar = void 0;

var _ui_utils = require("./ui_utils");

const PAGE_NUMBER_LOADING_INDICATOR = 'visiblePageIsLoading';
const SCALE_SELECT_CONTAINER_PADDING = 8;
const SCALE_SELECT_PADDING = 22;

class Toolbar {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.toolbar = options.container;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.items = options;
    this._wasLocalized = false;
    this.reset();

    this._bindListeners();
  }

  setPageNumber(pageNumber, pageLabel) {
    this.pageNumber = pageNumber;
    this.pageLabel = pageLabel;

    this._updateUIState(false);
  }

  setPagesCount(pagesCount, hasPageLabels) {
    this.pagesCount = pagesCount;
    this.hasPageLabels = hasPageLabels;

    this._updateUIState(true);
  }

  setPageScale(pageScaleValue, pageScale) {
    this.pageScaleValue = (pageScaleValue || pageScale).toString();
    this.pageScale = pageScale;

    this._updateUIState(false);
  }

  reset() {
    this.pageNumber = 0;
    this.pageLabel = null;
    this.hasPageLabels = false;
    this.pagesCount = 0;
    this.pageScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
    this.pageScale = _ui_utils.DEFAULT_SCALE;

    this._updateUIState(true);
  }

  _bindListeners() {
    let {
      eventBus,
      items
    } = this;
    let self = this;
    items.previous.addEventListener('click', function () {
      eventBus.dispatch('previouspage', {
        source: self
      });
    });
    items.next.addEventListener('click', function () {
      eventBus.dispatch('nextpage', {
        source: self
      });
    });
    items.zoomIn.addEventListener('click', function () {
      eventBus.dispatch('zoomin', {
        source: self
      });
    });
    items.zoomOut.addEventListener('click', function () {
      eventBus.dispatch('zoomout', {
        source: self
      });
    });
    items.pageNumber.addEventListener('click', function () {
      this.select();
    });
    items.pageNumber.addEventListener('change', function () {
      eventBus.dispatch('pagenumberchanged', {
        source: self,
        value: this.value
      });
    });
    items.scaleSelect.addEventListener('change', function () {
      if (this.value === 'custom') {
        return;
      }

      eventBus.dispatch('scalechanged', {
        source: self,
        value: this.value
      });
    });
    items.presentationModeButton.addEventListener('click', function () {
      eventBus.dispatch('presentationmode', {
        source: self
      });
    });
    items.openFile.addEventListener('click', function () {
      eventBus.dispatch('openfile', {
        source: self
      });
    });
    items.print.addEventListener('click', function () {
      eventBus.dispatch('print', {
        source: self
      });
    });
    items.download.addEventListener('click', function () {
      eventBus.dispatch('download', {
        source: self
      });
    });
    items.scaleSelect.oncontextmenu = _ui_utils.noContextMenuHandler;
    eventBus.on('localized', () => {
      this._localized();
    });
  }

  _localized() {
    this._wasLocalized = true;

    this._adjustScaleWidth();

    this._updateUIState(true);
  }

  _updateUIState(resetNumPages = false) {
    if (!this._wasLocalized) {
      return;
    }

    const {
      pageNumber,
      pagesCount,
      pageScaleValue,
      pageScale,
      items
    } = this;

    if (resetNumPages) {
      if (this.hasPageLabels) {
        items.pageNumber.type = 'text';
      } else {
        items.pageNumber.type = 'number';
        this.l10n.get('of_pages', {
          pagesCount
        }, 'of {{pagesCount}}').then(msg => {
          items.numPages.textContent = msg;
        });
      }

      items.pageNumber.max = pagesCount;
    }

    if (this.hasPageLabels) {
      items.pageNumber.value = this.pageLabel;
      this.l10n.get('page_of_pages', {
        pageNumber,
        pagesCount
      }, '({{pageNumber}} of {{pagesCount}})').then(msg => {
        items.numPages.textContent = msg;
      });
    } else {
      items.pageNumber.value = pageNumber;
    }

    items.previous.disabled = pageNumber <= 1;
    items.next.disabled = pageNumber >= pagesCount;
    items.zoomOut.disabled = pageScale <= _ui_utils.MIN_SCALE;
    items.zoomIn.disabled = pageScale >= _ui_utils.MAX_SCALE;
    let customScale = Math.round(pageScale * 10000) / 100;
    this.l10n.get('page_scale_percent', {
      scale: customScale
    }, '{{scale}}%').then(msg => {
      let options = items.scaleSelect.options;
      let predefinedValueFound = false;

      for (let i = 0, ii = options.length; i < ii; i++) {
        let option = options[i];

        if (option.value !== pageScaleValue) {
          option.selected = false;
          continue;
        }

        option.selected = true;
        predefinedValueFound = true;
      }

      if (!predefinedValueFound) {
        items.customScaleOption.textContent = msg;
        items.customScaleOption.selected = true;
      }
    });
  }

  updateLoadingIndicatorState(loading = false) {
    let pageNumberInput = this.items.pageNumber;
    pageNumberInput.classList.toggle(PAGE_NUMBER_LOADING_INDICATOR, loading);
  }

  _adjustScaleWidth() {
    let container = this.items.scaleSelectContainer;
    let select = this.items.scaleSelect;

    _ui_utils.animationStarted.then(function () {
      if (container.clientWidth === 0) {
        container.setAttribute('style', 'display: inherit;');
      }

      if (container.clientWidth > 0) {
        select.setAttribute('style', 'min-width: inherit;');
        let width = select.clientWidth + SCALE_SELECT_CONTAINER_PADDING;
        select.setAttribute('style', 'min-width: ' + (width + SCALE_SELECT_PADDING) + 'px;');
        container.setAttribute('style', 'min-width: ' + width + 'px; ' + 'max-width: ' + width + 'px;');
      }
    });
  }

}

exports.Toolbar = Toolbar;