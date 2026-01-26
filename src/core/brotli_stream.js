import { BrotliDecode } from "../../external/brotli/decode.min.js";
import { DecodeStream } from "./decode_stream.js";

class BrotliStream extends DecodeStream {
  constructor(stream, maybeLength) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
  }

  readBlock() {
    // Get all bytes from the input stream
    const bytes = this.stream.getBytes();

    // BrotliDecode expects Int8Array, convert Uint8Array to Int8Array
    const inputData = new Int8Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.length
    );

    // Current version of the  spec does not support a decoding using a
    // custom dictionary, if it lands in the spec just get the /D value in the
    // dictionary should be a stream and pass this stream into the
    // overloaded constructor or send me a mail to patch it in.
    const decodedData = BrotliDecode(inputData);

    this.buffer = new Uint8Array(
      decodedData.buffer,
      decodedData.byteOffset,
      decodedData.length
    );
    this.bufferLength = this.buffer.length;
    this.eof = true;
  }
}

export { BrotliStream };
