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
 * @property {boolean} isNewSelection - track whether selection has changed
 * since last utterance.
 * @property {boolean} isPaused - track paused state ourselves as Microsoft
 * and Google Online voices don't report `speechSynthesis.paused` state.
 * @property {SpeechSynthesisVoice} [storedVoices] - Store voices so we don't
 * regenerate list which can change and desync indexes.
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
    this.isPaused = options.isPaused;
    this.isNewSelection = options.isNewSelection;

    document.addEventListener("selectionchange", () => {
      /* Reset if new selection made to allow playing it 
         (but ignore empty selection). */
      const text = window.getSelection().toString();
      if (text) {
        this.toggleToolbarPlayingIcon(false);
        this.isNewSelection = true;
      }
    });
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      this.updateVoiceSelect();
    });
  }

  reset() {
    super.reset();
    this._optionalContentConfig = null;
  }

  /**
   * @private
   */
  _dispatchEvent(ttsAvailable) {
    this.eventBus.dispatch("ttsloaded", {
      source: this,
      ttsAvailable,
    });
  }

  get isTTSAvailable() {
    return "speechSynthesis" in window;
  }

  get isPlaying() {
    // Note isPaused definition
    return speechSynthesis.speaking && !this.isPaused;
  }

  /* 
  Render all HTML here. 
  Can't put static HTML in viewer.html because
  container is cleared by base_tree_viewer.reset()
  */
  /**
   * @param {PDFTTSViewerRenderParameters} params
   */
  render({ optionalContentConfig, pdfDocument }) {
    const DEFAULT_RATE = 10;
    if (this._optionalContentConfig) {
      this.reset();
    }
    this._optionalContentConfig = optionalContentConfig || null;
    this._pdfDocument = pdfDocument || null;

    if (!this.isTTSAvailable) {
      this._dispatchEvent(0);
      return;
    }

    const fragment = document.createDocumentFragment();

    // PlayPause

    // Voice select
    const voiceslabel = document.createElement("label");
    voiceslabel.textContent = "Choose voice";
    voiceslabel.className = "toolbarLabel";
    voiceslabel.setAttribute("data-l10n-id", "tts_voice_label");
    fragment.appendChild(voiceslabel);

    const voicelist = this.updateVoiceSelect();
    const voicespan = document.createElement("span");
    voicespan.className = "dropdownSideBarButton";
    voicespan.appendChild(voicelist);
    fragment.appendChild(voicespan);

    // Rate
    const ratelabel = document.createElement("label");
    ratelabel.textContent = "Rate";
    ratelabel.title = "Change rate (double-click here to reset)";
    ratelabel.className = "toolbarLabel";
    ratelabel.setAttribute("data-l10n-id", "tts_rate_label");
    ratelabel.ondblclick = function () {
      rateinput.value = DEFAULT_RATE;
      localStorage.PDFJS_TTS_Rate = DEFAULT_RATE;
    };
    fragment.appendChild(ratelabel);

    const ratespan = document.createElement("span");
    ratespan.className = "range-field";
    const rateinput = document.createElement("input");
    rateinput.type = "range";
    rateinput.id = "rate";
    rateinput.min = 1;
    rateinput.max = 100;

    // Load rate pref
    if (localStorage.PDFJS_TTS_Rate == undefined) {
      rateinput.value = DEFAULT_RATE;
    } else {
      rateinput.value = localStorage.PDFJS_TTS_Rate;
    }
    // Save rate pref
    rateinput.onchange = function () {
      localStorage.PDFJS_TTS_Rate = this.value;
    };

    ratespan.appendChild(rateinput);
    fragment.appendChild(ratespan);

    this._finishRendering(fragment, 1);
  }

  /*
  Update voicelist if exists and return voicelist. 
  */
  updateVoiceSelect() {
    const oldvoicelist = document.getElementById("voiceSelect");
    const voicelist = document.createElement("select");    
    voicelist.id = "voiceSelect";
    this.loadVoices(voicelist);

    if (oldvoicelist !== null) {
      oldvoicelist.replaceWith(voicelist);
    }
    return voicelist;
  }

  /*
  
  */
  async loadVoices(voicelist) {
    const voices = window.speechSynthesis.getVoices();

    voices.forEach(function (voice) {
      const option = document.createElement("option");
      option.textContent = voice.name + (voice.default ? " (default)" : "");
      voicelist.appendChild(option);
    });
    /* Store for later use by playpause(), so we don't regenerate list 
       which may have changed and will desync selectedIndex. */
    this.storedVoices = voices;

    // Save voice preference
    voicelist.onchange = function () {
      localStorage.PDFJS_TTS_Voice = this.value;
    };
    // Load voice preference
    if (localStorage.PDFJS_TTS_Voice == undefined) {
      voicelist.value = getDefaultVoiceName(voices);
    } else {
      voicelist.value = localStorage.PDFJS_TTS_Voice;
    }
    return voicelist;
  }

  getDefaultVoiceName(voices) {
    voices.forEach(function (voice) {
      if (voice.default) 
        return voice.name + (voice.default ? " (default)" : "");
    });
    return undefined;
  }

  toggleToolbarPlayingIcon(playing) {
    const button = document.getElementById("ttsPlayPause");
    if (playing) {
      button.className = "toolbarButton ttsPause";
    } else {
      button.className = "toolbarButton ttsPlay";
    }
  }

  startedPlaying() {
    this.isPaused = false;
    this.isNewSelection = false;
    /* Initial timeout required for Firefox,
     * which is slow to update speechSynthesis.speaking */
    setTimeout(() => {
      // Set toolbar icon to Pause.
      if (this.isPlaying) {
        this.toggleToolbarPlayingIcon(true);
      }
      // Poll until speaking stops to reset toolbar icon to Play.
      this._pollStillSpeaking({ interval: 500 }).then(p =>
        this.toggleToolbarPlayingIcon(p)
      );
    }, 100);
  }

  pausedPlaying() {
    this.isPaused = true;
  }

  playpause() {
    const text = window.getSelection().toString();

    if (!this.isNewSelection) {
      // Always speak new selection
      if (this.isPlaying) {
        // Pause
        speechSynthesis.pause();
        this.pausedPlaying();
        return;
      } else if (this.isPaused) {
        // Resume paused speech
        speechSynthesis.resume();
        this.startedPlaying();
        return;
      }
    }

    // Speak selected
    const msg = new SpeechSynthesisUtterance();
    const voicesel = document.getElementById("voiceSelect");
    msg.voice = this.storedVoices[voicesel.selectedIndex];
    msg.rate = document.getElementById("rate").value / 10;
    msg.text = text;
    speechSynthesis.cancel();
    speechSynthesis.speak(msg);
    this.startedPlaying();
  }

  /**
   * @private
   */
  async _pollStillSpeaking(interval) {
    console.log(" Start poll");
    const executePoll = async (resolve, reject) => {
      console.log(
        " - poll",
        speechSynthesis.speaking,
        speechSynthesis.paused,
        speechSynthesis.pending
      );
      const stillSpeaking = this.isPlaying;
      if (stillSpeaking) {
        setTimeout(executePoll, interval, resolve, reject);
        return false;
      }
      return resolve(stillSpeaking);
    };
    return new Promise(executePoll);
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
      optionalContentConfig,
      pdfDocument: this._pdfDocument,
    });
  }
}

export { PDFTTSViewer };
