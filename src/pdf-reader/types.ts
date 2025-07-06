// Define PDF.js types based on the actual API (since PDF.js is JavaScript, not TypeScript)

// Based on PDFDocumentProxy from src/display/api.js
export interface PDFDocumentProxy {
  numPages: number;
  fingerprints: [string, string];
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  getDestinations(): Promise<any>;
  getOutline(): Promise<any>;
  getMetadata(): Promise<any>;
  getData(): Promise<Uint8Array>;
  destroy(): Promise<void>;
  // Add other methods as needed
}

// Based on PDFPageProxy from src/display/api.js
export interface PDFPageProxy {
  pageNumber: number;
  rotate: number;
  view: [number, number, number, number];
  getViewport(options?: { scale?: number; rotation?: number }): any;
  render(params: any): any;
  getTextContent(): Promise<any>;
  // Add other methods as needed
}

// Based on PDFViewer from web/pdf_viewer.js
export interface PDFViewer {
  currentPageNumber: number;
  currentScale: number;
  pagesCount: number;
  container: HTMLElement;
  // Add other properties as needed
}

// Global window interface for PDFViewerApplication
declare global {
  interface Window {
    PDFViewerApplication: {
      documentInfo?: { Title?: string };
      eventBus?: { _on: (event: string, callback: () => void) => void };
      page?: number;
      pdfDocument?: PDFDocumentProxy;
      pdfViewer?: PDFViewer;
    };
  }
}

export interface PDFReference {
  pdfDocument: PDFDocumentProxy;
  pdfViewer: PDFViewer;
  getCurrentPage: () => number;
  getTitle: () => string;
}
