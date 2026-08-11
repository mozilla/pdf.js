/* Copyright 2026 Mozilla Foundation
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

import { isNodeJS } from "../../src/shared/util.js";
import { StructTreeLayerBuilder } from "../../web/struct_tree_layer_builder.js";

describe("StructTreeLayerBuilder", function () {
  function render(structTree) {
    return new StructTreeLayerBuilder({
      getStructTree: async () => structTree,
    }).render();
  }

  beforeEach(function () {
    if (isNodeJS) {
      pending("Document is not supported in Node.js.");
    }
  });

  it("exposes paragraph and text emphasis semantics (issue 21732)", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "P",
          children: [
            { type: "content", id: "p1R_mc0" },
            {
              role: "Strong",
              children: [{ type: "content", id: "p1R_mc1" }],
            },
            {
              role: "Em",
              children: [{ type: "content", id: "p1R_mc2" }],
            },
          ],
        },
        {
          role: "P",
          children: [
            {
              role: "Em",
              children: [{ type: "content", id: "p1R_mc3" }],
            },
          ],
        },
      ],
    });

    expect(tree.querySelectorAll('[role="paragraph"]').length).toEqual(2);
    expect(tree.querySelectorAll('[role="emphasis"]').length).toEqual(2);
    expect(tree.querySelectorAll('[role="strong"]').length).toEqual(1);
  });

  it("exposes additional document structure semantics", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Art",
          children: [
            {
              role: "BlockQuote",
              children: [
                {
                  role: "Note",
                  children: [{ type: "content", id: "p1R_mc4" }],
                },
                {
                  role: "Code",
                  children: [{ type: "content", id: "p1R_mc5" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const article = tree.querySelector('[role="article"]');
    expect(article).not.toBeNull();
    const blockQuote = article.querySelector('[role="blockquote"]');
    expect(blockQuote).not.toBeNull();
    expect(blockQuote.querySelector('[role="note"]')).not.toBeNull();
    expect(blockQuote.querySelector('[role="code"]')).not.toBeNull();
  });

  it("describes, instead of naming, the roles prohibiting accessible names", async function () {
    const roles = [
      ["P", "paragraph"],
      ["Em", "emphasis"],
      ["Strong", "strong"],
      ["Code", "code"],
    ];
    const tree = await render({
      role: "Root",
      children: roles.map(([role], index) => ({
        role,
        alt: `Alternative text ${index}`,
        children: [{ type: "content", id: `p1R_mc${index}` }],
      })),
    });

    roles.forEach(([, role], index) => {
      const element = tree.querySelector(`[role="${role}"]`);

      expect(element.getAttribute("aria-label")).toBeNull();
      expect(element.getAttribute("aria-description")).toEqual(
        `Alternative text ${index}`
      );
    });
  });

  it("describes the implicit generic role of a roleless span", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Span",
          alt: "Alternative text",
          children: [{ type: "content", id: "p1R_mc0" }],
        },
      ],
    });
    const element = tree.firstElementChild;

    expect(element.getAttribute("role")).toBeNull();
    expect(element.getAttribute("aria-label")).toBeNull();
    expect(element.getAttribute("aria-description")).toEqual(
      "Alternative text"
    );
  });

  it("keeps NonStruct presentational when it has alternative text", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "NonStruct",
          alt: "Alternative text",
          children: [{ type: "content", id: "p1R_mc0" }],
        },
      ],
    });
    const element = tree.querySelector('[role="none"]');

    expect(element.getAttribute("aria-label")).toBeNull();
    expect(element.getAttribute("aria-description")).toBeNull();
    expect(element.getAttribute("aria-owns")).toBeNull();
    expect(element.firstElementChild.getAttribute("aria-owns")).toEqual(
      "p1R_mc0"
    );
  });

  it("keeps the caption role when the caption has an alternative text", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Table",
          children: [
            {
              role: "Caption",
              alt: "Life expectancy by country",
              children: [{ type: "content", id: "p1R_mc0" }],
            },
          ],
        },
      ],
    });
    const caption = tree.querySelector('[role="caption"]');

    expect(caption.getAttribute("aria-description")).toEqual(
      "Life expectancy by country"
    );
    expect(caption.getAttribute("aria-owns")).toEqual("p1R_mc0");
  });

  it("exposes table semantics", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Table",
          summary: "A summary of the table",
          children: [
            { role: "Caption", children: [] },
            {
              role: "THead",
              children: [
                {
                  role: "TR",
                  children: [
                    {
                      role: "TH",
                      structId: "parentHeader",
                      scope: "Column",
                      short: "Parent",
                      children: [],
                    },
                    {
                      role: "TH",
                      structId: "rowHeader",
                      scope: "Row",
                      rowSpan: 2,
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              role: "TBody",
              children: [
                {
                  role: "TR",
                  children: [
                    {
                      role: "TH",
                      structId: "columnHeader",
                      scope: "Column",
                      colSpan: 3,
                      headers: ["parentHeader"],
                      children: [],
                    },
                    {
                      role: "TD",
                      headers: ["columnHeader", "rowHeader"],
                      children: [],
                    },
                  ],
                },
              ],
            },
            { role: "TFoot", children: [] },
          ],
        },
      ],
    });
    const table = tree.querySelector('[role="table"]');

    expect(table.getAttribute("aria-description")).toEqual(
      "A summary of the table"
    );
    expect(
      Array.from(table.children, element => element.getAttribute("role"))
    ).toEqual(["caption", "rowgroup", "rowgroup", "rowgroup"]);

    const [parentHeader, columnHeader] = tree.querySelectorAll(
      '[role="columnheader"]'
    );
    const rowHeader = tree.querySelector('[role="rowheader"]');
    const cell = tree.querySelector('[role="cell"]');

    expect(rowHeader.getAttribute("aria-rowspan")).toEqual("2");
    expect(columnHeader.getAttribute("aria-colspan")).toEqual("3");

    // Use generated DOM identifiers rather than identifiers supplied by the
    // PDF.
    expect(parentHeader.id).not.toEqual("parentHeader");

    // Keep `Short` out of the header's own accessible name; referring cells
    // use it through the hidden `aria-describedby` target.
    expect(parentHeader.getAttribute("aria-label")).toBeNull();
    const abbreviation = parentHeader.firstElementChild;
    expect(abbreviation.textContent).toEqual("Parent");
    expect(abbreviation.getAttribute("aria-hidden")).toEqual("true");

    expect(columnHeader.getAttribute("aria-describedby")).toEqual(
      abbreviation.id
    );
    expect(cell.getAttribute("aria-describedby").split(" ")).toEqual([
      columnHeader.id,
      abbreviation.id,
      rowHeader.id,
    ]);
  });

  it("keeps the alt text of a header having a short form", async function () {
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Table",
          children: [
            {
              role: "TR",
              children: [
                {
                  role: "TH",
                  structId: "header",
                  scope: "Column",
                  alt: "Gross domestic product",
                  short: "GDP",
                  children: [{ type: "content", id: "p1R_mc0" }],
                },
              ],
            },
          ],
        },
      ],
    });
    const header = tree.querySelector('[role="columnheader"]');

    expect(header.getAttribute("aria-label")).toEqual("Gross domestic product");
    expect(header.getAttribute("aria-owns")).toEqual("p1R_mc0");
    expect(header.firstElementChild.textContent).toEqual("GDP");
  });

  it("doesn't collapse a table cell into its row (issue 18090)", async function () {
    // Keep a single structural cell distinct from its row; otherwise the
    // cell's role and attributes would be applied to the row.
    const tree = await render({
      role: "Root",
      children: [
        {
          role: "Table",
          children: [
            {
              role: "TR",
              children: [
                {
                  role: "TH",
                  structId: "header",
                  colSpan: 3,
                  scope: "Column",
                  children: [{ type: "content", id: "p1R_mc0" }],
                },
              ],
            },
          ],
        },
      ],
    });
    const row = tree.querySelector('[role="row"]');
    const header = row.firstElementChild;

    expect(header.getAttribute("role")).toEqual("columnheader");
    expect(header.getAttribute("aria-colspan")).toEqual("3");
    expect(header.getAttribute("aria-owns")).toEqual("p1R_mc0");

    expect(row.getAttribute("aria-colspan")).toBeNull();
    expect(row.getAttribute("aria-owns")).toBeNull();
    expect(row.id).toEqual("");
  });

  it("only uses the caption role inside a table or a figure", async function () {
    const tree = await render({
      role: "Root",
      children: [
        { role: "Table", children: [{ role: "Caption", children: [] }] },
        { role: "Figure", children: [{ role: "Caption", children: [] }] },
        { role: "Div", children: [{ role: "Caption", children: [] }] },
      ],
    });
    const [table, figure, div] = tree.children;

    expect(table.firstElementChild.getAttribute("role")).toEqual("caption");
    expect(figure.firstElementChild.getAttribute("role")).toEqual("caption");
    expect(div.firstElementChild.getAttribute("role")).toBeNull();
  });
});
