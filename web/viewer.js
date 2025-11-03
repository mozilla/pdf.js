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

import { RenderingStates, ScrollMode, SpreadMode } from "./ui_utils.js";
import { AppOptions } from "./app_options.js";
import DottiStore from "./dotti_data_store.js";
import { LinkTarget } from "./pdf_link_service.js";
import { PDFViewerApplication } from "./app.js";

const AppConstants =
  typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")
    ? { LinkTarget, RenderingStates, ScrollMode, SpreadMode }
    : null;

window.PDFViewerApplication = PDFViewerApplication;
window.PDFViewerApplicationConstants = AppConstants;
window.PDFViewerApplicationOptions = AppOptions;
window.DottiStore = DottiStore;

function getViewerConfiguration() {
  return {
    appContainer: document.body,
    principalContainer: document.getElementById("mainContainer"),
    mainContainer: document.getElementById("viewerContainer"),
    viewerContainer: document.getElementById("viewer"),
    viewerAlert: document.getElementById("viewer-alert"),
    toolbar: {
      container: document.getElementById("toolbarContainer"),
      numPages: document.getElementById("numPages"),
      pageNumber: document.getElementById("pageNumber"),
      scaleSelect: document.getElementById("scaleSelect"),
      customScaleOption: document.getElementById("customScaleOption"),
      previous: document.getElementById("previous"),
      next: document.getElementById("next"),
      zoomIn: document.getElementById("zoomInButton"),
      zoomOut: document.getElementById("zoomOutButton"),
      print: document.getElementById("printButton"),
      editorCommentButton: document.getElementById("editorCommentButton"),
      editorCommentParamsToolbar: document.getElementById(
        "editorCommentParamsToolbar"
      ),
      editorFreeTextButton: document.getElementById("editorFreeTextButton"),
      editorFreeTextParamsToolbar: document.getElementById(
        "editorFreeTextParamsToolbar"
      ),
      editorHighlightButton: document.getElementById("editorHighlightButton"),
      editorHighlightParamsToolbar: document.getElementById(
        "editorHighlightParamsToolbar"
      ),
      editorHighlightColorPicker: document.getElementById(
        "editorHighlightColorPicker"
      ),
      editorInkButton: document.getElementById("editorInkButton"),
      editorInkParamsToolbar: document.getElementById("editorInkParamsToolbar"),
      editorStampButton: document.getElementById("editorStampButton"),
      editorStampParamsToolbar: document.getElementById(
        "editorStampParamsToolbar"
      ),
      editorSignatureButton: document.getElementById("editorSignatureButton"),
      editorSignatureParamsToolbar: document.getElementById(
        "editorSignatureParamsToolbar"
      ),
      download: document.getElementById("downloadButton"),
    },
    secondaryToolbar: {
      toolbar: document.getElementById("secondaryToolbar"),
      toggleButton: document.getElementById("secondaryToolbarToggleButton"),
      presentationModeButton: document.getElementById("presentationMode"),
      openFileButton:
        typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")
          ? document.getElementById("secondaryOpenFile")
          : null,
      printButton: document.getElementById("secondaryPrint"),
      downloadButton: document.getElementById("secondaryDownload"),
      viewBookmarkButton: document.getElementById("viewBookmark"),
      firstPageButton: document.getElementById("firstPage"),
      lastPageButton: document.getElementById("lastPage"),
      pageRotateCwButton: document.getElementById("pageRotateCw"),
      pageRotateCcwButton: document.getElementById("pageRotateCcw"),
      cursorSelectToolButton: document.getElementById("cursorSelectTool"),
      cursorHandToolButton: document.getElementById("cursorHandTool"),
      scrollPageButton: document.getElementById("scrollPage"),
      scrollVerticalButton: document.getElementById("scrollVertical"),
      scrollHorizontalButton: document.getElementById("scrollHorizontal"),
      scrollWrappedButton: document.getElementById("scrollWrapped"),
      spreadNoneButton: document.getElementById("spreadNone"),
      spreadOddButton: document.getElementById("spreadOdd"),
      spreadEvenButton: document.getElementById("spreadEven"),
      imageAltTextSettingsButton: document.getElementById(
        "imageAltTextSettings"
      ),
      imageAltTextSettingsSeparator: document.getElementById(
        "imageAltTextSettingsSeparator"
      ),
      documentPropertiesButton: document.getElementById("documentProperties"),
    },
    sidebar: {
      // Divs (and sidebar button)
      outerContainer: document.getElementById("outerContainer"),
      sidebarContainer: document.getElementById("sidebarContainer"),
      toggleButton: document.getElementById("sidebarToggleButton"),
      resizer: document.getElementById("sidebarResizer"),
      // Buttons
      thumbnailButton: document.getElementById("viewThumbnail"),
      outlineButton: document.getElementById("viewOutline"),
      attachmentsButton: document.getElementById("viewAttachments"),
      layersButton: document.getElementById("viewLayers"),
      // Views
      thumbnailView: document.getElementById("thumbnailView"),
      outlineView: document.getElementById("outlineView"),
      attachmentsView: document.getElementById("attachmentsView"),
      layersView: document.getElementById("layersView"),
      // View-specific options
      currentOutlineItemButton: document.getElementById("currentOutlineItem"),
    },
    findBar: {
      bar: document.getElementById("findbar"),
      toggleButton: document.getElementById("viewFindButton"),
      findField: document.getElementById("findInput"),
      highlightAllCheckbox: document.getElementById("findHighlightAll"),
      caseSensitiveCheckbox: document.getElementById("findMatchCase"),
      matchDiacriticsCheckbox: document.getElementById("findMatchDiacritics"),
      entireWordCheckbox: document.getElementById("findEntireWord"),
      findMsg: document.getElementById("findMsg"),
      findResultsCount: document.getElementById("findResultsCount"),
      findPreviousButton: document.getElementById("findPreviousButton"),
      findNextButton: document.getElementById("findNextButton"),
    },
    passwordOverlay: {
      dialog: document.getElementById("passwordDialog"),
      label: document.getElementById("passwordText"),
      input: document.getElementById("password"),
      submitButton: document.getElementById("passwordSubmit"),
      cancelButton: document.getElementById("passwordCancel"),
    },
    documentProperties: {
      dialog: document.getElementById("documentPropertiesDialog"),
      closeButton: document.getElementById("documentPropertiesClose"),
      fields: {
        fileName: document.getElementById("fileNameField"),
        fileSize: document.getElementById("fileSizeField"),
        title: document.getElementById("titleField"),
        author: document.getElementById("authorField"),
        subject: document.getElementById("subjectField"),
        keywords: document.getElementById("keywordsField"),
        creationDate: document.getElementById("creationDateField"),
        modificationDate: document.getElementById("modificationDateField"),
        creator: document.getElementById("creatorField"),
        producer: document.getElementById("producerField"),
        version: document.getElementById("versionField"),
        pageCount: document.getElementById("pageCountField"),
        pageSize: document.getElementById("pageSizeField"),
        linearized: document.getElementById("linearizedField"),
      },
    },
    altTextDialog: {
      dialog: document.getElementById("altTextDialog"),
      optionDescription: document.getElementById("descriptionButton"),
      optionDecorative: document.getElementById("decorativeButton"),
      textarea: document.getElementById("descriptionTextarea"),
      cancelButton: document.getElementById("altTextCancel"),
      saveButton: document.getElementById("altTextSave"),
    },
    newAltTextDialog: {
      dialog: document.getElementById("newAltTextDialog"),
      title: document.getElementById("newAltTextTitle"),
      descriptionContainer: document.getElementById(
        "newAltTextDescriptionContainer"
      ),
      textarea: document.getElementById("newAltTextDescriptionTextarea"),
      disclaimer: document.getElementById("newAltTextDisclaimer"),
      learnMore: document.getElementById("newAltTextLearnMore"),
      imagePreview: document.getElementById("newAltTextImagePreview"),
      createAutomatically: document.getElementById(
        "newAltTextCreateAutomatically"
      ),
      createAutomaticallyButton: document.getElementById(
        "newAltTextCreateAutomaticallyButton"
      ),
      downloadModel: document.getElementById("newAltTextDownloadModel"),
      downloadModelDescription: document.getElementById(
        "newAltTextDownloadModelDescription"
      ),
      error: document.getElementById("newAltTextError"),
      errorCloseButton: document.getElementById("newAltTextCloseButton"),
      cancelButton: document.getElementById("newAltTextCancel"),
      notNowButton: document.getElementById("newAltTextNotNow"),
      saveButton: document.getElementById("newAltTextSave"),
    },
    altTextSettingsDialog: {
      dialog: document.getElementById("altTextSettingsDialog"),
      createModelButton: document.getElementById("createModelButton"),
      aiModelSettings: document.getElementById("aiModelSettings"),
      learnMore: document.getElementById("altTextSettingsLearnMore"),
      deleteModelButton: document.getElementById("deleteModelButton"),
      downloadModelButton: document.getElementById("downloadModelButton"),
      showAltTextDialogButton: document.getElementById(
        "showAltTextDialogButton"
      ),
      altTextSettingsCloseButton: document.getElementById(
        "altTextSettingsCloseButton"
      ),
      closeButton: document.getElementById("altTextSettingsCloseButton"),
    },
    addSignatureDialog: {
      dialog: document.getElementById("addSignatureDialog"),
      panels: document.getElementById("addSignatureActionContainer"),
      typeButton: document.getElementById("addSignatureTypeButton"),
      typeInput: document.getElementById("addSignatureTypeInput"),
      drawButton: document.getElementById("addSignatureDrawButton"),
      drawSVG: document.getElementById("addSignatureDraw"),
      drawPlaceholder: document.getElementById("addSignatureDrawPlaceholder"),
      drawThickness: document.getElementById("addSignatureDrawThickness"),
      imageButton: document.getElementById("addSignatureImageButton"),
      imageSVG: document.getElementById("addSignatureImage"),
      imagePlaceholder: document.getElementById("addSignatureImagePlaceholder"),
      imagePicker: document.getElementById("addSignatureFilePicker"),
      imagePickerLink: document.getElementById("addSignatureImageBrowse"),
      description: document.getElementById("addSignatureDescription"),
      clearButton: document.getElementById("clearSignatureButton"),
      saveContainer: document.getElementById("addSignatureSaveContainer"),
      saveCheckbox: document.getElementById("addSignatureSaveCheckbox"),
      errorBar: document.getElementById("addSignatureError"),
      errorTitle: document.getElementById("addSignatureErrorTitle"),
      errorDescription: document.getElementById("addSignatureErrorDescription"),
      errorCloseButton: document.getElementById("addSignatureErrorCloseButton"),
      cancelButton: document.getElementById("addSignatureCancelButton"),
      addButton: document.getElementById("addSignatureAddButton"),
    },
    editSignatureDialog: {
      dialog: document.getElementById("editSignatureDescriptionDialog"),
      description: document.getElementById("editSignatureDescription"),
      editSignatureView: document.getElementById("editSignatureView"),
      cancelButton: document.getElementById("editSignatureCancelButton"),
      updateButton: document.getElementById("editSignatureUpdateButton"),
    },
    annotationEditorParams: {
      editorCommentsSidebar: document.getElementById("editorCommentsSidebar"),
      editorCommentsSidebarCount: document.getElementById(
        "editorCommentsSidebarCount"
      ),
      editorCommentsSidebarTitle: document.getElementById(
        "editorCommentsSidebarTitle"
      ),
      editorCommentsSidebarCloseButton: document.getElementById(
        "editorCommentsSidebarCloseButton"
      ),
      editorCommentsSidebarList: document.getElementById(
        "editorCommentsSidebarList"
      ),
      editorFreeTextFontSize: document.getElementById("editorFreeTextFontSize"),
      editorFreeTextColor: document.getElementById("editorFreeTextColor"),
      editorInkColor: document.getElementById("editorInkColor"),
      editorInkThickness: document.getElementById("editorInkThickness"),
      editorInkOpacity: document.getElementById("editorInkOpacity"),
      editorStampAddImage: document.getElementById("editorStampAddImage"),
      editorSignatureAddSignature: document.getElementById(
        "editorSignatureAddSignature"
      ),
      editorFreeHighlightThickness: document.getElementById(
        "editorFreeHighlightThickness"
      ),
      editorHighlightShowAll: document.getElementById("editorHighlightShowAll"),
    },
    printContainer: document.getElementById("printContainer"),
    editorUndoBar: {
      container: document.getElementById("editorUndoBar"),
      message: document.getElementById("editorUndoBarMessage"),
      undoButton: document.getElementById("editorUndoBarUndoButton"),
      closeButton: document.getElementById("editorUndoBarCloseButton"),
    },
    editCommentDialog: {
      dialog: document.getElementById("commentManagerDialog"),
      toolbar: document.getElementById("commentManagerToolbar"),
      actions: document.getElementById("commentActionsButton"),
      menu: document.getElementById("commentActionsMenu"),
      editMenuItem: document.getElementById("commentActionsEditButton"),
      deleteMenuItem: document.getElementById("commentActionsDeleteButton"),
      closeButton: document.getElementById("commentCloseButton"),
      textInput: document.getElementById("commentManagerTextInput"),
      textView: document.getElementById("commentManagerTextView"),
      cancelButton: document.getElementById("commentManagerCancelButton"),
      saveButton: document.getElementById("commentManagerSaveButton"),
    },
  };
}

function parseURL() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const token = urlParams.get("token");
  const taskId = urlParams.get("taskId");
  const workflowId = urlParams.get("workflowId");
  DottiStore.setToken(token);

  fetch("https://i-sign.cn:9101/isign/v1/profiles", {
    headers: {
      "X-IS-Token": token,
    },
  })
    .then(response => response.json())
    .then(res => {
      DottiStore.setProfile(res.data);
      if (taskId) {
        fetchTask(token, taskId);
      } else if (workflowId) {
        fetchWorkflow(token, workflowId);
      }
    });
}

function fetchTask(token, taskId) {
  if (token && taskId) {
    fetch(`https://i-sign.cn:9102/isign/v1/tasks?id=${taskId}`, {
      headers: {
        "X-IS-Token": token,
      },
    })
      .then(response => response.json())
      .then(res => {
        if (res.success) {
          DottiStore.setTask(res.data);
          const task = res.data;
          if (DottiStore.isFinishedWorkflow()) {
            DottiStore.setDisplayMode("view");
            // allow download and print
            const printDownloadGroupBar = document.getElementById(
              "printDownloadGroupBar"
            );
            printDownloadGroupBar.style.display = "";
          } else {
            DottiStore.setDisplayMode("task");

            const submitSignatureButton = document.getElementById(
              "submitSignatureButton"
            );
            submitSignatureButton.onclick = () => {
              window.DottiStore.onSubmitSignature();
            };
            submitSignatureButton.style.display = DottiStore.isProcessingTask()
              ? ""
              : "none";

            document.getElementById(
              "signingConfirmDialogWorkflowNameDiv"
            ).innerText = task.workflow.workflowName;
            document.getElementById(
              "signingConfirmDialogWorkflowIdDiv"
            ).innerText = task.workflow.workflowId;
            document.getElementById(
              "signingConfirmDialogSignerName"
            ).innerText = DottiStore.getCurrentSigner().idName;
            document.getElementById("signingConfirmDialogSignerId").innerText =
              DottiStore.getCurrentSigner().idCard.slice(-4);
            const userConsentDialog =
              document.getElementById("userConsentDialog");
            const signingConfirmDialogCancelButton = document.getElementById(
              "signingConfirmDialogCancelButton"
            );
            signingConfirmDialogCancelButton.onclick = () => {
              userConsentDialog.close();
            };
            const signingConfirmDialogSubmitButton = document.getElementById(
              "signingConfirmDialogSubmitButton"
            );
            signingConfirmDialogSubmitButton.onclick = () => {
              // 1. validate 3 checkboxes
              const userConsent1 = document.getElementById("userConsent1");
              const userConsent2 = document.getElementById("userConsent2");
              const userConsent3 = document.getElementById("userConsent3");
              if (
                userConsent1.checked &&
                userConsent2.checked &&
                userConsent3.checked
              ) {
                DottiStore.saveUserConsents();
              } else {
                // eslint-disable-next-line no-alert
                alert("请先确认电子签署授权");
              }
            };
          }

          webViewerLoad();
        } else {
          // TODO: show error page
        }
      });
  }
}

function fetchWorkflow(token, workflowId) {
  if (token && workflowId) {
    fetch(`https://i-sign.cn:9102/isign/v1/workflows?id=${workflowId}`, {
      headers: {
        "X-IS-Token": token,
      },
    })
      .then(response => response.json())
      .then(res => {
        if (res.success) {
          DottiStore.setWorkflow(res.data);
          DottiStore.setDisplayMode("view");
          if (DottiStore.isFinishedWorkflow()) {
            // allow download and print
            const printDownloadGroupBar = document.getElementById(
              "printDownloadGroupBar"
            );
            printDownloadGroupBar.style.display = "";
          }
          webViewerLoad();
        } else {
          // TODO: show error page
        }
      });
  }
}

function webViewerLoad() {
  const config = getViewerConfiguration();

  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC")) {
    // Give custom implementations of the default viewer a simpler way to
    // set various `AppOptions`, by dispatching an event once all viewer
    // files are loaded but *before* the viewer initialization has run.
    const event = new CustomEvent("webviewerloaded", {
      bubbles: true,
      cancelable: true,
      detail: {
        source: window,
      },
    });
    try {
      // Attempt to dispatch the event at the embedding `document`,
      // in order to support cases where the viewer is embedded in
      // a *dynamically* created <iframe> element.
      parent.document.dispatchEvent(event);
    } catch (ex) {
      // The viewer could be in e.g. a cross-origin <iframe> element,
      // fallback to dispatching the event at the current `document`.
      console.error("webviewerloaded:", ex);
      document.dispatchEvent(event);
    }
  }
  PDFViewerApplication.run(config);
}

// Block the "load" event until all pages are loaded, to ensure that printing
// works in Firefox; see https://bugzilla.mozilla.org/show_bug.cgi?id=1618553
document.blockUnblockOnload?.(true);

if (
  document.readyState === "interactive" ||
  document.readyState === "complete"
) {
  parseURL();
} else {
  document.addEventListener("DOMContentLoaded", parseURL, true);
}

export {
  PDFViewerApplication,
  AppConstants as PDFViewerApplicationConstants,
  AppOptions as PDFViewerApplicationOptions,
};
