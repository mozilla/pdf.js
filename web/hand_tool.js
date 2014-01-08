/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals mozL10n, GrabToPan, PDFView */

'use strict';

//#include grab_to_pan.js
var HandTool = {
  initialize: function handToolInitialize(options) {
    var toggleHandTool = options.toggleHandTool;
    this.handTool = new GrabToPan({
      element: options.container,
      onActiveChanged: function(isActive) {
        if (!toggleHandTool) {
          return;
        }
        if (isActive) {
          toggleHandTool.title =
            mozL10n.get('hand_tool_disable.title', null, 'Disable hand tool');
          toggleHandTool.firstElementChild.textContent =
            mozL10n.get('hand_tool_disable_label', null, 'Disable hand tool');
        } else {
          toggleHandTool.title =
            mozL10n.get('hand_tool_enable.title', null, 'Enable hand tool');
          toggleHandTool.firstElementChild.textContent =
            mozL10n.get('hand_tool_enable_label', null, 'Enable hand tool');
        }
      }
    });
    if (toggleHandTool) {
      toggleHandTool.addEventListener('click', this.handTool.toggle, false);
    }
    // TODO: Read global prefs and call this.handTool.activate() if needed.
  },

  toggle: function handToolToggle() {
    this.handTool.toggle();
  },

  enterPresentationMode: function handToolEnterPresentationMode() {
    if (this.handTool.active) {
      this.wasActive = true;
      this.handTool.deactivate();
    }
  },

  exitPresentationMode: function handToolExitPresentationMode() {
    if (this.wasActive) {
      this.wasActive = null;
      this.handTool.activate();
    }
  }
};
