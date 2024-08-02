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

  #telemetryData = null;

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
      if (this.#uiManager) {
        this.#uiManager.setPreference("enableGuessAltText", checked);
        await this.#uiManager.mlManager.toggleService("altText", checked);
      }
      this.#toggleGuessAltText(checked, /* isInitial = */ false);
    });
    textarea.addEventListener("focus", () => {
      this.#wasAILoading = this.#isAILoading;
      this.#toggleLoading(false);
    });
    textarea.addEventListener("blur", () => {
      if (textarea.value) {
        return;
      }
      this.#toggleLoading(this.#wasAILoading);
    });
    textarea.addEventListener("input", () => {
      this.#toggleTitle();
      this.#toggleDisclaimer();
    });

    this.#overlayManager.register(dialog);
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

  #toggleTitle() {
    const isEditing = this.#isAILoading || !!this.#textarea.value;
    if (this.#isEditing === isEditing) {
      return;
    }
    this.#isEditing = isEditing;
    this.#title.setAttribute(
      "data-l10n-id",
      `pdfjs-editor-new-alt-text-dialog-${isEditing ? "edit" : "add"}-label`
    );
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
      this.#toggleTitle();
      this.#toggleDisclaimer();
    }
  }

  #toggleNotNow() {
    this.#notNowButton.classList.toggle("hidden", !this.#firstTime);
    this.#cancelButton.classList.toggle("hidden", this.#firstTime);
  }

  #toggleAI(value) {
    this.#dialog.classList.toggle("noAi", !value);
    this.#toggleTitle();
  }

  #toggleDisclaimer(value = null) {
    if (!this.#uiManager) {
      return;
    }
    const hidden =
      value === null
        ? !this.#guessedAltText || this.#guessedAltText !== this.#textarea.value
        : !value;
    this.#disclaimer.classList.toggle("hidden", hidden);
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
      this.#toggleDisclaimer();
      this.#toggleTitle();
      return;
    }

    this.#toggleLoading(true);
    this.#toggleTitle();
    this.#toggleDisclaimer(true);

    let hasError = false;
    try {
      const { width, height, data } = this.#imageData;

      // Take a reference on the current editor, as it can be set to null (if
      // the dialog is closed before the end of the guess).
      // But in case we've an alt-text, we want to set it on the editor.
      const editor = this.#currentEditor;

      // When calling #mlGuessAltText we don't wait for it, so we must take care
      // that the alt text dialog can have been closed before the response is.
      const response = await this.#uiManager.mlGuess({
        name: "altText",
        request: {
          data,
          width,
          height,
          channels: data.length / (width * height),
        },
      });
      if (!response || response.error || !response.output) {
        throw new Error("No valid response from the AI service.");
      }
      const altText = (this.#guessedAltText = response.output);
      await editor.setGuessedAltText(altText);
      this.#wasAILoading = this.#isAILoading;
      if (this.#isAILoading) {
        this.#addAltText(altText);
      }
    } catch (e) {
      console.error(e);
      hasError = true;
    }

    this.#toggleLoading(false);

    if (hasError && this.#uiManager) {
      this.#toggleError(true);
      this.#toggleTitle();
      this.#toggleDisclaimer();
    }
  }

  #addAltText(altText) {
    if (!this.#uiManager || this.#textarea.value) {
      return;
    }
    this.#textarea.value = altText;
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

    // The max dimension of the preview in the dialog is 180px, so we keep 224px
    // and rescale it thanks to css.

    let canvas;
    if (mlManager) {
      ({ canvas, imageData: this.#imageData } = editor.copyCanvas(
        AI_MAX_IMAGE_DIMENSION,
        /* createImageData = */ true
      ));
      if (hasAI) {
        this.#toggleGuessAltText(
          await isAltTextEnabledPromise,
          /* isInitial = */ true
        );
      }
    } else {
      ({ canvas } = editor.copyCanvas(
        AI_MAX_IMAGE_DIMENSION,
        /* createImageData = */ false
      ));
    }

    canvas.setAttribute("role", "presentation");
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
    this.#finish();
  }

  #finish() {
    if (this.#overlayManager.active === this.#dialog) {
      this.#overlayManager.close(this.#dialog);
    }
  }

  #close() {
    const canvas = this.#imagePreview.firstChild;
    canvas.remove();
    canvas.width = canvas.height = 0;
    this.#imageData = null;

    this.#currentEditor._reportTelemetry(
      this.#telemetryData || {
        action: "alt_text_cancel",
      }
    );

    this.#telemetryData = null;
    this.#toggleLoading(false);

    this.#uiManager?.addEditListeners();
    this.#currentEditor.altTextFinish();
    this.#uiManager?.setSelected(this.#currentEditor);
    this.#currentEditor = null;
    this.#uiManager = null;
  }

  #save() {
    const altText = this.#textarea.value.trim();
    this.#currentEditor.altTextData = {
      altText,
      decorative: false,
    };
    this.#telemetryData = {
      action: "alt_text_save",
      alt_text_description: !!altText,
      alt_text_edit:
        !!this.#previousAltText && this.#previousAltText !== altText,
      alt_text_decorative: false,
      alt_text_altered:
        this.#guessedAltText && this.#guessedAltText !== altText,
    };
    this.#finish();
  }

  destroy() {
    this.#uiManager = null; // Avoid re-adding the edit listeners.
    this.#finish();
  }
}

class ImageAltTextSettings {
  #aiModelSettings;

  #boundOnClickCreateModel;

  #createModelButton;

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
    this.#showAltTextDialogButton = showAltTextDialogButton;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;
    this.#mlManager = mlManager;
    this.#boundOnClickCreateModel = this.#togglePref.bind(
      this,
      "enableGuessAltText"
    );

    const { altTextLearnMoreUrl } = mlManager;
    if (altTextLearnMoreUrl) {
      learnMore.href = altTextLearnMoreUrl;
    }

    dialog.addEventListener("close", this.#close.bind(this));
    dialog.addEventListener("contextmenu", noContextMenu);

    createModelButton.addEventListener("click", async e => {
      const checked = this.#togglePref("enableGuessAltText", e);
      await mlManager.toggleService("altText", checked);
    });

    showAltTextDialogButton.addEventListener(
      "click",
      this.#togglePref.bind(this, "enableNewAltTextWhenAddingImage")
    );

    deleteModelButton.addEventListener("click", async () => {
      await mlManager.deleteModel("altText");

      aiModelSettings.classList.toggle("download", true);
      createModelButton.removeEventListener(
        "click",
        this.#boundOnClickCreateModel
      );
      createModelButton.setAttribute("aria-pressed", false);
      this.#setPref("enableGuessAltText", false);
      this.#setPref("enableAltTextModelDownload", false);
    });

    downloadModelButton.addEventListener("click", async () => {
      downloadModelButton.disabled = true;
      downloadModelButton.firstChild.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-alt-text-settings-downloading-model-button"
      );

      await mlManager.downloadModel("altText");

      aiModelSettings.classList.toggle("download", false);
      downloadModelButton.firstChild.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-alt-text-settings-download-model-button"
      );
      createModelButton.addEventListener(
        "click",
        this.#boundOnClickCreateModel
      );
      createModelButton.setAttribute("aria-pressed", true);
      this.#setPref("enableGuessAltText", true);
      mlManager.toggleService("altText", true);
      this.#setPref("enableAltTextModelDownload", true);
      downloadModelButton.disabled = false;
    });

    closeButton.addEventListener("click", this.#finish.bind(this));
    this.#overlayManager.register(dialog);
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

    try {
      await this.#overlayManager.open(this.#dialog);
    } catch (ex) {
      this.#close();
      throw ex;
    }
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
    if (this.#overlayManager.active === this.#dialog) {
      this.#overlayManager.close(this.#dialog);
    }
  }

  #close() {
    this.#createModelButton.removeEventListener(
      "click",
      this.#boundOnClickCreateModel
    );
  }
}

export { ImageAltTextSettings, NewAltTextManager };
