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

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

let ttxTaskId = Date.now();

function runTtx(fontPath, registerOnCancel, callback) {
  const ttx = spawn("ttx", [fontPath], { stdio: "ignore" });
  let ttxRunError;
  registerOnCancel(function (reason) {
    ttxRunError = reason;
    callback(reason);
    ttx.kill();
  });
  ttx.on("error", function (errorTtx) {
    ttxRunError = errorTtx;
    callback(
      "Unable to execute `ttx`; make sure the `fonttools` dependency is installed"
    );
  });
  ttx.on("close", function (code) {
    if (ttxRunError) {
      return;
    }
    callback();
  });
}

function translateFont(content, registerOnCancel, callback) {
  const buffer = Buffer.from(content, "base64");
  const taskId = (ttxTaskId++).toString();
  const fontPath = path.join(os.tmpdir(), `pdfjs-font-test-${taskId}.otf`);
  const resultPath = path.join(os.tmpdir(), `pdfjs-font-test-${taskId}.ttx`);

  fs.writeFileSync(fontPath, buffer);
  runTtx(fontPath, registerOnCancel, function (err) {
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
}

export { translateFont };
