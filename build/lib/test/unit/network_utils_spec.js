/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _network_utils = require("../../display/network_utils.js");

var _util = require("../../shared/util.js");

describe("network_utils", function () {
  describe("validateRangeRequestCapabilities", function () {
    it("rejects range chunk sizes that are not larger than zero", function () {
      expect(function () {
        (0, _network_utils.validateRangeRequestCapabilities)({
          rangeChunkSize: 0
        });
      }).toThrow(new Error("Range chunk size must be larger than zero"));
    });
    it("rejects disabled or non-HTTP range requests", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: true,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Content-Length") {
            return 8;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8
      });
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: false,
        getResponseHeader: headerName => {
          if (headerName === "Content-Length") {
            return 8;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8
      });
    });
    it("rejects invalid Accept-Ranges header values", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Accept-Ranges") {
            return "none";
          } else if (headerName === "Content-Length") {
            return 8;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8
      });
    });
    it("rejects invalid Content-Encoding header values", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Accept-Ranges") {
            return "bytes";
          } else if (headerName === "Content-Encoding") {
            return "gzip";
          } else if (headerName === "Content-Length") {
            return 8;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8
      });
    });
    it("rejects invalid Content-Length header values", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Accept-Ranges") {
            return "bytes";
          } else if (headerName === "Content-Encoding") {
            return null;
          } else if (headerName === "Content-Length") {
            return "eight";
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: undefined
      });
    });
    it("rejects file sizes that are too small for range requests", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Accept-Ranges") {
            return "bytes";
          } else if (headerName === "Content-Encoding") {
            return null;
          } else if (headerName === "Content-Length") {
            return 8;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8
      });
    });
    it("accepts file sizes large enough for range requests", function () {
      expect((0, _network_utils.validateRangeRequestCapabilities)({
        disableRange: false,
        isHttp: true,
        getResponseHeader: headerName => {
          if (headerName === "Accept-Ranges") {
            return "bytes";
          } else if (headerName === "Content-Encoding") {
            return null;
          } else if (headerName === "Content-Length") {
            return 8192;
          }

          throw new Error(`Unexpected headerName: ${headerName}`);
        },
        rangeChunkSize: 64
      })).toEqual({
        allowRangeRequests: true,
        suggestedLength: 8192
      });
    });
  });
  describe("extractFilenameFromHeader", function () {
    it("returns null when content disposition header is blank", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return null;
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return undefined;
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
    });
    it("gets the filename from the response header", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "inline";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="filename.pdf"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="filename.pdf and spaces.pdf"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf and spaces.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="tl;dr.pdf"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("tl;dr.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename=filename.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename=filename.pdf someotherparam";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="%e4%b8%ad%e6%96%87.pdf"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("中文.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="100%.pdf"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("100%.pdf");
    });
    it("gets the filename from the response header (RFC 6266)", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename*=filename.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename*=''filename.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename*=utf-8''filename.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename=no.pdf; filename*=utf-8''filename.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename*=utf-8''filename.pdf; filename=no.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
    });
    it("gets the filename from the response header (RFC 2231)", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return "attachment; filename*0=filename; filename*1=.pdf";
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("filename.pdf");
    });
    it("only extracts filename with pdf extension", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'attachment; filename="filename.png"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toBeNull();
    });
    it("extension validation is case insensitive", function () {
      expect((0, _network_utils.extractFilenameFromHeader)(headerName => {
        if (headerName === "Content-Disposition") {
          return 'form-data; name="fieldName"; filename="file.PdF"';
        }

        throw new Error(`Unexpected headerName: ${headerName}`);
      })).toEqual("file.PdF");
    });
  });
  describe("createResponseStatusError", function () {
    it("handles missing PDF file responses", function () {
      expect((0, _network_utils.createResponseStatusError)(404, "https://foo.com/bar.pdf")).toEqual(new _util.MissingPDFException('Missing PDF "https://foo.com/bar.pdf".'));
      expect((0, _network_utils.createResponseStatusError)(0, "file://foo.pdf")).toEqual(new _util.MissingPDFException('Missing PDF "file://foo.pdf".'));
    });
    it("handles unexpected responses", function () {
      expect((0, _network_utils.createResponseStatusError)(302, "https://foo.com/bar.pdf")).toEqual(new _util.UnexpectedResponseException("Unexpected server response (302) while retrieving PDF " + '"https://foo.com/bar.pdf".'));
      expect((0, _network_utils.createResponseStatusError)(0, "https://foo.com/bar.pdf")).toEqual(new _util.UnexpectedResponseException("Unexpected server response (0) while retrieving PDF " + '"https://foo.com/bar.pdf".'));
    });
  });
  describe("validateResponseStatus", function () {
    it("accepts valid response statuses", function () {
      expect((0, _network_utils.validateResponseStatus)(200)).toEqual(true);
      expect((0, _network_utils.validateResponseStatus)(206)).toEqual(true);
    });
    it("rejects invalid response statuses", function () {
      expect((0, _network_utils.validateResponseStatus)(302)).toEqual(false);
      expect((0, _network_utils.validateResponseStatus)(404)).toEqual(false);
      expect((0, _network_utils.validateResponseStatus)(null)).toEqual(false);
      expect((0, _network_utils.validateResponseStatus)(undefined)).toEqual(false);
    });
  });
});