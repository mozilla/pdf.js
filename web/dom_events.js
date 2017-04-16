/* Copyright 2016 Mozilla Foundation
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

import { EventBus } from './ui_utils';

// Attaching to the application event bus to dispatch events to the DOM for
// backwards viewer API compatibility.
function attachDOMEventsToEventBus(eventBus) {
  eventBus.on('documentload', function () {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('documentload', true, true, {});
    window.dispatchEvent(event);
  });
  eventBus.on('pagerendered', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('pagerendered', true, true, {
      pageNumber: e.pageNumber,
      cssTransform: e.cssTransform,
    });
    e.source.div.dispatchEvent(event);
  });
  eventBus.on('textlayerrendered', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('textlayerrendered', true, true, {
      pageNumber: e.pageNumber
    });
    e.source.textLayerDiv.dispatchEvent(event);
  });
  eventBus.on('pagechange', function (e) {
    var event = document.createEvent('UIEvents');
    event.initUIEvent('pagechange', true, true, window, 0);
    event.pageNumber = e.pageNumber;
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('pagesinit', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('pagesinit', true, true, null);
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('pagesloaded', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('pagesloaded', true, true, {
      pagesCount: e.pagesCount
    });
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('scalechange', function (e) {
    var event = document.createEvent('UIEvents');
    event.initUIEvent('scalechange', true, true, window, 0);
    event.scale = e.scale;
    event.presetValue = e.presetValue;
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('updateviewarea', function (e) {
    var event = document.createEvent('UIEvents');
    event.initUIEvent('updateviewarea', true, true, window, 0);
    event.location = e.location;
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('find', function (e) {
    if (e.source === window) {
      return; // event comes from FirefoxCom, no need to replicate
    }
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('find' + e.type, true, true, {
      query: e.query,
      phraseSearch: e.phraseSearch,
      caseSensitive: e.caseSensitive,
      highlightAll: e.highlightAll,
      findPrevious: e.findPrevious
    });
    window.dispatchEvent(event);
  });
  eventBus.on('attachmentsloaded', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('attachmentsloaded', true, true, {
      attachmentsCount: e.attachmentsCount
    });
    e.source.container.dispatchEvent(event);
  });
  eventBus.on('sidebarviewchanged', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('sidebarviewchanged', true, true, {
      view: e.view,
    });
    e.source.outerContainer.dispatchEvent(event);
  });
  eventBus.on('pagemode', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('pagemode', true, true, {
      mode: e.mode,
    });
    e.source.pdfViewer.container.dispatchEvent(event);
  });
  eventBus.on('namedaction', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('namedaction', true, true, {
      action: e.action
    });
    e.source.pdfViewer.container.dispatchEvent(event);
  });
  eventBus.on('presentationmodechanged', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('presentationmodechanged', true, true, {
      active: e.active,
      switchInProgress: e.switchInProgress
    });
    window.dispatchEvent(event);
  });
  eventBus.on('outlineloaded', function (e) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('outlineloaded', true, true, {
      outlineCount: e.outlineCount
    });
    e.source.container.dispatchEvent(event);
  });
}

var globalEventBus = null;
function getGlobalEventBus() {
  if (globalEventBus) {
    return globalEventBus;
  }
  globalEventBus = new EventBus();
  attachDOMEventsToEventBus(globalEventBus);
  return globalEventBus;
}

export {
  attachDOMEventsToEventBus,
  getGlobalEventBus,
};
