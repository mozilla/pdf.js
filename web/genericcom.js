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
import { PDFJS } from 'pdfjs-lib';

if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('GENERIC')) {
  throw new Error('Module "pdfjs-web/genericcom" shall not be used outside ' +
                  'GENERIC build.');
}

var GenericCom = {};

class GenericPreferences extends BasePreferences {
  _writeToStorage(prefObj) {
    return new Promise(function(resolve) {
      localStorage.setItem('pdfjs.preferences', JSON.stringify(prefObj));
      resolve();
    });
  }

  _readFromStorage(prefObj) {
    return new Promise(function(resolve) {
      var readPrefs = JSON.parse(localStorage.getItem('pdfjs.preferences'));
      resolve(readPrefs);
    });
  }
}

var GenericExternalServices = Object.create(DefaultExternalServices);
GenericExternalServices.createDownloadManager = function() {
  return new DownloadManager();
};
GenericExternalServices.createPreferences = function() {
  return new GenericPreferences();
};
GenericExternalServices.createL10n = function () {
  return new GenericL10n(PDFJS.locale);
};
PDFViewerApplication.externalServices = GenericExternalServices;

export {
  GenericCom,
};
