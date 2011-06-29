/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var consoleTimer = {};
var console = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: "log",
      data: args
    });
  },
  
  time: function(name) {
    consoleTimer[name] = Date.now();
  },
  
  timeEnd: function(name) {
    var time = consoleTimer[name];
    if (time == null) {
      throw "Unkown timer name " + name;
    }
    this.log("Timer:", name, Date.now() - time);
  }
}
