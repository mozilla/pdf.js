/* Copyright 2015 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getGlobalEventBus } from './dom_events';
import { parseQueryString } from './ui_utils';

var PageNumberRegExp = /^\d+$/;
function isPageNumber(str) {
  return PageNumberRegExp.test(str);
}

/**
 * @typedef {Object} PDFLinkServiceOptions
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * Performs navigation functions inside PDF, such as opening specified page,
 * or destination.
 * @class
 * @implements {IPDFLinkService}
 */
var PDFLinkService = (function PDFLinkServiceClosure() {
  /**
   * @constructs PDFLinkService
   * @param {PDFLinkServiceOptions} options
   */
  function PDFLinkService(options) {
    options = options || {};
    this.eventBus = options.eventBus || getGlobalEventBus();
    this.baseUrl = null;
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.pdfHistory = null;

    this._pagesRefCache = null;
  }

  PDFLinkService.prototype = {
    setDocument: function PDFLinkService_setDocument(pdfDocument, baseUrl) {
      this.baseUrl = baseUrl;
      this.pdfDocument = pdfDocument;
      this._pagesRefCache = Object.create(null);
    },

    setViewer: function PDFLinkService_setViewer(pdfViewer) {
      this.pdfViewer = pdfViewer;
    },

    setHistory: function PDFLinkService_setHistory(pdfHistory) {
      this.pdfHistory = pdfHistory;
    },

    /**
     * @returns {number}
     */
    get pagesCount() {
      return this.pdfDocument ? this.pdfDocument.numPages : 0;
    },

    /**
     * @returns {number}
     */
    get page() {
      return this.pdfViewer.currentPageNumber;
    },

    /**
     * @param {number} value
     */
    set page(value) {
      this.pdfViewer.currentPageNumber = value;
    },

    /**
     * @param dest - The PDF destination object.
     */
    navigateTo: function PDFLinkService_navigateTo(dest) {
      var destString = '';
      var self = this;

      var goToDestination = function(destRef) {
        // dest array looks like that: <page-ref> </XYZ|/FitXXX> <args..>
        var pageNumber;
        if (destRef instanceof Object) {
          pageNumber = self._cachedPageNumber(destRef);
        } else if ((destRef | 0) === destRef) { // Integer
          pageNumber = destRef + 1;
        } else {
          console.error('PDFLinkService_navigateTo: "' + destRef +
                        '" is not a valid destination reference.');
          return;
        }

        if (pageNumber) {
          if (pageNumber < 1 || pageNumber > self.pagesCount) {
            console.error('PDFLinkService_navigateTo: "' + pageNumber +
                          '" is a non-existent page number.');
            return;
          }
          self.pdfViewer.scrollPageIntoView({
            pageNumber: pageNumber,
            destArray: dest,
          });

          if (self.pdfHistory) {
            // Update the browsing history.
            self.pdfHistory.push({
              dest: dest,
              hash: destString,
              page: pageNumber
            });
          }
        } else {
          self.pdfDocument.getPageIndex(destRef).then(function (pageIndex) {
            self.cachePageRef(pageIndex + 1, destRef);
            goToDestination(destRef);
          }).catch(function () {
            console.error('PDFLinkService_navigateTo: "' + destRef +
                          '" is not a valid page reference.');
            return;
          });
        }
      };

      var destinationPromise;
      if (typeof dest === 'string') {
        destString = dest;
        destinationPromise = this.pdfDocument.getDestination(dest);
      } else {
        destinationPromise = Promise.resolve(dest);
      }
      destinationPromise.then(function(destination) {
        dest = destination;
        if (!(destination instanceof Array)) {
          console.error('PDFLinkService_navigateTo: "' + destination +
                        '" is not a valid destination array.');
          return;
        }
        goToDestination(destination[0]);
      });
    },

    /**
     * @param dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash: function PDFLinkService_getDestinationHash(dest) {
      if (typeof dest === 'string') {
        // In practice, a named destination may contain only a number.
        // If that happens, use the '#nameddest=' form to avoid the link
        // redirecting to a page, instead of the correct destination.
        return this.getAnchorUrl(
          '#' + (isPageNumber(dest) ? 'nameddest=' : '') + escape(dest));
      }
      if (dest instanceof Array) {
        var str = JSON.stringify(dest);
        return this.getAnchorUrl('#' + escape(str));
      }
      return this.getAnchorUrl('');
    },

    /**
     * Prefix the full url on anchor links to make sure that links are resolved
     * relative to the current URL instead of the one defined in <base href>.
     * @param {String} anchor The anchor hash, including the #.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl: function PDFLinkService_getAnchorUrl(anchor) {
      return (this.baseUrl || '') + anchor;
    },

    /**
     * @param {string} hash
     */
    setHash: function PDFLinkService_setHash(hash) {
      var pageNumber, dest;
      if (hash.indexOf('=') >= 0) {
        var params = parseQueryString(hash);
        if ('search' in params) {
          this.eventBus.dispatch('findfromurlhash', {
            source: this,
            query: params['search'].replace(/"/g, ''),
            phraseSearch: (params['phrase'] === 'true')
          });
        }
        // borrowing syntax from "Parameters for Opening PDF Files"
        if ('nameddest' in params) {
          if (this.pdfHistory) {
            this.pdfHistory.updateNextHashParam(params.nameddest);
          }
          this.navigateTo(params.nameddest);
          return;
        }
        if ('page' in params) {
          pageNumber = (params.page | 0) || 1;
        }
        if ('zoom' in params) {
          // Build the destination array.
          var zoomArgs = params.zoom.split(','); // scale,left,top
          var zoomArg = zoomArgs[0];
          var zoomArgNumber = parseFloat(zoomArg);

          if (zoomArg.indexOf('Fit') === -1) {
            // If the zoomArg is a number, it has to get divided by 100. If it's
            // a string, it should stay as it is.
            dest = [null, { name: 'XYZ' },
                    zoomArgs.length > 1 ? (zoomArgs[1] | 0) : null,
                    zoomArgs.length > 2 ? (zoomArgs[2] | 0) : null,
                    (zoomArgNumber ? zoomArgNumber / 100 : zoomArg)];
          } else {
            if (zoomArg === 'Fit' || zoomArg === 'FitB') {
              dest = [null, { name: zoomArg }];
            } else if ((zoomArg === 'FitH' || zoomArg === 'FitBH') ||
                       (zoomArg === 'FitV' || zoomArg === 'FitBV')) {
              dest = [null, { name: zoomArg },
                      zoomArgs.length > 1 ? (zoomArgs[1] | 0) : null];
            } else if (zoomArg === 'FitR') {
              if (zoomArgs.length !== 5) {
                console.error('PDFLinkService_setHash: ' +
                              'Not enough parameters for \'FitR\'.');
              } else {
                dest = [null, { name: zoomArg },
                        (zoomArgs[1] | 0), (zoomArgs[2] | 0),
                        (zoomArgs[3] | 0), (zoomArgs[4] | 0)];
              }
            } else {
              console.error('PDFLinkService_setHash: \'' + zoomArg +
                            '\' is not a valid zoom value.');
            }
          }
        }
        if (dest) {
          this.pdfViewer.scrollPageIntoView({
            pageNumber: pageNumber || this.page,
            destArray: dest,
            allowNegativeOffset: true,
          });
        } else if (pageNumber) {
          this.page = pageNumber; // simple page
        }
        if ('pagemode' in params) {
          this.eventBus.dispatch('pagemode', {
            source: this,
            mode: params.pagemode
          });
        }
      } else { // Named (or explicit) destination.
        if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) &&
            isPageNumber(hash) && hash <= this.pagesCount) {
          console.warn('PDFLinkService_setHash: specifying a page number ' +
                       'directly after the hash symbol (#) is deprecated, ' +
                       'please use the "#page=' + hash + '" form instead.');
          this.page = hash | 0;
        }

        dest = unescape(hash);
        try {
          dest = JSON.parse(dest);

          if (!(dest instanceof Array)) {
            // Avoid incorrectly rejecting a valid named destination, such as
            // e.g. "4.3" or "true", because `JSON.parse` converted its type.
            dest = dest.toString();
          }
        } catch (ex) {}

        if (typeof dest === 'string' || isValidExplicitDestination(dest)) {
          if (this.pdfHistory) {
            this.pdfHistory.updateNextHashParam(dest);
          }
          this.navigateTo(dest);
          return;
        }
        console.error('PDFLinkService_setHash: \'' + unescape(hash) +
                      '\' is not a valid destination.');
      }
    },

    /**
     * @param {string} action
     */
    executeNamedAction: function PDFLinkService_executeNamedAction(action) {
      // See PDF reference, table 8.45 - Named action
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
          break; // No action according to spec
      }

      this.eventBus.dispatch('namedaction', {
        source: this,
        action: action
      });
    },

    /**
     * @param {Object} params
     */
    onFileAttachmentAnnotation: function (params) {
      this.eventBus.dispatch('fileattachmentannotation', {
        source: this,
        id: params.id,
        filename: params.filename,
        content: params.content,
      });
    },

    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef: function PDFLinkService_cachePageRef(pageNum, pageRef) {
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      this._pagesRefCache[refStr] = pageNum;
    },

    _cachedPageNumber: function PDFLinkService_cachedPageNumber(pageRef) {
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      return (this._pagesRefCache && this._pagesRefCache[refStr]) || null;
    },
  };

  function isValidExplicitDestination(dest) {
    if (!(dest instanceof Array)) {
      return false;
    }
    var destLength = dest.length, allowNull = true;
    if (destLength < 2) {
      return false;
    }
    var page = dest[0];
    if (!(typeof page === 'object' &&
          typeof page.num === 'number' && (page.num | 0) === page.num &&
          typeof page.gen === 'number' && (page.gen | 0) === page.gen) &&
        !(typeof page === 'number' && (page | 0) === page && page >= 0)) {
      return false;
    }
    var zoom = dest[1];
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
    for (var i = 2; i < destLength; i++) {
      var param = dest[i];
      if (!(typeof param === 'number' || (allowNull && param === null))) {
        return false;
      }
    }
    return true;
  }

  return PDFLinkService;
})();

var SimpleLinkService = (function SimpleLinkServiceClosure() {
  function SimpleLinkService() {}

  SimpleLinkService.prototype = {
    /**
     * @returns {number}
     */
    get page() {
      return 0;
    },
    /**
     * @param {number} value
     */
    set page(value) {},
    /**
     * @param dest - The PDF destination object.
     */
    navigateTo: function (dest) {},
    /**
     * @param dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash: function (dest) {
      return '#';
    },
    /**
     * @param hash - The PDF parameters/hash.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl: function (hash) {
      return '#';
    },
    /**
     * @param {string} hash
     */
    setHash: function (hash) {},
    /**
     * @param {string} action
     */
    executeNamedAction: function (action) {},
    /**
     * @param {Object} params
     */
    onFileAttachmentAnnotation: function (params) {},
    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef: function (pageNum, pageRef) {}
  };
  return SimpleLinkService;
})();

export {
  PDFLinkService,
  SimpleLinkService,
};
