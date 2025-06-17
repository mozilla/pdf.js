/* PDF.js Annotation Events Sandbox - UI Controls */

import { tabs } from "./dom-elements.js";
import {
  getCurrentPageIndex,
  setCurrentPageIndex,
  updatePageNumber,
  scrollToPage,
  updateScale,
  getPdfDocument,
} from "./pdf-viewer.js";

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

// Set up navigation controls
function setupNavigationControls(previous, next, pageNumber) {
  if (previous) {
    previous.addEventListener("click", () => {
      const pdfDocument = getPdfDocument();
      const currentPageIndex = getCurrentPageIndex();
      if (pdfDocument && currentPageIndex > 0) {
        setCurrentPageIndex(currentPageIndex - 1);
        updatePageNumber();
      }
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      const pdfDocument = getPdfDocument();
      const currentPageIndex = getCurrentPageIndex();
      if (pdfDocument && currentPageIndex < pdfDocument.numPages - 1) {
        setCurrentPageIndex(currentPageIndex + 1);
        updatePageNumber();
      }
    });
  }

  if (pageNumber) {
    pageNumber.addEventListener("change", () => {
      const pdfDocument = getPdfDocument();
      const pageIndex = parseInt(pageNumber.value, 10) - 1;
      if (pdfDocument && pageIndex >= 0 && pageIndex < pdfDocument.numPages) {
        setCurrentPageIndex(pageIndex);
        updatePageNumber();
        scrollToPage(pageIndex);
      }
    });
  }
}

// Set up zoom controls
function setupZoomControls(zoomOutButton, zoomInButton, scaleSelect) {
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
}

// Handle file selection
function handleFileSelect(event, fileName, onLoadPDF) {
  const file = event.target.files[0];
  if (file && file.type === "application/pdf") {
    fileName.textContent = file.name;
    const fileURL = URL.createObjectURL(file);
    onLoadPDF(fileURL);
  }
}

export {
  initTabs,
  setupNavigationControls,
  setupZoomControls,
  handleFileSelect,
};
