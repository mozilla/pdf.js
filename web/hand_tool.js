/* Copyright 2013 Mozilla Foundation
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

import { GrabToPan } from './grab_to_pan';
import { localized } from './ui_utils';

/**
 * @typedef {Object} HandToolOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {BasePreferences} preferences - Object for reading/writing
 *                                           persistent settings.
 */

class HandTool {
  /**
   * @param {HandToolOptions} options
   */
  constructor({ container, eventBus, preferences, }) {
    this.container = container;
    this.eventBus = eventBus;

    this.wasActive = false;

    this.handTool = new GrabToPan({
      element: this.container,
      onActiveChanged: (isActive) => {
        this.eventBus.dispatch('handtoolchanged', { isActive, });
      },
    });

    this.eventBus.on('togglehandtool', this.toggle.bind(this));

    let enableOnLoad = preferences.get('enableHandToolOnLoad');
    Promise.all([localized, enableOnLoad]).then((values) => {
      if (values[1] === true) {
        this.handTool.activate();
      }
    }).catch(function(reason) {});

    this.eventBus.on('presentationmodechanged', (evt) => {
      if (evt.switchInProgress) {
        return;
      }
      if (evt.active) {
        this.enterPresentationMode();
      } else {
        this.exitPresentationMode();
      }
    });
  }

  /**
   * @return {boolean}
   */
  get isActive() {
    return !!this.handTool.active;
  }

  toggle() {
    this.handTool.toggle();
  }

  enterPresentationMode() {
    if (this.isActive) {
      this.wasActive = true;
      this.handTool.deactivate();
    }
  }

  exitPresentationMode() {
    if (this.wasActive) {
      this.wasActive = false;
      this.handTool.activate();
    }
  }
}

export {
  HandTool,
};
