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
});
