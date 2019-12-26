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
/* eslint-env node */

"use strict";

var preprocessor2 = require("../builder/preprocessor2.js");
var path = require("path");

module.exports = function(source) {
  // Options must be specified, ignoring request if not.
  if (!this.query || typeof this.query !== "object") {
    return source;
  }
  this.cacheable();

  var filePath = this.resourcePath;
  var context = this.rootContext;
  var sourcePath = path
    .relative(context, filePath)
    .split(path.sep)
    .join("/");

  var ctx = Object.create(this.query);
  ctx.sourceMap = true;
  ctx.sourceFile = sourcePath;

  var callback = this.callback;
  var sourceAndMap = preprocessor2.preprocessPDFJSCode(ctx, source);
  var map = sourceAndMap.map.toJSON();
  // escodegen does not embed source -- setting map's sourcesContent.
  map.sourcesContent = [source];
  callback(null, sourceAndMap.code, map);
  return undefined;
};
