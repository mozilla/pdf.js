/* Copyright 2017 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFSidebar = exports.SidebarView = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ui_utils = require('./ui_utils');

var _pdf_rendering_queue = require('./pdf_rendering_queue');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var UI_NOTIFICATION_CLASS = 'pdfSidebarNotification';
var SidebarView = {
  NONE: 0,
  THUMBS: 1,
  OUTLINE: 2,
  ATTACHMENTS: 3
};

var PDFSidebar = function () {
  function PDFSidebar(options) {
    var l10n = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _ui_utils.NullL10n;

    _classCallCheck(this, PDFSidebar);

    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;
    this.onToggled = null;
    this.pdfViewer = options.pdfViewer;
    this.pdfThumbnailViewer = options.pdfThumbnailViewer;
    this.pdfOutlineViewer = options.pdfOutlineViewer;
    this.mainContainer = options.mainContainer;
    this.outerContainer = options.outerContainer;
    this.eventBus = options.eventBus;
    this.toggleButton = options.toggleButton;
    this.thumbnailButton = options.thumbnailButton;
    this.outlineButton = options.outlineButton;
    this.attachmentsButton = options.attachmentsButton;
    this.thumbnailView = options.thumbnailView;
    this.outlineView = options.outlineView;
    this.attachmentsView = options.attachmentsView;
    this.disableNotification = options.disableNotification || false;
    this.l10n = l10n;
    this._addEventListeners();
  }

  _createClass(PDFSidebar, [{
    key: 'reset',
    value: function reset() {
      this.isInitialViewSet = false;
      this._hideUINotification(null);
      this.switchView(SidebarView.THUMBS);
      this.outlineButton.disabled = false;
      this.attachmentsButton.disabled = false;
    }
  }, {
    key: 'setInitialView',
    value: function setInitialView() {
      var view = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : SidebarView.NONE;

      if (this.isInitialViewSet) {
        return;
      }
      this.isInitialViewSet = true;
      if (this.isOpen && view === SidebarView.NONE) {
        this._dispatchEvent();
        return;
      }
      var isViewPreserved = view === this.visibleView;
      this.switchView(view, true);
      if (isViewPreserved) {
        this._dispatchEvent();
      }
    }
  }, {
    key: 'switchView',
    value: function switchView(view) {
      var forceOpen = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      if (view === SidebarView.NONE) {
        this.close();
        return;
      }
      var isViewChanged = view !== this.active;
      var shouldForceRendering = false;
      switch (view) {
        case SidebarView.THUMBS:
          this.thumbnailButton.classList.add('toggled');
          this.outlineButton.classList.remove('toggled');
          this.attachmentsButton.classList.remove('toggled');
          this.thumbnailView.classList.remove('hidden');
          this.outlineView.classList.add('hidden');
          this.attachmentsView.classList.add('hidden');
          if (this.isOpen && isViewChanged) {
            this._updateThumbnailViewer();
            shouldForceRendering = true;
          }
          break;
        case SidebarView.OUTLINE:
          if (this.outlineButton.disabled) {
            return;
          }
          this.thumbnailButton.classList.remove('toggled');
          this.outlineButton.classList.add('toggled');
          this.attachmentsButton.classList.remove('toggled');
          this.thumbnailView.classList.add('hidden');
          this.outlineView.classList.remove('hidden');
          this.attachmentsView.classList.add('hidden');
          break;
        case SidebarView.ATTACHMENTS:
          if (this.attachmentsButton.disabled) {
            return;
          }
          this.thumbnailButton.classList.remove('toggled');
          this.outlineButton.classList.remove('toggled');
          this.attachmentsButton.classList.add('toggled');
          this.thumbnailView.classList.add('hidden');
          this.outlineView.classList.add('hidden');
          this.attachmentsView.classList.remove('hidden');
          break;
        default:
          console.error('PDFSidebar_switchView: "' + view + '" is an unsupported value.');
          return;
      }
      this.active = view | 0;
      if (forceOpen && !this.isOpen) {
        this.open();
        return;
      }
      if (shouldForceRendering) {
        this._forceRendering();
      }
      if (isViewChanged) {
        this._dispatchEvent();
      }
      this._hideUINotification(this.active);
    }
  }, {
    key: 'open',
    value: function open() {
      if (this.isOpen) {
        return;
      }
      this.isOpen = true;
      this.toggleButton.classList.add('toggled');
      this.outerContainer.classList.add('sidebarMoving');
      this.outerContainer.classList.add('sidebarOpen');
      if (this.active === SidebarView.THUMBS) {
        this._updateThumbnailViewer();
      }
      this._forceRendering();
      this._dispatchEvent();
      this._hideUINotification(this.active);
    }
  }, {
    key: 'close',
    value: function close() {
      if (!this.isOpen) {
        return;
      }
      this.isOpen = false;
      this.toggleButton.classList.remove('toggled');
      this.outerContainer.classList.add('sidebarMoving');
      this.outerContainer.classList.remove('sidebarOpen');
      this._forceRendering();
      this._dispatchEvent();
    }
  }, {
    key: 'toggle',
    value: function toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
  }, {
    key: '_dispatchEvent',
    value: function _dispatchEvent() {
      this.eventBus.dispatch('sidebarviewchanged', {
        source: this,
        view: this.visibleView
      });
    }
  }, {
    key: '_forceRendering',
    value: function _forceRendering() {
      if (this.onToggled) {
        this.onToggled();
      } else {
        this.pdfViewer.forceRendering();
        this.pdfThumbnailViewer.forceRendering();
      }
    }
  }, {
    key: '_updateThumbnailViewer',
    value: function _updateThumbnailViewer() {
      var pdfViewer = this.pdfViewer,
          pdfThumbnailViewer = this.pdfThumbnailViewer;

      var pagesCount = pdfViewer.pagesCount;
      for (var pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
        var pageView = pdfViewer.getPageView(pageIndex);
        if (pageView && pageView.renderingState === _pdf_rendering_queue.RenderingStates.FINISHED) {
          var thumbnailView = pdfThumbnailViewer.getThumbnail(pageIndex);
          thumbnailView.setImage(pageView);
        }
      }
      pdfThumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
    }
  }, {
    key: '_showUINotification',
    value: function _showUINotification(view) {
      var _this = this;

      if (this.disableNotification) {
        return;
      }
      this.l10n.get('toggle_sidebar_notification.title', null, 'Toggle Sidebar (document contains outline/attachments)').then(function (msg) {
        _this.toggleButton.title = msg;
      });
      if (!this.isOpen) {
        this.toggleButton.classList.add(UI_NOTIFICATION_CLASS);
      } else if (view === this.active) {
        return;
      }
      switch (view) {
        case SidebarView.OUTLINE:
          this.outlineButton.classList.add(UI_NOTIFICATION_CLASS);
          break;
        case SidebarView.ATTACHMENTS:
          this.attachmentsButton.classList.add(UI_NOTIFICATION_CLASS);
          break;
      }
    }
  }, {
    key: '_hideUINotification',
    value: function _hideUINotification(view) {
      var _this2 = this;

      if (this.disableNotification) {
        return;
      }
      var removeNotification = function removeNotification(view) {
        switch (view) {
          case SidebarView.OUTLINE:
            _this2.outlineButton.classList.remove(UI_NOTIFICATION_CLASS);
            break;
          case SidebarView.ATTACHMENTS:
            _this2.attachmentsButton.classList.remove(UI_NOTIFICATION_CLASS);
            break;
        }
      };
      if (!this.isOpen && view !== null) {
        return;
      }
      this.toggleButton.classList.remove(UI_NOTIFICATION_CLASS);
      if (view !== null) {
        removeNotification(view);
        return;
      }
      for (view in SidebarView) {
        removeNotification(SidebarView[view]);
      }
      this.l10n.get('toggle_sidebar.title', null, 'Toggle Sidebar').then(function (msg) {
        _this2.toggleButton.title = msg;
      });
    }
  }, {
    key: '_addEventListeners',
    value: function _addEventListeners() {
      var _this3 = this;

      this.mainContainer.addEventListener('transitionend', function (evt) {
        if (evt.target === _this3.mainContainer) {
          _this3.outerContainer.classList.remove('sidebarMoving');
        }
      });
      this.thumbnailButton.addEventListener('click', function () {
        _this3.switchView(SidebarView.THUMBS);
      });
      this.outlineButton.addEventListener('click', function () {
        _this3.switchView(SidebarView.OUTLINE);
      });
      this.outlineButton.addEventListener('dblclick', function () {
        _this3.pdfOutlineViewer.toggleOutlineTree();
      });
      this.attachmentsButton.addEventListener('click', function () {
        _this3.switchView(SidebarView.ATTACHMENTS);
      });
      this.eventBus.on('outlineloaded', function (evt) {
        var outlineCount = evt.outlineCount;
        _this3.outlineButton.disabled = !outlineCount;
        if (outlineCount) {
          _this3._showUINotification(SidebarView.OUTLINE);
        } else if (_this3.active === SidebarView.OUTLINE) {
          _this3.switchView(SidebarView.THUMBS);
        }
      });
      this.eventBus.on('attachmentsloaded', function (evt) {
        if (evt.attachmentsCount) {
          _this3.attachmentsButton.disabled = false;
          _this3._showUINotification(SidebarView.ATTACHMENTS);
          return;
        }
        Promise.resolve().then(function () {
          if (_this3.attachmentsView.hasChildNodes()) {
            return;
          }
          _this3.attachmentsButton.disabled = true;
          if (_this3.active === SidebarView.ATTACHMENTS) {
            _this3.switchView(SidebarView.THUMBS);
          }
        });
      });
      this.eventBus.on('presentationmodechanged', function (evt) {
        if (!evt.active && !evt.switchInProgress && _this3.isThumbnailViewVisible) {
          _this3._updateThumbnailViewer();
        }
      });
    }
  }, {
    key: 'visibleView',
    get: function get() {
      return this.isOpen ? this.active : SidebarView.NONE;
    }
  }, {
    key: 'isThumbnailViewVisible',
    get: function get() {
      return this.isOpen && this.active === SidebarView.THUMBS;
    }
  }, {
    key: 'isOutlineViewVisible',
    get: function get() {
      return this.isOpen && this.active === SidebarView.OUTLINE;
    }
  }, {
    key: 'isAttachmentsViewVisible',
    get: function get() {
      return this.isOpen && this.active === SidebarView.ATTACHMENTS;
    }
  }]);

  return PDFSidebar;
}();

exports.SidebarView = SidebarView;
exports.PDFSidebar = PDFSidebar;