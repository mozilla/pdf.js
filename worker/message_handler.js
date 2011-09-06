/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


function MessageHandler(name, actionHandler, comObj, scope) {
  this.name = name;
  
  actionHandler["console_log"] = function(data) {
      console.log.apply(console, data);
  }
  actionHandler["console_error"] = function(data) {
      console.error.apply(console, data);
  }

  
  comObj.onmessage = function(event) {
    var data = event.data;
    if (data.action in actionHandler) {
      actionHandler[data.action].call(scope, data.data);
    } else {
      throw 'Unkown action from worker: ' + data.action;
    }
  };
  
  this.send = function(actionName, data) {
    try {
      comObj.postMessage({
        action: actionName,
        data:   data
      });      
    } catch (e) {
      console.error("FAILED to send data from", this.name);
      throw e;
    }
  }
}