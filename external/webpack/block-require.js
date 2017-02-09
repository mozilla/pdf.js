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

'use strict';

function isPDFJSDevCheck(test) {
  // Is it something like `typeof __pdfjsdev_webpack__ === 'undefined'`?
  return test.type === 'BinaryExpression' &&
         (test.operator === '===' || test.operator === '!==' ||
          test.operator === '==' || test.operator === '!=') &&
         test.left.type === 'UnaryExpression' &&
         test.left.operator === 'typeof' &&
         test.left.argument.type === 'Identifier' &&
         test.left.argument.name === '__pdfjsdev_webpack__' &&
         test.right.type === 'Literal' && test.right.value === 'undefined';
}

function isPDFJSDevEnabled(test) {
  return test.operator[0] === '!';
}

function BlockRequirePlugin() {}

BlockRequirePlugin.prototype.apply = function(compiler) {
  compiler.plugin('compilation', function(compilation, data) {
    data.normalModuleFactory.plugin('parser', function (parser, options) {
      parser.plugin('statement if', function (ifNode) {
        if (isPDFJSDevCheck(ifNode.test)) {
          return isPDFJSDevEnabled(ifNode.test);
        }
        return undefined;
      });
    });
  });
};

module.exports = BlockRequirePlugin;
