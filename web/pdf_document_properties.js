/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals Promise, mozL10n, getPDFFileNameFromURL, OverlayManager */

'use strict';

/**
 * @class
 */
var PDFDocumentProperties = (function PDFDocumentPropertiesClosure() {
  /**
   * @constructs PDFDocumentProperties
   * @param {PDFDocumentPropertiesOptions} options
   */
  function PDFDocumentProperties(options) {
    this.rawFileSize = 0;
    this.url = null;
    this.pdfDocument = null;
    this.overlayName = options.overlayName;

    // Set the document property fields.
    this.fileNameField = options.fileNameField || null;
    this.fileSizeField = options.fileSizeField || null;
    this.titleField = options.titleField || null;
    this.authorField = options.authorField || null;
    this.subjectField = options.subjectField || null;
    this.keywordsField = options.keywordsField || null;
    this.creationDateField = options.creationDateField || null;
    this.modificationDateField = options.modificationDateField || null;
    this.creatorField = options.creatorField || null;
    this.producerField = options.producerField || null;
    this.versionField = options.versionField || null;
    this.pageCountField = options.pageCountField || null;

    // Bind the event listener for the Close button.
    if (options.closeButton) {
      options.closeButton.addEventListener('click', this.close.bind(this));
    }

    this.dataAvailablePromise = new Promise(function (resolve) {
      this.resolveDataAvailable = resolve;
    }.bind(this));

    OverlayManager.register(this.overlayName, this.close.bind(this));
  }

  PDFDocumentProperties.prototype = {
    getProperties: function PDFDocumentProperties_getProperties() {
      if (!OverlayManager.active) {
        // If the dialog was closed before dataAvailablePromise was resolved,
        // don't bother updating the properties.
        return;
      }
      // Get the file size (if it hasn't already been set).
      this.pdfDocument.getDownloadInfo().then(function(data) {
        if (data.length === this.rawFileSize) {
          return;
        }
        this.setFileSize(data.length);
        this.updateUI(this.fileSizeField, this.parseFileSize());
      }.bind(this));

      // Get the document properties.
      this.pdfDocument.getMetadata().then(function(data) {
        var fields = [
          { field: this.fileNameField,
            content: getPDFFileNameFromURL(this.url) },
          { field: this.fileSizeField, content: this.parseFileSize() },
          { field: this.titleField, content: data.info.Title },
          { field: this.authorField, content: data.info.Author },
          { field: this.subjectField, content: data.info.Subject },
          { field: this.keywordsField, content: data.info.Keywords },
          { field: this.creationDateField,
            content: this.parseDate(data.info.CreationDate) },
          { field: this.modificationDateField,
            content: this.parseDate(data.info.ModDate) },
          { field: this.creatorField, content: data.info.Creator },
          { field: this.producerField, content: data.info.Producer },
          { field: this.versionField, content: data.info.PDFFormatVersion },
          { field: this.pageCountField, content: this.pdfDocument.numPages }
        ];

        // Show the properties in the dialog.
        for (var item in fields) {
          var element = fields[item];
          this.updateUI(element.field, element.content);
        }
      }.bind(this));
    },

    updateUI: function PDFDocumentProperties_updateUI(field, content) {
      if (field && content !== undefined && content !== '') {
        field.textContent = content;
      }
    },

    setFileSize: function PDFDocumentProperties_setFileSize(fileSize) {
      if (fileSize > 0) {
        this.rawFileSize = fileSize;
      }
    },

    parseFileSize: function PDFDocumentProperties_parseFileSize() {
      var fileSize = this.rawFileSize, kb = fileSize / 1024;
      if (!kb) {
        return;
      } else if (kb < 1024) {
        return mozL10n.get('document_properties_kb', {
          size_kb: (+kb.toPrecision(3)).toLocaleString(),
          size_b: fileSize.toLocaleString()
        }, '{{size_kb}} KB ({{size_b}} bytes)');
      } else {
        return mozL10n.get('document_properties_mb', {
          size_mb: (+(kb / 1024).toPrecision(3)).toLocaleString(),
          size_b: fileSize.toLocaleString()
        }, '{{size_mb}} MB ({{size_b}} bytes)');
      }
    },

    open: function PDFDocumentProperties_open() {
      Promise.all([OverlayManager.open(this.overlayName),
                   this.dataAvailablePromise]).then(function () {
        this.getProperties();
      }.bind(this));
    },

    close: function PDFDocumentProperties_close() {
      OverlayManager.close(this.overlayName);
    },

    parseDate: function PDFDocumentProperties_parseDate(inputDate) {
      // This is implemented according to the PDF specification, but note that
      // Adobe Reader doesn't handle changing the date to universal time
      // and doesn't use the user's time zone (they're effectively ignoring
      // the HH' and mm' parts of the date string).
      var dateToParse = inputDate;
      if (dateToParse === undefined) {
        return '';
      }

      // Remove the D: prefix if it is available.
      if (dateToParse.substring(0,2) === 'D:') {
        dateToParse = dateToParse.substring(2);
      }

      // Get all elements from the PDF date string.
      // JavaScript's Date object expects the month to be between
      // 0 and 11 instead of 1 and 12, so we're correcting for this.
      var year = parseInt(dateToParse.substring(0,4), 10);
      var month = parseInt(dateToParse.substring(4,6), 10) - 1;
      var day = parseInt(dateToParse.substring(6,8), 10);
      var hours = parseInt(dateToParse.substring(8,10), 10);
      var minutes = parseInt(dateToParse.substring(10,12), 10);
      var seconds = parseInt(dateToParse.substring(12,14), 10);
      var utRel = dateToParse.substring(14,15);
      var offsetHours = parseInt(dateToParse.substring(15,17), 10);
      var offsetMinutes = parseInt(dateToParse.substring(18,20), 10);

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
      var date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
      var dateString = date.toLocaleDateString();
      var timeString = date.toLocaleTimeString();
      return mozL10n.get('document_properties_date_string',
                         {date: dateString, time: timeString},
                         '{{date}}, {{time}}');
    }
  };

  return PDFDocumentProperties;
})();
