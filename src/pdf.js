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
