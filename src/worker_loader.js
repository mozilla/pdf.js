/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

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
  '../external/jpgjs/jpg.js',
  'jpx.js'
];

// Load all the files.
for (var i = 0; i < files.length; i++) {
  importScripts(files[i]);
}
