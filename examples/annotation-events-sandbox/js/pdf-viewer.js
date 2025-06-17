/* PDF.js Annotation Events Sandbox - PDF Viewer */

import { pdfjsLib } from "./config.js";
import { viewer, pageNumber, numPages } from "./dom-elements.js";

// State variables
let pdfDocument = null;
let pdfPages = [];
let currentPageIndex = 0;
let annotations = [];

// Load a PDF document
function loadPDF(url, callbacks = {}) {
  // Clean up any previous document
  if (pdfDocument) {
    pdfDocument.destroy();
    pdfDocument = null;
    viewer.innerHTML = "";
    annotations = [];
    if (callbacks.onAnnotationsUpdated) {
      callbacks.onAnnotationsUpdated(annotations);
    }
  }

  // Load the new document
  const loadingTask = pdfjsLib.getDocument(url);

  loadingTask.promise
    .then(doc => {
      pdfDocument = doc;
      if (callbacks.onLog) {
        callbacks.onLog("PDF document loaded", "ui", {
          numPages: doc.numPages,
        });
      }

      // Load all pages
      pdfPages = [];
      const pagePromises = [];

      for (let i = 0; i < doc.numPages; i++) {
        const pagePromise = doc.getPage(i + 1).then(page => {
          pdfPages[i] = page;
          renderPage(page, i, 1.0, callbacks);
          return page;
        });
        pagePromises.push(pagePromise);
      }

      Promise.all(pagePromises).then(() => {
        // Start with an empty annotations array
        annotations = [];
        if (callbacks.onAnnotationsUpdated) {
          callbacks.onAnnotationsUpdated(annotations);
        }

        // Check if the annotation event manager exists
        if (pdfDocument.annotationEventManager) {
          // Set up event listeners using the new API
          if (callbacks.onSetupEventListeners) {
            callbacks.onSetupEventListeners(pdfDocument);
          }
          if (callbacks.onLog) {
            callbacks.onLog("Annotation Event Manager initialized", "ui");
          }
        } else {
          if (callbacks.onLog) {
            callbacks.onLog("Annotation Event Manager not available", "error");
          }
          console.error(
            "Annotation Event Manager not available in this PDF.js build"
          );
        }
      });
    })
    .catch(error => {
      console.error("Error loading PDF:", error);
      if (callbacks.onLog) {
        callbacks.onLog("Error loading PDF", "error", {
          message: error.message,
        });
      }
    });
}

// Render a PDF page
function renderPage(page, pageIndex, customScale, callbacks = {}) {
  const scale = customScale || 1.0;
  const viewport = page.getViewport({ scale });

  // Create a page div
  const pageDiv = document.createElement("div");
  pageDiv.className = "page";
  pageDiv.dataset.pageIndex = pageIndex;
  pageDiv.dataset.pageNumber = pageIndex + 1;

  // Create a canvas for this page
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  // Add the canvas to the page div
  pageDiv.appendChild(canvas);

  // Create a div for the annotation layer
  const annotationLayerDiv = document.createElement("div");
  annotationLayerDiv.className = "annotationLayer";
  pageDiv.appendChild(annotationLayerDiv);

  // Create a div for the annotation editor layer
  const annotationEditorLayerDiv = document.createElement("div");
  annotationEditorLayerDiv.className = "annotationEditorLayer";
  pageDiv.appendChild(annotationEditorLayerDiv);

  // Add the page div to the viewer
  viewer.appendChild(pageDiv);

  // Render the page content
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
  };

  page
    .render(renderContext)
    .promise.then(() => {
      if (callbacks.onLog) {
        callbacks.onLog(
          `Page ${pageIndex + 1} rendered at scale ${scale}`,
          "ui"
        );
      }

      // Create the annotation layer
      if (pdfDocument && pdfDocument.annotationStorage) {
        page.getAnnotations().then(annotations => {
          // Create a simple link service
          const linkService = {
            navigateTo: dest => {
              console.log("Navigate to:", dest);
            },
            getDestinationHash: dest => {
              return (
                "#" + (typeof dest === "string" ? dest : JSON.stringify(dest))
              );
            },
            getAnchorUrl: hash => {
              return "#" + hash;
            },
          };

          // Create the annotation layer
          const annotationLayer = new pdfjsLib.AnnotationLayer({
            viewport: viewport.clone({ dontFlip: true }),
            div: annotationLayerDiv,
            annotationStorage: pdfDocument.annotationStorage,
            page,
            linkService,
          });

          // Render the annotation layer
          annotationLayer.render({
            annotations,
            viewport: viewport.clone({ dontFlip: true }),
            linkService,
          });
        });
      }

      // Initialize the annotation editor layer
      if (pdfDocument && pdfDocument.annotationStorage) {
        try {
          // Check if the AnnotationEditorLayer class is available
          if (typeof pdfjsLib.AnnotationEditorLayer !== "function") {
            throw new Error(
              "AnnotationEditorLayer is not available in this PDF.js build"
            );
          }

          // Print available keys on pdfjsLib to debug
          console.log("Available PDF.js keys:", Object.keys(pdfjsLib));

          // Check if we have the PDFAnnotationEditorType or AnnotationEditorType
          let AnnotationEditorType;
          if (pdfjsLib.PDFAnnotationEditorType) {
            console.log("Using PDFAnnotationEditorType");
            AnnotationEditorType = pdfjsLib.PDFAnnotationEditorType;
          } else if (pdfjsLib.AnnotationEditorType) {
            console.log("Using AnnotationEditorType");
            AnnotationEditorType = pdfjsLib.AnnotationEditorType;
          } else {
            console.log("Creating custom AnnotationEditorType");
            // Create a fallback if neither is available
            AnnotationEditorType = {
              NONE: 0,
              FREETEXT: 1,
              INK: 3,
              HIGHLIGHT: 4,
            };
          }

          // Log the annotation editor types
          console.log("Annotation Editor Types:", AnnotationEditorType);

          // Create a better link service that implements all required methods
          const linkService = {
            navigateTo: dest => {},
            getDestinationHash: dest => "#",
            getAnchorUrl: hash => "#",
            page: pageIndex + 1,
            rotation: 0,
            isAttachedToDOM: true,
            eventBus: new pdfjsLib.EventBus(),
            externalLinkTarget: null,
            externalLinkRel: null,
            ignoreDestinationZoom: false,
          };

          // Create a more complete UI manager to better support annotations
          const uiManager = {
            updateUI: function (mode) {
              console.log("UI Manager: updateUI called with mode", mode);
            },
            addEditListeners: function () {
              console.log("UI Manager: addEditListeners called");
            },
            enterEditMode: function () {
              console.log("UI Manager: enterEditMode called");
              return true;
            },
            getMode: function () {
              return 0; // NONE by default
            },
            setupAnnotationEditorUIManager: function () {
              console.log("UI Manager: setupAnnotationEditorUIManager called");
            },
          };

          // Default to ink mode (3) to enable drawing
          let editorMode = AnnotationEditorType.INK;

          // Create full options object for editor layer
          const options = {
            viewport: viewport.clone({ dontFlip: true }),
            div: annotationEditorLayerDiv,
            annotationStorage: pdfDocument.annotationStorage,
            page,
            pageIndex,
            l10n: {
              getLanguage: () => "en-US",
              get: (property, args, fallback) => fallback || property,
            },
            accessibilityManager: null,
            linkService,
            mode: editorMode,
            // Add these additional properties to ensure compatibility
            annotationEditorUIManager: uiManager,
            eventBus: linkService.eventBus,
          };

          // Examine the AnnotationEditorLayer constructor to determine parameter pattern
          const constructorStr = pdfjsLib.AnnotationEditorLayer.toString();
          console.log(
            "AnnotationEditorLayer constructor signature:",
            constructorStr.substring(0, 150) + "..."
          );

          // Add editingParams if that pattern is detected
          if (constructorStr.includes("editingParams")) {
            console.log("Using editingParams pattern");
            options.editingParams = {
              mode: editorMode,
              uiManager,
              annotationEditorUIManager: uiManager,
            };
          }

          // Create the annotation editor layer with enhanced settings
          console.log(
            "Creating annotation editor layer with options:",
            JSON.stringify(options, (k, v) => {
              if (typeof v === "function") return "[Function]";
              if (k === "viewport" || k === "page" || k === "annotationStorage")
                return "[Object]";
              return v;
            })
          );

          const annotationEditorLayer = new pdfjsLib.AnnotationEditorLayer(
            options
          );

          // Force ink mode to be active
          const forceInkMode = function () {
            try {
              // Try different methods of setting the editor mode based on different API versions
              if (typeof annotationEditorLayer.setEditingMode === "function") {
                console.log("Using setEditingMode to enable ink mode");
                annotationEditorLayer.setEditingMode(AnnotationEditorType.INK);
              } else if (typeof annotationEditorLayer.setMode === "function") {
                console.log("Using setMode to enable ink mode");
                annotationEditorLayer.setMode(AnnotationEditorType.INK);
              } else if (options.editingParams) {
                console.log("Setting mode via editingParams");
                options.editingParams.mode = AnnotationEditorType.INK;
              }
            } catch (e) {
              console.error("Error enabling ink mode:", e);
            }
          };

          // Initialize the editor layer with proper method
          if (typeof annotationEditorLayer.setupEditor === "function") {
            console.log("Initializing with setupEditor method");
            annotationEditorLayer.setupEditor();
            forceInkMode();
          } else if (typeof annotationEditorLayer.render === "function") {
            console.log("Initializing with render method");
            annotationEditorLayer.render();
            forceInkMode();
          } else {
            console.log(
              "No standard initialization method found, trying direct mode setting"
            );
            forceInkMode();
          }

          // Add extra methods that our annotation manager might need
          annotationEditorLayer.updateMode = function (mode) {
            try {
              if (this.setEditingMode) {
                this.setEditingMode(mode);
              } else if (this.setMode) {
                this.setMode(mode);
              } else {
                console.warn("No method to update editor mode found");
              }
            } catch (e) {
              console.error("Error updating editor mode:", e);
            }
          };

          annotationEditorLayer.updateParams = function (params) {
            try {
              if (this.updateToolbar) {
                this.updateToolbar(params);
              } else if (this.updateParams) {
                this.updateParams(params);
              } else {
                console.warn("No method to update parameters found");
              }
            } catch (e) {
              console.error("Error updating parameters:", e);
            }
          };

          if (callbacks.onLog) {
            callbacks.onLog(
              `Annotation editor layer initialized for page ${pageIndex + 1}`,
              "ui"
            );
          }

          // Save a reference to the editor layer on the page div for easier access
          pageDiv.annotationEditorLayer = annotationEditorLayer;
        } catch (error) {
          console.error("Error initializing annotation editor layer:", error);
          // Create a dummy annotation editor layer so calls to it won't fail
          pageDiv.annotationEditorLayer = {
            updateMode: () =>
              console.warn("Using dummy editor layer - updateMode ignored"),
            updateParams: () =>
              console.warn("Using dummy editor layer - updateParams ignored"),
          };

          if (callbacks.onLog) {
            callbacks.onLog(
              "Error initializing annotation editor layer - created fallback",
              "error",
              { message: error.message }
            );
          }
        }
      }

      // Register for legacy custom events if needed
      if (window && document && callbacks.onLegacyEvent) {
        // Listen for the pdfjs-annotations-viewer-select custom event
        document.addEventListener("pdfjs-annotations-viewer-select", event => {
          const { uniqueId, annotation } = event.detail;
          callbacks.onLegacyEvent("Annotation selected", "select", {
            id: uniqueId,
            annotation: annotation,
          });
        });

        // Listen for the pdfjs-annotations-viewer-unselect custom event
        document.addEventListener(
          "pdfjs-annotations-viewer-unselect",
          event => {
            const { uniqueId } = event.detail;
            callbacks.onLegacyEvent("Annotation unselected", "select", {
              id: uniqueId,
            });
          }
        );

        // Listen for the pdfjs-annotations-viewer-save-annotation custom event
        document.addEventListener(
          "pdfjs-annotations-viewer-save-annotation",
          event => {
            const { uniqueId, annotation } = event.detail;
            callbacks.onLegacyEvent("Annotation saved", "save", {
              id: uniqueId,
              annotation: annotation,
            });
          }
        );

        // Listen for postMessage events
        window.addEventListener("message", event => {
          if (event.data && event.data.type === "pdfjs-annotations-viewer") {
            callbacks.onLegacyEvent(
              event.data.event || "postMessage event",
              "message",
              event.data
            );
          }
        });
      }
    })
    .catch(error => {
      console.error(`Error rendering page ${pageIndex + 1}:`, error);
    });
}

// Update page number display
function updatePageNumber() {
  if (!pdfDocument) return;

  pageNumber.value = currentPageIndex + 1;
  numPages.textContent = `of ${pdfDocument.numPages}`;

  // Update viewer scroll position
  scrollToPage(currentPageIndex);
}

// Scroll to a specific page
function scrollToPage(pageIndex) {
  const pageDiv = viewer.querySelector(`[data-page-index="${pageIndex}"]`);
  if (pageDiv) {
    pageDiv.scrollIntoView();
  }
}

// Update scale of the PDF
function updateScale(scale) {
  if (!pdfDocument) return;

  // Re-render all pages with the new scale
  viewer.innerHTML = "";
  for (let i = 0; i < pdfPages.length; i++) {
    renderPage(pdfPages[i], i, scale);
  }
}

// Get PDF document
function getPdfDocument() {
  return pdfDocument;
}

// Get current page index
function getCurrentPageIndex() {
  return currentPageIndex;
}

// Set current page index
function setCurrentPageIndex(index) {
  currentPageIndex = index;
}

// Get annotations
function getAnnotations() {
  return annotations;
}

// Set annotations
function setAnnotations(newAnnotations) {
  annotations = newAnnotations;
}

// Add annotation
function addAnnotation(annotation) {
  annotations.push(annotation);
}

// Remove annotation
function removeAnnotation(id) {
  annotations = annotations.filter(a => a.id !== id);
}

// Update annotation
function updateAnnotation(id, properties) {
  const index = annotations.findIndex(a => a.id === id);
  if (index !== -1) {
    annotations[index].properties = properties;
  }
}

export {
  loadPDF,
  renderPage,
  updatePageNumber,
  scrollToPage,
  updateScale,
  getPdfDocument,
  getCurrentPageIndex,
  setCurrentPageIndex,
  getAnnotations,
  setAnnotations,
  addAnnotation,
  removeAnnotation,
  updateAnnotation,
};
