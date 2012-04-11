/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

(function pdfApiWrapper() {
  function PdfPageWrapper(page) {
    this.page = page;
  }
  PdfPageWrapper.prototype = {
    get rotate() {
      return this.page.rotate;
    },
    get stats() {
      return this.page.stats;
    },
    get ref() {
      return this.page.ref;
    },
    get view() {
      return this.page.view;
    },
    getViewport: function(scale, rotate) {
      if (arguments < 2)
        rotate = this.rotate;
      return new PDFJS.PageViewport(this.view, scale, rotate, 0, 0);
    },
    getAnnotations: function() {
      var promise = new PDFJS.Promise();
      var annotations = this.page.getAnnotations();
      promise.resolve(annotations);
      return promise;
    },
    render: function(renderContext) {
      var promise = new PDFJS.Promise();
      this.page.startRendering(renderContext.canvasContext,
        renderContext.viewport,
        function complete(error) {
          if (error)
            promise.reject(error);
          else
            promise.resolve();
        },
        renderContext.textLayer);
      return promise;
    },
    getTextContent: function() {
      var promise = new PDFJS.Promise();
      var textContent = 'page text'; // not implemented
      promise.resolve(textContent);
      return promise;
    },
    getOperationList: function() {
      var promise = new PDFJS.Promise();
      var operationList = { // not implemented
        dependencyFontsID: null,
        operatorList: null
      };
      promise.resolve(operationList);
      return promise;
    }
  };

  function PdfDocumentWrapper(pdf) {
    this.pdf = pdf;
  }
  PdfDocumentWrapper.prototype = {
    get numPages() {
      return this.pdf.numPages;
    },
    get fingerprint() {
      return this.pdf.fingerprint;
    },
    getPage: function(number) {
      var promise = new PDFJS.Promise();
      var page = this.pdf.getPage(number);
      promise.resolve(new PdfPageWrapper(page));
      return promise;
    },
    getDestinations: function() {
      var promise = new PDFJS.Promise();
      var destinations = this.pdf.catalog.destinations;
      promise.resolve(destinations);
      return promise;
    },
    getOutline: function() {
      var promise = new PDFJS.Promise();
      var outline = this.pdf.catalog.documentOutline;
      promise.resolve(outline);
      return promise;
    },
    getMetadata: function() {
      var promise = new PDFJS.Promise();
      var info = this.pdf.info;
      var metadata = this.pdf.catalog.metadata;
      promise.resolve(info, metadata ? new PDFJS.Metadata(metadata) : null);
      return promise;
    }
  };

  PDFJS.getDocument = function getDocument(source) {
    var promise = new PDFJS.Promise();
    if (typeof source === 'string') {
      // fetch url
      PDFJS.getPdf(
        {
          url: source,
          progress: function getPdfProgress(evt) {
            if (evt.lengthComputable)
              promise.progress({
                loaded: evt.loaded,
                total: evt.total
              });
          },
          error: function getPdfError(e) {
            promise.reject('Unexpected server response of ' +
              e.target.status + '.');
          }
        },
        function getPdfLoad(data) {
          var pdf = null;
          try {
            pdf = new PDFJS.PDFDoc(data);
          } catch (e) {
            promise.reject('An error occurred while reading the PDF.', e);
          }
          if (pdf)
            promise.resolve(new PdfDocumentWrapper(pdf));
        });
    } else {
      // assuming the source is array, instantiating directly from it
      var pdf = null;
      try {
        pdf = new PDFJS.PDFDoc(source);
      } catch (e) {
        promise.reject('An error occurred while reading the PDF.', e);
      }
      if (pdf)
        promise.resolve(new PdfDocumentWrapper(pdf));
    }
    return promise;
  };
})();
