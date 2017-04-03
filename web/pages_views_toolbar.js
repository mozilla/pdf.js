/* Copyright 2012 Mozilla Foundation
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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/pages_views_toolbar', ['exports', 'pdfjs-web/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebPageViewsToolbar = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {

var SCROLLBAR_PADDING = uiUtils.SCROLLBAR_PADDING;
var mozL10n = uiUtils.mozL10n;

/**
 * @typedef {Object} PageViewsToolbarOptions
 * @property {HTMLDivElement} toolbar - Container for the secondary toolbar.
 * @property {HTMLButtonElement} toggleButton - Button to toggle the visibility
 *   of the secondary toolbar.
 * @property {HTMLDivElement} toolbarButtonContainer - Container where all the
 *   toolbar buttons are placed. The maximum height of the toolbar is controlled
 *   dynamically by adjusting the 'max-height' CSS property of this DOM element.
 * @property {HTMLButtonElement} ModeAButton - Button for viewing a single page at a time
 * @property {HTMLButtonElement} ModeBButton - Button for viewing continuous pages vertically (DEFAULT)
 * @property {HTMLButtonElement} ModeBButton - Button for viewing continuous pages horizontally
 */

/**
 * @class
 */
var PageViewsToolbar = (function PageViewsToolbarClosure() {
  /**
   * @constructs PageViewsToolbar
   * @param {PageViewsToolbarOptions} options
   * @param {HTMLDivElement} mainContainer
   * @param {EventBus} eventBus
   */
  function PageViewsToolbar(options, mainContainer, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.toolbarButtonContainer = options.toolbarButtonContainer;
    this.buttons = [
      { element: options.modeA, eventName: 'pagemodeA',
        close: true },
      { element: options.modeB, eventName: 'pagemodeB',
        close: true },
      { element: options.modeC, eventName: 'pagemodeC',
        close: true }
    ];
    this.items = {
      modeA: options.modeA,
      modeB: options.modeB,
      modeC: options.modeC,
    };

    this.mainContainer = mainContainer;
    this.eventBus = eventBus;

    this.opened = false;
    this.containerHeight = null;
    this.previousContainerHeight = null;

    this.reset();

    this._bindClickListeners();

    // Bind the event listener for adjusting the 'max-height' of the toolbar.
    this.eventBus.on('resize', this._setMaxHeight.bind(this));
  }

  PageViewsToolbar.prototype = {
    /**
     * @return {boolean}
     */
    get isOpen() {
      return this.opened;
    },

    setPageNumber: function PageViewsToolbar_setPageNumber(pageNumber) {
      this.pageNumber = pageNumber;
      this._updateUIState();
    },

    setPagesCount: function PageViewsToolbar_setPagesCount(pagesCount) {
      this.pagesCount = pagesCount;
      this._updateUIState();
    },

    reset: function PageViewsToolbar_reset() {
      this.pageNumber = 0;
      this.pagesCount = 0;
      this._updateUIState();
    },

    _updateUIState: function PageViewsToolbar_updateUIState() {
      var items = this.items;
    },

    _bindClickListeners: function PageViewsToolbar_bindClickListeners() {
      // Button to toggle the visibility of the secondary toolbar.
      this.toggleButton.addEventListener('click', this.toggle.bind(this));

      // All items within the secondary toolbar.
      for (var button in this.buttons) {
        var element = this.buttons[button].element;
        var eventName = this.buttons[button].eventName;
        var close = this.buttons[button].close;

        element.addEventListener('click', function (eventName, close) {
          if (eventName !== null) {
            this.eventBus.dispatch(eventName, { source: this, });
          }
          if (close) {
            this.close();
          }
        }.bind(this, eventName, close));
      }
    },

    open: function PageViewsToolbar_open() {
      var me = this;
      var setPosition = function () {
        var parent_width = me.mainContainer.offsetWidth;
        var button_width = me.toggleButton.offsetWidth;
        var button_left = me.toggleButton.offsetLeft;
        return (parent_width - button_left - button_width) + 'px';
      };

      if (me.opened) {
        return;
      }
      me.opened = true;
      me._setMaxHeight();

      me.toggleButton.classList.add('toggled');
      me.toolbar.classList.remove('hidden');
      me.toolbar.style.right = setPosition()
    },

    close: function PageViewsToolbar_close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.toolbar.classList.add('hidden');
      this.toggleButton.classList.remove('toggled');
    },

    toggle: function PageViewsToolbar_toggle() {
      if (this.opened) {
        this.close();
      } else {
        this.open();
      }
    },

    /**
     * @private
     */
    _setMaxHeight: function PageViewsToolbar_setMaxHeight() {
      if (!this.opened) {
        return; // Only adjust the 'max-height' if the toolbar is visible.
      }
      this.containerHeight = this.mainContainer.clientHeight;

      if (this.containerHeight === this.previousContainerHeight) {
        return;
      }
      this.toolbarButtonContainer.setAttribute('style',
        'max-height: ' + (this.containerHeight - SCROLLBAR_PADDING) + 'px;');

      this.previousContainerHeight = this.containerHeight;
    }
  };

  return PageViewsToolbar;
})();

exports.PageViewsToolbar = PageViewsToolbar;
}));
