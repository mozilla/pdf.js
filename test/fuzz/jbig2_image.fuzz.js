import { Jbig2Image } from "../../build/image_decoders/pdf.image_decoders.mjs";

const ignored = ["Cannot read properties", "JBIG2 error"];

function ignoredError(error) {
  return ignored.some(message => error.message.includes(message));
}

/**
 * @param {Buffer} data
 */
function fuzz(data) {
  try {
    new Jbig2Image().parse(new Uint8Array(data));
  } catch (error) {
    if (error.message && !ignoredError(error)) {
      throw error;
    }
  }
}

export { fuzz };
