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
 /* globals PDFJS, Util */

'use strict';

// List of files to include;
var files = [
  'shared/util.js',
  'shared/colorspace.js',
  'shared/pattern.js',
  'shared/function.js',
  'shared/annotation.js',
  'core/network.js',
  'core/chunked_stream.js',
  'core/pdf_manager.js',
  'core/core.js',
  'core/obj.js',
  'core/charsets.js',
  'core/cidmaps.js',
  'core/crypto.js',
  'core/evaluator.js',
  'core/fonts.js',
  'core/font_renderer.js',
  'core/glyphlist.js',
  'core/image.js',
  'core/metrics.js',
  'core/parser.js',
  'core/stream.js',
  'core/worker.js',
  'core/jpx.js',
  'core/jbig2.js',
  'core/bidi.js',
  '../external/jpgjs/jpg.js'
];

function loadInOrder(index, path, files) {
  if (index >= files.length) {
    PDFJS.fakeWorkerFilesLoadedPromise.resolve();
    return;
  }
  // Skip shared files since they will already be loaded.
  if (files[index].indexOf('shared/') >= 0) {
    loadInOrder(++index, path, files);
    return;
  }
  Util.loadScript(path + files[index],
                  loadInOrder.bind(null, ++index, path, files));
}

// Load all the files.
if (typeof PDFJS === 'undefined' || !PDFJS.fakeWorkerFilesLoadedPromise) {
  for (var i = 0; i < files.length; i++) {
    importScripts(files[i]);
  }
} else {
  var src = PDFJS.workerSrc;
  loadInOrder(0, src.substr(0, src.indexOf('worker_loader.js')), files);
}
