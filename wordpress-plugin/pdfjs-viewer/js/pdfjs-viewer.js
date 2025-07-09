(function(){
  function initViewer(element) {
    const url = element.dataset.url;
    const options = JSON.parse(element.dataset.options || '{}');
    const container = document.createElement('div');
    container.className = 'pdfjs-container';
    element.appendChild(container);

    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise.then(function(pdf) {
      pdf.getPage(1).then(function(page) {
        const viewport = page.getViewport({scale: 1.5});
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        container.appendChild(canvas);
        page.render({canvasContext: context, viewport: viewport});
      });
    });

    // Placeholder features
    if (options.annotation) {
      // TODO implement annotation logic
    }
    if (options.highlight) {
      // TODO implement highlighting logic
    }
    if (options.translate) {
      // TODO implement translation logic using options.translateKey
    }
    if (options.tts) {
      // TODO implement text-to-speech logic using options.ttsKey
    }
  }

  window.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.pdfjs-viewer').forEach(function(el){
      initViewer(el);
    });
  });
})();
