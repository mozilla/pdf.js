"use strict";

let compatibilityParams = Object.create(null);
{
  const userAgent = typeof navigator !== 'undefined' && navigator.userAgent || '';
  const isAndroid = /Android/.test(userAgent);
  const isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent);

  (function checkCanvasSizeLimitation() {
    if (isIOS || isAndroid) {
      compatibilityParams.maxCanvasPixels = 5242880;
    }
  })();
}
exports.viewerCompatibilityParams = Object.freeze(compatibilityParams);