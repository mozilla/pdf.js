/* Copyright 2014 Mozilla Foundation
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

import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const run = promisify(execFile);

async function withFontFile(content, callback) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "pdfjs-font-test-")
  );
  try {
    const fontPath = path.join(directory, "font.otf");
    await fs.writeFile(fontPath, Buffer.from(content, "base64"));
    return await callback(fontPath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function translateFont(content) {
  return withFontFile(content, async fontPath => {
    const resultPath = path.join(path.dirname(fontPath), "font.ttx");
    try {
      await run("ttx", ["-q", "-o", resultPath, fontPath]);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          "Unable to execute `ttx`; make sure the `fonttools` dependency is installed"
        );
      }
      throw error;
    }
    return fs.readFile(resultPath);
  });
}

const sanitize = String.raw`
import sys
import pyots

result = pyots.sanitize(sys.argv[1])
messages = "\n".join(result.messages).strip()
if messages or not result.sanitized:
    sys.exit(messages or "OTS rejected the font")
`;

function sanitizeFont(content) {
  return withFontFile(content, fontPath =>
    run("python3", ["-c", sanitize, fontPath])
  );
}

export { sanitizeFont, translateFont };
