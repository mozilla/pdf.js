const { $ } = window;

import { getDocument } from "./display/api.js";
import { GlobalWorkerOptions } from "./display/worker_options.js";

export function asyncAppendPreviewImage($elem, fileUrl, width, height) {
  const imgWidth = width || $elem.width();
  const imgHeight = height || $elem.height();
  const p = new Promise(function (resolve, reject) {
    $.getScript("Scripts/pdfjs/build/pdf.js", function () {
      const url = fileUrl;
      const canvas = document.createElement("canvas");
      const canvasWrapper = document.createElement("div");

      canvas.style.width = "100%";
      canvas.style.height = "100%";

      canvasWrapper.style.width = `${imgWidth}px`;
      canvasWrapper.style.height = `${imgHeight}px`;

      GlobalWorkerOptions.workerSrc = "Scripts/pdfjs/build/pdf.worker.js";

      const loadingTask = getDocument(url);

      loadingTask.promise.then(
        function (pdf) {
          // Fetch the first page
          const pageNumber = 1;
          pdf.getPage(pageNumber).then(function (page) {
            const viewport = page.getViewport({ scale: 1.5 });

            // Prepare canvas using PDF page dimensions
            const context = canvas.getContext("2d");

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render PDF page into canvas context
            const renderContext = {
              canvasContext: context,
              viewport,
            };

            const renderTask = page.render(renderContext);

            renderTask.promise.then(function () {
              canvasWrapper.appendChild(canvas);
              $elem[0].appendChild(canvasWrapper);

              // resolve promise with base64 encoded image
              resolve(canvas.toDataURL());
            });
          });
        },
        function (err) {
          // PDF loading error
          console.error(err);
          reject(err);
        }
      );
    });
  });

  return p;
}

export function asyncGetPDFPreviewImageURL(fileURL, height, width) {
  const imgWidth = width;
  const imgHeight = height;
  const canvas = document.createElement("canvas");
  const canvasWrapper = document.createElement("div");

  const scriptPromise = new Promise((resolve, reject) => {
    resolve();

    const script = document.createElement("script");
    document.body.appendChild(script);
    script.onload = resolve;
    script.onerror = reject;
    script.async = true;
    script.src = "Scripts/pdfjs/build/pdf.js";
  });

  return scriptPromise
    .then(function () {
      const url = fileURL;

      canvas.style.width = "100%";
      canvas.style.height = "100%";

      canvasWrapper.style.width = `${imgWidth}px`;
      canvasWrapper.style.height = `${imgHeight}px`;

      GlobalWorkerOptions.workerSrc = "Scripts/pdfjs/build/pdf.worker.js";
      const loadingTask = getDocument(url);

      return loadingTask.promise;
    })
    .then(function (pdf) {
      // Fetch the first page
      return pdf.getPage(1);
    })
    .then(function (page) {
      const viewport = page.getViewport({ scale: 1.5 });

      // Prepare canvas using PDF page dimensions
      const context = canvas.getContext("2d");

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: context,
        viewport,
      };

      return page.render(renderContext);
    })
    .then(function () {
      canvasWrapper.appendChild(canvas);

      return canvas.toDataURL();
    })
    .catch(function (err) {
      console.log(err);
    });
}

export function getViewerSrc(fileUrl, localeCode) {
  // need to grab locale cookie which is set via ReceiptViewer WUC
  const viewerUrl = "Scripts/pdfjs/web/viewer.html";
  const params = fileUrl.substr(fileUrl.indexOf("?") + 1);
  const pdfViewerUrl = `${viewerUrl}?${encodeURIComponent(
    params
  )}&d=${Date.now()}#locale=${localeCode || ""}`;

  return pdfViewerUrl;
}
