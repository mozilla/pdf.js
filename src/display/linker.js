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
/* globals document */

'use strict';


var Linker = {
  link: function(text, textDiv) {
    var regexp = Linker.regexp();

    if (!regexp.test(text)) {
      textDiv.textContent = text;
      return;
    }

    var finalElements = [[]];
    var finalElementsPointer = 0;
    var textFragments = text.split(/\s/);
    for(var i = 0; i < textFragments.length; i++) {
      var fragment = textFragments[i];
      if (regexp.test(fragment)) {
        var a = document.createElement('a');
        a.textContent = fragment;
        if (!(/^[^:]+(?=:\/\/)/.test(fragment))) {
          fragment = "http://" + fragment;
        }
        a.setAttribute('href', fragment);
        // needed to have spaces before links
        if (textFragments[i-1] !== undefined) {
          finalElements[finalElementsPointer].push('');
        }
        finalElementsPointer++;
        finalElements[finalElementsPointer] = a;
        finalElementsPointer++;
        finalElements[finalElementsPointer] = [];
        // needed to have spaces after links
        if (textFragments[i+1] !== undefined) {
          finalElements[finalElementsPointer].push('');
        }
      } else {
        finalElements[finalElementsPointer].push(fragment);
      }
    }

    for(var j = 0; j < finalElements.length; j++) {
      var finalElement = finalElements[j];
      if (Array.isArray(finalElement)) {
        if (finalElement.length < 1) {
          continue;
        }
        var s = document.createElement('span');
        s.textContent = finalElement.join(' ');
        textDiv.appendChild(s);
      } else {
        textDiv.appendChild(finalElement);
      }
    }
  },
  regexp: function() {
    // this regular expression is provided by @gruber
    // http://daringfireball.net/2010/07/improved_regex_for_matching_urls
    return /\b((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
  }
};
