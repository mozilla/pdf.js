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

import { SCROLLBAR_PADDING, ScrollMode, SpreadMode } from "./ui_utils.js";
import { CursorTool } from "./pdf_cursor_tools.js";
import { PDFSinglePageViewer } from "./pdf_single_page_viewer.js";

/**
 * @typedef {Object} SecondaryToolbarOptions
 * @property {HTMLDivElement} toolbar - Container for the secondary toolbar.
 * @property {HTMLButtonElement} toggleButton - Button to toggle the visibility
 *   of the secondary toolbar.
 * @property {HTMLDivElement} toolbarButtonContainer - Container where all the
 *   toolbar buttons are placed. The maximum height of the toolbar is controlled
 *   dynamically by adjusting the 'max-height' CSS property of this DOM element.
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
 * @property {HTMLButtonElement} cursorSelectToolButton - Button to enable the
 *   select tool.
 * @property {HTMLButtonElement} cursorHandToolButton - Button to enable the
 *   hand tool.
 * @property {HTMLButtonElement} documentPropertiesButton - Button for opening
 *   the document properties dialog.
 */

class SecondaryToolbar {
  /**
   * @param {SecondaryToolbarOptions} options
   * @param {HTMLDivElement} mainContainer
   * @param {EventBus} eventBus
   */
  constructor(options, mainContainer, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.toolbarButtonContainer = options.toolbarButtonContainer;
    this.buttons = [
      {
        element: options.presentationModeButton,
        eventName: "presentationmode",
        close: true,
      },
      { element: options.openFileButton, eventName: "openfile", close: true },
      { element: options.printButton, eventName: "print", close: true },
      { element: options.downloadButton, eventName: "download", close: true },
      { element: options.viewBookmarkButton, eventName: null, close: true },
      { element: options.firstPageButton, eventName: "firstpage", close: true },
      { element: options.lastPageButton, eventName: "lastpage", close: true },
      {
        element: options.pageRotateCwButton,
        eventName: "rotatecw",
        close: false,
      },
      {
        element: options.pageRotateCcwButton,
        eventName: "rotateccw",
        close: false,
      },
      {
        element: options.cursorSelectToolButton,
        eventName: "switchcursortool",
        eventDetails: { tool: CursorTool.SELECT },
        close: true,
      },
      {
        element: options.cursorHandToolButton,
        eventName: "switchcursortool",
        eventDetails: { tool: CursorTool.HAND },
        close: true,
      },
      {
        element: options.scrollVerticalButton,
        eventName: "switchscrollmode",
        eventDetails: { mode: ScrollMode.VERTICAL },
        close: true,
      },
      {
        element: options.scrollHorizontalButton,
        eventName: "switchscrollmode",
        eventDetails: { mode: ScrollMode.HORIZONTAL },
        close: true,
      },
      {
        element: options.scrollWrappedButton,
        eventName: "switchscrollmode",
        eventDetails: { mode: ScrollMode.WRAPPED },
        close: true,
      },
      {
        element: options.spreadNoneButton,
        eventName: "switchspreadmode",
        eventDetails: { mode: SpreadMode.NONE },
        close: true,
      },
      {
        element: options.spreadOddButton,
        eventName: "switchspreadmode",
        eventDetails: { mode: SpreadMode.ODD },
        close: true,
      },
      {
        element: options.spreadEvenButton,
        eventName: "switchspreadmode",
        eventDetails: { mode: SpreadMode.EVEN },
        close: true,
      },
      {
        element: options.documentPropertiesButton,
        eventName: "documentproperties",
        close: true,
      },
    ];
    this.items = {
      firstPage: options.firstPageButton,
      lastPage: options.lastPageButton,
      pageRotateCw: options.pageRotateCwButton,
      pageRotateCcw: options.pageRotateCcwButton,
    };

    this.mainContainer = mainContainer;
    this.eventBus = eventBus;

    this.opened = false;
    this.containerHeight = null;
    this.previousContainerHeight = null;

    this.reset();

    // Bind the event listeners for click, cursor tool, and scroll/spread mode
    // actions.
    this._bindClickListeners();
    this._bindCursorToolsListener(options);
    this._bindScrollModeListener(options);
    this._bindSpreadModeListener(options);

    // Bind the event listener for adjusting the 'max-height' of the toolbar.
    this.eventBus._on("resize", this._setMaxHeight.bind(this));

    // Hide the Scroll/Spread mode buttons, when they're not applicable to the
    // current `BaseViewer` instance (in particular `PDFSinglePageViewer`).
    this.eventBus._on("baseviewerinit", evt => {
      if (evt.source instanceof PDFSinglePageViewer) {
        this.toolbarButtonContainer.classList.add(
          "hiddenScrollModeButtons",
          "hiddenSpreadModeButtons"
        );
      } else {
        this.toolbarButtonContainer.classList.remove(
          "hiddenScrollModeButtons",
          "hiddenSpreadModeButtons"
        );
      }
    });
  }

  /**
   * @type {boolean}
   */
  get isOpen() {
    return this.opened;
  }

  setPageNumber(pageNumber) {
    this.pageNumber = pageNumber;
    this._updateUIState();
  }

  setPagesCount(pagesCount) {
    this.pagesCount = pagesCount;
    this._updateUIState();
  }

  reset() {
    this.pageNumber = 0;
    this.pagesCount = 0;
    this._updateUIState();

    // Reset the Scroll/Spread buttons too, since they're document specific.
    this.eventBus.dispatch("secondarytoolbarreset", { source: this });
  }

  _updateUIState() {
    this.items.firstPage.disabled = this.pageNumber <= 1;
    this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
    this.items.pageRotateCw.disabled = this.pagesCount === 0;
    this.items.pageRotateCcw.disabled = this.pagesCount === 0;
  }

  _bindClickListeners() {
    // Button to toggle the visibility of the secondary toolbar.
    this.toggleButton.addEventListener("click", this.toggle.bind(this));

    // All items within the secondary toolbar.
    for (const { element, eventName, close, eventDetails } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          const details = { source: this };
          for (const property in eventDetails) {
            details[property] = eventDetails[property];
          }
          this.eventBus.dispatch(eventName, details);
        }
        if (close) {
          this.close();
        }
      });
    }
  }

  _bindCursorToolsListener(buttons) {
    this.eventBus._on("cursortoolchanged", function ({ tool }) {
      buttons.cursorSelectToolButton.classList.toggle(
        "toggled",
        tool === CursorTool.SELECT
      );
      buttons.cursorHandToolButton.classList.toggle(
        "toggled",
        tool === CursorTool.HAND
      );
    });
  }

  _bindScrollModeListener(buttons) {
    function scrollModeChanged({ mode }) {
      buttons.scrollVerticalButton.classList.toggle(
        "toggled",
        mode === ScrollMode.VERTICAL
      );
      buttons.scrollHorizontalButton.classList.toggle(
        "toggled",
        mode === ScrollMode.HORIZONTAL
      );
      buttons.scrollWrappedButton.classList.toggle(
        "toggled",
        mode === ScrollMode.WRAPPED
      );

      // Temporarily *disable* the Spread buttons when horizontal scrolling is
      // enabled, since the non-default Spread modes doesn't affect the layout.
      const isScrollModeHorizontal = mode === ScrollMode.HORIZONTAL;
      buttons.spreadNoneButton.disabled = isScrollModeHorizontal;
      buttons.spreadOddButton.disabled = isScrollModeHorizontal;
      buttons.spreadEvenButton.disabled = isScrollModeHorizontal;
    }
    this.eventBus._on("scrollmodechanged", scrollModeChanged);

    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        scrollModeChanged({ mode: ScrollMode.VERTICAL });
      }
    });
  }

  _bindSpreadModeListener(buttons) {
    function spreadModeChanged({ mode }) {
      buttons.spreadNoneButton.classList.toggle(
        "toggled",
        mode === SpreadMode.NONE
      );
      buttons.spreadOddButton.classList.toggle(
        "toggled",
        mode === SpreadMode.ODD
      );
      buttons.spreadEvenButton.classList.toggle(
        "toggled",
        mode === SpreadMode.EVEN
      );
    }
    this.eventBus._on("spreadmodechanged", spreadModeChanged);

    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        spreadModeChanged({ mode: SpreadMode.NONE });
      }
    });
  }

  open() {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this._setMaxHeight();

    this.toggleButton.classList.add("toggled");
    this.toggleButton.setAttribute("aria-expanded", "true");
    this.toolbar.classList.remove("hidden");
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.toolbar.classList.add("hidden");
    this.toggleButton.classList.remove("toggled");
    this.toggleButton.setAttribute("aria-expanded", "false");
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * @private
   */
  _setMaxHeight() {
    if (!this.opened) {
      return; // Only adjust the 'max-height' if the toolbar is visible.
    }
    this.containerHeight = this.mainContainer.clientHeight;

    if (this.containerHeight === this.previousContainerHeight) {
      return;
    }
    this.toolbarButtonContainer.style.maxHeight = `${
      this.containerHeight - SCROLLBAR_PADDING
    }px`;

    this.previousContainerHeight = this.containerHeight;
  }
}

export { SecondaryToolbar };
