/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

function onMessageLoader(evt) {
  // Reset the `onmessage` function as it was only set to call
  // this function the first time a message is passed to the worker
  // but shouldn't get called anytime afterwards.
  this.onmessage = null;

  if (evt.data.action !== 'workerSrc') {
    throw 'Worker expects first message to be `workerSrc`';
  }

  // Content of `PDFJS.workerSrc` as defined on the main thread.
  var workerSrc = evt.data.data;

  // Extract the directory that contains the source files to load.
  // Assuming the source files have the same relative possition as the
  // `workerSrc` file.
  var dir = workerSrc.substring(0, workerSrc.lastIndexOf('/') + 1);

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
    '../external/jpgjs/jpg.js'
  ];

  // Load all the files.
  for (var i = 0; i < files.length; i++) {
    importScripts(dir + files[i]);
  }
}

this.onmessage = onMessageLoader;
