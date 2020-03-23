"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isNodeJS = void 0;
const isNodeJS = typeof process === "object" && process + "" === "[object process]" && !process.versions["nw"] && !process.versions["electron"];
exports.isNodeJS = isNodeJS;