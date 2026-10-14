/* Copyright 2026 Mozilla Foundation
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

import { bench, describe } from "vitest";
import { Lexer, Parser } from "../../src/core/parser.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { calculateMD5 } from "../../src/core/calculate_md5.js";
import { calculateSHA256 } from "../../src/core/calculate_sha256.js";
import { deflateSync } from "zlib";
import { EOF } from "../../src/core/primitives.js";
import { FlateStream } from "../../src/core/flate_stream.js";
import { JpegImage } from "../../src/core/jpg.js";
import { readFile } from "./bench_utils.js";

// A synthetic, but representative, page content stream.
function buildContentStream(numBlocks) {
  const parts = [];
  for (let i = 0; i < numBlocks; i++) {
    parts.push(
      "q 0.5 0 0 0.5 72 720 cm",
      `BT /F1 12 Tf 1 0 0 1 ${i % 500} ${i % 700} Tm`,
      "[(Hello) -250 (World) 120.5 (\\(escaped\\) text)] TJ",
      "0 -14 Td (Another line of text) Tj ET",
      `0.1 0.2 0.3 rg ${i} ${i + 1} 100.25 50.75 re f`,
      "/GS1 gs << /Key /Value /Num 42 /Arr [1 2 3] >> BDC EMC Q"
    );
  }
  return parts.join("\n");
}

const CONTENT_STREAM = buildContentStream(500);

const RAW_DATA = (() => {
  // Compressible, yet non-trivial, input data.
  const encoder = new TextEncoder();
  return encoder.encode(buildContentStream(1000));
})();
const DEFLATED_DATA = new Uint8Array(deflateSync(RAW_DATA));

const JPEG_DATA = readFile("examples/image_decoders/fish.jpg");

describe("core", () => {
  bench("Lexer: tokenize content stream", () => {
    const lexer = new Lexer(new StringStream(CONTENT_STREAM));
    let count = 0;
    while (lexer.getObj() !== EOF) {
      count++;
    }
    return count;
  });

  bench("Parser: parse content stream objects", () => {
    const parser = new Parser({
      lexer: new Lexer(new StringStream(CONTENT_STREAM)),
      xref: null,
    });
    let count = 0;
    while (parser.getObj() !== EOF) {
      count++;
    }
    return count;
  });

  bench("FlateStream: inflate", () => {
    const stream = new FlateStream(new Stream(DEFLATED_DATA));
    return stream.getBytes().length;
  });

  bench("JpegImage: decode baseline JPEG", () => {
    const jpegImage = new JpegImage();
    jpegImage.parse(JPEG_DATA);
    return jpegImage.getData({
      width: jpegImage.width,
      height: jpegImage.height,
      forceRGBA: true,
    });
  });

  bench("calculateMD5", () => calculateMD5(RAW_DATA, 0, RAW_DATA.length));

  bench("calculateSHA256", () => calculateSHA256(RAW_DATA, 0, RAW_DATA.length));
});
