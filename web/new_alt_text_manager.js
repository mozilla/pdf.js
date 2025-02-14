/* Copyright 2024 Mozilla Foundation
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

import { noContextMenu } from "pdfjs-lib";

class NewAltTextManager {
  #boundCancel = this.#cancel.bind(this);

  #createAutomaticallyButton;

  #currentEditor = null;

  #cancelButton;

  #descriptionContainer;

  #dialog;

  #disclaimer;

  #downloadModel;

  #downloadModelDescription;

  #eventBus;

  #firstTime = false;

  #guessedAltText;

  #hasAI = null;

  #isEditing = null;

  #imagePreview;

  #imageData;

  #isAILoading = false;

  #wasAILoading = false;

  #learnMore;

  #notNowButton;

  #overlayManager;

  #textarea;

  #title;

  #uiManager;

  #previousAltText = null;

  constructor(
    {
      descriptionContainer,
      dialog,
      imagePreview,
      cancelButton,
      disclaimer,
      notNowButton,
      saveButton,
      textarea,
      learnMore,
      errorCloseButton,
      createAutomaticallyButton,
      downloadModel,
      downloadModelDescription,
      title,
    },
    overlayManager,
    eventBus
  ) {
    this.#cancelButton = cancelButton;
    this.#createAutomaticallyButton = createAutomaticallyButton;
    this.#descriptionContainer = descriptionContainer;
    this.#dialog = dialog;
    this.#disclaimer = disclaimer;
    this.#notNowButton = notNowButton;
    this.#imagePreview = imagePreview;
    this.#textarea = textarea;
    this.#learnMore = learnMore;
    this.#title = title;
    this.#downloadModel = downloadModel;
    this.#downloadModelDescription = downloadModelDescription;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;

    dialog.addEventListener("close", this.#close.bind(this));
    dialog.addEventListener("contextmenu", event => {
      if (event.target !== this.#textarea) {
        event.preventDefault();
      }
    });
    cancelButton.addEventListener("click", this.#boundCancel);
    notNowButton.addEventListener("click", this.#boundCancel);
    saveButton.addEventListener("click", this.#save.bind(this));
    errorCloseButton.addEventListener("click", () => {
      this.#toggleError(false);
    });
    createAutomaticallyButton.addEventListener("click", async () => {
      const checked =
        createAutomaticallyButton.getAttribute("aria-pressed") !== "true";
      this.#currentEditor._reportTelemetry({
        action: "pdfjs.image.alt_text.ai_generation_check",
        data: { status: checked },
      });

      if (this.#uiManager) {
        this.#uiManager.setPreference("enableGuessAltText", checked);
        await this.#uiManager.mlManager.toggleService("altText", checked);
      }
      this.#toggleGuessAltText(checked, /* isInitial = */ false);
    });
    textarea.addEventListener("focus", () => {
      this.#wasAILoading = this.#isAILoading;
      this.#toggleLoading(false);
      this.#toggleTitleAndDisclaimer();
    });
    textarea.addEventListener("blur", () => {
      if (!textarea.value) {
        this.#toggleLoading(this.#wasAILoading);
      }
      this.#toggleTitleAndDisclaimer();
    });
    textarea.addEventListener("input", () => {
      this.#toggleTitleAndDisclaimer();
    });

    eventBus._on("enableguessalttext", ({ value }) => {
      this.#toggleGuessAltText(value, /* isInitial = */ false);
    });

    this.#overlayManager.register(dialog);

    this.#learnMore.addEventListener("click", () => {
      this.#currentEditor._reportTelemetry({
        action: "pdfjs.image.alt_text.info",
        data: { topic: "alt_text" },
      });
    });
  }

  #toggleLoading(value) {
    if (!this.#uiManager || this.#isAILoading === value) {
      return;
    }
    this.#isAILoading = value;
    this.#descriptionContainer.classList.toggle("loading", value);
  }

  #toggleError(value) {
    if (!this.#uiManager) {
      return;
    }
    this.#dialog.classList.toggle("error", value);
  }

  async #toggleGuessAltText(value, isInitial = false) {
    if (!this.#uiManager) {
      return;
    }
    this.#dialog.classList.toggle("aiDisabled", !value);
    this.#createAutomaticallyButton.setAttribute("aria-pressed", value);

    if (value) {
      const { altTextLearnMoreUrl } = this.#uiManager.mlManager;
      if (altTextLearnMoreUrl) {
        this.#learnMore.href = altTextLearnMoreUrl;
      }
      this.#mlGuessAltText(isInitial);
    } else {
      this.#toggleLoading(false);
      this.#isAILoading = false;
      this.#toggleTitleAndDisclaimer();
    }
  }

  #toggleNotNow() {
    this.#notNowButton.classList.toggle("hidden", !this.#firstTime);
    this.#cancelButton.classList.toggle("hidden", this.#firstTime);
  }

  #toggleAI(value) {
    if (!this.#uiManager || this.#hasAI === value) {
      return;
    }
    this.#hasAI = value;
    this.#dialog.classList.toggle("noAi", !value);
    this.#toggleTitleAndDisclaimer();
  }

  #toggleTitleAndDisclaimer() {
    // Disclaimer is visible when the AI is loading or the user didn't change
    // the guessed alt text.
    const visible =
      this.#isAILoading ||
      (this.#guessedAltText && this.#guessedAltText === this.#textarea.value);
    this.#disclaimer.hidden = !visible;

    // The title changes depending if the text area is empty or not.
    const isEditing = this.#isAILoading || !!this.#textarea.value;
    if (this.#isEditing === isEditing) {
      return;
    }
    this.#isEditing = isEditing;
    this.#title.setAttribute(
      "data-l10n-id",
      isEditing
        ? "pdfjs-editor-new-alt-text-dialog-edit-label"
        : "pdfjs-editor-new-alt-text-dialog-add-label"
    );
  }

  async #mlGuessAltText(isInitial) {
    if (this.#isAILoading) {
      // We're still loading the previous guess.
      return;
    }

    if (this.#textarea.value) {
      // The user has already set an alt text.
      return;
    }

    if (isInitial && this.#previousAltText !== null) {
      // The user has already set an alt text (empty or not).
      return;
    }

    this.#guessedAltText = this.#currentEditor.guessedAltText;
    if (this.#previousAltText === null && this.#guessedAltText) {
      // We have a guessed alt text and the user didn't change it.
      this.#addAltText(this.#guessedAltText);
      return;
    }

    this.#toggleLoading(true);
    this.#toggleTitleAndDisclaimer();

    let hasError = false;
    try {
      // When calling #mlGuessAltText we don't wait for it, so we must take care
      // that the alt text dialog can have been closed before the response is.

      const altText = await this.#currentEditor.mlGuessAltText(
        this.#imageData,
        /* updateAltTextData = */ false
      );
      if (altText) {
        this.#guessedAltText = altText;
        this.#wasAILoading = this.#isAILoading;
        if (this.#isAILoading) {
          this.#addAltText(altText);
        }
      }
    } catch (e) {
      console.error(e);
      hasError = true;
    }

    this.#toggleLoading(false);
    this.#toggleTitleAndDisclaimer();

    if (hasError && this.#uiManager) {
      this.#toggleError(true);
    }
  }

  #addAltText(altText) {
    if (!this.#uiManager || this.#textarea.value) {
      return;
    }
    this.#textarea.value = altText;
    this.#toggleTitleAndDisclaimer();
  }

  #setProgress() {
    // Show the download model progress.
    this.#downloadModel.classList.toggle("hidden", false);

    const callback = async ({ detail: { finished, total, totalLoaded } }) => {
      const ONE_MEGA_BYTES = 1e6;
      // totalLoaded can be greater than total if the download is compressed.
      // So we cheat to avoid any confusion.
      totalLoaded = Math.min(0.99 * total, totalLoaded);

      // Update the progress.
      const totalSize = (this.#downloadModelDescription.ariaValueMax =
        Math.round(total / ONE_MEGA_BYTES));
      const downloadedSize = (this.#downloadModelDescription.ariaValueNow =
        Math.round(totalLoaded / ONE_MEGA_BYTES));
      this.#downloadModelDescription.setAttribute(
        "data-l10n-args",
        JSON.stringify({ totalSize, downloadedSize })
      );
      if (!finished) {
        return;
      }

      // We're done, remove the listener and hide the download model progress.
      this.#eventBus._off("loadaiengineprogress", callback);
      this.#downloadModel.classList.toggle("hidden", true);

      this.#toggleAI(true);
      if (!this.#uiManager) {
        return;
      }
      const { mlManager } = this.#uiManager;

      // The model has been downloaded, we can now enable the AI service.
      mlManager.toggleService("altText", true);
      this.#toggleGuessAltText(
        await mlManager.isEnabledFor("altText"),
        /* isInitial = */ true
      );
    };
    this.#eventBus._on("loadaiengineprogress", callback);
  }

  async editAltText(uiManager, editor, firstTime) {
    if (this.#currentEditor || !editor) {
      return;
    }

    if (firstTime && editor.hasAltTextData()) {
      editor.altTextFinish();
      return;
    }

    this.#firstTime = firstTime;
    let { mlManager } = uiManager;
    let hasAI = !!mlManager;
    this.#toggleTitleAndDisclaimer();

    if (mlManager && !mlManager.isReady("altText")) {
      hasAI = false;
      if (mlManager.hasProgress) {
        this.#setProgress();
      } else {
        mlManager = null;
      }
    } else {
      this.#downloadModel.classList.toggle("hidden", true);
    }

    const isAltTextEnabledPromise = mlManager?.isEnabledFor("altText");

    this.#currentEditor = editor;
    this.#uiManager = uiManager;
    this.#uiManager.removeEditListeners();

    ({ altText: this.#previousAltText } = editor.altTextData);
    this.#textarea.value = this.#previousAltText ?? "";

    // TODO: get this value from Firefox
    //   (https://bugzilla.mozilla.org/show_bug.cgi?id=1908184)
    const AI_MAX_IMAGE_DIMENSION = 224;
    const MAX_PREVIEW_DIMENSION = 180;

    // The max dimension of the preview in the dialog is 180px, so we keep 224px
    // and rescale it thanks to css.

    let canvas, width, height;
    if (mlManager) {
      ({
        canvas,
        width,
        height,
        imageData: this.#imageData,
      } = editor.copyCanvas(
        AI_MAX_IMAGE_DIMENSION,
        MAX_PREVIEW_DIMENSION,
        /* createImageData = */ true
      ));
      if (hasAI) {
        this.#toggleGuessAltText(
          await isAltTextEnabledPromise,
          /* isInitial = */ true
        );
      }
    } else {
      ({ canvas, width, height } = editor.copyCanvas(
        AI_MAX_IMAGE_DIMENSION,
        MAX_PREVIEW_DIMENSION,
        /* createImageData = */ false
      ));
    }

    canvas.setAttribute("role", "presentation");
    const { style } = canvas;
    style.width = `${width}px`;
    style.height = `${height}px`;
    this.#imagePreview.append(canvas);

    this.#toggleNotNow();
    this.#toggleAI(hasAI);
    this.#toggleError(false);

    try {
      await this.#overlayManager.open(this.#dialog);
    } catch (ex) {
      this.#close();
      throw ex;
    }
  }

  #cancel() {
    this.#currentEditor.altTextData = {
      cancel: true,
    };
    const altText = this.#textarea.value.trim();
    this.#currentEditor._reportTelemetry({
      action: "pdfjs.image.alt_text.dismiss",
      data: {
        alt_text_type: altText ? "present" : "empty",
        flow: this.#firstTime ? "image_add" : "alt_text_edit",
      },
    });
    this.#currentEditor._reportTelemetry({
      action: "pdfjs.image.image_added",
      data: { alt_text_modal: true, alt_text_type: "skipped" },
    });
    this.#finish();
  }

  #finish() {
    this.#overlayManager.closeIfActive(this.#dialog);
  }

  #close() {
    const canvas = this.#imagePreview.firstChild;
    canvas.remove();
    canvas.width = canvas.height = 0;
    this.#imageData = null;

    this.#toggleLoading(false);

    this.#uiManager?.addEditListeners();
    this.#currentEditor.altTextFinish();
    this.#uiManager?.setSelected(this.#currentEditor);
    this.#currentEditor = null;
    this.#uiManager = null;
  }

  #extractWords(text) {
    return new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/gu)
        .filter(x => !!x)
    );
  }

  #save() {
    const altText = this.#textarea.value.trim();
    this.#currentEditor.altTextData = {
      altText,
      decorative: false,
    };
    this.#currentEditor.altTextData.guessedAltText = this.#guessedAltText;

    if (this.#guessedAltText && this.#guessedAltText !== altText) {
      const guessedWords = this.#extractWords(this.#guessedAltText);
      const words = this.#extractWords(altText);
      this.#currentEditor._reportTelemetry({
        action: "pdfjs.image.alt_text.user_edit",
        data: {
          total_words: guessedWords.size,
          words_removed: guessedWords.difference(words).size,
          words_added: words.difference(guessedWords).size,
        },
      });
    }
    this.#currentEditor._reportTelemetry({
      action: "pdfjs.image.image_added",
      data: {
        alt_text_modal: true,
        alt_text_type: altText ? "present" : "empty",
      },
    });

    this.#currentEditor._reportTelemetry({
      action: "pdfjs.image.alt_text.save",
      data: {
        alt_text_type: altText ? "present" : "empty",
        flow: this.#firstTime ? "image_add" : "alt_text_edit",
      },
    });

    this.#finish();
  }

  destroy() {
    this.#uiManager = null; // Avoid re-adding the edit listeners.
    this.#finish();
  }
}

class ImageAltTextSettings {
  #aiModelSettings;

  #createModelButton;

  #downloadModelButton;

  #dialog;

  #eventBus;

  #mlManager;

  #overlayManager;

  #showAltTextDialogButton;

  constructor(
    {
      dialog,
      createModelButton,
      aiModelSettings,
      learnMore,
      closeButton,
      deleteModelButton,
      downloadModelButton,
      showAltTextDialogButton,
    },
    overlayManager,
    eventBus,
    mlManager
  ) {
    this.#dialog = dialog;
    this.#aiModelSettings = aiModelSettings;
    this.#createModelButton = createModelButton;
    this.#downloadModelButton = downloadModelButton;
    this.#showAltTextDialogButton = showAltTextDialogButton;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;
    this.#mlManager = mlManager;

    const { altTextLearnMoreUrl } = mlManager;
    if (altTextLearnMoreUrl) {
      learnMore.href = altTextLearnMoreUrl;
    }

    dialog.addEventListener("contextmenu", noContextMenu);

    createModelButton.addEventListener("click", async e => {
      const checked = this.#togglePref("enableGuessAltText", e);
      await mlManager.toggleService("altText", checked);
      this.#reportTelemetry({
        type: "stamp",
        action: "pdfjs.image.alt_text.settings_ai_generation_check",
        data: { status: checked },
      });
    });

    showAltTextDialogButton.addEventListener("click", e => {
      const checked = this.#togglePref("enableNewAltTextWhenAddingImage", e);
      this.#reportTelemetry({
        type: "stamp",
        action: "pdfjs.image.alt_text.settings_edit_alt_text_check",
        data: { status: checked },
      });
    });

    deleteModelButton.addEventListener("click", this.#delete.bind(this, true));
    downloadModelButton.addEventListener(
      "click",
      this.#download.bind(this, true)
    );

    closeButton.addEventListener("click", this.#finish.bind(this));

    learnMore.addEventListener("click", () => {
      this.#reportTelemetry({
        type: "stamp",
        action: "pdfjs.image.alt_text.info",
        data: { topic: "ai_generation" },
      });
    });

    eventBus._on("enablealttextmodeldownload", ({ value }) => {
      if (value) {
        this.#download(false);
      } else {
        this.#delete(false);
      }
    });

    this.#overlayManager.register(dialog);
  }

  #reportTelemetry(data) {
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        data,
      },
    });
  }

  async #download(isFromUI = false) {
    if (isFromUI) {
      this.#downloadModelButton.disabled = true;
      const span = this.#downloadModelButton.firstChild;
      span.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-alt-text-settings-downloading-model-button"
      );

      await this.#mlManager.downloadModel("altText");

      span.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-alt-text-settings-download-model-button"
      );

      this.#createModelButton.disabled = false;
      this.#setPref("enableGuessAltText", true);
      this.#mlManager.toggleService("altText", true);
      this.#setPref("enableAltTextModelDownload", true);
      this.#downloadModelButton.disabled = false;
    }

    this.#aiModelSettings.classList.toggle("download", false);
    this.#createModelButton.setAttribute("aria-pressed", true);
  }

  async #delete(isFromUI = false) {
    if (isFromUI) {
      await this.#mlManager.deleteModel("altText");
      this.#setPref("enableGuessAltText", false);
      this.#setPref("enableAltTextModelDownload", false);
    }

    this.#aiModelSettings.classList.toggle("download", true);
    this.#createModelButton.disabled = true;
    this.#createModelButton.setAttribute("aria-pressed", false);
  }

  async open({ enableGuessAltText, enableNewAltTextWhenAddingImage }) {
    const { enableAltTextModelDownload } = this.#mlManager;
    this.#createModelButton.disabled = !enableAltTextModelDownload;
    this.#createModelButton.setAttribute(
      "aria-pressed",
      enableAltTextModelDownload && enableGuessAltText
    );
    this.#showAltTextDialogButton.setAttribute(
      "aria-pressed",
      enableNewAltTextWhenAddingImage
    );
    this.#aiModelSettings.classList.toggle(
      "download",
      !enableAltTextModelDownload
    );

    await this.#overlayManager.open(this.#dialog);
    this.#reportTelemetry({
      type: "stamp",
      action: "pdfjs.image.alt_text.settings_displayed",
    });
  }

  #togglePref(name, { target }) {
    const checked = target.getAttribute("aria-pressed") !== "true";
    this.#setPref(name, checked);
    target.setAttribute("aria-pressed", checked);
    return checked;
  }

  #setPref(name, value) {
    this.#eventBus.dispatch("setpreference", {
      source: this,
      name,
      value,
    });
  }

  #finish() {
    this.#overlayManager.closeIfActive(this.#dialog);
  }
}

export { ImageAltTextSettings, NewAltTextManager };
