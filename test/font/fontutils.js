/*
 * Copyright 2013 Mozilla Foundation
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

import { bytesToString, stringToBytes } from "../../src/shared/util.js";

function decodeFontData(base64) {
  const str = atob(base64);
  return stringToBytes(str);
}

function encodeFontData(data) {
  const str = bytesToString(data);
  return btoa(str);
}

async function ttx(data) {
  const response = await fetch("/ttx", {
    method: "POST",
    body: encodeFontData(data),
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.text();
}

function verifyTtxOutput(output) {
  const m = /^<error>(.*?)<\/error>/.exec(output);
  if (m) {
    throw m[1];
  }
}

export { decodeFontData, encodeFontData, ttx, verifyTtxOutput };
