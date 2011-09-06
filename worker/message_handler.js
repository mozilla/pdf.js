/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


function MessageHandler(actionHandler, postMessage, scope) {
  this.onMessage = function(event) {
    var data = event.data;
    if (data.action in actionHandler) {
      actionHandler[data.action].call(scope, data.data);
    } else {
      throw 'Unkown action from worker: ' + data.action;
    }
  };
  
  this.send = function(actionName, data) {
    postMessage({
      action: actionName,
      data:   data
    });
  }
}