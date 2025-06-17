/* PDF.js Annotation Events Sandbox JavaScript */

// Import PDF.js as an ES module
import * as pdfjsLib from "../../build/generic/build/pdf.mjs";

// Configure PDF.js worker with the correct path
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../build/generic/build/pdf.worker.mjs";

// Default PDF URL - can be changed by the user
const DEFAULT_PDF_URL = "../../web/compressed.tracemonkey-pldi-09.pdf";

// State variables
let pdfDocument = null;
let pdfPages = [];
let currentPageIndex = 0;
let annotations = [];
let selectedAnnotationId = null;
let apiEventCounter = 0;
let legacyEventCounter = 0;

// DOM elements - Main UI
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const viewerContainer = document.getElementById("viewerContainer");
const viewer = document.getElementById("viewer");
const annotationList = document.getElementById("annotationList");
const inspector = document.getElementById("inspector");

// DOM elements - Tab interface
const tabs = document.querySelectorAll(".tab");

// DOM elements - API Events tab
const apiEventLog = document.getElementById("apiEventLog");
const apiEventFilter = document.getElementById("apiEventFilter");
const autoScrollApi = document.getElementById("autoScrollApi");
const clearApiLogBtn = document.getElementById("clearApiLogBtn");

// DOM elements - Legacy Events tab
const legacyEventLog = document.getElementById("legacyEventLog");
const legacyEventFilter = document.getElementById("legacyEventFilter");
const autoScrollLegacy = document.getElementById("autoScrollLegacy");
const clearLegacyLogBtn = document.getElementById("clearLegacyLogBtn");

// DOM elements - Event controls
const eventType = document.getElementById("eventType");
const annotationIdSelect = document.getElementById("annotationId");
const pageIndexInput = document.getElementById("pageIndex");
const propertiesTextarea = document.getElementById("properties");
const propertiesGroup = document.getElementById("propertiesGroup");
const pageIndexGroup = document.getElementById("pageIndexGroup");

// DOM elements - Ink parameters toolbar
const editorInkParamsToolbar = document.getElementById("editorInkParamsToolbar");
const editorInkColor = document.getElementById("editorInkColor");
const editorInkThickness = document.getElementById("editorInkThickness");
const editorInkThicknessValue = document.getElementById("editorInkThicknessValue");
const editorInkOpacity = document.getElementById("editorInkOpacity");
const editorInkOpacityValue = document.getElementById("editorInkOpacityValue");

// Button elements
const createInkBtn = document.getElementById("createInkBtn");
const createTextBtn = document.getElementById("createTextBtn");
const createHighlightBtn = document.getElementById("createHighlightBtn");
const disableCreationBtn = document.getElementById("disableCreationBtn");
const showSidebarBtn = document.getElementById("showSidebarBtn");
const hideSidebarBtn = document.getElementById("hideSidebarBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const sendEventBtn = document.getElementById("sendEventBtn");

// Initialize the sandbox
function init() {
  // Set up tab interface
  initTabs();

  // Set up event listeners
  fileInput.addEventListener("change", handleFileSelect);
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
  const previous = document.getElementById("previous");
  const next = document.getElementById("next");
  const pageNumber = document.getElementById("pageNumber");

  if (previous) {
    previous.addEventListener("click", () => {
      if (pdfDocument && currentPageIndex > 0) {
        currentPageIndex--;
        updatePageNumber();
      }
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      if (pdfDocument && currentPageIndex < pdfDocument.numPages - 1) {
        currentPageIndex++;
        updatePageNumber();
      }
    });
  }

  if (pageNumber) {
    pageNumber.addEventListener("change", () => {
      const pageIndex = parseInt(pageNumber.value, 10) - 1;
      if (pdfDocument && pageIndex >= 0 && pageIndex < pdfDocument.numPages) {
        currentPageIndex = pageIndex;
        updatePageNumber();
        scrollToPage(pageIndex);
      }
    });
  }

  // Set up toolbar zoom controls
  const zoomOutButton = document.getElementById("zoomOut");
  const zoomInButton = document.getElementById("zoomIn");
  const scaleSelect = document.getElementById("scaleSelect");

  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => {
      if (scaleSelect) {
        const currentScale = parseFloat(scaleSelect.value) || 1.0;
        const newScale = Math.max(0.1, currentScale / 1.1);
        scaleSelect.value = newScale;
        updateScale(newScale);
      }
    });
  }

  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => {
      if (scaleSelect) {
        const currentScale = parseFloat(scaleSelect.value) || 1.0;
        const newScale = Math.min(10.0, currentScale * 1.1);
        scaleSelect.value = newScale;
        updateScale(newScale);
      }
    });
  }

  if (scaleSelect) {
    scaleSelect.addEventListener("change", () => {
      updateScale(scaleSelect.value);
    });
  }

  // Set up toolbar annotation buttons
  const editorNone = document.getElementById("editorNone");
  const editorFreeText = document.getElementById("editorFreeText");
  const editorInk = document.getElementById("editorInk");
  const editorHighlight = document.getElementById("editorHighlight");
  const toggleSidebarButton = document.getElementById("toggleSidebar");

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
  loadPDF(DEFAULT_PDF_URL);
}

// Initialize tab interface
function initTabs() {
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Deactivate all tabs
      tabs.forEach(t => t.classList.remove("active"));

      // Activate clicked tab
      tab.classList.add("active");

      // Hide all content
      document.querySelectorAll(".event-log-tab").forEach(content => {
        content.classList.remove("active");
      });

      // Show corresponding content
      const targetId = tab.getAttribute("data-target");
      document.getElementById(targetId).classList.add("active");
    });
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

// Handle file selection
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file && file.type === "application/pdf") {
    fileName.textContent = file.name;
    const fileURL = URL.createObjectURL(file);
    loadPDF(fileURL);
  }
}

// Load a PDF document
function loadPDF(url) {
  // Clean up any previous document
  if (pdfDocument) {
    pdfDocument.destroy();
    pdfDocument = null;
    viewer.innerHTML = "";
    annotations = [];
    updateAnnotationList();
  }

  // Load the new document
  const loadingTask = pdfjsLib.getDocument(url);

  loadingTask.promise
    .then(doc => {
      pdfDocument = doc;
      logApiEvent("PDF document loaded", "ui", { numPages: doc.numPages });

      // Load all pages
      pdfPages = [];
      const pagePromises = [];

      for (let i = 0; i < doc.numPages; i++) {
        const pagePromise = doc.getPage(i + 1).then(page => {
          pdfPages[i] = page;
          renderPage(page, i);
          return page;
        });
        pagePromises.push(pagePromise);
      }

      Promise.all(pagePromises).then(() => {
        // Start with an empty annotations array
        annotations = [];
        updateAnnotationList();

        // Check if the annotation event manager exists
        if (pdfDocument.annotationEventManager) {
          // Set up event listeners using the new API
          setupEventListeners(pdfDocument);
          logApiEvent("Annotation Event Manager initialized", "ui");
        } else {
          logApiEvent("Annotation Event Manager not available", "error");
          console.error(
            "Annotation Event Manager not available in this PDF.js build"
          );
        }
      });
    })
    .catch(error => {
      console.error("Error loading PDF:", error);
      logApiEvent("Error loading PDF", "error", { message: error.message });
    });
}

// Render a PDF page
function renderPage(page, pageIndex, customScale) {
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
      logApiEvent(`Page ${pageIndex + 1} rendered at scale ${scale}`, "ui");

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

      // Skip annotation editor layer creation - we'll use the annotation event manager instead
      // This simplifies the example and avoids issues with the editor layer API changes
      logApiEvent(
        "Using annotation event manager instead of editor layer",
        "ui"
      );

      // Register for legacy custom events if needed
      if (window && document) {
        // Listen for the pdfjs-annotations-viewer-select custom event
        document.addEventListener("pdfjs-annotations-viewer-select", event => {
          const { uniqueId, annotation } = event.detail;
          logLegacyEvent("Annotation selected", "select", {
            id: uniqueId,
            annotation: annotation,
          });
        });

        // Listen for the pdfjs-annotations-viewer-unselect custom event
        document.addEventListener(
          "pdfjs-annotations-viewer-unselect",
          event => {
            const { uniqueId } = event.detail;
            logLegacyEvent("Annotation unselected", "select", {
              id: uniqueId,
            });
          }
        );

        // Listen for the pdfjs-annotations-viewer-save-annotation custom event
        document.addEventListener(
          "pdfjs-annotations-viewer-save-annotation",
          event => {
            const { uniqueId, annotation } = event.detail;
            logLegacyEvent("Annotation saved", "save", {
              id: uniqueId,
              annotation: annotation,
            });
          }
        );

        // Listen for postMessage events
        window.addEventListener("message", event => {
          if (event.data && event.data.type === "pdfjs-annotations-viewer") {
            logLegacyEvent(
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

// Set up event listeners using the new API
function setupEventListeners(pdfDocument) {
  const { annotationEventManager } = pdfDocument;

  // Listen for annotation selection events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.SELECTED, data => {
    logApiEvent("Annotation selected", "selected", data);
    selectedAnnotationId = data.id;
    updateAnnotationList();
    updateInspector(data.id);
  });

  // Listen for annotation unselection events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.UNSELECTED, data => {
    logApiEvent("Annotation unselected", "selected", data);
    if (selectedAnnotationId === data.id) {
      selectedAnnotationId = null;
      updateAnnotationList();
      updateInspector(null);
    }
  });

  // Listen for annotation creation events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.CREATED, data => {
    logApiEvent("Annotation created", "created", data);
    const annotation = {
      id: data.id,
      type: data.type,
      pageIndex: data.pageIndex,
      properties: data.properties,
    };
    annotations.push(annotation);
    updateAnnotationList();
    updateAnnotationIdSelect();
  });

  // Listen for annotation modification events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.MODIFIED, data => {
    logApiEvent("Annotation modified", "modified", data);
    const index = annotations.findIndex(a => a.id === data.id);
    if (index !== -1) {
      annotations[index].properties = data.properties;
      if (selectedAnnotationId === data.id) {
        updateInspector(data.id);
      }
    }
  });

  // Listen for annotation removal events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.REMOVED, data => {
    logApiEvent("Annotation removed", "removed", data);
    annotations = annotations.filter(a => a.id !== data.id);
    if (selectedAnnotationId === data.id) {
      selectedAnnotationId = null;
      updateInspector(null);
    }
    updateAnnotationList();
    updateAnnotationIdSelect();
  });

  // Listen for layer loaded events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.LAYER_LOADED, data => {
    logApiEvent("Annotation layer loaded", "ui", data);
  });

  // Listen for sidebar toggled events
  annotationEventManager.on(
    pdfjsLib.AnnotationEventType.SIDEBAR_TOGGLED,
    data => {
      logApiEvent("Annotation sidebar toggled", "ui", data);
    }
  );

  // Listen for creation mode changed events
  annotationEventManager.on(
    pdfjsLib.AnnotationEventType.CREATION_MODE_CHANGED,
    data => {
      logApiEvent("Annotation creation mode changed", "ui", data);
      updateCreationButtons(data.mode);
      toggleParameterToolbars(data.mode);
    }
  );
}

// Update the annotation list in the sidebar
function updateAnnotationList() {
  annotationList.innerHTML = "";

  annotations.forEach(annotation => {
    const item = document.createElement("li");
    item.className = "annotation-item";
    if (annotation.id === selectedAnnotationId) {
      item.className += " selected";
    }

    const typeSpan = document.createElement("div");
    typeSpan.className = "annotation-type";
    typeSpan.textContent = annotation.type;

    const pageSpan = document.createElement("div");
    pageSpan.className = "annotation-page";
    pageSpan.textContent = `Page ${annotation.pageIndex + 1}`;

    const idSpan = document.createElement("div");
    idSpan.className = "annotation-id";
    idSpan.textContent = annotation.id;

    item.appendChild(typeSpan);
    item.appendChild(pageSpan);
    item.appendChild(idSpan);

    item.addEventListener("click", () => {
      if (pdfDocument) {
        pdfDocument.annotationEventManager
          .selectAnnotation(annotation.id, annotation.pageIndex)
          .catch(error => {
            console.error("Error selecting annotation:", error);
          });
      }
    });

    annotationList.appendChild(item);
  });
}

// Update the annotation ID select dropdown
function updateAnnotationIdSelect() {
  // Save the current selection
  const currentSelection = annotationIdSelect.value;

  // Clear the dropdown
  annotationIdSelect.innerHTML = "";

  // Add the default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select an annotation";
  annotationIdSelect.appendChild(defaultOption);

  // Add an option for each annotation
  annotations.forEach(annotation => {
    const option = document.createElement("option");
    option.value = annotation.id;
    option.textContent = `${annotation.type} (Page ${annotation.pageIndex + 1})`;
    annotationIdSelect.appendChild(option);
  });

  // Restore the selection if possible
  if (currentSelection && annotations.some(a => a.id === currentSelection)) {
    annotationIdSelect.value = currentSelection;
  } else {
    annotationIdSelect.value = "";
  }
}

// Update the inspector panel with annotation details
function updateInspector(annotationId) {
  if (!annotationId) {
    inspector.innerHTML = "<p class='no-selection'>No annotation selected</p>";
    return;
  }

  const annotation = annotations.find(a => a.id === annotationId);
  if (!annotation) {
    inspector.innerHTML = "<p class='no-selection'>Annotation not found</p>";
    return;
  }

  inspector.innerHTML = "";

  // Basic information section
  const basicSection = document.createElement("div");
  basicSection.className = "inspector-section";

  const basicTitle = document.createElement("h3");
  basicTitle.textContent = "Basic Information";
  basicSection.appendChild(basicTitle);

  addInspectorProperty(basicSection, "ID", annotation.id);
  addInspectorProperty(basicSection, "Type", annotation.type);
  addInspectorProperty(basicSection, "Page", annotation.pageIndex + 1);

  inspector.appendChild(basicSection);

  // Properties section
  const propsSection = document.createElement("div");
  propsSection.className = "inspector-section";

  const propsTitle = document.createElement("h3");
  propsTitle.textContent = "Properties";
  propsSection.appendChild(propsTitle);

  const propsJson = document.createElement("div");
  propsJson.className = "inspector-json";
  propsJson.textContent = JSON.stringify(annotation.properties, null, 2);
  propsSection.appendChild(propsJson);

  inspector.appendChild(propsSection);
}

// Add a property to the inspector
function addInspectorProperty(container, name, value) {
  const prop = document.createElement("div");
  prop.className = "inspector-property";

  const nameSpan = document.createElement("span");
  nameSpan.className = "property-name";
  nameSpan.textContent = name + ": ";

  const valueSpan = document.createElement("span");
  valueSpan.className = "property-value";
  valueSpan.textContent = value;

  prop.appendChild(nameSpan);
  prop.appendChild(valueSpan);

  container.appendChild(prop);
}

// Log an API event to the API event log
function logApiEvent(message, category, data) {
  const entry = document.createElement("div");
  entry.className = `event-entry ${category || ""}`;
  entry.dataset.category = category || "";
  entry.dataset.id = ++apiEventCounter;

  const timeSpan = document.createElement("div");
  timeSpan.className = "event-time";
  timeSpan.textContent = new Date().toLocaleTimeString();

  const messageSpan = document.createElement("div");
  messageSpan.className = "event-type";
  messageSpan.textContent = message;

  entry.appendChild(timeSpan);
  entry.appendChild(messageSpan);

  if (data) {
    const dataToggle = document.createElement("div");
    dataToggle.className = "event-data-toggle";
    dataToggle.textContent = "Show data";
    dataToggle.addEventListener("click", () => {
      const dataDiv = entry.querySelector(".event-data");
      if (dataDiv.style.display === "none") {
        dataDiv.style.display = "block";
        dataToggle.textContent = "Hide data";
      } else {
        dataDiv.style.display = "none";
        dataToggle.textContent = "Show data";
      }
    });

    const dataDiv = document.createElement("div");
    dataDiv.className = "event-data";
    dataDiv.style.display = "none";
    dataDiv.textContent = JSON.stringify(data, null, 2);

    entry.appendChild(dataToggle);
    entry.appendChild(dataDiv);
  }

  apiEventLog.appendChild(entry);

  if (autoScrollApi.checked) {
    apiEventLog.scrollTop = apiEventLog.scrollHeight;
  }

  // Apply current filter
  filterEventLog("api");
}

// Log a legacy event to the legacy event log
function logLegacyEvent(message, category, data) {
  const entry = document.createElement("div");
  entry.className = `event-entry ${category || ""}`;
  entry.dataset.category = category || "";
  entry.dataset.id = ++legacyEventCounter;

  const timeSpan = document.createElement("div");
  timeSpan.className = "event-time";
  timeSpan.textContent = new Date().toLocaleTimeString();

  const messageSpan = document.createElement("div");
  messageSpan.className = "event-type";
  messageSpan.textContent = message;

  entry.appendChild(timeSpan);
  entry.appendChild(messageSpan);

  if (data) {
    const dataToggle = document.createElement("div");
    dataToggle.className = "event-data-toggle";
    dataToggle.textContent = "Show data";
    dataToggle.addEventListener("click", () => {
      const dataDiv = entry.querySelector(".event-data");
      if (dataDiv.style.display === "none") {
        dataDiv.style.display = "block";
        dataToggle.textContent = "Hide data";
      } else {
        dataDiv.style.display = "none";
        dataToggle.textContent = "Show data";
      }
    });

    const dataDiv = document.createElement("div");
    dataDiv.className = "event-data";
    dataDiv.style.display = "none";
    dataDiv.textContent = JSON.stringify(data, null, 2);

    entry.appendChild(dataToggle);
    entry.appendChild(dataDiv);
  }

  legacyEventLog.appendChild(entry);

  if (autoScrollLegacy.checked) {
    legacyEventLog.scrollTop = legacyEventLog.scrollHeight;
  }

  // Apply current filter
  filterEventLog("legacy");
}

// Filter the event log based on the selected filter
function filterEventLog(logType) {
  if (logType === "api" || logType === "both") {
    const filter = apiEventFilter.value;
    const entries = apiEventLog.querySelectorAll(".event-entry");

    entries.forEach(entry => {
      if (filter === "all" || entry.dataset.category === filter) {
        entry.style.display = "block";
      } else {
        entry.style.display = "none";
      }
    });
  }

  if (logType === "legacy" || logType === "both") {
    const filter = legacyEventFilter.value;
    const entries = legacyEventLog.querySelectorAll(".event-entry");

    entries.forEach(entry => {
      if (filter === "all" || entry.dataset.category === filter) {
        entry.style.display = "block";
      } else {
        entry.style.display = "none";
      }
    });
  }
}

// Clear the API event log
function clearApiEventLog() {
  apiEventLog.innerHTML = "";
  apiEventCounter = 0;
  logApiEvent("API Event log cleared", "ui");
}

// Clear the legacy event log
function clearLegacyEventLog() {
  legacyEventLog.innerHTML = "";
  legacyEventCounter = 0;
  logLegacyEvent("Legacy Event log cleared", "ui");
}

// Clear all event logs
function clearAllEventLogs() {
  clearApiEventLog();
  clearLegacyEventLog();
}

// Get current ink annotation parameters
function getInkParams() {
  if (!editorInkColor || !editorInkThickness || !editorInkOpacity) {
    return {};
  }
  
  // Convert hex color to RGB
  const hex = editorInkColor.value.substring(1); // Remove #
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Get opacity as decimal
  const opacity = parseInt(editorInkOpacity.value) / 100;
  
  return {
    color: [r, g, b],
    thickness: parseInt(editorInkThickness.value),
    opacity: opacity
  };
}

// Update ink parameters and apply to current annotation
function updateInkParams() {
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;
  
  const params = getInkParams();
  logApiEvent("Ink parameters updated", "ui", params);
  
  // If we're currently in ink mode, apply the new parameters
  if (createInkBtn.classList.contains("active")) {
    pdfDocument.annotationEventManager
      .updateAnnotationParameters("ink", params)
      .catch(error => {
        console.error("Error updating ink parameters
