/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileSpec = exports.XRef = exports.ObjectLoader = exports.Catalog = void 0;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _util = require("../shared/util");

var _primitives = require("./primitives");

var _parser = require("./parser");

var _core_utils = require("./core_utils");

var _chunked_stream = require("./chunked_stream");

var _crypto = require("./crypto");

var _colorspace = require("./colorspace");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function fetchDestination(dest) {
  return (0, _primitives.isDict)(dest) ? dest.get('D') : dest;
}

var Catalog =
/*#__PURE__*/
function () {
  function Catalog(pdfManager, xref) {
    _classCallCheck(this, Catalog);

    this.pdfManager = pdfManager;
    this.xref = xref;
    this.catDict = xref.getCatalogObj();

    if (!(0, _primitives.isDict)(this.catDict)) {
      throw new _util.FormatError('Catalog object is not a dictionary.');
    }

    this.fontCache = new _primitives.RefSetCache();
    this.builtInCMapCache = new Map();
    this.pageKidsCountCache = new _primitives.RefSetCache();
  }

  _createClass(Catalog, [{
    key: "_readDocumentOutline",
    value: function _readDocumentOutline() {
      var obj = this.catDict.get('Outlines');

      if (!(0, _primitives.isDict)(obj)) {
        return null;
      }

      obj = obj.getRaw('First');

      if (!(0, _primitives.isRef)(obj)) {
        return null;
      }

      var root = {
        items: []
      };
      var queue = [{
        obj: obj,
        parent: root
      }];
      var processed = new _primitives.RefSet();
      processed.put(obj);
      var xref = this.xref,
          blackColor = new Uint8ClampedArray(3);

      while (queue.length > 0) {
        var i = queue.shift();
        var outlineDict = xref.fetchIfRef(i.obj);

        if (outlineDict === null) {
          continue;
        }

        if (!outlineDict.has('Title')) {
          throw new _util.FormatError('Invalid outline item encountered.');
        }

        var data = {
          url: null,
          dest: null
        };
        Catalog.parseDestDictionary({
          destDict: outlineDict,
          resultObj: data,
          docBaseUrl: this.pdfManager.docBaseUrl
        });
        var title = outlineDict.get('Title');
        var flags = outlineDict.get('F') || 0;
        var color = outlineDict.getArray('C');
        var count = outlineDict.get('Count');
        var rgbColor = blackColor;

        if (Array.isArray(color) && color.length === 3 && (color[0] !== 0 || color[1] !== 0 || color[2] !== 0)) {
          rgbColor = _colorspace.ColorSpace.singletons.rgb.getRgb(color, 0);
        }

        var outlineItem = {
          dest: data.dest,
          url: data.url,
          unsafeUrl: data.unsafeUrl,
          newWindow: data.newWindow,
          title: (0, _util.stringToPDFString)(title),
          color: rgbColor,
          count: Number.isInteger(count) ? count : undefined,
          bold: !!(flags & 2),
          italic: !!(flags & 1),
          items: []
        };
        i.parent.items.push(outlineItem);
        obj = outlineDict.getRaw('First');

        if ((0, _primitives.isRef)(obj) && !processed.has(obj)) {
          queue.push({
            obj: obj,
            parent: outlineItem
          });
          processed.put(obj);
        }

        obj = outlineDict.getRaw('Next');

        if ((0, _primitives.isRef)(obj) && !processed.has(obj)) {
          queue.push({
            obj: obj,
            parent: i.parent
          });
          processed.put(obj);
        }
      }

      return root.items.length > 0 ? root.items : null;
    }
  }, {
    key: "_readPermissions",
    value: function _readPermissions() {
      var encrypt = this.xref.trailer.get('Encrypt');

      if (!(0, _primitives.isDict)(encrypt)) {
        return null;
      }

      var flags = encrypt.get('P');

      if (!(0, _util.isNum)(flags)) {
        return null;
      }

      flags += Math.pow(2, 32);
      var permissions = [];

      for (var key in _util.PermissionFlag) {
        var value = _util.PermissionFlag[key];

        if (flags & value) {
          permissions.push(value);
        }
      }

      return permissions;
    }
  }, {
    key: "getDestination",
    value: function getDestination(destinationId) {
      var obj = this._readDests();

      if (obj instanceof NameTree || obj instanceof _primitives.Dict) {
        return fetchDestination(obj.get(destinationId) || null);
      }

      return null;
    }
  }, {
    key: "_readDests",
    value: function _readDests() {
      var obj = this.catDict.get('Names');

      if (obj && obj.has('Dests')) {
        return new NameTree(obj.getRaw('Dests'), this.xref);
      } else if (this.catDict.has('Dests')) {
        return this.catDict.get('Dests');
      }

      return undefined;
    }
  }, {
    key: "_readPageLabels",
    value: function _readPageLabels() {
      var obj = this.catDict.getRaw('PageLabels');

      if (!obj) {
        return null;
      }

      var pageLabels = new Array(this.numPages);
      var style = null,
          prefix = '';
      var numberTree = new NumberTree(obj, this.xref);
      var nums = numberTree.getAll();
      var currentLabel = '',
          currentIndex = 1;

      for (var i = 0, ii = this.numPages; i < ii; i++) {
        if (i in nums) {
          var labelDict = nums[i];

          if (!(0, _primitives.isDict)(labelDict)) {
            throw new _util.FormatError('PageLabel is not a dictionary.');
          }

          if (labelDict.has('Type') && !(0, _primitives.isName)(labelDict.get('Type'), 'PageLabel')) {
            throw new _util.FormatError('Invalid type in PageLabel dictionary.');
          }

          if (labelDict.has('S')) {
            var s = labelDict.get('S');

            if (!(0, _primitives.isName)(s)) {
              throw new _util.FormatError('Invalid style in PageLabel dictionary.');
            }

            style = s.name;
          } else {
            style = null;
          }

          if (labelDict.has('P')) {
            var p = labelDict.get('P');

            if (!(0, _util.isString)(p)) {
              throw new _util.FormatError('Invalid prefix in PageLabel dictionary.');
            }

            prefix = (0, _util.stringToPDFString)(p);
          } else {
            prefix = '';
          }

          if (labelDict.has('St')) {
            var st = labelDict.get('St');

            if (!(Number.isInteger(st) && st >= 1)) {
              throw new _util.FormatError('Invalid start in PageLabel dictionary.');
            }

            currentIndex = st;
          } else {
            currentIndex = 1;
          }
        }

        switch (style) {
          case 'D':
            currentLabel = currentIndex;
            break;

          case 'R':
          case 'r':
            currentLabel = (0, _core_utils.toRomanNumerals)(currentIndex, style === 'r');
            break;

          case 'A':
          case 'a':
            var LIMIT = 26;
            var A_UPPER_CASE = 0x41,
                A_LOWER_CASE = 0x61;
            var baseCharCode = style === 'a' ? A_LOWER_CASE : A_UPPER_CASE;
            var letterIndex = currentIndex - 1;
            var character = String.fromCharCode(baseCharCode + letterIndex % LIMIT);
            var charBuf = [];

            for (var j = 0, jj = letterIndex / LIMIT | 0; j <= jj; j++) {
              charBuf.push(character);
            }

            currentLabel = charBuf.join('');
            break;

          default:
            if (style) {
              throw new _util.FormatError("Invalid style \"".concat(style, "\" in PageLabel dictionary."));
            }

            currentLabel = '';
        }

        pageLabels[i] = prefix + currentLabel;
        currentIndex++;
      }

      return pageLabels;
    }
  }, {
    key: "fontFallback",
    value: function fontFallback(id, handler) {
      var promises = [];
      this.fontCache.forEach(function (promise) {
        promises.push(promise);
      });
      return Promise.all(promises).then(function (translatedFonts) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = translatedFonts[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var translatedFont = _step.value;

            if (translatedFont.loadedName === id) {
              translatedFont.fallback(handler);
              return;
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      });
    }
  }, {
    key: "cleanup",
    value: function cleanup() {
      var _this = this;

      (0, _primitives.clearPrimitiveCaches)();
      this.pageKidsCountCache.clear();
      var promises = [];
      this.fontCache.forEach(function (promise) {
        promises.push(promise);
      });
      return Promise.all(promises).then(function (translatedFonts) {
        for (var i = 0, ii = translatedFonts.length; i < ii; i++) {
          var font = translatedFonts[i].dict;
          delete font.translated;
        }

        _this.fontCache.clear();

        _this.builtInCMapCache.clear();
      });
    }
  }, {
    key: "getPageDict",
    value: function getPageDict(pageIndex) {
      var capability = (0, _util.createPromiseCapability)();
      var nodesToVisit = [this.catDict.getRaw('Pages')];
      var xref = this.xref,
          pageKidsCountCache = this.pageKidsCountCache;
      var count,
          currentPageIndex = 0;

      function next() {
        var _loop = function _loop() {
          var currentNode = nodesToVisit.pop();

          if ((0, _primitives.isRef)(currentNode)) {
            count = pageKidsCountCache.get(currentNode);

            if (count > 0 && currentPageIndex + count < pageIndex) {
              currentPageIndex += count;
              return "continue";
            }

            xref.fetchAsync(currentNode).then(function (obj) {
              if ((0, _primitives.isDict)(obj, 'Page') || (0, _primitives.isDict)(obj) && !obj.has('Kids')) {
                if (pageIndex === currentPageIndex) {
                  if (currentNode && !pageKidsCountCache.has(currentNode)) {
                    pageKidsCountCache.put(currentNode, 1);
                  }

                  capability.resolve([obj, currentNode]);
                } else {
                  currentPageIndex++;
                  next();
                }

                return;
              }

              nodesToVisit.push(obj);
              next();
            }, capability.reject);
            return {
              v: void 0
            };
          }

          if (!(0, _primitives.isDict)(currentNode)) {
            capability.reject(new _util.FormatError('Page dictionary kid reference points to wrong type of object.'));
            return {
              v: void 0
            };
          }

          count = currentNode.get('Count');

          if (Number.isInteger(count) && count >= 0) {
            var objId = currentNode.objId;

            if (objId && !pageKidsCountCache.has(objId)) {
              pageKidsCountCache.put(objId, count);
            }

            if (currentPageIndex + count <= pageIndex) {
              currentPageIndex += count;
              return "continue";
            }
          }

          var kids = currentNode.get('Kids');

          if (!Array.isArray(kids)) {
            if ((0, _primitives.isName)(currentNode.get('Type'), 'Page') || !currentNode.has('Type') && currentNode.has('Contents')) {
              if (currentPageIndex === pageIndex) {
                capability.resolve([currentNode, null]);
                return {
                  v: void 0
                };
              }

              currentPageIndex++;
              return "continue";
            }

            capability.reject(new _util.FormatError('Page dictionary kids object is not an array.'));
            return {
              v: void 0
            };
          }

          for (var last = kids.length - 1; last >= 0; last--) {
            nodesToVisit.push(kids[last]);
          }
        };

        while (nodesToVisit.length) {
          var _ret = _loop();

          switch (_ret) {
            case "continue":
              continue;

            default:
              if (_typeof(_ret) === "object") return _ret.v;
          }
        }

        capability.reject(new Error("Page index ".concat(pageIndex, " not found.")));
      }

      next();
      return capability.promise;
    }
  }, {
    key: "getPageIndex",
    value: function getPageIndex(pageRef) {
      var xref = this.xref;

      function pagesBeforeRef(kidRef) {
        var total = 0,
            parentRef;
        return xref.fetchAsync(kidRef).then(function (node) {
          if ((0, _primitives.isRefsEqual)(kidRef, pageRef) && !(0, _primitives.isDict)(node, 'Page') && !((0, _primitives.isDict)(node) && !node.has('Type') && node.has('Contents'))) {
            throw new _util.FormatError('The reference does not point to a /Page dictionary.');
          }

          if (!node) {
            return null;
          }

          if (!(0, _primitives.isDict)(node)) {
            throw new _util.FormatError('Node must be a dictionary.');
          }

          parentRef = node.getRaw('Parent');
          return node.getAsync('Parent');
        }).then(function (parent) {
          if (!parent) {
            return null;
          }

          if (!(0, _primitives.isDict)(parent)) {
            throw new _util.FormatError('Parent must be a dictionary.');
          }

          return parent.getAsync('Kids');
        }).then(function (kids) {
          if (!kids) {
            return null;
          }

          var kidPromises = [];
          var found = false;

          for (var i = 0, ii = kids.length; i < ii; i++) {
            var kid = kids[i];

            if (!(0, _primitives.isRef)(kid)) {
              throw new _util.FormatError('Kid must be a reference.');
            }

            if ((0, _primitives.isRefsEqual)(kid, kidRef)) {
              found = true;
              break;
            }

            kidPromises.push(xref.fetchAsync(kid).then(function (kid) {
              if (!(0, _primitives.isDict)(kid)) {
                throw new _util.FormatError('Kid node must be a dictionary.');
              }

              if (kid.has('Count')) {
                total += kid.get('Count');
              } else {
                total++;
              }
            }));
          }

          if (!found) {
            throw new _util.FormatError('Kid reference not found in parent\'s kids.');
          }

          return Promise.all(kidPromises).then(function () {
            return [total, parentRef];
          });
        });
      }

      var total = 0;

      function next(ref) {
        return pagesBeforeRef(ref).then(function (args) {
          if (!args) {
            return total;
          }

          var _args = _slicedToArray(args, 2),
              count = _args[0],
              parentRef = _args[1];

          total += count;
          return next(parentRef);
        });
      }

      return next(pageRef);
    }
  }, {
    key: "metadata",
    get: function get() {
      var streamRef = this.catDict.getRaw('Metadata');

      if (!(0, _primitives.isRef)(streamRef)) {
        return (0, _util.shadow)(this, 'metadata', null);
      }

      var suppressEncryption = !(this.xref.encrypt && this.xref.encrypt.encryptMetadata);
      var stream = this.xref.fetch(streamRef, suppressEncryption);
      var metadata;

      if (stream && (0, _primitives.isDict)(stream.dict)) {
        var type = stream.dict.get('Type');
        var subtype = stream.dict.get('Subtype');

        if ((0, _primitives.isName)(type, 'Metadata') && (0, _primitives.isName)(subtype, 'XML')) {
          try {
            metadata = (0, _util.stringToUTF8String)((0, _util.bytesToString)(stream.getBytes()));
          } catch (e) {
            if (e instanceof _core_utils.MissingDataException) {
              throw e;
            }

            (0, _util.info)('Skipping invalid metadata.');
          }
        }
      }

      return (0, _util.shadow)(this, 'metadata', metadata);
    }
  }, {
    key: "toplevelPagesDict",
    get: function get() {
      var pagesObj = this.catDict.get('Pages');

      if (!(0, _primitives.isDict)(pagesObj)) {
        throw new _util.FormatError('Invalid top-level pages dictionary.');
      }

      return (0, _util.shadow)(this, 'toplevelPagesDict', pagesObj);
    }
  }, {
    key: "documentOutline",
    get: function get() {
      var obj = null;

      try {
        obj = this._readDocumentOutline();
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)('Unable to read document outline.');
      }

      return (0, _util.shadow)(this, 'documentOutline', obj);
    }
  }, {
    key: "permissions",
    get: function get() {
      var permissions = null;

      try {
        permissions = this._readPermissions();
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)('Unable to read permissions.');
      }

      return (0, _util.shadow)(this, 'permissions', permissions);
    }
  }, {
    key: "numPages",
    get: function get() {
      var obj = this.toplevelPagesDict.get('Count');

      if (!Number.isInteger(obj)) {
        throw new _util.FormatError('Page count in top-level pages dictionary is not an integer.');
      }

      return (0, _util.shadow)(this, 'numPages', obj);
    }
  }, {
    key: "destinations",
    get: function get() {
      var obj = this._readDests(),
          dests = Object.create(null);

      if (obj instanceof NameTree) {
        var names = obj.getAll();

        for (var name in names) {
          dests[name] = fetchDestination(names[name]);
        }
      } else if (obj instanceof _primitives.Dict) {
        obj.forEach(function (key, value) {
          if (value) {
            dests[key] = fetchDestination(value);
          }
        });
      }

      return (0, _util.shadow)(this, 'destinations', dests);
    }
  }, {
    key: "pageLabels",
    get: function get() {
      var obj = null;

      try {
        obj = this._readPageLabels();
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)('Unable to read page labels.');
      }

      return (0, _util.shadow)(this, 'pageLabels', obj);
    }
  }, {
    key: "pageLayout",
    get: function get() {
      var obj = this.catDict.get('PageLayout');
      var pageLayout = '';

      if ((0, _primitives.isName)(obj)) {
        switch (obj.name) {
          case 'SinglePage':
          case 'OneColumn':
          case 'TwoColumnLeft':
          case 'TwoColumnRight':
          case 'TwoPageLeft':
          case 'TwoPageRight':
            pageLayout = obj.name;
        }
      }

      return (0, _util.shadow)(this, 'pageLayout', pageLayout);
    }
  }, {
    key: "pageMode",
    get: function get() {
      var obj = this.catDict.get('PageMode');
      var pageMode = 'UseNone';

      if ((0, _primitives.isName)(obj)) {
        switch (obj.name) {
          case 'UseNone':
          case 'UseOutlines':
          case 'UseThumbs':
          case 'FullScreen':
          case 'UseOC':
          case 'UseAttachments':
            pageMode = obj.name;
        }
      }

      return (0, _util.shadow)(this, 'pageMode', pageMode);
    }
  }, {
    key: "viewerPreferences",
    get: function get() {
      var _this2 = this;

      var ViewerPreferencesValidators = {
        HideToolbar: _util.isBool,
        HideMenubar: _util.isBool,
        HideWindowUI: _util.isBool,
        FitWindow: _util.isBool,
        CenterWindow: _util.isBool,
        DisplayDocTitle: _util.isBool,
        NonFullScreenPageMode: _primitives.isName,
        Direction: _primitives.isName,
        ViewArea: _primitives.isName,
        ViewClip: _primitives.isName,
        PrintArea: _primitives.isName,
        PrintClip: _primitives.isName,
        PrintScaling: _primitives.isName,
        Duplex: _primitives.isName,
        PickTrayByPDFSize: _util.isBool,
        PrintPageRange: Array.isArray,
        NumCopies: Number.isInteger
      };
      var obj = this.catDict.get('ViewerPreferences');
      var prefs = Object.create(null);

      if ((0, _primitives.isDict)(obj)) {
        for (var key in ViewerPreferencesValidators) {
          if (!obj.has(key)) {
            continue;
          }

          var value = obj.get(key);

          if (!ViewerPreferencesValidators[key](value)) {
            (0, _util.info)("Bad value in ViewerPreferences for \"".concat(key, "\"."));
            continue;
          }

          var prefValue = void 0;

          switch (key) {
            case 'NonFullScreenPageMode':
              switch (value.name) {
                case 'UseNone':
                case 'UseOutlines':
                case 'UseThumbs':
                case 'UseOC':
                  prefValue = value.name;
                  break;

                default:
                  prefValue = 'UseNone';
              }

              break;

            case 'Direction':
              switch (value.name) {
                case 'L2R':
                case 'R2L':
                  prefValue = value.name;
                  break;

                default:
                  prefValue = 'L2R';
              }

              break;

            case 'ViewArea':
            case 'ViewClip':
            case 'PrintArea':
            case 'PrintClip':
              switch (value.name) {
                case 'MediaBox':
                case 'CropBox':
                case 'BleedBox':
                case 'TrimBox':
                case 'ArtBox':
                  prefValue = value.name;
                  break;

                default:
                  prefValue = 'CropBox';
              }

              break;

            case 'PrintScaling':
              switch (value.name) {
                case 'None':
                case 'AppDefault':
                  prefValue = value.name;
                  break;

                default:
                  prefValue = 'AppDefault';
              }

              break;

            case 'Duplex':
              switch (value.name) {
                case 'Simplex':
                case 'DuplexFlipShortEdge':
                case 'DuplexFlipLongEdge':
                  prefValue = value.name;
                  break;

                default:
                  prefValue = 'None';
              }

              break;

            case 'PrintPageRange':
              var length = value.length;

              if (length % 2 !== 0) {
                break;
              }

              var isValid = value.every(function (page, i, arr) {
                return Number.isInteger(page) && page > 0 && (i === 0 || page >= arr[i - 1]) && page <= _this2.numPages;
              });

              if (isValid) {
                prefValue = value;
              }

              break;

            case 'NumCopies':
              if (value > 0) {
                prefValue = value;
              }

              break;

            default:
              (0, _util.assert)(typeof value === 'boolean');
              prefValue = value;
          }

          if (prefValue !== undefined) {
            prefs[key] = prefValue;
          } else {
            (0, _util.info)("Bad value in ViewerPreferences for \"".concat(key, "\"."));
          }
        }
      }

      return (0, _util.shadow)(this, 'viewerPreferences', prefs);
    }
  }, {
    key: "openActionDestination",
    get: function get() {
      var obj = this.catDict.get('OpenAction');
      var openActionDest = null;

      if ((0, _primitives.isDict)(obj)) {
        var destDict = new _primitives.Dict(this.xref);
        destDict.set('A', obj);
        var resultObj = {
          url: null,
          dest: null
        };
        Catalog.parseDestDictionary({
          destDict: destDict,
          resultObj: resultObj
        });

        if (Array.isArray(resultObj.dest)) {
          openActionDest = resultObj.dest;
        }
      } else if (Array.isArray(obj)) {
        openActionDest = obj;
      }

      return (0, _util.shadow)(this, 'openActionDestination', openActionDest);
    }
  }, {
    key: "attachments",
    get: function get() {
      var obj = this.catDict.get('Names');
      var attachments = null;

      if (obj && obj.has('EmbeddedFiles')) {
        var nameTree = new NameTree(obj.getRaw('EmbeddedFiles'), this.xref);
        var names = nameTree.getAll();

        for (var name in names) {
          var fs = new FileSpec(names[name], this.xref);

          if (!attachments) {
            attachments = Object.create(null);
          }

          attachments[(0, _util.stringToPDFString)(name)] = fs.serializable;
        }
      }

      return (0, _util.shadow)(this, 'attachments', attachments);
    }
  }, {
    key: "javaScript",
    get: function get() {
      var obj = this.catDict.get('Names');
      var javaScript = null;

      function appendIfJavaScriptDict(jsDict) {
        var type = jsDict.get('S');

        if (!(0, _primitives.isName)(type, 'JavaScript')) {
          return;
        }

        var js = jsDict.get('JS');

        if ((0, _primitives.isStream)(js)) {
          js = (0, _util.bytesToString)(js.getBytes());
        } else if (!(0, _util.isString)(js)) {
          return;
        }

        if (!javaScript) {
          javaScript = [];
        }

        javaScript.push((0, _util.stringToPDFString)(js));
      }

      if (obj && obj.has('JavaScript')) {
        var nameTree = new NameTree(obj.getRaw('JavaScript'), this.xref);
        var names = nameTree.getAll();

        for (var name in names) {
          var jsDict = names[name];

          if ((0, _primitives.isDict)(jsDict)) {
            appendIfJavaScriptDict(jsDict);
          }
        }
      }

      var openActionDict = this.catDict.get('OpenAction');

      if ((0, _primitives.isDict)(openActionDict, 'Action')) {
        var actionType = openActionDict.get('S');

        if ((0, _primitives.isName)(actionType, 'Named')) {
          var action = openActionDict.get('N');

          if ((0, _primitives.isName)(action, 'Print')) {
            if (!javaScript) {
              javaScript = [];
            }

            javaScript.push('print({});');
          }
        } else {
          appendIfJavaScriptDict(openActionDict);
        }
      }

      return (0, _util.shadow)(this, 'javaScript', javaScript);
    }
  }], [{
    key: "parseDestDictionary",
    value: function parseDestDictionary(params) {
      function addDefaultProtocolToUrl(url) {
        return url.startsWith('www.') ? "http://".concat(url) : url;
      }

      function tryConvertUrlEncoding(url) {
        try {
          return (0, _util.stringToUTF8String)(url);
        } catch (e) {
          return url;
        }
      }

      var destDict = params.destDict;

      if (!(0, _primitives.isDict)(destDict)) {
        (0, _util.warn)('parseDestDictionary: `destDict` must be a dictionary.');
        return;
      }

      var resultObj = params.resultObj;

      if (_typeof(resultObj) !== 'object') {
        (0, _util.warn)('parseDestDictionary: `resultObj` must be an object.');
        return;
      }

      var docBaseUrl = params.docBaseUrl || null;
      var action = destDict.get('A'),
          url,
          dest;

      if (!(0, _primitives.isDict)(action) && destDict.has('Dest')) {
        action = destDict.get('Dest');
      }

      if ((0, _primitives.isDict)(action)) {
        var actionType = action.get('S');

        if (!(0, _primitives.isName)(actionType)) {
          (0, _util.warn)('parseDestDictionary: Invalid type in Action dictionary.');
          return;
        }

        var actionName = actionType.name;

        switch (actionName) {
          case 'URI':
            url = action.get('URI');

            if ((0, _primitives.isName)(url)) {
              url = '/' + url.name;
            } else if ((0, _util.isString)(url)) {
              url = addDefaultProtocolToUrl(url);
            }

            break;

          case 'GoTo':
            dest = action.get('D');
            break;

          case 'Launch':
          case 'GoToR':
            var urlDict = action.get('F');

            if ((0, _primitives.isDict)(urlDict)) {
              url = urlDict.get('F') || null;
            } else if ((0, _util.isString)(urlDict)) {
              url = urlDict;
            }

            var remoteDest = action.get('D');

            if (remoteDest) {
              if ((0, _primitives.isName)(remoteDest)) {
                remoteDest = remoteDest.name;
              }

              if ((0, _util.isString)(url)) {
                var baseUrl = url.split('#')[0];

                if ((0, _util.isString)(remoteDest)) {
                  url = baseUrl + '#' + remoteDest;
                } else if (Array.isArray(remoteDest)) {
                  url = baseUrl + '#' + JSON.stringify(remoteDest);
                }
              }
            }

            var newWindow = action.get('NewWindow');

            if ((0, _util.isBool)(newWindow)) {
              resultObj.newWindow = newWindow;
            }

            break;

          case 'Named':
            var namedAction = action.get('N');

            if ((0, _primitives.isName)(namedAction)) {
              resultObj.action = namedAction.name;
            }

            break;

          case 'JavaScript':
            var jsAction = action.get('JS');
            var js;

            if ((0, _primitives.isStream)(jsAction)) {
              js = (0, _util.bytesToString)(jsAction.getBytes());
            } else if ((0, _util.isString)(jsAction)) {
              js = jsAction;
            }

            if (js) {
              var URL_OPEN_METHODS = ['app.launchURL', 'window.open'];
              var regex = new RegExp('^\\s*(' + URL_OPEN_METHODS.join('|').split('.').join('\\.') + ')\\((?:\'|\")([^\'\"]*)(?:\'|\")(?:,\\s*(\\w+)\\)|\\))', 'i');
              var jsUrl = regex.exec((0, _util.stringToPDFString)(js));

              if (jsUrl && jsUrl[2]) {
                url = jsUrl[2];

                if (jsUrl[3] === 'true' && jsUrl[1] === 'app.launchURL') {
                  resultObj.newWindow = true;
                }

                break;
              }
            }

          default:
            (0, _util.warn)("parseDestDictionary: unsupported action type \"".concat(actionName, "\"."));
            break;
        }
      } else if (destDict.has('Dest')) {
        dest = destDict.get('Dest');
      }

      if ((0, _util.isString)(url)) {
        url = tryConvertUrlEncoding(url);
        var absoluteUrl = (0, _util.createValidAbsoluteUrl)(url, docBaseUrl);

        if (absoluteUrl) {
          resultObj.url = absoluteUrl.href;
        }

        resultObj.unsafeUrl = url;
      }

      if (dest) {
        if ((0, _primitives.isName)(dest)) {
          dest = dest.name;
        }

        if ((0, _util.isString)(dest) || Array.isArray(dest)) {
          resultObj.dest = dest;
        }
      }
    }
  }]);

  return Catalog;
}();

exports.Catalog = Catalog;

var XRef = function XRefClosure() {
  function XRef(stream, pdfManager) {
    this.stream = stream;
    this.pdfManager = pdfManager;
    this.entries = [];
    this.xrefstms = Object.create(null);
    this.cache = [];
    this.stats = {
      streamTypes: [],
      fontTypes: []
    };
  }

  XRef.prototype = {
    setStartXRef: function XRef_setStartXRef(startXRef) {
      this.startXRefQueue = [startXRef];
    },
    parse: function XRef_parse(recoveryMode) {
      var trailerDict;

      if (!recoveryMode) {
        trailerDict = this.readXRef();
      } else {
        (0, _util.warn)('Indexing all PDF objects');
        trailerDict = this.indexObjects();
      }

      trailerDict.assignXref(this);
      this.trailer = trailerDict;
      var encrypt;

      try {
        encrypt = trailerDict.get('Encrypt');
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)("XRef.parse - Invalid \"Encrypt\" reference: \"".concat(ex, "\"."));
      }

      if ((0, _primitives.isDict)(encrypt)) {
        var ids = trailerDict.get('ID');
        var fileId = ids && ids.length ? ids[0] : '';
        encrypt.suppressEncryption = true;
        this.encrypt = new _crypto.CipherTransformFactory(encrypt, fileId, this.pdfManager.password);
      }

      var root;

      try {
        root = trailerDict.get('Root');
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)("XRef.parse - Invalid \"Root\" reference: \"".concat(ex, "\"."));
      }

      if ((0, _primitives.isDict)(root) && root.has('Pages')) {
        this.root = root;
      } else {
        if (!recoveryMode) {
          throw new _core_utils.XRefParseException();
        }

        throw new _util.FormatError('Invalid root reference');
      }
    },
    processXRefTable: function XRef_processXRefTable(parser) {
      if (!('tableState' in this)) {
        this.tableState = {
          entryNum: 0,
          streamPos: parser.lexer.stream.pos,
          parserBuf1: parser.buf1,
          parserBuf2: parser.buf2
        };
      }

      var obj = this.readXRefTable(parser);

      if (!(0, _primitives.isCmd)(obj, 'trailer')) {
        throw new _util.FormatError('Invalid XRef table: could not find trailer dictionary');
      }

      var dict = parser.getObj();

      if (!(0, _primitives.isDict)(dict) && dict.dict) {
        dict = dict.dict;
      }

      if (!(0, _primitives.isDict)(dict)) {
        throw new _util.FormatError('Invalid XRef table: could not parse trailer dictionary');
      }

      delete this.tableState;
      return dict;
    },
    readXRefTable: function XRef_readXRefTable(parser) {
      var stream = parser.lexer.stream;
      var tableState = this.tableState;
      stream.pos = tableState.streamPos;
      parser.buf1 = tableState.parserBuf1;
      parser.buf2 = tableState.parserBuf2;
      var obj;

      while (true) {
        if (!('firstEntryNum' in tableState) || !('entryCount' in tableState)) {
          if ((0, _primitives.isCmd)(obj = parser.getObj(), 'trailer')) {
            break;
          }

          tableState.firstEntryNum = obj;
          tableState.entryCount = parser.getObj();
        }

        var first = tableState.firstEntryNum;
        var count = tableState.entryCount;

        if (!Number.isInteger(first) || !Number.isInteger(count)) {
          throw new _util.FormatError('Invalid XRef table: wrong types in subsection header');
        }

        for (var i = tableState.entryNum; i < count; i++) {
          tableState.streamPos = stream.pos;
          tableState.entryNum = i;
          tableState.parserBuf1 = parser.buf1;
          tableState.parserBuf2 = parser.buf2;
          var entry = {};
          entry.offset = parser.getObj();
          entry.gen = parser.getObj();
          var type = parser.getObj();

          if ((0, _primitives.isCmd)(type, 'f')) {
            entry.free = true;
          } else if ((0, _primitives.isCmd)(type, 'n')) {
            entry.uncompressed = true;
          }

          if (!Number.isInteger(entry.offset) || !Number.isInteger(entry.gen) || !(entry.free || entry.uncompressed)) {
            throw new _util.FormatError("Invalid entry in XRef subsection: ".concat(first, ", ").concat(count));
          }

          if (i === 0 && entry.free && first === 1) {
            first = 0;
          }

          if (!this.entries[i + first]) {
            this.entries[i + first] = entry;
          }
        }

        tableState.entryNum = 0;
        tableState.streamPos = stream.pos;
        tableState.parserBuf1 = parser.buf1;
        tableState.parserBuf2 = parser.buf2;
        delete tableState.firstEntryNum;
        delete tableState.entryCount;
      }

      if (this.entries[0] && !this.entries[0].free) {
        throw new _util.FormatError('Invalid XRef table: unexpected first object');
      }

      return obj;
    },
    processXRefStream: function XRef_processXRefStream(stream) {
      if (!('streamState' in this)) {
        var streamParameters = stream.dict;
        var byteWidths = streamParameters.get('W');
        var range = streamParameters.get('Index');

        if (!range) {
          range = [0, streamParameters.get('Size')];
        }

        this.streamState = {
          entryRanges: range,
          byteWidths: byteWidths,
          entryNum: 0,
          streamPos: stream.pos
        };
      }

      this.readXRefStream(stream);
      delete this.streamState;
      return stream.dict;
    },
    readXRefStream: function XRef_readXRefStream(stream) {
      var i, j;
      var streamState = this.streamState;
      stream.pos = streamState.streamPos;
      var byteWidths = streamState.byteWidths;
      var typeFieldWidth = byteWidths[0];
      var offsetFieldWidth = byteWidths[1];
      var generationFieldWidth = byteWidths[2];
      var entryRanges = streamState.entryRanges;

      while (entryRanges.length > 0) {
        var first = entryRanges[0];
        var n = entryRanges[1];

        if (!Number.isInteger(first) || !Number.isInteger(n)) {
          throw new _util.FormatError("Invalid XRef range fields: ".concat(first, ", ").concat(n));
        }

        if (!Number.isInteger(typeFieldWidth) || !Number.isInteger(offsetFieldWidth) || !Number.isInteger(generationFieldWidth)) {
          throw new _util.FormatError("Invalid XRef entry fields length: ".concat(first, ", ").concat(n));
        }

        for (i = streamState.entryNum; i < n; ++i) {
          streamState.entryNum = i;
          streamState.streamPos = stream.pos;
          var type = 0,
              offset = 0,
              generation = 0;

          for (j = 0; j < typeFieldWidth; ++j) {
            type = type << 8 | stream.getByte();
          }

          if (typeFieldWidth === 0) {
            type = 1;
          }

          for (j = 0; j < offsetFieldWidth; ++j) {
            offset = offset << 8 | stream.getByte();
          }

          for (j = 0; j < generationFieldWidth; ++j) {
            generation = generation << 8 | stream.getByte();
          }

          var entry = {};
          entry.offset = offset;
          entry.gen = generation;

          switch (type) {
            case 0:
              entry.free = true;
              break;

            case 1:
              entry.uncompressed = true;
              break;

            case 2:
              break;

            default:
              throw new _util.FormatError("Invalid XRef entry type: ".concat(type));
          }

          if (!this.entries[first + i]) {
            this.entries[first + i] = entry;
          }
        }

        streamState.entryNum = 0;
        streamState.streamPos = stream.pos;
        entryRanges.splice(0, 2);
      }
    },
    indexObjects: function XRef_indexObjects() {
      var TAB = 0x9,
          LF = 0xA,
          CR = 0xD,
          SPACE = 0x20;
      var PERCENT = 0x25,
          LT = 0x3C;

      function readToken(data, offset) {
        var token = '',
            ch = data[offset];

        while (ch !== LF && ch !== CR && ch !== LT) {
          if (++offset >= data.length) {
            break;
          }

          token += String.fromCharCode(ch);
          ch = data[offset];
        }

        return token;
      }

      function skipUntil(data, offset, what) {
        var length = what.length,
            dataLength = data.length;
        var skipped = 0;

        while (offset < dataLength) {
          var i = 0;

          while (i < length && data[offset + i] === what[i]) {
            ++i;
          }

          if (i >= length) {
            break;
          }

          offset++;
          skipped++;
        }

        return skipped;
      }

      var objRegExp = /^(\d+)\s+(\d+)\s+obj\b/;
      var endobjRegExp = /\bendobj[\b\s]$/;
      var nestedObjRegExp = /\s+(\d+\s+\d+\s+obj[\b\s<])$/;
      var CHECK_CONTENT_LENGTH = 25;
      var trailerBytes = new Uint8Array([116, 114, 97, 105, 108, 101, 114]);
      var startxrefBytes = new Uint8Array([115, 116, 97, 114, 116, 120, 114, 101, 102]);
      var objBytes = new Uint8Array([111, 98, 106]);
      var xrefBytes = new Uint8Array([47, 88, 82, 101, 102]);
      this.entries.length = 0;
      var stream = this.stream;
      stream.pos = 0;
      var buffer = stream.getBytes();
      var position = stream.start,
          length = buffer.length;
      var trailers = [],
          xrefStms = [];

      while (position < length) {
        var ch = buffer[position];

        if (ch === TAB || ch === LF || ch === CR || ch === SPACE) {
          ++position;
          continue;
        }

        if (ch === PERCENT) {
          do {
            ++position;

            if (position >= length) {
              break;
            }

            ch = buffer[position];
          } while (ch !== LF && ch !== CR);

          continue;
        }

        var token = readToken(buffer, position);
        var m;

        if (token.startsWith('xref') && (token.length === 4 || /\s/.test(token[4]))) {
          position += skipUntil(buffer, position, trailerBytes);
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else if (m = objRegExp.exec(token)) {
          var num = m[1] | 0,
              gen = m[2] | 0;

          if (typeof this.entries[num] === 'undefined') {
            this.entries[num] = {
              offset: position - stream.start,
              gen: gen,
              uncompressed: true
            };
          }

          var contentLength = void 0,
              startPos = position + token.length;

          while (startPos < buffer.length) {
            var endPos = startPos + skipUntil(buffer, startPos, objBytes) + 4;
            contentLength = endPos - position;
            var checkPos = Math.max(endPos - CHECK_CONTENT_LENGTH, startPos);
            var tokenStr = (0, _util.bytesToString)(buffer.subarray(checkPos, endPos));

            if (endobjRegExp.test(tokenStr)) {
              break;
            } else {
              var objToken = nestedObjRegExp.exec(tokenStr);

              if (objToken && objToken[1]) {
                (0, _util.warn)('indexObjects: Found new "obj" inside of another "obj", ' + 'caused by missing "endobj" -- trying to recover.');
                contentLength -= objToken[1].length;
                break;
              }
            }

            startPos = endPos;
          }

          var content = buffer.subarray(position, position + contentLength);
          var xrefTagOffset = skipUntil(content, 0, xrefBytes);

          if (xrefTagOffset < contentLength && content[xrefTagOffset + 5] < 64) {
            xrefStms.push(position - stream.start);
            this.xrefstms[position - stream.start] = 1;
          }

          position += contentLength;
        } else if (token.startsWith('trailer') && (token.length === 7 || /\s/.test(token[7]))) {
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else {
          position += token.length + 1;
        }
      }

      var i, ii;

      for (i = 0, ii = xrefStms.length; i < ii; ++i) {
        this.startXRefQueue.push(xrefStms[i]);
        this.readXRef(true);
      }

      var trailerDict;

      for (i = 0, ii = trailers.length; i < ii; ++i) {
        stream.pos = trailers[i];
        var parser = new _parser.Parser(new _parser.Lexer(stream), true, this, true);
        var obj = parser.getObj();

        if (!(0, _primitives.isCmd)(obj, 'trailer')) {
          continue;
        }

        var dict = parser.getObj();

        if (!(0, _primitives.isDict)(dict)) {
          continue;
        }

        var rootDict = void 0;

        try {
          rootDict = dict.get('Root');
        } catch (ex) {
          if (ex instanceof _core_utils.MissingDataException) {
            throw ex;
          }

          continue;
        }

        if (!(0, _primitives.isDict)(rootDict) || !rootDict.has('Pages')) {
          continue;
        }

        if (dict.has('ID')) {
          return dict;
        }

        trailerDict = dict;
      }

      if (trailerDict) {
        return trailerDict;
      }

      throw new _util.InvalidPDFException('Invalid PDF structure');
    },
    readXRef: function XRef_readXRef(recoveryMode) {
      var stream = this.stream;
      var startXRefParsedCache = Object.create(null);

      try {
        while (this.startXRefQueue.length) {
          var startXRef = this.startXRefQueue[0];

          if (startXRefParsedCache[startXRef]) {
            (0, _util.warn)('readXRef - skipping XRef table since it was already parsed.');
            this.startXRefQueue.shift();
            continue;
          }

          startXRefParsedCache[startXRef] = true;
          stream.pos = startXRef + stream.start;
          var parser = new _parser.Parser(new _parser.Lexer(stream), true, this);
          var obj = parser.getObj();
          var dict;

          if ((0, _primitives.isCmd)(obj, 'xref')) {
            dict = this.processXRefTable(parser);

            if (!this.topDict) {
              this.topDict = dict;
            }

            obj = dict.get('XRefStm');

            if (Number.isInteger(obj)) {
              var pos = obj;

              if (!(pos in this.xrefstms)) {
                this.xrefstms[pos] = 1;
                this.startXRefQueue.push(pos);
              }
            }
          } else if (Number.isInteger(obj)) {
            if (!Number.isInteger(parser.getObj()) || !(0, _primitives.isCmd)(parser.getObj(), 'obj') || !(0, _primitives.isStream)(obj = parser.getObj())) {
              throw new _util.FormatError('Invalid XRef stream');
            }

            dict = this.processXRefStream(obj);

            if (!this.topDict) {
              this.topDict = dict;
            }

            if (!dict) {
              throw new _util.FormatError('Failed to read XRef stream');
            }
          } else {
            throw new _util.FormatError('Invalid XRef stream header');
          }

          obj = dict.get('Prev');

          if (Number.isInteger(obj)) {
            this.startXRefQueue.push(obj);
          } else if ((0, _primitives.isRef)(obj)) {
            this.startXRefQueue.push(obj.num);
          }

          this.startXRefQueue.shift();
        }

        return this.topDict;
      } catch (e) {
        if (e instanceof _core_utils.MissingDataException) {
          throw e;
        }

        (0, _util.info)('(while reading XRef): ' + e);
      }

      if (recoveryMode) {
        return undefined;
      }

      throw new _core_utils.XRefParseException();
    },
    getEntry: function XRef_getEntry(i) {
      var xrefEntry = this.entries[i];

      if (xrefEntry && !xrefEntry.free && xrefEntry.offset) {
        return xrefEntry;
      }

      return null;
    },
    fetchIfRef: function XRef_fetchIfRef(obj, suppressEncryption) {
      if (!(0, _primitives.isRef)(obj)) {
        return obj;
      }

      return this.fetch(obj, suppressEncryption);
    },
    fetch: function XRef_fetch(ref, suppressEncryption) {
      if (!(0, _primitives.isRef)(ref)) {
        throw new Error('ref object is not a reference');
      }

      var num = ref.num;

      if (num in this.cache) {
        var cacheEntry = this.cache[num];

        if (cacheEntry instanceof _primitives.Dict && !cacheEntry.objId) {
          cacheEntry.objId = ref.toString();
        }

        return cacheEntry;
      }

      var xrefEntry = this.getEntry(num);

      if (xrefEntry === null) {
        return this.cache[num] = null;
      }

      if (xrefEntry.uncompressed) {
        xrefEntry = this.fetchUncompressed(ref, xrefEntry, suppressEncryption);
      } else {
        xrefEntry = this.fetchCompressed(ref, xrefEntry, suppressEncryption);
      }

      if ((0, _primitives.isDict)(xrefEntry)) {
        xrefEntry.objId = ref.toString();
      } else if ((0, _primitives.isStream)(xrefEntry)) {
        xrefEntry.dict.objId = ref.toString();
      }

      return xrefEntry;
    },
    fetchUncompressed: function fetchUncompressed(ref, xrefEntry) {
      var suppressEncryption = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
      var gen = ref.gen;
      var num = ref.num;

      if (xrefEntry.gen !== gen) {
        throw new _core_utils.XRefEntryException("Inconsistent generation in XRef: ".concat(ref));
      }

      var stream = this.stream.makeSubStream(xrefEntry.offset + this.stream.start);
      var parser = new _parser.Parser(new _parser.Lexer(stream), true, this);
      var obj1 = parser.getObj();
      var obj2 = parser.getObj();
      var obj3 = parser.getObj();

      if (!Number.isInteger(obj1)) {
        obj1 = parseInt(obj1, 10);
      }

      if (!Number.isInteger(obj2)) {
        obj2 = parseInt(obj2, 10);
      }

      if (obj1 !== num || obj2 !== gen || !(0, _primitives.isCmd)(obj3)) {
        throw new _core_utils.XRefEntryException("Bad (uncompressed) XRef entry: ".concat(ref));
      }

      if (obj3.cmd !== 'obj') {
        if (obj3.cmd.startsWith('obj')) {
          num = parseInt(obj3.cmd.substring(3), 10);

          if (!Number.isNaN(num)) {
            return num;
          }
        }

        throw new _core_utils.XRefEntryException("Bad (uncompressed) XRef entry: ".concat(ref));
      }

      if (this.encrypt && !suppressEncryption) {
        xrefEntry = parser.getObj(this.encrypt.createCipherTransform(num, gen));
      } else {
        xrefEntry = parser.getObj();
      }

      if (!(0, _primitives.isStream)(xrefEntry)) {
        this.cache[num] = xrefEntry;
      }

      return xrefEntry;
    },
    fetchCompressed: function fetchCompressed(ref, xrefEntry) {
      var suppressEncryption = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
      var tableOffset = xrefEntry.offset;
      var stream = this.fetch(_primitives.Ref.get(tableOffset, 0));

      if (!(0, _primitives.isStream)(stream)) {
        throw new _util.FormatError('bad ObjStm stream');
      }

      var first = stream.dict.get('First');
      var n = stream.dict.get('N');

      if (!Number.isInteger(first) || !Number.isInteger(n)) {
        throw new _util.FormatError('invalid first and n parameters for ObjStm stream');
      }

      var parser = new _parser.Parser(new _parser.Lexer(stream), false, this);
      parser.allowStreams = true;
      var i,
          entries = [],
          num,
          nums = [];

      for (i = 0; i < n; ++i) {
        num = parser.getObj();

        if (!Number.isInteger(num)) {
          throw new _util.FormatError("invalid object number in the ObjStm stream: ".concat(num));
        }

        nums.push(num);
        var offset = parser.getObj();

        if (!Number.isInteger(offset)) {
          throw new _util.FormatError("invalid object offset in the ObjStm stream: ".concat(offset));
        }
      }

      for (i = 0; i < n; ++i) {
        entries.push(parser.getObj());

        if ((0, _primitives.isCmd)(parser.buf1, 'endobj')) {
          parser.shift();
        }

        num = nums[i];
        var entry = this.entries[num];

        if (entry && entry.offset === tableOffset && entry.gen === i) {
          this.cache[num] = entries[i];
        }
      }

      xrefEntry = entries[xrefEntry.gen];

      if (xrefEntry === undefined) {
        throw new _core_utils.XRefEntryException("Bad (compressed) XRef entry: ".concat(ref));
      }

      return xrefEntry;
    },
    fetchIfRefAsync: function () {
      var _fetchIfRefAsync = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee(obj, suppressEncryption) {
        return _regenerator["default"].wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                if ((0, _primitives.isRef)(obj)) {
                  _context.next = 2;
                  break;
                }

                return _context.abrupt("return", obj);

              case 2:
                return _context.abrupt("return", this.fetchAsync(obj, suppressEncryption));

              case 3:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function fetchIfRefAsync(_x, _x2) {
        return _fetchIfRefAsync.apply(this, arguments);
      }

      return fetchIfRefAsync;
    }(),
    fetchAsync: function () {
      var _fetchAsync = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee2(ref, suppressEncryption) {
        return _regenerator["default"].wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.prev = 0;
                return _context2.abrupt("return", this.fetch(ref, suppressEncryption));

              case 4:
                _context2.prev = 4;
                _context2.t0 = _context2["catch"](0);

                if (_context2.t0 instanceof _core_utils.MissingDataException) {
                  _context2.next = 8;
                  break;
                }

                throw _context2.t0;

              case 8:
                _context2.next = 10;
                return this.pdfManager.requestRange(_context2.t0.begin, _context2.t0.end);

              case 10:
                return _context2.abrupt("return", this.fetchAsync(ref, suppressEncryption));

              case 11:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this, [[0, 4]]);
      }));

      function fetchAsync(_x3, _x4) {
        return _fetchAsync.apply(this, arguments);
      }

      return fetchAsync;
    }(),
    getCatalogObj: function XRef_getCatalogObj() {
      return this.root;
    }
  };
  return XRef;
}();

exports.XRef = XRef;

var NameOrNumberTree =
/*#__PURE__*/
function () {
  function NameOrNumberTree(root, xref, type) {
    _classCallCheck(this, NameOrNumberTree);

    if (this.constructor === NameOrNumberTree) {
      (0, _util.unreachable)('Cannot initialize NameOrNumberTree.');
    }

    this.root = root;
    this.xref = xref;
    this._type = type;
  }

  _createClass(NameOrNumberTree, [{
    key: "getAll",
    value: function getAll() {
      var dict = Object.create(null);

      if (!this.root) {
        return dict;
      }

      var xref = this.xref;
      var processed = new _primitives.RefSet();
      processed.put(this.root);
      var queue = [this.root];

      while (queue.length > 0) {
        var obj = xref.fetchIfRef(queue.shift());

        if (!(0, _primitives.isDict)(obj)) {
          continue;
        }

        if (obj.has('Kids')) {
          var kids = obj.get('Kids');

          for (var i = 0, ii = kids.length; i < ii; i++) {
            var kid = kids[i];

            if (processed.has(kid)) {
              throw new _util.FormatError("Duplicate entry in \"".concat(this._type, "\" tree."));
            }

            queue.push(kid);
            processed.put(kid);
          }

          continue;
        }

        var entries = obj.get(this._type);

        if (Array.isArray(entries)) {
          for (var _i2 = 0, _ii = entries.length; _i2 < _ii; _i2 += 2) {
            dict[xref.fetchIfRef(entries[_i2])] = xref.fetchIfRef(entries[_i2 + 1]);
          }
        }
      }

      return dict;
    }
  }, {
    key: "get",
    value: function get(key) {
      if (!this.root) {
        return null;
      }

      var xref = this.xref;
      var kidsOrEntries = xref.fetchIfRef(this.root);
      var loopCount = 0;
      var MAX_LEVELS = 10;

      while (kidsOrEntries.has('Kids')) {
        if (++loopCount > MAX_LEVELS) {
          (0, _util.warn)("Search depth limit reached for \"".concat(this._type, "\" tree."));
          return null;
        }

        var kids = kidsOrEntries.get('Kids');

        if (!Array.isArray(kids)) {
          return null;
        }

        var l = 0,
            r = kids.length - 1;

        while (l <= r) {
          var m = l + r >> 1;
          var kid = xref.fetchIfRef(kids[m]);
          var limits = kid.get('Limits');

          if (key < xref.fetchIfRef(limits[0])) {
            r = m - 1;
          } else if (key > xref.fetchIfRef(limits[1])) {
            l = m + 1;
          } else {
            kidsOrEntries = xref.fetchIfRef(kids[m]);
            break;
          }
        }

        if (l > r) {
          return null;
        }
      }

      var entries = kidsOrEntries.get(this._type);

      if (Array.isArray(entries)) {
        var _l = 0,
            _r = entries.length - 2;

        while (_l <= _r) {
          var tmp = _l + _r >> 1,
              _m = tmp + (tmp & 1);

          var currentKey = xref.fetchIfRef(entries[_m]);

          if (key < currentKey) {
            _r = _m - 2;
          } else if (key > currentKey) {
            _l = _m + 2;
          } else {
            return xref.fetchIfRef(entries[_m + 1]);
          }
        }

        (0, _util.info)("Falling back to an exhaustive search, for key \"".concat(key, "\", ") + "in \"".concat(this._type, "\" tree."));

        for (var _m2 = 0, mm = entries.length; _m2 < mm; _m2 += 2) {
          var _currentKey = xref.fetchIfRef(entries[_m2]);

          if (_currentKey === key) {
            (0, _util.warn)("The \"".concat(key, "\" key was found at an incorrect, ") + "i.e. out-of-order, position in \"".concat(this._type, "\" tree."));
            return xref.fetchIfRef(entries[_m2 + 1]);
          }
        }
      }

      return null;
    }
  }]);

  return NameOrNumberTree;
}();

var NameTree =
/*#__PURE__*/
function (_NameOrNumberTree) {
  _inherits(NameTree, _NameOrNumberTree);

  function NameTree(root, xref) {
    _classCallCheck(this, NameTree);

    return _possibleConstructorReturn(this, _getPrototypeOf(NameTree).call(this, root, xref, 'Names'));
  }

  return NameTree;
}(NameOrNumberTree);

var NumberTree =
/*#__PURE__*/
function (_NameOrNumberTree2) {
  _inherits(NumberTree, _NameOrNumberTree2);

  function NumberTree(root, xref) {
    _classCallCheck(this, NumberTree);

    return _possibleConstructorReturn(this, _getPrototypeOf(NumberTree).call(this, root, xref, 'Nums'));
  }

  return NumberTree;
}(NameOrNumberTree);

var FileSpec = function FileSpecClosure() {
  function FileSpec(root, xref) {
    if (!root || !(0, _primitives.isDict)(root)) {
      return;
    }

    this.xref = xref;
    this.root = root;

    if (root.has('FS')) {
      this.fs = root.get('FS');
    }

    this.description = root.has('Desc') ? (0, _util.stringToPDFString)(root.get('Desc')) : '';

    if (root.has('RF')) {
      (0, _util.warn)('Related file specifications are not supported');
    }

    this.contentAvailable = true;

    if (!root.has('EF')) {
      this.contentAvailable = false;
      (0, _util.warn)('Non-embedded file specifications are not supported');
    }
  }

  function pickPlatformItem(dict) {
    if (dict.has('UF')) {
      return dict.get('UF');
    } else if (dict.has('F')) {
      return dict.get('F');
    } else if (dict.has('Unix')) {
      return dict.get('Unix');
    } else if (dict.has('Mac')) {
      return dict.get('Mac');
    } else if (dict.has('DOS')) {
      return dict.get('DOS');
    }

    return null;
  }

  FileSpec.prototype = {
    get filename() {
      if (!this._filename && this.root) {
        var filename = pickPlatformItem(this.root) || 'unnamed';
        this._filename = (0, _util.stringToPDFString)(filename).replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\/g, '/');
      }

      return this._filename;
    },

    get content() {
      if (!this.contentAvailable) {
        return null;
      }

      if (!this.contentRef && this.root) {
        this.contentRef = pickPlatformItem(this.root.get('EF'));
      }

      var content = null;

      if (this.contentRef) {
        var xref = this.xref;
        var fileObj = xref.fetchIfRef(this.contentRef);

        if (fileObj && (0, _primitives.isStream)(fileObj)) {
          content = fileObj.getBytes();
        } else {
          (0, _util.warn)('Embedded file specification points to non-existing/invalid ' + 'content');
        }
      } else {
        (0, _util.warn)('Embedded file specification does not have a content');
      }

      return content;
    },

    get serializable() {
      return {
        filename: this.filename,
        content: this.content
      };
    }

  };
  return FileSpec;
}();

exports.FileSpec = FileSpec;

var ObjectLoader = function () {
  function mayHaveChildren(value) {
    return (0, _primitives.isRef)(value) || (0, _primitives.isDict)(value) || Array.isArray(value) || (0, _primitives.isStream)(value);
  }

  function addChildren(node, nodesToVisit) {
    if ((0, _primitives.isDict)(node) || (0, _primitives.isStream)(node)) {
      var dict = (0, _primitives.isDict)(node) ? node : node.dict;
      var dictKeys = dict.getKeys();

      for (var i = 0, ii = dictKeys.length; i < ii; i++) {
        var rawValue = dict.getRaw(dictKeys[i]);

        if (mayHaveChildren(rawValue)) {
          nodesToVisit.push(rawValue);
        }
      }
    } else if (Array.isArray(node)) {
      for (var _i3 = 0, _ii2 = node.length; _i3 < _ii2; _i3++) {
        var value = node[_i3];

        if (mayHaveChildren(value)) {
          nodesToVisit.push(value);
        }
      }
    }
  }

  function ObjectLoader(dict, keys, xref) {
    this.dict = dict;
    this.keys = keys;
    this.xref = xref;
    this.refSet = null;
    this.capability = null;
  }

  ObjectLoader.prototype = {
    load: function load() {
      this.capability = (0, _util.createPromiseCapability)();

      if (!(this.xref.stream instanceof _chunked_stream.ChunkedStream) || this.xref.stream.getMissingChunks().length === 0) {
        this.capability.resolve();
        return this.capability.promise;
      }

      var keys = this.keys,
          dict = this.dict;
      this.refSet = new _primitives.RefSet();
      var nodesToVisit = [];

      for (var i = 0, ii = keys.length; i < ii; i++) {
        var rawValue = dict.getRaw(keys[i]);

        if (rawValue !== undefined) {
          nodesToVisit.push(rawValue);
        }
      }

      this._walk(nodesToVisit);

      return this.capability.promise;
    },
    _walk: function _walk(nodesToVisit) {
      var _this3 = this;

      var nodesToRevisit = [];
      var pendingRequests = [];

      while (nodesToVisit.length) {
        var currentNode = nodesToVisit.pop();

        if ((0, _primitives.isRef)(currentNode)) {
          if (this.refSet.has(currentNode)) {
            continue;
          }

          try {
            this.refSet.put(currentNode);
            currentNode = this.xref.fetch(currentNode);
          } catch (ex) {
            if (!(ex instanceof _core_utils.MissingDataException)) {
              throw ex;
            }

            nodesToRevisit.push(currentNode);
            pendingRequests.push({
              begin: ex.begin,
              end: ex.end
            });
          }
        }

        if (currentNode && currentNode.getBaseStreams) {
          var baseStreams = currentNode.getBaseStreams();
          var foundMissingData = false;

          for (var i = 0, ii = baseStreams.length; i < ii; i++) {
            var stream = baseStreams[i];

            if (stream.getMissingChunks && stream.getMissingChunks().length) {
              foundMissingData = true;
              pendingRequests.push({
                begin: stream.start,
                end: stream.end
              });
            }
          }

          if (foundMissingData) {
            nodesToRevisit.push(currentNode);
          }
        }

        addChildren(currentNode, nodesToVisit);
      }

      if (pendingRequests.length) {
        this.xref.stream.manager.requestRanges(pendingRequests).then(function () {
          for (var _i4 = 0, _ii3 = nodesToRevisit.length; _i4 < _ii3; _i4++) {
            var node = nodesToRevisit[_i4];

            if ((0, _primitives.isRef)(node)) {
              _this3.refSet.remove(node);
            }
          }

          _this3._walk(nodesToRevisit);
        }, this.capability.reject);
        return;
      }

      this.refSet = null;
      this.capability.resolve();
    }
  };
  return ObjectLoader;
}();

exports.ObjectLoader = ObjectLoader;