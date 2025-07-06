import type { PDFReference } from "./types";

export async function getCurrentPageAsImage({
  getCurrentPage,
  pdfDocument,
  getTitle,
}: Omit<PDFReference, "pdfViewer">): Promise<File> {
  const currentPageNum = getCurrentPage();

  const page = await pdfDocument.getPage(currentPageNum);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // Set up viewport for good quality (scale 2 for higher resolution)
  const viewport = page.getViewport({ scale: 2 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          const fileName = `${getTitle()}_page_${currentPageNum}.png`;
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
