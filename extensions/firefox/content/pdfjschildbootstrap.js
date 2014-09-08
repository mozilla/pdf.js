/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* jshint esnext:true */
/* globals Components, PdfjsContentUtils, PdfJs */

'use strict';

/*
 * pdfjschildbootstrap.js loads into the content process to take care of
 * initializing our built-in version of pdfjs when running remote.
 */

Components.utils.import('resource://pdf.js/PdfJs.jsm');
Components.utils.import('resource://pdf.js/PdfjsContentUtils.jsm');

// init content utils shim pdfjs will use to access privileged apis.
PdfjsContentUtils.init();

// register various pdfjs factories that hook us into content loading.
PdfJs.updateRegistration();
