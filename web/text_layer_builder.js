/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
/* globals CustomStyle, PDFFindController, scrollIntoView, PDFJS */

'use strict';

var FIND_SCROLL_OFFSET_TOP = -50;
var FIND_SCROLL_OFFSET_LEFT = -400;
var MAX_TEXT_DIVS_TO_RENDER = 100000;
var RENDER_DELAY = 200; // ms

/**
 * TextLayerBuilder provides text-selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF text. These divs
 * contain text that matches the PDF text they are overlaying. This object
 * also provides a way to highlight text that is being searched for.
 */
var TextLayerBuilder = (function TextLayerBuilderClosure() {
  function TextLayerBuilder(options) {
    this.textLayerDiv = options.textLayerDiv;
    this.layoutDone = false;
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.matches = [];
    this.lastScrollSource = options.lastScrollSource || null;
    this.viewport = options.viewport;
    this.isViewerInPresentationMode = options.isViewerInPresentationMode;
    this.textDivs = [];
    this.findController = window.PDFFindController || null;
  }

  TextLayerBuilder.prototype = {
    renderLayer: function TextLayerBuilder_renderLayer() {
      var textLayerFrag = document.createDocumentFragment();
      var textDivs = this.textDivs;
      var textDivsLength = textDivs.length;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // No point in rendering many divs as it would make the browser
      // unusable even after the divs are rendered.
      if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
        return;
      }

      for (var i = 0; i < textDivsLength; i++) {
        var textDiv = textDivs[i];
        if (textDiv.dataset.isWhitespace !== undefined) {
          continue;
        }

        ctx.font = textDiv.style.fontSize + ' ' + textDiv.style.fontFamily;
        var width = ctx.measureText(textDiv.textContent).width;
        if (width > 0) {
          textLayerFrag.appendChild(textDiv);
          var textScale = textDiv.dataset.canvasWidth / width;
          var rotation = textDiv.dataset.angle;
          var transform = 'scale(' + textScale + ', 1)';
          transform = 'rotate(' + rotation + 'deg) ' + transform;
          CustomStyle.setProp('transform' , textDiv, transform);
          CustomStyle.setProp('transformOrigin' , textDiv, '0% 0%');
        }
      }

      this.textLayerDiv.appendChild(textLayerFrag);
      this.renderingDone = true;
      this.updateMatches();
    },

    setupRenderLayoutTimer:
        function TextLayerBuilder_setupRenderLayoutTimer() {
      // Schedule renderLayout() if the user has been scrolling,
      // otherwise run it right away.
      var self = this;
      var lastScroll = (this.lastScrollSource === null ?
                        0 : this.lastScrollSource.lastScroll);

      if (Date.now() - lastScroll > RENDER_DELAY) { // Render right away
        this.renderLayer();
      } else { // Schedule
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
        }
        this.renderTimer = setTimeout(function() {
          self.setupRenderLayoutTimer();
        }, RENDER_DELAY);
      }
    },

    appendText: function TextLayerBuilder_appendText(geom, styles) {
      var style = styles[geom.fontName];
      var textDiv = document.createElement('div');
      this.textDivs.push(textDiv);
      if (!/\S/.test(geom.str)) {
        textDiv.dataset.isWhitespace = true;
        return;
      }
      var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
      var angle = Math.atan2(tx[1], tx[0]);
      if (style.vertical) {
        angle += Math.PI / 2;
      }
      var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
      var fontAscent = (style.ascent ? style.ascent * fontHeight :
        (style.descent ? (1 + style.descent) * fontHeight : fontHeight));

      textDiv.style.position = 'absolute';
      textDiv.style.left = (tx[4] + (fontAscent * Math.sin(angle))) + 'px';
      textDiv.style.top = (tx[5] - (fontAscent * Math.cos(angle))) + 'px';
      textDiv.style.fontSize = fontHeight + 'px';
      textDiv.style.fontFamily = style.fontFamily;

      textDiv.textContent = geom.str;
      textDiv.dataset.fontName = geom.fontName;
      textDiv.dataset.angle = angle * (180 / Math.PI);
      if (style.vertical) {
        textDiv.dataset.canvasWidth = geom.height * this.viewport.scale;
      } else {
        textDiv.dataset.canvasWidth = geom.width * this.viewport.scale;
      }
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      this.textContent = textContent;

      var textItems = textContent.items;
      for (var i = 0, len = textItems.length; i < len; i++) {
        this.appendText(textItems[i], textContent.styles);
      }
      this.divContentDone = true;
      this.setupRenderLayoutTimer();
    },

    convertMatches: function TextLayerBuilder_convertMatches(matches) {
      var i = 0;
      var iIndex = 0;
      var bidiTexts = this.textContent.items;
      var end = bidiTexts.length - 1;
      var queryLen = (this.findController === null ?
                      0 : this.findController.state.query.length);
      var ret = [];

      for (var m = 0, len = matches.length; m < len; m++) {
        // Calculate the start position.
        var matchIdx = matches[m];

        // Loop over the divIdxs.
        while (i !== end && matchIdx >= (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        if (i === bidiTexts.length) {
          console.error('Could not find a matching mapping');
        }

        var match = {
          begin: {
            divIdx: i,
            offset: matchIdx - iIndex
          }
        };

        // Calculate the end position.
        matchIdx += queryLen;

        // Somewhat the same array as above, but use > instead of >= to get
        // the end position right.
        while (i !== end && matchIdx > (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        match.end = {
          divIdx: i,
          offset: matchIdx - iIndex
        };
        ret.push(match);
      }

      return ret;
    },

    renderMatches: function TextLayerBuilder_renderMatches(matches) {
      // Early exit if there is nothing to render.
      if (matches.length === 0) {
        return;
      }

      var bidiTexts = this.textContent.items;
      var textDivs = this.textDivs;
      var prevEnd = null;
      var isSelectedPage = (this.findController === null ?
        false : (this.pageIdx === this.findController.selected.pageIdx));
      var selectedMatchIdx = (this.findController === null ?
                              -1 : this.findController.selected.matchIdx);
      var highlightAll = (this.findController === null ?
                          false : this.findController.state.highlightAll);
      var infinity = {
        divIdx: -1,
        offset: undefined
      };

      function beginText(begin, className) {
        var divIdx = begin.divIdx;
        textDivs[divIdx].textContent = '';
        appendTextToDiv(divIdx, 0, begin.offset, className);
      }

      function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
        var div = textDivs[divIdx];
        var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);
        var node = document.createTextNode(content);
        if (className) {
          var span = document.createElement('span');
          span.className = className;
          span.appendChild(node);
          div.appendChild(span);
          return;
        }
        div.appendChild(node);
      }

      var i0 = selectedMatchIdx, i1 = i0 + 1;
      if (highlightAll) {
        i0 = 0;
        i1 = matches.length;
      } else if (!isSelectedPage) {
        // Not highlighting all and this isn't the selected page, so do nothing.
        return;
      }

      for (var i = i0; i < i1; i++) {
        var match = matches[i];
        var begin = match.begin;
        var end = match.end;
        var isSelected = (isSelectedPage && i === selectedMatchIdx);
        var highlightSuffix = (isSelected ? ' selected' : '');
         
        if (isSelected && !this.isViewerInPresentationMode) {
          scrollIntoView(textDivs[begin.divIdx],
                         { top: FIND_SCROLL_OFFSET_TOP,
                           left: FIND_SCROLL_OFFSET_LEFT });
        }

        // Match inside new div.
        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
          // If there was a previous div, then add the text at the end.
          if (prevEnd !== null) {
            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
          }
          // Clear the divs and set the content until the starting point.
          beginText(begin);
        } else {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
        }

        if (begin.divIdx === end.divIdx) {
          appendTextToDiv(begin.divIdx, begin.offset, end.offset,
                          'highlight' + highlightSuffix);
        } else {
          appendTextToDiv(begin.divIdx, begin.offset, infinity.offset,
                          'highlight begin' + highlightSuffix);
          for (var n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
            textDivs[n0].className = 'highlight middle' + highlightSuffix;
          }
          beginText(end, 'highlight end' + highlightSuffix);
        }
        prevEnd = end;
      }

      if (prevEnd) {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
      }
    },

    updateMatches: function TextLayerBuilder_updateMatches() {
      // Only show matches when all rendering is done.
      if (!this.renderingDone) {
        return;
      }

      // Clear all matches.
      var matches = this.matches;
      var textDivs = this.textDivs;
      var bidiTexts = this.textContent.items;
      var clearedUntilDivIdx = -1;

      // Clear all current matches.
      for (var i = 0, len = matches.length; i < len; i++) {
        var match = matches[i];
        var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
        for (var n = begin, end = match.end.divIdx; n <= end; n++) {
          var div = textDivs[n];
          div.textContent = bidiTexts[n].str;
          div.className = '';
        }
        clearedUntilDivIdx = match.end.divIdx + 1;
      }

      if (this.findController === null || !this.findController.active) {
        return;
      }

      // Convert the matches on the page controller into the match format
      // used for the textLayer.
      this.matches = this.convertMatches(this.findController === null ?
        [] : (this.findController.pageMatches[this.pageIdx] || []));
      this.renderMatches(this.matches);
    }
  };
  return TextLayerBuilder;
})();

