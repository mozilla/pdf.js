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

import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";

function equalTrees(rootA, rootB) {
  function walk(a, b) {
    expect(a.role).toEqual(b.role);
    expect(a.lang).toEqual(b.lang);
    expect(a.type).toEqual(b.type);
    expect(a.mathML).toEqual(b.mathML);
    expect("children" in a).toEqual("children" in b);
    if (!a.children) {
      return;
    }
    expect(a.children.length).toEqual(b.children.length);
    for (let i = 0; i < rootA.children.length; i++) {
      walk(a.children[i], b.children[i]);
    }
  }
  return walk(rootA, rootB);
}

describe("struct tree", function () {
  describe("getStructTree", function () {
    it("parses basic structure", async function () {
      const filename = "structure_simple.pdf";
      const params = buildGetDocumentParams(filename);
      const loadingTask = getDocument(params);
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const struct = await page.getStructTree();
      equalTrees(
        {
          role: "Root",
          children: [
            {
              role: "Document",
              lang: "en-US",
              children: [
                {
                  role: "H1",
                  children: [
                    { role: "NonStruct", children: [{ type: "content" }] },
                  ],
                },
                {
                  role: "P",
                  children: [
                    { role: "NonStruct", children: [{ type: "content" }] },
                  ],
                },
                {
                  role: "H2",
                  children: [
                    { role: "NonStruct", children: [{ type: "content" }] },
                  ],
                },
                {
                  role: "P",
                  children: [
                    { role: "NonStruct", children: [{ type: "content" }] },
                  ],
                },
              ],
            },
          ],
        },
        struct
      );
      await loadingTask.destroy();
    });

    it("parses structure with marked content reference", async function () {
      const filename = "issue6782.pdf";
      const params = buildGetDocumentParams(filename);
      const loadingTask = getDocument(params);
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const struct = await page.getStructTree();
      equalTrees(
        {
          role: "Root",
          children: [
            {
              role: "Part",
              children: [
                { role: "P", children: Array(27).fill({ type: "content" }) },
              ],
            },
          ],
        },
        struct
      );
      await loadingTask.destroy();
    });
  });

  it("parses structure with a figure and its bounding box", async function () {
    const filename = "bug1708040.pdf";
    const params = buildGetDocumentParams(filename);
    const loadingTask = getDocument(params);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const struct = await page.getStructTree();
    equalTrees(
      {
        children: [
          {
            role: "Document",
            children: [
              {
                role: "Sect",
                children: [
                  {
                    role: "P",
                    children: [{ type: "content", id: "p21R_mc0" }],
                    lang: "EN-US",
                  },
                  {
                    role: "P",
                    children: [{ type: "content", id: "p21R_mc1" }],
                    lang: "EN-US",
                  },
                  {
                    role: "Figure",
                    children: [{ type: "content", id: "p21R_mc2" }],
                    alt: "A logo of a fox and a globe\u0000",
                    bbox: [72, 287.782, 456, 695.032],
                  },
                ],
              },
            ],
          },
        ],
        role: "Root",
      },
      struct
    );
    await loadingTask.destroy();
  });

  it("parses structure with some MathML in AF dictionary", async function () {
    const filename = "bug1937438_af_from_latex.pdf";
    const params = buildGetDocumentParams(filename);
    const loadingTask = getDocument(params);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const struct = await page.getStructTree();
    equalTrees(
      {
        children: [
          {
            role: "Document",
            children: [
              {
                role: "Part",
                children: [
                  {
                    role: "P",
                    children: [
                      {
                        role: "P",
                        children: [{ type: "content", id: "p58R_mc0" }],
                      },
                    ],
                  },
                  {
                    role: "P",
                    children: [{ type: "content", id: "p58R_mc1" }],
                  },
                  {
                    role: "P",
                    children: [{ type: "content", id: "p58R_mc2" }],
                  },
                ],
              },
              {
                role: "Sect",
                children: [
                  {
                    role: "H1",
                    children: [
                      {
                        role: "Lbl",
                        children: [{ type: "content", id: "p58R_mc3" }],
                      },
                      { type: "content", id: "p58R_mc4" },
                    ],
                  },
                  {
                    role: "Part",
                    children: [
                      {
                        role: "P",
                        children: [
                          { type: "content", id: "p58R_mc5" },
                          {
                            role: "Formula",
                            children: [{ type: "content", id: "p58R_mc6" }],
                            mathML: "<math> <mi>x</mi> </math>",
                          },
                          { type: "content", id: "p58R_mc7" },
                          {
                            role: "Formula",
                            children: [{ type: "content", id: "p58R_mc8" }],
                            mathML: "<math> <mi>y</mi> </math>",
                          },
                          { type: "content", id: "p58R_mc9" },
                          {
                            role: "Formula",
                            children: [{ type: "content", id: "p58R_mc10" }],
                            mathML:
                              "<math> <mi>x</mi> <mo>&gt;</mo> <mi>y</mi> </math>",
                          },
                          { type: "content", id: "p58R_mc11" },
                        ],
                      },
                    ],
                  },
                  {
                    role: "Part",
                    children: [
                      {
                        role: "P",
                        children: [{ type: "content", id: "p58R_mc12" }],
                      },
                      {
                        role: "Formula",
                        children: [{ type: "content", id: "p58R_mc13" }],
                        mathML:
                          '<math> <msqrt><msup><mi>x</mi><mn>2</mn></msup></msqrt> <mo>=</mo> <mrow intent="absolute-value($x)"><mo>|</mo><mi arg="x">x</mi><mo>|</mo></mrow> </math>',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        role: "Root",
      },
      struct
    );
    await loadingTask.destroy();
  });

  it("parses structure with some MathML in MS Office specific entry", async function () {
    const filename = "bug1937438_from_word.pdf";
    const params = buildGetDocumentParams(filename);
    const loadingTask = getDocument(params);
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const struct = await page.getStructTree();
    equalTrees(
      {
        children: [
          {
            role: "Document",
            children: [
              {
                role: "P",
                children: [
                  { type: "content", id: "p3R_mc0" },
                  {
                    role: "Formula",
                    children: [{ type: "content", id: "p3R_mc1" }],
                    alt: "pi",
                    mathML: '<math display="block"><mi>&#x1D70B;</mi></math>',
                  },
                  { type: "content", id: "p3R_mc2" },
                ],
              },
              {
                role: "Formula",
                children: [{ type: "content", id: "p3R_mc3" }],
                alt: "6 sum from n equals 1 to infinity of 1 over n squared , equals pi squared",
                mathML:
                  '<math display="block"><mn>6</mn><mrow><munderover><mo stretchy="false">&#x2211;</mo><mrow><mi>n</mi><mo>=</mo><mn>1</mn></mrow><mo>&#x221E;</mo></munderover><mfrac><mn>1</mn><msup><mrow><mi>n</mi></mrow><mn>2</mn></msup></mfrac></mrow><mo>=</mo><msup><mrow><mi>&#x1D70B;</mi></mrow><mn>2</mn></msup></math>',
              },
              { role: "P", children: [{ type: "content", id: "p3R_mc4" }] },
              { role: "P", children: [{ type: "content", id: "p3R_mc5" }] },
            ],
          },
        ],
        role: "Root",
      },
      struct
    );
  });

  it("should collect all list and table items in StructTree", async function () {
    const findNodes = (node, check) => {
      const results = [];
      if (check(node)) {
        results.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          results.push(...findNodes(child, check));
        }
      }
      return results;
    };
    const loadingTask = getDocument(buildGetDocumentParams("issue20324.pdf"));

    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);
    const tree = await page.getStructTree({
      includeMarkedContent: true,
    });
    const cells = findNodes(tree, node => node.role === "TD");
    expect(cells.length).toEqual(4);

    const listItems = findNodes(tree, node => node.role === "LI");
    expect(listItems.length).toEqual(4);

    await loadingTask.destroy();
  });
});
