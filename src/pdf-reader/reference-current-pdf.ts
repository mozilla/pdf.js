// TypeScript needs to know about PDFViewerApplication since it's added by PDF.js at runtime
declare global {
  interface Window {
    PDFViewerApplication: {
      documentInfo?: { Title?: string };
      eventBus?: { _on: (event: string, callback: () => void) => void };
      page?: number;
      pdfDocument?: any;
      pdfViewer?: any;
    };
  }
}

import type { PDFReference } from "./types";

export async function referenceCurrentDocument(): Promise<PDFReference> {
  const app = window.PDFViewerApplication;
  if (!app?.pdfDocument || !app?.pdfViewer) {
    throw new Error("PDF document not available");
  }

  return {
    pdfDocument: app.pdfDocument,
    pdfViewer: app.pdfViewer,
    getCurrentPage: () => app.page || 1,
    getTitle: () => app.documentInfo?.Title || "Untitled",
  };
}
