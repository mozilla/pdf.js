import React, { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudfare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

const ViewPDF = () => {
  const canvasRef = useRef();

  const [pdfRef, setPdfRef] = useState<pdfjsLib.PDFDocumentProxy>();
  const [currentPage, setCurrentPage] = useState(1);

  const renderPage = useCallback(
    (pageNumber, pdf = pdfRef) => {
      pdf &&
        pdf.getPage(pageNumber).then((page: pdfjsLib.PDFPageProxy) => {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas: any = canvasRef.current;
          canvas.height = viewport?.height;
          canvas.width = viewport?.width;
          const renderContext = {
            canvasContext: canvas.getContext("2d"),
            viewport: viewport,
          };
          page.render(renderContext);
        });
    },
    [pdfRef]
  );

  useEffect(() => {
    renderPage(currentPage, pdfRef);
  }, [pdfRef, currentPage, renderPage]);

  useEffect(() => {
    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise.then(
      loadedPdf => {
        setPdfRef(loadedPdf);
      },
      error => {
        console.error(error);
      }
    );
  }, []);

  const nextPage = () =>
    pdfRef && currentPage < pdfRef.numPages && setCurrentPage(currentPage + 1);
  const prevPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div
        style={{
          width: "100%",
          padding: "10px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
        }}
      >
        <button onClick={prevPage}>prev</button>
        <button onClick={nextPage}>next</button>
      </div>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
};

export default ViewPDF;
