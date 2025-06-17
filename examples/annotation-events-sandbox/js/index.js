/* PDF.js Annotation Events Sandbox - Main Entry Point */

import { pdfjsLib, DEFAULT_PDF_URL } from "./config.js";
import {
  fileInput,
  fileName,
  previous,
  next,
  pageNumber,
  zoomOutButton,
  zoomInButton,
  scaleSelect,
  editorNone,
  editorFreeText,
  editorInk,
  editorHighlight,
  toggleSidebarButton,
  eventType,
  createInkBtn,
  createTextBtn,
  createHighlightBtn,
  disableCreationBtn,
  showSidebarBtn,
  hideSidebarBtn,
  clearLogBtn,
  clearApiLogBtn,
  clearLegacyLogBtn,
  sendEventBtn,
  apiEventFilter,
  legacyEventFilter,
  annotationIdSelect,
  editorInkColor,
  editorInkThickness,
  editorInkThicknessValue,
  editorInkOpacity,
  editorInkOpacityValue,
} from "./dom-elements.js";

import { loadPDF, getPdfDocument, updatePageNumber } from "./pdf-viewer.js";

import {
  logApiEvent,
  logLegacyEvent,
  clearApiEventLog,
  clearLegacyEventLog,
  clearAllEventLogs,
  filterEventLog,
} from "./event-logging.js";

import {
  setupEventListeners,
  updateAnnotationList,
  updateAnnotationIdSelect,
  updateToolbarAnnotationButtons,
  enableAnnotationCreation,
  disableAnnotationCreation,
  showAnnotationSidebar,
  hideAnnotationSidebar,
  toggleSidebar,
  handleAnnotationSelect,
  handleEventTypeChange,
  updateInkParams,
  sendEvent,
} from "./annotation-manager.js";

import {
  initTabs,
  setupNavigationControls,
  setupZoomControls,
  handleFileSelect,
} from "./ui-controls.js";

// Export pdfDocument to make it globally accessible
// This is needed because some functions in annotation-manager.js
// access pdfDocument through the window object
Object.defineProperty(window, "pdfDocument", {
  get: function () {
    return getPdfDocument();
  },
});

// Initialize the sandbox
function init() {
  // Set up tab interface
  initTabs();

  // Set up event listeners
  fileInput.addEventListener("change", event =>
    handleFileSelect(event, fileName, loadPDFWithCallbacks)
  );
  eventType.addEventListener("change", handleEventTypeChange);

  // Set up sidebar panel control buttons
  createInkBtn.addEventListener("click", () => enableAnnotationCreation("ink"));
  createTextBtn.addEventListener("click", () =>
    enableAnnotationCreation("freeText")
  );
  createHighlightBtn.addEventListener("click", () =>
    enableAnnotationCreation("highlight")
  );
  disableCreationBtn.addEventListener("click", disableAnnotationCreation);
  showSidebarBtn.addEventListener("click", showAnnotationSidebar);
  hideSidebarBtn.addEventListener("click", hideAnnotationSidebar);
  clearLogBtn.addEventListener("click", clearAllEventLogs);
  clearApiLogBtn.addEventListener("click", clearApiEventLog);
  clearLegacyLogBtn.addEventListener("click", clearLegacyEventLog);
  sendEventBtn.addEventListener("click", sendEvent);
  apiEventFilter.addEventListener("change", () => filterEventLog("api"));
  legacyEventFilter.addEventListener("change", () => filterEventLog("legacy"));
  annotationIdSelect.addEventListener("change", handleAnnotationSelect);

  // Set up ink parameters controls
  if (editorInkColor) {
    editorInkColor.addEventListener("change", updateInkParams);
  }
  if (editorInkThickness) {
    editorInkThickness.addEventListener("input", () => {
      editorInkThicknessValue.textContent = editorInkThickness.value;
      updateInkParams();
    });
  }
  if (editorInkOpacity) {
    editorInkOpacity.addEventListener("input", () => {
      editorInkOpacityValue.textContent = `${editorInkOpacity.value}%`;
      updateInkParams();
    });
  }

  // Set up toolbar navigation buttons
  setupNavigationControls(previous, next, pageNumber);

  // Set up toolbar zoom controls
  setupZoomControls(zoomOutButton, zoomInButton, scaleSelect);

  // Set up toolbar annotation buttons
  if (editorNone) {
    editorNone.addEventListener("click", () => {
      disableAnnotationCreation();
      updateToolbarAnnotationButtons("none");
    });
  }

  if (editorFreeText) {
    editorFreeText.addEventListener("click", () => {
      enableAnnotationCreation("freeText");
      updateToolbarAnnotationButtons("freeText");
    });
  }

  if (editorInk) {
    editorInk.addEventListener("click", () => {
      enableAnnotationCreation("ink");
      updateToolbarAnnotationButtons("ink");
    });
  }

  if (editorHighlight) {
    editorHighlight.addEventListener("click", () => {
      enableAnnotationCreation("highlight");
      updateToolbarAnnotationButtons("highlight");
    });
  }

  if (toggleSidebarButton) {
    toggleSidebarButton.addEventListener("click", toggleSidebar);
  }

  // Load the default PDF
  loadPDFWithCallbacks(DEFAULT_PDF_URL);
}

// Load a PDF with all required callbacks
function loadPDFWithCallbacks(url) {
  const callbacks = {
    onLog: logApiEvent,
    onLegacyEvent: logLegacyEvent,
    onAnnotationsUpdated: annotations => {
      updateAnnotationList();
      updateAnnotationIdSelect();
    },
    onSetupEventListeners: setupEventListeners,
  };

  loadPDF(url, callbacks);
}

// Initialize the application when the DOM is ready
document.addEventListener("DOMContentLoaded", init);

// Export for external usage
export { init, loadPDFWithCallbacks };
