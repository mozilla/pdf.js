"use strict";

module.exports = function isNodeJS() {
  return typeof process === 'object' && process + '' === '[object process]' && !process.versions['nw'] && !process.versions['electron'];
};