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
    define('pdfjs-web/secondary_toolbar', ['exports', 'pdfjs-web/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebSecondaryToolbar = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {

var SCROLLBAR_PADDING = uiUtils.SCROLLBAR_PADDING;
var mozL10n = uiUtils.mozL10n;

/**
 * @typedef {Object} SecondaryToolbarOptions
 * @property {HTMLDivElement} toolbar - Container for the secondary toolbar.
 * @property {HTMLButtonElement} toggleButton - Button to toggle the visibility
 *   of the secondary toolbar.
 * @property {HTMLButtonElement} presentationModeButton - Button for entering
 *   presentation mode.
 * @property {HTMLButtonElement} openFileButton - Button to open a file.
 * @property {HTMLButtonElement} printButton - Button to print the document.
 * @property {HTMLButtonElement} downloadButton - Button to download the
 *   document.
 * @property {HTMLLinkElement} viewBookmarkButton - Button to obtain a bookmark
 *   link to the current location in the document.
 * @property {HTMLButtonElement} firstPageButton - Button to go to the first
 *   page in the document.
 * @property {HTMLButtonElement} lastPageButton - Button to go to the last page
 *   in the document.
 * @property {HTMLButtonElement} pageRotateCwButton - Button to rotate the pages
 *   clockwise.
 * @property {HTMLButtonElement} pageRotateCcwButton - Button to rotate the
 *   pages counterclockwise.
 * @property {HTMLButtonElement} toggleHandToolButton - Button to toggle the
 *   hand tool.
 * @property {HTMLButtonElement} documentPropertiesButton - Button for opening
 *   the document properties dialog.
 */

/**
 * @class
 */
var SecondaryToolbar = (function SecondaryToolbarClosure() {
  /**
   * @constructs SecondaryToolbar
   * @param {SecondaryToolbarOptions} options
   * @param {EventBus} eventBus
   */
  function SecondaryToolbar(options, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.buttons = [
      { element: options.presentationModeButton, eventName: 'presentationmode',
        close: true },
      { element: options.openFileButton, eventName: 'openfile', close: true },
      { element: options.printButton, eventName: 'print', close: true },
      { element: options.downloadButton, eventName: 'download', close: true },
      { element: options.viewBookmarkButton, eventName: null, close: true },
      { element: options.firstPageButton, eventName: 'firstpage', close: true },
      { element: options.lastPageButton, eventName: 'lastpage', close: true },
      { element: options.pageRotateCwButton, eventName: 'rotatecw',
        close: false },
      { element: options.pageRotateCcwButton, eventName: 'rotateccw',
        close: false },
      { element: options.toggleHandToolButton, eventName: 'togglehandtool',
        close: true },
      { element: options.documentPropertiesButton,
        eventName: 'documentproperties', close: true }
    ];

    this.eventBus = eventBus;

    this.opened = false;
    this.previousContainerHeight = null;
    this.newContainerHeight = null;
    this.buttonContainer = this.toolbar.firstElementChild;

    // Bind the event listeners for click and hand tool actions.
    this._bindClickListeners();
    this._bindHandToolListener(options.toggleHandToolButton);
  }

  SecondaryToolbar.prototype = {
    /**
     * @return {boolean}
     */
    get isOpen() {
      return this.opened;
    },

    _bindClickListeners: function SecondaryToolbar_bindClickListeners() {
      // Button to toggle the visibility of the secondary toolbar.
      this.toggleButton.addEventListener('click', this.toggle.bind(this));

      // All items within the secondary toolbar.
      for (var button in this.buttons) {
        var element = this.buttons[button].element;
        var eventName = this.buttons[button].eventName;
        var close = this.buttons[button].close;

        element.addEventListener('click', function (eventName, close) {
          if (eventName !== null) {
            this.eventBus.dispatch(eventName);
          }
          if (close) {
            this.close();
          }
        }.bind(this, eventName, close));
      }
    },

    _bindHandToolListener:
        function SecondaryToolbar_bindHandToolListener(toggleHandToolButton) {
      var isHandToolActive = false;
      this.eventBus.on('handtoolchanged', function (e) {
        if (isHandToolActive === e.isActive) {
          return;
        }
        isHandToolActive = e.isActive;
        if (isHandToolActive) {
          toggleHandToolButton.title =
            mozL10n.get('hand_tool_disable.title', null, 'Disable hand tool');
          toggleHandToolButton.firstElementChild.textContent =
            mozL10n.get('hand_tool_disable_label', null, 'Disable hand tool');
        } else {
          toggleHandToolButton.title =
            mozL10n.get('hand_tool_enable.title', null, 'Enable hand tool');
          toggleHandToolButton.firstElementChild.textContent =
            mozL10n.get('hand_tool_enable_label', null, 'Enable hand tool');
        }
      }.bind(this));
    },

    open: function SecondaryToolbar_open() {
      if (this.opened) {
        return;
      }
      this.opened = true;
      this.toggleButton.classList.add('toggled');
      this.toolbar.classList.remove('hidden');
    },

    close: function SecondaryToolbar_close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.toolbar.classList.add('hidden');
      this.toggleButton.classList.remove('toggled');
    },

    toggle: function SecondaryToolbar_toggle() {
      if (this.opened) {
        this.close();
      } else {
        this.open();
      }
    },

    setMaxHeight: function SecondaryToolbar_setMaxHeight(container) {
      if (!container || !this.buttonContainer) {
        return;
      }
      this.newContainerHeight = container.clientHeight;
      if (this.previousContainerHeight === this.newContainerHeight) {
        return;
      }
      var maxHeight = this.newContainerHeight - SCROLLBAR_PADDING;
      this.buttonContainer.setAttribute('style',
        'max-height: ' + maxHeight + 'px;');
      this.previousContainerHeight = this.newContainerHeight;
    }
  };

  return SecondaryToolbar;
})();

exports.SecondaryToolbar = SecondaryToolbar;
}));
