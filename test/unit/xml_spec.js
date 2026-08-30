/* Copyright 2020 Mozilla Foundation
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
  SimpleXMLParser,
  XMLParserBase,
  XMLParserErrorCode,
} from "../../src/core/xml_parser.js";
import { parseXFAPath } from "../../src/core/core_utils.js";

describe("XML", function () {
  describe("searchNode", function () {
    it("should search a node with a given path in xml tree", function () {
      const xml = `
      <a>
          <b>
              <c a="123"/>
              <d/>
              <e>
                  <f>
                      <g a="321"/>
                  </f>
              </e>
              <c a="456"/>
              <c a="789"/>
              <h/>
              <c a="101112"/>
          </b>
          <h>
              <i/>
              <j/>
              <k>
                  <g a="654"/>
              </k>
          </h>
          <b>
              <g a="987"/>
              <h/>
              <g a="121110"/>
          </b>
      </a>`;
      const root = new SimpleXMLParser({ hasAttributes: true }).parseFromString(
        xml
      ).documentElement;
      function getAttr(path) {
        return root.searchNode(parseXFAPath(path), 0).attributes[0].value;
      }

      expect(getAttr("b.g")).toEqual("321");
      expect(getAttr("e.f.g")).toEqual("321");
      expect(getAttr("e.g")).toEqual("321");
      expect(getAttr("g")).toEqual("321");
      expect(getAttr("h.g")).toEqual("654");
      expect(getAttr("b[0].g")).toEqual("321");
      expect(getAttr("b[1].g")).toEqual("987");
      expect(getAttr("b[1].g[0]")).toEqual("987");
      expect(getAttr("b[1].g[1]")).toEqual("121110");
      expect(getAttr("c")).toEqual("123");
      expect(getAttr("c[1]")).toEqual("456");
      expect(getAttr("c[2]")).toEqual("789");
      expect(getAttr("c[3]")).toEqual("101112");
    });

    it("should dump a xml tree", function () {
      const xml = `
      <a>
          <b>
              <c a="123"/>
              <d>hello</d>
              <e>
                  <f>
                      <g a="321"/>
                  </f>
              </e>
              <c a="456"/>
              <c a="789"/>
              <h/>
              <c a="101112"/>
          </b>
          <h>
              <i/>
              <j/>
              <k>&#xA;W&#x1F602;rld&#xA;<g a="654"/>
              </k>
          </h>
          <b>
              <g a="987"/>
              <h/>
              <g a="121110"/>
          </b>
      </a>`;
      const root = new SimpleXMLParser({ hasAttributes: true }).parseFromString(
        xml
      ).documentElement;
      const buffer = [];
      root.dump(buffer);

      expect(buffer.join("").replaceAll(/\s+/g, "")).toEqual(
        xml.replaceAll(/\s+/g, "")
      );
    });
  });

  describe("character references", function () {
    const parseText = xml =>
      new SimpleXMLParser({}).parseFromString(xml).documentElement.textContent;

    it("should resolve the valid ones", function () {
      expect(parseText("<a>&#65;&#x42;&#x1F602;&#0;&#x10FFFF;</a>")).toEqual(
        "AB\u{1F602}\0\u{10FFFF}"
      );
    });

    it("should keep the invalid ones as-is", function () {
      // These must not throw: `String.fromCodePoint` rejects anything which
      // isn't a code point.
      expect(parseText("<a>&#xZZ;</a>")).toEqual("&#xZZ;");
      expect(parseText("<a>&#zz;</a>")).toEqual("&#zz;");
      expect(parseText("<a>&#x110000;</a>")).toEqual("&#x110000;");
      expect(parseText("<a>&#1114112;</a>")).toEqual("&#1114112;");
      expect(parseText("<a>&#-1;</a>")).toEqual("&#-1;");
    });
  });

  it("should parse processing instructions", function () {
    const xml = `
      <a>
          <?foo bar?>
          <?foo bar oof?>
          <?foo?>
      </a>`;
    const pi = [];

    class MyParser extends XMLParserBase {
      onPi(name, value) {
        pi.push([name, value]);
      }
    }

    new MyParser().parseXml(xml);

    expect(pi).toEqual([
      ["foo", "bar"],
      ["foo", "bar oof"],
      ["foo", ""],
    ]);
  });

  describe("entities", function () {
    const parseText = xml =>
      new SimpleXMLParser({}).parseFromString(xml).documentElement.textContent;

    it("should resolve the entities", function () {
      expect(
        parseText("<a>&lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;</a>")
      ).toEqual(`<b> & "c" 'd'`);
      expect(parseText("<a>&#65;&#x42;</a>")).toEqual("AB");
    });

    it("should keep the unresolved entities as-is", function () {
      expect(parseText("<a>&unknown; a&b;c</a>")).toEqual("&unknown; a&b;c");
    });

    it("should resolve an entity preceded by a bare ampersand", function () {
      expect(parseText("<a>AT&T &amp; Co</a>")).toEqual("AT&T & Co");
      expect(parseText("<a>&&amp;</a>")).toEqual("&&");
    });

    it("should handle a long run of ampersands efficiently", function () {
      const text = "&".repeat(100000);

      const startTime = performance.now();
      expect(parseText(`<a>${text}</a>`)).toEqual(text);
      expect(performance.now() - startTime).toBeLessThan(1000);
    });
  });

  describe("errors", function () {
    class ErrorXMLParser extends SimpleXMLParser {
      errorCode = XMLParserErrorCode.NoError;

      onError(code) {
        super.onError(code);
        this.errorCode = code;
      }
    }

    it("should handle unterminated closing elements", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("</a")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedElement
      );
    });

    it("should handle unterminated XML declarations", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<?xml")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedXmlDeclaration
      );
    });

    it("should handle unterminated comments", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<!-- Comment")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedComment
      );
    });

    it("should handle unterminated CDATA sections", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<![CDATA[")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(XMLParserErrorCode.UnterminatedCdata);
    });

    it("should handle unterminated DOCTYPE declarations without internal DTD", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<!DOCTYPE foo")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedDoctypeDeclaration
      );
    });

    it("should handle unterminated DOCTYPE declarations with internal DTD", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<!DOCTYPE foo [>")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedDoctypeDeclaration
      );
    });

    it("should handle malformed elements", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<!foo")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(XMLParserErrorCode.MalformedElement);
    });

    it("should handle malformed element attributes", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<c a=/>")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(XMLParserErrorCode.MalformedElement);
    });

    it("should handle unterminated opening elements", function () {
      const xmlParser = new ErrorXMLParser({});
      expect(xmlParser.parseFromString("<a")).toEqual(undefined);
      expect(xmlParser.errorCode).toEqual(
        XMLParserErrorCode.UnterminatedElement
      );
    });
  });
});
