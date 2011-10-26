/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

function MessageHandler(name, comObj) {
  this.name = name;
  this.comObj = comObj;
  var ah = this.actionHandler = {};

  ah['console_log'] = [function(data) {
      console.log.apply(console, data);
  }];
  ah['console_error'] = [function(data) {
      console.error.apply(console, data);
  }];

  comObj.onmessage = function(event) {
    var data = event.data;
    if (data.action in ah) {
      var action = ah[data.action];
      action[0].call(action[1], data.data);
    } else {
      throw 'Unkown action from worker: ' + data.action;
    }
  };
}

MessageHandler.prototype = {
  on: function(actionName, handler, scope) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      throw "There is already an actionName called '" + actionName + "'";
    }
    ah[actionName] = [handler, scope];
  },

  send: function(actionName, data) {
    this.comObj.postMessage({
      action: actionName,
      data: data
    });
  }
};

