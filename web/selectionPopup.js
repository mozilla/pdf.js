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

import { debounce } from "./ui_utils.js";
import axios from "./request.js";

/**
 * @typedef {Object} ToolbarOptions
 * @property {HTMLDivElement} container - Container for the secondary toolbar.
 * @property {HTMLButtonElement} popUpBtn - Container for the secondary toolbar.
 * @property {HTMLDivElement} commentContainer -
 * @property {HTMLButtonElement} commentSubmitBtn -
 * @property {HTMLTextAreaElement} commentTextArea -
 * @property {HTMLSpanElement} numPages - Label that contains number of pages.
 * @property {HTMLInputElement} pageNumber - Control for display and user input
 *   of the current page number.
 * @property {HTMLSpanElement} scaleSelectContainer - Container where scale
 *   controls are placed. The width is adjusted on UI initialization.
 * @property {HTMLSelectElement} scaleSelect - Scale selection control.
 * @property {HTMLOptionElement} customScaleOption - The item used to display
 *   a non-predefined scale.
 * @property {HTMLButtonElement} previous - Button to go to the previous page.
 * @property {HTMLButtonElement} next - Button to go to the next page.
 * @property {HTMLButtonElement} zoomIn - Button to zoom in the pages.
 * @property {HTMLButtonElement} zoomOut - Button to zoom out the pages.
 * @property {HTMLButtonElement} viewFind - Button to open find bar.
 * @property {HTMLButtonElement} openFile - Button to open a new document.
 * @property {HTMLButtonElement} presentationModeButton - Button to switch to
 *   presentation mode.
 * @property {HTMLButtonElement} download - Button to download the document.
 * @property {HTMLAElement} viewBookmark - Element to link current url of
 *   the page view.
 */

class SelectionPopUp {
  /**
   * @param {ToolbarOptions} options
   * @param {EventBus} eventBus
   * @param {IL10n} l10n - Localization service.
   */
  constructor(options, eventBus, l10n) {
    this.container = options.container;
    this.popUpBtn = options.popUpBtn;
    this.commentContainer = options.commentContainer;
    this.commentSubmitBtn = options.commentSubmitBtn;
    this.commentTextArea = options.commentTextArea;
    this.eventBus = eventBus;
    
    this.selectedText = "";
    this.scrollPosY = 0;
    this.textAreaPosY = 0;
    this.isTextAreaOpen = false;
    this.debouncedSelectionListener = debounce(this._selectionListener.bind(this));
    // Bind the event listeners for click and various other actions.
    // this._bindListeners();
  }

  hidePopBtn() {
    // this.popUpBtn.classList.add("hide");
  }

  showPopBtn() {
    // this.popUpBtn.classList.remove("hide");
  }

  showCommentContainer() {
    this.commentContainer.classList.remove("hide");
  }

  hideCommentContainer() {
    this.commentContainer.classList.add("hide");
  }

  scrollCloseTextArea(yPos) {
    if (this.isTextAreaOpen && Math.abs(yPos - this.textAreaPosY) > 200) {
      this.closeTextArea();
    }
    this.scrollPosY = yPos
  }

  closeTextArea() {
    if (this.isTextAreaOpen) {
      this.commentTextArea.value = "";
      this.isTextAreaOpen = false;
      this.hideCommentContainer();
      this.selectedText = "";
      document.addEventListener("selectionchange", this.debouncedSelectionListener);
    }
  }

  _selectionListener(e) {
    console.log(e);
    const rect = document.getSelection().getRangeAt(0).getBoundingClientRect();
    const mouseX = rect.right;
    const mouseY = rect.top;

    this.container.style.left = mouseX + "px";
    this.container.style.top = mouseY + "px";
    this.showPopBtn();
  }

  _bindListeners() {
    const self = this;

    const onPopUpBtnClick = () => {
      document.removeEventListener("selectionchange", self.debouncedSelectionListener);
      self.showCommentContainer();
      self.isTextAreaOpen = true;
      self.selectedText = document.getSelection().toString();
      self.textAreaPosY = self.scrollPosY;
      self.hidePopBtn();
    };

    const onSubmitBtnClick = () => {
      console.table({
        'paragraph': self.selectedText,
        'comment': self.commentTextArea.value,
      })
      self.closeTextArea();

      axios.get('/api/bookmark').then(function (response) {
        console.log(response, 'res---');
      })

      .catch(function (error) {
        console.log(error, 'error');
      })
    };

    self.commentSubmitBtn.addEventListener("click", onSubmitBtnClick);
    self.popUpBtn.addEventListener("click", onPopUpBtnClick);
    document.addEventListener("selectionchange", self.debouncedSelectionListener);
  }

}

export { SelectionPopUp };
