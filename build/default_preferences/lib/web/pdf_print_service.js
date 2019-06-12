"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPrintService = PDFPrintService;

var _ui_utils = require("./ui_utils");

var _app = require("./app");

var _app_options = require("./app_options");

var _pdf = require("../pdf");

let activeService = null;
let overlayManager = null;

function renderPage(activeServiceOnEntry, pdfDocument, pageNumber, size) {
  let scratchCanvas = activeService.scratchCanvas;
  const PRINT_RESOLUTION = _app_options.AppOptions.get('printResolution') || 150;
  const PRINT_UNITS = PRINT_RESOLUTION / 72.0;
  scratchCanvas.width = Math.floor(size.width * PRINT_UNITS);
  scratchCanvas.height = Math.floor(size.height * PRINT_UNITS);
  let width = Math.floor(size.width * _ui_utils.CSS_UNITS) + 'px';
  let height = Math.floor(size.height * _ui_utils.CSS_UNITS) + 'px';
  let ctx = scratchCanvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  ctx.restore();
  return pdfDocument.getPage(pageNumber).then(function (pdfPage) {
    let renderContext = {
      canvasContext: ctx,
      transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
      viewport: pdfPage.getViewport({
        scale: 1,
        rotation: size.rotation
      }),
      intent: 'print'
    };
    return pdfPage.render(renderContext).promise;
  }).then(function () {
    return {
      width,
      height
    };
  });
}

function PDFPrintService(pdfDocument, pagesOverview, printContainer, l10n) {
  this.pdfDocument = pdfDocument;
  this.pagesOverview = pagesOverview;
  this.printContainer = printContainer;
  this.l10n = l10n || _ui_utils.NullL10n;
  this.disableCreateObjectURL = pdfDocument.loadingParams['disableCreateObjectURL'];
  this.currentPage = -1;
  this.scratchCanvas = document.createElement('canvas');
}

PDFPrintService.prototype = {
  layout() {
    this.throwIfInactive();
    let body = document.querySelector('body');
    body.setAttribute('data-pdfjsprinting', true);
    let hasEqualPageSizes = this.pagesOverview.every(function (size) {
      return size.width === this.pagesOverview[0].width && size.height === this.pagesOverview[0].height;
    }, this);

    if (!hasEqualPageSizes) {
      console.warn('Not all pages have the same size. The printed ' + 'result may be incorrect!');
    }

    this.pageStyleSheet = document.createElement('style');
    let pageSize = this.pagesOverview[0];
    this.pageStyleSheet.textContent = '@supports ((size:A4) and (size:1pt 1pt)) {' + '@page { size: ' + pageSize.width + 'pt ' + pageSize.height + 'pt;}' + '}';
    body.appendChild(this.pageStyleSheet);
  },

  destroy() {
    if (activeService !== this) {
      return;
    }

    this.printContainer.textContent = '';

    if (this.pageStyleSheet) {
      this.pageStyleSheet.remove();
      this.pageStyleSheet = null;
    }

    this.scratchCanvas.width = this.scratchCanvas.height = 0;
    this.scratchCanvas = null;
    activeService = null;
    ensureOverlay().then(function () {
      if (overlayManager.active !== 'printServiceOverlay') {
        return;
      }

      overlayManager.close('printServiceOverlay');
    });
  },

  renderPages() {
    let pageCount = this.pagesOverview.length;

    let renderNextPage = (resolve, reject) => {
      this.throwIfInactive();

      if (++this.currentPage >= pageCount) {
        renderProgress(pageCount, pageCount, this.l10n);
        resolve();
        return;
      }

      let index = this.currentPage;
      renderProgress(index, pageCount, this.l10n);
      renderPage(this, this.pdfDocument, index + 1, this.pagesOverview[index]).then(this.useRenderedPage.bind(this)).then(function () {
        renderNextPage(resolve, reject);
      }, reject);
    };

    return new Promise(renderNextPage);
  },

  useRenderedPage(printItem) {
    this.throwIfInactive();
    let img = document.createElement('img');
    img.style.width = printItem.width;
    img.style.height = printItem.height;
    let scratchCanvas = this.scratchCanvas;

    if ('toBlob' in scratchCanvas && !this.disableCreateObjectURL) {
      scratchCanvas.toBlob(function (blob) {
        img.src = _pdf.URL.createObjectURL(blob);
      });
    } else {
      img.src = scratchCanvas.toDataURL();
    }

    let wrapper = document.createElement('div');
    wrapper.appendChild(img);
    this.printContainer.appendChild(wrapper);
    return new Promise(function (resolve, reject) {
      img.onload = resolve;
      img.onerror = reject;
    });
  },

  performPrint() {
    this.throwIfInactive();
    return new Promise(resolve => {
      setTimeout(() => {
        if (!this.active) {
          resolve();
          return;
        }

        print.call(window);
        setTimeout(resolve, 20);
      }, 0);
    });
  },

  get active() {
    return this === activeService;
  },

  throwIfInactive() {
    if (!this.active) {
      throw new Error('This print request was cancelled or completed.');
    }
  }

};
let print = window.print;

window.print = function print() {
  if (activeService) {
    console.warn('Ignored window.print() because of a pending print job.');
    return;
  }

  ensureOverlay().then(function () {
    if (activeService) {
      overlayManager.open('printServiceOverlay');
    }
  });

  try {
    dispatchEvent('beforeprint');
  } finally {
    if (!activeService) {
      console.error('Expected print service to be initialized.');
      ensureOverlay().then(function () {
        if (overlayManager.active === 'printServiceOverlay') {
          overlayManager.close('printServiceOverlay');
        }
      });
      return;
    }

    let activeServiceOnEntry = activeService;
    activeService.renderPages().then(function () {
      return activeServiceOnEntry.performPrint();
    }).catch(function () {}).then(function () {
      if (activeServiceOnEntry.active) {
        abort();
      }
    });
  }
};

function dispatchEvent(eventType) {
  let event = document.createEvent('CustomEvent');
  event.initCustomEvent(eventType, false, false, 'custom');
  window.dispatchEvent(event);
}

function abort() {
  if (activeService) {
    activeService.destroy();
    dispatchEvent('afterprint');
  }
}

function renderProgress(index, total, l10n) {
  let progressContainer = document.getElementById('printServiceOverlay');
  let progress = Math.round(100 * index / total);
  let progressBar = progressContainer.querySelector('progress');
  let progressPerc = progressContainer.querySelector('.relative-progress');
  progressBar.value = progress;
  l10n.get('print_progress_percent', {
    progress
  }, progress + '%').then(msg => {
    progressPerc.textContent = msg;
  });
}

let hasAttachEvent = !!document.attachEvent;
window.addEventListener('keydown', function (event) {
  if (event.keyCode === 80 && (event.ctrlKey || event.metaKey) && !event.altKey && (!event.shiftKey || window.chrome || window.opera)) {
    window.print();

    if (hasAttachEvent) {
      return;
    }

    event.preventDefault();

    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    } else {
      event.stopPropagation();
    }

    return;
  }
}, true);

if (hasAttachEvent) {
  document.attachEvent('onkeydown', function (event) {
    event = event || window.event;

    if (event.keyCode === 80 && event.ctrlKey) {
      event.keyCode = 0;
      return false;
    }
  });
}

if ('onbeforeprint' in window) {
  let stopPropagationIfNeeded = function (event) {
    if (event.detail !== 'custom' && event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }
  };

  window.addEventListener('beforeprint', stopPropagationIfNeeded);
  window.addEventListener('afterprint', stopPropagationIfNeeded);
}

let overlayPromise;

function ensureOverlay() {
  if (!overlayPromise) {
    overlayManager = _app.PDFViewerApplication.overlayManager;

    if (!overlayManager) {
      throw new Error('The overlay manager has not yet been initialized.');
    }

    overlayPromise = overlayManager.register('printServiceOverlay', document.getElementById('printServiceOverlay'), abort, true);
    document.getElementById('printCancel').onclick = abort;
  }

  return overlayPromise;
}

_app.PDFPrintServiceFactory.instance = {
  supportsPrinting: true,

  createPrintService(pdfDocument, pagesOverview, printContainer, l10n) {
    if (activeService) {
      throw new Error('The print service is created and active.');
    }

    activeService = new PDFPrintService(pdfDocument, pagesOverview, printContainer, l10n);
    return activeService;
  }

};