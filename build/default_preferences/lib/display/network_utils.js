"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createResponseStatusError = createResponseStatusError;
exports.extractFilenameFromHeader = extractFilenameFromHeader;
exports.validateRangeRequestCapabilities = validateRangeRequestCapabilities;
exports.validateResponseStatus = validateResponseStatus;

var _util = require("../shared/util");

var _content_disposition = require("./content_disposition");

function validateRangeRequestCapabilities({
  getResponseHeader,
  isHttp,
  rangeChunkSize,
  disableRange
}) {
  (0, _util.assert)(rangeChunkSize > 0, 'Range chunk size must be larger than zero');
  let returnValues = {
    allowRangeRequests: false,
    suggestedLength: undefined
  };
  let length = parseInt(getResponseHeader('Content-Length'), 10);

  if (!Number.isInteger(length)) {
    return returnValues;
  }

  returnValues.suggestedLength = length;

  if (length <= 2 * rangeChunkSize) {
    return returnValues;
  }

  if (disableRange || !isHttp) {
    return returnValues;
  }

  if (getResponseHeader('Accept-Ranges') !== 'bytes') {
    return returnValues;
  }

  let contentEncoding = getResponseHeader('Content-Encoding') || 'identity';

  if (contentEncoding !== 'identity') {
    return returnValues;
  }

  returnValues.allowRangeRequests = true;
  return returnValues;
}

function extractFilenameFromHeader(getResponseHeader) {
  const contentDisposition = getResponseHeader('Content-Disposition');

  if (contentDisposition) {
    let filename = (0, _content_disposition.getFilenameFromContentDispositionHeader)(contentDisposition);

    if (/\.pdf$/i.test(filename)) {
      return filename;
    }
  }

  return null;
}

function createResponseStatusError(status, url) {
  if (status === 404 || status === 0 && /^file:/.test(url)) {
    return new _util.MissingPDFException('Missing PDF "' + url + '".');
  }

  return new _util.UnexpectedResponseException('Unexpected server response (' + status + ') while retrieving PDF "' + url + '".', status);
}

function validateResponseStatus(status) {
  return status === 200 || status === 206;
}