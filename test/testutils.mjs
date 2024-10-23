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
import path from "path";

function copySubtreeSync(src, dest) {
  const files = fs.readdirSync(src);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest);
  }
  files.forEach(function (filename) {
    const srcFile = path.join(src, filename);
    const file = path.join(dest, filename);
    const stats = fs.statSync(srcFile);
    if (stats.isDirectory()) {
      copySubtreeSync(srcFile, file);
    } else {
      fs.writeFileSync(file, fs.readFileSync(srcFile));
    }
  });
}

function ensureDirSync(dir) {
  if (fs.existsSync(dir)) {
    return;
  }
  const parts = dir.split(path.sep);
  let i = parts.length;
  while (i > 1 && !fs.existsSync(parts.slice(0, i - 1).join(path.sep))) {
    i--;
  }
  if (i < 0 || (i === 0 && parts[0])) {
    throw new Error();
  }

  while (i <= parts.length) {
    fs.mkdirSync(parts.slice(0, i).join(path.sep));
    i++;
  }
}

export { copySubtreeSync, ensureDirSync };
