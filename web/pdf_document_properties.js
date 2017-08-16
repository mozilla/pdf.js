/* Copyright 2012 Mozilla Foundation
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

import { cloneObj, getPDFFileNameFromURL, NullL10n } from './ui_utils';
import { createPromiseCapability } from 'pdfjs-lib';

const DEFAULT_FIELD_CONTENT = '-';

/**
 * @typedef {Object} PDFDocumentPropertiesOptions
 * @property {string} overlayName - Name/identifier for the overlay.
 * @property {Object} fields - Names and elements of the overlay's fields.
 * @property {HTMLDivElement} container - Div container for the overlay.
 * @property {HTMLButtonElement} closeButton - Button for closing the overlay.
 */

class PDFDocumentProperties {
  /**
   * @param {PDFDocumentPropertiesOptions} options
   * @param {OverlayManager} overlayManager - Manager for the viewer overlays.
   * @param {IL10n} l10n - Localization service.
   */
  constructor({ overlayName, fields, container, closeButton, },
              overlayManager, l10n = NullL10n) {
    this.overlayName = overlayName;
    this.fields = fields;
    this.container = container;
    this.overlayManager = overlayManager;
    this.l10n = l10n;

    this._reset();

    if (closeButton) { // Bind the event listener for the Close button.
      closeButton.addEventListener('click', this.close.bind(this));
    }
    this.overlayManager.register(this.overlayName, this.container,
                                 this.close.bind(this));
  }

  /**
   * Open the document properties overlay.
   */
  open() {
    let freezeFieldData = (data) => {
      Object.defineProperty(this, 'fieldData', {
        value: Object.freeze(data),
        writable: false,
        enumerable: true,
        configurable: true,
      });
    };

    Promise.all([this.overlayManager.open(this.overlayName),
                 this._dataAvailableCapability.promise]).then(() => {
      // If the document properties were previously fetched (for this PDF file),
      // just update the dialog immediately to avoid redundant lookups.
      if (this.fieldData) {
        this._updateUI();
        return;
      }
      // Get the document properties.
      this.pdfDocument.getMetadata().then(({ info, metadata, }) => {
        return Promise.all([
          info,
          metadata,
          this._parseFileSize(this.maybeFileSize),
          this._parseDate(info.CreationDate),
          this._parseDate(info.ModDate)
        ]);
      }).then(([info, metadata, fileSize, creationDate, modificationDate]) => {
        freezeFieldData({
          'fileName': getPDFFileNameFromURL(this.url),
          'fileSize': fileSize,
          'title': info.Title,
          'author': info.Author,
          'subject': info.Subject,
          'keywords': info.Keywords,
          'creationDate': creationDate,
          'modificationDate': modificationDate,
          'creator': info.Creator,
          'producer': info.Producer,
          'version': info.PDFFormatVersion,
          'pageCount': this.pdfDocument.numPages,
        });
        this._updateUI();

        // Get the correct fileSize, since it may not have been set (if
        // `this.setFileSize` wasn't called) or may be incorrectly set.
        return this.pdfDocument.getDownloadInfo();
      }).then(({ length, }) => {
        return this._parseFileSize(length);
      }).then((fileSize) => {
        let data = cloneObj(this.fieldData);
        data['fileSize'] = fileSize;

        freezeFieldData(data);
        this._updateUI();
      });
    });
  }

  /**
   * Close the document properties overlay.
   */
  close() {
    this.overlayManager.close(this.overlayName);
  }

  /**
   * Set a reference to the PDF document and the URL in order
   * to populate the overlay fields with the document properties.
   * Note that the overlay will contain no information if this method
   * is not called.
   *
   * @param {Object} pdfDocument - A reference to the PDF document.
   * @param {string} url - The URL of the document.
   */
  setDocument(pdfDocument, url) {
    if (this.pdfDocument) {
      this._reset();
      this._updateUI(true);
    }
    if (!pdfDocument) {
      return;
    }
    this.pdfDocument = pdfDocument;
    this.url = url;

    this._dataAvailableCapability.resolve();
  }

  /**
   * Set the file size of the PDF document. This method is used to
   * update the file size in the document properties overlay once it
   * is known so we do not have to wait until the entire file is loaded.
   *
   * @param {number} fileSize - The file size of the PDF document.
   */
  setFileSize(fileSize) {
    if (typeof fileSize === 'number' && fileSize > 0) {
      this.maybeFileSize = fileSize;
    }
  }

  /**
   * @private
   */
  _reset() {
    this.pdfDocument = null;
    this.url = null;

    this.maybeFileSize = 0;
    delete this.fieldData;
    this._dataAvailableCapability = createPromiseCapability();
  }

  /**
   * Always updates all of the dialog fields, to prevent inconsistent UI state.
   * NOTE: If the contents of a particular field is neither a non-empty string,
   *       nor a number, it will fall back to `DEFAULT_FIELD_CONTENT`.
   * @private
   */
  _updateUI(reset = false) {
    if (reset || !this.fieldData) {
      for (let id in this.fields) {
        this.fields[id].textContent = DEFAULT_FIELD_CONTENT;
      }
      return;
    }
    if (this.overlayManager.active !== this.overlayName) {
      // Don't bother updating the dialog if has already been closed,
      // since it will be updated the next time `this.open` is called.
      return;
    }
    for (let id in this.fields) {
      let content = this.fieldData[id];
      this.fields[id].textContent = (content || content === 0) ?
                                    content : DEFAULT_FIELD_CONTENT;
    }
  }

  /**
   * @private
   */
  _parseFileSize(fileSize = 0) {
    let kb = fileSize / 1024;
    if (!kb) {
      return Promise.resolve(undefined);
    } else if (kb < 1024) {
      return this.l10n.get('document_properties_kb', {
        size_kb: (+kb.toPrecision(3)).toLocaleString(),
        size_b: fileSize.toLocaleString(),
      }, '{{size_kb}} KB ({{size_b}} bytes)');
    }
    return this.l10n.get('document_properties_mb', {
      size_mb: (+(kb / 1024).toPrecision(3)).toLocaleString(),
      size_b: fileSize.toLocaleString(),
    }, '{{size_mb}} MB ({{size_b}} bytes)');
  }

  /**
   * @private
   */
  _parseDate(inputDate) {
    if (!inputDate) {
      return;
    }
    // This is implemented according to the PDF specification, but note that
    // Adobe Reader doesn't handle changing the date to universal time
    // and doesn't use the user's time zone (they're effectively ignoring
    // the HH' and mm' parts of the date string).
    let dateToParse = inputDate;

    // Remove the D: prefix if it is available.
    if (dateToParse.substring(0, 2) === 'D:') {
      dateToParse = dateToParse.substring(2);
    }

    // Get all elements from the PDF date string.
    // JavaScript's `Date` object expects the month to be between
    // 0 and 11 instead of 1 and 12, so we're correcting for this.
    let year = parseInt(dateToParse.substring(0, 4), 10);
    let month = parseInt(dateToParse.substring(4, 6), 10) - 1;
    let day = parseInt(dateToParse.substring(6, 8), 10);
    let hours = parseInt(dateToParse.substring(8, 10), 10);
    let minutes = parseInt(dateToParse.substring(10, 12), 10);
    let seconds = parseInt(dateToParse.substring(12, 14), 10);
    let utRel = dateToParse.substring(14, 15);
    let offsetHours = parseInt(dateToParse.substring(15, 17), 10);
    let offsetMinutes = parseInt(dateToParse.substring(18, 20), 10);

    // As per spec, utRel = 'Z' means equal to universal time.
    // The other cases ('-' and '+') have to be handled here.
    if (utRel === '-') {
      hours += offsetHours;
      minutes += offsetMinutes;
    } else if (utRel === '+') {
      hours -= offsetHours;
      minutes -= offsetMinutes;
    }

    // Return the new date format from the user's locale.
    let date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    let dateString = date.toLocaleDateString();
    let timeString = date.toLocaleTimeString();
    return this.l10n.get('document_properties_date_string',
                         { date: dateString, time: timeString, },
                         '{{date}}, {{time}}');
  }
}

export {
  PDFDocumentProperties,
};
