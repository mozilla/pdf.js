"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericCom = void 0;

var _app = require("./app");

var _preferences = require("./preferences");

var _download_manager = require("./download_manager");

var _genericl10n = require("./genericl10n");

;
let GenericCom = {};
exports.GenericCom = GenericCom;

class GenericPreferences extends _preferences.BasePreferences {
  async _writeToStorage(prefObj) {
    localStorage.setItem('pdfjs.preferences', JSON.stringify(prefObj));
  }

  async _readFromStorage(prefObj) {
    return JSON.parse(localStorage.getItem('pdfjs.preferences'));
  }

}

let GenericExternalServices = Object.create(_app.DefaultExternalServices);

GenericExternalServices.createDownloadManager = function (options) {
  return new _download_manager.DownloadManager(options);
};

GenericExternalServices.createPreferences = function () {
  return new GenericPreferences();
};

GenericExternalServices.createL10n = function ({
  locale = 'en-US'
}) {
  return new _genericl10n.GenericL10n(locale);
};

_app.PDFViewerApplication.externalServices = GenericExternalServices;