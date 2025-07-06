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

export interface PDFReference {
  pdfDocument: any;
  pdfViewer: any;
  getCurrentPage: () => number;
  getTitle: () => string;
}

export async function referenceCurrentDocument(): Promise<PDFReference> {
  await setupDocumentListener();

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

export async function getCurrentPageAsImageFile(
  pdf: PDFReference
): Promise<File> {
  const currentPageNum = pdf.getCurrentPage();

  // Get the current page
  const page = await pdf.pdfDocument.getPage(currentPageNum);

  // Create a canvas for rendering
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // Set up viewport for good quality (scale 2 for higher resolution)
  const viewport = page.getViewport({ scale: 2 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Render the page to canvas
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;

  // Convert canvas to blob and return as File
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          const fileName = `${pdf.getTitle()}_page_${currentPageNum}.png`;
          const file = new File([blob], fileName, { type: "image/png" });
          resolve(file);
        } else {
          reject(new Error("Failed to convert canvas to blob"));
        }
      },
      "image/png",
      0.95
    );
  });
}

function setupDocumentListener(): Promise<void> {
  return new Promise(resolve => {
    const eventBus = window.PDFViewerApplication?.eventBus;

    if (eventBus) {
      eventBus._on("documentloaded", () => {
        setTimeout(() => {
          console.log("📄 PDF loaded");
          resolve();
        }, 100);
      });
    } else {
      // Fallback: if eventBus is not available, resolve after a delay
      setTimeout(() => {
        console.log("📄 PDF loaded (fallback)");
        resolve();
      }, 1000);
    }
  });
}
