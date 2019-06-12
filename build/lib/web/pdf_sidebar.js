/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
exports.PDFSidebar = exports.SidebarView = void 0;

var _ui_utils = require("./ui_utils");

var _pdf_rendering_queue = require("./pdf_rendering_queue");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var UI_NOTIFICATION_CLASS = 'pdfSidebarNotification';
var SidebarView = {
  UNKNOWN: -1,
  NONE: 0,
  THUMBS: 1,
  OUTLINE: 2,
  ATTACHMENTS: 3,
  LAYERS: 4
};
exports.SidebarView = SidebarView;

var PDFSidebar =
/*#__PURE__*/
function () {
  function PDFSidebar(_ref) {
    var elements = _ref.elements,
        pdfViewer = _ref.pdfViewer,
        pdfThumbnailViewer = _ref.pdfThumbnailViewer,
        eventBus = _ref.eventBus,
        _ref$l10n = _ref.l10n,
        l10n = _ref$l10n === void 0 ? _ui_utils.NullL10n : _ref$l10n,
        _ref$disableNotificat = _ref.disableNotification,
        disableNotification = _ref$disableNotificat === void 0 ? false : _ref$disableNotificat;

    _classCallCheck(this, PDFSidebar);

    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;
    this.onToggled = null;
    this.pdfViewer = pdfViewer;
    this.pdfThumbnailViewer = pdfThumbnailViewer;
    this.outerContainer = elements.outerContainer;
    this.viewerContainer = elements.viewerContainer;
    this.toggleButton = elements.toggleButton;
    this.thumbnailButton = elements.thumbnailButton;
    this.outlineButton = elements.outlineButton;
    this.attachmentsButton = elements.attachmentsButton;
    this.thumbnailView = elements.thumbnailView;
    this.outlineView = elements.outlineView;
    this.attachmentsView = elements.attachmentsView;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this._disableNotification = disableNotification;

    this._addEventListeners();
  }

  _createClass(PDFSidebar, [{
    key: "reset",
    value: function reset() {
      this.isInitialViewSet = false;

      this._hideUINotification(null);

      this.switchView(SidebarView.THUMBS);
      this.outlineButton.disabled = false;
      this.attachmentsButton.disabled = false;
    }
  }, {
    key: "setInitialView",
    value: function setInitialView() {
      var view = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : SidebarView.NONE;

      if (this.isInitialViewSet) {
        return;
      }

      this.isInitialViewSet = true;

      if (view === SidebarView.NONE || view === SidebarView.UNKNOWN) {
        this._dispatchEvent();

        return;
      }

      if (!this._switchView(view, true)) {
        this._dispatchEvent();
      }
    }
  }, {
    key: "switchView",
    value: function switchView(view) {
      var forceOpen = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      this._switchView(view, forceOpen);
    }
  }, {
    key: "_switchView",
    value: function _switchView(view) {
      var forceOpen = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var isViewChanged = view !== this.active;
      var shouldForceRendering = false;

      switch (view) {
        case SidebarView.NONE:
          if (this.isOpen) {
            this.close();
            return true;
          }

          return false;

        case SidebarView.THUMBS:
          if (this.isOpen && isViewChanged) {
            shouldForceRendering = true;
          }

          break;

        case SidebarView.OUTLINE:
          if (this.outlineButton.disabled) {
            return false;
          }

          break;

        case SidebarView.ATTACHMENTS:
          if (this.attachmentsButton.disabled) {
            return false;
          }

          break;

        default:
          console.error("PDFSidebar._switchView: \"".concat(view, "\" is not a valid view."));
          return false;
      }

      this.active = view;
      this.thumbnailButton.classList.toggle('toggled', view === SidebarView.THUMBS);
      this.outlineButton.classList.toggle('toggled', view === SidebarView.OUTLINE);
      this.attachmentsButton.classList.toggle('toggled', view === SidebarView.ATTACHMENTS);
      this.thumbnailView.classList.toggle('hidden', view !== SidebarView.THUMBS);
      this.outlineView.classList.toggle('hidden', view !== SidebarView.OUTLINE);
      this.attachmentsView.classList.toggle('hidden', view !== SidebarView.ATTACHMENTS);

      if (forceOpen && !this.isOpen) {
        this.open();
        return true;
      }

      if (shouldForceRendering) {
        this._updateThumbnailViewer();

        this._forceRendering();
      }

      if (isViewChanged) {
        this._dispatchEvent();
      }

      this._hideUINotification(this.active);

      return isViewChanged;
    }
  }, {
    key: "open",
    value: function open() {
      if (this.isOpen) {
        return;
      }

      this.isOpen = true;
      this.toggleButton.classList.add('toggled');
      this.outerContainer.classList.add('sidebarMoving', 'sidebarOpen');

      if (this.active === SidebarView.THUMBS) {
        this._updateThumbnailViewer();
      }

      this._forceRendering();

      this._dispatchEvent();

      this._hideUINotification(this.active);
    }
  }, {
    key: "close",
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
    key: "toggle",
    value: function toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
  }, {
    key: "_dispatchEvent",
    value: function _dispatchEvent() {
      this.eventBus.dispatch('sidebarviewchanged', {
        source: this,
        view: this.visibleView
      });
    }
  }, {
    key: "_forceRendering",
    value: function _forceRendering() {
      if (this.onToggled) {
        this.onToggled();
      } else {
        this.pdfViewer.forceRendering();
        this.pdfThumbnailViewer.forceRendering();
      }
    }
  }, {
    key: "_updateThumbnailViewer",
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
    key: "_showUINotification",
    value: function _showUINotification(view) {
      var _this = this;

      if (this._disableNotification) {
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
    key: "_hideUINotification",
    value: function _hideUINotification(view) {
      var _this2 = this;

      if (this._disableNotification) {
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
    key: "_addEventListeners",
    value: function _addEventListeners() {
      var _this3 = this;

      this.viewerContainer.addEventListener('transitionend', function (evt) {
        if (evt.target === _this3.viewerContainer) {
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
        _this3.eventBus.dispatch('toggleoutlinetree', {
          source: _this3
        });
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
    key: "visibleView",
    get: function get() {
      return this.isOpen ? this.active : SidebarView.NONE;
    }
  }, {
    key: "isThumbnailViewVisible",
    get: function get() {
      return this.isOpen && this.active === SidebarView.THUMBS;
    }
  }, {
    key: "isOutlineViewVisible",
    get: function get() {
      return this.isOpen && this.active === SidebarView.OUTLINE;
    }
  }, {
    key: "isAttachmentsViewVisible",
    get: function get() {
      return this.isOpen && this.active === SidebarView.ATTACHMENTS;
    }
  }]);

  return PDFSidebar;
}();

exports.PDFSidebar = PDFSidebar;