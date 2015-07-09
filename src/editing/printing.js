/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2015 Mozilla Foundation
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
/* globals Promise, assert, isRef, Dict, Name, PDFDataWriter */

'use strict';
//#if !CHROME && !GENERIC
//#error This module should not be loaded in non-Chromium browsers
//#endif

function getDataForPrintingImplementation(pdfManager) {
  pdfManager.requestLoadedStream();
  return pdfManager.onParsedDoc().then(function() {
    return pdfManager.onLoadedStream();
  }).then(function(stream) {
    var pdfData = stream.bytes;
    var pdfDocument = pdfManager.pdfDocument;

    var catDict = pdfDocument.catalog.catDict;
    var trailer = pdfDocument.xref.trailer;
    var startXRef = pdfDocument.startXRef;
    var catalogRef = trailer.getRaw('Root');

    var newCatDict = new Dict();
    for (var k in catDict.map) {
      if (k !== 'OpenAction') {
        newCatDict.set(k, catDict.getRaw(k));
      }
    }
    var openActionDict = new Dict();
    openActionDict.set('Type', new Name('Action'));
    openActionDict.set('S', new Name('JavaScript'));
    openActionDict.set('JS', 'this.print();');
    newCatDict.set('OpenAction', openActionDict);

    var extraData = new PDFDataWriter(null, pdfData.byteLength)
      .setTrailer(trailer)
      .setStartXRef(startXRef)
      .startObj(catalogRef)
      .appendDict(newCatDict)
      .endObj()
      .appendTrailer()
      .toUint8Array();
    var blob = new Blob([pdfData, extraData], {
      type: 'application/pdf'
    });
    return {
      pdfBlobUrl: URL.createObjectURL(blob),
    };
  });
}
