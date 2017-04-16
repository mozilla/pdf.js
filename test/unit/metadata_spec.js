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
  describe('incorrect_xmp', function() {
    it('should fix the incorrect XMP data', function() {
      var invalidXMP = '<x:xmpmeta xmlns:x=\'adobe:ns:meta/\'>' +
        '<rdf:RDF xmlns:rdf=\'http://www.w3.org/1999/02/22-rdf-syntax-ns#\'>' +
        '<rdf:Description xmlns:dc=\'http://purl.org/dc/elements/1.1/\'>' +
        '<dc:title>\\376\\377\\000P\\000D\\000F\\000&</dc:title>' +
        '</rdf:Description></rdf:RDF></x:xmpmeta>';
      var meta = new Metadata(invalidXMP);
      expect(meta.get('dc:title')).toEqual('PDF&');
    });
  });
});
