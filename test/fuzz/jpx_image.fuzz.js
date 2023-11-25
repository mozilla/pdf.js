import { JpxImage } from "../../build/image_decoders/pdf.image_decoders.mjs";

const ignored = ["Cannot read properties", "JPX error"];

function ignoredError(error) {
  return ignored.some(message => error.message.includes(message));
}

/**
 * @param {Buffer} data
 */
function fuzz(data) {
  try {
    new JpxImage().parse(new Uint8Array(data));
  } catch (error) {
    if (error.message && !ignoredError(error)) {
      throw error;
    }
  }
}

export { fuzz };
