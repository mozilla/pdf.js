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

import { DefaultExternalServices, PDFViewerApplication } from './app';
import { DownloadManager } from './download_manager';

if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('GENERIC')) {
  throw new Error('Module "pdfjs-web/genericcom" shall not be used outside ' +
                  'GENERIC build.');
}

var GenericCom = {};

var GenericExternalServices = Object.create(DefaultExternalServices);
GenericExternalServices.createDownloadManager = function () {
  return new DownloadManager();
};
PDFViewerApplication.externalServices = GenericExternalServices;

export {
  GenericCom,
};
