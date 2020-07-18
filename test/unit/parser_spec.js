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
/* eslint no-var: error */

import { Lexer, Linearization, Parser } from "../../src/core/parser.js";
import { FormatError } from "../../src/shared/util.js";
import { Name } from "../../src/core/primitives.js";
import { StringStream } from "../../src/core/stream.js";

describe("parser", function () {
  describe("Parser", function () {
    describe("inlineStreamSkipEI", function () {
      it("should skip over the EI marker if it is found", function () {
        const string =
          "q 1 0 0 1 0 0 cm BI /W 10 /H 10 /BPC 1 " +
          "/F /A85 ID abc123~> EI Q";
        const input = new StringStream(string);
        const parser = new Parser({
          lexer: new Lexer(input),
          xref: null,
          allowStreams: true,
        });

        parser.inlineStreamSkipEI(input);
        expect(input.pos).toEqual(string.indexOf("Q"));
        expect(input.peekByte()).toEqual(0x51); // 'Q'
      });

      it("should skip to the end of stream if the EI marker is not found", function () {
        const string =
          "q 1 0 0 1 0 0 cm BI /W 10 /H 10 /BPC 1 /F /A85 ID abc123~> Q";
        const input = new StringStream(string);
        const parser = new Parser({
          lexer: new Lexer(input),
          xref: null,
          allowStreams: true,
        });

        parser.inlineStreamSkipEI(input);
        expect(input.pos).toEqual(string.length);
        expect(input.peekByte()).toEqual(-1);
      });
    });
  });

  describe("Lexer", function () {
    describe("nextChar", function () {
      it("should return and set -1 when the end of the stream is reached", function () {
        const input = new StringStream("");
        const lexer = new Lexer(input);
        expect(lexer.nextChar()).toEqual(-1);
        expect(lexer.currentChar).toEqual(-1);
      });

      it("should return and set the character after the current position", function () {
        const input = new StringStream("123");
        const lexer = new Lexer(input);
        expect(lexer.nextChar()).toEqual(0x32); // '2'
        expect(lexer.currentChar).toEqual(0x32); // '2'
      });
    });

    describe("peekChar", function () {
      it("should only return -1 when the end of the stream is reached", function () {
        const input = new StringStream("");
        const lexer = new Lexer(input);
        expect(lexer.peekChar()).toEqual(-1);
        expect(lexer.currentChar).toEqual(-1);
      });

      it("should only return the character after the current position", function () {
        const input = new StringStream("123");
        const lexer = new Lexer(input);
        expect(lexer.peekChar()).toEqual(0x32); // '2'
        expect(lexer.currentChar).toEqual(0x31); // '1'
      });
    });

    describe("getNumber", function () {
      it("should stop parsing numbers at the end of stream", function () {
        const input = new StringStream("11.234");
        const lexer = new Lexer(input);
        expect(lexer.getNumber()).toEqual(11.234);
      });

      it("should parse PostScript numbers", function () {
        const numbers = [
          "-.002",
          "34.5",
          "-3.62",
          "123.6e10",
          "1E-5",
          "-1.",
          "0.0",
          "123",
          "-98",
          "43445",
          "0",
          "+17",
        ];
        for (const number of numbers) {
          const input = new StringStream(number);
          const lexer = new Lexer(input);

          const result = lexer.getNumber(),
            expected = parseFloat(number);

          if (result !== expected && Math.abs(result - expected) < 1e-15) {
            console.error(
              `Fuzzy matching "${result}" with "${expected}" to ` +
                "work-around rounding bugs in Chromium browsers."
            );

            expect(true).toEqual(true);
            continue;
          }
          expect(result).toEqual(expected);
        }
      });

      it("should ignore double negative before number", function () {
        const input = new StringStream("--205.88");
        const lexer = new Lexer(input);
        expect(lexer.getNumber()).toEqual(-205.88);
      });

      it("should ignore minus signs in the middle of number", function () {
        const input = new StringStream("205--.88");
        const lexer = new Lexer(input);
        expect(lexer.getNumber()).toEqual(205.88);
      });

      it("should ignore line-breaks between operator and digit in number", function () {
        const minusInput = new StringStream("-\r\n205.88");
        const minusLexer = new Lexer(minusInput);
        expect(minusLexer.getNumber()).toEqual(-205.88);

        const plusInput = new StringStream("+\r\n205.88");
        const plusLexer = new Lexer(plusInput);
        expect(plusLexer.getNumber()).toEqual(205.88);
      });

      it("should treat a single decimal point as zero", function () {
        const input = new StringStream(".");
        const lexer = new Lexer(input);
        expect(lexer.getNumber()).toEqual(0);

        const numbers = ["..", "-.", "+.", "-\r\n.", "+\r\n."];
        for (const number of numbers) {
          const invalidInput = new StringStream(number);
          const invalidLexer = new Lexer(invalidInput);

          expect(function () {
            return invalidLexer.getNumber();
          }).toThrowError(FormatError, /^Invalid number:\s/);
        }
      });

      it("should handle glued numbers and operators", function () {
        const input = new StringStream("123ET");
        const lexer = new Lexer(input);
        expect(lexer.getNumber()).toEqual(123);
        // The lexer must not have consumed the 'E'
        expect(lexer.currentChar).toEqual(0x45); // 'E'
      });
    });

    describe("getString", function () {
      it("should stop parsing strings at the end of stream", function () {
        const input = new StringStream("(1$4)");
        input.getByte = function (super_getByte) {
          // Simulating end of file using null (see issue 2766).
          const ch = super_getByte.call(input);
          return ch === 0x24 /* '$' */ ? -1 : ch;
        }.bind(input, input.getByte);
        const lexer = new Lexer(input);
        expect(lexer.getString()).toEqual("1");
      });

      it("should ignore escaped CR and LF", function () {
        // '(\101\<CR><LF>\102)' should be parsed as 'AB'.
        const input = new StringStream("(\\101\\\r\n\\102\\\r\\103\\\n\\104)");
        const lexer = new Lexer(input);
        expect(lexer.getString()).toEqual("ABCD");
      });
    });

    describe("getHexString", function () {
      it("should not throw exception on bad input", function () {
        // '7 0 2 15 5 2 2 2 4 3 2 4' should be parsed as '70 21 55 22 24 32'.
        const input = new StringStream("<7 0 2 15 5 2 2 2 4 3 2 4>");
        const lexer = new Lexer(input);
        expect(lexer.getHexString()).toEqual('p!U"$2');
      });
    });

    describe("getName", function () {
      it("should handle Names with invalid usage of NUMBER SIGN (#)", function () {
        const inputNames = ["/# 680 0 R", "/#AQwerty", "/#A<</B"];
        const expectedNames = ["#", "#AQwerty", "#A"];

        for (let i = 0, ii = inputNames.length; i < ii; i++) {
          const input = new StringStream(inputNames[i]);
          const lexer = new Lexer(input);
          expect(lexer.getName()).toEqual(Name.get(expectedNames[i]));
        }
      });
    });
  });

  describe("Linearization", function () {
    it("should not find a linearization dictionary", function () {
      // Not an actual linearization dictionary.
      // prettier-ignore
      const stream1 = new StringStream(
        "3 0 obj\n" +
        "<<\n" +
        "/Length 4622\n" +
        "/Filter /FlateDecode\n" +
        ">>\n" +
        "endobj"
      );
      expect(Linearization.create(stream1)).toEqual(null);

      // Linearization dictionary with invalid version number.
      // prettier-ignore
      const stream2 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 0\n" +
        ">>\n" +
        "endobj"
      );
      expect(Linearization.create(stream2)).toEqual(null);
    });

    it("should accept a valid linearization dictionary", function () {
      // prettier-ignore
      const stream = new StringStream(
        "131 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H [ 1388 863 ]\n" +
        "/L 90\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
      const expectedLinearizationDict = {
        length: 90,
        hints: [1388, 863],
        objectNumberFirst: 133,
        endFirst: 43573,
        numPages: 18,
        mainXRefEntriesOffset: 193883,
        pageFirst: 0,
      };
      expect(Linearization.create(stream)).toEqual(expectedLinearizationDict);
    });

    it(
      "should reject a linearization dictionary with invalid " +
        "integer parameters",
      function () {
        // The /L parameter should be equal to the stream length.
        // prettier-ignore
        const stream1 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H [ 1388 863 ]\n" +
        "/L 196622\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
        expect(function () {
          return Linearization.create(stream1);
        }).toThrow(
          new Error(
            'The "L" parameter in the linearization ' +
              "dictionary does not equal the stream length."
          )
        );

        // The /E parameter should not be zero.
        // prettier-ignore
        const stream2 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H [ 1388 863 ]\n" +
        "/L 84\n" +
        "/E 0\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
        expect(function () {
          return Linearization.create(stream2);
        }).toThrow(
          new Error(
            'The "E" parameter in the linearization dictionary is invalid.'
          )
        );

        // The /O parameter should be an integer.
        // prettier-ignore
        const stream3 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O /abc\n" +
        "/H [ 1388 863 ]\n" +
        "/L 89\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
        expect(function () {
          return Linearization.create(stream3);
        }).toThrow(
          new Error(
            'The "O" parameter in the linearization dictionary is invalid.'
          )
        );
      }
    );

    it("should reject a linearization dictionary with invalid hint parameters", function () {
      // The /H parameter should be an array.
      // prettier-ignore
      const stream1 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H 1388\n" +
        "/L 80\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
      expect(function () {
        return Linearization.create(stream1);
      }).toThrow(
        new Error("Hint array in the linearization dictionary is invalid.")
      );

      // The hint array should contain two, or four, elements.
      // prettier-ignore
      const stream2 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H [ 1388 ]\n" +
        "/L 84\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
      expect(function () {
        return Linearization.create(stream2);
      }).toThrow(
        new Error("Hint array in the linearization dictionary is invalid.")
      );

      // The hint array should not contain zero.
      // prettier-ignore
      const stream3 = new StringStream(
        "1 0 obj\n" +
        "<<\n" +
        "/Linearized 1\n" +
        "/O 133\n" +
        "/H [ 1388 863 0 234]\n" +
        "/L 93\n" +
        "/E 43573\n" +
        "/N 18\n" +
        "/T 193883\n" +
        ">>\n" +
        "endobj"
      );
      expect(function () {
        return Linearization.create(stream3);
      }).toThrow(
        new Error("Hint (2) in the linearization dictionary is invalid.")
      );
    });
  });
});
