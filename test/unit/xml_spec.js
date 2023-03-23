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

import { SimpleXMLParser, XMLParserBase } from "../../src/core/xml_parser.js";
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
});
