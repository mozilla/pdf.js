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
exports.PDFSidebar = exports.SidebarView = void 0;

var _ui_utils = require("./ui_utils.js");

var _pdf_rendering_queue = require("./pdf_rendering_queue.js");

const UI_NOTIFICATION_CLASS = "pdfSidebarNotification";
const SidebarView = {
  UNKNOWN: -1,
  NONE: 0,
  THUMBS: 1,
  OUTLINE: 2,
  ATTACHMENTS: 3,
  LAYERS: 4
};
exports.SidebarView = SidebarView;

class PDFSidebar {
  constructor({
    elements,
    pdfViewer,
    pdfThumbnailViewer,
    eventBus,
    l10n = _ui_utils.NullL10n,
    disableNotification = false
  }) {
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

  reset() {
    this.isInitialViewSet = false;

    this._hideUINotification(null);

    this.switchView(SidebarView.THUMBS);
    this.outlineButton.disabled = false;
    this.attachmentsButton.disabled = false;
  }

  get visibleView() {
    return this.isOpen ? this.active : SidebarView.NONE;
  }

  get isThumbnailViewVisible() {
    return this.isOpen && this.active === SidebarView.THUMBS;
  }

  get isOutlineViewVisible() {
    return this.isOpen && this.active === SidebarView.OUTLINE;
  }

  get isAttachmentsViewVisible() {
    return this.isOpen && this.active === SidebarView.ATTACHMENTS;
  }

  setInitialView(view = SidebarView.NONE) {
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

  switchView(view, forceOpen = false) {
    this._switchView(view, forceOpen);
  }

  _switchView(view, forceOpen = false) {
    const isViewChanged = view !== this.active;
    let shouldForceRendering = false;

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
        console.error(`PDFSidebar._switchView: "${view}" is not a valid view.`);
        return false;
    }

    this.active = view;
    this.thumbnailButton.classList.toggle("toggled", view === SidebarView.THUMBS);
    this.outlineButton.classList.toggle("toggled", view === SidebarView.OUTLINE);
    this.attachmentsButton.classList.toggle("toggled", view === SidebarView.ATTACHMENTS);
    this.thumbnailView.classList.toggle("hidden", view !== SidebarView.THUMBS);
    this.outlineView.classList.toggle("hidden", view !== SidebarView.OUTLINE);
    this.attachmentsView.classList.toggle("hidden", view !== SidebarView.ATTACHMENTS);

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

  open() {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.toggleButton.classList.add("toggled");
    this.outerContainer.classList.add("sidebarMoving", "sidebarOpen");

    if (this.active === SidebarView.THUMBS) {
      this._updateThumbnailViewer();
    }

    this._forceRendering();

    this._dispatchEvent();

    this._hideUINotification(this.active);
  }

  close() {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.toggleButton.classList.remove("toggled");
    this.outerContainer.classList.add("sidebarMoving");
    this.outerContainer.classList.remove("sidebarOpen");

    this._forceRendering();

    this._dispatchEvent();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  _dispatchEvent() {
    this.eventBus.dispatch("sidebarviewchanged", {
      source: this,
      view: this.visibleView
    });
  }

  _forceRendering() {
    if (this.onToggled) {
      this.onToggled();
    } else {
      this.pdfViewer.forceRendering();
      this.pdfThumbnailViewer.forceRendering();
    }
  }

  _updateThumbnailViewer() {
    const {
      pdfViewer,
      pdfThumbnailViewer
    } = this;
    const pagesCount = pdfViewer.pagesCount;

    for (let pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
      const pageView = pdfViewer.getPageView(pageIndex);

      if (pageView && pageView.renderingState === _pdf_rendering_queue.RenderingStates.FINISHED) {
        const thumbnailView = pdfThumbnailViewer.getThumbnail(pageIndex);
        thumbnailView.setImage(pageView);
      }
    }

    pdfThumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
  }

  _showUINotification(view) {
    if (this._disableNotification) {
      return;
    }

    this.l10n.get("toggle_sidebar_notification.title", null, "Toggle Sidebar (document contains outline/attachments)").then(msg => {
      this.toggleButton.title = msg;
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

  _hideUINotification(view) {
    if (this._disableNotification) {
      return;
    }

    const removeNotification = sidebarView => {
      switch (sidebarView) {
        case SidebarView.OUTLINE:
          this.outlineButton.classList.remove(UI_NOTIFICATION_CLASS);
          break;

        case SidebarView.ATTACHMENTS:
          this.attachmentsButton.classList.remove(UI_NOTIFICATION_CLASS);
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

    this.l10n.get("toggle_sidebar.title", null, "Toggle Sidebar").then(msg => {
      this.toggleButton.title = msg;
    });
  }

  _addEventListeners() {
    this.viewerContainer.addEventListener("transitionend", evt => {
      if (evt.target === this.viewerContainer) {
        this.outerContainer.classList.remove("sidebarMoving");
      }
    });
    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });
    this.thumbnailButton.addEventListener("click", () => {
      this.switchView(SidebarView.THUMBS);
    });
    this.outlineButton.addEventListener("click", () => {
      this.switchView(SidebarView.OUTLINE);
    });
    this.outlineButton.addEventListener("dblclick", () => {
      this.eventBus.dispatch("toggleoutlinetree", {
        source: this
      });
    });
    this.attachmentsButton.addEventListener("click", () => {
      this.switchView(SidebarView.ATTACHMENTS);
    });

    this.eventBus._on("outlineloaded", evt => {
      const outlineCount = evt.outlineCount;
      this.outlineButton.disabled = !outlineCount;

      if (outlineCount) {
        this._showUINotification(SidebarView.OUTLINE);
      } else if (this.active === SidebarView.OUTLINE) {
        this.switchView(SidebarView.THUMBS);
      }
    });

    this.eventBus._on("attachmentsloaded", evt => {
      if (evt.attachmentsCount) {
        this.attachmentsButton.disabled = false;

        this._showUINotification(SidebarView.ATTACHMENTS);

        return;
      }

      Promise.resolve().then(() => {
        if (this.attachmentsView.hasChildNodes()) {
          return;
        }

        this.attachmentsButton.disabled = true;

        if (this.active === SidebarView.ATTACHMENTS) {
          this.switchView(SidebarView.THUMBS);
        }
      });
    });

    this.eventBus._on("presentationmodechanged", evt => {
      if (!evt.active && !evt.switchInProgress && this.isThumbnailViewVisible) {
        this._updateThumbnailViewer();
      }
    });
  }

}

exports.PDFSidebar = PDFSidebar;