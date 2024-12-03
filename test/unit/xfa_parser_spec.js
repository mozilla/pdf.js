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
  $dump,
  $getChildren,
  $getChildrenByClass,
  $getChildrenByName,
  $text,
} from "../../src/core/xfa/symbol_utils.js";
import { Binder } from "../../src/core/xfa/bind.js";
import { searchNode } from "../../src/core/xfa/som.js";
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
        long: 0,
        orientation: "portrait",
        short: 0,
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
            columnWidths: [0],
            h: "",
            hAlign: "left",
            id: "",
            layout: "position",
            locale: "",
            maxH: 0,
            maxW: 0,
            mergeMode: "consumeData",
            minH: 0,
            minW: 0,
            name: "",
            presence: "visible",
            relevant: [],
            restoreState: "manual",
            scope: "name",
            use: "",
            usehref: "",
            w: "",
            x: 0,
            y: 0,
            proto: {
              area: {
                ...attributes,
                colSpan: 1,
                x: 0,
                y: -226.08,
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
                    x: 1,
                    y: 144,
                    width: 96.3779527559055,
                    height: 5.67,
                  },
                },
                {
                  ...mediumAttributes,
                  imagingBBox: {
                    x: -1,
                    y: -1,
                    width: -1,
                    height: -1,
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

    it("should parse a xfa document and parse CDATA when needed", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <field>
        <extras>
          <exData contentType="text/html" name="foo">
            <![CDATA[<body xmlns="http://www.w3.org/1999/xhtml">
              <span>hello</span></body>]]>
          </exData>
        </extra>
      </field>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const exdata = searchNode(root, root, "foo")[0];
      const body = exdata[$dump]().$content[$dump]();
      const expected = {
        $name: "body",
        attributes: {},
        children: [
          { $content: "hello", $name: "span", attributes: {}, children: [] },
        ],
      };

      expect(body).toEqual(expected);
    });

    it("should parse a xfa document and apply some prototypes", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <proto>
        <font id="id1" typeface="Foo" size="123pt" weight="bold" posture="italic">
          <fill>
            <color value="1,2,3"/>
          </fill>
        </font>
      </proto>
      <field>
        <font use="#id1"/>
      </field>
      <field>
        <font use="#id1" size="456pt" weight="bold" posture="normal">
          <fill>
            <color value="4,5,6"/>
          </fill>
          <extras id="id2"/>
        </font>
      </field>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      let font = root.template.subform.field[0].font;
      expect(font.typeface).toEqual("Foo");
      expect(font.overline).toEqual(0);
      expect(font.size).toEqual(123);
      expect(font.weight).toEqual("bold");
      expect(font.posture).toEqual("italic");
      expect(font.fill.color.value).toEqual({ r: 1, g: 2, b: 3 });
      expect(font.extras).toEqual(undefined);

      font = root.template.subform.field[1].font;
      expect(font.typeface).toEqual("Foo");
      expect(font.overline).toEqual(0);
      expect(font.size).toEqual(456);
      expect(font.weight).toEqual("bold");
      expect(font.posture).toEqual("normal");
      expect(font.fill.color.value).toEqual({ r: 4, g: 5, b: 6 });
      expect(font.extras.id).toEqual("id2");
    });

    it("should parse a xfa document and apply some prototypes through usehref", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <proto>
        <draw name="foo">
          <font typeface="Foo" size="123pt" weight="bold" posture="italic">
            <fill>
              <color value="1,2,3"/>
            </fill>
          </font>
        </draw>
      </proto>
      <field>
        <font usehref=".#som($template.#subform.foo.#font)"/>
      </field>
      <field>
        <font usehref=".#som($template.#subform.foo.#font)" size="456pt" weight="bold" posture="normal">
          <fill>
            <color value="4,5,6"/>
          </fill>
          <extras id="id2"/>
        </font>
      </field>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      let font = root.template.subform.field[0].font;
      expect(font.typeface).toEqual("Foo");
      expect(font.overline).toEqual(0);
      expect(font.size).toEqual(123);
      expect(font.weight).toEqual("bold");
      expect(font.posture).toEqual("italic");
      expect(font.fill.color.value).toEqual({ r: 1, g: 2, b: 3 });
      expect(font.extras).toEqual(undefined);

      font = root.template.subform.field[1].font;
      expect(font.typeface).toEqual("Foo");
      expect(font.overline).toEqual(0);
      expect(font.size).toEqual(456);
      expect(font.weight).toEqual("bold");
      expect(font.posture).toEqual("normal");
      expect(font.fill.color.value).toEqual({ r: 4, g: 5, b: 6 });
      expect(font.extras.id).toEqual("id2");
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
          " The first line of this paragraph is indented a half-inch.\n",
          " Successive lines are not indented.\n",
          " This is the last line of the paragraph.\n ",
        ].join("")
      );
    });

    it("should parse a xfa document and apply some prototypes with cycle", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <proto>
        <subform id="id1">
          <subform use="#id1"/>
        </subform>
      </proto>
    </subform>
    <subform use="#id1"/>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      const subform = root.template.subform[1];

      expect(subform.id).toEqual("id1");
      expect(subform.subform.id).toEqual("id1");
    });

    it("should parse a xfa document and apply some nested prototypes", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <proto>
        <color id="RED" value="7, 8, 9"/>
        <font id="HELV" typeface="helvetica" size="31pt" weight="normal" posture="italic"> </font>
        <font id="HELV-RED" use="#HELV">
          <fill>
            <color use="#RED"/>
          </fill>
        </font>
      </proto>
      <field>
        <font use="#HELV-RED"/>
      </field>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      const font = root.template.subform.field.font;

      expect(font.typeface).toEqual("helvetica");
      expect(font.overline).toEqual(0);
      expect(font.size).toEqual(31);
      expect(font.weight).toEqual("normal");
      expect(font.posture).toEqual("italic");
      expect(font.fill.color.value).toEqual({ r: 7, g: 8, b: 9 });
    });

    it("should parse a xfa document and apply a prototype with content", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform>
      <proto>
        <text id="TEXT">default TEXT</text>
      </proto>
      <field>
        <value>
          <text use="#TEXT"></text>
        </value>
      </field>
      <field>
        <value>
          <text use="#TEXT">Overriding text</text>
        </value>
      </field>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml)[$dump]();
      let field = root.template.subform.field[0];
      expect(field.value.text.$content).toEqual("default TEXT");

      field = root.template.subform.field[1];
      expect(field.value.text.$content).toEqual("Overriding text");
    });
  });

  describe("Search in XFA", function () {
    it("should search some nodes in a template object", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
    <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
      <subform name="Receipt" id="l">
        <subform id="m">
          <field name="Description" id="a">  </field>
          <field name="Units" id="b">  </field>
          <field name="Unit_Price" id="c">  </field>
          <field name="Total_Price" id="d">  </field>
        </subform>
        <subform id="n">
          <field name="Description" id="e">  </field>
          <field name="Units" id="f">  </field>
          <field name="Unit_Price" id="g">  </field>
          <field name="Total_Price" id="h">  </field>
        </subform>
        <subform name="foo" id="o">
          <field name="Description" id="p">  </field>
          <field name="Units" id="q">  </field>
          <field name="Unit_Price" id="r">  </field>
          <field name="Total_Price" id="s">  </field>
        </subform>
        <field name="Sub_Total" id="i">  </field>
        <field name="Tax" id="j">  </field>
        <field name="Total_Price" id="k">  </field>
      </subform>
    </template>
</xdp:xdp>
        `;
      const root = new XFAParser().parse(xml);

      let found = root[$getChildrenByName]("subform", true);
      expect(found.map(x => x.id)).toEqual(["l", "m", "n", "o"]);

      found = root[$getChildrenByName]("Total_Price", true);
      expect(found.map(x => x.id)).toEqual(["d", "h", "s", "k"]);

      found = root.template[$getChildrenByName]("Receipt", false);
      const receipt = found[0];

      found = receipt[$getChildrenByName]("Total_Price", false);
      expect(found.map(x => x.id)).toEqual(["d", "h", "k"]);

      expect(receipt[$getChildrenByClass]("name")).toEqual("Receipt");
      const subforms = receipt[$getChildrenByClass]("subform");
      expect(subforms.children.map(x => x.id)).toEqual(["m", "n", "o"]);
    });

    it("should search some nodes in a template object using SOM", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
    <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
      <subform name="Receipt" id="l">
        <subform id="m">
          <field name="Description" id="a">  </field>
          <field name="Units" id="b">  </field>
          <field name="Unit_Price" id="c">  </field>
          <field name="Total_Price" id="d">  </field>
        </subform>
        <subform id="n">
          <field name="Description" id="e">  </field>
          <field name="Units" id="f">  </field>
          <field name="Unit_Price" id="g">  </field>
          <field name="Total_Price" id="h">  </field>
        </subform>
        <subform name="foo" id="o">
          <field name="Description" id="p">  </field>
          <field name="Units" id="q">  </field>
          <field name="Unit_Price" id="r">  </field>
          <field name="Total_Price" id="s">  </field>
        </subform>
        <field name="Sub_Total" id="i">  </field>
        <field name="Tax" id="j">  </field>
        <field name="Total_Price" id="k">  </field>
      </subform>
    </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      expect(
        searchNode(root, null, "$template..Description.id")[0][$text]()
      ).toBe("a");
      expect(
        searchNode(root, null, "$template..Description.id")[0][$text]()
      ).toBe("a");
      expect(
        searchNode(root, null, "$template..Description[0].id")[0][$text]()
      ).toBe("a");
      expect(
        searchNode(root, null, "$template..Description[1].id")[0][$text]()
      ).toBe("e");
      expect(
        searchNode(root, null, "$template..Description[2].id")[0][$text]()
      ).toBe("p");
      expect(searchNode(root, null, "$template.Receipt.id")[0][$text]()).toBe(
        "l"
      );
      expect(
        searchNode(root, null, "$template.Receipt.Description[1].id")[0][
          $text
        ]()
      ).toBe("e");
      expect(searchNode(root, null, "$template.Receipt.Description[2]")).toBe(
        null
      );
      expect(
        searchNode(root, null, "$template.Receipt.foo.Description.id")[0][
          $text
        ]()
      ).toBe("p");
      expect(
        searchNode(root, null, "$template.#subform.Sub_Total.id")[0][$text]()
      ).toBe("i");
      expect(
        searchNode(root, null, "$template.#subform.Units.id")[0][$text]()
      ).toBe("b");
      expect(
        searchNode(root, null, "$template.#subform.Units.parent.id")[0][$text]()
      ).toBe("m");
    });

    it("should search some nodes in a datasets object", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <Receipt>
        <Page>1</Page>
        <Detail PartNo="GS001">
          <Description>Giant Slingshot</Description>
          <Units>1</Units>
          <Unit_Price>250.00</Unit_Price>
          <Total_Price>250.00</Total_Price>
        </Detail>
        <Page>2</Page>
        <Detail PartNo="RRB-LB">
          <Description>Road Runner Bait, large bag</Description>
          <Units>5</Units>
          <Unit_Price>12.00</Unit_Price>
          <Total_Price>60.00</Total_Price>
        </Detail>
        <Sub_Total>310.00</Sub_Total>
        <Tax>24.80</Tax>
        <Total_Price>334.80</Total_Price>
      </Receipt>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const data = root.datasets.data;

      let found = data[$getChildrenByName]("Description", true);
      expect(found.map(x => x[$text]())).toEqual([
        "Giant Slingshot",
        "Road Runner Bait, large bag",
      ]);

      found = data[$getChildrenByName]("Total_Price", true);
      expect(found.map(x => x[$text]())).toEqual(["250.00", "60.00", "334.80"]);
    });

    it("should search some nodes using SOM from a non-root node", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <Receipt>
        <Page>1</Page>
        <Detail PartNo="GS001">
          <Description>Giant Slingshot</Description>
          <Units>1</Units>
          <Unit_Price>250.00</Unit_Price>
          <Total_Price>250.00</Total_Price>
        </Detail>
        <Page>2</Page>
        <Detail PartNo="RRB-LB">
          <Description>Road Runner Bait, large bag</Description>
          <Units>5</Units>
          <Unit_Price>12.00</Unit_Price>
          <Total_Price>60.00</Total_Price>
        </Detail>
        <Sub_Total>310.00</Sub_Total>
        <Tax>24.80</Tax>
        <Total_Price>334.80</Total_Price>
      </Receipt>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const [receipt] = root.datasets.data[$getChildren]("Receipt");
      expect(
        searchNode(root, receipt, "Detail[*].Total_Price").map(x => x[$text]())
      ).toEqual(["250.00", "60.00"]);

      const [units] = searchNode(root, receipt, "Detail[1].Units");
      expect(units[$text]()).toBe("5");

      let [found] = searchNode(root, units, "Total_Price");
      expect(found[$text]()).toBe("60.00");

      found = searchNode(root, units, "Total_Pric");
      expect(found).toEqual(null);
    });

    it("should search some nodes in a datasets object using SOM", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <Receipt Detail="Acme">
        <Detail>foo</Detail>
        <Detail>bar</Detail>
     </Receipt>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      expect(searchNode(root, null, "$data.Receipt.Detail")[0][$text]()).toBe(
        "Acme"
      );
      expect(
        searchNode(root, null, "$data.Receipt.Detail[0]")[0][$text]()
      ).toBe("Acme");
      expect(
        searchNode(root, null, "$data.Receipt.Detail[1]")[0][$text]()
      ).toBe("foo");
      expect(
        searchNode(root, null, "$data.Receipt.Detail[2]")[0][$text]()
      ).toBe("bar");
    });
  });

  describe("Bind data into form", function () {
    it("should make a basic binding", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="A">
      <subform name="B">
        <field name="C">
        </field>
        <field name="D">
        </field>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <A>
        <C>xyz</C>
      </A>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "A.B.C.value.text")[0][$dump]().$content
      ).toBe("xyz");
    });

    it("should make a basic binding and create a non-existing node", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="A" mergeMode="matchTemplate">
      <subform name="B">
        <field name="C">
        </field>
        <field name="D">
          <value>
            <text>foobar</text>
          </value>
        </field>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <A>
      </A>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const binder = new Binder(root);
      const form = binder.bind();
      const data = binder.getData();

      expect(
        searchNode(form, form, "A.B.D.value.text")[0][$dump]().$content
      ).toBe("foobar");

      const expected = {
        $name: "A",
        attributes: {},
        children: [
          {
            $name: "B",
            attributes: {},
            children: [
              {
                $name: "C",
                attributes: {},
                children: [],
              },
              {
                $name: "D",
                attributes: {},
                children: [],
              },
            ],
          },
        ],
      };

      expect(searchNode(data, data, "A")[0][$dump]()).toEqual(expected);
    });

    it("should make a basic binding and create a non-existing node with namespaceId equal to -1", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="A">
      <subform name="B">
        <field name="C">
        </field>
        <field name="D">
          <value>
            <text>foobar</text>
          </value>
        </field>
      </subform>
    </subform>
  </template>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const binder = new Binder(root);
      const form = binder.bind();
      const data = binder.getData();

      expect(
        searchNode(form, form, "A.B.D.value.text")[0][$dump]().$content
      ).toBe("foobar");

      // Created nodes mustn't belong to xfa:datasets namespace.
      const expected = {
        $name: "A",
        $ns: -1,
        attributes: {},
        children: [
          {
            $name: "B",
            $ns: -1,
            attributes: {},
            children: [
              {
                $name: "C",
                $ns: -1,
                attributes: {},
                children: [],
              },
              {
                $name: "D",
                $ns: -1,
                attributes: {},
                children: [],
              },
            ],
          },
        ],
      };

      expect(searchNode(data, data, "A")[0][$dump](/* hasNS */ true)).toEqual(
        expected
      );
    });

    it("should make another basic binding", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="registration">
      <field name="first"> </field>
      <field name="last">  </field>
      <field name="apt">  </field>
      <field name="street">  </field>
      <field name="city">  </field>
      <field name="country">  </field>
      <field name="postalcode"/>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <registration>
        <first>Jack</first>
        <last>Spratt</last>
        <apt/>
        <street>99 Candlestick Lane</street>
        <city>London</city>
        <country>UK</country>
        <postalcode>SW1</postalcode>
      </registration>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "registration.first..text")[0][$dump]().$content
      ).toBe("Jack");
      expect(
        searchNode(form, form, "registration.last..text")[0][$dump]().$content
      ).toBe("Spratt");
      expect(
        searchNode(form, form, "registration.apt..text")[0][$dump]().$content
      ).toBe(undefined);
      expect(
        searchNode(form, form, "registration.street..text")[0][$dump]().$content
      ).toBe("99 Candlestick Lane");
      expect(
        searchNode(form, form, "registration.city..text")[0][$dump]().$content
      ).toBe("London");
      expect(
        searchNode(form, form, "registration.country..text")[0][$dump]()
          .$content
      ).toBe("UK");
      expect(
        searchNode(form, form, "registration.postalcode..text")[0][$dump]()
          .$content
      ).toBe("SW1");
    });

    it("should make basic binding with extra subform", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="registration">
      <field name="first"> </field>
      <field name="last">  </field>
      <subform name="address">
        <field name="apt">  </field>
        <field name="street">  </field>
        <field name="city">  </field>
        <field name="country">  </field>
        <field name="postalcode">  </field>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <registration>
        <first>Jack</first>
        <last>Spratt</last>
        <apt/>
        <street>99 Candlestick Lane</street>
        <city>London</city>
        <country>UK</country>
        <postalcode>SW1</postalcode>
      </registration>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "registration..first..text")[0][$dump]().$content
      ).toBe("Jack");
      expect(
        searchNode(form, form, "registration..last..text")[0][$dump]().$content
      ).toBe("Spratt");
      expect(
        searchNode(form, form, "registration..apt..text")[0][$dump]().$content
      ).toBe(undefined);
      expect(
        searchNode(form, form, "registration..street..text")[0][$dump]()
          .$content
      ).toBe("99 Candlestick Lane");
      expect(
        searchNode(form, form, "registration..city..text")[0][$dump]().$content
      ).toBe("London");
      expect(
        searchNode(form, form, "registration..country..text")[0][$dump]()
          .$content
      ).toBe("UK");
      expect(
        searchNode(form, form, "registration..postalcode..text")[0][$dump]()
          .$content
      ).toBe("SW1");
    });

    it("should make basic binding with extra subform (consumeData)", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="registration" mergeMode="consumeData">
      <subform name="address">
        <field name="first"/>
        <field name="last"/>
        <field name="apt"/>
        <field name="street"/>
        <field name="city"/>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <registration>
        <first>Jack</first>
        <last>Spratt</last>
        <address>
          <apt>7</apt>
          <street>99 Candlestick Lane</street>
          <city>London</city>
        </address>
      </registration>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "registration..first..text")[0][$dump]().$content
      ).toBe("Jack");
      expect(
        searchNode(form, form, "registration..last..text")[0][$dump]().$content
      ).toBe("Spratt");
      expect(
        searchNode(form, form, "registration..apt..text")[0][$dump]().$content
      ).toBe("7");
      expect(
        searchNode(form, form, "registration..street..text")[0][$dump]()
          .$content
      ).toBe("99 Candlestick Lane");
      expect(
        searchNode(form, form, "registration..city..text")[0][$dump]().$content
      ).toBe("London");
    });

    it("should make basic binding with same names in different parts", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="application" mergeMode="consumeData">
      <subform name="sponsor">
        <field name="lastname">  </field>
        <!-- sponsor's last name -->
      </subform>
      <field name="lastname">  </field>
      <!-- applicant's last name -->
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <application>
        <lastname>Abott</lastname>
        <sponsor>
          <lastname>Costello</lastname>
        </sponsor>
      </application>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "application.sponsor.lastname..text")[0][$dump]()
          .$content
      ).toBe("Costello");
      expect(
        searchNode(form, form, "application.lastname..text")[0][$dump]()
          .$content
      ).toBe("Abott");
    });

    it("should make binding and create nodes in data", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="root" mergeMode="matchTemplate">
      <subform name="A">
        <field name="a"/>
        <field name="b"/>
        <subform name="B">
          <field name="c"/>
          <field name="d"/>
          <subform name="C">
            <field name="e"/>
            <field name="f"/>
          </subform>
        </subform>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <root>
        <A>
          <b>1</b>
        </A>
      </root>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const binder = new Binder(root);
      const form = binder.bind();
      const data = binder.getData();

      expect(searchNode(form, form, "root..b..text")[0][$dump]().$content).toBe(
        "1"
      );
      expect(searchNode(data, data, "root.A.a")[0][$dump]().$name).toBe("a");
      expect(searchNode(data, data, "root.A.B.c")[0][$dump]().$name).toBe("c");
      expect(searchNode(data, data, "root.A.B.d")[0][$dump]().$name).toBe("d");
      expect(searchNode(data, data, "root.A.B.C.e")[0][$dump]().$name).toBe(
        "e"
      );
      expect(searchNode(data, data, "root.A.B.C.f")[0][$dump]().$name).toBe(
        "f"
      );
    });

    it("should make binding and set properties", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="Id">
      <field name="LastName">
        <setProperty ref="$data.Main.Style.NameFont" target="font.typeface"/>
        <setProperty ref="$data.Main.Style.NameSize" target="font.size"/>
        <setProperty ref="$data.Main.Help.LastName" target="assist.toolTip"/>
        <font></font>
        <assist>
          <toolTip>
          </toolTip>
        </assist>
      </field>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <Id>
        <LastName>foo</LastName>
      </Id>
      <Main>
        <Style>
          <NameFont>myfont</NameFont>
          <NameSize>123.4pt</NameSize>
        </Style>
        <Help>
          <LastName>Give the name!</LastName>
        </Help>
      </Main>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "Id.LastName..text")[0][$dump]().$content
      ).toBe("foo");
      expect(
        searchNode(form, form, "Id.LastName.font.typeface")[0][$text]()
      ).toBe("myfont");
      expect(
        searchNode(form, form, "Id.LastName.font.size")[0][$text]()
      ).toEqual(123.4);
      expect(
        searchNode(form, form, "Id.LastName.assist.toolTip")[0][$dump]()
          .$content
      ).toBe("Give the name!");
    });

    it("should make binding and bind items", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="main">
      <field name="CardName">
        <bindItems ref="$data.main.ccs.cc[*]" labelRef="uiname" valueRef="token"/>
        <ui>
          <choiceList/>
        </ui>
      </field>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <main>
        <ccs>
          <cc uiname="Visa" token="VISA"/>
          <cc uiname="Mastercard" token="MC"/>
          <cc uiname="American Express" token="AMEX"/>
        </ccs>
        <CardName>MC</CardName>
      </main>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();
      expect(
        searchNode(form, form, "subform.CardName.items[*].text[*]").map(x =>
          x[$text]()
        )
      ).toEqual([
        "Visa",
        "Mastercard",
        "American Express",
        "VISA",
        "MC",
        "AMEX",
      ]);
    });

    it("should make binding and bind items with a ref", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="main">
      <field name="CardName">
        <bind match="dataRef" ref="$data.main.value"/>
        <bindItems ref="$data.main.ccs.cc[*]" labelRef="uiname" valueRef="token"/>
        <ui>
          <choiceList/>
        </ui>
      </field>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <main>
        <value>VISA</value>
        <ccs>
          <cc uiname="Visa" token="VISA"/>
          <cc uiname="Mastercard" token="MC"/>
          <cc uiname="American Express" token="AMEX"/>
        </ccs>
        <CardName>MC</CardName>
      </main>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();
      expect(
        searchNode(form, form, "subform.CardName.value.text").map(x =>
          x[$text]()
        )
      ).toEqual(["VISA"]);
      expect(
        searchNode(form, form, "subform.CardName.items[*].text[*]").map(x =>
          x[$text]()
        )
      ).toEqual([
        "Visa",
        "Mastercard",
        "American Express",
        "VISA",
        "MC",
        "AMEX",
      ]);
    });

    it("should make binding with occurrences in consumeData mode", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="root" mergeMode="consumeData">
      <subform name="section" id="section1">
        <occur min="0" max="-1"/>
        <bind match="dataRef" ref="$.section[*]"/>
        <field name="line-item"/>
      </subform>
      <subform name="section" id="section2">
        <occur min="0" max="-1"/>
        <bind match="dataRef" ref="$.section[*]"/>
        <field name="line-item"/>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <root>
        <section>
          <line-item>item1</line-item>
        </section>
        <section>
          <line-item>item2</line-item>
        </section>
      </root>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "root.section[*].id").map(x => x[$text]())
      ).toEqual(["section1", "section1"]);

      expect(
        searchNode(form, form, "root.section[*].line-item..text").map(x =>
          x[$text]()
        )
      ).toEqual(["item1", "item2"]);
    });

    it("should make binding with occurrences in matchTemplate mode", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="root" mergeMode="matchTemplate">
      <subform name="section" id="section1">
        <occur min="0" max="-1"/>
        <bind match="dataRef" ref="$.section[*]"/>
        <field name="line-item"/>
      </subform>
      <subform name="section" id="section2">
        <occur min="0" max="-1"/>
        <bind match="dataRef" ref="$.section[*]"/>
        <field name="line-item"/>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <root>
        <section>
          <line-item>item1</line-item>
        </section>
        <section>
          <line-item>item2</line-item>
        </section>
      </root>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "root.section[*].id").map(x => x[$text]())
      ).toEqual(["section1", "section1", "section2", "section2"]);

      expect(
        searchNode(form, form, "root.section[*].line-item..text").map(x =>
          x[$text]()
        )
      ).toEqual(["item1", "item2", "item1", "item2"]);
    });

    it("should make binding and create nodes in data with some bind tag", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="root" mergeMode="matchTemplate">
      <subform name="A">
        <occur max="-1"/>
        <bind ref="$.root.foo[*]" match="dataRef"/>
      </subform>
      <subform name="B">
        <occur max="2"/>
        <bind ref="$.root.bar[2]" match="dataRef"/>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <root>
      </root>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const binder = new Binder(root);
      binder.bind();
      const data = binder.getData();

      const expected = {
        $name: "root",
        children: [
          {
            $name: "root",
            children: [
              {
                $name: "foo",
                children: [],
                attributes: {},
              },
              {
                $name: "bar",
                children: [],
                attributes: {},
              },
              {
                $name: "bar",
                children: [],
                attributes: {},
              },
              {
                $name: "bar",
                children: [],
                attributes: {},
              },
            ],
            attributes: {},
          },
        ],
        attributes: {},
      };

      expect(searchNode(data, data, "root")[0][$dump]()).toEqual(expected);
    });

    it("should make a binding with a bindItems", function () {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="A" mergeMode="matchTemplate">
      <subform name="B">
        <field name="C">
          <ui>
            <choicelist/>
          </ui>
          <bindItems ref="xfa.datasets.foo.bar[*]" labelRef="$" valueRef="oof"/>
        </field>
      </subform>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <foo>
      <bar oof="a">1</bar>
      <bar oof="b">2</bar>
      <bar oof="c">3</bar>
      <bar oof="d">4</bar>
      <bar oof="e">5</bar>
    </foo>
    <xfa:data>
      <A><B></B></A>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const form = new Binder(root).bind();

      expect(
        searchNode(form, form, "A.B.C.items[0].text[*]").map(
          x => x[$dump]().$content
        )
      ).toEqual(["1", "2", "3", "4", "5"]);
      expect(
        searchNode(form, form, "A.B.C.items[1].text[*]").map(
          x => x[$dump]().$content
        )
      ).toEqual(["a", "b", "c", "d", "e"]);
    });
  });

  it("should make a binding with a element in an area", function () {
    const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="A" mergeMode="matchTemplate">
      <area>
        <field name="B"/>
      </area>
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>
      <A><B>foobar</B></A>
    </xfa:data>
  </xfa:datasets>
</xdp:xdp>
    `;
    const root = new XFAParser().parse(xml);
    const form = new Binder(root).bind();

    expect(searchNode(form, form, "A..B..text")[0][$dump]().$content).toBe(
      "foobar"
    );
  });
});
