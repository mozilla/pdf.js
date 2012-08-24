/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var PDFJS = {};

(function pdfjsWrapper() {
  // Use strict in our context only - users might not want it
  'use strict';

  PDFJS.build =
//#if !BUNDLE_VERSION
  'PDFJSSCRIPT_BUNDLE_VER';
//#else
//#expand '__BUNDLE_VERSION__';
//#endif

//#expand __BUNDLE__

}).call((typeof window === 'undefined') ? this : window);
