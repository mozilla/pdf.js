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
/* globals FontFace */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/display/font_loader', ['exports', 'pdfjs/shared/util',
      'pdfjs/shared/global'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'),
      require('../shared/global.js'));
  } else {
    factory((root.pdfjsDisplayFontLoader = {}), root.pdfjsSharedUtil,
      root.pdfjsSharedGlobal);
  }
}(this, function (exports, sharedUtil, sharedGlobal) {

var assert = sharedUtil.assert;
var bytesToString = sharedUtil.bytesToString;
var string32 = sharedUtil.string32;
var shadow = sharedUtil.shadow;
var warn = sharedUtil.warn;

var PDFJS = sharedGlobal.PDFJS;
var globalScope = sharedGlobal.globalScope;
var isWorker = sharedGlobal.isWorker;

function FontLoader(docId) {
  this.docId = docId;
  this.styleElement = null;
//#if !(MOZCENTRAL)
  this.nativeFontFaces = [];
  this.loadTestFontId = 0;
  this.loadingContext = {
    requests: [],
    nextRequestId: 0
  };
//#endif
}
FontLoader.prototype = {
  insertRule: function fontLoaderInsertRule(rule) {
    var styleElement = this.styleElement;
    if (!styleElement) {
      styleElement = this.styleElement = document.createElement('style');
      styleElement.id = 'PDFJS_FONT_STYLE_TAG_' + this.docId;
      document.documentElement.getElementsByTagName('head')[0].appendChild(
        styleElement);
    }

    var styleSheet = styleElement.sheet;
    styleSheet.insertRule(rule, styleSheet.cssRules.length);
  },

  clear: function fontLoaderClear() {
    var styleElement = this.styleElement;
    if (styleElement) {
      styleElement.parentNode.removeChild(styleElement);
      styleElement = this.styleElement = null;
    }
//#if !(MOZCENTRAL)
    this.nativeFontFaces.forEach(function(nativeFontFace) {
      document.fonts.delete(nativeFontFace);
    });
    this.nativeFontFaces.length = 0;
//#endif
  },
//#if !(MOZCENTRAL)
  get loadTestFont() {
    // This is a CFF font with 1 glyph for '.' that fills its entire width and
    // height.
    return shadow(this, 'loadTestFont', atob(
      'T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQAFQ' +
      'AABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAAALwA' +
      'AAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgAAAAGbm' +
      'FtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1AAsD6AAA' +
      'AADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD6AAAAAAD6A' +
      'ABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACMAooCvAAAAeAA' +
      'MQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4DIP84AFoDIQAAAA' +
      'AAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAAAAEAAQAAAAEAAAAA' +
      'AAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUAAQAAAAEAAAAAAAYAAQ' +
      'AAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgABAAMAAQQJAAMAAgABAAMA' +
      'AQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABYAAAAAAAAAwAAAAMAAAAcAA' +
      'EAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAAAC7////TAAEAAAAAAAABBgAA' +
      'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAA' +
      'AAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAAAAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgc' +
      'A/gXBIwMAYuL+nz5tQXkD5j3CBLnEQACAQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWF' +
      'hYWFhYWFhYAAABAQAADwACAQEEE/t3Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQA' +
      'AAAAAAABAAAAAMmJbzEAAAAAzgTjFQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAg' +
      'ABAAAAAAAAAAAD6AAAAAAAAA=='
    ));
  },

  addNativeFontFace: function fontLoader_addNativeFontFace(nativeFontFace) {
    this.nativeFontFaces.push(nativeFontFace);
    document.fonts.add(nativeFontFace);
  },

  bind: function fontLoaderBind(fonts, callback) {
    assert(!isWorker, 'bind() shall be called from main thread');

    var rules = [];
    var fontsToLoad = [];
    var fontLoadPromises = [];
    var getNativeFontPromise = function(nativeFontFace) {
      // Return a promise that is always fulfilled, even when the font fails to
      // load.
      return nativeFontFace.loaded.catch(function(e) {
        warn('Failed to load font "' + nativeFontFace.family + '": ' + e);
      });
    };
    for (var i = 0, ii = fonts.length; i < ii; i++) {
      var font = fonts[i];

      // Add the font to the DOM only once or skip if the font
      // is already loaded.
      if (font.attached || font.loading === false) {
        continue;
      }
      font.attached = true;

      if (FontLoader.isFontLoadingAPISupported) {
        var nativeFontFace = font.createNativeFontFace();
        if (nativeFontFace) {
          this.addNativeFontFace(nativeFontFace);
          fontLoadPromises.push(getNativeFontPromise(nativeFontFace));
        }
      } else {
        var rule = font.createFontFaceRule();
        if (rule) {
          this.insertRule(rule);
          rules.push(rule);
          fontsToLoad.push(font);
        }
      }
    }

    var request = this.queueLoadingCallback(callback);
    if (FontLoader.isFontLoadingAPISupported) {
      Promise.all(fontLoadPromises).then(function() {
        request.complete();
      });
    } else if (rules.length > 0 && !FontLoader.isSyncFontLoadingSupported) {
      this.prepareFontLoadEvent(rules, fontsToLoad, request);
    } else {
      request.complete();
    }
  },

  queueLoadingCallback: function FontLoader_queueLoadingCallback(callback) {
    function LoadLoader_completeRequest() {
      assert(!request.end, 'completeRequest() cannot be called twice');
      request.end = Date.now();

      // sending all completed requests in order how they were queued
      while (context.requests.length > 0 && context.requests[0].end) {
        var otherRequest = context.requests.shift();
        setTimeout(otherRequest.callback, 0);
      }
    }

    var context = this.loadingContext;
    var requestId = 'pdfjs-font-loading-' + (context.nextRequestId++);
    var request = {
      id: requestId,
      complete: LoadLoader_completeRequest,
      callback: callback,
      started: Date.now()
    };
    context.requests.push(request);
    return request;
  },

  prepareFontLoadEvent: function fontLoaderPrepareFontLoadEvent(rules,
                                                                fonts,
                                                                request) {
      /** Hack begin */
      // There's currently no event when a font has finished downloading so the
      // following code is a dirty hack to 'guess' when a font is
      // ready. It's assumed fonts are loaded in order, so add a known test
      // font after the desired fonts and then test for the loading of that
      // test font.

      function int32(data, offset) {
        return (data.charCodeAt(offset) << 24) |
               (data.charCodeAt(offset + 1) << 16) |
               (data.charCodeAt(offset + 2) << 8) |
               (data.charCodeAt(offset + 3) & 0xff);
      }

      function spliceString(s, offset, remove, insert) {
        var chunk1 = s.substr(0, offset);
        var chunk2 = s.substr(offset + remove);
        return chunk1 + insert + chunk2;
      }

      var i, ii;

      var canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      var ctx = canvas.getContext('2d');

      var called = 0;
      function isFontReady(name, callback) {
        called++;
        // With setTimeout clamping this gives the font ~100ms to load.
        if(called > 30) {
          warn('Load test font never loaded.');
          callback();
          return;
        }
        ctx.font = '30px ' + name;
        ctx.fillText('.', 0, 20);
        var imageData = ctx.getImageData(0, 0, 1, 1);
        if (imageData.data[3] > 0) {
          callback();
          return;
        }
        setTimeout(isFontReady.bind(null, name, callback));
      }

      var loadTestFontId = 'lt' + Date.now() + this.loadTestFontId++;
      // Chromium seems to cache fonts based on a hash of the actual font data,
      // so the font must be modified for each load test else it will appear to
      // be loaded already.
      // TODO: This could maybe be made faster by avoiding the btoa of the full
      // font by splitting it in chunks before hand and padding the font id.
      var data = this.loadTestFont;
      var COMMENT_OFFSET = 976; // has to be on 4 byte boundary (for checksum)
      data = spliceString(data, COMMENT_OFFSET, loadTestFontId.length,
                          loadTestFontId);
      // CFF checksum is important for IE, adjusting it
      var CFF_CHECKSUM_OFFSET = 16;
      var XXXX_VALUE = 0x58585858; // the "comment" filled with 'X'
      var checksum = int32(data, CFF_CHECKSUM_OFFSET);
      for (i = 0, ii = loadTestFontId.length - 3; i < ii; i += 4) {
        checksum = (checksum - XXXX_VALUE + int32(loadTestFontId, i)) | 0;
      }
      if (i < loadTestFontId.length) { // align to 4 bytes boundary
        checksum = (checksum - XXXX_VALUE +
                    int32(loadTestFontId + 'XXX', i)) | 0;
      }
      data = spliceString(data, CFF_CHECKSUM_OFFSET, 4, string32(checksum));

      var url = 'url(data:font/opentype;base64,' + btoa(data) + ');';
      var rule = '@font-face { font-family:"' + loadTestFontId + '";src:' +
                 url + '}';
      this.insertRule(rule);

      var names = [];
      for (i = 0, ii = fonts.length; i < ii; i++) {
        names.push(fonts[i].loadedName);
      }
      names.push(loadTestFontId);

      var div = document.createElement('div');
      div.setAttribute('style',
                       'visibility: hidden;' +
                       'width: 10px; height: 10px;' +
                       'position: absolute; top: 0px; left: 0px;');
      for (i = 0, ii = names.length; i < ii; ++i) {
        var span = document.createElement('span');
        span.textContent = 'Hi';
        span.style.fontFamily = names[i];
        div.appendChild(span);
      }
      document.body.appendChild(div);

      isFontReady(loadTestFontId, function() {
        document.body.removeChild(div);
        request.complete();
      });
      /** Hack end */
  }
//#else
//bind: function fontLoaderBind(fonts, callback) {
//  assert(!isWorker, 'bind() shall be called from main thread');
//
//  for (var i = 0, ii = fonts.length; i < ii; i++) {
//    var font = fonts[i];
//    if (font.attached) {
//      continue;
//    }
//
//    font.attached = true;
//    var rule = font.createFontFaceRule();
//    if (rule) {
//      this.insertRule(rule);
//    }
//  }
//
//  setTimeout(callback);
//}
//#endif
};
//#if !(MOZCENTRAL)
FontLoader.isFontLoadingAPISupported = (!isWorker &&
  typeof document !== 'undefined' && !!document.fonts);
//#endif
//#if !(MOZCENTRAL || CHROME)
Object.defineProperty(FontLoader, 'isSyncFontLoadingSupported', {
  get: function () {
    var supported = false;

    // User agent string sniffing is bad, but there is no reliable way to tell
    // if font is fully loaded and ready to be used with canvas.
    var userAgent = window.navigator.userAgent;
    var m = /Mozilla\/5.0.*?rv:(\d+).*? Gecko/.exec(userAgent);
    if (m && m[1] >= 14) {
      supported = true;
    }
    // TODO other browsers
    if (userAgent === 'node') {
      supported = true;
    }
    return shadow(FontLoader, 'isSyncFontLoadingSupported', supported);
  },
  enumerable: true,
  configurable: true
});
//#endif

var FontFaceObject = (function FontFaceObjectClosure() {
  function FontFaceObject(translatedData) {
    this.compiledGlyphs = {};
    // importing translated data
    for (var i in translatedData) {
      this[i] = translatedData[i];
    }
  }
  Object.defineProperty(FontFaceObject, 'isEvalSupported', {
    get: function () {
      var evalSupport = false;
      if (PDFJS.isEvalSupported) {
        try {
          /* jshint evil: true */
          new Function('');
          evalSupport = true;
        } catch (e) {}
      }
      return shadow(this, 'isEvalSupported', evalSupport);
    },
    enumerable: true,
    configurable: true
  });
  FontFaceObject.prototype = {
//#if !(MOZCENTRAL)
    createNativeFontFace: function FontFaceObject_createNativeFontFace() {
      if (!this.data) {
        return null;
      }

      if (PDFJS.disableFontFace) {
        this.disableFontFace = true;
        return null;
      }

      var nativeFontFace = new FontFace(this.loadedName, this.data, {});

      if (PDFJS.pdfBug && 'FontInspector' in globalScope &&
          globalScope['FontInspector'].enabled) {
        globalScope['FontInspector'].fontAdded(this);
      }
      return nativeFontFace;
    },
//#endif

    createFontFaceRule: function FontFaceObject_createFontFaceRule() {
      if (!this.data) {
        return null;
      }

      if (PDFJS.disableFontFace) {
        this.disableFontFace = true;
        return null;
      }

      var data = bytesToString(new Uint8Array(this.data));
      var fontName = this.loadedName;

      // Add the font-face rule to the document
      var url = ('url(data:' + this.mimetype + ';base64,' +
                 window.btoa(data) + ');');
      var rule = '@font-face { font-family:"' + fontName + '";src:' + url + '}';

      if (PDFJS.pdfBug && 'FontInspector' in globalScope &&
          globalScope['FontInspector'].enabled) {
        globalScope['FontInspector'].fontAdded(this, url);
      }

      return rule;
    },

    getPathGenerator:
        function FontFaceObject_getPathGenerator(objs, character) {
      if (!(character in this.compiledGlyphs)) {
        var cmds = objs.get(this.loadedName + '_path_' + character);
        var current, i, len;

        // If we can, compile cmds into JS for MAXIMUM SPEED
        if (FontFaceObject.isEvalSupported) {
          var args, js = '';
          for (i = 0, len = cmds.length; i < len; i++) {
            current = cmds[i];

            if (current.args !== undefined) {
              args = current.args.join(',');
            } else {
              args = '';
            }

            js += 'c.' + current.cmd + '(' + args + ');\n';
          }
          /* jshint -W054 */
          this.compiledGlyphs[character] = new Function('c', 'size', js);
        } else {
          // But fall back on using Function.prototype.apply() if we're
          // blocked from using eval() for whatever reason (like CSP policies)
          this.compiledGlyphs[character] = function(c, size) {
            for (i = 0, len = cmds.length; i < len; i++) {
              current = cmds[i];

              if (current.cmd === 'scale') {
                current.args = [size, -size];
              }

              c[current.cmd].apply(c, current.args);
            }
          };
        }
      }
      return this.compiledGlyphs[character];
    }
  };
  return FontFaceObject;
})();

exports.FontFaceObject = FontFaceObject;
exports.FontLoader = FontLoader;
}));
