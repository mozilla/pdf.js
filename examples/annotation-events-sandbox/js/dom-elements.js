/* PDF.js Annotation Events Sandbox - DOM Elements */

// DOM elements - Main UI
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const viewerContainer = document.getElementById("viewerContainer");
const viewer = document.getElementById("viewer");
const annotationList = document.getElementById("annotationList");
const inspector = document.getElementById("inspector");
const pageNumber = document.getElementById("pageNumber");
const numPages = document.getElementById("numPages");

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
const editorInkParamsToolbar = document.getElementById(
  "editorInkParamsToolbar"
);
const editorInkColor = document.getElementById("editorInkColor");
const editorInkThickness = document.getElementById("editorInkThickness");
const editorInkThicknessValue = document.getElementById(
  "editorInkThicknessValue"
);
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

// Navigation buttons
const previous = document.getElementById("previous");
const next = document.getElementById("next");

// Zoom controls
const zoomOutButton = document.getElementById("zoomOut");
const zoomInButton = document.getElementById("zoomIn");
const scaleSelect = document.getElementById("scaleSelect");

// Toolbar annotation buttons
const editorNone = document.getElementById("editorNone");
const editorFreeText = document.getElementById("editorFreeText");
const editorInk = document.getElementById("editorInk");
const editorHighlight = document.getElementById("editorHighlight");
const toggleSidebarButton = document.getElementById("toggleSidebar");

// Export all DOM elements
export {
  // Main UI
  fileInput,
  fileName,
  viewerContainer,
  viewer,
  annotationList,
  inspector,
  pageNumber,
  numPages,

  // Tab interface
  tabs,

  // API Events tab
  apiEventLog,
  apiEventFilter,
  autoScrollApi,
  clearApiLogBtn,

  // Legacy Events tab
  legacyEventLog,
  legacyEventFilter,
  autoScrollLegacy,
  clearLegacyLogBtn,

  // Event controls
  eventType,
  annotationIdSelect,
  pageIndexInput,
  propertiesTextarea,
  propertiesGroup,
  pageIndexGroup,

  // Ink parameters toolbar
  editorInkParamsToolbar,
  editorInkColor,
  editorInkThickness,
  editorInkThicknessValue,
  editorInkOpacity,
  editorInkOpacityValue,

  // Button elements
  createInkBtn,
  createTextBtn,
  createHighlightBtn,
  disableCreationBtn,
  showSidebarBtn,
  hideSidebarBtn,
  clearLogBtn,
  sendEventBtn,

  // Navigation buttons
  previous,
  next,

  // Zoom controls
  zoomOutButton,
  zoomInButton,
  scaleSelect,

  // Toolbar annotation buttons
  editorNone,
  editorFreeText,
  editorInk,
  editorHighlight,
  toggleSidebarButton,
};
