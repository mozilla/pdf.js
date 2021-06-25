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

import { $uid } from "../../src/core/xfa/xfa_object.js";
import { DataHandler } from "../../src/core/xfa/data.js";
import { searchNode } from "../../src/core/xfa/som.js";
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
      ["Receipt.Detail[1].PartNo", "foo-bar😀"],
      ["Receipt.Detail[1].Description", "hello world"],
    ]) {
      storage.set(searchNode(root, data, path)[0][$uid], { value });
    }

    const serialized = dataHandler.serialize(storage);
    const expected = `<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><foo>bar</foo><bar>foo</bar><xfa:data><Receipt><Page>1</Page><Detail PartNo="GS001"><Description>Giant Slingshot</Description><Units>12&amp;3</Units><Unit_Price>456&gt;</Unit_Price><Total_Price>789</Total_Price></Detail><Page>2</Page><Detail PartNo="foo-bar&#x1F600;"><Description>hello world</Description><Units>5</Units><Unit_Price>12.00</Unit_Price><Total_Price>60.00</Total_Price></Detail><Sub_Total>310.00</Sub_Total><Tax>24.80</Tax><Total_Price>334.80</Total_Price></Receipt></xfa:data></xfa:datasets>`;

    expect(serialized).toEqual(expected);
  });
});
