/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var PDF = {};

(function(globalScope){
  // Use strict in our context only - users might not want it
  'use strict';

  // Set this to true if you want to use workers.
  var useWorker = false;
  var console;

  // Files are inserted below - see Makefile  
  /* INSERT_POINT */

  // Worker-specific
  if (typeof window !== 'undefined') {
    console = window.console;
  } else {
    var consoleTimer = {};
    console = workerConsole;
  
    // Listen for messages from the main thread.
    var handler = new MessageHandler('worker_processor', globalScope);
    WorkerProcessorHandler.setup(handler);
  }

  // Expose API in global object
  PDF.PDFDoc = PDFDoc;
  PDF.getPdf = getPdf;
})(this);
