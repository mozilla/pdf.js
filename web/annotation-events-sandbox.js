/* PDF.js Annotation Events Sandbox JavaScript */

// Import PDF.js as an ES module
import * as pdfjsLib from "../build/generic/build/pdf.mjs";

// Configure PDF.js worker with the correct path
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../build/generic/build/pdf.worker.mjs";

// Default PDF URL - can be changed by the user
const DEFAULT_PDF_URL = "../web/compressed.tracemonkey-pldi-09.pdf";

// State variables
let pdfDocument = null;
let pdfPages = [];
let currentPageIndex = 0;
let annotations = [];
let selectedAnnotationId = null;
let eventCounter = 0;

// DOM elements
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const viewerContainer = document.getElementById("viewerContainer");
const viewer = document.getElementById("viewer");
const annotationList = document.getElementById("annotationList");
const eventLog = document.getElementById("eventLog");
const inspector = document.getElementById("inspector");
const autoScroll = document.getElementById("autoScroll");
const eventFilter = document.getElementById("eventFilter");
const eventType = document.getElementById("eventType");
const annotationIdSelect = document.getElementById("annotationId");
const pageIndexInput = document.getElementById("pageIndex");
const propertiesTextarea = document.getElementById("properties");
const propertiesGroup = document.getElementById("propertiesGroup");
const pageIndexGroup = document.getElementById("pageIndexGroup");

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
  // Set up event listeners
  fileInput.addEventListener("change", handleFileSelect);
  eventType.addEventListener("change", handleEventTypeChange);
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
  clearLogBtn.addEventListener("click", clearEventLog);
  sendEventBtn.addEventListener("click", sendEvent);
  eventFilter.addEventListener("change", filterEventLog);
  annotationIdSelect.addEventListener("change", handleAnnotationSelect);

  // Load the default PDF
  loadPDF(DEFAULT_PDF_URL);
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
      logEvent("PDF document loaded", "ui", { numPages: doc.numPages });

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
          logEvent("Annotation Event Manager initialized", "ui");
        } else {
          logEvent("Annotation Event Manager not available", "error");
          console.error(
            "Annotation Event Manager not available in this PDF.js build"
          );
        }
      });
    })
    .catch(error => {
      console.error("Error loading PDF:", error);
      logEvent("Error loading PDF", "error", { message: error.message });
    });
}

// Render a PDF page
function renderPage(page, pageIndex) {
  const scale = 1.0;
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

  // Add the page div to the viewer
  viewer.appendChild(pageDiv);

  // Render the page content
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  page
    .render(renderContext)
    .promise.then(() => {
      logEvent(`Page ${pageIndex + 1} rendered`, "ui");
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
    logEvent("Annotation selected", "selected", data);
    selectedAnnotationId = data.id;
    updateAnnotationList();
    updateInspector(data.id);
  });

  // Listen for annotation unselection events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.UNSELECTED, data => {
    logEvent("Annotation unselected", "selected", data);
    if (selectedAnnotationId === data.id) {
      selectedAnnotationId = null;
      updateAnnotationList();
      updateInspector(null);
    }
  });

  // Listen for annotation creation events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.CREATED, data => {
    logEvent("Annotation created", "created", data);
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
    logEvent("Annotation modified", "modified", data);
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
    logEvent("Annotation removed", "removed", data);
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
    logEvent("Annotation layer loaded", "ui", data);
  });

  // Listen for sidebar toggled events
  annotationEventManager.on(
    pdfjsLib.AnnotationEventType.SIDEBAR_TOGGLED,
    data => {
      logEvent("Annotation sidebar toggled", "ui", data);
    }
  );

  // Listen for creation mode changed events
  annotationEventManager.on(
    pdfjsLib.AnnotationEventType.CREATION_MODE_CHANGED,
    data => {
      logEvent("Annotation creation mode changed", "ui", data);
      updateCreationButtons(data.mode);
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

// Log an event to the event log
function logEvent(message, category, data) {
  const entry = document.createElement("div");
  entry.className = `event-entry ${category || ""}`;
  entry.dataset.category = category || "";
  entry.dataset.id = ++eventCounter;

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

  eventLog.appendChild(entry);

  if (autoScroll.checked) {
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  // Apply current filter
  filterEventLog();
}

// Filter the event log based on the selected filter
function filterEventLog() {
  const filter = eventFilter.value;
  const entries = eventLog.querySelectorAll(".event-entry");

  entries.forEach(entry => {
    if (filter === "all" || entry.dataset.category === filter) {
      entry.style.display = "block";
    } else {
      entry.style.display = "none";
    }
  });
}

// Clear the event log
function clearEventLog() {
  eventLog.innerHTML = "";
  eventCounter = 0;
  logEvent("Event log cleared", "ui");
}

// Enable annotation creation mode
function enableAnnotationCreation(type) {
  if (!pdfDocument) return;

  pdfDocument.annotationEventManager
    .enableAnnotationCreation(type)
    .then(() => {
      logEvent(`Enabled ${type} annotation creation`, "ui");
      updateCreationButtons(type);
    })
    .catch(error => {
      console.error("Error enabling annotation creation:", error);
      logEvent("Error enabling annotation creation", "error", {
        message: error.message,
      });
    });
}

// Disable annotation creation mode
function disableAnnotationCreation() {
  if (!pdfDocument) return;

  pdfDocument.annotationEventManager
    .disableAnnotationCreation()
    .then(() => {
      logEvent("Disabled annotation creation", "ui");
      updateCreationButtons(null);
    })
    .catch(error => {
      console.error("Error disabling annotation creation:", error);
      logEvent("Error disabling annotation creation", "error", {
        message: error.message,
      });
    });
}

// Show the annotation sidebar
function showAnnotationSidebar() {
  if (!pdfDocument) return;

  pdfDocument.annotationEventManager
    .showAnnotationSidebar()
    .then(() => {
      logEvent("Showed annotation sidebar", "ui");
    })
    .catch(error => {
      console.error("Error showing annotation sidebar:", error);
      logEvent("Error showing annotation sidebar", "error", {
        message: error.message,
      });
    });
}

// Hide the annotation sidebar
function hideAnnotationSidebar() {
  if (!pdfDocument) return;

  pdfDocument.annotationEventManager
    .hideAnnotationSidebar()
    .then(() => {
      logEvent("Hid annotation sidebar", "ui");
    })
    .catch(error => {
      console.error("Error hiding annotation sidebar:", error);
      logEvent("Error hiding annotation sidebar", "error", {
        message: error.message,
      });
    });
}

// Update the creation buttons based on the current mode
function updateCreationButtons(mode) {
  createInkBtn.classList.toggle("active", mode === "ink");
  createTextBtn.classList.toggle("active", mode === "freeText");
  createHighlightBtn.classList.toggle("active", mode === "highlight");
  disableCreationBtn.classList.toggle("active", mode === null);
}

// Handle event type change
function handleEventTypeChange() {
  const type = eventType.value;

  // Show/hide the properties field based on the event type
  propertiesGroup.style.display = type === "modify" ? "block" : "none";

  // Show/hide the page index field based on the event type
  pageIndexGroup.style.display = type === "select" ? "block" : "none";
}

// Handle annotation selection in the dropdown
function handleAnnotationSelect() {
  const id = annotationIdSelect.value;
  if (!id) return;

  const annotation = annotations.find(a => a.id === id);
  if (annotation) {
    pageIndexInput.value = annotation.pageIndex;

    if (eventType.value === "modify") {
      propertiesTextarea.value = JSON.stringify(annotation.properties, null, 2);
    }
  }
}

// Send an event to PDF.js
function sendEvent() {
  if (!pdfDocument) return;

  const type = eventType.value;
  const id = annotationIdSelect.value;

  if (!id) {
    alert("Please select an annotation");
    return;
  }

  switch (type) {
    case "select":
      const pageIndex = parseInt(pageIndexInput.value, 10);
      pdfDocument.annotationEventManager
        .selectAnnotation(id, pageIndex)
        .then(() => {
          logEvent(`Sent select event for annotation ${id}`, "ui");
        })
        .catch(error => {
          console.error("Error selecting annotation:", error);
          logEvent("Error selecting annotation", "error", {
            message: error.message,
          });
        });
      break;

    case "unselect":
      pdfDocument.annotationEventManager
        .unselectAnnotation(id)
        .then(() => {
          logEvent(`Sent unselect event for annotation ${id}`, "ui");
        })
        .catch(error => {
          console.error("Error unselecting annotation:", error);
          logEvent("Error unselecting annotation", "error", {
            message: error.message,
          });
        });
      break;

    case "modify":
      try {
        const properties = JSON.parse(propertiesTextarea.value);
        pdfDocument.annotationEventManager
          .modifyAnnotation(id, properties)
          .then(() => {
            logEvent(`Sent modify event for annotation ${id}`, "ui");
          })
          .catch(error => {
            console.error("Error modifying annotation:", error);
            logEvent("Error modifying annotation", "error", {
              message: error.message,
            });
          });
      } catch (error) {
        alert("Invalid JSON in properties field");
        console.error("Invalid JSON:", error);
      }
      break;

    case "remove":
      pdfDocument.annotationEventManager
        .removeAnnotation(id)
        .then(() => {
          logEvent(`Sent remove event for annotation ${id}`, "ui");
        })
        .catch(error => {
          console.error("Error removing annotation:", error);
          logEvent("Error removing annotation", "error", {
            message: error.message,
          });
        });
      break;
  }
}

// Initialize the sandbox when the page loads
window.addEventListener("load", init);
