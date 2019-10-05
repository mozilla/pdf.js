/* Copyright 2019 Mozilla Foundation
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

import { Dict, Ref } from '../../src/core/primitives';
import {
  getInheritableProperty, toRomanNumerals
} from '../../src/core/core_utils';
import { XRefMock } from './test_utils';

describe('core_utils', function() {
  describe('getInheritableProperty', function() {
    it('handles non-dictionary arguments', function() {
      expect(getInheritableProperty({ dict: null, key: 'foo', }))
        .toEqual(undefined);
      expect(getInheritableProperty({ dict: undefined, key: 'foo', }))
        .toEqual(undefined);
    });

    it('handles dictionaries that do not contain the property', function() {
      // Empty dictionary.
      const emptyDict = new Dict();
      expect(getInheritableProperty({ dict: emptyDict, key: 'foo', }))
        .toEqual(undefined);

      // Filled dictionary with a different property.
      const filledDict = new Dict();
      filledDict.set('bar', 'baz');
      expect(getInheritableProperty({ dict: filledDict, key: 'foo', }))
        .toEqual(undefined);
    });

    it('fetches the property if it is not inherited', function() {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const dict = new Dict(xref);

      // Regular values should be fetched.
      dict.set('foo', 'bar');
      expect(getInheritableProperty({ dict, key: 'foo', })).toEqual('bar');

      // Array value should be fetched (with references resolved).
      dict.set('baz', ['qux', ref]);
      expect(getInheritableProperty({ dict, key: 'baz', getArray: true, }))
        .toEqual(['qux', 'quux']);
    });

    it('fetches the property if it is inherited and present on one level',
        function() {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set('Parent', secondDict);

      // Regular values should be fetched.
      secondDict.set('foo', 'bar');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo', }))
        .toEqual('bar');

      // Array value should be fetched (with references resolved).
      secondDict.set('baz', ['qux', ref]);
      expect(getInheritableProperty({ dict: firstDict, key: 'baz',
                                      getArray: true, }))
        .toEqual(['qux', 'quux']);
    });

    it('fetches the property if it is inherited and present on multiple levels',
        function() {
      const ref = Ref.get(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set('Parent', secondDict);

      // Regular values should be fetched.
      firstDict.set('foo', 'bar1');
      secondDict.set('foo', 'bar2');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo', }))
        .toEqual('bar1');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo',
                                      getArray: false, stopWhenFound: false, }))
        .toEqual(['bar1', 'bar2']);

      // Array value should be fetched (with references resolved).
      firstDict.set('baz', ['qux1', ref]);
      secondDict.set('baz', ['qux2', ref]);
      expect(getInheritableProperty({ dict: firstDict, key: 'baz',
                                      getArray: true, stopWhenFound: false, }))
        .toEqual([['qux1', 'quux'], ['qux2', 'quux']]);
    });

    it('stops searching when the loop limit is reached', function() {
      const dict = new Dict();
      let currentDict = dict;
      let parentDict = null;
      for (let i = 0; i < 150; i++) { // Exceeds the loop limit of 100.
        parentDict = new Dict();
        currentDict.set('Parent', parentDict);
        currentDict = parentDict;
      }
      parentDict.set('foo', 'bar'); // Never found because of loop limit.
      expect(getInheritableProperty({ dict, key: 'foo', })).toEqual(undefined);

      dict.set('foo', 'baz');
      expect(getInheritableProperty({ dict, key: 'foo', getArray: false,
                                      stopWhenFound: false, }))
        .toEqual(['baz']);
    });
  });

  describe('toRomanNumerals', function() {
    it('handles invalid arguments', function() {
      for (const input of ['foo', -1, 0]) {
        expect(function() {
          toRomanNumerals(input);
        }).toThrow(new Error('The number should be a positive integer.'));
      }
    });

    it('converts numbers to uppercase Roman numerals', function() {
      expect(toRomanNumerals(1)).toEqual('I');
      expect(toRomanNumerals(6)).toEqual('VI');
      expect(toRomanNumerals(7)).toEqual('VII');
      expect(toRomanNumerals(8)).toEqual('VIII');
      expect(toRomanNumerals(10)).toEqual('X');
      expect(toRomanNumerals(40)).toEqual('XL');
      expect(toRomanNumerals(100)).toEqual('C');
      expect(toRomanNumerals(500)).toEqual('D');
      expect(toRomanNumerals(1000)).toEqual('M');
      expect(toRomanNumerals(2019)).toEqual('MMXIX');
    });

    it('converts numbers to lowercase Roman numerals', function() {
      expect(toRomanNumerals(1, /* lowercase = */ true)).toEqual('i');
      expect(toRomanNumerals(6, /* lowercase = */ true)).toEqual('vi');
      expect(toRomanNumerals(7, /* lowercase = */ true)).toEqual('vii');
      expect(toRomanNumerals(8, /* lowercase = */ true)).toEqual('viii');
      expect(toRomanNumerals(10, /* lowercase = */ true)).toEqual('x');
      expect(toRomanNumerals(40, /* lowercase = */ true)).toEqual('xl');
      expect(toRomanNumerals(100, /* lowercase = */ true)).toEqual('c');
      expect(toRomanNumerals(500, /* lowercase = */ true)).toEqual('d');
      expect(toRomanNumerals(1000, /* lowercase = */ true)).toEqual('m');
      expect(toRomanNumerals(2019, /* lowercase = */ true)).toEqual('mmxix');
    });
  });
});
