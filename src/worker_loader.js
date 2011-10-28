/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

this.onmessage = function(evt) {
  // Reset the `onmessage` function as it was only set to call
  // this function the first time a message is passed to the worker
  // but shouldn't get called anytime afterwards.
  delete this.onmessage;

  // Directory the include files are contained is send as the
  // first message to the worker.
  var dir = evt.data;

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
    'worker.js'
  ];

  // Load all the files.
  for (var i = 0; i < files.length; i++) {
    importScripts(dir + files[i]);
  }
}.bind(this);
