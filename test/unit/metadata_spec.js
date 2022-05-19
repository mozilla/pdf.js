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

import { isEmptyObj } from "./test_utils.js";
import { Metadata } from "../../src/display/metadata.js";
import { MetadataParser } from "../../src/core/metadata_parser.js";

function createMetadata(data) {
  const metadataParser = new MetadataParser(data);
  return new Metadata(metadataParser.serializable);
}

describe("metadata", function () {
  it("should handle valid metadata", function () {
    const data =
      "<x:xmpmeta xmlns:x='adobe:ns:meta/'>" +
      "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>" +
      "<rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/'>" +
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Foo bar baz</rdf:li>' +
      "</rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>";
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual("Foo bar baz");
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({ "dc:title": "Foo bar baz" });
  });

  it("should repair and handle invalid metadata", function () {
    const data =
      "<x:xmpmeta xmlns:x='adobe:ns:meta/'>" +
      "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>" +
      "<rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/'>" +
      "<dc:title>\\376\\377\\000P\\000D\\000F\\000&</dc:title>" +
      "</rdf:Description></rdf:RDF></x:xmpmeta>";
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual("PDF&");
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({ "dc:title": "PDF&" });
  });

  it("should repair and handle invalid metadata (bug 1424938)", function () {
    const data =
      "<x:xmpmeta xmlns:x='adobe:ns:meta/' " +
      "x:xmptk='XMP toolkit 2.9.1-13, framework 1.6'>" +
      "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' " +
      "xmlns:iX='http://ns.adobe.com/iX/1.0/'>" +
      "<rdf:Description rdf:about='61652fa7-fc1f-11dd-0000-ce81d41f9ecf' " +
      "xmlns:pdf='http://ns.adobe.com/pdf/1.3/' " +
      "pdf:Producer='GPL Ghostscript 8.63'/>" +
      "<rdf:Description rdf:about='61652fa7-fc1f-11dd-0000-ce81d41f9ecf' " +
      "xmlns:xap='http://ns.adobe.com/xap/1.0/' " +
      "xap:ModifyDate='2009-02-13T12:42:54+01:00' " +
      "xap:CreateDate='2009-02-13T12:42:54+01:00'>" +
      "<xap:CreatorTool>\\376\\377\\000P\\000D\\000F\\000C\\000r\\000e\\000a" +
      "\\000t\\000o\\000r\\000 \\000V\\000e\\000r\\000s\\000i\\000o\\000n" +
      "\\000 \\0000\\000.\\0009\\000.\\0006</xap:CreatorTool>" +
      "</rdf:Description><rdf:Description " +
      "rdf:about='61652fa7-fc1f-11dd-0000-ce81d41f9ecf' " +
      "xmlns:xapMM='http://ns.adobe.com/xap/1.0/mm/' " +
      "xapMM:DocumentID='61652fa7-fc1f-11dd-0000-ce81d41f9ecf'/>" +
      "<rdf:Description rdf:about='61652fa7-fc1f-11dd-0000-ce81d41f9ecf' " +
      "xmlns:dc='http://purl.org/dc/elements/1.1/' " +
      "dc:format='application/pdf'><dc:title><rdf:Alt>" +
      "<rdf:li xml:lang='x-default'>\\376\\377\\000L\\000&apos;\\000O\\000d" +
      "\\000i\\000s\\000s\\000e\\000e\\000 \\000t\\000h\\000\\351\\000m\\000a" +
      "\\000t\\000i\\000q\\000u\\000e\\000 \\000l\\000o\\000g\\000o\\000 " +
      "\\000O\\000d\\000i\\000s\\000s\\000\\351\\000\\351\\000 \\000-\\000 " +
      "\\000d\\000\\351\\000c\\000e\\000m\\000b\\000r\\000e\\000 \\0002\\0000" +
      "\\0000\\0008\\000.\\000p\\000u\\000b</rdf:li></rdf:Alt></dc:title>" +
      "<dc:creator><rdf:Seq><rdf:li>\\376\\377\\000O\\000D\\000I\\000S" +
      "</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF>" +
      "</x:xmpmeta>";
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual(
      "L'Odissee thématique logo Odisséé - décembre 2008.pub"
    );
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({
      "dc:creator": ["ODIS"],
      "dc:title": "L'Odissee thématique logo Odisséé - décembre 2008.pub",
      "xap:creatortool": "PDFCreator Version 0.9.6",
    });
  });

  it("should gracefully handle incomplete tags (issue 8884)", function () {
    const data =
      '<?xpacket begin="Ã¯Â»Â¿" id="W5M0MpCehiHzreSzNTczkc9d' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about=""' +
      'xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/">' +
      "</rdf:Description>" +
      '<rdf:Description rdf:about=""' +
      'xmlns:xap="http://ns.adobe.com/xap/1.0/">' +
      "<xap:ModifyDate>2010-03-25T11:20:09-04:00</xap:ModifyDate>" +
      "<xap:CreateDate>2010-03-25T11:20:09-04:00</xap:CreateDate>" +
      "<xap:MetadataDate>2010-03-25T11:20:09-04:00</xap:MetadataDate>" +
      "</rdf:Description>" +
      '<rdf:Description rdf:about=""' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<dc:format>application/pdf</dc:format>" +
      "</rdf:Description>" +
      '<rdf:Description rdf:about=""' +
      'xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">' +
      "<pdfaid:part>1</pdfaid:part>" +
      "<pdfaid:conformance>A</pdfaid:conformance>" +
      "</rdf:Description>" +
      "</rdf:RDF>" +
      "</x:xmpmeta>" +
      '<?xpacket end="w"?>';
    const metadata = createMetadata(data);

    expect(isEmptyObj(metadata.getAll())).toEqual(true);
  });

  it('should gracefully handle "junk" before the actual metadata (issue 10395)', function () {
    const data =
      'ï»¿<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta x:xmptk="TallComponents PDFObjects 1.0" ' +
      'xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" ' +
      'xmlns:pdf="http://ns.adobe.com/pdf/1.3/">' +
      "<pdf:Producer>PDFKit.NET 4.0.102.0</pdf:Producer>" +
      "<pdf:Keywords></pdf:Keywords>" +
      "<pdf:PDFVersion>1.7</pdf:PDFVersion></rdf:Description>" +
      '<rdf:Description rdf:about="" ' +
      'xmlns:xap="http://ns.adobe.com/xap/1.0/">' +
      "<xap:CreateDate>2018-12-27T13:50:36-08:00</xap:CreateDate>" +
      "<xap:ModifyDate>2018-12-27T13:50:38-08:00</xap:ModifyDate>" +
      "<xap:CreatorTool></xap:CreatorTool>" +
      "<xap:MetadataDate>2018-12-27T13:50:38-08:00</xap:MetadataDate>" +
      '</rdf:Description><rdf:Description rdf:about="" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "<dc:creator><rdf:Seq><rdf:li></rdf:li></rdf:Seq></dc:creator>" +
      "<dc:subject><rdf:Bag /></dc:subject>" +
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' +
      "</rdf:li></rdf:Alt></dc:description>" +
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default"></rdf:li>' +
      "</rdf:Alt></dc:title><dc:format>application/pdf</dc:format>" +
      '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual("");
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({
      "dc:creator": [""],
      "dc:description": "",
      "dc:format": "application/pdf",
      "dc:subject": [],
      "dc:title": "",
      "pdf:keywords": "",
      "pdf:pdfversion": "1.7",
      "pdf:producer": "PDFKit.NET 4.0.102.0",
      "xap:createdate": "2018-12-27T13:50:36-08:00",
      "xap:creatortool": "",
      "xap:metadatadate": "2018-12-27T13:50:38-08:00",
      "xap:modifydate": "2018-12-27T13:50:38-08:00",
    });
  });

  it('should correctly handle metadata containing "&apos" (issue 10407)', function () {
    const data =
      "<x:xmpmeta xmlns:x='adobe:ns:meta/'>" +
      "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>" +
      "<rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/'>" +
      "<dc:title><rdf:Alt>" +
      '<rdf:li xml:lang="x-default">&apos;Foo bar baz&apos;</rdf:li>' +
      "</rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>";
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual("'Foo bar baz'");
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({ "dc:title": "'Foo bar baz'" });
  });

  it("should gracefully handle unbalanced end tags (issue 10410)", function () {
    const data =
      '<?xpacket begin="Ã¯Â»Â¿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" ' +
      'xmlns:pdf="http://ns.adobe.com/pdf/1.3/">' +
      "<pdf:Producer>Soda PDF 5</pdf:Producer></rdf:Description>" +
      '<rdf:Description rdf:about="" ' +
      'xmlns:xap="http://ns.adobe.com/xap/1.0/">' +
      "<xap:CreateDate>2018-10-02T08:14:49-05:00</xap:CreateDate>" +
      "<xap:CreatorTool>Soda PDF 5</xap:CreatorTool>" +
      "<xap:MetadataDate>2018-10-02T08:14:49-05:00</xap:MetadataDate> " +
      "<xap:ModifyDate>2018-10-02T08:14:49-05:00</xap:ModifyDate>" +
      '</rdf:Description><rdf:Description rdf:about="" ' +
      'xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">' +
      "<xmpMM:DocumentID>uuid:00000000-1c84-3cf9-89ba-bef0e729c831" +
      "</xmpMM:DocumentID></rdf:Description>" +
      '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
    const metadata = createMetadata(data);

    expect(isEmptyObj(metadata.getAll())).toEqual(true);
  });

  it("should not be vulnerable to the billion laughs attack", function () {
    const data =
      '<?xml version="1.0"?>' +
      "<!DOCTYPE lolz [" +
      '  <!ENTITY lol "lol">' +
      '  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
      '  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">' +
      '  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">' +
      '  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">' +
      '  <!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">' +
      '  <!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;">' +
      '  <!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;">' +
      '  <!ENTITY lol8 "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;">' +
      '  <!ENTITY lol9 "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;">' +
      "]>" +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '  <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      "    <dc:title>" +
      "      <rdf:Alt>" +
      '        <rdf:li xml:lang="x-default">a&lol9;b</rdf:li>' +
      "      </rdf:Alt>" +
      "    </dc:title>" +
      "  </rdf:Description>" +
      "</rdf:RDF>";
    const metadata = createMetadata(data);

    expect(metadata.has("dc:title")).toBeTruthy();
    expect(metadata.has("dc:qux")).toBeFalsy();

    expect(metadata.get("dc:title")).toEqual("a&lol9;b");
    expect(metadata.get("dc:qux")).toEqual(null);

    expect(metadata.getAll()).toEqual({ "dc:title": "a&lol9;b" });
  });
});
