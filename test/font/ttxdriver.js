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

"use strict";

const fs = require("fs");
const path = require("path");
const spawn = require("child_process").spawn;

const ttxResourcesHome = path.join(__dirname, "..", "ttx");

let nextTTXTaskId = Date.now();

function runTtx(ttxResourcesHomePath, fontPath, registerOnCancel, callback) {
  fs.realpath(ttxResourcesHomePath, function (error, realTtxResourcesHomePath) {
    const fontToolsHome = path.join(realTtxResourcesHomePath, "fonttools-code");
    fs.realpath(fontPath, function (errorFontPath, realFontPath) {
      const ttxPath = path.join("Tools", "ttx");
      if (!fs.existsSync(path.join(fontToolsHome, ttxPath))) {
        callback("TTX was not found, please checkout PDF.js submodules");
        return;
      }
      const ttxEnv = {
        PYTHONPATH: path.join(fontToolsHome, "Lib"),
        PYTHONDONTWRITEBYTECODE: true,
      };
      const ttxStdioMode = "ignore";
      const ttx = spawn("python", [ttxPath, realFontPath], {
        cwd: fontToolsHome,
        stdio: ttxStdioMode,
        env: ttxEnv,
      });
      let ttxRunError;
      registerOnCancel(function (reason) {
        ttxRunError = reason;
        callback(reason);
        ttx.kill();
      });
      ttx.on("error", function (errorTtx) {
        ttxRunError = errorTtx;
        callback("Unable to execute ttx");
      });
      ttx.on("close", function (code) {
        if (ttxRunError) {
          return;
        }
        callback();
      });
    });
  });
}

exports.translateFont = function translateFont(
  content,
  registerOnCancel,
  callback
) {
  const buffer = Buffer.from(content, "base64");
  const taskId = (nextTTXTaskId++).toString();
  const fontPath = path.join(ttxResourcesHome, taskId + ".otf");
  const resultPath = path.join(ttxResourcesHome, taskId + ".ttx");

  fs.writeFileSync(fontPath, buffer);
  runTtx(ttxResourcesHome, fontPath, registerOnCancel, function (err) {
    fs.unlinkSync(fontPath);
    if (err) {
      console.error(err);
      callback(err);
    } else if (!fs.existsSync(resultPath)) {
      callback("Output was not generated");
    } else {
      callback(null, fs.readFileSync(resultPath));
      fs.unlinkSync(resultPath);
    }
  });
};
