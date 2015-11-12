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
/* jshint esnext:true, maxlen:120 */
/* globals Components, Services */

'use strict';

this.EXPORTED_SYMBOLS = ['PdfJsTelemetry'];

const Cu = Components.utils;
Cu.import('resource://gre/modules/Services.jsm');

const ADDON_ID = 'uriloader@pdf.js';

var Telemetry = Services.telemetry;

var registerAddonHistogram = Telemetry.registerAddonHistogram;
try {
  // Swapping arguments of the registerAddonHistogram for older Firefox versions.
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=1069953.
  var ffVersion = parseInt(Services.appinfo.platformVersion);
  var oldTelemetryAPI = ffVersion < 36;
  if (ffVersion === 36) {
    // Probing FF36 to check if it has new API.
    try {
      Telemetry.registerAddonHistogram(ADDON_ID, 'PDF_36',
        Telemetry.HISTOGRAM_LINEAR, 1, 40, 41);
      var histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_36');
      histogram.add(36);
    } catch (e) {
      oldTelemetryAPI = true;
    }
  }
  if (oldTelemetryAPI) {
    registerAddonHistogram = function (p1, p2, p3, p4, p5, p6) {
      return Telemetry.registerAddonHistogram(p1, p2, p4, p5, p6, p3);
    };
  }
} catch (ex) { }

registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_USED', Telemetry.HISTOGRAM_BOOLEAN, 1, 2, 3);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_FALLBACK_SHOWN', Telemetry.HISTOGRAM_BOOLEAN, 1, 2, 3);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_VERSION', Telemetry.HISTOGRAM_LINEAR, 1, 10, 11);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_GENERATOR', Telemetry.HISTOGRAM_LINEAR, 1, 25, 26);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_SIZE_KB', Telemetry.HISTOGRAM_EXPONENTIAL, 2, 64 * 1024, 20);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_EMBED', Telemetry.HISTOGRAM_BOOLEAN, 1, 2, 3);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_FONT_TYPES', Telemetry.HISTOGRAM_LINEAR, 1, 19, 20);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_FORM', Telemetry.HISTOGRAM_BOOLEAN, 1, 2, 3);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_PRINT', Telemetry.HISTOGRAM_BOOLEAN, 1, 2, 3);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_STREAM_TYPES', Telemetry.HISTOGRAM_LINEAR, 1, 19, 20);
registerAddonHistogram(ADDON_ID, 'PDF_VIEWER_TIME_TO_VIEW_MS', Telemetry.HISTOGRAM_EXPONENTIAL, 1, 10000, 50);


this.PdfJsTelemetry = {
  onViewerIsUsed: function () {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_USED');
    histogram.add(true);
  },
  onFallback: function () {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_FALLBACK_SHOWN');
    histogram.add(true);
  },
  onDocumentSize: function (size) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_SIZE_KB');
    histogram.add(size / 1024);
  },
  onDocumentVersion: function (versionId) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_VERSION');
    histogram.add(versionId);
  },
  onDocumentGenerator: function (generatorId) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_DOCUMENT_GENERATOR');
    histogram.add(generatorId);
  },
  onEmbed: function (isObject) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_EMBED');
    histogram.add(isObject);
  },
  onFontType: function (fontTypeId) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_FONT_TYPES');
    histogram.add(fontTypeId);
  },
  onForm: function (isAcroform) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_FORM');
    histogram.add(isAcroform);
  },
  onPrint: function () {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_PRINT');
    histogram.add(true);
  },
  onStreamType: function (streamTypeId) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_STREAM_TYPES');
    histogram.add(streamTypeId);
  },
  onTimeToView: function (ms) {
    let histogram = Telemetry.getAddonHistogram(ADDON_ID, 'PDF_VIEWER_TIME_TO_VIEW_MS');
    histogram.add(ms);
  }
};
