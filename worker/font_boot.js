/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

importScripts('console.js');
importScripts('message_handler.js');
importScripts('../pdf.js');
importScripts('../fonts.js');
importScripts('../crypto.js');
importScripts('../glyphlist.js');
importScripts('font_handler.js');


var handler = new MessageHandler("worker_font", this);
WorkerFontHandler.setup(handler);
