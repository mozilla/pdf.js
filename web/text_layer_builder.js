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

/**
 * TextLayerBuilder provides text-selection
 * functionality for the PDF. It does this
 * by creating overlay divs over the PDF
 * text. This divs contain text that matches
 * the PDF text they are overlaying. This
 * object also provides for a way to highlight
 * text that is being searched for.
 */
var TextLayerBuilder = function textLayerBuilder(options) {
  var textLayerFrag = document.createDocumentFragment();

  this.textLayerDiv = options.textLayerDiv;
  this.layoutDone = false;
  this.divContentDone = false;
  this.pageIdx = options.pageIndex;
  this.matches = [];
  this.lastScrollSource = options.lastScrollSource;
  this.viewport = options.viewport;
  this.isViewerInPresentationMode = options.isViewerInPresentationMode;
  this.textDivs = [];
  this.currentDiv = null;
  this.currentX = 0;
  this.currentXStart = 0;
  this.currentXEnd = 0;
  this.currentY = 0;
  this.currentYStart = 0;
  this.currentFontHeight = 0;
  this.currentFontName = '';
  this.currentFontFamily = '';
  this.currentLineHeight = 0;
  this.currentRowCount = 0;
  this.currentLastElement = null;
  this.isBlockBuilding = false;
  this.fontMetrics = options.fontMetrics;

  if (typeof PDFFindController === 'undefined') {
    window.PDFFindController = null;
  }

  if (typeof this.lastScrollSource === 'undefined') {
    this.lastScrollSource = null;
  }

  this.renderLayer = function textLayerBuilderRenderLayer() {
    this.setVerticalScale();
    var textDivs = this.textDivs;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var textDiv = null;
    var font = '';

    // No point in rendering so many divs as it'd make the browser unusable
    // even after the divs are rendered
    var MAX_TEXT_DIVS_TO_RENDER = 100000;
    if (textDivs.length > MAX_TEXT_DIVS_TO_RENDER) {
      return;
    }

    for (var i = 0, ii = textDivs.length; i < ii; i++) {
      var textEle = textDivs[i];
      var isDiv = /div/i.test(textEle.nodeName);
      var textContent = textEle.textContent;
      var isWhitespace = /^\s*$/.test(textContent);
      if ('isWhitespace' in textEle.dataset || (isDiv && isWhitespace) ||
          (!isDiv && 'isWhitespace' in textEle.parentNode.dataset)) {
        continue;
      }

      if (isDiv) {
        ctx.font = textEle.style.fontSize + ' ' + textEle.style.fontFamily;
      } else {
        if (textDiv !== textEle.parentNode) {
          textDiv = textEle.parentNode;
          font = textDiv.style.fontSize + ' ' + textDiv.style.fontFamily;
          ctx.font = font;
        }

        if (textEle.style.fontSize) {
          ctx.font = textEle.style.fontSize + ' ' + textEle.style.fontFamily;
        }
      }

      var width = ctx.measureText(textContent).width;
      if (!isDiv && textEle.style.fontSize) {
        ctx.font = font;
      }

      if (width > 0) {
        if (isDiv) {
          textLayerFrag.appendChild(textEle);
        } else if (textEle.parentNode.parentNode !== textLayerFrag) {
          isWhitespace = /^\s*$/.test(textEle.parentNode.textContent);
          if (isWhitespace) {
            textEle.parentNode.dataset.isWhitespace = true;
          } else {
            textLayerFrag.appendChild(textEle.parentNode);
          }
        }

        var rotation = textEle.dataset.angle;
        var length = textContent.length;
        if (length === 1) {
          textEle.style.width = textEle.dataset.canvasWidth + 'px';
        } else if (rotation === '0' || !isDiv) {
          var delta = textEle.dataset.canvasWidth - width;
          var letterSpacing = (delta / length).toFixed(3) + 'px';
          textEle.style.letterSpacing = letterSpacing;
        } else {
          var textScale = textEle.dataset.canvasWidth / width;
          var transform = 'rotate(' + rotation + 'deg) ' +
            'scale(' + textScale + ', 1)';
          CustomStyle.setProp('transform' , textEle, transform);
          CustomStyle.setProp('transformOrigin' , textEle, '0% 0%');
        }
      }
    }

    this.textLayerDiv.appendChild(textLayerFrag);
    this.renderingDone = true;
    this.updateMatches();
  };

  this.setupRenderLayoutTimer = function textLayerSetupRenderLayoutTimer() {
    // Schedule renderLayout() if user has been scrolling, otherwise
    // run it right away
    var RENDER_DELAY = 200; // in ms
    var self = this;
    var lastScroll = (this.lastScrollSource === null ?
                      0 : this.lastScrollSource.lastScroll);

    if (Date.now() - lastScroll > RENDER_DELAY) {
      // Render right away
      this.renderLayer();
    } else {
      // Schedule
      if (this.renderTimer) {
        clearTimeout(this.renderTimer);
      }
      this.renderTimer = setTimeout(function() {
        self.setupRenderLayoutTimer();
      }, RENDER_DELAY);
    }
  };

  this.setBlockContainer = function textLayerBuilderSetBlockContainer() {
    var textDiv = this.textDivs.pop();
    var textSpan = document.createElement('span');
    if (textDiv.firstChild) {
      textSpan.appendChild(textDiv.firstChild);
    }
    textSpan.dataset.canvasWidth = textDiv.dataset.canvasWidth;
    textSpan.dataset.fontName = textDiv.dataset.fontName;
    this.currentDiv.appendChild(textSpan);
    this.textDivs.push(textSpan);
    this.currentXStart = this.currentX;
    this.isBlockBuilding = true;
    this.currentLastElement = textSpan;
  };

  this.setVerticalScale = function textLayerBuilderSetVerticalScale() {
    if (this.currentRowCount && this.currentDiv) {
      var deltaY = this.currentY - this.currentYStart;
      var setLineHeight = deltaY / this.currentRowCount | 0;
      this.currentDiv.style.lineHeight = setLineHeight + 'px';
      var vLineScale = deltaY / (this.currentRowCount * setLineHeight);
      var transform = 'scale(1, ' + vLineScale.toFixed(5) + ')';
      CustomStyle.setProp('transform' , this.currentDiv, transform);
      CustomStyle.setProp('transformOrigin' , this.currentDiv, '0% 0%');
      this.currentRowCount = 0;
      var delta = (this.currentFontHeight - setLineHeight) / 2;
      if (delta) {
        this.currentDiv.style.marginTop = delta.toFixed(3) + 'px';
      }
    }
  };

  this.createTextElement =
    function textLayerBuilderCreateTextElement (name, geom, angle, fontHeight,
                                                style, isBlockLevel) {
    var ele = document.createElement(name);
    ele.textContent = geom.str;
    ele.dataset.fontName = geom.fontName;
    if (style.vertical) {
      ele.dataset.canvasWidth = (geom.height * this.viewport.scale).toFixed(3);
    } else {
      ele.dataset.canvasWidth = (geom.width * this.viewport.scale).toFixed(3);
    }

    if (isBlockLevel || name === 'div') {
      ele.dataset.angle = angle * (180 / Math.PI);
      ele.style.fontSize = fontHeight.toFixed(3) + 'px';
      ele.style.fontFamily = style.fontFamily;
    }
    return ele;
  };

  this.appendTextOnSameLine =
    function textLayerBuilderAppendTextOnSameLine(geom, angle, x, y, deltaY,
                                                  style, fontHeight, fontName,
                                                  hasDifferentFont) {
    if (!this.isBlockBuilding) {
      this.setBlockContainer();
      this.currentXEnd = this.currentXStart -
        (-this.currentLastElement.dataset.canvasWidth);
    }
    var isLastEleSpan = /span/i.test(this.currentLastElement.nodeName);
    if (isLastEleSpan) {
      this.currentLastElement.classList.add('inline-block');
    }
    var shiftX = x - this.currentXEnd;
    var pixelWidth = geom.width * this.viewport.scale;
    var width = pixelWidth + shiftX;
    this.currentXEnd = x + pixelWidth;
    if (isLastEleSpan && geom.str.length === 1 &&
        shiftX && shiftX < fontHeight / 7 &&
        fontHeight === this.currentFontHeight &&
        fontName === this.currentLastElement.dataset.fontName) {
          // this could perhaps be done on a deeper level
          this.currentLastElement.textContent += geom.str;
          this.currentLastElement.dataset.canvasWidth -= -width;
          return;
    }
    var textSpan = this.createTextElement('span', geom, angle, fontHeight,
                                          style, hasDifferentFont);
    if (shiftX) {
      if (shiftX > fontHeight / 7) {
        // Add whitespace.
        var span = document.createElement('span');
        span.appendChild(document.createTextNode(' '));
        span.classList.add('inline-block');
        span.style.width = shiftX.toFixed(3) + 'px';
        this.currentDiv.appendChild(span);
      } else if (geom.str.length == 1) {
        textSpan.dataset.canvasWidth = width.toFixed(3);
      } else {
        textSpan.style.marginLeft = shiftX + 'px';
      }
    }
    textSpan.classList.add('inline-block');
    this.currentDiv.appendChild(textSpan);
    this.textDivs.push(textSpan);
    if (fontHeight === this.currentFontHeight) {
      this.currentY = y;
    }
    this.currentLastElement = textSpan;
  };

  this.appendTextOnNewLine =
    function textLayerBuilderAppendTextOnNewLine(geom, angle, x, y, deltaY,
                                                 style, fontHeight, fontName,
                                                 hasDifferentFont) {
    if (!this.isBlockBuilding) {
      this.setBlockContainer();
    }

    if (!this.currentLineHeight) {
      this.currentLineHeight = deltaY;
    }
    this.currentRowCount++;
    this.currentDiv.appendChild(document.createTextNode('\n'));
    var textSpan = this.createTextElement('span', geom, angle, fontHeight,
                                          style, hasDifferentFont);
    var shiftX = x - this.currentX;
    if (shiftX) {
      textSpan.style.marginLeft = shiftX.toFixed(3) + 'px';
    }
    this.currentDiv.appendChild(textSpan);
    this.textDivs.push(textSpan);
    this.currentY = y;
    this.currentXEnd = x + geom.width * this.viewport.scale;
    this.currentLastElement = textSpan;
  };

  this.appendText = function textLayerBuilderAppendText(geom, styles) {
    var style = styles[geom.fontName];
    var textDiv = null;
    if ((PDFJS.disableMultilineTextLayer || !this.isBlockBuilding) &&
        !/\S/.test(geom.str)) {
      if (PDFJS.disableMultilineTextLayer) {
        textDiv = document.createElement('div');
        textDiv.dataset.isWhitespace = true;
        this.textDivs.push(textDiv);
      }
      return;
    }
    var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
    var angle = Math.atan2(tx[1], tx[0]);
    if (style.vertical) {
      angle += Math.PI / 2;
    }
    var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
    var font = fontHeight.toFixed(3) + 'px ' + style.fontFamily;
    var fontAscent = this.fontMetrics.getFontAscent(font);
    var x = tx[4];
    var y = tx[5];
    var width = geom.width * this.viewport.scale;
    var fontName = geom.fontName;
    var abs = Math.abs;
    var deltaX = abs(x - this.currentX);
    var deltaY = y - this.currentY;
    var isSameLine = !PDFJS.disableMultilineTextLayer && angle === 0 &&
      fontHeight <= this.currentFontHeight &&
      abs(x - this.currentXEnd) < this.currentFontHeight * 2 &&
      abs(y - this.currentY) < this.currentFontHeight / 2;

    var isNewLine = !PDFJS.disableMultilineTextLayer && angle === 0 &&
      fontHeight <= this.currentFontHeight &&
      (deltaX < 10 * fontHeight) &&
      ((this.currentLineHeight && (y > this.currentY) &&
        abs(deltaY - this.currentLineHeight) < this.currentLineHeight / 100) ||
       (!this.currentLineHeight && (deltaY > fontHeight / 2) &&
        fontHeight === this.currentFontHeight &&
        (fontName === this.currentFontName ||
         abs(width - (this.currentXEnd - this.currentXStart)) < width / 8) &&
        (abs(deltaY) < 2 * fontHeight))) ;

    var hasDifferentFont = fontHeight !== this.currentFontHeight ||
      style.fontFamily !== this.currentFontFamily;

    if (isSameLine) {
      this.appendTextOnSameLine(geom, angle, x, y, deltaY, style, fontHeight,
                                fontName, hasDifferentFont);
    } else if (isNewLine) {
      this.appendTextOnNewLine(geom, angle, x, y, deltaY, style, fontHeight,
                               fontName, hasDifferentFont);
    } else {
      if (!PDFJS.disableMultilineTextLayer) {
        this.setVerticalScale();
        this.currentX = x;
        this.currentY = y;
        this.currentYStart = y;
        this.currentFontHeight = fontHeight;
        this.currentFontName = fontName;
        this.currentFontFamily = style.fontFamily;
        this.isBlockBuilding = false;
        this.currentXStart = 0;
        this.currentLineHeight = 0;
        this.currentXEnd = x + width;
      }
      textDiv = this.createTextElement('div', geom, angle, fontHeight, style);
      var left = x + (fontAscent * Math.sin(angle));
      textDiv.style.left = left.toFixed(3) + 'px';
      var top = y - (fontAscent * Math.cos(angle));
      textDiv.style.top = top.toFixed(3) + 'px';
      this.textDivs.push(textDiv);
      this.currentDiv = textDiv;
      this.currentLastElement = textDiv;
    }
  };

  this.setTextContent = function textLayerBuilderSetTextContent(textContent) {
    this.textContent = textContent;

    var textItems = textContent.items;
    for (var i = 0; i < textItems.length; i++) {
      this.appendText(textItems[i], textContent.styles);
    }
    this.divContentDone = true;

    this.setupRenderLayoutTimer();
  };

  this.convertMatches = function textLayerBuilderConvertMatches(matches) {
    var i = 0;
    var iIndex = 0;
    var bidiTexts = this.textContent.items;
    var end = bidiTexts.length - 1;
    var queryLen = (PDFFindController === null ?
                    0 : PDFFindController.state.query.length);

    var ret = [];

    // Loop over all the matches.
    for (var m = 0; m < matches.length; m++) {
      var matchIdx = matches[m];
      // # Calculate the begin position.

      // Loop over the divIdxs.
      while (i !== end && matchIdx >= (iIndex + bidiTexts[i].str.length)) {
        iIndex += bidiTexts[i].str.length;
        i++;
      }

      // TODO: Do proper handling here if something goes wrong.
      if (i == bidiTexts.length) {
        console.error('Could not find matching mapping');
      }

      var match = {
        begin: {
          divIdx: i,
          offset: matchIdx - iIndex
        }
      };

      // # Calculate the end position.
      matchIdx += queryLen;

      // Somewhat same array as above, but use a > instead of >= to get the end
      // position right.
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
  };

  this.renderMatches = function textLayerBuilder_renderMatches(matches) {
    // Early exit if there is nothing to render.
    if (matches.length === 0) {
      return;
    }

    var bidiTexts = this.textContent.items;
    var textDivs = this.textDivs;
    var prevEnd = null;
    var isSelectedPage = (PDFFindController === null ?
      false : (this.pageIdx === PDFFindController.selected.pageIdx));

    var selectedMatchIdx = (PDFFindController === null ?
                            -1 : PDFFindController.selected.matchIdx);

    var highlightAll = (PDFFindController === null ?
                        false : PDFFindController.state.highlightAll);

    var infty = {
      divIdx: -1,
      offset: undefined
    };

    function beginText(begin, className) {
      var divIdx = begin.divIdx;
      var div = textDivs[divIdx];
      div.textContent = '';
      appendTextToDiv(divIdx, 0, begin.offset, className);
    }

    function appendText(from, to, className) {
      appendTextToDiv(from.divIdx, from.offset, to.offset, className);
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

    function highlightDiv(divIdx, className) {
      textDivs[divIdx].className = className;
    }

    var i0 = selectedMatchIdx, i1 = i0 + 1, i;

    if (highlightAll) {
      i0 = 0;
      i1 = matches.length;
    } else if (!isSelectedPage) {
      // Not highlighting all and this isn't the selected page, so do nothing.
      return;
    }

    for (i = i0; i < i1; i++) {
      var match = matches[i];
      var begin = match.begin;
      var end = match.end;

      var isSelected = isSelectedPage && i === selectedMatchIdx;
      var highlightSuffix = (isSelected ? ' selected' : '');
      if (isSelected && !this.isViewerInPresentationMode) {
        scrollIntoView(textDivs[begin.divIdx], { top: FIND_SCROLL_OFFSET_TOP,
                                               left: FIND_SCROLL_OFFSET_LEFT });
      }

      // Match inside new div.
      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        // If there was a previous div, then add the text at the end
        if (prevEnd !== null) {
          appendText(prevEnd, infty);
        }
        // clears the divs and set the content until the begin point.
        beginText(begin);
      } else {
        appendText(prevEnd, begin);
      }

      if (begin.divIdx === end.divIdx) {
        appendText(begin, end, 'highlight' + highlightSuffix);
      } else {
        appendText(begin, infty, 'highlight begin' + highlightSuffix);
        for (var n = begin.divIdx + 1; n < end.divIdx; n++) {
          highlightDiv(n, 'highlight middle' + highlightSuffix);
        }
        beginText(end, 'highlight end' + highlightSuffix);
      }
      prevEnd = end;
    }

    if (prevEnd) {
      appendText(prevEnd, infty);
    }
  };

  this.updateMatches = function textLayerUpdateMatches() {
    // Only show matches, once all rendering is done.
    if (!this.renderingDone) {
      return;
    }

    // Clear out all matches.
    var matches = this.matches;
    var textDivs = this.textDivs;
    var bidiTexts = this.textContent.items;
    var clearedUntilDivIdx = -1;

    // Clear out all current matches.
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
      for (var n = begin; n <= match.end.divIdx; n++) {
        var div = textDivs[n];
        div.textContent = bidiTexts[n].str;
        div.className = '';
      }
      clearedUntilDivIdx = match.end.divIdx + 1;
    }

    if (PDFFindController === null || !PDFFindController.active) {
      return;
    }

    // Convert the matches on the page controller into the match format used
    // for the textLayer.
    this.matches = matches = (this.convertMatches(PDFFindController === null ?
      [] : (PDFFindController.pageMatches[this.pageIdx] || [])));

    this.renderMatches(this.matches);
  };
};

