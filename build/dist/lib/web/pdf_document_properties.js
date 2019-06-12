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
exports.PDFDocumentProperties = void 0;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _pdf = require("../pdf");

var _ui_utils = require("./ui_utils");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var DEFAULT_FIELD_CONTENT = '-';
var NON_METRIC_LOCALES = ['en-us', 'en-lr', 'my'];
var US_PAGE_NAMES = {
  '8.5x11': 'Letter',
  '8.5x14': 'Legal'
};
var METRIC_PAGE_NAMES = {
  '297x420': 'A3',
  '210x297': 'A4'
};

function getPageName(size, isPortrait, pageNames) {
  var width = isPortrait ? size.width : size.height;
  var height = isPortrait ? size.height : size.width;
  return pageNames["".concat(width, "x").concat(height)];
}

var PDFDocumentProperties =
/*#__PURE__*/
function () {
  function PDFDocumentProperties(_ref, overlayManager, eventBus) {
    var _this = this;

    var overlayName = _ref.overlayName,
        fields = _ref.fields,
        container = _ref.container,
        closeButton = _ref.closeButton;
    var l10n = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _ui_utils.NullL10n;

    _classCallCheck(this, PDFDocumentProperties);

    this.overlayName = overlayName;
    this.fields = fields;
    this.container = container;
    this.overlayManager = overlayManager;
    this.l10n = l10n;

    this._reset();

    if (closeButton) {
      closeButton.addEventListener('click', this.close.bind(this));
    }

    this.overlayManager.register(this.overlayName, this.container, this.close.bind(this));

    if (eventBus) {
      eventBus.on('pagechanging', function (evt) {
        _this._currentPageNumber = evt.pageNumber;
      });
      eventBus.on('rotationchanging', function (evt) {
        _this._pagesRotation = evt.pagesRotation;
      });
    }

    this._isNonMetricLocale = true;
    l10n.getLanguage().then(function (locale) {
      _this._isNonMetricLocale = NON_METRIC_LOCALES.includes(locale);
    });
  }

  _createClass(PDFDocumentProperties, [{
    key: "open",
    value: function open() {
      var _this2 = this;

      var freezeFieldData = function freezeFieldData(data) {
        Object.defineProperty(_this2, 'fieldData', {
          value: Object.freeze(data),
          writable: false,
          enumerable: true,
          configurable: true
        });
      };

      Promise.all([this.overlayManager.open(this.overlayName), this._dataAvailableCapability.promise]).then(function () {
        var currentPageNumber = _this2._currentPageNumber;
        var pagesRotation = _this2._pagesRotation;

        if (_this2.fieldData && currentPageNumber === _this2.fieldData['_currentPageNumber'] && pagesRotation === _this2.fieldData['_pagesRotation']) {
          _this2._updateUI();

          return;
        }

        _this2.pdfDocument.getMetadata().then(function (_ref2) {
          var info = _ref2.info,
              metadata = _ref2.metadata,
              contentDispositionFilename = _ref2.contentDispositionFilename;
          return Promise.all([info, metadata, contentDispositionFilename || (0, _ui_utils.getPDFFileNameFromURL)(_this2.url || ''), _this2._parseFileSize(_this2.maybeFileSize), _this2._parseDate(info.CreationDate), _this2._parseDate(info.ModDate), _this2.pdfDocument.getPage(currentPageNumber).then(function (pdfPage) {
            return _this2._parsePageSize((0, _ui_utils.getPageSizeInches)(pdfPage), pagesRotation);
          }), _this2._parseLinearization(info.IsLinearized)]);
        }).then(function (_ref3) {
          var _ref4 = _slicedToArray(_ref3, 8),
              info = _ref4[0],
              metadata = _ref4[1],
              fileName = _ref4[2],
              fileSize = _ref4[3],
              creationDate = _ref4[4],
              modDate = _ref4[5],
              pageSize = _ref4[6],
              isLinearized = _ref4[7];

          freezeFieldData({
            'fileName': fileName,
            'fileSize': fileSize,
            'title': info.Title,
            'author': info.Author,
            'subject': info.Subject,
            'keywords': info.Keywords,
            'creationDate': creationDate,
            'modificationDate': modDate,
            'creator': info.Creator,
            'producer': info.Producer,
            'version': info.PDFFormatVersion,
            'pageCount': _this2.pdfDocument.numPages,
            'pageSize': pageSize,
            'linearized': isLinearized,
            '_currentPageNumber': currentPageNumber,
            '_pagesRotation': pagesRotation
          });

          _this2._updateUI();

          return _this2.pdfDocument.getDownloadInfo();
        }).then(function (_ref5) {
          var length = _ref5.length;
          _this2.maybeFileSize = length;
          return _this2._parseFileSize(length);
        }).then(function (fileSize) {
          if (fileSize === _this2.fieldData['fileSize']) {
            return;
          }

          var data = Object.assign(Object.create(null), _this2.fieldData);
          data['fileSize'] = fileSize;
          freezeFieldData(data);

          _this2._updateUI();
        });
      });
    }
  }, {
    key: "close",
    value: function close() {
      this.overlayManager.close(this.overlayName);
    }
  }, {
    key: "setDocument",
    value: function setDocument(pdfDocument) {
      var url = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

      if (this.pdfDocument) {
        this._reset();

        this._updateUI(true);
      }

      if (!pdfDocument) {
        return;
      }

      this.pdfDocument = pdfDocument;
      this.url = url;

      this._dataAvailableCapability.resolve();
    }
  }, {
    key: "setFileSize",
    value: function setFileSize(fileSize) {
      if (Number.isInteger(fileSize) && fileSize > 0) {
        this.maybeFileSize = fileSize;
      }
    }
  }, {
    key: "_reset",
    value: function _reset() {
      this.pdfDocument = null;
      this.url = null;
      this.maybeFileSize = 0;
      delete this.fieldData;
      this._dataAvailableCapability = (0, _pdf.createPromiseCapability)();
      this._currentPageNumber = 1;
      this._pagesRotation = 0;
    }
  }, {
    key: "_updateUI",
    value: function _updateUI() {
      var reset = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      if (reset || !this.fieldData) {
        for (var id in this.fields) {
          this.fields[id].textContent = DEFAULT_FIELD_CONTENT;
        }

        return;
      }

      if (this.overlayManager.active !== this.overlayName) {
        return;
      }

      for (var _id in this.fields) {
        var content = this.fieldData[_id];
        this.fields[_id].textContent = content || content === 0 ? content : DEFAULT_FIELD_CONTENT;
      }
    }
  }, {
    key: "_parseFileSize",
    value: function () {
      var _parseFileSize2 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee() {
        var fileSize,
            kb,
            _args = arguments;
        return _regenerator["default"].wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                fileSize = _args.length > 0 && _args[0] !== undefined ? _args[0] : 0;
                kb = fileSize / 1024;

                if (kb) {
                  _context.next = 6;
                  break;
                }

                return _context.abrupt("return", undefined);

              case 6:
                if (!(kb < 1024)) {
                  _context.next = 8;
                  break;
                }

                return _context.abrupt("return", this.l10n.get('document_properties_kb', {
                  size_kb: (+kb.toPrecision(3)).toLocaleString(),
                  size_b: fileSize.toLocaleString()
                }, '{{size_kb}} KB ({{size_b}} bytes)'));

              case 8:
                return _context.abrupt("return", this.l10n.get('document_properties_mb', {
                  size_mb: (+(kb / 1024).toPrecision(3)).toLocaleString(),
                  size_b: fileSize.toLocaleString()
                }, '{{size_mb}} MB ({{size_b}} bytes)'));

              case 9:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function _parseFileSize() {
        return _parseFileSize2.apply(this, arguments);
      }

      return _parseFileSize;
    }()
  }, {
    key: "_parsePageSize",
    value: function () {
      var _parsePageSize2 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee2(pageSizeInches, pagesRotation) {
        var _this3 = this;

        var isPortrait, sizeInches, sizeMillimeters, pageName, name, exactMillimeters, intMillimeters;
        return _regenerator["default"].wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (pageSizeInches) {
                  _context2.next = 2;
                  break;
                }

                return _context2.abrupt("return", undefined);

              case 2:
                if (pagesRotation % 180 !== 0) {
                  pageSizeInches = {
                    width: pageSizeInches.height,
                    height: pageSizeInches.width
                  };
                }

                isPortrait = (0, _ui_utils.isPortraitOrientation)(pageSizeInches);
                sizeInches = {
                  width: Math.round(pageSizeInches.width * 100) / 100,
                  height: Math.round(pageSizeInches.height * 100) / 100
                };
                sizeMillimeters = {
                  width: Math.round(pageSizeInches.width * 25.4 * 10) / 10,
                  height: Math.round(pageSizeInches.height * 25.4 * 10) / 10
                };
                pageName = null;
                name = getPageName(sizeInches, isPortrait, US_PAGE_NAMES) || getPageName(sizeMillimeters, isPortrait, METRIC_PAGE_NAMES);

                if (!name && !(Number.isInteger(sizeMillimeters.width) && Number.isInteger(sizeMillimeters.height))) {
                  exactMillimeters = {
                    width: pageSizeInches.width * 25.4,
                    height: pageSizeInches.height * 25.4
                  };
                  intMillimeters = {
                    width: Math.round(sizeMillimeters.width),
                    height: Math.round(sizeMillimeters.height)
                  };

                  if (Math.abs(exactMillimeters.width - intMillimeters.width) < 0.1 && Math.abs(exactMillimeters.height - intMillimeters.height) < 0.1) {
                    name = getPageName(intMillimeters, isPortrait, METRIC_PAGE_NAMES);

                    if (name) {
                      sizeInches = {
                        width: Math.round(intMillimeters.width / 25.4 * 100) / 100,
                        height: Math.round(intMillimeters.height / 25.4 * 100) / 100
                      };
                      sizeMillimeters = intMillimeters;
                    }
                  }
                }

                if (name) {
                  pageName = this.l10n.get('document_properties_page_size_name_' + name.toLowerCase(), null, name);
                }

                return _context2.abrupt("return", Promise.all([this._isNonMetricLocale ? sizeInches : sizeMillimeters, this.l10n.get('document_properties_page_size_unit_' + (this._isNonMetricLocale ? 'inches' : 'millimeters'), null, this._isNonMetricLocale ? 'in' : 'mm'), pageName, this.l10n.get('document_properties_page_size_orientation_' + (isPortrait ? 'portrait' : 'landscape'), null, isPortrait ? 'portrait' : 'landscape')]).then(function (_ref6) {
                  var _ref7 = _slicedToArray(_ref6, 4),
                      _ref7$ = _ref7[0],
                      width = _ref7$.width,
                      height = _ref7$.height,
                      unit = _ref7[1],
                      name = _ref7[2],
                      orientation = _ref7[3];

                  return _this3.l10n.get('document_properties_page_size_dimension_' + (name ? 'name_' : '') + 'string', {
                    width: width.toLocaleString(),
                    height: height.toLocaleString(),
                    unit: unit,
                    name: name,
                    orientation: orientation
                  }, '{{width}} × {{height}} {{unit}} (' + (name ? '{{name}}, ' : '') + '{{orientation}})');
                }));

              case 11:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _parsePageSize(_x, _x2) {
        return _parsePageSize2.apply(this, arguments);
      }

      return _parsePageSize;
    }()
  }, {
    key: "_parseDate",
    value: function () {
      var _parseDate2 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee3(inputDate) {
        var dateObject;
        return _regenerator["default"].wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                dateObject = _pdf.PDFDateString.toDateObject(inputDate);

                if (dateObject) {
                  _context3.next = 3;
                  break;
                }

                return _context3.abrupt("return", undefined);

              case 3:
                return _context3.abrupt("return", this.l10n.get('document_properties_date_string', {
                  date: dateObject.toLocaleDateString(),
                  time: dateObject.toLocaleTimeString()
                }, '{{date}}, {{time}}'));

              case 4:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _parseDate(_x3) {
        return _parseDate2.apply(this, arguments);
      }

      return _parseDate;
    }()
  }, {
    key: "_parseLinearization",
    value: function _parseLinearization(isLinearized) {
      return this.l10n.get('document_properties_linearized_' + (isLinearized ? 'yes' : 'no'), null, isLinearized ? 'Yes' : 'No');
    }
  }]);

  return PDFDocumentProperties;
}();

exports.PDFDocumentProperties = PDFDocumentProperties;