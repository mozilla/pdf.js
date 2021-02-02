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

import { $dump, $getChildren, $text } from "../../src/core/xfa/xfa_object.js";
import { XFAParser } from "../../src/core/xfa/parser.js";

describe("XFAParser", function () {
  describe("Parse XFA", function () {
    it("should parse a xfa document and create an object to represent it", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/" uuid="1234" invalid="foo">
  <config xmlns="http://www.xfa.org/schema/xci/3.1/">
    <present>
      <pdf name="hello">
        <adobeExtensionLevel>
          7
        </adobeExtensionLevel>
      </pdf>
      <invalid><a>foobar</a></invalid>
    </present>
    <acrobat>
      <submitUrl>http://a.b.c</submitUrl>
      <acrobat7>
        <dynamicRender>
          forbidden
        </dynamicRender>
      </acrobat7>
      <autoSave>enabled</autoSave>      
      <submitUrl>
                 http://d.e.f
      </submitUrl>
      <submitUrl>http://g.h.i</submitUrl>
      <validate>foobar</validate>
    </acrobat>
  </config>
  <template baseProfile="full" xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <extras>
      <float>1.23</float>
      <boolean>1</boolean>
      <integer>314</integer>
      <float>2.71</float>
    </extras>
    <subform>
      <proto>
        <area x="hello" y="-3.14in" relevant="-foo +bar" />
        <color value="111, 222, 123" />
        <color value="111, abc, 123" />
        <medium imagingBBox="1,2in,3.4cm,5.67px" />
        <medium imagingBBox="1,2in,-3cm,4px" />
      </proto>
    </subform>
  </template>
</xdp:xdp>
      `;
      const attributes = {
        id: "",
        name: "",
        use: "",
        usehref: "",
      };
      const mediumAttributes = {
        id: "",
        long: { value: 0, unit: "" },
        orientation: "portrait",
        short: { value: 0, unit: "" },
        stock: "",
        trayIn: "auto",
        trayOut: "auto",
        use: "",
        usehref: "",
      };
      const colorAttributes = {
        cSpace: "SRGB",
        id: "",
        use: "",
        usehref: "",
      };
      const root = new XFAParser().parse(xml);
      const expected = {
        uuid: "1234",
        timeStamp: "",
        template: {
          baseProfile: "full",
          extras: {
            ...attributes,
            float: [
              { ...attributes, $content: 1.23 },
              { ...attributes, $content: 2.71 },
            ],
            boolean: { ...attributes, $content: 1 },
            integer: { ...attributes, $content: 314 },
          },
          subform: {
            access: "open",
            allowMacro: 0,
            anchorType: "topLeft",
            colSpan: 1,
            columnWidths: [{ value: 0, unit: "" }],
            h: { value: 0, unit: "" },
            hAlign: "left",
            id: "",
            layout: "position",
            locale: "",
            maxH: { value: 0, unit: "" },
            maxW: { value: 0, unit: "" },
            mergeMode: "consumeData",
            minH: { value: 0, unit: "" },
            minW: { value: 0, unit: "" },
            name: "",
            presence: "visible",
            relevant: [],
            restoreState: "manual",
            scope: "name",
            use: "",
            usehref: "",
            w: { value: 0, unit: "" },
            x: { value: 0, unit: "" },
            y: { value: 0, unit: "" },
            proto: {
              area: {
                ...attributes,
                colSpan: 1,
                x: { value: 0, unit: "" },
                y: { value: -3.14, unit: "in" },
                relevant: [
                  { excluded: true, viewname: "foo" },
                  { excluded: false, viewname: "bar" },
                ],
              },
              color: [
                {
                  ...colorAttributes,
                  value: { r: 111, g: 222, b: 123 },
                },
                {
                  ...colorAttributes,
                  value: { r: 111, g: 0, b: 123 },
                },
              ],
              medium: [
                {
                  ...mediumAttributes,
                  imagingBBox: {
                    x: { value: 1, unit: "" },
                    y: { value: 2, unit: "in" },
                    width: { value: 3.4, unit: "cm" },
                    height: { value: 5.67, unit: "px" },
                  },
                },
                {
                  ...mediumAttributes,
                  imagingBBox: {
                    x: { value: -1, unit: "" },
                    y: { value: -1, unit: "" },
                    width: { value: -1, unit: "" },
                    height: { value: -1, unit: "" },
                  },
                },
              ],
            },
          },
        },
        config: {
          acrobat: {
            acrobat7: {
              dynamicRender: {
                $content: "forbidden",
              },
            },
            autoSave: {
              $content: "enabled",
            },
            validate: {
              $content: "preSubmit",
            },
            submitUrl: [
              {
                $content: "http://a.b.c",
              },
              {
                $content: "http://d.e.f",
              },
              {
                $content: "http://g.h.i",
              },
            ],
          },
          present: {
            pdf: {
              name: "hello",
              adobeExtensionLevel: {
                $content: 7,
              },
            },
          },
        },
      };
      expect(root[$dump]()).toEqual(expected);
    });

    it("should parse a xfa document and check namespaces", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <config xmlns:foo="http:/www.foo.com" xmlns="http://www.xfa.org/schema/xci/3.1/">
    <present xmlns="http://www.mozilla.org">
      <pdf name="hello">
        <adobeExtensionLevel>
          7
        </adobeExtensionLevel>
      </pdf>
    </present>
    <acrobat>
      <foo:submitUrl>http://a.b.c</foo:submitUrl>
      <submitUrl>http://c.b.a</submitUrl>
    </acrobat>
  </config>
  <template baseProfile="full" xmlns="http://www.allizom.org">
    <extras>
      <float>1.23</float>
    </extras>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const expected = {
        uuid: "",
        timeStamp: "",
        config: {
          acrobat: {
            submitUrl: { $content: "http://c.b.a" },
          },
        },
      };
      expect(root[$dump]()).toEqual(expected);
    });

    it("should parse a xfa document with xhtml", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <extras>
      <text>
        <body xmlns="http://www.w3.org/1999/xhtml">
          <p style="foo: bar; text-indent:0.5in; line-height:11px;bar:foo;tab-stop: left 0.5in">
            The first line of this paragraph is indented a half-inch.<br/>
            Successive lines are not indented.<br/>
            This is the last line of the paragraph.<br/>
          </p>
        </body>
      </text>
    </extras>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      const p = root.template.extras.text.$content[$getChildren]()[0];
      expect(p.style).toEqual(
        "text-indent:0.5in;line-height:11px;tab-stop:left 0.5in"
      );
      expect(p[$text]()).toEqual(
        [
          "The first line of this paragraph is indented a half-inch.\n",
          "Successive lines are not indented.\n",
          "This is the last line of the paragraph.\n",
        ].join("")
      );
    });
  });
});
