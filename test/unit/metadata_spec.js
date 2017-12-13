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

import { Metadata } from '../../src/display/metadata';

describe('metadata', function() {
  it('should handle valid metadata', function() {
    var validData = '<x:xmpmeta xmlns:x=\'adobe:ns:meta/\'>' +
      '<rdf:RDF xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns#\'>' +
      '<rdf:Description xmlns:dc=\'http://purl.org/dc/elements/1.1/\'>' +
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Foo bar baz</rdf:li>' +
      '</rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>';
    var metadata = new Metadata(validData);

    expect(metadata.has('dc:title')).toBeTruthy();
    expect(metadata.has('dc:qux')).toBeFalsy();

    expect(metadata.get('dc:title')).toEqual('Foo bar baz');
    expect(metadata.get('dc:qux')).toEqual(null);

    expect(metadata.getAll()).toEqual({ 'dc:title': 'Foo bar baz', });
  });

  it('should repair and handle invalid metadata', function() {
    var invalidData = '<x:xmpmeta xmlns:x=\'adobe:ns:meta/\'>' +
      '<rdf:RDF xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns#\'>' +
      '<rdf:Description xmlns:dc=\'http://purl.org/dc/elements/1.1/\'>' +
      '<dc:title>\\376\\377\\000P\\000D\\000F\\000&</dc:title>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta>';
    var metadata = new Metadata(invalidData);

    expect(metadata.has('dc:title')).toBeTruthy();
    expect(metadata.has('dc:qux')).toBeFalsy();

    expect(metadata.get('dc:title')).toEqual('PDF&');
    expect(metadata.get('dc:qux')).toEqual(null);

    expect(metadata.getAll()).toEqual({ 'dc:title': 'PDF&', });
  });

  it('should repair and handle invalid metadata (bug 1424938)', function() {
    let invalidData = '<x:xmpmeta xmlns:x=\'adobe:ns:meta/\' ' +
      'x:xmptk=\'XMP toolkit 2.9.1-13, framework 1.6\'>' +
      '<rdf:RDF xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns#\' ' +
      'xmlns:iX=\'http://ns.adobe.com/iX/1.0/\'>' +
      '<rdf:Description rdf:about=\'61652fa7-fc1f-11dd-0000-ce81d41f9ecf\' ' +
      'xmlns:pdf=\'http://ns.adobe.com/pdf/1.3/\' ' +
      'pdf:Producer=\'GPL Ghostscript 8.63\'/>' +
      '<rdf:Description rdf:about=\'61652fa7-fc1f-11dd-0000-ce81d41f9ecf\' ' +
      'xmlns:xap=\'http://ns.adobe.com/xap/1.0/\' ' +
      'xap:ModifyDate=\'2009-02-13T12:42:54+01:00\' ' +
      'xap:CreateDate=\'2009-02-13T12:42:54+01:00\'>' +
      '<xap:CreatorTool>\\376\\377\\000P\\000D\\000F\\000C\\000r\\000e\\000a' +
      '\\000t\\000o\\000r\\000 \\000V\\000e\\000r\\000s\\000i\\000o\\000n' +
      '\\000 \\0000\\000.\\0009\\000.\\0006</xap:CreatorTool>' +
      '</rdf:Description><rdf:Description ' +
      'rdf:about=\'61652fa7-fc1f-11dd-0000-ce81d41f9ecf\' ' +
      'xmlns:xapMM=\'http://ns.adobe.com/xap/1.0/mm/\' ' +
      'xapMM:DocumentID=\'61652fa7-fc1f-11dd-0000-ce81d41f9ecf\'/>' +
      '<rdf:Description rdf:about=\'61652fa7-fc1f-11dd-0000-ce81d41f9ecf\' ' +
      'xmlns:dc=\'http://purl.org/dc/elements/1.1/\' ' +
      'dc:format=\'application/pdf\'><dc:title><rdf:Alt>' +
      '<rdf:li xml:lang=\'x-default\'>\\376\\377\\000L\\000&apos;\\000O\\000d' +
      '\\000i\\000s\\000s\\000e\\000e\\000 \\000t\\000h\\000\\351\\000m\\000a' +
      '\\000t\\000i\\000q\\000u\\000e\\000 \\000l\\000o\\000g\\000o\\000 ' +
      '\\000O\\000d\\000i\\000s\\000s\\000\\351\\000\\351\\000 \\000-\\000 ' +
      '\\000d\\000\\351\\000c\\000e\\000m\\000b\\000r\\000e\\000 \\0002\\0000' +
      '\\0000\\0008\\000.\\000p\\000u\\000b</rdf:li></rdf:Alt></dc:title>' +
      '<dc:creator><rdf:Seq><rdf:li>\\376\\377\\000O\\000D\\000I\\000S' +
      '</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF>' +
      '</x:xmpmeta>';
    let metadata = new Metadata(invalidData);

    expect(metadata.has('dc:title')).toBeTruthy();
    expect(metadata.has('dc:qux')).toBeFalsy();

    expect(metadata.get('dc:title')).toEqual(
      'L\'Odissee thématique logo Odisséé - décembre 2008.pub');
    expect(metadata.get('dc:qux')).toEqual(null);

    expect(metadata.getAll()).toEqual({
      'dc:creator': 'ODIS',
      'dc:title': 'L\'Odissee thématique logo Odisséé - décembre 2008.pub',
      'xap:creatortool': 'PDFCreator Version 0.9.6',
    });
  });
});
