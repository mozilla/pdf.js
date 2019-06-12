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
exports.PDFDocument = exports.Page = void 0;

var _util = require("../shared/util");

var _obj = require("./obj");

var _primitives = require("./primitives");

var _core_utils = require("./core_utils");

var _stream2 = require("./stream");

var _annotation = require("./annotation");

var _crypto = require("./crypto");

var _parser = require("./parser");

var _operator_list = require("./operator_list");

var _evaluator = require("./evaluator");

var _function = require("./function");

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var DEFAULT_USER_UNIT = 1.0;
var LETTER_SIZE_MEDIABOX = [0, 0, 612, 792];

function isAnnotationRenderable(annotation, intent) {
  return intent === 'display' && annotation.viewable || intent === 'print' && annotation.printable;
}

function isAnnotationRemoved(annotationsForRemoval, annotation) {
  if (!annotation || !annotation.data.annotationType) {
    return;
  }

  var data = annotation.data;
  return annotationsForRemoval.some(function (itm) {
    return itm === data.annotationType || itm === data.fieldType || itm === 'STx' && data.annotationType === 20 && data.fieldType === 'Tx' && !data.multiLine || itm === 'MTx' && data.annotationType === 20 && data.fieldType === 'Tx' && data.multiLine || itm === 'ABtn' && data.annotationType === 20 && data.fieldType === 'Btn' && !data.radioButton && !data.checkBox || itm === 'CBtn' && data.annotationType === 20 && data.fieldType === 'Btn' && data.checkBox || itm === 'RBtn' && data.annotationType === 20 && data.fieldType === 'Btn' && data.radioButton || itm === 'CCh' && data.annotationType === 20 && data.fieldType === 'Ch' && data.combo || itm === 'LCh' && data.annotationType === 20 && data.fieldType === 'Ch' && !data.combo;
  });
}

var Page =
/*#__PURE__*/
function () {
  function Page(_ref) {
    var pdfManager = _ref.pdfManager,
        xref = _ref.xref,
        pageIndex = _ref.pageIndex,
        pageDict = _ref.pageDict,
        ref = _ref.ref,
        fontCache = _ref.fontCache,
        builtInCMapCache = _ref.builtInCMapCache,
        pdfFunctionFactory = _ref.pdfFunctionFactory;

    _classCallCheck(this, Page);

    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.pdfFunctionFactory = pdfFunctionFactory;
    this.evaluatorOptions = pdfManager.evaluatorOptions;
    this.resourcesPromise = null;
    var idCounters = {
      obj: 0
    };
    this.idFactory = {
      createObjId: function createObjId() {
        return "p".concat(pageIndex, "_").concat(++idCounters.obj);
      },
      getDocId: function getDocId() {
        return "g_".concat(pdfManager.docId);
      }
    };
  }

  _createClass(Page, [{
    key: "_getInheritableProperty",
    value: function _getInheritableProperty(key) {
      var getArray = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var value = (0, _core_utils.getInheritableProperty)({
        dict: this.pageDict,
        key: key,
        getArray: getArray,
        stopWhenFound: false
      });

      if (!Array.isArray(value)) {
        return value;
      }

      if (value.length === 1 || !(0, _primitives.isDict)(value[0])) {
        return value[0];
      }

      return _primitives.Dict.merge(this.xref, value);
    }
  }, {
    key: "getContentStream",
    value: function getContentStream() {
      var content = this.content;
      var stream;

      if (Array.isArray(content)) {
        var xref = this.xref;
        var streams = [];
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = content[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _stream = _step.value;
            streams.push(xref.fetchIfRef(_stream));
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

        stream = new _stream2.StreamsSequenceStream(streams);
      } else if ((0, _primitives.isStream)(content)) {
        stream = content;
      } else {
        stream = new _stream2.NullStream();
      }

      return stream;
    }
  }, {
    key: "loadResources",
    value: function loadResources(keys) {
      var _this = this;

      if (!this.resourcesPromise) {
        this.resourcesPromise = this.pdfManager.ensure(this, 'resources');
      }

      return this.resourcesPromise.then(function () {
        var objectLoader = new _obj.ObjectLoader(_this.resources, keys, _this.xref);
        return objectLoader.load();
      });
    }
  }, {
    key: "getOperatorList",
    value: function getOperatorList(_ref2) {
      var _this2 = this;

      var handler = _ref2.handler,
          task = _ref2.task,
          intent = _ref2.intent,
          renderInteractiveForms = _ref2.renderInteractiveForms,
          annotationsNotRendered = _ref2.annotationsNotRendered;
      var contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
      var resourcesPromise = this.loadResources(['ExtGState', 'ColorSpace', 'Pattern', 'Shading', 'XObject', 'Font']);
      var partialEvaluator = new _evaluator.PartialEvaluator({
        xref: this.xref,
        handler: handler,
        pageIndex: this.pageIndex,
        idFactory: this.idFactory,
        fontCache: this.fontCache,
        builtInCMapCache: this.builtInCMapCache,
        options: this.evaluatorOptions,
        pdfFunctionFactory: this.pdfFunctionFactory
      });
      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      var pageListPromise = dataPromises.then(function (_ref3) {
        var _ref4 = _slicedToArray(_ref3, 1),
            contentStream = _ref4[0];

        var opList = new _operator_list.OperatorList(intent, handler, _this2.pageIndex);
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
      return Promise.all([pageListPromise, this._parsedAnnotations]).then(function (_ref5) {
        var _ref6 = _slicedToArray(_ref5, 2),
            pageOpList = _ref6[0],
            annotations = _ref6[1];

        if (annotations.length === 0) {
          pageOpList.flush(true);
          return pageOpList;
        }

        var i,
            ii,
            opListPromises = [];

        for (i = 0, ii = annotations.length; i < ii; i++) {
          if (Array.isArray(annotationsNotRendered) && isAnnotationRemoved(annotationsNotRendered, annotations[i])) {
            continue;
          } else if (isAnnotationRenderable(annotations[i], intent)) {
            opListPromises.push(annotations[i].getOperatorList(partialEvaluator, task, renderInteractiveForms));
          }
        }

        return Promise.all(opListPromises).then(function (opLists) {
          pageOpList.addOp(_util.OPS.beginAnnotations, []);
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = opLists[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var opList = _step2.value;
              pageOpList.addOpList(opList);
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
                _iterator2["return"]();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }

          pageOpList.addOp(_util.OPS.endAnnotations, []);
          pageOpList.flush(true);
          return pageOpList;
        });
      });
    }
  }, {
    key: "extractTextContent",
    value: function extractTextContent(_ref7) {
      var _this3 = this;

      var handler = _ref7.handler,
          task = _ref7.task,
          normalizeWhitespace = _ref7.normalizeWhitespace,
          sink = _ref7.sink,
          combineTextItems = _ref7.combineTextItems;
      var contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
      var resourcesPromise = this.loadResources(['ExtGState', 'XObject', 'Font']);
      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      return dataPromises.then(function (_ref8) {
        var _ref9 = _slicedToArray(_ref8, 1),
            contentStream = _ref9[0];

        var partialEvaluator = new _evaluator.PartialEvaluator({
          xref: _this3.xref,
          handler: handler,
          pageIndex: _this3.pageIndex,
          idFactory: _this3.idFactory,
          fontCache: _this3.fontCache,
          builtInCMapCache: _this3.builtInCMapCache,
          options: _this3.evaluatorOptions,
          pdfFunctionFactory: _this3.pdfFunctionFactory
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
    }
  }, {
    key: "getAnnotationsData",
    value: function getAnnotationsData(intent) {
      return this._parsedAnnotations.then(function (annotations) {
        var annotationsData = [];

        for (var i = 0, ii = annotations.length; i < ii; i++) {
          if (!intent || isAnnotationRenderable(annotations[i], intent)) {
            annotationsData.push(annotations[i].data);
          }
        }

        return annotationsData;
      });
    }
  }, {
    key: "content",
    get: function get() {
      return this.pageDict.get('Contents');
    }
  }, {
    key: "resources",
    get: function get() {
      return (0, _util.shadow)(this, 'resources', this._getInheritableProperty('Resources') || _primitives.Dict.empty);
    }
  }, {
    key: "mediaBox",
    get: function get() {
      var mediaBox = this._getInheritableProperty('MediaBox', true);

      if (!Array.isArray(mediaBox) || mediaBox.length !== 4) {
        return (0, _util.shadow)(this, 'mediaBox', LETTER_SIZE_MEDIABOX);
      }

      return (0, _util.shadow)(this, 'mediaBox', mediaBox);
    }
  }, {
    key: "cropBox",
    get: function get() {
      var cropBox = this._getInheritableProperty('CropBox', true);

      if (!Array.isArray(cropBox) || cropBox.length !== 4) {
        return (0, _util.shadow)(this, 'cropBox', this.mediaBox);
      }

      return (0, _util.shadow)(this, 'cropBox', cropBox);
    }
  }, {
    key: "userUnit",
    get: function get() {
      var obj = this.pageDict.get('UserUnit');

      if (!(0, _util.isNum)(obj) || obj <= 0) {
        obj = DEFAULT_USER_UNIT;
      }

      return (0, _util.shadow)(this, 'userUnit', obj);
    }
  }, {
    key: "view",
    get: function get() {
      var mediaBox = this.mediaBox,
          cropBox = this.cropBox;

      if (mediaBox === cropBox) {
        return (0, _util.shadow)(this, 'view', mediaBox);
      }

      var intersection = _util.Util.intersect(cropBox, mediaBox);

      return (0, _util.shadow)(this, 'view', intersection || mediaBox);
    }
  }, {
    key: "rotate",
    get: function get() {
      var rotate = this._getInheritableProperty('Rotate') || 0;

      if (rotate % 90 !== 0) {
        rotate = 0;
      } else if (rotate >= 360) {
        rotate = rotate % 360;
      } else if (rotate < 0) {
        rotate = (rotate % 360 + 360) % 360;
      }

      return (0, _util.shadow)(this, 'rotate', rotate);
    }
  }, {
    key: "annotations",
    get: function get() {
      return (0, _util.shadow)(this, 'annotations', this._getInheritableProperty('Annots') || []);
    }
  }, {
    key: "_parsedAnnotations",
    get: function get() {
      var _this4 = this;

      var parsedAnnotations = this.pdfManager.ensure(this, 'annotations').then(function () {
        var annotationRefs = _this4.annotations;
        var annotationPromises = [];

        for (var i = 0, ii = annotationRefs.length; i < ii; i++) {
          annotationPromises.push(_annotation.AnnotationFactory.create(_this4.xref, annotationRefs[i], _this4.pdfManager, _this4.idFactory));
        }

        return Promise.all(annotationPromises).then(function (annotations) {
          return annotations.filter(function isDefined(annotation) {
            return !!annotation;
          });
        }, function (reason) {
          (0, _util.warn)("_parsedAnnotations: \"".concat(reason, "\"."));
          return [];
        });
      });
      return (0, _util.shadow)(this, '_parsedAnnotations', parsedAnnotations);
    }
  }]);

  return Page;
}();

exports.Page = Page;
var FINGERPRINT_FIRST_BYTES = 1024;
var EMPTY_FINGERPRINT = '\x00\x00\x00\x00\x00\x00\x00' + '\x00\x00\x00\x00\x00\x00\x00\x00\x00';

function find(stream, needle, limit, backwards) {
  var pos = stream.pos;
  var end = stream.end;

  if (pos + limit > end) {
    limit = end - pos;
  }

  var strBuf = [];

  for (var i = 0; i < limit; ++i) {
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

var PDFDocument =
/*#__PURE__*/
function () {
  function PDFDocument(pdfManager, arg) {
    _classCallCheck(this, PDFDocument);

    var stream;

    if ((0, _primitives.isStream)(arg)) {
      stream = arg;
    } else if ((0, _util.isArrayBuffer)(arg)) {
      stream = new _stream2.Stream(arg);
    } else {
      throw new Error('PDFDocument: Unknown argument type');
    }

    if (stream.length <= 0) {
      throw new Error('PDFDocument: Stream must have data');
    }

    this.pdfManager = pdfManager;
    this.stream = stream;
    this.xref = new _obj.XRef(stream, pdfManager);
    this.pdfFunctionFactory = new _function.PDFFunctionFactory({
      xref: this.xref,
      isEvalSupported: pdfManager.evaluatorOptions.isEvalSupported
    });
    this._pagePromises = [];
  }

  _createClass(PDFDocument, [{
    key: "parse",
    value: function parse(recoveryMode) {
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

          if ((!Array.isArray(fields) || fields.length === 0) && !this.xfa) {
            this.acroForm = null;
          }
        }
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.info)('Cannot fetch AcroForm entry; assuming no AcroForms are present');
        this.acroForm = null;
      }

      try {
        var collection = this.catalog.catDict.get('Collection');

        if ((0, _primitives.isDict)(collection) && collection.getKeys().length > 0) {
          this.collection = collection;
        }
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.info)('Cannot fetch Collection dictionary.');
      }
    }
  }, {
    key: "checkHeader",
    value: function checkHeader() {
      var stream = this.stream;
      stream.reset();

      if (!find(stream, '%PDF-', 1024)) {
        return;
      }

      stream.moveStart();
      var MAX_PDF_VERSION_LENGTH = 12;
      var version = '',
          ch;

      while ((ch = stream.getByte()) > 0x20) {
        if (version.length >= MAX_PDF_VERSION_LENGTH) {
          break;
        }

        version += String.fromCharCode(ch);
      }

      if (!this.pdfFormatVersion) {
        this.pdfFormatVersion = version.substring(5);
      }
    }
  }, {
    key: "parseStartXRef",
    value: function parseStartXRef() {
      this.xref.setStartXRef(this.startXRef);
    }
  }, {
    key: "setup",
    value: function setup(recoveryMode) {
      this.xref.parse(recoveryMode);
      this.catalog = new _obj.Catalog(this.pdfManager, this.xref);
    }
  }, {
    key: "_getLinearizationPage",
    value: function _getLinearizationPage(pageIndex) {
      var catalog = this.catalog,
          linearization = this.linearization;
      (0, _util.assert)(linearization && linearization.pageFirst === pageIndex);

      var ref = _primitives.Ref.get(linearization.objectNumberFirst, 0);

      return this.xref.fetchAsync(ref).then(function (obj) {
        if ((0, _primitives.isDict)(obj, 'Page') || (0, _primitives.isDict)(obj) && !obj.has('Type') && obj.has('Contents')) {
          if (ref && !catalog.pageKidsCountCache.has(ref)) {
            catalog.pageKidsCountCache.put(ref, 1);
          }

          return [obj, ref];
        }

        throw new _util.FormatError('The Linearization dictionary doesn\'t point ' + 'to a valid Page dictionary.');
      })["catch"](function (reason) {
        (0, _util.info)(reason);
        return catalog.getPageDict(pageIndex);
      });
    }
  }, {
    key: "getPage",
    value: function getPage(pageIndex) {
      var _this5 = this;

      if (this._pagePromises[pageIndex] !== undefined) {
        return this._pagePromises[pageIndex];
      }

      var catalog = this.catalog,
          linearization = this.linearization;
      var promise = linearization && linearization.pageFirst === pageIndex ? this._getLinearizationPage(pageIndex) : catalog.getPageDict(pageIndex);
      return this._pagePromises[pageIndex] = promise.then(function (_ref10) {
        var _ref11 = _slicedToArray(_ref10, 2),
            pageDict = _ref11[0],
            ref = _ref11[1];

        return new Page({
          pdfManager: _this5.pdfManager,
          xref: _this5.xref,
          pageIndex: pageIndex,
          pageDict: pageDict,
          ref: ref,
          fontCache: catalog.fontCache,
          builtInCMapCache: catalog.builtInCMapCache,
          pdfFunctionFactory: _this5.pdfFunctionFactory
        });
      });
    }
  }, {
    key: "checkFirstPage",
    value: function checkFirstPage() {
      var _this6 = this;

      return this.getPage(0)["catch"](function (reason) {
        if (reason instanceof _core_utils.XRefEntryException) {
          _this6._pagePromises.length = 0;

          _this6.cleanup();

          throw new _core_utils.XRefParseException();
        }
      });
    }
  }, {
    key: "fontFallback",
    value: function fontFallback(id, handler) {
      return this.catalog.fontFallback(id, handler);
    }
  }, {
    key: "cleanup",
    value: function cleanup() {
      return this.catalog.cleanup();
    }
  }, {
    key: "linearization",
    get: function get() {
      var linearization = null;

      try {
        linearization = _parser.Linearization.create(this.stream);
      } catch (err) {
        if (err instanceof _core_utils.MissingDataException) {
          throw err;
        }

        (0, _util.info)(err);
      }

      return (0, _util.shadow)(this, 'linearization', linearization);
    }
  }, {
    key: "startXRef",
    get: function get() {
      var stream = this.stream;
      var startXRef = 0;

      if (this.linearization) {
        stream.reset();

        if (find(stream, 'endobj', 1024)) {
          startXRef = stream.pos + 6;
        }
      } else {
        var step = 1024;
        var startXRefLength = 'startxref'.length;
        var found = false,
            pos = stream.end;

        while (!found && pos > 0) {
          pos -= step - startXRefLength;

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
    }
  }, {
    key: "numPages",
    get: function get() {
      var linearization = this.linearization;
      var num = linearization ? linearization.numPages : this.catalog.numPages;
      return (0, _util.shadow)(this, 'numPages', num);
    }
  }, {
    key: "documentInfo",
    get: function get() {
      var DocumentInfoValidators = {
        Title: _util.isString,
        Author: _util.isString,
        Subject: _util.isString,
        Keywords: _util.isString,
        Creator: _util.isString,
        Producer: _util.isString,
        CreationDate: _util.isString,
        ModDate: _util.isString,
        Trapped: _primitives.isName
      };
      var docInfo = {
        PDFFormatVersion: this.pdfFormatVersion,
        IsLinearized: !!this.linearization,
        IsAcroFormPresent: !!this.acroForm,
        IsXFAPresent: !!this.xfa,
        IsCollectionPresent: !!this.collection
      };
      var infoDict;

      try {
        infoDict = this.xref.trailer.get('Info');
      } catch (err) {
        if (err instanceof _core_utils.MissingDataException) {
          throw err;
        }

        (0, _util.info)('The document information dictionary is invalid.');
      }

      if ((0, _primitives.isDict)(infoDict)) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = infoDict.getKeys()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var key = _step3.value;
            var value = infoDict.get(key);

            if (DocumentInfoValidators[key]) {
              if (DocumentInfoValidators[key](value)) {
                docInfo[key] = typeof value !== 'string' ? value : (0, _util.stringToPDFString)(value);
              } else {
                (0, _util.info)("Bad value in document info for \"".concat(key, "\"."));
              }
            } else if (typeof key === 'string') {
              var customValue = void 0;

              if ((0, _util.isString)(value)) {
                customValue = (0, _util.stringToPDFString)(value);
              } else if ((0, _primitives.isName)(value) || (0, _util.isNum)(value) || (0, _util.isBool)(value)) {
                customValue = value;
              } else {
                (0, _util.info)("Unsupported value in document info for (custom) \"".concat(key, "\"."));
                continue;
              }

              if (!docInfo['Custom']) {
                docInfo['Custom'] = Object.create(null);
              }

              docInfo['Custom'][key] = customValue;
            }
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
              _iterator3["return"]();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      }

      return (0, _util.shadow)(this, 'documentInfo', docInfo);
    }
  }, {
    key: "fingerprint",
    get: function get() {
      var hash;
      var idArray = this.xref.trailer.get('ID');

      if (Array.isArray(idArray) && idArray[0] && (0, _util.isString)(idArray[0]) && idArray[0] !== EMPTY_FINGERPRINT) {
        hash = (0, _util.stringToBytes)(idArray[0]);
      } else {
        if (this.stream.ensureRange) {
          this.stream.ensureRange(0, Math.min(FINGERPRINT_FIRST_BYTES, this.stream.end));
        }

        hash = (0, _crypto.calculateMD5)(this.stream.bytes.subarray(0, FINGERPRINT_FIRST_BYTES), 0, FINGERPRINT_FIRST_BYTES);
      }

      var fingerprint = '';

      for (var i = 0, ii = hash.length; i < ii; i++) {
        var hex = hash[i].toString(16);
        fingerprint += hex.length === 1 ? '0' + hex : hex;
      }

      return (0, _util.shadow)(this, 'fingerprint', fingerprint);
    }
  }]);

  return PDFDocument;
}();

exports.PDFDocument = PDFDocument;