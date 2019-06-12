"use strict";

{
  let isURLSupported = false;

  try {
    if (typeof URL === 'function' && typeof URL.prototype === 'object' && 'origin' in URL.prototype) {
      const u = new URL('b', 'http://a');
      u.pathname = 'c%20d';
      isURLSupported = u.href === 'http://a/c%20d';
    }
  } catch (ex) {}

  if (isURLSupported) {
    exports.URL = URL;
  } else {
    const PolyfillURL = require('../../external/url/url-lib').URL;

    const OriginalURL = require('./global_scope').URL;

    if (OriginalURL) {
      PolyfillURL.createObjectURL = function (blob) {
        return OriginalURL.createObjectURL.apply(OriginalURL, arguments);
      };

      PolyfillURL.revokeObjectURL = function (url) {
        OriginalURL.revokeObjectURL(url);
      };
    }

    exports.URL = PolyfillURL;
  }
}