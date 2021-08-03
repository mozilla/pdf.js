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

import { PresentationModeState, SidebarView } from "./ui_utils.js";
import { RenderingStates } from "./pdf_rendering_queue.js";

const UI_NOTIFICATION_CLASS = "pdfSidebarNotification";

/**
 * @typedef {Object} PDFSidebarOptions
 * @property {PDFSidebarElements} elements - The DOM elements.
 * @property {PDFViewer} pdfViewer - The document viewer.
 * @property {PDFThumbnailViewer} pdfThumbnailViewer - The thumbnail viewer.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IL10n} l10n - The localization service.
 */

/**
 * @typedef {Object} PDFSidebarElements
 * @property {HTMLDivElement} outerContainer - The outer container
 *   (encasing both the viewer and sidebar elements).
 * @property {HTMLDivElement} viewerContainer - The viewer container
 *   (in which the viewer element is placed).
 * @property {HTMLButtonElement} toggleButton - The button used for
 *   opening/closing the sidebar.
 * @property {HTMLButtonElement} thumbnailButton - The button used to show
 *   the thumbnail view.
 * @property {HTMLButtonElement} outlineButton - The button used to show
 *   the outline view.
 * @property {HTMLButtonElement} attachmentsButton - The button used to show
 *   the attachments view.
 * @property {HTMLButtonElement} layersButton - The button used to show
 *   the layers view.
 * @property {HTMLDivElement} thumbnailView - The container in which
 *   the thumbnails are placed.
 * @property {HTMLDivElement} outlineView - The container in which
 *   the outline is placed.
 * @property {HTMLDivElement} attachmentsView - The container in which
 *   the attachments are placed.
 * @property {HTMLDivElement} layersView - The container in which
 *   the layers are placed.
 * @property {HTMLDivElement} outlineOptionsContainer - The container in which
 *   the outline view-specific option button(s) are placed.
 * @property {HTMLButtonElement} currentOutlineItemButton - The button used to
 *   find the current outline item.
 */

class PDFSidebar {
  /**
   * @param {PDFSidebarOptions} options
   */
  constructor({ elements, pdfViewer, pdfThumbnailViewer, eventBus, l10n }) {
    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;

    /**
     * Callback used when the sidebar has been opened/closed, to ensure that
     * the viewers (PDFViewer/PDFThumbnailViewer) are updated correctly.
     */
    this.onToggled = null;

    this.pdfViewer = pdfViewer;
    this.pdfThumbnailViewer = pdfThumbnailViewer;

    this.outerContainer = elements.outerContainer;
    this.viewerContainer = elements.viewerContainer;
    this.toggleButton = elements.toggleButton;

    this.thumbnailButton = elements.thumbnailButton;
    this.outlineButton = elements.outlineButton;
    this.attachmentsButton = elements.attachmentsButton;
    this.layersButton = elements.layersButton;

    this.thumbnailView = elements.thumbnailView;
    this.outlineView = elements.outlineView;
    this.attachmentsView = elements.attachmentsView;
    this.layersView = elements.layersView;

    this._outlineOptionsContainer = elements.outlineOptionsContainer;
    this._currentOutlineItemButton = elements.currentOutlineItemButton;

    this.eventBus = eventBus;
    this.l10n = l10n;

    this._addEventListeners();
  }

  reset() {
    this.isInitialViewSet = false;

    this._hideUINotification(/* reset = */ true);
    this.switchView(SidebarView.THUMBS);

    this.outlineButton.disabled = false;
    this.attachmentsButton.disabled = false;
    this.layersButton.disabled = false;
    this._currentOutlineItemButton.disabled = true;
  }

  /**
   * @type {number} One of the values in {SidebarView}.
   */
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

  get isLayersViewVisible() {
    return this.isOpen && this.active === SidebarView.LAYERS;
  }

  /**
   * @param {number} view - The sidebar view that should become visible,
   *                        must be one of the values in {SidebarView}.
   */
  setInitialView(view = SidebarView.NONE) {
    if (this.isInitialViewSet) {
      return;
    }
    this.isInitialViewSet = true;

    // If the user has already manually opened the sidebar, immediately closing
    // it would be bad UX; also ignore the "unknown" sidebar view value.
    if (view === SidebarView.NONE || view === SidebarView.UNKNOWN) {
      this._dispatchEvent();
      return;
    }
    // Prevent dispatching two back-to-back `sidebarviewchanged` events,
    // since `this._switchView` dispatched the event if the view changed.
    if (!this._switchView(view, /* forceOpen */ true)) {
      this._dispatchEvent();
    }
  }

  /**
   * @param {number} view - The sidebar view that should be switched to,
   *                        must be one of the values in {SidebarView}.
   * @param {boolean} [forceOpen] - Ensure that the sidebar is open.
   *                                The default value is `false`.
   */
  switchView(view, forceOpen = false) {
    this._switchView(view, forceOpen);
  }

  /**
   * @returns {boolean} Indicating if `this._dispatchEvent` was called.
   * @private
   */
  _switchView(view, forceOpen = false) {
    const isViewChanged = view !== this.active;
    let shouldForceRendering = false;

    switch (view) {
      case SidebarView.NONE:
        if (this.isOpen) {
          this.close();
          return true; // Closing will trigger rendering and dispatch the event.
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
      case SidebarView.LAYERS:
        if (this.layersButton.disabled) {
          return false;
        }
        break;
      default:
        console.error(`PDFSidebar._switchView: "${view}" is not a valid view.`);
        return false;
    }
    // Update the active view *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.active = view;

    // Update the CSS classes, for all buttons...
    this.thumbnailButton.classList.toggle(
      "toggled",
      view === SidebarView.THUMBS
    );
    this.outlineButton.classList.toggle(
      "toggled",
      view === SidebarView.OUTLINE
    );
    this.attachmentsButton.classList.toggle(
      "toggled",
      view === SidebarView.ATTACHMENTS
    );
    this.layersButton.classList.toggle("toggled", view === SidebarView.LAYERS);
    // ... and for all views.
    this.thumbnailView.classList.toggle("hidden", view !== SidebarView.THUMBS);
    this.outlineView.classList.toggle("hidden", view !== SidebarView.OUTLINE);
    this.attachmentsView.classList.toggle(
      "hidden",
      view !== SidebarView.ATTACHMENTS
    );
    this.layersView.classList.toggle("hidden", view !== SidebarView.LAYERS);

    // Finally, update view-specific CSS classes.
    this._outlineOptionsContainer.classList.toggle(
      "hidden",
      view !== SidebarView.OUTLINE
    );

    if (forceOpen && !this.isOpen) {
      this.open();
      return true; // Opening will trigger rendering and dispatch the event.
    }
    if (shouldForceRendering) {
      this._updateThumbnailViewer();
      this._forceRendering();
    }
    if (isViewChanged) {
      this._dispatchEvent();
    }
    return isViewChanged;
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.toggleButton.classList.add("toggled");
    this.toggleButton.setAttribute("aria-expanded", "true");

    this.outerContainer.classList.add("sidebarMoving", "sidebarOpen");

    if (this.active === SidebarView.THUMBS) {
      this._updateThumbnailViewer();
    }
    this._forceRendering();
    this._dispatchEvent();

    this._hideUINotification();
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.toggleButton.classList.remove("toggled");
    this.toggleButton.setAttribute("aria-expanded", "false");

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

  /**
   * @private
   */
  _dispatchEvent() {
    this.eventBus.dispatch("sidebarviewchanged", {
      source: this,
      view: this.visibleView,
    });
  }

  /**
   * @private
   */
  _forceRendering() {
    if (this.onToggled) {
      this.onToggled();
    } else {
      // Fallback
      this.pdfViewer.forceRendering();
      this.pdfThumbnailViewer.forceRendering();
    }
  }

  /**
   * @private
   */
  _updateThumbnailViewer() {
    const { pdfViewer, pdfThumbnailViewer } = this;

    // Use the rendered pages to set the corresponding thumbnail images.
    const pagesCount = pdfViewer.pagesCount;
    for (let pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
      const pageView = pdfViewer.getPageView(pageIndex);
      if (pageView?.renderingState === RenderingStates.FINISHED) {
        const thumbnailView = pdfThumbnailViewer.getThumbnail(pageIndex);
        thumbnailView.setImage(pageView);
      }
    }
    pdfThumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
  }

  /**
   * @private
   */
  _showUINotification() {
    this.l10n.get("toggle_sidebar_notification2.title").then(msg => {
      this.toggleButton.title = msg;
    });

    if (!this.isOpen) {
      // Only show the notification on the `toggleButton` if the sidebar is
      // currently closed, to avoid unnecessarily bothering the user.
      this.toggleButton.classList.add(UI_NOTIFICATION_CLASS);
    }
  }

  /**
   * @private
   */
  _hideUINotification(reset = false) {
    if (this.isOpen || reset) {
      // Only hide the notification on the `toggleButton` if the sidebar is
      // currently open, or when the current PDF document is being closed.
      this.toggleButton.classList.remove(UI_NOTIFICATION_CLASS);
    }

    if (reset) {
      this.l10n.get("toggle_sidebar.title").then(msg => {
        this.toggleButton.title = msg;
      });
    }
  }

  /**
   * @private
   */
  _addEventListeners() {
    this.viewerContainer.addEventListener("transitionend", evt => {
      if (evt.target === this.viewerContainer) {
        this.outerContainer.classList.remove("sidebarMoving");
      }
    });

    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });

    // Buttons for switching views.
    this.thumbnailButton.addEventListener("click", () => {
      this.switchView(SidebarView.THUMBS);
    });

    this.outlineButton.addEventListener("click", () => {
      this.switchView(SidebarView.OUTLINE);
    });
    this.outlineButton.addEventListener("dblclick", () => {
      this.eventBus.dispatch("toggleoutlinetree", { source: this });
    });

    this.attachmentsButton.addEventListener("click", () => {
      this.switchView(SidebarView.ATTACHMENTS);
    });

    this.layersButton.addEventListener("click", () => {
      this.switchView(SidebarView.LAYERS);
    });
    this.layersButton.addEventListener("dblclick", () => {
      this.eventBus.dispatch("resetlayers", { source: this });
    });

    // Buttons for view-specific options.
    this._currentOutlineItemButton.addEventListener("click", () => {
      this.eventBus.dispatch("currentoutlineitem", { source: this });
    });

    // Disable/enable views.
    const onTreeLoaded = (count, button, view) => {
      button.disabled = !count;

      if (count) {
        this._showUINotification();
      } else if (this.active === view) {
        // If the `view` was opened by the user during document load,
        // switch away from it if it turns out to be empty.
        this.switchView(SidebarView.THUMBS);
      }
    };

    this.eventBus._on("outlineloaded", evt => {
      onTreeLoaded(evt.outlineCount, this.outlineButton, SidebarView.OUTLINE);

      evt.currentOutlineItemPromise.then(enabled => {
        if (!this.isInitialViewSet) {
          return;
        }
        this._currentOutlineItemButton.disabled = !enabled;
      });
    });

    this.eventBus._on("attachmentsloaded", evt => {
      onTreeLoaded(
        evt.attachmentsCount,
        this.attachmentsButton,
        SidebarView.ATTACHMENTS
      );
    });

    this.eventBus._on("layersloaded", evt => {
      onTreeLoaded(evt.layersCount, this.layersButton, SidebarView.LAYERS);
    });

    // Update the thumbnailViewer, if visible, when exiting presentation mode.
    this.eventBus._on("presentationmodechanged", evt => {
      if (
        evt.state === PresentationModeState.NORMAL &&
        this.isThumbnailViewVisible
      ) {
        this._updateThumbnailViewer();
      }
    });
  }
}

export { PDFSidebar };
