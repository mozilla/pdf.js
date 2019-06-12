"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SimpleLinkService = exports.PDFLinkService = void 0;

var _ui_utils = require("./ui_utils");

class PDFLinkService {
  constructor({
    eventBus,
    externalLinkTarget = null,
    externalLinkRel = null
  } = {}) {
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.externalLinkTarget = externalLinkTarget;
    this.externalLinkRel = externalLinkRel;
    this.baseUrl = null;
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.pdfHistory = null;
    this._pagesRefCache = null;
  }

  setDocument(pdfDocument, baseUrl = null) {
    this.baseUrl = baseUrl;
    this.pdfDocument = pdfDocument;
    this._pagesRefCache = Object.create(null);
  }

  setViewer(pdfViewer) {
    this.pdfViewer = pdfViewer;
  }

  setHistory(pdfHistory) {
    this.pdfHistory = pdfHistory;
  }

  get pagesCount() {
    return this.pdfDocument ? this.pdfDocument.numPages : 0;
  }

  get page() {
    return this.pdfViewer.currentPageNumber;
  }

  set page(value) {
    this.pdfViewer.currentPageNumber = value;
  }

  get rotation() {
    return this.pdfViewer.pagesRotation;
  }

  set rotation(value) {
    this.pdfViewer.pagesRotation = value;
  }

  navigateTo(dest) {
    let goToDestination = ({
      namedDest,
      explicitDest
    }) => {
      let destRef = explicitDest[0],
          pageNumber;

      if (destRef instanceof Object) {
        pageNumber = this._cachedPageNumber(destRef);

        if (pageNumber === null) {
          this.pdfDocument.getPageIndex(destRef).then(pageIndex => {
            this.cachePageRef(pageIndex + 1, destRef);
            goToDestination({
              namedDest,
              explicitDest
            });
          }).catch(() => {
            console.error(`PDFLinkService.navigateTo: "${destRef}" is not ` + `a valid page reference, for dest="${dest}".`);
          });
          return;
        }
      } else if (Number.isInteger(destRef)) {
        pageNumber = destRef + 1;
      } else {
        console.error(`PDFLinkService.navigateTo: "${destRef}" is not ` + `a valid destination reference, for dest="${dest}".`);
        return;
      }

      if (!pageNumber || pageNumber < 1 || pageNumber > this.pagesCount) {
        console.error(`PDFLinkService.navigateTo: "${pageNumber}" is not ` + `a valid page number, for dest="${dest}".`);
        return;
      }

      if (this.pdfHistory) {
        this.pdfHistory.pushCurrentPosition();
        this.pdfHistory.push({
          namedDest,
          explicitDest,
          pageNumber
        });
      }

      this.pdfViewer.scrollPageIntoView({
        pageNumber,
        destArray: explicitDest
      });
    };

    new Promise((resolve, reject) => {
      if (typeof dest === 'string') {
        this.pdfDocument.getDestination(dest).then(destArray => {
          resolve({
            namedDest: dest,
            explicitDest: destArray
          });
        });
        return;
      }

      resolve({
        namedDest: '',
        explicitDest: dest
      });
    }).then(data => {
      if (!Array.isArray(data.explicitDest)) {
        console.error(`PDFLinkService.navigateTo: "${data.explicitDest}" is` + ` not a valid destination array, for dest="${dest}".`);
        return;
      }

      goToDestination(data);
    });
  }

  getDestinationHash(dest) {
    if (typeof dest === 'string') {
      return this.getAnchorUrl('#' + escape(dest));
    }

    if (Array.isArray(dest)) {
      let str = JSON.stringify(dest);
      return this.getAnchorUrl('#' + escape(str));
    }

    return this.getAnchorUrl('');
  }

  getAnchorUrl(anchor) {
    return (this.baseUrl || '') + anchor;
  }

  setHash(hash) {
    let pageNumber, dest;

    if (hash.includes('=')) {
      let params = (0, _ui_utils.parseQueryString)(hash);

      if ('search' in params) {
        this.eventBus.dispatch('findfromurlhash', {
          source: this,
          query: params['search'].replace(/"/g, ''),
          phraseSearch: params['phrase'] === 'true'
        });
      }

      if ('nameddest' in params) {
        this.navigateTo(params.nameddest);
        return;
      }

      if ('page' in params) {
        pageNumber = params.page | 0 || 1;
      }

      if ('zoom' in params) {
        let zoomArgs = params.zoom.split(',');
        let zoomArg = zoomArgs[0];
        let zoomArgNumber = parseFloat(zoomArg);

        if (!zoomArg.includes('Fit')) {
          dest = [null, {
            name: 'XYZ'
          }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null, zoomArgs.length > 2 ? zoomArgs[2] | 0 : null, zoomArgNumber ? zoomArgNumber / 100 : zoomArg];
        } else {
          if (zoomArg === 'Fit' || zoomArg === 'FitB') {
            dest = [null, {
              name: zoomArg
            }];
          } else if (zoomArg === 'FitH' || zoomArg === 'FitBH' || zoomArg === 'FitV' || zoomArg === 'FitBV') {
            dest = [null, {
              name: zoomArg
            }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null];
          } else if (zoomArg === 'FitR') {
            if (zoomArgs.length !== 5) {
              console.error('PDFLinkService.setHash: Not enough parameters for "FitR".');
            } else {
              dest = [null, {
                name: zoomArg
              }, zoomArgs[1] | 0, zoomArgs[2] | 0, zoomArgs[3] | 0, zoomArgs[4] | 0];
            }
          } else {
            console.error(`PDFLinkService.setHash: "${zoomArg}" is not ` + 'a valid zoom value.');
          }
        }
      }

      if (dest) {
        this.pdfViewer.scrollPageIntoView({
          pageNumber: pageNumber || this.page,
          destArray: dest,
          allowNegativeOffset: true
        });
      } else if (pageNumber) {
        this.page = pageNumber;
      }

      if ('pagemode' in params) {
        this.eventBus.dispatch('pagemode', {
          source: this,
          mode: params.pagemode
        });
      }
    } else {
      dest = unescape(hash);

      try {
        dest = JSON.parse(dest);

        if (!Array.isArray(dest)) {
          dest = dest.toString();
        }
      } catch (ex) {}

      if (typeof dest === 'string' || isValidExplicitDestination(dest)) {
        this.navigateTo(dest);
        return;
      }

      console.error(`PDFLinkService.setHash: "${unescape(hash)}" is not ` + 'a valid destination.');
    }
  }

  executeNamedAction(action) {
    switch (action) {
      case 'GoBack':
        if (this.pdfHistory) {
          this.pdfHistory.back();
        }

        break;

      case 'GoForward':
        if (this.pdfHistory) {
          this.pdfHistory.forward();
        }

        break;

      case 'NextPage':
        if (this.page < this.pagesCount) {
          this.page++;
        }

        break;

      case 'PrevPage':
        if (this.page > 1) {
          this.page--;
        }

        break;

      case 'LastPage':
        this.page = this.pagesCount;
        break;

      case 'FirstPage':
        this.page = 1;
        break;

      default:
        break;
    }

    this.eventBus.dispatch('namedaction', {
      source: this,
      action
    });
  }

  cachePageRef(pageNum, pageRef) {
    if (!pageRef) {
      return;
    }

    let refStr = pageRef.num + ' ' + pageRef.gen + ' R';
    this._pagesRefCache[refStr] = pageNum;
  }

  _cachedPageNumber(pageRef) {
    let refStr = pageRef.num + ' ' + pageRef.gen + ' R';
    return this._pagesRefCache && this._pagesRefCache[refStr] || null;
  }

  isPageVisible(pageNumber) {
    return this.pdfViewer.isPageVisible(pageNumber);
  }

}

exports.PDFLinkService = PDFLinkService;

function isValidExplicitDestination(dest) {
  if (!Array.isArray(dest)) {
    return false;
  }

  let destLength = dest.length,
      allowNull = true;

  if (destLength < 2) {
    return false;
  }

  let page = dest[0];

  if (!(typeof page === 'object' && Number.isInteger(page.num) && Number.isInteger(page.gen)) && !(Number.isInteger(page) && page >= 0)) {
    return false;
  }

  let zoom = dest[1];

  if (!(typeof zoom === 'object' && typeof zoom.name === 'string')) {
    return false;
  }

  switch (zoom.name) {
    case 'XYZ':
      if (destLength !== 5) {
        return false;
      }

      break;

    case 'Fit':
    case 'FitB':
      return destLength === 2;

    case 'FitH':
    case 'FitBH':
    case 'FitV':
    case 'FitBV':
      if (destLength !== 3) {
        return false;
      }

      break;

    case 'FitR':
      if (destLength !== 6) {
        return false;
      }

      allowNull = false;
      break;

    default:
      return false;
  }

  for (let i = 2; i < destLength; i++) {
    let param = dest[i];

    if (!(typeof param === 'number' || allowNull && param === null)) {
      return false;
    }
  }

  return true;
}

class SimpleLinkService {
  constructor() {
    this.externalLinkTarget = null;
    this.externalLinkRel = null;
  }

  get pagesCount() {
    return 0;
  }

  get page() {
    return 0;
  }

  set page(value) {}

  get rotation() {
    return 0;
  }

  set rotation(value) {}

  navigateTo(dest) {}

  getDestinationHash(dest) {
    return '#';
  }

  getAnchorUrl(hash) {
    return '#';
  }

  setHash(hash) {}

  executeNamedAction(action) {}

  cachePageRef(pageNum, pageRef) {}

  isPageVisible(pageNumber) {
    return true;
  }

}

exports.SimpleLinkService = SimpleLinkService;