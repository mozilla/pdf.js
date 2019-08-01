/* Copyright 2016 Mozilla Foundation
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

import {
  animationStarted, DEFAULT_SCALE, DEFAULT_SCALE_VALUE, MAX_SCALE,
  MIN_SCALE, noContextMenuHandler, NullL10n
} from './ui_utils';

const PAGE_NUMBER_LOADING_INDICATOR = 'visiblePageIsLoading';
const SCALE_SELECT_CONTAINER_PADDING = 8;
const SCALE_SELECT_PADDING = 22;

/**
 * @typedef {Object} ToolbarOptions
 * @property {HTMLDivElement} container - Container for the secondary toolbar.
 * @property {HTMLSpanElement} numPages - Label that contains number of pages.
 * @property {HTMLInputElement} pageNumber - Control for display and user input
 *   of the current page number.
 * @property {HTMLSpanElement} scaleSelectContainer - Container where scale
 *   controls are placed. The width is adjusted on UI initialization.
 * @property {HTMLSelectElement} scaleSelect - Scale selection control.
 * @property {HTMLOptionElement} customScaleOption - The item used to display
 *   a non-predefined scale.
 * @property {HTMLButtonElement} previous - Button to go to the previous page.
 * @property {HTMLButtonElement} next - Button to go to the next page.
 * @property {HTMLButtonElement} zoomIn - Button to zoom in the pages.
 * @property {HTMLButtonElement} zoomOut - Button to zoom out the pages.
 * @property {HTMLButtonElement} viewFind - Button to open find bar.
 * @property {HTMLButtonElement} openFile - Button to open a new document.
 * @property {HTMLButtonElement} presentationModeButton - Button to switch to
 *   presentation mode.
 * @property {HTMLButtonElement} download - Button to download the document.
 * @property {HTMLAElement} viewBookmark - Element to link current url of
 *   the page view.
 */

class Toolbar {
  /**
   * @param {ToolbarOptions} options
   * @param {EventBus} eventBus
   * @param {IL10n} l10n - Localization service.
   */
  constructor(options, eventBus, l10n = NullL10n) {
    this.toolbar = options.container;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.items = options;

    this._wasLocalized = false;
    this.reset();

    // Bind the event listeners for click and hand tool actions.
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
    this.pageScaleValue = DEFAULT_SCALE_VALUE;
    this.pageScale = DEFAULT_SCALE;
    this._updateUIState(true);
    this.updateLoadingIndicatorState();
  }

  _bindListeners() {
    let { eventBus, items, } = this;
    let self = this;

    items.previous.addEventListener('click', function() {
      eventBus.dispatch('previouspage', { source: self, });
    });

    items.next.addEventListener('click', function() {
      eventBus.dispatch('nextpage', { source: self, });
    });

    items.zoomIn.addEventListener('click', function() {
      eventBus.dispatch('zoomin', { source: self, });
    });

    items.zoomOut.addEventListener('click', function() {
      eventBus.dispatch('zoomout', { source: self, });
    });

    items.pageNumber.addEventListener('click', function() {
      this.select();
    });

    items.pageNumber.addEventListener('change', function() {
      eventBus.dispatch('pagenumberchanged', {
        source: self,
        value: this.value,
      });
    });

    items.scaleSelect.addEventListener('change', function() {
      if (this.value === 'custom') {
        return;
      }
      eventBus.dispatch('scalechanged', {
        source: self,
        value: this.value,
      });
    });

    items.presentationModeButton.addEventListener('click', function() {
      eventBus.dispatch('presentationmode', { source: self, });
    });

    items.openFile.addEventListener('click', function() {
      eventBus.dispatch('openfile', { source: self, });
    });

    items.print.addEventListener('click', function() {
      eventBus.dispatch('print', { source: self, });
    });

    items.download.addEventListener('click', function() {
      eventBus.dispatch('download', { source: self, });
    });

    // Suppress context menus for some controls.
    items.scaleSelect.oncontextmenu = noContextMenuHandler;

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
      // Don't update the UI state until we localize the toolbar.
      return;
    }
    const { pageNumber, pagesCount, pageScaleValue, pageScale, items, } = this;

    if (resetNumPages) {
      if (this.hasPageLabels) {
        items.pageNumber.type = 'text';
      } else {
        items.pageNumber.type = 'number';
        this.l10n.get('of_pages', { pagesCount, }, 'of {{pagesCount}}').
            then((msg) => {
          items.numPages.textContent = msg;
        });
      }
      items.pageNumber.max = pagesCount;
    }

    if (this.hasPageLabels) {
      items.pageNumber.value = this.pageLabel;
      this.l10n.get('page_of_pages', { pageNumber, pagesCount, },
                    '({{pageNumber}} of {{pagesCount}})').then((msg) => {
        items.numPages.textContent = msg;
      });
    } else {
      items.pageNumber.value = pageNumber;
    }

    items.previous.disabled = (pageNumber <= 1);
    items.next.disabled = (pageNumber >= pagesCount);

    items.zoomOut.disabled = (pageScale <= MIN_SCALE);
    items.zoomIn.disabled = (pageScale >= MAX_SCALE);

    let customScale = Math.round(pageScale * 10000) / 100;
    this.l10n.get('page_scale_percent', { scale: customScale, },
                  '{{scale}}%').then((msg) => {
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

    animationStarted.then(function() {
      // Adjust the width of the zoom box to fit the content.
      // Note: If the window is narrow enough that the zoom box is not
      //       visible, we temporarily show it to be able to adjust its width.
      if (container.clientWidth === 0) {
        container.setAttribute('style', 'display: inherit;');
      }
      if (container.clientWidth > 0) {
        select.setAttribute('style', 'min-width: inherit;');
        let width = select.clientWidth + SCALE_SELECT_CONTAINER_PADDING;
        select.setAttribute('style', 'min-width: ' +
                                     (width + SCALE_SELECT_PADDING) + 'px;');
        container.setAttribute('style', 'min-width: ' + width + 'px; ' +
                                        'max-width: ' + width + 'px;');
      }
    });
  }
}

export {
  Toolbar,
};
