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
});
