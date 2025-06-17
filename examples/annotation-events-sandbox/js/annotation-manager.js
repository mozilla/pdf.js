/* PDF.js Annotation Events Sandbox - Annotation Manager */

import { pdfjsLib } from "./config.js";
import {
  annotationList,
  inspector,
  annotationIdSelect,
} from "./dom-elements.js";
import { logApiEvent } from "./event-logging.js";
import {
  getAnnotations,
  setAnnotations,
  addAnnotation,
  removeAnnotation,
  updateAnnotation,
} from "./pdf-viewer.js";

// Track currently selected annotation
let selectedAnnotationId = null;

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
    addAnnotation(annotation);
    updateAnnotationList();
    updateAnnotationIdSelect();
  });

  // Listen for annotation modification events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.MODIFIED, data => {
    logApiEvent("Annotation modified", "modified", data);
    updateAnnotation(data.id, data.properties);
    if (selectedAnnotationId === data.id) {
      updateInspector(data.id);
    }
  });

  // Listen for annotation removal events
  annotationEventManager.on(pdfjsLib.AnnotationEventType.REMOVED, data => {
    logApiEvent("Annotation removed", "removed", data);
    removeAnnotation(data.id);
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
  const annotations = getAnnotations();
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
      selectAnnotation(annotation.id, annotation.pageIndex);
    });

    annotationList.appendChild(item);
  });
}

// Update the annotation ID select dropdown
function updateAnnotationIdSelect() {
  const annotations = getAnnotations();

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
  const annotations = getAnnotations();

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

// Select an annotation
function selectAnnotation(id, pageIndex) {
  const pdfDocument = window.pdfDocument;
  if (pdfDocument && pdfDocument.annotationEventManager) {
    pdfDocument.annotationEventManager
      .selectAnnotation(id, pageIndex)
      .catch(error => {
        console.error("Error selecting annotation:", error);
      });
  }
}

// Update creation buttons based on the active mode
function updateCreationButtons(mode) {
  const buttons = {
    ink: document.getElementById("createInkBtn"),
    freeText: document.getElementById("createTextBtn"),
    highlight: document.getElementById("createHighlightBtn"),
    none: document.getElementById("disableCreationBtn"),
  };

  // Remove active class from all buttons
  Object.values(buttons).forEach(button => {
    if (button) {
      button.classList.remove("active");
    }
  });

  // Add active class to the current mode button
  if (mode && buttons[mode]) {
    buttons[mode].classList.add("active");
  } else if (mode === null && buttons.none) {
    buttons.none.classList.add("active");
  }
}

// Toggle parameter toolbars based on mode
function toggleParameterToolbars(mode) {
  const inkParamsToolbar = document.getElementById("editorInkParamsToolbar");

  if (inkParamsToolbar) {
    if (mode === "ink") {
      inkParamsToolbar.classList.remove("hidden");
      console.log("Ink toolbar shown");
    } else {
      inkParamsToolbar.classList.add("hidden");
      console.log("Ink toolbar hidden");
    }
  } else {
    console.error("Could not find ink parameters toolbar element");
  }
}

// Update toolbar annotation buttons
function updateToolbarAnnotationButtons(mode) {
  const buttons = {
    none: document.getElementById("editorNone"),
    freeText: document.getElementById("editorFreeText"),
    ink: document.getElementById("editorInk"),
    highlight: document.getElementById("editorHighlight"),
  };

  // Remove active class from all buttons
  Object.values(buttons).forEach(button => {
    if (button) {
      button.classList.remove("active");
    }
  });

  // Add active class to the current mode button
  if (mode && buttons[mode]) {
    buttons[mode].classList.add("active");

    // Show the appropriate parameters toolbar based on the mode
    if (mode === "ink") {
      toggleParameterToolbars("ink");
    }
  }
}

// Get current ink annotation parameters
function getInkParams() {
  const editorInkColor = document.getElementById("editorInkColor");
  const editorInkThickness = document.getElementById("editorInkThickness");
  const editorInkOpacity = document.getElementById("editorInkOpacity");

  if (!editorInkColor || !editorInkThickness || !editorInkOpacity) {
    console.warn("Could not find ink parameter controls in the DOM");
    // Return default parameters instead of empty object
    return {
      color: [0, 102, 204], // Default blue color
      thickness: 3,
      opacity: 1.0,
    };
  }

  // Convert hex color to RGB
  const hex = editorInkColor.value.substring(1); // Remove #
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Get opacity as decimal
  const opacity = parseInt(editorInkOpacity.value) / 100;

  // Get thickness with fallback
  const thickness = parseInt(editorInkThickness.value) || 3;

  console.log(
    `Ink params: color=[${r},${g},${b}], thickness=${thickness}, opacity=${opacity}`
  );

  return {
    color: [r, g, b],
    thickness: thickness,
    opacity: opacity,
  };
}

// Update ink parameters and apply to current annotation
function updateInkParams() {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  const params = getInkParams();
  logApiEvent("Ink parameters updated", "ui", params);

  // Store the ink parameters in a global variable that can be accessed later
  window.currentInkParams = params;

  // If we're currently in ink mode, re-enable it to apply the new parameters
  const createInkBtn = document.getElementById("createInkBtn");
  if (createInkBtn && createInkBtn.classList.contains("active")) {
    console.log("Updating ink parameters:", params);

    // Apply parameters to all editor layers directly with multiple methods
    const pages = document.querySelectorAll(".page");
    pages.forEach((pageDiv, index) => {
      if (pageDiv.annotationEditorLayer) {
        try {
          const layer = pageDiv.annotationEditorLayer;
          console.log(
            `Applying updated ink parameters to page ${index + 1}:`,
            params
          );

          // Try multiple methods to update parameters
          if (typeof layer.updateToolbar === "function") {
            console.log(`Page ${index + 1}: Using updateToolbar`);
            layer.updateToolbar(params);
          } else if (typeof layer.updateParams === "function") {
            console.log(`Page ${index + 1}: Using updateParams`);
            layer.updateParams(params);
          } else {
            console.log(`Page ${index + 1}: Directly setting properties`);
            // Try direct property setting as last resort
            if (params.color && layer.currentColor !== undefined) {
              layer.currentColor = params.color;
            }
            if (params.thickness && layer.thickness !== undefined) {
              layer.thickness = params.thickness;
            }
            if (params.opacity && layer.opacity !== undefined) {
              layer.opacity = params.opacity;
            }
          }
        } catch (error) {
          console.error(
            `Error updating ink parameters on page ${index + 1}:`,
            error
          );
        }
      }
    });

    // Force the editor layers to ink mode again with the new parameters
    let AnnotationEditorType;
    const pdfjsLib = window.pdfjsLib;

    if (pdfjsLib.PDFAnnotationEditorType) {
      AnnotationEditorType = pdfjsLib.PDFAnnotationEditorType;
    } else if (pdfjsLib.AnnotationEditorType) {
      AnnotationEditorType = pdfjsLib.AnnotationEditorType;
    } else {
      AnnotationEditorType = { INK: 3 };
    }

    // Force all editor layers to ink mode again
    pages.forEach((pageDiv, index) => {
      if (pageDiv.annotationEditorLayer) {
        try {
          const layer = pageDiv.annotationEditorLayer;

          if (typeof layer.setEditingMode === "function") {
            layer.setEditingMode(AnnotationEditorType.INK);
          } else if (typeof layer.setMode === "function") {
            layer.setMode(AnnotationEditorType.INK);
          } else if (typeof layer.updateMode === "function") {
            layer.updateMode(AnnotationEditorType.INK);
          }
        } catch (error) {
          console.error(
            `Error resetting ink mode on page ${index + 1}:`,
            error
          );
        }
      }
    });

    // Also re-enable the ink annotation mode with the new parameters applied
    pdfDocument.annotationEventManager
      .enableAnnotationCreation("ink", params)
      .catch(error => {
        console.error("Error updating ink parameters:", error);
      });
  }
}

// Enable annotation creation mode
function enableAnnotationCreation(mode) {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  console.log(`Enabling annotation creation mode: ${mode}`);

  // Get ink parameters if we're in ink mode
  let parameters = null;
  if (mode === "ink") {
    parameters = getInkParams();
    console.log("Using ink parameters:", parameters);

    // Store the ink parameters globally
    window.currentInkParams = parameters;
  }

  // Detect the available AnnotationEditorType constants
  let AnnotationEditorType;
  const pdfjsLib = window.pdfjsLib;

  if (pdfjsLib.PDFAnnotationEditorType) {
    console.log("Using PDFAnnotationEditorType for mode conversion");
    AnnotationEditorType = pdfjsLib.PDFAnnotationEditorType;
  } else if (pdfjsLib.AnnotationEditorType) {
    console.log("Using AnnotationEditorType for mode conversion");
    AnnotationEditorType = pdfjsLib.AnnotationEditorType;
  } else {
    console.log("Using hardcoded editor types for mode conversion");
    // Create a fallback if neither is available
    AnnotationEditorType = {
      NONE: 0,
      FREETEXT: 1,
      INK: 3,
      HIGHLIGHT: 4,
    };
  }

  // Convert mode string to editor type integer using the detected constants
  let editorType = AnnotationEditorType.NONE; // Default to NONE
  if (mode === "freeText") editorType = AnnotationEditorType.FREETEXT;
  if (mode === "ink") editorType = AnnotationEditorType.INK;
  if (mode === "highlight") editorType = AnnotationEditorType.HIGHLIGHT;

  console.log(`Converted mode "${mode}" to editor type ${editorType}`);

  // First enable the annotation creation mode in the event manager
  pdfDocument.annotationEventManager
    .enableAnnotationCreation(mode, parameters)
    .then(() => {
      updateCreationButtons(mode);
      console.log(`Annotation creation mode ${mode} enabled in event manager`);

      // Force all annotation editor layers to the correct mode directly
      const pages = document.querySelectorAll(".page");

      console.log(`Setting editor mode on ${pages.length} pages`);

      // First pass: update the mode on all pages
      pages.forEach((pageDiv, index) => {
        if (pageDiv.annotationEditorLayer) {
          try {
            console.log(
              `Setting editor layer on page ${index + 1} to mode ${editorType}`
            );

            // Try multiple methods to set the mode
            const layer = pageDiv.annotationEditorLayer;

            if (typeof layer.setEditingMode === "function") {
              console.log(
                `Page ${index + 1}: Using setEditingMode(${editorType})`
              );
              layer.setEditingMode(editorType);
            } else if (typeof layer.setMode === "function") {
              console.log(`Page ${index + 1}: Using setMode(${editorType})`);
              layer.setMode(editorType);
            } else {
              console.log(`Page ${index + 1}: Using updateMode(${editorType})`);
              layer.updateMode(editorType);
            }
          } catch (error) {
            console.error(
              `Error setting editor mode on page ${index + 1}:`,
              error
            );
          }
        } else {
          console.warn(
            `No annotation editor layer found for page ${index + 1}`
          );
        }
      });

      // Second pass: if ink mode, apply parameters to all pages
      if (mode === "ink" && parameters) {
        console.log("Second pass: applying ink parameters to all pages");

        pages.forEach((pageDiv, index) => {
          if (pageDiv.annotationEditorLayer) {
            try {
              const layer = pageDiv.annotationEditorLayer;
              console.log(
                `Applying ink parameters to page ${index + 1}:`,
                parameters
              );

              // Try multiple methods to update parameters
              if (typeof layer.updateToolbar === "function") {
                console.log(`Page ${index + 1}: Using updateToolbar`);
                layer.updateToolbar(parameters);
              } else if (typeof layer.updateParams === "function") {
                console.log(`Page ${index + 1}: Using updateParams`);
                layer.updateParams(parameters);
              } else {
                console.log(`Page ${index + 1}: Directly setting properties`);
                // Try direct property setting as last resort
                if (parameters.color && layer.currentColor !== undefined) {
                  layer.currentColor = parameters.color;
                }
                if (parameters.thickness && layer.thickness !== undefined) {
                  layer.thickness = parameters.thickness;
                }
                if (parameters.opacity && layer.opacity !== undefined) {
                  layer.opacity = parameters.opacity;
                }
              }
            } catch (error) {
              console.error(
                `Error applying ink parameters on page ${index + 1}:`,
                error
              );
            }
          }
        });
      }
    })
    .catch(error => {
      console.error(`Error enabling ${mode} annotation creation:`, error);
    });
}

// Disable annotation creation mode
function disableAnnotationCreation() {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  pdfDocument.annotationEventManager
    .disableAnnotationCreation()
    .then(() => {
      updateCreationButtons(null);
    })
    .catch(error => {
      console.error("Error disabling annotation creation:", error);
    });
}

// Show annotation sidebar
function showAnnotationSidebar() {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  pdfDocument.annotationEventManager.showAnnotationSidebar().catch(error => {
    console.error("Error showing annotation sidebar:", error);
  });
}

// Hide annotation sidebar
function hideAnnotationSidebar() {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  pdfDocument.annotationEventManager.hideAnnotationSidebar().catch(error => {
    console.error("Error hiding annotation sidebar:", error);
  });
}

// Toggle sidebar
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    if (sidebar.classList.contains("hidden")) {
      sidebar.classList.remove("hidden");
      document.getElementById("toggleSidebar").textContent = "Hide Sidebar";
    } else {
      sidebar.classList.add("hidden");
      document.getElementById("toggleSidebar").textContent = "Show Sidebar";
    }
  }
}

// Handle annotation selection in dropdown
function handleAnnotationSelect() {
  const id = annotationIdSelect.value;
  if (id) {
    const annotations = getAnnotations();
    const annotation = annotations.find(a => a.id === id);
    if (annotation) {
      selectAnnotation(id, annotation.pageIndex);
    }
  }
}

// Handle event type change
function handleEventTypeChange() {
  const type = eventType.value;
  const pageIndexGroup = document.getElementById("pageIndexGroup");
  const propertiesGroup = document.getElementById("propertiesGroup");

  // Show/hide the appropriate input fields based on event type
  if (type === "select" || type === "unselect") {
    if (pageIndexGroup) pageIndexGroup.style.display = "block";
    if (propertiesGroup) propertiesGroup.style.display = "none";
  } else if (type === "create") {
    if (pageIndexGroup) pageIndexGroup.style.display = "block";
    if (propertiesGroup) propertiesGroup.style.display = "block";
  } else if (type === "modify") {
    if (pageIndexGroup) pageIndexGroup.style.display = "none";
    if (propertiesGroup) propertiesGroup.style.display = "block";
  } else if (type === "delete") {
    if (pageIndexGroup) pageIndexGroup.style.display = "none";
    if (propertiesGroup) propertiesGroup.style.display = "none";
  }
}

// Send a custom event
function sendEvent() {
  const pdfDocument = window.pdfDocument;
  if (!pdfDocument || !pdfDocument.annotationEventManager) return;

  const type = eventType.value;
  const id = annotationIdSelect.value;
  const pageIndex = parseInt(pageIndexInput.value, 10);
  let properties;

  try {
    properties = propertiesTextarea.value
      ? JSON.parse(propertiesTextarea.value)
      : {};
  } catch (e) {
    console.error("Invalid properties JSON:", e);
    alert("Invalid properties JSON. Please check your syntax.");
    return;
  }

  if (!id && type !== "create") {
    alert("Please select an annotation ID");
    return;
  }

  if (isNaN(pageIndex) && (type === "select" || type === "create")) {
    alert("Please enter a valid page index");
    return;
  }

  switch (type) {
    case "select":
      pdfDocument.annotationEventManager
        .selectAnnotation(id, pageIndex)
        .catch(error => {
          console.error("Error selecting annotation:", error);
        });
      break;
    case "unselect":
      pdfDocument.annotationEventManager.unselectAnnotation(id).catch(error => {
        console.error("Error unselecting annotation:", error);
      });
      break;
    case "create":
      // This is just for testing - normally annotations are created via UI
      pdfDocument.annotationEventManager
        .createAnnotation("freeText", properties, pageIndex)
        .catch(error => {
          console.error("Error creating annotation:", error);
        });
      break;
    case "modify":
      pdfDocument.annotationEventManager
        .modifyAnnotation(id, properties)
        .catch(error => {
          console.error("Error modifying annotation:", error);
        });
      break;
    case "delete":
      pdfDocument.annotationEventManager.removeAnnotation(id).catch(error => {
        console.error("Error removing annotation:", error);
      });
      break;
  }
}

export {
  setupEventListeners,
  updateAnnotationList,
  updateAnnotationIdSelect,
  updateInspector,
  selectAnnotation,
  updateCreationButtons,
  updateToolbarAnnotationButtons,
  toggleParameterToolbars,
  getInkParams,
  updateInkParams,
  enableAnnotationCreation,
  disableAnnotationCreation,
  showAnnotationSidebar,
  hideAnnotationSidebar,
  toggleSidebar,
  handleAnnotationSelect,
  handleEventTypeChange,
  sendEvent,
};
