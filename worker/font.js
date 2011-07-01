/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

importScripts("console.js");

importScripts("../pdf.js");
importScripts("../fonts.js");
importScripts("../glyphlist.js")

function fontDataToString(font) {
  // Doing postMessage on objects make them lose their "shape". This adds the
  // "shape" for all required objects agains, such that the encoding works as
  // expected.
  var fontFileDict = new Dict();
  fontFileDict.map = font.file.dict.map;

  var fontFile = new Stream(font.file.bytes, font.file.start, font.file.end - font.file.start, fontFileDict);
  font.file = new FlateStream(fontFile);
  
  // This will encode the font.
  var fontObj = new Font(font.name, font.file, font.properties);

  // Create string that is used for css later.
  var str = "";
  var data = fontObj.data;
  var length = data.length;
  for (var j = 0; j < length; j++)
    str += String.fromCharCode(data[j]);
  
  return {
    str:      str,
    encoding: font.properties.encoding
  }
}

/**
* Functions to handle data sent by the MainThread.
*/
var actionHandler = {
  "fonts": function(data) {
    var fontData;
    var result = {};
    for (var i = 0; i < data.length; i++) {
      fontData = data[i];
      result[fontData.name] = fontDataToString(fontData);
    }
    
    postMessage({
      action: "fonts",
      data:   result
    })
  },
}

// Listen to the MainThread for data and call actionHandler on it.
this.onmessage = function(event) {
  var data = event.data;
  if (data.action in actionHandler) {
    actionHandler[data.action].call(this, data.data);
  } else {
    throw "Unkown action from worker: " + data.action;
  }
}