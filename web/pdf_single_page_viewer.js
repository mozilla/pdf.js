/* Copyright 2017 Mozilla Foundation
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

import { BaseViewer } from './base_viewer';
import { scrollIntoView } from './ui_utils';
import { shadow } from 'pdfjs-lib';

class PDFSinglePageViewer extends BaseViewer {
  constructor(options) {
    super(options);

    this.eventBus.on('pagesinit', (evt) => {
      // Since the pages are placed in a `DocumentFragment`, make sure that
      // the current page becomes visible upon loading of the document.
      this._ensurePageViewVisible();
    });
  }

  get _setDocumentViewerElement() {
    // Since we only want to display *one* page at a time when using the
    // `PDFSinglePageViewer`, we cannot append them to the `viewer` DOM element.
    // Instead, they are placed in a `DocumentFragment`, and only the current
    // page is displayed in the viewer (refer to `this._ensurePageViewVisible`).
    return shadow(this, '_setDocumentViewerElement', this._shadowViewer);
  }

  _resetView() {
    super._resetView();
    this._previousPageNumber = 1;
    this._shadowViewer = document.createDocumentFragment();
  }

  _ensurePageViewVisible() {
    let pageView = this._pages[this._currentPageNumber - 1];
    let previousPageView = this._pages[this._previousPageNumber - 1];

    let viewerNodes = this.viewer.childNodes;
    switch (viewerNodes.length) {
      case 0: // Should *only* occur on initial loading.
        this.viewer.appendChild(pageView.div);
        break;
      case 1: // The normal page-switching case.
        if (viewerNodes[0] !== previousPageView.div) {
          throw new Error(
            '_ensurePageViewVisible: Unexpected previously visible page.');
        }
        if (pageView === previousPageView) {
          break; // The correct page is already visible.
        }
        // Switch visible pages, and reset the viewerContainer scroll position.
        this._shadowViewer.appendChild(previousPageView.div);
        this.viewer.appendChild(pageView.div);

        this.container.scrollTop = 0;
        break;
      default:
        throw new Error(
          '_ensurePageViewVisible: Only one page should be visible at a time.');
    }
    this._previousPageNumber = this._currentPageNumber;
  }

  _scrollUpdate() {
    if (this._updateScrollDown) {
      this._updateScrollDown();
    }
    super._scrollUpdate();
  }

  _scrollIntoView({ pageDiv, pageSpot = null, pageNumber = null, }) {
    if (pageNumber) { // Ensure that `this._currentPageNumber` is correct.
      this._setCurrentPageNumber(pageNumber);
    }
    let scrolledDown = this._currentPageNumber >= this._previousPageNumber;
    let previousLocation = this._location;
    this._ensurePageViewVisible();

    scrollIntoView(pageDiv, pageSpot);

    // Since scrolling is tracked using `requestAnimationFrame`, update the
    // scroll direction during the next `this._scrollUpdate` invocation.
    this._updateScrollDown = () => {
      this.scroll.down = scrolledDown;
      delete this._updateScrollDown;
    };
    // If the scroll position doesn't change as a result of the `scrollIntoView`
    // call, ensure that rendering always occurs to avoid showing a blank page.
    setTimeout(() => {
      if (this._location === previousLocation) {
        if (this._updateScrollDown) {
          this._updateScrollDown();
        }
        this.update();
      }
    }, 0);
  }

  _getVisiblePages() {
    if (!this.pagesCount) {
      return { views: [], };
    }
    let pageView = this._pages[this._currentPageNumber - 1];
    // NOTE: Compute the `x` and `y` properties of the current view,
    // since `this._updateLocation` depends of them being available.
    let element = pageView.div;

    let view = {
      id: pageView.id,
      x: element.offsetLeft + element.clientLeft,
      y: element.offsetTop + element.clientTop,
      view: pageView,
    };
    return { first: view, last: view, views: [view], };
  }

  update() {
    let visible = this._getVisiblePages();
    let visiblePages = visible.views, numVisiblePages = visiblePages.length;

    if (numVisiblePages === 0) {
      return;
    }
    this._resizeBuffer(numVisiblePages);

    this.renderingQueue.renderHighestPriority(visible);

    this._updateLocation(visible.first);
    this.eventBus.dispatch('updateviewarea', {
      source: this,
      location: this._location,
    });
  }
}

export {
  PDFSinglePageViewer,
};
