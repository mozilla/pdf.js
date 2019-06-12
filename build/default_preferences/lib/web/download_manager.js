"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DownloadManager = void 0;

var _pdf = require("../pdf");

;
const DISABLE_CREATE_OBJECT_URL = _pdf.apiCompatibilityParams.disableCreateObjectURL || false;

function download(blobUrl, filename) {
  let a = document.createElement('a');

  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }

  a.href = blobUrl;
  a.target = '_parent';

  if ('download' in a) {
    a.download = filename;
  }

  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

class DownloadManager {
  constructor({
    disableCreateObjectURL = DISABLE_CREATE_OBJECT_URL
  }) {
    this.disableCreateObjectURL = disableCreateObjectURL;
  }

  downloadUrl(url, filename) {
    if (!(0, _pdf.createValidAbsoluteUrl)(url, 'http://example.com')) {
      return;
    }

    download(url + '#pdfjs.action=download', filename);
  }

  downloadData(data, filename, contentType) {
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(new Blob([data], {
        type: contentType
      }), filename);
      return;
    }

    let blobUrl = (0, _pdf.createObjectURL)(data, contentType, this.disableCreateObjectURL);
    download(blobUrl, filename);
  }

  download(blob, url, filename) {
    if (navigator.msSaveBlob) {
      if (!navigator.msSaveBlob(blob, filename)) {
        this.downloadUrl(url, filename);
      }

      return;
    }

    if (this.disableCreateObjectURL) {
      this.downloadUrl(url, filename);
      return;
    }

    let blobUrl = _pdf.URL.createObjectURL(blob);

    download(blobUrl, filename);
  }

}

exports.DownloadManager = DownloadManager;