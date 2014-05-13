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
/* globals PDFView, Promise, mozL10n, getPDFFileNameFromURL, OverlayManager */

'use strict';

var DocumentProperties = {
  overlayName: null,
  fileName: '',
  fileSize: '',

  // Document property fields (in the viewer).
  fileNameField: null,
  fileSizeField: null,
  titleField: null,
  authorField: null,
  subjectField: null,
  keywordsField: null,
  creationDateField: null,
  modificationDateField: null,
  creatorField: null,
  producerField: null,
  versionField: null,
  pageCountField: null,

  initialize: function documentPropertiesInitialize(options) {
    this.overlayName = options.overlayName;

    // Set the document property fields.
    this.fileNameField = options.fileNameField;
    this.fileSizeField = options.fileSizeField;
    this.titleField = options.titleField;
    this.authorField = options.authorField;
    this.subjectField = options.subjectField;
    this.keywordsField = options.keywordsField;
    this.creationDateField = options.creationDateField;
    this.modificationDateField = options.modificationDateField;
    this.creatorField = options.creatorField;
    this.producerField = options.producerField;
    this.versionField = options.versionField;
    this.pageCountField = options.pageCountField;

    // Bind the event listener for the Close button.
    if (options.closeButton) {
      options.closeButton.addEventListener('click', this.close.bind(this));
    }

    this.dataAvailablePromise = new Promise(function (resolve) {
      this.resolveDataAvailable = resolve;
    }.bind(this));

    OverlayManager.register(this.overlayName, this.close.bind(this));
  },

  getProperties: function documentPropertiesGetProperties() {
    if (!OverlayManager.active) {
      // If the dialog was closed before dataAvailablePromise was resolved,
      // don't bother updating the properties.
      return;
    }
    // Get the file name.
    this.fileName = getPDFFileNameFromURL(PDFView.url);

    // Get the file size.
    PDFView.pdfDocument.getDownloadInfo().then(function(data) {
      this.setFileSize(data.length);
      this.updateUI(this.fileSizeField, this.fileSize);
    }.bind(this));

    // Get the other document properties.
    PDFView.pdfDocument.getMetadata().then(function(data) {
      var fields = [
        { field: this.fileNameField, content: this.fileName },
        // The fileSize field is updated once getDownloadInfo is resolved.
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
        { field: this.pageCountField, content: PDFView.pdfDocument.numPages }
      ];

      // Show the properties in the dialog.
      for (var item in fields) {
        var element = fields[item];
        this.updateUI(element.field, element.content);
      }
    }.bind(this));
  },

  updateUI: function documentPropertiesUpdateUI(field, content) {
    if (field && content !== undefined && content !== '') {
      field.textContent = content;
    }
  },

  setFileSize: function documentPropertiesSetFileSize(fileSize) {
    var kb = fileSize / 1024;
    if (kb < 1024) {
      this.fileSize = mozL10n.get('document_properties_kb', {
        size_kb: (+kb.toPrecision(3)).toLocaleString(),
        size_b: fileSize.toLocaleString()
      }, '{{size_kb}} KB ({{size_b}} bytes)');
    } else {
      this.fileSize = mozL10n.get('document_properties_mb', {
        size_mb: (+(kb / 1024).toPrecision(3)).toLocaleString(),
        size_b: fileSize.toLocaleString()
      }, '{{size_mb}} MB ({{size_b}} bytes)');
    }
  },

  open: function documentPropertiesOpen() {
    Promise.all([OverlayManager.open(this.overlayName),
                 this.dataAvailablePromise]).then(function () {
      this.getProperties();
    }.bind(this));
  },

  close: function documentPropertiesClose() {
    OverlayManager.close(this.overlayName);
  },

  parseDate: function documentPropertiesParseDate(inputDate) {
    // This is implemented according to the PDF specification (see
    // http://www.gnupdf.org/Date for an overview), but note that 
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
    if (utRel == '-') {
      hours += offsetHours;
      minutes += offsetMinutes;
    } else if (utRel == '+') {
      hours -= offsetHours;
      minutes += offsetMinutes;
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
