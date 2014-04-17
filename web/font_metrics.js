/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/* Copyright 2014 Opera Software ASA
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

'use strict';

var FontMetrics = (function FontMetricsClosure () {

  function FontMetrics () {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 100;
    this.canvas.height = 100;
    this.cache = Object.create(null);
  }

  FontMetrics.prototype = {
    getFirstNoneWhitePixelTop: function FontMetricsGetFirstNoneWhitePixelTop() {
      var x = 0;
      var y = 0;
      var width = this.canvas.width;
      var height = this.canvas.height;
      var pixels = null;
      while (y < height) {
        pixels = this.ctx.getImageData(0, y, width, 1).data;
        for (x = 0; x < width * 4; x += 4) {
          if (pixels[x] === 0) {
            break;
          }
        }

        if (x < width) {
          break;
        }
        y++;
      }
      return y;
    },

    getFontAscent: function FontMetricsDetFontAscent(font, str) {
      if (this.cache[font]) {
        return this.cache[font];
      }

      if (!str) {
        str = 'The quick brown fox jumps over the lazy dog';
      }
      var height = parseFloat(font);
      var textBaselines = ['alphabetic', 'top'];
      var results = [];
      for (var i = 0; i < 2; i++) {
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textBaseline = textBaselines[i];
        this.ctx.fillStyle = '#000';
        this.ctx.font = font;
        this.ctx.fillText(str, 0, height);
        results[i] = this.getFirstNoneWhitePixelTop();
      }
      var ascent = results[1] - results[0];
      this.cache[font] = ascent;
      return ascent;
    }
  };

  return FontMetrics;

})();
