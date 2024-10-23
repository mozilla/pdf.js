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

function runTtx(fontPath) {
  return new Promise((resolve, reject) => {
    const ttx = spawn("ttx", [fontPath], { stdio: "ignore" });
    ttx.on("error", () => {
      reject(
        new Error(
          "Unable to execute `ttx`; make sure the `fonttools` dependency is installed"
        )
      );
    });
    ttx.on("close", () => {
      resolve();
    });
  });
}

async function translateFont(content) {
  const buffer = Buffer.from(content, "base64");
  const taskId = (ttxTaskId++).toString();
  const fontPath = path.join(os.tmpdir(), `pdfjs-font-test-${taskId}.otf`);
  const resultPath = path.join(os.tmpdir(), `pdfjs-font-test-${taskId}.ttx`);

  // Write the font data to a temporary file on disk (because TTX only accepts
  // files as input).
  fs.writeFileSync(fontPath, buffer);

  // Run TTX on the temporary font file.
  let ttxError;
  try {
    await runTtx(fontPath);
  } catch (error) {
    ttxError = error;
  }

  // Remove the temporary font/result files and report on the outcome.
  fs.unlinkSync(fontPath);
  if (ttxError) {
    throw ttxError;
  }
  if (!fs.existsSync(resultPath)) {
    throw new Error("TTX did not generate output");
  }
  const xml = fs.readFileSync(resultPath);
  fs.unlinkSync(resultPath);
  return xml;
}

export { translateFont };
