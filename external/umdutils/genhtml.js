/* Copyright 2015 Mozilla Foundation
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
/* jshint node:true */

'use strict';

// Simple util to re-generate HTML module references in right load order.

var fs = require('fs');
var path = require('path');
var umd = require('./verifier.js');

var filePath = process.argv[2];
if (!filePath) {
  console.log('USAGE: node ./external/umdutils/genhtml.js <html-file-path>');
  process.exit(0);
}

var content = fs.readFileSync(filePath).toString();
var m, re = /<script\s+src=['"]([^'"]+)/g;
var filesFound = [];
while ((m = re.exec(content))) {
  var jsPath = m[1];
  if (!/\bsrc\/.*?\.js$/.test(jsPath)) {
    continue;
  }
  filesFound.push(jsPath);
}

var srcPrefix = filesFound[0].substring(0, filesFound[0].indexOf('src/') + 4);

var dependencies = umd.readDependencies(filesFound.map(function (p) {
  return path.join(path.dirname(filePath), p);
}));

dependencies.loadOrder.forEach(function (i) {
  console.log('<script src="' + i.replace('pdfjs/', srcPrefix) + '.js">'+
    '</script>');
});
