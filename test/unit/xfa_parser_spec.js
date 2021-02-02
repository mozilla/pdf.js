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

import { $dump } from "../../src/core/xfa/xfa_object.js";
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
</xdp:xdp>
      `;
      const root = new XFAParser().parse(xml);
      const expected = {
        uuid: "1234",
        timeStamp: "",
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
  });
});
