/*
Copyright 2015 Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * This is part of the work-around for crbug.com/511670.
 * - chromecom.js sets the URL and history state upon unload.
 * - extension-router.js retrieves the saved state and opens restoretab.html
 * - restoretab.html (this script) restores the URL and history state.
 */
'use strict';

var url = decodeURIComponent(location.search.slice(1));
var historyState = decodeURIComponent(location.hash.slice(1));

historyState = historyState === 'undefined' ? null : JSON.parse(historyState);

history.replaceState(historyState, null, url);
location.reload();
