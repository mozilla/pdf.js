/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
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

module.exports = {
  reporter: function reporter(res) {
    var len = 0;
    var str = '';

    res.forEach(function(r) {
      var file = r.file;
      var err = r.error;

      switch (err.code) {
        case 'W004': // variable is already defined
        case 'W018': // confusing use of !
          break;
        default:
          len++;
          str += file + ': line ' + err.line + ', col ' +
            err.character + ', ' + err.reason + '\n';
      }
    });

    if (str) {
      process.stdout.write(str + '\n' + len + ' error' +
        ((len === 1) ? '' : 's') + '\n');
      process.exit(2);
    } else {
      process.stdout.write('files checked, no errors found\n');
      process.exit(0);
    }
  }
};
