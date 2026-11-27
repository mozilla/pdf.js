/* Copyright 2013 Mozilla Foundation
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

async function postFont(path, data) {
  const response = await fetch(path, {
    method: "POST",
    body: data.toBase64(),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || response.statusText);
  }
  return response;
}

async function checkSanitization(data) {
  await postFont("/ots", data);
}

async function ttx(data) {
  return (await postFont("/ttx", data)).text();
}

function verifyTtxOutput(output) {
  const m = /^<error>(.*?)<\/error>/.exec(output);
  if (m) {
    throw m[1];
  }
}

export { checkSanitization, ttx, verifyTtxOutput };
