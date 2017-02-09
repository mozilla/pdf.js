'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('test', ['exports', 'a/b', 'c/d'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../a/b.js'), require('./d.js'));
  } else {
    factory((root.E = {}), root.aB, root.cD);
  }
}(this, function (exports, aB, cD, opt) {

opt(aB + cD);
}));
