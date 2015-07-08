/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, beforeEach, Name, Dict, Ref, PDFDataWriter,
           jasmine, bytesToString, stringToBytes */

'use strict';

describe('pdf_data_writer', function() {
  beforeEach(function() {
    function toReadableString(s) {
      if (s instanceof Uint8Array) {
        s = bytesToString(s);
      }
      s = s.replace(/[^\x20-\x7E]/g, function(c) {
        c = c.charCodeAt(0);
        if (c === 10) {
          return '\\n';
        }
        if (c === 13) {
          return '\\r';
        }
        if (c < 16) {
          return '\\x0' + c.toString(16);
        }
        return '\\x' + c.toString(16);
      });
      return '"' + s.replace(/"/g, '\\"') + '"';
    }
    this.addMatchers({
      /**
       * Verifies that the input is a typed array whose content equals the
       * given string (which only contains 8-bit characters).
       */
      toMatchTypedString: function(expected) {
        var actual = this.actual;
        if (!(actual instanceof Uint8Array)) {
          this.message = function() {
            return 'Expected ' + toReadableString(actual) + ' to be ' +
              'a Uint8Array matching ' + toReadableString(expected) + '.';
          };
          return false;
        }
        this.message = function() {
          return 'Expected ' + toReadableString(actual) +
            ' to be equal to ' + toReadableString(expected) + '.';
        };
        if (actual.length !== expected.length) {
          return false;
        }
        for (var i = 0, ii = expected.length; i < ii; i++) {
          var a = actual[i], b = expected.charCodeAt(i);
          if (a !== b) {
            return false;
          }
        }
        return true;
      },
    });
  });

  describe('PDFDataWriter', function() {

    it('should support a constructor that takes existing data', function() {
      expect(new PDFDataWriter(stringToBytes('initial data')).toUint8Array())
        .toMatchTypedString('initial data');
      expect(new PDFDataWriter(null, 3).length).toEqual(3);
      expect(new PDFDataWriter(new Uint8Array(8), 3).length).toEqual(11);
    });

    it('should support booleans', function() {
      expect(new PDFDataWriter().appendBool(true).toUint8Array())
        .toMatchTypedString('true');

      expect(new PDFDataWriter().append(true).toUint8Array())
        .toMatchTypedString('true');
      expect(new PDFDataWriter().append(false).toUint8Array())
        .toMatchTypedString('false');
    });

    it('should support integers', function() {
      expect(new PDFDataWriter().appendNum(-1).toUint8Array())
        .toMatchTypedString('-1');

      expect(new PDFDataWriter().append(-1).toUint8Array())
        .toMatchTypedString('-1');
      expect(new PDFDataWriter().append(0).toUint8Array())
        .toMatchTypedString('0');
      expect(new PDFDataWriter().append(1).toUint8Array())
        .toMatchTypedString('1');
      expect(new PDFDataWriter().append(-2147483647).toUint8Array())
        .toMatchTypedString('-2147483647');
      expect(new PDFDataWriter().append(2147483647).toUint8Array())
        .toMatchTypedString('2147483647');
      expect(new PDFDataWriter().append(4294967295).toUint8Array())
        .toMatchTypedString('4294967295');
      expect(new PDFDataWriter().append(1e100).toUint8Array())
        .toMatchTypedString('1e+100');
      expect(new PDFDataWriter().append(1.23e-45).toUint8Array())
        .toMatchTypedString('1.23e-45');
      expect(new PDFDataWriter().append(-1.23e-45).toUint8Array())
        .toMatchTypedString('-1.23e-45');
    });

    it('should support reals', function() {
      expect(new PDFDataWriter().appendNum(-1.01).toUint8Array())
        .toMatchTypedString('-1.01');

      expect(new PDFDataWriter().append(-1.01).toUint8Array())
        .toMatchTypedString('-1.01');
      expect(new PDFDataWriter().append(0.01).toUint8Array())
        .toMatchTypedString('0.01');
    });

    it('should support strings', function() {
      expect(new PDFDataWriter().appendString('').toUint8Array())
        .toMatchTypedString('<>');

      expect(new PDFDataWriter().append('').toUint8Array())
        .toMatchTypedString('<>');
      expect(new PDFDataWriter().append('Test').toUint8Array())
        .toMatchTypedString('<54657374>');
    });

    it('should support Name', function() {
      expect(new PDFDataWriter().appendName(new Name('')).toUint8Array())
        .toMatchTypedString('/');

      expect(new PDFDataWriter().append(new Name('')).toUint8Array())
        .toMatchTypedString('/');
      expect(new PDFDataWriter().append(new Name('abc123!~')).toUint8Array())
        .toMatchTypedString('/abc123!~');
      expect(new PDFDataWriter().append(new Name('#()<>[]{}/%')).toUint8Array())
        .toMatchTypedString('/#23#28#29#3C#3E#5B#5D#7B#7D#2F#25');
      expect(new PDFDataWriter().append(new Name('~\n\r\t\b\f')).toUint8Array())
        .toMatchTypedString('/~#0A#0D#09#08#0C');
    });

    it('should support null', function() {
      expect(new PDFDataWriter().appendNull().toUint8Array())
        .toMatchTypedString('null');

      expect(new PDFDataWriter().append(null).toUint8Array())
        .toMatchTypedString('null');
      expect(new PDFDataWriter().append(undefined).toUint8Array())
        .toMatchTypedString('null');
    });

    it('should support Ref', function() {
      expect(new PDFDataWriter().appendRef(new Ref(0, 0)).toUint8Array())
        .toMatchTypedString('0 0 R');

      expect(new PDFDataWriter().append(new Ref(0, 0)).toUint8Array())
        .toMatchTypedString('0 0 R');
      expect(new PDFDataWriter().append(new Ref(123, 45)).toUint8Array())
        .toMatchTypedString('123 45 R');
    });

    it('should support Array', function() {
      expect(new PDFDataWriter().appendArray([]).toUint8Array())
        .toMatchTypedString('[]');

      expect(new PDFDataWriter().append([]).toUint8Array())
        .toMatchTypedString('[]');
      expect(new PDFDataWriter().append([1, 2, 3]).toUint8Array())
        .toMatchTypedString('[1 2 3]');
      expect(new PDFDataWriter().append([1, '1', 0, '0', [2]]).toUint8Array())
        .toMatchTypedString('[1 <31> 0 <30> [2]]');
    });

    it('should support Dict', function() {
      expect(new PDFDataWriter().appendDict(new Dict()).toUint8Array())
        .toMatchTypedString('<<>>');

      expect(new PDFDataWriter().append(new Dict()).toUint8Array())
        .toMatchTypedString('<<>>');

      var dict = new Dict();
      dict.set('some key', '& value');
      expect(new PDFDataWriter().append(dict).toUint8Array())
        .toMatchTypedString('<</some#20key <262076616C7565>>>');

      dict.set('another', '');
      dict.set('and', null);
      dict.set('etc', 1.1);
      dict.set('dict', new Dict());
      dict.set('ref', new Ref(0, 0));
      expect(new PDFDataWriter().append(dict).toUint8Array())
        .toMatchTypedString('<</some#20key <262076616C7565>' +
              '/another <>/and null/etc 1.1/dict <<>>/ref 0 0 R>>');
    });

    it('should support typed arrays', function() {
      var expectedData = 'test value';
      var data = stringToBytes(expectedData);
      expect(new PDFDataWriter().appendUint8Array(data).toUint8Array())
        .toMatchTypedString(expectedData);

      expect(new PDFDataWriter().append(data).toUint8Array())
        .toMatchTypedString(expectedData);
      expect(new PDFDataWriter().append(data.buffer).toUint8Array())
        .toMatchTypedString(expectedData);
    });

    it('should expose a length property', function() {
      var writer = new PDFDataWriter();
      expect(writer.length).toEqual(0);
      expect(writer.append(new Uint8Array(1)).length).toEqual(1);
      expect(writer.append(new Uint8Array(2)).length).toEqual(3);
    });

    it('should not make unnecessary copies', function() {
      var data = new Uint8Array([1, 2, 3]);
      var writer = new PDFDataWriter();
      expect(writer.append(data).toUint8Array()).toBe(data);
      expect(writer.append(new Uint8Array(0)).toUint8Array()).toBe(data);
    });

    it('should not support plain objects', function() {
      var writer = new PDFDataWriter();
      expect(function() {
        writer.append({});
      }).toThrow(
        new Error('Cannot append object of unknown type: [object Object]'));
    });

    it('should support stream objects', function() {
      var data = new Uint8Array([32, 32]);
      var streamDict = new Dict();
      streamDict.set('Length', data.byteLength + 1);
      expect(new PDFDataWriter()
        .startStream(streamDict)
        .append(data)
        .endStream()
        .toUint8Array()
      ).toMatchTypedString('<</Length 3>>\nstream\n  \nendstream\n');

      expect(function() {
        new PDFDataWriter().endStream();
      }).toThrow(new Error('Cannot close a stream without opening one'));

      expect(function() {
        new PDFDataWriter().startStream(streamDict).startStream(streamDict);
      }).toThrow(new Error(
          'Cannot start a new stream while the previous one is open'));
    });

    it('should support indirect objects', function() {
      expect(new PDFDataWriter()
          .startObj(new Ref(123, 45))
          .append(6789)
          .endObj()
          .toUint8Array()
      ).toMatchTypedString('\n123 45 obj\n6789\nendobj\n');

      expect(function() {
        new PDFDataWriter().endObj();
      }).toThrow(new Error('Cannot close a non-existing indirect object'));

      expect(function() {
        new PDFDataWriter().startObj(new Ref(0, 1)).startObj(new Ref(0, 1));
      }).toThrow(new Error(
          'Cannot start a new indirect object while the previous one is open'));
    });

    it('should support XRef tables and trailer', function() {
      var trailerDict = new Dict();
      trailerDict.set('Root', new Ref(1, 0));
      trailerDict.set('Size', 1);

      expect(new PDFDataWriter(stringToBytes('%PDF-1.1'))
          .startObj(new Ref(1, 0))
          .append(6789)
          .endObj()
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('%PDF-1.1\n1 0 obj\n6789\nendobj\n' +
          '\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n30\n%%EOF\n');

      var pdfDataWriter = new PDFDataWriter(stringToBytes('%PDF-1.1'))
          .startObj(new Ref(5, 1))
          .append(6789)
          .endObj()
          .setTrailer(trailerDict)
          .appendTrailer();

      var expectedPDFData =
          '%PDF-1.1\n5 1 obj\n6789\nendobj\n' +
          '\nxref\n0 1\n0000000000 65535 f \n5 1\n0000000009 00001 n \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n30\n%%EOF\n';

      // Sparse XRef table should result in two subsections.
      expect(pdfDataWriter.toUint8Array()).toMatchTypedString(expectedPDFData);

      // Check whether the new second generated xref table points to the
      // previous one. And also whether the new table does not contain the
      // previous entries.
      expect(pdfDataWriter.appendTrailer().toUint8Array()).toMatchTypedString(
          expectedPDFData +
          '\nxref\n0 1\n0000000000 65535 f \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R/Prev 30>>\nstartxref\n135\n%%EOF\n');

      expect(function() {
        new PDFDataWriter(null).appendTrailer();
      }).toThrow(new Error('setTrailer must be called first'));
    });

    it('should generate XRef table starting at offset 0', function() {
      var trailerDict = new Dict();
      trailerDict.set('Root', new Ref(1, 0));
      trailerDict.set('Size', 1);

      expect(new PDFDataWriter(stringToBytes('%PDF-1.1'))
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('%PDF-1.1\nxref\n0 1\n0000000000 65535 f \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n9\n%%EOF\n');

      expect(new PDFDataWriter(null, 0)
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('\nxref\n0 1\n0000000000 65535 f \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n1\n%%EOF\n');

      expect(new PDFDataWriter(null, 1337)
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('\nxref\n0 1\n0000000000 65535 f \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n1338\n%%EOF\n');
    });

    it('should support a pure XRef stream and trailer', function() {
      var trailerDict = new Dict();
      trailerDict.set('Type', new Name('XRef'));
      trailerDict.set('Root', new Ref(1, 0));
      trailerDict.set('Size', 2);

      expect(new PDFDataWriter(null)
          .startObj(new Ref(1, 0))
          .append(6789)
          .endObj()
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('\n1 0 obj\n6789\nendobj\n' +
        '\n2 0 obj\n<</Size 3/Root 1 0 R/Filter /ASCIIHexDecode' +
        '/Length 26/Type /XRef/Index [0 3]/W [1 1 2]>>\nstream\n' +
        '0000FFFF' +
        '01010000' +
        '01160000>' +
        '\nendstream\n\nendobj\n\nstartxref\n22\n%%EOF\n');

      // Test whether Index contains multiple pairs for a sparse xref table.
      expect(new PDFDataWriter(null)
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString(
        '\n2 0 obj\n<</Size 3/Root 1 0 R/Filter /ASCIIHexDecode' +
        '/Length 18/Type /XRef/Index [0 1 2 1]/W [1 1 2]>>\nstream\n' +
        '0000FFFF' +
        '01010000>' +
        '\nendstream\n\nendobj\n\nstartxref\n1\n%%EOF\n');
    });

    it('should point to the xref as set by setStartXRef', function() {
      var trailerDict = new Dict();
      trailerDict.set('Root', new Ref(1, 0));
      trailerDict.set('Size', 1);

      expect(new PDFDataWriter(null)
          .setStartXRef(7777)
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString('\nxref\n0 1\n0000000000 65535 f \n' +
          '\ntrailer\n<</Size 1/Root 1 0 R/Prev 7777>>\nstartxref\n1\n%%EOF\n');

      trailerDict.set('Type', new Name('XRef'));
      expect(new PDFDataWriter(null)
          .setStartXRef(7777)
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString(
        '\n1 0 obj\n<</Size 2/Root 1 0 R/Prev 7777/Filter /ASCIIHexDecode' +
        '/Length 18/Type /XRef/Index [0 2]/W [1 1 2]>>\nstream\n' +
        '0000FFFF' +
        '01010000>' +
        '\nendstream\n\nendobj\n\nstartxref\n1\n%%EOF\n');
    });

    it('should be able to generate a valid PDF file', function(done) {
      var fixtureFileLocation = '../pdfs/written-with-pdfjs.pdf';
      var x = new XMLHttpRequest();
      x.open('GET', fixtureFileLocation, false);
      x.send();
      var expectedPDFData = x.responseText;

      var catalog = new Dict();
      catalog.set('Type', new Name('Catalog'));
      catalog.set('Pages', new Ref(2, 0));

      var pages = new Dict();
      pages.set('Type', new Name('Pages'));
      pages.set('Count', 1);
      pages.set('Kids', [new Ref(3, 0)]);
      pages.set('MediaBox', [0, 0, 200, 100]);

      var type1FontDict = new Dict();
      type1FontDict.set('Type', new Name('Font'));
      type1FontDict.set('Subtype', new Name('Type1'));
      type1FontDict.set('BaseFont', new Name('Arial'));

      var fontDict = new Dict();
      fontDict.set('F1', type1FontDict);

      var resourcesDict = new Dict();
      resourcesDict.set('Font', fontDict);

      var page1 = new Dict();
      page1.set('Type', new Name('Page'));
      page1.set('Parent', new Ref(2, 0));
      page1.set('Resources', resourcesDict);
      page1.set('Contents', new Ref(4, 0));

      var streamData =
        stringToBytes('BT/F1 20 Tf 0 0 Td(Written with PDF.js) Tj ET');
      var streamDict = new Dict();
      streamDict.set('Length', streamData.byteLength + 1);

      var trailerDict = new Dict();
      trailerDict.set('Size', 5);
      trailerDict.set('Root', new Ref(1, 0));

      expect(new PDFDataWriter(stringToBytes('%PDF-1.1'))
          .startObj(new Ref(1, 0))
          .append(catalog)
          .endObj()
          .startObj(new Ref(2, 0))
          .append(pages)
          .endObj()
          .startObj(new Ref(3, 0))
          .append(page1)
          .endObj()
          .startObj(new Ref(4, 0))
          .startStream(streamDict)
          .append(streamData)
          .endStream()
          .endObj()
          .setTrailer(trailerDict)
          .appendTrailer()
          .toUint8Array()
      ).toMatchTypedString(expectedPDFData);
    });
  });
});
