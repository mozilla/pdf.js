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

import {
  captureFilterInputs,
  capturePNGPredictorInputs,
  createChunkedStream,
} from "./stream_utils.js";
import { Ascii85Stream } from "../../src/core/ascii_85_stream.js";
import { benchmark } from "./bench_utils.js";
import { describe } from "vitest";
import { FlateStream } from "../../src/core/flate_stream.js";
import { isName } from "../../src/core/primitives.js";
import { LZWStream } from "../../src/core/lzw_stream.js";
import { PredictorStream } from "../../src/core/predictor_stream.js";
import { RunLengthStream } from "../../src/core/run_length_stream.js";
import { Stream } from "../../src/core/stream.js";

const isImage = dict => isName(dict.get("Subtype"), "Image");

const CONTENT_STREAMS = {
  kind: "content streams",
  filename: "tracemonkey.pdf",
  filter: dict => !dict.has("Length1") && !isImage(dict),
};
const FLATE_STREAMS = [
  {
    kind: "fonts",
    filename: "issue14297.pdf",
    filter: dict => dict.has("Length1"),
  },
  CONTENT_STREAMS,
  { kind: "images", filename: "issue7200.pdf", filter: isImage },
];
for (const entry of FLATE_STREAMS) {
  entry.inputs = await captureFilterInputs(
    entry.filename,
    "FlateDecode",
    entry.filter
  );
}
const CHUNKED_CONTENT_STREAMS = CONTENT_STREAMS.inputs.map(
  ({ bytes, maybeLength }) => ({
    stream: createChunkedStream(bytes),
    maybeLength,
  })
);

const PNG_PREDICTOR_STREAMS = [
  {
    kind: "xref streams",
    filename: "issue20513.pdf",
    filter: dict => isName(dict.get("Type"), "XRef"),
    options: { pages: [] },
  },
  {
    kind: "images",
    filename: "issue19971.pdf",
    filter: isImage,
    options: { pages: [3] },
  },
];
for (const entry of PNG_PREDICTOR_STREAMS) {
  entry.inputs = await capturePNGPredictorInputs(
    entry.filename,
    entry.filter,
    entry.options
  );
}

const ASCII85_INPUTS = await captureFilterInputs(
  "bug1337429.pdf",
  "ASCII85Decode"
);
const LZW_INPUTS = await captureFilterInputs("bug864847.pdf", "LZWDecode");
const RUN_LENGTH_INPUTS = await captureFilterInputs(
  "issue19326.pdf",
  "RunLengthDecode",
  undefined,
  { operatorList: true }
);

describe("streams", () => {
  for (const { kind, filename, inputs } of FLATE_STREAMS) {
    benchmark(`FlateStream: ${kind} (${filename})`, () =>
      inputs.map(({ bytes, maybeLength }) =>
        new FlateStream(new Stream(bytes), maybeLength).getBytes()
      )
    );
  }

  benchmark(
    "FlateStream: content streams from a ChunkedStream (tracemonkey.pdf)",
    () =>
      CHUNKED_CONTENT_STREAMS.map(({ stream, maybeLength }) =>
        new FlateStream(
          stream.makeSubStream(0, stream.length),
          maybeLength
        ).getBytes()
      )
  );

  for (const { kind, filename, inputs } of PNG_PREDICTOR_STREAMS) {
    benchmark(`PredictorStream: PNG ${kind} (${filename})`, () =>
      inputs.map(({ bytes, maybeLength, params }) =>
        new PredictorStream(new Stream(bytes), maybeLength, params).getBytes()
      )
    );
  }

  benchmark("Ascii85Stream (bug1337429.pdf)", () =>
    ASCII85_INPUTS.map(({ bytes, maybeLength }) =>
      new Ascii85Stream(new Stream(bytes), maybeLength).getBytes()
    )
  );

  benchmark("LZWStream (bug864847.pdf)", () =>
    LZW_INPUTS.map(({ bytes, maybeLength }) =>
      new LZWStream(
        new Stream(bytes),
        maybeLength,
        /* earlyChange = */ 1
      ).getBytes()
    )
  );

  benchmark("RunLengthStream (issue19326.pdf)", () =>
    RUN_LENGTH_INPUTS.map(({ bytes, maybeLength }) =>
      new RunLengthStream(new Stream(bytes), maybeLength).getBytes()
    )
  );
});
