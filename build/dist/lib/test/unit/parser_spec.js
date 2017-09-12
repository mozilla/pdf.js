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
'use strict';

var _parser = require('../../core/parser');

var _primitives = require('../../core/primitives');

var _stream = require('../../core/stream');

describe('parser', function () {
  describe('Lexer', function () {
    it('should stop parsing numbers at the end of stream', function () {
      var input = new _stream.StringStream('11.234');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getNumber();
      expect(result).toEqual(11.234);
    });
    it('should parse PostScript numbers', function () {
      var numbers = ['-.002', '34.5', '-3.62', '123.6e10', '1E-5', '-1.', '0.0', '123', '-98', '43445', '0', '+17'];
      for (var i = 0, ii = numbers.length; i < ii; i++) {
        var num = numbers[i];
        var input = new _stream.StringStream(num);
        var lexer = new _parser.Lexer(input);
        var result = lexer.getNumber();
        expect(result).toEqual(parseFloat(num));
      }
    });
    it('should ignore double negative before number', function () {
      var input = new _stream.StringStream('--205.88');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getNumber();
      expect(result).toEqual(-205.88);
    });
    it('should ignore minus signs in the middle of number', function () {
      var input = new _stream.StringStream('205--.88');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getNumber();
      expect(result).toEqual(205.88);
    });
    it('should ignore line-breaks between operator and digit in number', function () {
      var input = new _stream.StringStream('-\r\n205.88');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getNumber();
      expect(result).toEqual(-205.88);
    });
    it('should handle glued numbers and operators', function () {
      var input = new _stream.StringStream('123ET');
      var lexer = new _parser.Lexer(input);
      var value = lexer.getNumber();
      expect(value).toEqual(123);
      expect(lexer.currentChar).toEqual(0x45);
    });
    it('should stop parsing strings at the end of stream', function () {
      var input = new _stream.StringStream('(1$4)');
      input.getByte = function (super_getByte) {
        var ch = super_getByte.call(input);
        return ch === 0x24 ? -1 : ch;
      }.bind(input, input.getByte);
      var lexer = new _parser.Lexer(input);
      var result = lexer.getString();
      expect(result).toEqual('1');
    });
    it('should not throw exception on bad input', function () {
      var input = new _stream.StringStream('<7 0 2 15 5 2 2 2 4 3 2 4>');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getHexString();
      expect(result).toEqual('p!U"$2');
    });
    it('should ignore escaped CR and LF', function () {
      var input = new _stream.StringStream('(\\101\\\r\n\\102\\\r\\103\\\n\\104)');
      var lexer = new _parser.Lexer(input);
      var result = lexer.getString();
      expect(result).toEqual('ABCD');
    });
    it('should handle Names with invalid usage of NUMBER SIGN (#)', function () {
      var inputNames = ['/# 680 0 R', '/#AQwerty', '/#A<</B'];
      var expectedNames = ['#', '#AQwerty', '#A'];
      for (var i = 0, ii = inputNames.length; i < ii; i++) {
        var input = new _stream.StringStream(inputNames[i]);
        var lexer = new _parser.Lexer(input);
        var result = lexer.getName();
        expect(result).toEqual(_primitives.Name.get(expectedNames[i]));
      }
    });
  });
  describe('Linearization', function () {
    it('should not find a linearization dictionary', function () {
      var stream1 = new _stream.StringStream('3 0 obj\n' + '<<\n' + '/Length 4622\n' + '/Filter /FlateDecode\n' + '>>\n' + 'endobj');
      expect(_parser.Linearization.create(stream1)).toEqual(null);
      var stream2 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 0\n' + '>>\n' + 'endobj');
      expect(_parser.Linearization.create(stream2)).toEqual(null);
    });
    it('should accept a valid linearization dictionary', function () {
      var stream = new _stream.StringStream('131 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H [ 1388 863 ]\n' + '/L 90\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      var expectedLinearizationDict = {
        length: 90,
        hints: [1388, 863],
        objectNumberFirst: 133,
        endFirst: 43573,
        numPages: 18,
        mainXRefEntriesOffset: 193883,
        pageFirst: 0
      };
      expect(_parser.Linearization.create(stream)).toEqual(expectedLinearizationDict);
    });
    it('should reject a linearization dictionary with invalid ' + 'integer parameters', function () {
      var stream1 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H [ 1388 863 ]\n' + '/L 196622\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream1);
      }).toThrow(new Error('The "L" parameter in the linearization ' + 'dictionary does not equal the stream length.'));
      var stream2 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H [ 1388 863 ]\n' + '/L 84\n' + '/E 0\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream2);
      }).toThrow(new Error('The "E" parameter in the linearization ' + 'dictionary is invalid.'));
      var stream3 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O /abc\n' + '/H [ 1388 863 ]\n' + '/L 89\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream3);
      }).toThrow(new Error('The "O" parameter in the linearization ' + 'dictionary is invalid.'));
    });
    it('should reject a linearization dictionary with invalid hint parameters', function () {
      var stream1 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H 1388\n' + '/L 80\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream1);
      }).toThrow(new Error('Hint array in the linearization dictionary ' + 'is invalid.'));
      var stream2 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H [ 1388 ]\n' + '/L 84\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream2);
      }).toThrow(new Error('Hint array in the linearization dictionary ' + 'is invalid.'));
      var stream3 = new _stream.StringStream('1 0 obj\n' + '<<\n' + '/Linearized 1\n' + '/O 133\n' + '/H [ 1388 863 0 234]\n' + '/L 93\n' + '/E 43573\n' + '/N 18\n' + '/T 193883\n' + '>>\n' + 'endobj');
      expect(function () {
        return _parser.Linearization.create(stream3);
      }).toThrow(new Error('Hint (2) in the linearization dictionary ' + 'is invalid.'));
    });
  });
});