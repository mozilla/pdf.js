import { JpegImage } from "../../build/image_decoders/pdf.image_decoders.mjs";

const ignored = ["Cannot read properties", "JPEG error"];

function ignoredError(error) {
  return ignored.some(message => error.message.includes(message));
}

/**
 * @param {Buffer} data
 */
function fuzz(data) {
  try {
    new JpegImage().parse(new Uint8Array(data));
  } catch (error) {
    if (error.message && !ignoredError(error)) {
      throw error;
    }
  }
}

export { fuzz };
