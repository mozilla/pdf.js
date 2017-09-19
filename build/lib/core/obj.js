/* Copyright 2017 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileSpec = exports.XRef = exports.ObjectLoader = exports.Catalog = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _util = require('../shared/util');

var _primitives = require('./primitives');

var _parser = require('./parser');

var _chunked_stream = require('./chunked_stream');

var _crypto = require('./crypto');

var _colorspace = require('./colorspace');

var Catalog = function CatalogClosure() {
  function Catalog(pdfManager, xref, pageFactory) {
    this.pdfManager = pdfManager;
    this.xref = xref;
    this.catDict = xref.getCatalogObj();
    if (!(0, _primitives.isDict)(this.catDict)) {
      throw new _util.FormatError('catalog object is not a dictionary');
    }
    this.fontCache = new _primitives.RefSetCache();
    this.builtInCMapCache = Object.create(null);
    this.pageKidsCountCache = new _primitives.RefSetCache();
    this.pageFactory = pageFactory;
    this.pagePromises = [];
  }
  Catalog.prototype = {
    get metadata() {
      var streamRef = this.catDict.getRaw('Metadata');
      if (!(0, _primitives.isRef)(streamRef)) {
        return (0, _util.shadow)(this, 'metadata', null);
      }
      var encryptMetadata = !this.xref.encrypt ? false : this.xref.encrypt.encryptMetadata;
      var stream = this.xref.fetch(streamRef, !encryptMetadata);
      var metadata;
      if (stream && (0, _primitives.isDict)(stream.dict)) {
        var type = stream.dict.get('Type');
        var subtype = stream.dict.get('Subtype');
        if ((0, _primitives.isName)(type, 'Metadata') && (0, _primitives.isName)(subtype, 'XML')) {
          try {
            metadata = (0, _util.stringToUTF8String)((0, _util.bytesToString)(stream.getBytes()));
          } catch (e) {
            if (e instanceof _util.MissingDataException) {
              throw e;
            }
            (0, _util.info)('Skipping invalid metadata.');
          }
        }
      }
      return (0, _util.shadow)(this, 'metadata', metadata);
    },
    get toplevelPagesDict() {
      var pagesObj = this.catDict.get('Pages');
      if (!(0, _primitives.isDict)(pagesObj)) {
        throw new _util.FormatError('invalid top-level pages dictionary');
      }
      return (0, _util.shadow)(this, 'toplevelPagesDict', pagesObj);
    },
    get documentOutline() {
      var obj = null;
      try {
        obj = this.readDocumentOutline();
      } catch (ex) {
        if (ex instanceof _util.MissingDataException) {
          throw ex;
        }
        (0, _util.warn)('Unable to read document outline');
      }
      return (0, _util.shadow)(this, 'documentOutline', obj);
    },
    readDocumentOutline: function Catalog_readDocumentOutline() {
      var obj = this.catDict.get('Outlines');
      if (!(0, _primitives.isDict)(obj)) {
        return null;
      }
      obj = obj.getRaw('First');
      if (!(0, _primitives.isRef)(obj)) {
        return null;
      }
      var root = { items: [] };
      var queue = [{
        obj: obj,
        parent: root
      }];
      var processed = new _primitives.RefSet();
      processed.put(obj);
      var xref = this.xref,
          blackColor = new Uint8Array(3);
      while (queue.length > 0) {
        var i = queue.shift();
        var outlineDict = xref.fetchIfRef(i.obj);
        if (outlineDict === null) {
          continue;
        }
        if (!outlineDict.has('Title')) {
          throw new _util.FormatError('Invalid outline item');
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
        var color = outlineDict.getArray('C'),
            rgbColor = blackColor;
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
          count: outlineDict.get('Count'),
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
    },
    get numPages() {
      var obj = this.toplevelPagesDict.get('Count');
      if (!Number.isInteger(obj)) {
        throw new _util.FormatError('page count in top level pages object is not an integer');
      }
      return (0, _util.shadow)(this, 'numPages', obj);
    },
    get destinations() {
      function fetchDestination(dest) {
        return (0, _primitives.isDict)(dest) ? dest.get('D') : dest;
      }
      var xref = this.xref;
      var dests = {},
          nameTreeRef,
          nameDictionaryRef;
      var obj = this.catDict.get('Names');
      if (obj && obj.has('Dests')) {
        nameTreeRef = obj.getRaw('Dests');
      } else if (this.catDict.has('Dests')) {
        nameDictionaryRef = this.catDict.get('Dests');
      }
      if (nameDictionaryRef) {
        obj = nameDictionaryRef;
        obj.forEach(function catalogForEach(key, value) {
          if (!value) {
            return;
          }
          dests[key] = fetchDestination(value);
        });
      }
      if (nameTreeRef) {
        var nameTree = new NameTree(nameTreeRef, xref);
        var names = nameTree.getAll();
        for (var name in names) {
          dests[name] = fetchDestination(names[name]);
        }
      }
      return (0, _util.shadow)(this, 'destinations', dests);
    },
    getDestination: function Catalog_getDestination(destinationId) {
      function fetchDestination(dest) {
        return (0, _primitives.isDict)(dest) ? dest.get('D') : dest;
      }
      var xref = this.xref;
      var dest = null,
          nameTreeRef,
          nameDictionaryRef;
      var obj = this.catDict.get('Names');
      if (obj && obj.has('Dests')) {
        nameTreeRef = obj.getRaw('Dests');
      } else if (this.catDict.has('Dests')) {
        nameDictionaryRef = this.catDict.get('Dests');
      }
      if (nameDictionaryRef) {
        var value = nameDictionaryRef.get(destinationId);
        if (value) {
          dest = fetchDestination(value);
        }
      }
      if (nameTreeRef) {
        var nameTree = new NameTree(nameTreeRef, xref);
        dest = fetchDestination(nameTree.get(destinationId));
      }
      return dest;
    },
    get pageLabels() {
      var obj = null;
      try {
        obj = this.readPageLabels();
      } catch (ex) {
        if (ex instanceof _util.MissingDataException) {
          throw ex;
        }
        (0, _util.warn)('Unable to read page labels.');
      }
      return (0, _util.shadow)(this, 'pageLabels', obj);
    },
    readPageLabels: function Catalog_readPageLabels() {
      var obj = this.catDict.getRaw('PageLabels');
      if (!obj) {
        return null;
      }
      var pageLabels = new Array(this.numPages);
      var style = null;
      var prefix = '';
      var numberTree = new NumberTree(obj, this.xref);
      var nums = numberTree.getAll();
      var currentLabel = '',
          currentIndex = 1;
      for (var i = 0, ii = this.numPages; i < ii; i++) {
        if (i in nums) {
          var labelDict = nums[i];
          if (!(0, _primitives.isDict)(labelDict)) {
            throw new _util.FormatError('The PageLabel is not a dictionary.');
          }
          var type = labelDict.get('Type');
          if (type && !(0, _primitives.isName)(type, 'PageLabel')) {
            throw new _util.FormatError('Invalid type in PageLabel dictionary.');
          }
          var s = labelDict.get('S');
          if (s && !(0, _primitives.isName)(s)) {
            throw new _util.FormatError('Invalid style in PageLabel dictionary.');
          }
          style = s ? s.name : null;
          var p = labelDict.get('P');
          if (p && !(0, _util.isString)(p)) {
            throw new _util.FormatError('Invalid prefix in PageLabel dictionary.');
          }
          prefix = p ? (0, _util.stringToPDFString)(p) : '';
          var st = labelDict.get('St');
          if (st && !(Number.isInteger(st) && st >= 1)) {
            throw new _util.FormatError('Invalid start in PageLabel dictionary.');
          }
          currentIndex = st || 1;
        }
        switch (style) {
          case 'D':
            currentLabel = currentIndex;
            break;
          case 'R':
          case 'r':
            currentLabel = _util.Util.toRoman(currentIndex, style === 'r');
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
              throw new _util.FormatError('Invalid style "' + style + '" in PageLabel dictionary.');
            }
        }
        pageLabels[i] = prefix + currentLabel;
        currentLabel = '';
        currentIndex++;
      }
      return pageLabels;
    },
    get pageMode() {
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
    },
    get attachments() {
      var xref = this.xref;
      var attachments = null,
          nameTreeRef;
      var obj = this.catDict.get('Names');
      if (obj) {
        nameTreeRef = obj.getRaw('EmbeddedFiles');
      }
      if (nameTreeRef) {
        var nameTree = new NameTree(nameTreeRef, xref);
        var names = nameTree.getAll();
        for (var name in names) {
          var fs = new FileSpec(names[name], xref);
          if (!attachments) {
            attachments = Object.create(null);
          }
          attachments[(0, _util.stringToPDFString)(name)] = fs.serializable;
        }
      }
      return (0, _util.shadow)(this, 'attachments', attachments);
    },
    get javaScript() {
      var xref = this.xref;
      var obj = this.catDict.get('Names');
      var javaScript = [];
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
        javaScript.push((0, _util.stringToPDFString)(js));
      }
      if (obj && obj.has('JavaScript')) {
        var nameTree = new NameTree(obj.getRaw('JavaScript'), xref);
        var names = nameTree.getAll();
        for (var name in names) {
          var jsDict = names[name];
          if ((0, _primitives.isDict)(jsDict)) {
            appendIfJavaScriptDict(jsDict);
          }
        }
      }
      var openactionDict = this.catDict.get('OpenAction');
      if ((0, _primitives.isDict)(openactionDict, 'Action')) {
        var actionType = openactionDict.get('S');
        if ((0, _primitives.isName)(actionType, 'Named')) {
          var action = openactionDict.get('N');
          if ((0, _primitives.isName)(action, 'Print')) {
            javaScript.push('print({});');
          }
        } else {
          appendIfJavaScriptDict(openactionDict);
        }
      }
      return (0, _util.shadow)(this, 'javaScript', javaScript);
    },
    cleanup: function Catalog_cleanup() {
      var _this = this;

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
        _this.builtInCMapCache = Object.create(null);
      });
    },
    getPage: function Catalog_getPage(pageIndex) {
      var _this2 = this;

      if (!(pageIndex in this.pagePromises)) {
        this.pagePromises[pageIndex] = this.getPageDict(pageIndex).then(function (_ref) {
          var _ref2 = _slicedToArray(_ref, 2),
              dict = _ref2[0],
              ref = _ref2[1];

          return _this2.pageFactory.createPage(pageIndex, dict, ref, _this2.fontCache, _this2.builtInCMapCache);
        });
      }
      return this.pagePromises[pageIndex];
    },
    getPageDict: function Catalog_getPageDict(pageIndex) {
      var capability = (0, _util.createPromiseCapability)();
      var nodesToVisit = [this.catDict.getRaw('Pages')];
      var count,
          currentPageIndex = 0;
      var xref = this.xref,
          pageKidsCountCache = this.pageKidsCountCache;
      function next() {
        while (nodesToVisit.length) {
          var currentNode = nodesToVisit.pop();
          if ((0, _primitives.isRef)(currentNode)) {
            count = pageKidsCountCache.get(currentNode);
            if (count > 0 && currentPageIndex + count < pageIndex) {
              currentPageIndex += count;
              continue;
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
            return;
          }
          if (!(0, _primitives.isDict)(currentNode)) {
            capability.reject(new _util.FormatError('page dictionary kid reference points to wrong type of object'));
            return;
          }
          count = currentNode.get('Count');
          var objId = currentNode.objId;
          if (objId && !pageKidsCountCache.has(objId)) {
            pageKidsCountCache.put(objId, count);
          }
          if (currentPageIndex + count <= pageIndex) {
            currentPageIndex += count;
            continue;
          }
          var kids = currentNode.get('Kids');
          if (!Array.isArray(kids)) {
            capability.reject(new _util.FormatError('page dictionary kids object is not an array'));
            return;
          }
          for (var last = kids.length - 1; last >= 0; last--) {
            nodesToVisit.push(kids[last]);
          }
        }
        capability.reject(new Error('Page index ' + pageIndex + ' not found.'));
      }
      next();
      return capability.promise;
    },
    getPageIndex: function Catalog_getPageIndex(pageRef) {
      var xref = this.xref;
      function pagesBeforeRef(kidRef) {
        var total = 0;
        var parentRef;
        return xref.fetchAsync(kidRef).then(function (node) {
          if ((0, _primitives.isRefsEqual)(kidRef, pageRef) && !(0, _primitives.isDict)(node, 'Page') && !((0, _primitives.isDict)(node) && !node.has('Type') && node.has('Contents'))) {
            throw new _util.FormatError('The reference does not point to a /Page Dict.');
          }
          if (!node) {
            return null;
          }
          if (!(0, _primitives.isDict)(node)) {
            throw new _util.FormatError('node must be a Dict.');
          }
          parentRef = node.getRaw('Parent');
          return node.getAsync('Parent');
        }).then(function (parent) {
          if (!parent) {
            return null;
          }
          if (!(0, _primitives.isDict)(parent)) {
            throw new _util.FormatError('parent must be a Dict.');
          }
          return parent.getAsync('Kids');
        }).then(function (kids) {
          if (!kids) {
            return null;
          }
          var kidPromises = [];
          var found = false;
          for (var i = 0; i < kids.length; i++) {
            var kid = kids[i];
            if (!(0, _primitives.isRef)(kid)) {
              throw new _util.FormatError('kid must be a Ref.');
            }
            if (kid.num === kidRef.num) {
              found = true;
              break;
            }
            kidPromises.push(xref.fetchAsync(kid).then(function (kid) {
              if (kid.has('Count')) {
                var count = kid.get('Count');
                total += count;
              } else {
                total++;
              }
            }));
          }
          if (!found) {
            throw new _util.FormatError('kid ref not found in parents kids');
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
          var count = args[0];
          var parentRef = args[1];
          total += count;
          return next(parentRef);
        });
      }
      return next(pageRef);
    }
  };
  Catalog.parseDestDictionary = function Catalog_parseDestDictionary(params) {
    function addDefaultProtocolToUrl(url) {
      if (url.indexOf('www.') === 0) {
        return 'http://' + url;
      }
      return url;
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
      (0, _util.warn)('parseDestDictionary: "destDict" must be a dictionary.');
      return;
    }
    var resultObj = params.resultObj;
    if ((typeof resultObj === 'undefined' ? 'undefined' : _typeof(resultObj)) !== 'object') {
      (0, _util.warn)('parseDestDictionary: "resultObj" must be an object.');
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
          var jsAction = action.get('JS'),
              js;
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
          (0, _util.warn)('parseDestDictionary: Unsupported Action type "' + actionName + '".');
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
  };
  return Catalog;
}();
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
      var encrypt = trailerDict.get('Encrypt');
      if ((0, _primitives.isDict)(encrypt)) {
        var ids = trailerDict.get('ID');
        var fileId = ids && ids.length ? ids[0] : '';
        encrypt.suppressEncryption = true;
        this.encrypt = new _crypto.CipherTransformFactory(encrypt, fileId, this.pdfManager.password);
      }
      if (!(this.root = trailerDict.get('Root'))) {
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
            throw new _util.FormatError('Invalid entry in XRef subsection: ' + first + ', ' + count);
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
          throw new _util.FormatError('Invalid XRef range fields: ' + first + ', ' + n);
        }
        if (!Number.isInteger(typeFieldWidth) || !Number.isInteger(offsetFieldWidth) || !Number.isInteger(generationFieldWidth)) {
          throw new _util.FormatError('Invalid XRef entry fields length: ' + first + ', ' + n);
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
              throw new _util.FormatError('Invalid XRef entry type: ' + type);
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
      var trailerBytes = new Uint8Array([116, 114, 97, 105, 108, 101, 114]);
      var startxrefBytes = new Uint8Array([115, 116, 97, 114, 116, 120, 114, 101, 102]);
      var endobjBytes = new Uint8Array([101, 110, 100, 111, 98, 106]);
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
        if (token.indexOf('xref') === 0 && (token.length === 4 || /\s/.test(token[4]))) {
          position += skipUntil(buffer, position, trailerBytes);
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else if (m = objRegExp.exec(token)) {
          if (typeof this.entries[m[1]] === 'undefined') {
            this.entries[m[1]] = {
              offset: position - stream.start,
              gen: m[2] | 0,
              uncompressed: true
            };
          }
          var contentLength = skipUntil(buffer, position, endobjBytes) + 7;
          var content = buffer.subarray(position, position + contentLength);
          var xrefTagOffset = skipUntil(content, 0, xrefBytes);
          if (xrefTagOffset < contentLength && content[xrefTagOffset + 5] < 64) {
            xrefStms.push(position - stream.start);
            this.xrefstms[position - stream.start] = 1;
          }
          position += contentLength;
        } else if (token.indexOf('trailer') === 0 && (token.length === 7 || /\s/.test(token[7]))) {
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
      var dict;
      for (i = 0, ii = trailers.length; i < ii; ++i) {
        stream.pos = trailers[i];
        var parser = new _parser.Parser(new _parser.Lexer(stream), true, this, true);
        var obj = parser.getObj();
        if (!(0, _primitives.isCmd)(obj, 'trailer')) {
          continue;
        }
        dict = parser.getObj();
        if (!(0, _primitives.isDict)(dict)) {
          continue;
        }
        if (dict.has('ID')) {
          return dict;
        }
      }
      if (dict) {
        return dict;
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
        if (e instanceof _util.MissingDataException) {
          throw e;
        }
        (0, _util.info)('(while reading XRef): ' + e);
      }
      if (recoveryMode) {
        return;
      }
      throw new _util.XRefParseException();
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
        xrefEntry = this.fetchCompressed(xrefEntry, suppressEncryption);
      }
      if ((0, _primitives.isDict)(xrefEntry)) {
        xrefEntry.objId = ref.toString();
      } else if ((0, _primitives.isStream)(xrefEntry)) {
        xrefEntry.dict.objId = ref.toString();
      }
      return xrefEntry;
    },
    fetchUncompressed: function XRef_fetchUncompressed(ref, xrefEntry, suppressEncryption) {
      var gen = ref.gen;
      var num = ref.num;
      if (xrefEntry.gen !== gen) {
        throw new _util.FormatError('inconsistent generation in XRef');
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
        throw new _util.FormatError('bad XRef entry');
      }
      if (obj3.cmd !== 'obj') {
        if (obj3.cmd.indexOf('obj') === 0) {
          num = parseInt(obj3.cmd.substring(3), 10);
          if (!Number.isNaN(num)) {
            return num;
          }
        }
        throw new _util.FormatError('bad XRef entry');
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
    fetchCompressed: function XRef_fetchCompressed(xrefEntry, suppressEncryption) {
      var tableOffset = xrefEntry.offset;
      var stream = this.fetch(new _primitives.Ref(tableOffset, 0));
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
          throw new _util.FormatError('invalid object number in the ObjStm stream: ' + num);
        }
        nums.push(num);
        var offset = parser.getObj();
        if (!Number.isInteger(offset)) {
          throw new _util.FormatError('invalid object offset in the ObjStm stream: ' + offset);
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
        throw new _util.FormatError('bad XRef entry for compressed object');
      }
      return xrefEntry;
    },
    fetchIfRefAsync: function XRef_fetchIfRefAsync(obj, suppressEncryption) {
      if (!(0, _primitives.isRef)(obj)) {
        return Promise.resolve(obj);
      }
      return this.fetchAsync(obj, suppressEncryption);
    },
    fetchAsync: function XRef_fetchAsync(ref, suppressEncryption) {
      var streamManager = this.stream.manager;
      var xref = this;
      return new Promise(function tryFetch(resolve, reject) {
        try {
          resolve(xref.fetch(ref, suppressEncryption));
        } catch (e) {
          if (e instanceof _util.MissingDataException) {
            streamManager.requestRange(e.begin, e.end).then(function () {
              tryFetch(resolve, reject);
            }, reject);
            return;
          }
          reject(e);
        }
      });
    },
    getCatalogObj: function XRef_getCatalogObj() {
      return this.root;
    }
  };
  return XRef;
}();
var NameOrNumberTree = function NameOrNumberTreeClosure() {
  function NameOrNumberTree(root, xref) {
    throw new Error('Cannot initialize NameOrNumberTree.');
  }
  NameOrNumberTree.prototype = {
    getAll: function NameOrNumberTree_getAll() {
      var dict = Object.create(null);
      if (!this.root) {
        return dict;
      }
      var xref = this.xref;
      var processed = new _primitives.RefSet();
      processed.put(this.root);
      var queue = [this.root];
      while (queue.length > 0) {
        var i, n;
        var obj = xref.fetchIfRef(queue.shift());
        if (!(0, _primitives.isDict)(obj)) {
          continue;
        }
        if (obj.has('Kids')) {
          var kids = obj.get('Kids');
          for (i = 0, n = kids.length; i < n; i++) {
            var kid = kids[i];
            if (processed.has(kid)) {
              throw new _util.FormatError('Duplicate entry in "' + this._type + '" tree.');
            }
            queue.push(kid);
            processed.put(kid);
          }
          continue;
        }
        var entries = obj.get(this._type);
        if (Array.isArray(entries)) {
          for (i = 0, n = entries.length; i < n; i += 2) {
            dict[xref.fetchIfRef(entries[i])] = xref.fetchIfRef(entries[i + 1]);
          }
        }
      }
      return dict;
    },
    get: function NameOrNumberTree_get(key) {
      if (!this.root) {
        return null;
      }
      var xref = this.xref;
      var kidsOrEntries = xref.fetchIfRef(this.root);
      var loopCount = 0;
      var MAX_LEVELS = 10;
      var l, r, m;
      while (kidsOrEntries.has('Kids')) {
        if (++loopCount > MAX_LEVELS) {
          (0, _util.warn)('Search depth limit reached for "' + this._type + '" tree.');
          return null;
        }
        var kids = kidsOrEntries.get('Kids');
        if (!Array.isArray(kids)) {
          return null;
        }
        l = 0;
        r = kids.length - 1;
        while (l <= r) {
          m = l + r >> 1;
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
        l = 0;
        r = entries.length - 2;
        while (l <= r) {
          m = l + r & ~1;
          var currentKey = xref.fetchIfRef(entries[m]);
          if (key < currentKey) {
            r = m - 2;
          } else if (key > currentKey) {
            l = m + 2;
          } else {
            return xref.fetchIfRef(entries[m + 1]);
          }
        }
      }
      return null;
    }
  };
  return NameOrNumberTree;
}();
var NameTree = function NameTreeClosure() {
  function NameTree(root, xref) {
    this.root = root;
    this.xref = xref;
    this._type = 'Names';
  }
  _util.Util.inherit(NameTree, NameOrNumberTree, {});
  return NameTree;
}();
var NumberTree = function NumberTreeClosure() {
  function NumberTree(root, xref) {
    this.root = root;
    this.xref = xref;
    this._type = 'Nums';
  }
  _util.Util.inherit(NumberTree, NameOrNumberTree, {});
  return NumberTree;
}();
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
      for (var _i = 0, _ii = node.length; _i < _ii; _i++) {
        var value = node[_i];
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
            if (!(ex instanceof _util.MissingDataException)) {
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
          for (var _i2 = 0, _ii2 = nodesToRevisit.length; _i2 < _ii2; _i2++) {
            var node = nodesToRevisit[_i2];
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
exports.Catalog = Catalog;
exports.ObjectLoader = ObjectLoader;
exports.XRef = XRef;
exports.FileSpec = FileSpec;