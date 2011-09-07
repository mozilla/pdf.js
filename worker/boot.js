/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

importScripts('console.js');
importScripts('message_handler.js');
importScripts('../pdf.js');
importScripts('../fonts.js');
importScripts('../crypto.js');
importScripts('../glyphlist.js');
importScripts('handler.js');

// Listen for messages from the main thread.
var pdfDoc = null;

var handler = new MessageHandler("worker", this);
WorkerHandler.setup(handler);
