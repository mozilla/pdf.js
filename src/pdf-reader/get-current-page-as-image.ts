import type { PDFReference } from "./types";

export async function getCurrentPageAsImage(pdf: PDFReference): Promise<File> {
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
