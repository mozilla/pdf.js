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

'use strict';

var DEFAULT_PREFERENCES;

(function defaultPreferencesLoaderWrapper() {
  function loaded() {
    try {
      DEFAULT_PREFERENCES = JSON.parse(xhr.responseText);
    } catch (e) {
      console.error('Unable to load DEFAULT_PREFERENCES: ' + e);
      DEFAULT_PREFERENCES = {};
    }
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('defaultpreferencesloaded', true, true, null);
    document.dispatchEvent(event);
  }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'default_preferences.json');
  xhr.onload = xhr.onerror = loaded;
  xhr.send();
})();
