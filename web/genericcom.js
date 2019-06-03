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
import { BasePreferences } from './preferences';
import { DownloadManager } from './download_manager';
import { GenericL10n } from './genericl10n';

if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('GENERIC')) {
  throw new Error('Module "pdfjs-web/genericcom" shall not be used outside ' +
                  'GENERIC build.');
}

let GenericCom = {};

class GenericPreferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    localStorage.setItem('pdfjs.preferences', JSON.stringify(prefObj));
  }

  async _readFromStorage(prefObj) {
    return JSON.parse(localStorage.getItem('pdfjs.preferences'));
  }
}

let GenericExternalServices = Object.create(DefaultExternalServices);
GenericExternalServices.createDownloadManager = function(options) {
  return new DownloadManager(options);
};
GenericExternalServices.createPreferences = function() {
  return new GenericPreferences();
};
GenericExternalServices.createL10n = function({ locale = 'en-US', }) {
  return new GenericL10n(locale);
};
PDFViewerApplication.externalServices = GenericExternalServices;

export {
  GenericCom,
};
