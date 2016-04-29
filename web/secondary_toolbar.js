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

var SecondaryToolbar = {
  opened: false,
  previousContainerHeight: null,
  newContainerHeight: null,

  initialize: function secondaryToolbarInitialize(options, eventBus) {
    this.eventBus = eventBus;
    this.toolbar = options.toolbar;
    this.buttonContainer = this.toolbar.firstElementChild;

    // Define the toolbar buttons.
    this.toggleButton = options.toggleButton;
    this.presentationModeButton = options.presentationModeButton;
    this.openFile = options.openFile;
    this.print = options.print;
    this.download = options.download;
    this.viewBookmark = options.viewBookmark;
    this.firstPage = options.firstPage;
    this.lastPage = options.lastPage;
    this.pageRotateCw = options.pageRotateCw;
    this.pageRotateCcw = options.pageRotateCcw;
    this.toggleHandTool = options.toggleHandTool;
    this.documentPropertiesButton = options.documentPropertiesButton;

    // Attach the event listeners.
    var elements = [
      // Button to toggle the visibility of the secondary toolbar:
      { element: this.toggleButton, handler: this.toggle },
      // All items within the secondary toolbar
      { element: this.presentationModeButton,
        handler: this.presentationModeClick },
      { element: this.openFile, handler: this.openFileClick },
      { element: this.print, handler: this.printClick },
      { element: this.download, handler: this.downloadClick },
      { element: this.viewBookmark, handler: this.viewBookmarkClick },
      { element: this.firstPage, handler: this.firstPageClick },
      { element: this.lastPage, handler: this.lastPageClick },
      { element: this.pageRotateCw, handler: this.pageRotateCwClick },
      { element: this.pageRotateCcw, handler: this.pageRotateCcwClick },
      { element: this.toggleHandTool, handler: this.toggleHandToolClick },
      { element: this.documentPropertiesButton,
        handler: this.documentPropertiesClick }
    ];

    for (var item in elements) {
      var element = elements[item].element;
      if (element) {
        element.addEventListener('click', elements[item].handler.bind(this));
      }
    }

    // Tracking hand tool menu item changes.
    var isHandToolActive = false;
    this.eventBus.on('handtoolchanged', function (e) {
      if (isHandToolActive === e.isActive) {
        return;
      }
      isHandToolActive = e.isActive;
      if (isHandToolActive) {
        this.toggleHandTool.title =
          mozL10n.get('hand_tool_disable.title', null, 'Disable hand tool');
        this.toggleHandTool.firstElementChild.textContent =
          mozL10n.get('hand_tool_disable_label', null, 'Disable hand tool');
      } else {
        this.toggleHandTool.title =
          mozL10n.get('hand_tool_enable.title', null, 'Enable hand tool');
        this.toggleHandTool.firstElementChild.textContent =
          mozL10n.get('hand_tool_enable_label', null, 'Enable hand tool');
      }
    }.bind(this));
  },

  // Event handling functions.
  presentationModeClick: function secondaryToolbarPresentationModeClick(evt) {
    this.eventBus.dispatch('presentationmode');
    this.close();
  },

  openFileClick: function secondaryToolbarOpenFileClick(evt) {
    this.eventBus.dispatch('openfile');
    this.close();
  },

  printClick: function secondaryToolbarPrintClick(evt) {
    this.eventBus.dispatch('print');
    this.close();
  },

  downloadClick: function secondaryToolbarDownloadClick(evt) {
    this.eventBus.dispatch('download');
    this.close();
  },

  viewBookmarkClick: function secondaryToolbarViewBookmarkClick(evt) {
    this.close();
  },

  firstPageClick: function secondaryToolbarFirstPageClick(evt) {
    this.eventBus.dispatch('firstpage');
    this.close();
  },

  lastPageClick: function secondaryToolbarLastPageClick(evt) {
    this.eventBus.dispatch('lastpage');
    this.close();
  },

  pageRotateCwClick: function secondaryToolbarPageRotateCwClick(evt) {
    this.eventBus.dispatch('rotatecw');
  },

  pageRotateCcwClick: function secondaryToolbarPageRotateCcwClick(evt) {
    this.eventBus.dispatch('rotateccw');
  },

  toggleHandToolClick: function secondaryToolbarToggleHandToolClick(evt) {
    this.eventBus.dispatch('togglehandtool');
    this.close();
  },

  documentPropertiesClick: function secondaryToolbarDocumentPropsClick(evt) {
    this.eventBus.dispatch('documentproperties');
    this.close();
  },

  // Misc. functions for interacting with the toolbar.
  setMaxHeight: function secondaryToolbarSetMaxHeight(container) {
    if (!container || !this.buttonContainer) {
      return;
    }
    this.newContainerHeight = container.clientHeight;
    if (this.previousContainerHeight === this.newContainerHeight) {
      return;
    }
    this.buttonContainer.setAttribute('style',
      'max-height: ' + (this.newContainerHeight - SCROLLBAR_PADDING) + 'px;');
    this.previousContainerHeight = this.newContainerHeight;
  },

  open: function secondaryToolbarOpen() {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this.toggleButton.classList.add('toggled');
    this.toolbar.classList.remove('hidden');
  },

  close: function secondaryToolbarClose(target) {
    if (!this.opened) {
      return;
    } else if (target && !this.toolbar.contains(target)) {
      return;
    }
    this.opened = false;
    this.toolbar.classList.add('hidden');
    this.toggleButton.classList.remove('toggled');
  },

  toggle: function secondaryToolbarToggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }
};

exports.SecondaryToolbar = SecondaryToolbar;
}));
