// TypeScript needs to know about PDFViewerApplication since it's added by PDF.js at runtime
declare global {
  interface Window {
    PDFViewerApplication: {
      documentInfo?: { Title?: string };
      eventBus?: { _on: (event: string, callback: () => void) => void };
    };
  }
}

function getCurrentPDFTitle(): string {
  const title = window.PDFViewerApplication?.documentInfo?.Title;
  return title || "No title";
}

function setupDocumentListener() {
  const eventBus = window.PDFViewerApplication?.eventBus;

  if (eventBus) {
    eventBus._on("documentloaded", () => {
      setTimeout(() => {
        console.log("📄 PDF Title:", getCurrentPDFTitle());
      }, 100); // Wait for metadata to be fully loaded
    });

    console.log("📄 Document change listener set up");
  } else {
    console.warn("Could not set up document listener - eventBus not available");
  }
}

export { setupDocumentListener };
