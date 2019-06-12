"use strict";

let compatibilityParams = Object.create(null);
{
  const isNodeJS = require('../shared/is_node');

  const userAgent = typeof navigator !== 'undefined' && navigator.userAgent || '';
  const isIE = /Trident/.test(userAgent);
  const isIOSChrome = /CriOS/.test(userAgent);

  (function checkOnBlobSupport() {
    if (isIE || isIOSChrome) {
      compatibilityParams.disableCreateObjectURL = true;
    }
  })();

  (function checkFontFaceAndImage() {
    if (isNodeJS()) {
      compatibilityParams.disableFontFace = true;
      compatibilityParams.nativeImageDecoderSupport = 'none';
    }
  })();
}
exports.apiCompatibilityParams = Object.freeze(compatibilityParams);