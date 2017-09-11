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
exports.PDFDocument = exports.Page = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _obj = require('./obj');

var _primitives = require('./primitives');

var _util = require('../shared/util');

var _stream = require('./stream');

var _evaluator = require('./evaluator');

var _annotation = require('./annotation');

var _crypto = require('./crypto');

var _parser = require('./parser');

var Page = function PageClosure() {
  var DEFAULT_USER_UNIT = 1.0;
  var LETTER_SIZE_MEDIABOX = [0, 0, 612, 792];
  function isAnnotationRenderable(annotation, intent) {
    return intent === 'display' && annotation.viewable || intent === 'print' && annotation.printable;
  }
  function Page(pdfManager, xref, pageIndex, pageDict, ref, fontCache, builtInCMapCache) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.evaluatorOptions = pdfManager.evaluatorOptions;
    this.resourcesPromise = null;
    var uniquePrefix = 'p' + this.pageIndex + '_';
    var idCounters = { obj: 0 };
    this.idFactory = {
      createObjId: function createObjId() {
        return uniquePrefix + ++idCounters.obj;
      }
    };
  }
  Page.prototype = {
    getPageProp: function Page_getPageProp(key) {
      return this.pageDict.get(key);
    },
    getInheritedPageProp: function Page_getInheritedPageProp(key, getArray) {
      var dict = this.pageDict,
          valueArray = null,
          loopCount = 0;
      var MAX_LOOP_COUNT = 100;
      getArray = getArray || false;
      while (dict) {
        var value = getArray ? dict.getArray(key) : dict.get(key);
        if (value !== undefined) {
          if (!valueArray) {
            valueArray = [];
          }
          valueArray.push(value);
        }
        if (++loopCount > MAX_LOOP_COUNT) {
          (0, _util.warn)('getInheritedPageProp: maximum loop count exceeded for ' + key);
          return valueArray ? valueArray[0] : undefined;
        }
        dict = dict.get('Parent');
      }
      if (!valueArray) {
        return undefined;
      }
      if (valueArray.length === 1 || !(0, _primitives.isDict)(valueArray[0])) {
        return valueArray[0];
      }
      return _primitives.Dict.merge(this.xref, valueArray);
    },
    get content() {
      return this.getPageProp('Contents');
    },
    get resources() {
      return (0, _util.shadow)(this, 'resources', this.getInheritedPageProp('Resources') || _primitives.Dict.empty);
    },
    get mediaBox() {
      var mediaBox = this.getInheritedPageProp('MediaBox', true);
      if (!Array.isArray(mediaBox) || mediaBox.length !== 4) {
        return (0, _util.shadow)(this, 'mediaBox', LETTER_SIZE_MEDIABOX);
      }
      return (0, _util.shadow)(this, 'mediaBox', mediaBox);
    },
    get cropBox() {
      var cropBox = this.getInheritedPageProp('CropBox', true);
      if (!Array.isArray(cropBox) || cropBox.length !== 4) {
        return (0, _util.shadow)(this, 'cropBox', this.mediaBox);
      }
      return (0, _util.shadow)(this, 'cropBox', cropBox);
    },
    get userUnit() {
      var obj = this.getPageProp('UserUnit');
      if (!(0, _util.isNum)(obj) || obj <= 0) {
        obj = DEFAULT_USER_UNIT;
      }
      return (0, _util.shadow)(this, 'userUnit', obj);
    },
    get view() {
      var mediaBox = this.mediaBox,
          cropBox = this.cropBox;
      if (mediaBox === cropBox) {
        return (0, _util.shadow)(this, 'view', mediaBox);
      }
      var intersection = _util.Util.intersect(cropBox, mediaBox);
      return (0, _util.shadow)(this, 'view', intersection || mediaBox);
    },
    get rotate() {
      var rotate = this.getInheritedPageProp('Rotate') || 0;
      if (rotate % 90 !== 0) {
        rotate = 0;
      } else if (rotate >= 360) {
        rotate = rotate % 360;
      } else if (rotate < 0) {
        rotate = (rotate % 360 + 360) % 360;
      }
      return (0, _util.shadow)(this, 'rotate', rotate);
    },
    getContentStream: function Page_getContentStream() {
      var content = this.content;
      var stream;
      if (Array.isArray(content)) {
        var xref = this.xref;
        var i,
            n = content.length;
        var streams = [];
        for (i = 0; i < n; ++i) {
          streams.push(xref.fetchIfRef(content[i]));
        }
        stream = new _stream.StreamsSequenceStream(streams);
      } else if ((0, _primitives.isStream)(content)) {
        stream = content;
      } else {
        stream = new _stream.NullStream();
      }
      return stream;
    },
    loadResources: function Page_loadResources(keys) {
      var _this = this;

      if (!this.resourcesPromise) {
        this.resourcesPromise = this.pdfManager.ensure(this, 'resources');
      }
      return this.resourcesPromise.then(function () {
        var objectLoader = new _obj.ObjectLoader(_this.resources, keys, _this.xref);
        return objectLoader.load();
      });
    },
    getOperatorList: function getOperatorList(_ref) {
      var _this2 = this;

      var handler = _ref.handler,
          task = _ref.task,
          intent = _ref.intent,
          renderInteractiveForms = _ref.renderInteractiveForms;

      var contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
      var resourcesPromise = this.loadResources(['ExtGState', 'ColorSpace', 'Pattern', 'Shading', 'XObject', 'Font']);
      var partialEvaluator = new _evaluator.PartialEvaluator({
        pdfManager: this.pdfManager,
        xref: this.xref,
        handler: handler,
        pageIndex: this.pageIndex,
        idFactory: this.idFactory,
        fontCache: this.fontCache,
        builtInCMapCache: this.builtInCMapCache,
        options: this.evaluatorOptions
      });
      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      var pageListPromise = dataPromises.then(function (_ref2) {
        var _ref3 = _slicedToArray(_ref2, 1),
            contentStream = _ref3[0];

        var opList = new _evaluator.OperatorList(intent, handler, _this2.pageIndex);
        handler.send('StartRenderPage', {
          transparency: partialEvaluator.hasBlendModes(_this2.resources),
          pageIndex: _this2.pageIndex,
          intent: intent
        });
        return partialEvaluator.getOperatorList({
          stream: contentStream,
          task: task,
          resources: _this2.resources,
          operatorList: opList
        }).then(function () {
          return opList;
        });
      });
      var annotationsPromise = this.pdfManager.ensure(this, 'annotations');
      return Promise.all([pageListPromise, annotationsPromise]).then(function (_ref4) {
        var _ref5 = _slicedToArray(_ref4, 2),
            pageOpList = _ref5[0],
            annotations = _ref5[1];

        if (annotations.length === 0) {
          pageOpList.flush(true);
          return pageOpList;
        }
        var i,
            ii,
            opListPromises = [];
        for (i = 0, ii = annotations.length; i < ii; i++) {
          if (isAnnotationRenderable(annotations[i], intent)) {
            opListPromises.push(annotations[i].getOperatorList(partialEvaluator, task, renderInteractiveForms));
          }
        }
        return Promise.all(opListPromises).then(function (opLists) {
          pageOpList.addOp(_util.OPS.beginAnnotations, []);
          for (i = 0, ii = opLists.length; i < ii; i++) {
            pageOpList.addOpList(opLists[i]);
          }
          pageOpList.addOp(_util.OPS.endAnnotations, []);
          pageOpList.flush(true);
          return pageOpList;
        });
      });
    },
    extractTextContent: function extractTextContent(_ref6) {
      var _this3 = this;

      var handler = _ref6.handler,
          task = _ref6.task,
          normalizeWhitespace = _ref6.normalizeWhitespace,
          sink = _ref6.sink,
          combineTextItems = _ref6.combineTextItems;

      var contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
      var resourcesPromise = this.loadResources(['ExtGState', 'XObject', 'Font']);
      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      return dataPromises.then(function (_ref7) {
        var _ref8 = _slicedToArray(_ref7, 1),
            contentStream = _ref8[0];

        var partialEvaluator = new _evaluator.PartialEvaluator({
          pdfManager: _this3.pdfManager,
          xref: _this3.xref,
          handler: handler,
          pageIndex: _this3.pageIndex,
          idFactory: _this3.idFactory,
          fontCache: _this3.fontCache,
          builtInCMapCache: _this3.builtInCMapCache,
          options: _this3.evaluatorOptions
        });
        return partialEvaluator.getTextContent({
          stream: contentStream,
          task: task,
          resources: _this3.resources,
          normalizeWhitespace: normalizeWhitespace,
          combineTextItems: combineTextItems,
          sink: sink
        });
      });
    },

    getAnnotationsData: function Page_getAnnotationsData(intent) {
      var annotations = this.annotations;
      var annotationsData = [];
      for (var i = 0, n = annotations.length; i < n; ++i) {
        if (!intent || isAnnotationRenderable(annotations[i], intent)) {
          annotationsData.push(annotations[i].data);
        }
      }
      return annotationsData;
    },
    get annotations() {
      var annotations = [];
      var annotationRefs = this.getInheritedPageProp('Annots') || [];
      for (var i = 0, n = annotationRefs.length; i < n; ++i) {
        var annotationRef = annotationRefs[i];
        var annotation = _annotation.AnnotationFactory.create(this.xref, annotationRef, this.pdfManager, this.idFactory);
        if (annotation) {
          annotations.push(annotation);
        }
      }
      return (0, _util.shadow)(this, 'annotations', annotations);
    }
  };
  return Page;
}();
var PDFDocument = function PDFDocumentClosure() {
  var FINGERPRINT_FIRST_BYTES = 1024;
  var EMPTY_FINGERPRINT = '\x00\x00\x00\x00\x00\x00\x00' + '\x00\x00\x00\x00\x00\x00\x00\x00\x00';
  function PDFDocument(pdfManager, arg) {
    var stream;
    if ((0, _primitives.isStream)(arg)) {
      stream = arg;
    } else if ((0, _util.isArrayBuffer)(arg)) {
      stream = new _stream.Stream(arg);
    } else {
      throw new Error('PDFDocument: Unknown argument type');
    }
    if (stream.length <= 0) {
      throw new Error('PDFDocument: stream must have data');
    }
    this.pdfManager = pdfManager;
    this.stream = stream;
    this.xref = new _obj.XRef(stream, pdfManager);
  }
  function find(stream, needle, limit, backwards) {
    var pos = stream.pos;
    var end = stream.end;
    var strBuf = [];
    if (pos + limit > end) {
      limit = end - pos;
    }
    for (var n = 0; n < limit; ++n) {
      strBuf.push(String.fromCharCode(stream.getByte()));
    }
    var str = strBuf.join('');
    stream.pos = pos;
    var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
    if (index === -1) {
      return false;
    }
    stream.pos += index;
    return true;
  }
  var DocumentInfoValidators = {
    get entries() {
      return (0, _util.shadow)(this, 'entries', {
        Title: _util.isString,
        Author: _util.isString,
        Subject: _util.isString,
        Keywords: _util.isString,
        Creator: _util.isString,
        Producer: _util.isString,
        CreationDate: _util.isString,
        ModDate: _util.isString,
        Trapped: _primitives.isName
      });
    }
  };
  PDFDocument.prototype = {
    parse: function PDFDocument_parse(recoveryMode) {
      this.setup(recoveryMode);
      var version = this.catalog.catDict.get('Version');
      if ((0, _primitives.isName)(version)) {
        this.pdfFormatVersion = version.name;
      }
      try {
        this.acroForm = this.catalog.catDict.get('AcroForm');
        if (this.acroForm) {
          this.xfa = this.acroForm.get('XFA');
          var fields = this.acroForm.get('Fields');
          if ((!fields || !Array.isArray(fields) || fields.length === 0) && !this.xfa) {
            this.acroForm = null;
          }
        }
      } catch (ex) {
        if (ex instanceof _util.MissingDataException) {
          throw ex;
        }
        (0, _util.info)('Something wrong with AcroForm entry');
        this.acroForm = null;
      }
    },
    get linearization() {
      var linearization = null;
      if (this.stream.length) {
        try {
          linearization = _parser.Linearization.create(this.stream);
        } catch (err) {
          if (err instanceof _util.MissingDataException) {
            throw err;
          }
          (0, _util.info)(err);
        }
      }
      return (0, _util.shadow)(this, 'linearization', linearization);
    },
    get startXRef() {
      var stream = this.stream;
      var startXRef = 0;
      var linearization = this.linearization;
      if (linearization) {
        stream.reset();
        if (find(stream, 'endobj', 1024)) {
          startXRef = stream.pos + 6;
        }
      } else {
        var step = 1024;
        var found = false,
            pos = stream.end;
        while (!found && pos > 0) {
          pos -= step - 'startxref'.length;
          if (pos < 0) {
            pos = 0;
          }
          stream.pos = pos;
          found = find(stream, 'startxref', step, true);
        }
        if (found) {
          stream.skip(9);
          var ch;
          do {
            ch = stream.getByte();
          } while ((0, _util.isSpace)(ch));
          var str = '';
          while (ch >= 0x20 && ch <= 0x39) {
            str += String.fromCharCode(ch);
            ch = stream.getByte();
          }
          startXRef = parseInt(str, 10);
          if (isNaN(startXRef)) {
            startXRef = 0;
          }
        }
      }
      return (0, _util.shadow)(this, 'startXRef', startXRef);
    },
    get mainXRefEntriesOffset() {
      var mainXRefEntriesOffset = 0;
      var linearization = this.linearization;
      if (linearization) {
        mainXRefEntriesOffset = linearization.mainXRefEntriesOffset;
      }
      return (0, _util.shadow)(this, 'mainXRefEntriesOffset', mainXRefEntriesOffset);
    },
    checkHeader: function PDFDocument_checkHeader() {
      var stream = this.stream;
      stream.reset();
      if (find(stream, '%PDF-', 1024)) {
        stream.moveStart();
        var MAX_VERSION_LENGTH = 12;
        var version = '',
            ch;
        while ((ch = stream.getByte()) > 0x20) {
          if (version.length >= MAX_VERSION_LENGTH) {
            break;
          }
          version += String.fromCharCode(ch);
        }
        if (!this.pdfFormatVersion) {
          this.pdfFormatVersion = version.substring(5);
        }
        return;
      }
    },
    parseStartXRef: function PDFDocument_parseStartXRef() {
      var startXRef = this.startXRef;
      this.xref.setStartXRef(startXRef);
    },
    setup: function PDFDocument_setup(recoveryMode) {
      var _this4 = this;

      this.xref.parse(recoveryMode);
      var pageFactory = {
        createPage: function createPage(pageIndex, dict, ref, fontCache, builtInCMapCache) {
          return new Page(_this4.pdfManager, _this4.xref, pageIndex, dict, ref, fontCache, builtInCMapCache);
        }
      };
      this.catalog = new _obj.Catalog(this.pdfManager, this.xref, pageFactory);
    },
    get numPages() {
      var linearization = this.linearization;
      var num = linearization ? linearization.numPages : this.catalog.numPages;
      return (0, _util.shadow)(this, 'numPages', num);
    },
    get documentInfo() {
      var docInfo = {
        PDFFormatVersion: this.pdfFormatVersion,
        IsAcroFormPresent: !!this.acroForm,
        IsXFAPresent: !!this.xfa
      };
      var infoDict;
      try {
        infoDict = this.xref.trailer.get('Info');
      } catch (err) {
        if (err instanceof _util.MissingDataException) {
          throw err;
        }
        (0, _util.info)('The document information dictionary is invalid.');
      }
      if (infoDict) {
        var validEntries = DocumentInfoValidators.entries;
        for (var key in validEntries) {
          if (infoDict.has(key)) {
            var value = infoDict.get(key);
            if (validEntries[key](value)) {
              docInfo[key] = typeof value !== 'string' ? value : (0, _util.stringToPDFString)(value);
            } else {
              (0, _util.info)('Bad value in document info for "' + key + '"');
            }
          }
        }
      }
      return (0, _util.shadow)(this, 'documentInfo', docInfo);
    },
    get fingerprint() {
      var xref = this.xref,
          hash,
          fileID = '';
      var idArray = xref.trailer.get('ID');
      if (Array.isArray(idArray) && idArray[0] && (0, _util.isString)(idArray[0]) && idArray[0] !== EMPTY_FINGERPRINT) {
        hash = (0, _util.stringToBytes)(idArray[0]);
      } else {
        if (this.stream.ensureRange) {
          this.stream.ensureRange(0, Math.min(FINGERPRINT_FIRST_BYTES, this.stream.end));
        }
        hash = (0, _crypto.calculateMD5)(this.stream.bytes.subarray(0, FINGERPRINT_FIRST_BYTES), 0, FINGERPRINT_FIRST_BYTES);
      }
      for (var i = 0, n = hash.length; i < n; i++) {
        var hex = hash[i].toString(16);
        fileID += hex.length === 1 ? '0' + hex : hex;
      }
      return (0, _util.shadow)(this, 'fingerprint', fileID);
    },
    getPage: function PDFDocument_getPage(pageIndex) {
      return this.catalog.getPage(pageIndex);
    },
    cleanup: function PDFDocument_cleanup() {
      return this.catalog.cleanup();
    }
  };
  return PDFDocument;
}();
exports.Page = Page;
exports.PDFDocument = PDFDocument;