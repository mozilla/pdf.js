/* Copyright 2021 Mozilla Foundation
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

import { $uid } from "../../src/core/xfa/symbol_utils.js";
import { DataHandler } from "../../src/core/xfa/data.js";
import { searchNode } from "../../src/core/xfa/som.js";
import { XFAFactory } from "../../src/core/xfa/factory.js";
import { XFAParser } from "../../src/core/xfa/parser.js";

describe("Data serializer", function () {
  it("should serialize data with an annotationStorage", function () {
    const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <foo>bar</foo>
    <xfa:data>
      <Receipt>
        <Page>1</Page>
        <Detail PartNo="GS001">
          <Description>Giant Slingshot</Description>
          <Units>1</Units>
          <Unit_Price>250.00</Unit_Price>
          <Total_Price>250.00</Total_Price>
          <àé></àé>
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
    <bar>foo</bar>
  </xfa:datasets>
</xdp:xdp>
    `;
    const root = new XFAParser().parse(xml);
    const data = root.datasets.data;
    const dataHandler = new DataHandler(root, data);

    const storage = new Map();
    for (const [path, value] of [
      ["Receipt.Detail[0].Units", "12&3"],
      ["Receipt.Detail[0].Unit_Price", "456>"],
      ["Receipt.Detail[0].Total_Price", "789"],
      ["Receipt.Detail[0].àé", "1011"],
      ["Receipt.Detail[1].PartNo", "foo-bar😀"],
      ["Receipt.Detail[1].Description", "hello world"],
    ]) {
      storage.set(searchNode(root, data, path)[0][$uid], { value });
    }

    const serialized = dataHandler.serialize(storage);
    const expected = `<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><foo>bar</foo><bar>foo</bar><xfa:data><Receipt><Page>1</Page><Detail PartNo="GS001"><Description>Giant Slingshot</Description><Units>12&amp;3</Units><Unit_Price>456&gt;</Unit_Price><Total_Price>789</Total_Price><\xC3\xA0\xC3\xA9>1011</\xC3\xA0\xC3\xA9></Detail><Page>2</Page><Detail PartNo="foo-bar&#x1F600;"><Description>hello world</Description><Units>5</Units><Unit_Price>12.00</Unit_Price><Total_Price>60.00</Total_Price></Detail><Sub_Total>310.00</Sub_Total><Tax>24.80</Tax><Total_Price>334.80</Total_Price></Receipt></xfa:data></xfa:datasets>`;

    expect(serialized).toEqual(expected);
  });

  describe("Binding of transparent nodes", function () {
    const FIELD = `
      <field name="bar" w="100pt" h="50pt">
        <ui><textEdit multiLine="1"/></ui>
      </field>`;

    // Binds the template `body` (the content of the "root" subform) to `data`,
    // then simulates a save after "hello" has been typed in the field.
    async function bindAndSave(body, data) {
      const xml = `
<?xml version="1.0"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">
  <template xmlns="http://www.xfa.org/schema/xfa-template/3.3">
    <subform name="root">
      <pageSet>
        <pageArea>
          <contentArea x="0pt" w="456pt" h="789pt"/>
          <medium stock="default" short="456pt" long="789pt"/>
        </pageArea>
      </pageSet>
      ${body}
    </subform>
  </template>
  <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
    <xfa:data>${data}</xfa:data>
  </xfa:datasets>
</xdp:xdp>`;
      const factory = new XFAFactory(new Map([["xdp:xdp", xml]]));
      expect(await factory.getNumPages()).toEqual(1);

      const findTextarea = node => {
        if (node.name === "textarea") {
          return node;
        }
        for (const child of node.children || []) {
          const found = findTextarea(child);
          if (found) {
            return found;
          }
        }
        return null;
      };
      const { dataId, fieldId } = findTextarea(
        await factory.getPages()
      ).attributes;
      return {
        // When the field isn't linked to a data node, both ids are the same.
        isBound: dataId !== fieldId,
        serialized: factory.serializeData(
          new Map([[dataId, { value: "hello" }]])
        ),
      };
    }

    it("should not bind an area to the data of a subform with the same name", async function () {
      // The area mustn't consume the data node meant for the "Foo" subform.
      const { isBound, serialized } = await bindAndSave(
        `<subform name="first">
          <area name="Foo">
            <draw w="10pt" h="10pt"><value><text>foo</text></value></draw>
          </area>
        </subform>
        <subform name="Foo">${FIELD}</subform>`,
        `<root><Foo><bar/></Foo></root>`
      );
      expect(isBound).toEqual(true);
      expect(serialized).toContain("<Foo><bar>hello</bar></Foo>");
    });

    it("should bind the fields of an area to the data of its parent", async function () {
      const { isBound, serialized } = await bindAndSave(
        `<area name="Foo">${FIELD}</area>`,
        `<root><bar/></root>`
      );
      expect(isBound).toEqual(true);
      expect(serialized).toContain("<root><bar>hello</bar></root>");
    });

    it("should bind the fields of an unnamed subform to the data of its parent", async function () {
      const { isBound, serialized } = await bindAndSave(
        `<subform>${FIELD}</subform>`,
        `<root><bar/></root>`
      );
      expect(isBound).toEqual(true);
      expect(serialized).toContain("<root><bar>hello</bar></root>");
    });

    it("should bind an unnamed subform with a dataRef", async function () {
      // Being unnamed doesn't make a subform transparent when it has a ref.
      const { isBound, serialized } = await bindAndSave(
        `<subform><bind match="dataRef" ref="$.Foo"/>${FIELD}</subform>`,
        `<root><Foo><bar/></Foo></root>`
      );
      expect(isBound).toEqual(true);
      expect(serialized).toContain("<Foo><bar>hello</bar></Foo>");
    });
  });
});
