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

/** @typedef {import("./event_utils.js").EventBus} EventBus */

import {
  docStyle,
  PresentationModeState,
  SidebarView,
  toggleExpandedBtn,
  toggleSelectedBtn,
} from "./ui_utils.js";
import { Menu } from "./menu.js";
import { Sidebar } from "./sidebar.js";

const SIDEBAR_WIDTH_VAR = "--viewsManager-width";
const SIDEBAR_RESIZING_CLASS = "viewsManagerResizing";
const UI_NOTIFICATION_CLASS = "pdfSidebarNotification";

/**
 * @typedef {Object} PDFSidebarOptions
 * @property {PDFSidebarElements} elements - The DOM elements.
 * @property {EventBus} eventBus - The application event bus.
 * @property {L10n} l10n - The localization service.
 */

/**
 * @typedef {Object} PDFSidebarElements
 * @property {HTMLDivElement} outerContainer - The outer container
 *   (encasing both the viewer and sidebar elements).
 * @property {HTMLDivElement} sidebarContainer - The sidebar container
 *   (in which the views are placed).
 * @property {HTMLButtonElement} toggleButton - The button used for
 *   opening/closing the sidebar.
 * @property {HTMLDivElement} resizer - The DOM element that can be dragged in
 *   order to adjust the width of the sidebar.
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
 * @property {HTMLButtonElement} currentOutlineItemButton - The button used to
 *   find the current outline item.
 */

class ViewsManager extends Sidebar {
  static #l10nDescription = null;

  /**
   * @param {PDFSidebarOptions} options
   */
  constructor({
    elements: {
      outerContainer,
      sidebarContainer,
      toggleButton,
      resizer,
      thumbnailButton,
      outlineButton,
      attachmentsButton,
      layersButton,
      thumbnailsView,
      outlinesView,
      attachmentsView,
      layersView,
      viewsManagerCurrentOutlineButton,
      viewsManagerSelectorButton,
      viewsManagerSelectorOptions,
      viewsManagerHeaderLabel,
    },
    eventBus,
    l10n,
  }) {
    super(
      {
        sidebar: sidebarContainer,
        resizer,
        toggleButton,
      },
      l10n.getDirection() === "ltr",
      /* isResizerOnTheLeft = */ false
    );
    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;
    this.isInitialEventDispatched = false;

    /**
     * Callback used when the sidebar has been opened/closed, to ensure that
     * the viewers (PDFViewer/PDFThumbnailViewer) are updated correctly.
     */
    this.onToggled = null;
    this.onUpdateThumbnails = null;

    this.outerContainer = outerContainer;
    this.sidebarContainer = sidebarContainer;
    this.toggleButton = toggleButton;
    this.resizer = resizer;

    this.thumbnailButton = thumbnailButton;
    this.outlineButton = outlineButton;
    this.attachmentsButton = attachmentsButton;
    this.layersButton = layersButton;

    this.thumbnailsView = thumbnailsView;
    this.outlinesView = outlinesView;
    this.attachmentsView = attachmentsView;
    this.layersView = layersView;

    this.viewsManagerCurrentOutlineButton = viewsManagerCurrentOutlineButton;
    this.viewsManagerHeaderLabel = viewsManagerHeaderLabel;

    this.eventBus = eventBus;

    this.menu = new Menu(
      viewsManagerSelectorOptions,
      viewsManagerSelectorButton,
      [thumbnailButton, outlineButton, attachmentsButton, layersButton]
    );

    ViewsManager.#l10nDescription ||= Object.freeze({
      pagesTitle: "pdfjs-views-manager-pages-title",
      outlinesTitle: "pdfjs-views-manager-outlines-title",
      attachmentsTitle: "pdfjs-views-manager-attachments-title",
      layersTitle: "pdfjs-views-manager-layers-title",
      notificationButton: "pdfjs-toggle-views-manager-notification-button",
      toggleButton: "pdfjs-toggle-views-manager-button",
    });

    this.#addEventListeners();
  }

  reset() {
    this.isInitialViewSet = false;
    this.isInitialEventDispatched = false;

    this.#hideUINotification(/* reset = */ true);
    this.switchView(SidebarView.THUMBS);

    this.outlineButton.disabled =
      this.attachmentsButton.disabled =
      this.layersButton.disabled =
        false;
    this.viewsManagerCurrentOutlineButton.disabled = true;
  }

  /**
   * @type {number} One of the values in {SidebarView}.
   */
  get visibleView() {
    return this.isOpen ? this.active : SidebarView.NONE;
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
      this.#dispatchEvent();
      return;
    }
    this.switchView(view, /* forceOpen = */ true);

    // Prevent dispatching two back-to-back "sidebarviewchanged" events,
    // since `this.switchView` dispatched the event if the view changed.
    if (!this.isInitialEventDispatched) {
      this.#dispatchEvent();
    }
  }

  /**
   * @param {number} view - The sidebar view that should be switched to,
   *                        must be one of the values in {SidebarView}.
   * @param {boolean} [forceOpen] - Ensure that the sidebar is open.
   *                                The default value is `false`.
   */
  switchView(view, forceOpen = false) {
    const isViewChanged = view !== this.active;
    let forceRendering = false;
    let titleL10nId = null;

    switch (view) {
      case SidebarView.NONE:
        if (this.isOpen) {
          this.close();
        }
        return; // Closing will trigger rendering and dispatch the event.
      case SidebarView.THUMBS:
        titleL10nId = "pagesTitle";
        if (this.isOpen && isViewChanged) {
          forceRendering = true;
        }
        break;
      case SidebarView.OUTLINE:
        titleL10nId = "outlinesTitle";
        if (this.outlineButton.disabled) {
          return;
        }
        break;
      case SidebarView.ATTACHMENTS:
        titleL10nId = "attachmentsTitle";
        if (this.attachmentsButton.disabled) {
          return;
        }
        break;
      case SidebarView.LAYERS:
        titleL10nId = "layersTitle";
        if (this.layersButton.disabled) {
          return;
        }
        break;
      default:
        console.error(`PDFSidebar.switchView: "${view}" is not a valid view.`);
        return;
    }

    this.viewsManagerCurrentOutlineButton.hidden = view !== SidebarView.OUTLINE;
    this.viewsManagerHeaderLabel.setAttribute(
      "data-l10n-id",
      ViewsManager.#l10nDescription[titleL10nId] || ""
    );

    // Update the active view *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.active = view;

    // Update the CSS classes (and aria attributes), for all buttons and views.
    toggleSelectedBtn(
      this.thumbnailButton,
      view === SidebarView.THUMBS,
      this.thumbnailsView
    );
    toggleSelectedBtn(
      this.outlineButton,
      view === SidebarView.OUTLINE,
      this.outlinesView
    );
    toggleSelectedBtn(
      this.attachmentsButton,
      view === SidebarView.ATTACHMENTS,
      this.attachmentsView
    );
    toggleSelectedBtn(
      this.layersButton,
      view === SidebarView.LAYERS,
      this.layersView
    );

    if (forceOpen && !this.isOpen) {
      this.open();
      return; // Opening will trigger rendering and dispatch the event.
    }
    if (forceRendering) {
      this.onUpdateThumbnails();
      this.onToggled();
    }
    if (isViewChanged) {
      this.#dispatchEvent();
    }
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.onResizing(this.width);
    this._sidebar.hidden = false;
    toggleExpandedBtn(this.toggleButton, true);
    this.switchView(this.active);

    // Changing `hidden` above may cause a reflow which would prevent the
    // CSS transition from being applied correctly, so we need to delay
    // adding the relevant CSS classes.
    queueMicrotask(() => {
      this.outerContainer.classList.add(
        "viewsManagerMoving",
        "viewsManagerOpen"
      );
    });
    if (this.active === SidebarView.THUMBS) {
      this.onUpdateThumbnails();
    }
    this.onToggled();
    this.#dispatchEvent();

    this.#hideUINotification();
  }

  close(evt = null) {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this._sidebar.hidden = true;
    toggleExpandedBtn(this.toggleButton, false);

    this.outerContainer.classList.add("viewsManagerMoving");
    this.outerContainer.classList.remove("viewsManagerOpen");

    this.onToggled();
    this.#dispatchEvent();

    if (evt?.detail > 0) {
      // Remove focus from the toggleButton if it's clicked (see issue 17361).
      this.toggleButton.blur();
    }
  }

  toggle(evt = null) {
    super.toggle();
    if (this.isOpen) {
      this.close(evt);
    } else {
      this.open();
    }
  }

  #dispatchEvent() {
    if (this.isInitialViewSet) {
      this.isInitialEventDispatched ||= true;
    }

    this.eventBus.dispatch("sidebarviewchanged", {
      source: this,
      view: this.visibleView,
    });
  }

  #showUINotification() {
    this.toggleButton.setAttribute(
      "data-l10n-id",
      ViewsManager.#l10nDescription.notificationButton
    );

    if (!this.isOpen) {
      // Only show the notification on the `toggleButton` if the sidebar is
      // currently closed, to avoid unnecessarily bothering the user.
      this.toggleButton.classList.add(UI_NOTIFICATION_CLASS);
    }
  }

  #hideUINotification(reset = false) {
    if (this.isOpen || reset) {
      // Only hide the notification on the `toggleButton` if the sidebar is
      // currently open, or when the current PDF document is being closed.
      this.toggleButton.classList.remove(UI_NOTIFICATION_CLASS);
    }

    if (reset) {
      this.toggleButton.setAttribute(
        "data-l10n-id",
        ViewsManager.#l10nDescription.toggleButton
      );
    }
  }

  #addEventListeners() {
    const { eventBus, outerContainer } = this;

    this.sidebarContainer.addEventListener("transitionend", evt => {
      if (evt.target === this.sidebarContainer) {
        outerContainer.classList.remove("viewsManagerMoving");
        // Ensure that rendering is triggered after opening/closing the sidebar.
        eventBus.dispatch("resize", { source: this });
      }
    });

    // Buttons for switching views.
    this.thumbnailButton.addEventListener("click", () => {
      this.switchView(SidebarView.THUMBS);
    });

    this.outlineButton.addEventListener("click", () => {
      this.switchView(SidebarView.OUTLINE);
    });
    this.outlineButton.addEventListener("dblclick", () => {
      eventBus.dispatch("toggleoutlinetree", { source: this });
    });

    this.attachmentsButton.addEventListener("click", () => {
      this.switchView(SidebarView.ATTACHMENTS);
    });

    this.layersButton.addEventListener("click", () => {
      this.switchView(SidebarView.LAYERS);
    });
    this.layersButton.addEventListener("dblclick", () => {
      eventBus.dispatch("resetlayers", { source: this });
    });

    // Buttons for view-specific options.
    this.viewsManagerCurrentOutlineButton.addEventListener("click", () => {
      eventBus.dispatch("currentoutlineitem", { source: this });
    });

    // Disable/enable views.
    const onTreeLoaded = (count, button, view) => {
      button.disabled = !count;

      if (count) {
        this.#showUINotification();
      } else if (this.active === view) {
        // If the `view` was opened by the user during document load,
        // switch away from it if it turns out to be empty.
        this.switchView(SidebarView.THUMBS);
      }
    };

    eventBus._on("outlineloaded", evt => {
      onTreeLoaded(evt.outlineCount, this.outlineButton, SidebarView.OUTLINE);

      evt.currentOutlineItemPromise.then(enabled => {
        if (!this.isInitialViewSet) {
          return;
        }
        this.viewsManagerCurrentOutlineButton.disabled = !enabled;
      });
    });

    eventBus._on("attachmentsloaded", evt => {
      onTreeLoaded(
        evt.attachmentsCount,
        this.attachmentsButton,
        SidebarView.ATTACHMENTS
      );
    });

    eventBus._on("layersloaded", evt => {
      onTreeLoaded(evt.layersCount, this.layersButton, SidebarView.LAYERS);
    });

    // Update the thumbnailViewer, if visible, when exiting presentation mode.
    eventBus._on("presentationmodechanged", evt => {
      if (
        evt.state === PresentationModeState.NORMAL &&
        this.visibleView === SidebarView.THUMBS
      ) {
        this.onUpdateThumbnails();
      }
    });
  }

  onStartResizing() {
    this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
  }

  onStopResizing() {
    this.eventBus.dispatch("resize", { source: this });
    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
  }

  onResizing(newWidth) {
    docStyle.setProperty(SIDEBAR_WIDTH_VAR, `${newWidth}px`);
  }
}

export { ViewsManager };
