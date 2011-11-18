/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var PDFJS = {};

(function pdfjsWrapper() {
  // Use strict in our context only - users might not want it
  'use strict';

  PDFJS.build = 'PDFJSSCRIPT_BUNDLE_VER';

  // Files are inserted below - see Makefile
  /* PDFJSSCRIPT_INCLUDE_ALL */

}).call((typeof window === 'undefined') ? this : window);
