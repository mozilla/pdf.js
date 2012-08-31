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

'use strict';

// List of files to include;
var files = [
  'core.js',
  'util.js',
  'canvas.js',
  'obj.js',
  'function.js',
  'charsets.js',
  'cidmaps.js',
  'colorspace.js',
  'crypto.js',
  'evaluator.js',
  'fonts.js',
  'glyphlist.js',
  'image.js',
  'metrics.js',
  'parser.js',
  'pattern.js',
  'stream.js',
  'worker.js',
  'jpx.js',
  'jbig2.js',
  'bidi.js',
  '../external/jpgjs/jpg.js'
];

// Load all the files.
for (var i = 0; i < files.length; i++) {
  importScripts(files[i]);
}
