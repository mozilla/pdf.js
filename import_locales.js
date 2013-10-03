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
/* jshint node:true */

'use strict';

require('./external/shelljs/make');

// Defines all languages that have a translation at mozilla-aurora.
// This is used in make.js for the importl10n command.
function getlangcodes() {
  return [
           'ach', 'af', 'ak', 'an', 'ar', 'as', 'ast', 'az', 'be', 'bg',
           'bn-BD', 'bn-IN', 'br', 'bs', 'ca', 'cs', 'csb', 'cy', 'da',
           'de', 'el', 'en-GB', 'en-ZA', 'eo', 'es-AR', 'es-CL', 'es-ES',
           'es-MX', 'et', 'eu', 'fa', 'ff', 'fi', 'fr', 'fy-NL', 'ga-IE',
           'gd', 'gl', 'gu-IN', 'he', 'hi-IN', 'hr', 'hu', 'hy-AM', 'id',
           'is', 'it', 'ja', 'ja-JP-mac', 'ka', 'kk', 'km', 'kn', 'ko',
           'lg', 'lij', 'lt', 'lv', 'mai', 'mk', 'ml', 'mn', 'mr', 'ms',
           'my', 'nb-NO', 'nl', 'nn-NO', 'nso', 'oc', 'or', 'pa-IN', 'pl',
           'pt-BR', 'pt-PT', 'rm', 'ro', 'ru', 'rw', 'sah', 'si', 'sk',
           'sl', 'son', 'sq', 'sr', 'sv-SE', 'sw', 'ta', 'ta-LK', 'te',
           'th', 'tn', 'tr', 'uk', 'ur', 'vi', 'wo', 'xh', 'zh-CN',
           'zh-TW', 'zu'
         ];
}
exports.getlangcodes = getlangcodes;
