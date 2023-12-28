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

import {
  CursorTool,
  ScrollMode,
  SpreadMode,
  toggleCheckedBtn,
  toggleExpandedBtn,
} from "./ui_utils.js";
import { PagesCountLimit } from "./pdf_viewer.js";

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
 * @property {HTMLAnchorElement} viewBookmarkButton - Button to obtain a
 *   bookmark link to the current location in the document.
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
   * @param {EventBus} eventBus
   */
  constructor(options, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.buttons = [
      {
        element: options.presentationModeButton,
        eventName: "presentationmode",
        close: true,
      },
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
        element: options.scrollPageButton,
        eventName: "switchscrollmode",
        eventDetails: { mode: ScrollMode.PAGE },
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
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this.buttons.push({
        element: options.openFileButton,
        eventName: "openfile",
        close: true,
      });
    }
    this.items = {
      firstPage: options.firstPageButton,
      lastPage: options.lastPageButton,
      pageRotateCw: options.pageRotateCwButton,
      pageRotateCcw: options.pageRotateCcwButton,
    };

    this.eventBus = eventBus;
    this.opened = false;

    // Bind the event listeners for click, cursor tool, and scroll/spread mode
    // actions.
    this.#bindClickListeners();
    this.#bindCursorToolsListener(options);
    this.#bindScrollModeListener(options);
    this.#bindSpreadModeListener(options);

    this.reset();
  }

  /**
   * @type {boolean}
   */
  get isOpen() {
    return this.opened;
  }

  setPageNumber(pageNumber) {
    this.pageNumber = pageNumber;
    this.#updateUIState();
  }

  setPagesCount(pagesCount) {
    this.pagesCount = pagesCount;
    this.#updateUIState();
  }

  reset() {
    this.pageNumber = 0;
    this.pagesCount = 0;
    this.#updateUIState();

    // Reset the Scroll/Spread buttons too, since they're document specific.
    this.eventBus.dispatch("secondarytoolbarreset", { source: this });
  }

  #updateUIState() {
    this.items.firstPage.disabled = this.pageNumber <= 1;
    this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
    this.items.pageRotateCw.disabled = this.pagesCount === 0;
    this.items.pageRotateCcw.disabled = this.pagesCount === 0;
  }

  #bindClickListeners() {
    // Button to toggle the visibility of the secondary toolbar.
    this.toggleButton.addEventListener("click", this.toggle.bind(this));

    // All items within the secondary toolbar.
    for (const { element, eventName, close, eventDetails } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          this.eventBus.dispatch(eventName, { source: this, ...eventDetails });
        }
        if (close) {
          this.close();
        }
        this.eventBus.dispatch("reporttelemetry", {
          source: this,
          details: {
            type: "buttons",
            data: { id: element.id },
          },
        });
      });
    }
  }

  #bindCursorToolsListener({ cursorSelectToolButton, cursorHandToolButton }) {
    this.eventBus._on("cursortoolchanged", ({ tool }) => {
      toggleCheckedBtn(cursorSelectToolButton, tool === CursorTool.SELECT);
      toggleCheckedBtn(cursorHandToolButton, tool === CursorTool.HAND);
    });
  }

  #bindScrollModeListener({
    scrollPageButton,
    scrollVerticalButton,
    scrollHorizontalButton,
    scrollWrappedButton,
    spreadNoneButton,
    spreadOddButton,
    spreadEvenButton,
  }) {
    const scrollModeChanged = ({ mode }) => {
      toggleCheckedBtn(scrollPageButton, mode === ScrollMode.PAGE);
      toggleCheckedBtn(scrollVerticalButton, mode === ScrollMode.VERTICAL);
      toggleCheckedBtn(scrollHorizontalButton, mode === ScrollMode.HORIZONTAL);
      toggleCheckedBtn(scrollWrappedButton, mode === ScrollMode.WRAPPED);

      // Permanently *disable* the Scroll buttons when PAGE-scrolling is being
      // enforced for *very* long/large documents; please see the `BaseViewer`.
      const forceScrollModePage =
        this.pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE;
      scrollPageButton.disabled = forceScrollModePage;
      scrollVerticalButton.disabled = forceScrollModePage;
      scrollHorizontalButton.disabled = forceScrollModePage;
      scrollWrappedButton.disabled = forceScrollModePage;

      // Temporarily *disable* the Spread buttons when horizontal scrolling is
      // enabled, since the non-default Spread modes doesn't affect the layout.
      const isHorizontal = mode === ScrollMode.HORIZONTAL;
      spreadNoneButton.disabled = isHorizontal;
      spreadOddButton.disabled = isHorizontal;
      spreadEvenButton.disabled = isHorizontal;
    };
    this.eventBus._on("scrollmodechanged", scrollModeChanged);

    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        scrollModeChanged({ mode: ScrollMode.VERTICAL });
      }
    });
  }

  #bindSpreadModeListener({
    spreadNoneButton,
    spreadOddButton,
    spreadEvenButton,
  }) {
    const spreadModeChanged = ({ mode }) => {
      toggleCheckedBtn(spreadNoneButton, mode === SpreadMode.NONE);
      toggleCheckedBtn(spreadOddButton, mode === SpreadMode.ODD);
      toggleCheckedBtn(spreadEvenButton, mode === SpreadMode.EVEN);
    };
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
    toggleExpandedBtn(this.toggleButton, true, this.toolbar);
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    toggleExpandedBtn(this.toggleButton, false, this.toolbar);
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }
}

export { SecondaryToolbar };
