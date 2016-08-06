/* globals expect, it, describe, PDFNetworkStream, beforeAll,
          InvalidHeaderException */

'use strict';

describe('network', function() {
  var pdf1 = new URL('../pdfs/tracemonkey.pdf', window.location).href;
  var pdf1Length = 1016315;
  var pdf2 = new URL('../pdfs/pdf.pdf', window.location).href;
  var pdf2Length = 32472771;

  it('read without stream and range', function(done) {
    var stream = new PDFNetworkStream({
      source: {
        url: pdf1,
        rangeChunkSize: 65536,
        disableStream: true,
      },
      disableRange: true
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    var len = 0, count = 0;
    var read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return;
        }
        count++;
        len += result.value.byteLength;
        return read();
      });
    };

    var readPromise = read();

    readPromise.then(function (page) {
      expect(len).toEqual(pdf1Length);
      expect(count).toEqual(1);
      expect(isStreamingSupported).toEqual(false);
      expect(isRangeSupported).toEqual(false);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  it('read with streaming', function(done) {
    var userAgent = window.navigator.userAgent;
    // The test is valid for FF only: the XHR has support of the
    // 'moz-chunked-array' response type.
    // TODO enable for other browsers, e.g. when fetch/streams API is supported.
    var m = /Mozilla\/5.0.*?rv:(\d+).*? Gecko/.exec(userAgent);
    if (!m || m[1] < 9) {
      expect(true).toEqual(true);
      done();
      return;
    }

    var stream = new PDFNetworkStream({
      source: {
        url: pdf2,
        rangeChunkSize: 65536,
        disableStream: false,
      },
      disableRange: false
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    var len = 0, count = 0;
    var read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return;
        }
        count++;
        len += result.value.byteLength;
        return read();
      });
    };

    var readPromise = read();

    readPromise.then(function () {
      expect(len).toEqual(pdf2Length);
      expect(count).toBeGreaterThan(1);
      expect(isStreamingSupported).toEqual(true);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  it('read custom ranges', function (done) {
    // We don't test on browsers that don't support range request, so
    // requiring this test to pass.
    var rangeSize = 32768;
    var stream = new PDFNetworkStream({
      source: {
        url: pdf1,
        length: pdf1Length,
        rangeChunkSize: rangeSize,
        disableStream: true,
      },
      disableRange: false
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported, fullReaderCancelled;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      // we shall be able to close the full reader without issues
      fullReader.cancel('Don\'t need full reader');
      fullReaderCancelled = true;
    });

    // Skipping fullReader results, requesting something from the PDF end.
    var tailSize = (pdf1Length % rangeSize) || rangeSize;

    var range1Reader = stream.getRangeReader(pdf1Length - tailSize - rangeSize,
                                             pdf1Length - tailSize);
    var range2Reader = stream.getRangeReader(pdf1Length - tailSize, pdf1Length);

    var result1 = {value: 0}, result2 = {value: 0};
    var read = function (reader, lenResult) {
      return reader.read().then(function (result) {
        if (result.done) {
          return;
        }
        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });
    };

    var readPromises = Promise.all([read(range1Reader, result1),
                                    read(range2Reader, result2),
                                    promise]);

    readPromises.then(function () {
      expect(result1.value).toEqual(rangeSize);
      expect(result2.value).toEqual(tailSize);
      expect(isRangeSupported).toEqual(true);
      expect(fullReaderCancelled).toEqual(true);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  describe('contentDisposition', function() {
    var parseContentDisposition;
    beforeAll(function() {
      var stream = new PDFNetworkStream({
        source: {
          url: pdf1,
          rangeChunkSize: 65536,
          disableStream: true,
        },
        disableRange: true
      });

      var fullReader = stream.getFullReader();
      parseContentDisposition =
        fullReader._parseContentDisposition;
    });

    it('should require string', function () {
      expect(parseContentDisposition.bind(null))
        .toThrowError(InvalidHeaderException, /argument string.*required/);
    });

    it('should reject non-strings', function () {
      expect(parseContentDisposition.bind(null, 42))
        .toThrowError(InvalidHeaderException, /argument string.*required/);
    });

    describe('with only type', function () {
      it('should reject quoted value', function () {
        expect(parseContentDisposition.bind(null, '"attachment"'))
          .toThrowError(InvalidHeaderException, /invalid type format/);
      });

      it('should reject trailing semicolon', function () {
        expect(parseContentDisposition.bind(null, 'attachment;'))
          .toThrowError(InvalidHeaderException, /invalid.*format/);
      });

      it('should parse "attachment"', function () {
        expect(parseContentDisposition('attachment')).toEqual({
          type: 'attachment',
          parameters: {}
        });
      });

      it('should parse "inline"', function () {
        expect(parseContentDisposition('inline')).toEqual({
          type: 'inline',
          parameters: {}
        });
      });

      it('should parse "form-data"', function () {
        expect(parseContentDisposition('form-data')).toEqual({
          type: 'form-data',
          parameters: {}
        });
      });

      it('should parse with trailing LWS', function () {
        expect(parseContentDisposition('attachment   ')).toEqual({
          type: 'attachment',
          parameters: {}
        });
      });

      it('should normalize to lower-case', function () {
        expect(parseContentDisposition('ATTACHMENT')).toEqual({
          type: 'attachment',
          parameters: {}
        });
      });
    });

    describe('with parameters', function () {
      it('should reject trailing semicolon', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename="rates.pdf";'))
          .toThrowError(InvalidHeaderException, /invalid parameter format/);
      });

      it('should reject invalid parameter name', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename@="rates.pdf"'))
          .toThrowError(InvalidHeaderException, /invalid parameter format/);
      });

      it('should reject missing parameter value', function () {
        expect(parseContentDisposition.bind(null, 'attachment; filename='))
          .toThrowError(InvalidHeaderException, /invalid parameter format/);
      });

      it('should reject invalid parameter value', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename=trolly,trains'))
          .toThrowError(InvalidHeaderException, /invalid parameter format/);
      });

      it('should reject invalid parameters', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename=total/; foo=bar'))
          .toThrowError(InvalidHeaderException, /invalid parameter format/);
      });

      it('should reject duplicate parameters', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename=foo; filename=bar'))
          .toThrowError(InvalidHeaderException, /invalid duplicate parameter/);
      });

      it('should reject missing type', function () {
        expect(parseContentDisposition.bind(null, 'filename="plans.pdf"'))
          .toThrowError(InvalidHeaderException, /invalid type format/);
        expect(parseContentDisposition.bind(null, '; filename="plans.pdf"'))
          .toThrowError(InvalidHeaderException, /invalid type format/);
      });

      it('should lower-case parameter name', function () {
        expect(parseContentDisposition('attachment; FILENAME="plans.pdf"'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: 'plans.pdf' }
          });
      });

      it('should parse quoted parameter value', function () {
        expect(parseContentDisposition('attachment; filename="plans.pdf"'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: 'plans.pdf' }
          });
      });

      it('should parse & unescape quoted value', function () {
        expect(parseContentDisposition(
              'attachment; filename="the \\"plans\\".pdf"'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: 'the "plans".pdf' }
          });
      });

      it('should include all parameters', function () {
        expect(parseContentDisposition(
              'attachment; filename="plans.pdf"; foo=bar'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: 'plans.pdf', foo: 'bar' }
          });
      });

      it('should parse token filename', function () {
        expect(parseContentDisposition(
              'attachment; filename=plans.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: 'plans.pdf' }
          });
      });

      it('should parse ISO-8859-1 filename', function () {
        expect(parseContentDisposition(
              'attachment; filename="£ rates.pdf"'))
          .toEqual({
            type: 'attachment',
            parameters: { filename: '£ rates.pdf' }
          });
      });
    });

    describe('with extended parameters', function () {
      it('should reject quoted extended parameter value', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename*="UTF-8\'\'%E2%82%AC%20rates.pdf"'))
          .toThrowError(InvalidHeaderException, /invalid extended.*value/);
      });

      it('should parse UTF-8 extended parameter value', function () {
        expect(parseContentDisposition(
              'attachment; filename*=UTF-8\'\'%E2%82%AC%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '€ rates.pdf' }
          });
      });

      it('should parse UTF-8 extended parameter value', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename*=UTF-8\'\'%E4%20rates.pdf'))
          .toThrowError(InvalidHeaderException, /invalid extended.*value/);
      });

      it('should parse ISO-8859-1 extended parameter value', function () {
        expect(parseContentDisposition(
              'attachment; filename*=ISO-8859-1\'\'%A3%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '£ rates.pdf' }
          });
        expect(parseContentDisposition(
              'attachment; filename*=ISO-8859-1\'\'%82%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '? rates.pdf' }
          });
      });

      it('should not be case-sensitive for charser', function () {
        expect(parseContentDisposition(
              'attachment; filename*=utf-8\'\'%E2%82%AC%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '€ rates.pdf' }
          });
      });

      it('should reject unsupported charset', function () {
        expect(parseContentDisposition.bind(null,
              'attachment; filename*=ISO-8859-2\'\'%A4%20rates.pdf'))
          .toThrowError(InvalidHeaderException, /unsupported charset/);
      });

      it('should parse with embedded language', function () {
        expect(parseContentDisposition(
              'attachment; filename*=UTF-8\'en\'%E2%82%AC%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '€ rates.pdf' }
          });
      });

      it('should prefer extended parameter value', function () {
        expect(parseContentDisposition(
              'attachment; filename="EURO rates.pdf"; ' +
              'filename*=UTF-8\'\'%E2%82%AC%20rates.pdf'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '€ rates.pdf' }
          });
        expect(parseContentDisposition(
              'attachment; filename*=UTF-8\'\'%E2%82%AC%20rates.pdf; ' +
              'filename="EURO rates.pdf"'))
          .toEqual({
            type: 'attachment',
            parameters: { 'filename': '€ rates.pdf' }
          });
      });
    });

    describe('from TC 2231', function () {
      describe('Disposition-Type Inline', function () {
        it('should parse "inline"', function () {
          expect(parseContentDisposition('inline')).toEqual({
            type: 'inline',
            parameters: {}
          });
        });

        it('should reject ""inline""', function () {
          expect(parseContentDisposition.bind(null, '"inline"'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should parse "inline; filename="foo.html""', function () {
          expect(parseContentDisposition('inline; filename="foo.html"'))
            .toEqual({
              type: 'inline',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should parse "inline; filename="Not an attachment!""', function () {
          expect(parseContentDisposition(
                'inline; filename="Not an attachment!"'))
            .toEqual({
              type: 'inline',
              parameters: { filename: 'Not an attachment!' }
            });
        });

        it('should parse "inline; filename="foo.pdf""', function () {
          expect(parseContentDisposition('inline; filename="foo.pdf"'))
            .toEqual({
              type: 'inline',
              parameters: { filename: 'foo.pdf' }
            });
        });
      });

      describe('Disposition-Type Attachment', function () {
        it('should parse "attachment"', function () {
          expect(parseContentDisposition('attachment')).toEqual({
            type: 'attachment',
            parameters: {}
          });
        });

        it('should reject ""attachment""', function () {
          expect(parseContentDisposition.bind(null, '"attachment"'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should parse "ATTACHMENT"', function () {
          expect(parseContentDisposition('ATTACHMENT')).toEqual({
            type: 'attachment',
            parameters: {}
          });
        });

        it('should parse "attachment; filename="foo.html""', function () {
          expect(parseContentDisposition('attachment; filename="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should parse "attachment; filename="0000000000111111111122222""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename="0000000000111111111122222"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '0000000000111111111122222' }
            });
        });

        it('should parse "attachment; ' +
            'filename="00000000001111111111222222222233333""', function () {
          expect(parseContentDisposition(
                'attachment; filename="00000000001111111111222222222233333"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '00000000001111111111222222222233333' }
            });
        });

        it('should parse "attachment; filename="f\\oo.html""', function () {
          expect(parseContentDisposition('attachment; filename="f\\oo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should parse "attachment; filename="\\"quoting\\" tested.html""',
            function () {
          expect(parseContentDisposition(
              'attachment; filename="\\"quoting\\" tested.html"')) .toEqual({
              type: 'attachment',
              parameters: { filename: '"quoting" tested.html' }
            });
        });

        it('should parse "attachment; filename="Here\'s a semicolon;.html""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename="Here\'s a semicolon;.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'Here\'s a semicolon;.html' }
            });
        });

        it('should parse "attachment; foo="bar"; filename="foo.html""',
            function () {
          expect(parseContentDisposition(
                'attachment; foo="bar"; filename="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html', foo: 'bar' }
            });
        });

        it('should parse "attachment; foo="\\"\\\\";filename="foo.html""',
            function () {
          expect(parseContentDisposition(
                'attachment; foo="\\"\\\\";filename="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html', foo: '"\\' }
            });
        });

        it('should parse "attachment; FILENAME="foo.html""', function () {
          expect(parseContentDisposition('attachment; FILENAME="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should parse "attachment; filename=foo.html"', function () {
          expect(parseContentDisposition('attachment; filename=foo.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should reject "attachment; filename=foo,bar.html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo,bar.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo.html ;"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo.html ;'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; ;filename=foo"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; ;filename=foo'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo bar.html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo bar.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should parse "attachment; filename=\'foo.bar\'', function () {
          expect(parseContentDisposition('attachment; filename=\'foo.bar\''))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '\'foo.bar\'' }
            });
        });

        it('should parse "attachment; filename="foo-ä.html""', function () {
          expect(parseContentDisposition('attachment; filename="foo-ä.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; filename="foo-Ã¤.html""', function () {
          expect(parseContentDisposition(
                'attachment; filename="foo-Ã¤.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-Ã¤.html' }
            });
        });

        it('should parse "attachment; filename="foo-%41.html""', function () {
          expect(parseContentDisposition('attachment; filename="foo-%41.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-%41.html' }
            });
        });

        it('should parse "attachment; filename="50%.html""', function () {
          expect(parseContentDisposition('attachment; filename="50%.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '50%.html' }
            });
        });

        it('should parse "attachment; filename="foo-%\\41.html""', function () {
          expect(parseContentDisposition(
                'attachment; filename="foo-%\\41.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-%41.html' }
            });
        });

        it('should parse "attachment; name="foo-%41.html""', function () {
          expect(parseContentDisposition('attachment; name="foo-%41.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { name: 'foo-%41.html' }
            });
        });

        it('should parse "attachment; filename="ä-%41.html""', function () {
          expect(parseContentDisposition('attachment; filename="ä-%41.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'ä-%41.html' }
            });
        });

        it('should parse "attachment; filename="foo-%c3%a4-%e2%82%ac.html""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename="foo-%c3%a4-%e2%82%ac.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-%c3%a4-%e2%82%ac.html' }
            });
        });

        it('should parse "attachment; filename ="foo.html""', function () {
          expect(parseContentDisposition('attachment; filename ="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html' }
            });
        });

        it('should reject "attachment; ' +
            'filename="foo.html"; filename="bar.html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename="foo.html"; filename="bar.html"'))
            .toThrowError(InvalidHeaderException,
                /invalid duplicate parameter/);
        });

        it('should reject "attachment; filename=foo[1](2).html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo[1](2).html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo-ä.html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo-ä.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo-Ã¤.html"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo-Ã¤.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "filename=foo.html"', function () {
          expect(parseContentDisposition.bind(null, 'filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject "x=y; filename=foo.html"', function () {
          expect(parseContentDisposition.bind(null, 'x=y; filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject ""foo; filename=bar;baz"; filename=qux"',
            function () {
          expect(parseContentDisposition
              .bind(null, '"foo; filename=bar;baz"; filename=qux'))
              .toThrowError(InvalidHeaderException, /invalid type format/);
          });

        it('should reject "filename=foo.html, filename=bar.html"', function () {
          expect(parseContentDisposition.bind(null,
                'filename=foo.html, filename=bar.html'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject "; filename=foo.html"', function () {
          expect(parseContentDisposition.bind(null, '; filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject ": inline; attachment; filename=foo.html',
            function () {
          expect(parseContentDisposition.bind(null,
                ': inline; attachment; filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject "inline; attachment; filename=foo.html', function () {
          expect(parseContentDisposition.bind(null,
              'inline; attachment; filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; inline; filename=foo.html', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; inline; filename=foo.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename="foo.html".txt', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; filename="foo.html".txt'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename="bar', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename="bar'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo"bar;baz"qux', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; filename=foo"bar;baz"qux'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=foo.html, ' +
            'attachment; filename=bar.html', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename=foo.html, attachment; filename=bar.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; foo=foo filename=bar', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; foo=foo filename=bar'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment; filename=bar foo=foo', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; filename=bar foo=foo'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should reject "attachment filename=bar', function () {
          expect(parseContentDisposition.bind(null, 'attachment filename=bar'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should reject "filename=foo.html; attachment', function () {
          expect(parseContentDisposition.bind(null,
              'filename=foo.html; attachment'))
            .toThrowError(InvalidHeaderException, /invalid type format/);
        });

        it('should parse "attachment; xfilename=foo.html"', function () {
          expect(parseContentDisposition('attachment; xfilename=foo.html'))
            .toEqual({
              type: 'attachment',
              parameters: { xfilename: 'foo.html' }
            });
        });

        it('should parse "attachment; filename="/foo.html""', function () {
          expect(parseContentDisposition('attachment; filename="/foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '/foo.html' }
            });
        });

        it('should parse "attachment; filename="\\\\foo.html""', function () {
          expect(parseContentDisposition('attachment; filename="\\\\foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '\\foo.html' }
            });
        });
      });

      describe('Additional Parameters', function () {
        it('should parse "attachment; ' +
            'creation-date="Wed, 12 Feb 1997 16:29:51 -0500""', function () {
          expect(parseContentDisposition(
              'attachment; creation-date="Wed, 12 Feb 1997 16:29:51 -0500"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'creation-date': 'Wed, 12 Feb 1997 16:29:51 -0500' }
            });
        });

        it('should parse "attachment; modification-date=' +
            '"Wed, 12 Feb 1997 16:29:51 -0500""', function () {
          expect(parseContentDisposition(
              'attachment; ' +
              'modification-date="Wed, 12 Feb 1997 16:29:51 -0500"'))
            .toEqual({
              type: 'attachment',
              parameters: {
                'modification-date': 'Wed, 12 Feb 1997 16:29:51 -0500'
              }
            });
        });
      });

      describe('Disposition-Type Extension', function () {
        it('should parse "foobar"', function () {
          expect(parseContentDisposition('foobar')).toEqual({
            type: 'foobar',
            parameters: {}
          });
        });

        it('should parse "attachment; example="filename=example.txt""',
            function () {
          expect(parseContentDisposition(
                'attachment; example="filename=example.txt"'))
            .toEqual({
              type: 'attachment',
              parameters: { example: 'filename=example.txt' }
            });
        });
      });

      describe('RFC 2231/5987 Encoding: Character Sets', function () {
        it('should parse "attachment; filename*=iso-8859-1\'\'foo-%E4.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*=iso-8859-1\'\'foo-%E4.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; ' +
            'filename*=UTF-8\'\'foo-%c3%a4-%e2%82%ac.html"', function () {
          expect(parseContentDisposition(
              'attachment; filename*=UTF-8\'\'foo-%c3%a4-%e2%82%ac.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä-€.html' }
            });
        });

        it('should reject "attachment; ' +
            'filename*=\'\'foo-%c3%a4-%e2%82%ac.html"', function () {
          expect(parseContentDisposition.bind(null,
              'attachment; filename*=\'\'foo-%c3%a4-%e2%82%ac.html'))
            .toThrowError(InvalidHeaderException, /invalid extended.*value/);
        });

        it('should parse "attachment; filename*=UTF-8\'\'foo-a%cc%88.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*=UTF-8\'\'foo-a%cc%88.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; ' +
            'filename*=iso-8859-1\'\'foo-%c3%a4-%e2%82%ac.html"', function () {
          expect(parseContentDisposition(
              'attachment; filename*=iso-8859-1\'\'foo-%c3%a4-%e2%82%ac.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-Ã¤-â?¬.html' }
            });
        });

        it('should parse "attachment; filename*=utf-8\'\'foo-%E4.html"',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*=utf-8\'\'foo-%E4.html'))
            .toThrowError(InvalidHeaderException, /invalid extended.*value/);
        });

        it('should reject "attachment; filename *=UTF-8\'\'foo-%c3%a4.html"',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename *=UTF-8\'\'foo-%c3%a4.html'))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should parse "attachment; filename*= UTF-8\'\'foo-%c3%a4.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*= UTF-8\'\'foo-%c3%a4.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; filename* =UTF-8\'\'foo-%c3%a4.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename* =UTF-8\'\'foo-%c3%a4.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should reject "attachment; filename*="UTF-8\'\'foo-%c3%a4.html""',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*="UTF-8\'\'foo-%c3%a4.html"'))
            .toThrowError(InvalidHeaderException,
                /invalid extended field value/);
        });

        it('should reject "attachment; filename*="foo%20bar.html""',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*="foo%20bar.html"'))
            .toThrowError(InvalidHeaderException,
                /invalid extended field value/);
        });

        it('should reject "attachment; filename*=UTF-8\'foo-%c3%a4.html"',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*=UTF-8\'foo-%c3%a4.html'))
            .toThrowError(InvalidHeaderException,
                /invalid extended field value/);
        });

        it('should reject "attachment; filename*=UTF-8\'\'foo%"', function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*=UTF-8\'\'foo%'))
            .toThrowError(InvalidHeaderException,
                /invalid extended field value/);
        });

        it('should reject "attachment; filename*=UTF-8\'\'f%oo.html"',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename*=UTF-8\'\'f%oo.html'))
            .toThrowError(InvalidHeaderException,
                /invalid extended field value/);
        });

        it('should parse "attachment; filename*=UTF-8\'\'A-%2541.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*=UTF-8\'\'A-%2541.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'A-%41.html' }
            });
        });

        it('should parse "attachment; filename*=UTF-8\'\'%5cfoo.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*=UTF-8\'\'%5cfoo.html'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: '\\foo.html' }
            });
        });
      });

      describe('RFC2231 Encoding: Continuations', function () {
        it('should parse "attachment; filename*0="foo."; filename*1="html""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*0="foo."; filename*1="html"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*0': 'foo.', 'filename*1': 'html' }
            });
        });

        it('should parse "attachment; ' +
            'filename*0="foo"; filename*1="\\b\\a\\r.html""', function () {
          expect(parseContentDisposition(
              'attachment; filename*0="foo"; filename*1="\\b\\a\\r.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*0': 'foo', 'filename*1': 'bar.html' }
            });
        });

        it('should parse "attachment; filename*0*=UTF-8\'\'foo-%c3%a4; ' +
            'filename*1=".html""', function () {
          expect(parseContentDisposition(
              'attachment; filename*0*=UTF-8\'\'foo-%c3%a4; ' +
              'filename*1=".html"'))
            .toEqual({
              type: 'attachment',
              parameters: {
                'filename*0*': 'UTF-8\'\'foo-%c3%a4',
                'filename*1': '.html'
              }
            });
        });

        it('should parse "attachment; filename*0="foo"; filename*01="bar""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*0="foo"; filename*01="bar"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*0': 'foo', 'filename*01': 'bar' }
            });
        });

        it('should parse "attachment; filename*0="foo"; filename*2="bar""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*0="foo"; filename*2="bar"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*0': 'foo', 'filename*2': 'bar' }
            });
        });

        it('should parse "attachment; filename*1="foo."; filename*2="html""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*1="foo."; filename*2="html"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*1': 'foo.', 'filename*2': 'html' }
            });
        });

        it('should parse "attachment; filename*1="bar"; filename*0="foo""',
            function () {
          expect(parseContentDisposition(
                'attachment; filename*1="bar"; filename*0="foo"'))
            .toEqual({
              type: 'attachment',
              parameters: { 'filename*1': 'bar', 'filename*0': 'foo' }
            });
        });
      });

      describe('RFC2231 Encoding: Fallback Behaviour', function () {
        it('should parse "attachment; filename="foo-ae.html"; ' +
            'filename*=UTF-8\'\'foo-%c3%a4.html"', function () {
          expect(parseContentDisposition(
              'attachment; filename="foo-ae.html"; ' +
              'filename*=UTF-8\'\'foo-%c3%a4.html'))
          .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; filename*=UTF-8\'\'foo-%c3%a4.html; ' +
            'filename="foo-ae.html"', function () {
          expect(parseContentDisposition(
                'attachment; filename*=UTF-8\'\'foo-%c3%a4.html; ' +
                'filename="foo-ae.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo-ä.html' }
            });
        });

        it('should parse "attachment; ' +
            'filename*0*=ISO-8859-15\'\'euro-sign%3d%a4; ' +
            'filename*=ISO-8859-1\'\'currency-sign%3d%a4', function () {
          expect(parseContentDisposition('attachment; ' +
                'filename*0*=ISO-8859-15\'\'euro-sign%3d%a4; ' +
                'filename*=ISO-8859-1\'\'currency-sign%3d%a4'))
            .toEqual({
              type: 'attachment',
              parameters: {
                filename: 'currency-sign=¤',
                'filename*0*': 'ISO-8859-15\'\'euro-sign%3d%a4'
              }
            });
        });

        it('should parse "attachment; foobar=x; filename="foo.html"',
            function () {
          expect(parseContentDisposition(
                'attachment; foobar=x; filename="foo.html"'))
            .toEqual({
              type: 'attachment',
              parameters: { filename: 'foo.html', foobar: 'x' }
            });
        });
      });

      describe('RFC2047 Encoding', function () {
        it('should reject "attachment; filename==?ISO-8859-1?Q?foo-=E4.html?="',
            function () {
          expect(parseContentDisposition.bind(null,
                'attachment; filename==?ISO-8859-1?Q?foo-=E4.html?='))
            .toThrowError(InvalidHeaderException, /invalid parameter format/);
        });

        it('should parse "attachment; ' +
            'filename="=?ISO-8859-1?Q?foo-=E4.html?=""', function () {
          expect(parseContentDisposition(
              'attachment; filename="=?ISO-8859-1?Q?foo-=E4.html?="'))
          .toEqual({
              type: 'attachment',
              parameters: { filename: '=?ISO-8859-1?Q?foo-=E4.html?=' }
            });
        });
      });
    });
  });
});
