/*
 * Copyright 2014 Mozilla Foundation
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
/*jslint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var ttxResourcesHome = path.join(__dirname, '..', 'ttx');

var nextTTXTaskId = Date.now();

function runTtx(ttxResourcesHome, fontPath, registerOnCancel, callback) {
  fs.realpath(ttxResourcesHome, function (err, ttxResourcesHome) {
    var fontToolsHome = path.join(ttxResourcesHome, 'fonttools-code');
    fs.realpath(fontPath, function (err, fontPath) {
      var ttxPath = path.join('Tools', 'ttx');
      if (!fs.existsSync(path.join(fontToolsHome, ttxPath))) {
        callback('TTX was not found, please checkout PDF.js submodules');
        return;
      }
      var ttxEnv = {
        'PYTHONPATH': path.join(fontToolsHome, 'Lib'),
        'PYTHONDONTWRITEBYTECODE': true
      };
      var ttxStdioMode = 'ignore';
      var ttx = spawn('python', [ttxPath, fontPath],
        {cwd: fontToolsHome, stdio: ttxStdioMode, env: ttxEnv});
      var ttxRunError;
      registerOnCancel(function (reason) {
        ttxRunError = reason;
        callback(reason);
        ttx.kill();
      });
      ttx.on('error', function (err) {
        ttxRunError = err;
        callback('Unable to execute ttx');
      });
      ttx.on('close', function (code) {
        if (ttxRunError) {
          return;
        }
        callback();
      });
    });
  });
}

exports.translateFont = function translateFont(content, registerOnCancel,
                                               callback) {
  var buffer = new Buffer(content, 'base64');
  var taskId = (nextTTXTaskId++).toString();
  var fontPath = path.join(ttxResourcesHome, taskId + '.otf');
  var resultPath = path.join(ttxResourcesHome, taskId + '.ttx');

  fs.writeFileSync(fontPath, buffer);
  runTtx(ttxResourcesHome, fontPath, registerOnCancel, function (err) {
    fs.unlink(fontPath);
    if (err) {
      console.error(err);
      callback(err);
    } else if (!fs.existsSync(resultPath)) {
      callback('Output was not generated');
    } else {
      callback(null, fs.readFileSync(resultPath));
      fs.unlink(resultPath);
    }
  });
};
