/* Copyright 2017 Mozilla Foundation
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
 */

import {
  createHeaders,
  createResponseError,
  extractFilenameFromHeader,
  validateRangeRequestCapabilities,
  validateResponseStatus,
} from "../../src/display/network_utils.js";
import { ResponseException } from "../../src/shared/util.js";

describe("network_utils", function () {
  describe("createHeaders", function () {
    it("returns empty `Headers` for invalid input", function () {
      const headersArr = [
        createHeaders(
          /* isHttp = */ false,
          /* httpHeaders = */ { "Content-Length": 100 }
        ),
        createHeaders(/* isHttp = */ true, /* httpHeaders = */ undefined),
        createHeaders(/* isHttp = */ true, /* httpHeaders = */ null),
        createHeaders(/* isHttp = */ true, /* httpHeaders = */ "abc"),
        createHeaders(/* isHttp = */ true, /* httpHeaders = */ 123),
      ];
      const emptyObj = Object.create(null);

      for (const headers of headersArr) {
        expect(Object.fromEntries(headers)).toEqual(emptyObj);
      }
    });

    it("returns populated `Headers` for valid input", function () {
      const headers = createHeaders(
        /* isHttp = */ true,
        /* httpHeaders = */ {
          "Content-Length": 100,
          "Accept-Ranges": "bytes",
          "Dummy-null": null,
          "Dummy-undefined": undefined,
        }
      );

      expect(Object.fromEntries(headers)).toEqual({
        "content-length": "100",
        "accept-ranges": "bytes",
        "dummy-null": "null",
      });
    });
  });

  describe("validateRangeRequestCapabilities", function () {
    it("rejects invalid rangeChunkSize", function () {
      expect(function () {
        validateRangeRequestCapabilities({ rangeChunkSize: "abc" });
      }).toThrow(
        new Error("rangeChunkSize must be an integer larger than zero.")
      );

      expect(function () {
        validateRangeRequestCapabilities({ rangeChunkSize: 0 });
      }).toThrow(
        new Error("rangeChunkSize must be an integer larger than zero.")
      );
    });

    it("rejects disabled or non-HTTP range requests", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: true,
          isHttp: true,
          responseHeaders: new Headers({
            "Content-Length": 8,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8,
      });

      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: false,
          responseHeaders: new Headers({
            "Content-Length": 8,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8,
      });
    });

    it("rejects invalid Accept-Ranges header values", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: true,
          responseHeaders: new Headers({
            "Accept-Ranges": "none",
            "Content-Length": 8,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8,
      });
    });

    it("rejects invalid Content-Encoding header values", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: true,
          responseHeaders: new Headers({
            "Accept-Ranges": "bytes",
            "Content-Encoding": "gzip",
            "Content-Length": 8,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8,
      });
    });

    it("rejects invalid Content-Length header values", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: true,
          responseHeaders: new Headers({
            "Accept-Ranges": "bytes",
            "Content-Length": "eight",
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: undefined,
      });
    });

    it("rejects file sizes that are too small for range requests", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: true,
          responseHeaders: new Headers({
            "Accept-Ranges": "bytes",
            "Content-Length": 8,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: false,
        suggestedLength: 8,
      });
    });

    it("accepts file sizes large enough for range requests", function () {
      expect(
        validateRangeRequestCapabilities({
          disableRange: false,
          isHttp: true,
          responseHeaders: new Headers({
            "Accept-Ranges": "bytes",
            "Content-Length": 8192,
          }),
          rangeChunkSize: 64,
        })
      ).toEqual({
        allowRangeRequests: true,
        suggestedLength: 8192,
      });
    });
  });

  describe("extractFilenameFromHeader", function () {
    it("returns null when content disposition header is blank", function () {
      expect(
        extractFilenameFromHeader(
          new Headers({
            // Empty headers.
          })
        )
      ).toBeNull();

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "",
          })
        )
      ).toBeNull();
    });

    it("gets the filename from the response header", function () {
      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "inline",
          })
        )
      ).toBeNull();

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "attachment",
          })
        )
      ).toBeNull();

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": 'attachment; filename="filename.pdf"',
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              'attachment; filename="filename.pdf and spaces.pdf"',
          })
        )
      ).toEqual("filename.pdf and spaces.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": 'attachment; filename="tl;dr.pdf"',
          })
        )
      ).toEqual("tl;dr.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "attachment; filename=filename.pdf",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              "attachment; filename=filename.pdf someotherparam",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              'attachment; filename="%e4%b8%ad%e6%96%87.pdf"',
          })
        )
      ).toEqual("中文.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": 'attachment; filename="100%.pdf"',
          })
        )
      ).toEqual("100%.pdf");
    });

    it("gets the filename from the response header (RFC 6266)", function () {
      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "attachment; filename*=filename.pdf",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "attachment; filename*=''filename.pdf",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": "attachment; filename*=utf-8''filename.pdf",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              "attachment; filename=no.pdf; filename*=utf-8''filename.pdf",
          })
        )
      ).toEqual("filename.pdf");

      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              "attachment; filename*=utf-8''filename.pdf; filename=no.pdf",
          })
        )
      ).toEqual("filename.pdf");
    });

    it("gets the filename from the response header (RFC 2231)", function () {
      // Tests continuations (RFC 2231 section 3, via RFC 5987 section 3.1).
      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              "attachment; filename*0=filename; filename*1=.pdf",
          })
        )
      ).toEqual("filename.pdf");
    });

    it("only extracts filename with pdf extension", function () {
      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition": 'attachment; filename="filename.png"',
          })
        )
      ).toBeNull();
    });

    it("extension validation is case insensitive", function () {
      expect(
        extractFilenameFromHeader(
          new Headers({
            "Content-Disposition":
              'form-data; name="fieldName"; filename="file.PdF"',
          })
        )
      ).toEqual("file.PdF");
    });
  });

  describe("createResponseError", function () {
    function testCreateResponseError(url, status, missing) {
      const error = createResponseError(status, url);

      expect(error instanceof ResponseException).toEqual(true);
      expect(error.message).toEqual(
        `Unexpected server response (${status}) while retrieving PDF "${url}".`
      );
      expect(error.status).toEqual(status);
      expect(error.missing).toEqual(missing);
    }

    it("handles missing PDF file responses", function () {
      testCreateResponseError("https://foo.com/bar.pdf", 404, true);

      testCreateResponseError("file://foo.pdf", 0, true);
    });

    it("handles unexpected responses", function () {
      testCreateResponseError("https://foo.com/bar.pdf", 302, false);

      testCreateResponseError("https://foo.com/bar.pdf", 0, false);
    });
  });

  describe("validateResponseStatus", function () {
    it("accepts valid response statuses", function () {
      expect(validateResponseStatus(200)).toEqual(true);
      expect(validateResponseStatus(206)).toEqual(true);
    });

    it("rejects invalid response statuses", function () {
      expect(validateResponseStatus(302)).toEqual(false);
      expect(validateResponseStatus(404)).toEqual(false);
      expect(validateResponseStatus(null)).toEqual(false);
      expect(validateResponseStatus(undefined)).toEqual(false);
    });
  });
});
