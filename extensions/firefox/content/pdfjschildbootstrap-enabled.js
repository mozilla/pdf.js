/* Copyright 2014 Mozilla Foundation
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

"use strict";

/*
 * pdfjschildbootstrap-enabled.js loads into the content process to
 * take care of initializing our built-in version of pdfjs when
 * running remote. It will only be run when PdfJs.enable is true.
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://pdf.js/PdfJs.jsm");

if (Services.appinfo.processType === Services.appinfo.PROCESS_TYPE_CONTENT) {
  // register various pdfjs factories that hook us into content loading.
  PdfJs.ensureRegistered();
}
