/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Toolbar = void 0;

var _ui_utils = require("./ui_utils.js");

const PAGE_NUMBER_LOADING_INDICATOR = "visiblePageIsLoading";
const SCALE_SELECT_CONTAINER_WIDTH = 140;
const SCALE_SELECT_WIDTH = 162;

class Toolbar {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.toolbar = options.container;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.buttons = [{
      element: options.previous,
      eventName: "previouspage"
    }, {
      element: options.next,
      eventName: "nextpage"
    }, {
      element: options.zoomIn,
      eventName: "zoomin"
    }, {
      element: options.zoomOut,
      eventName: "zoomout"
    }, {
      element: options.openFile,
      eventName: "openfile"
    }, {
      element: options.print,
      eventName: "print"
    }, {
      element: options.presentationModeButton,
      eventName: "presentationmode"
    }, {
      element: options.download,
      eventName: "download"
    }, {
      element: options.viewBookmark,
      eventName: null
    }];
    this.items = {
      numPages: options.numPages,
      pageNumber: options.pageNumber,
      scaleSelectContainer: options.scaleSelectContainer,
      scaleSelect: options.scaleSelect,
      customScaleOption: options.customScaleOption,
      previous: options.previous,
      next: options.next,
      zoomIn: options.zoomIn,
      zoomOut: options.zoomOut
    };
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

    this.updateLoadingIndicatorState();
  }

  _bindListeners() {
    const {
      pageNumber,
      scaleSelect
    } = this.items;
    const self = this;

    for (const {
      element,
      eventName
    } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          this.eventBus.dispatch(eventName, {
            source: this
          });
        }
      });
    }

    pageNumber.addEventListener("click", function () {
      this.select();
    });
    pageNumber.addEventListener("change", function () {
      self.eventBus.dispatch("pagenumberchanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.addEventListener("change", function () {
      if (this.value === "custom") {
        return;
      }

      self.eventBus.dispatch("scalechanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.oncontextmenu = _ui_utils.noContextMenuHandler;

    this.eventBus._on("localized", () => {
      this._wasLocalized = true;

      this._adjustScaleWidth();

      this._updateUIState(true);
    });
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
        items.pageNumber.type = "text";
      } else {
        items.pageNumber.type = "number";
        this.l10n.get("of_pages", {
          pagesCount
        }, "of {{pagesCount}}").then(msg => {
          items.numPages.textContent = msg;
        });
      }

      items.pageNumber.max = pagesCount;
    }

    if (this.hasPageLabels) {
      items.pageNumber.value = this.pageLabel;
      this.l10n.get("page_of_pages", {
        pageNumber,
        pagesCount
      }, "({{pageNumber}} of {{pagesCount}})").then(msg => {
        items.numPages.textContent = msg;
      });
    } else {
      items.pageNumber.value = pageNumber;
    }

    items.previous.disabled = pageNumber <= 1;
    items.next.disabled = pageNumber >= pagesCount;
    items.zoomOut.disabled = pageScale <= _ui_utils.MIN_SCALE;
    items.zoomIn.disabled = pageScale >= _ui_utils.MAX_SCALE;
    const customScale = Math.round(pageScale * 10000) / 100;
    this.l10n.get("page_scale_percent", {
      scale: customScale
    }, "{{scale}}%").then(msg => {
      let predefinedValueFound = false;

      for (const option of items.scaleSelect.options) {
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
    const pageNumberInput = this.items.pageNumber;
    pageNumberInput.classList.toggle(PAGE_NUMBER_LOADING_INDICATOR, loading);
  }

  async _adjustScaleWidth() {
    const {
      items,
      l10n
    } = this;
    const predefinedValuesPromise = Promise.all([l10n.get("page_scale_auto", null, "Automatic Zoom"), l10n.get("page_scale_actual", null, "Actual Size"), l10n.get("page_scale_fit", null, "Page Fit"), l10n.get("page_scale_width", null, "Page Width")]);
    let canvas = document.createElement("canvas");
    canvas.mozOpaque = true;
    let ctx = canvas.getContext("2d", {
      alpha: false
    });
    await _ui_utils.animationStarted;
    const {
      fontSize,
      fontFamily
    } = getComputedStyle(items.scaleSelect);
    ctx.font = `${fontSize} ${fontFamily}`;
    let maxWidth = 0;

    for (const predefinedValue of await predefinedValuesPromise) {
      const {
        width
      } = ctx.measureText(predefinedValue);

      if (width > maxWidth) {
        maxWidth = width;
      }
    }

    const overflow = SCALE_SELECT_WIDTH - SCALE_SELECT_CONTAINER_WIDTH;
    maxWidth += 1.5 * overflow;

    if (maxWidth > SCALE_SELECT_CONTAINER_WIDTH) {
      items.scaleSelect.style.width = `${maxWidth + overflow}px`;
      items.scaleSelectContainer.style.width = `${maxWidth}px`;
    }

    canvas.width = 0;
    canvas.height = 0;
    canvas = ctx = null;
  }

}

exports.Toolbar = Toolbar;