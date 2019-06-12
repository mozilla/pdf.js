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

var _util = require("../../shared/util");

var _is_node = _interopRequireDefault(require("../../shared/is_node"));

var _node_stream = require("../../display/node_stream");

var _api = require("../../display/api");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

if (!(0, _is_node["default"])()) {
  throw new Error('The `gulp unittestcli` command can only be used in ' + 'Node.js environments.');
}

(0, _util.setVerbosityLevel)(_util.VerbosityLevel.ERRORS);
(0, _api.setPDFNetworkStreamFactory)(function (params) {
  return new _node_stream.PDFNodeStream(params);
});