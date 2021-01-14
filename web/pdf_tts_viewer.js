/* Copyright 2020 Mozilla Foundation
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

import { BaseTreeViewer } from "./base_tree_viewer.js";

/**
 * @typedef {Object} PDFTTSViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IL10n} l10n - Localization service.
 */

/**
 * @typedef {Object} PDFTTSViewerRenderParameters
 * @property {OptionalContentConfig|null} optionalContentConfig - An
 *   {OptionalContentConfig} instance.
 * @property {PDFDocument} pdfDocument - A {PDFDocument} instance.
 */

class PDFTTSViewer extends BaseTreeViewer {
  constructor(options) {
    super(options);
    this.l10n = options.l10n;
    // this.eventBus._on("sidebarviewchanged", evt => {
    //   this.render();
    // });
  }

  reset() {
    super.reset();
    this._optionalContentConfig = null;
  }

  /**
   * @private
   */
  _dispatchEvent(ttsCount) {
    this.eventBus.dispatch("ttsloaded", {
      source: this,
      ttsCount,
    });
  }

  /**
   * @param {PDFTTSViewerRenderParameters} params
   */
  render({ optionalContentConfig }) {
    if (this._optionalContentConfig) {
      this.reset();
    }
    this._optionalContentConfig = optionalContentConfig || null;

    let ttsCount = 0;
    if ( !('speechSynthesis' in window) ) {
      this._dispatchEvent(/* count = */ ttsCount);
      return;
    } else {
      ttsCount = 1;
    }

    const fragment = document.createDocumentFragment();
    const div = document.createElement("div");
    div.className = "treeItem";

    const voiceslabel = document.createElement("label");
    voiceslabel.textContent = "Choose voice"
    div.appendChild(voiceslabel);

    const voicelist = document.createElement("select");
    speechSynthesis.getVoices().forEach(function (voice, index) {
      const option = document.createElement("option");
      option.index = index;
      option.textContent = voice.name + (voice.default ? ' (default)' : '');
      voicelist.appendChild(option);
    });
    div.appendChild(voicelist);

    fragment.appendChild(div);
    this._finishRendering(fragment, ttsCount);
  }

  /**
   * @private
   */
  _speak(){
    const text = window.getSelection().toString();
    const msg = new SpeechSynthesisUtterance();
    const voices = window.speechSynthesis.getVoices();
    msg.voice = voices[voicelist.val];
    msg.rate = $('#rate').val() / 10;
    msg.pitch = $('#pitch').val();
    msg.text = text;
    speechSynthesis.cancel();
    speechSynthesis.speak(msg);
  }

  /**
   * @private
   */
  async _resetTTS() {
    if (!this._optionalContentConfig) {
      return;
    }
    // Fetch the default optional content configuration...
    const optionalContentConfig = await this._pdfDocument.getOptionalContentConfig();

    this.eventBus.dispatch("optionalcontentconfig", {
      source: this,
      promise: Promise.resolve(optionalContentConfig),
    });

    // ... and reset the sidebarView to the default state.
    this.render({
      optionalContentConfig
    });
  }
}

export { PDFTTSViewer };
