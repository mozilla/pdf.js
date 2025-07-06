export interface PDFReference {
  pdfDocument: any;
  pdfViewer: any;
  getCurrentPage: () => number;
  getTitle: () => string;
}
