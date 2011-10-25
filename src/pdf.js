/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// // TODO: Global namespace
// var PDF = {};

// Stay away from global
(function(){

  'use strict';

  // All files will be inserted below this point
  // INSERT_POINT

  //
  // Expose API in global object
  //
  window.PDFDoc = PDFDoc;
  window.getPdf = getPdf;

})(); // self-executing function
