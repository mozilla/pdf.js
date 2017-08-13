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

import { getGlobalEventBus } from './dom_events';

class PDFHistory {
  constructor({ linkService, eventBus, }) {
    this.linkService = linkService;
    this.eventBus = eventBus || getGlobalEventBus();
  }

  initialize(fingerprint, resetHistory = false) {}

  push() {}

  back() {}

  forward() {}
}

function isDestsEqual(firstDest, secondDest) {
  function isEntryEqual(first, second) {
    if (typeof first !== typeof second) {
      return false;
    }
    if (first instanceof Array || second instanceof Array) {
      return false;
    }
    if (first !== null && typeof first === 'object' && second !== null) {
      if (Object.keys(first).length !== Object.keys(second).length) {
        return false;
      }
      for (var key in first) {
        if (!isEntryEqual(first[key], second[key])) {
          return false;
        }
      }
      return true;
    }
    return first === second || (Number.isNaN(first) && Number.isNaN(second));
  }

  if (!(firstDest instanceof Array && secondDest instanceof Array)) {
    return false;
  }
  if (firstDest.length !== secondDest.length) {
    return false;
  }
  for (let i = 0, ii = firstDest.length; i < ii; i++) {
    if (!isEntryEqual(firstDest[i], secondDest[i])) {
      return false;
    }
  }
  return true;
}

export {
  PDFHistory,
  isDestsEqual,
};
