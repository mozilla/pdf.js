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
exports.Metadata = void 0;

var _util = require("../shared/util");

var _xml_parser = require("./xml_parser");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var Metadata =
/*#__PURE__*/
function () {
  function Metadata(data) {
    _classCallCheck(this, Metadata);

    (0, _util.assert)(typeof data === 'string', 'Metadata: input is not a string');
    data = this._repair(data);
    var parser = new _xml_parser.SimpleXMLParser();
    var xmlDocument = parser.parseFromString(data);
    this._metadata = Object.create(null);

    if (xmlDocument) {
      this._parse(xmlDocument);
    }
  }

  _createClass(Metadata, [{
    key: "_repair",
    value: function _repair(data) {
      return data.replace(/^([^<]+)/, '').replace(/>\\376\\377([^<]+)/g, function (all, codes) {
        var bytes = codes.replace(/\\([0-3])([0-7])([0-7])/g, function (code, d1, d2, d3) {
          return String.fromCharCode(d1 * 64 + d2 * 8 + d3 * 1);
        }).replace(/&(amp|apos|gt|lt|quot);/g, function (str, name) {
          switch (name) {
            case 'amp':
              return '&';

            case 'apos':
              return '\'';

            case 'gt':
              return '>';

            case 'lt':
              return '<';

            case 'quot':
              return '\"';
          }

          throw new Error("_repair: ".concat(name, " isn't defined."));
        });
        var chars = '';

        for (var i = 0, ii = bytes.length; i < ii; i += 2) {
          var code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);

          if (code >= 32 && code < 127 && code !== 60 && code !== 62 && code !== 38) {
            chars += String.fromCharCode(code);
          } else {
            chars += '&#x' + (0x10000 + code).toString(16).substring(1) + ';';
          }
        }

        return '>' + chars;
      });
    }
  }, {
    key: "_parse",
    value: function _parse(xmlDocument) {
      var rdf = xmlDocument.documentElement;

      if (rdf.nodeName.toLowerCase() !== 'rdf:rdf') {
        rdf = rdf.firstChild;

        while (rdf && rdf.nodeName.toLowerCase() !== 'rdf:rdf') {
          rdf = rdf.nextSibling;
        }
      }

      var nodeName = rdf ? rdf.nodeName.toLowerCase() : null;

      if (!rdf || nodeName !== 'rdf:rdf' || !rdf.hasChildNodes()) {
        return;
      }

      var children = rdf.childNodes;

      for (var i = 0, ii = children.length; i < ii; i++) {
        var desc = children[i];

        if (desc.nodeName.toLowerCase() !== 'rdf:description') {
          continue;
        }

        for (var j = 0, jj = desc.childNodes.length; j < jj; j++) {
          if (desc.childNodes[j].nodeName.toLowerCase() !== '#text') {
            var entry = desc.childNodes[j];
            var name = entry.nodeName.toLowerCase();
            this._metadata[name] = entry.textContent.trim();
          }
        }
      }
    }
  }, {
    key: "get",
    value: function get(name) {
      var data = this._metadata[name];
      return typeof data !== 'undefined' ? data : null;
    }
  }, {
    key: "getAll",
    value: function getAll() {
      return this._metadata;
    }
  }, {
    key: "has",
    value: function has(name) {
      return typeof this._metadata[name] !== 'undefined';
    }
  }]);

  return Metadata;
}();

exports.Metadata = Metadata;