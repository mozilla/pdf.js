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

import { Dict, Ref } from "../../src/core/primitives.js";
import { NameTree, NumberTree } from "../../src/core/name_number_tree.js";
import { XRefMock } from "./test_utils.js";

describe("NameOrNumberTree", function () {
  describe("NameTree", function () {
    it("should return an empty map when root is null", function () {
      const xref = new XRefMock([]);
      const tree = new NameTree(null, xref);
      expect(tree.getAll().size).toEqual(0);
    });

    it("should collect all entries from a flat tree", function () {
      const root = new Dict();
      root.set("Names", ["alpha", "value_a", "beta", "value_b"]);

      const xref = new XRefMock([]);
      const tree = new NameTree(root, xref);
      const map = tree.getAll();

      expect(map.size).toEqual(2);
      expect(map.get("alpha")).toEqual("value_a");
      expect(map.get("beta")).toEqual("value_b");
    });

    it("should collect all entries from a tree with Ref-based Kids", function () {
      const leafRef = Ref.get(10, 0);
      const leaf = new Dict();
      leaf.set("Names", ["key1", "val1", "key2", "val2"]);

      const root = new Dict();
      root.set("Kids", [leafRef]);

      const xref = new XRefMock([{ ref: leafRef, data: leaf }]);
      const tree = new NameTree(root, xref);
      const map = tree.getAll();

      expect(map.size).toEqual(2);
      expect(map.get("key1")).toEqual("val1");
      expect(map.get("key2")).toEqual("val2");
    });

    it("should handle Kids containing inline (non-Ref) Dict nodes without throwing", function () {
      // Regression test: before the fix, processed.put() was called on non-Ref
      // Dict objects, causing an error in TESTING mode because RefSet only
      // accepts Ref instances or ref strings.
      const inlineLeaf = new Dict();
      inlineLeaf.set("Names", ["key1", "val1", "key2", "val2"]);

      const root = new Dict();
      root.set("Kids", [inlineLeaf]);

      const xref = new XRefMock([]);
      const tree = new NameTree(root, xref);

      // Should not throw even though the kid is an inline Dict (not a Ref).
      const map = tree.getAll();
      expect(map.size).toEqual(2);
      expect(map.get("key1")).toEqual("val1");
      expect(map.get("key2")).toEqual("val2");
    });

    it("should throw on duplicate Ref entries in Kids", function () {
      const leafRef = Ref.get(20, 0);
      const leaf = new Dict();
      leaf.set("Names", ["a", "b"]);

      const root = new Dict();
      root.set("Kids", [leafRef, leafRef]);

      const xref = new XRefMock([{ ref: leafRef, data: leaf }]);
      const tree = new NameTree(root, xref);

      expect(() => tree.getAll()).toThrow(
        new Error('Duplicate entry in "Names" tree.')
      );
    });

    it("should resolve Ref values when isRaw is false", function () {
      const valRef = Ref.get(30, 0);
      const valData = "resolved_value";

      const root = new Dict();
      root.set("Names", ["mykey", valRef]);

      const xref = new XRefMock([{ ref: valRef, data: valData }]);
      const tree = new NameTree(root, xref);

      const map = tree.getAll();
      expect(map.get("mykey")).toEqual("resolved_value");
    });

    it("should keep raw Ref values when isRaw is true", function () {
      const valRef = Ref.get(31, 0);

      const root = new Dict();
      root.set("Names", ["mykey", valRef]);

      const xref = new XRefMock([{ ref: valRef, data: "resolved_value" }]);
      const tree = new NameTree(root, xref);

      const map = tree.getAll(/* isRaw = */ true);
      expect(map.get("mykey")).toBe(valRef);
    });
  });

  describe("NumberTree", function () {
    it("should collect all entries from a flat tree", function () {
      const root = new Dict();
      root.set("Nums", [1, "one", 2, "two"]);

      const xref = new XRefMock([]);
      const tree = new NumberTree(root, xref);
      const map = tree.getAll();

      expect(map.size).toEqual(2);
      expect(map.get(1)).toEqual("one");
      expect(map.get(2)).toEqual("two");
    });

    it("should handle Kids containing inline (non-Ref) Dict nodes without throwing", function () {
      // Same regression as NameTree: non-Ref kids must not be passed to
      // RefSet.put().
      const inlineLeaf = new Dict();
      inlineLeaf.set("Nums", [0, "zero", 1, "one"]);

      const root = new Dict();
      root.set("Kids", [inlineLeaf]);

      const xref = new XRefMock([]);
      const tree = new NumberTree(root, xref);

      const map = tree.getAll();
      expect(map.size).toEqual(2);
      expect(map.get(0)).toEqual("zero");
      expect(map.get(1)).toEqual("one");
    });

    it("should throw on duplicate Ref entries in Kids", function () {
      const leafRef = Ref.get(40, 0);
      const leaf = new Dict();
      leaf.set("Nums", [5, "five"]);

      const root = new Dict();
      root.set("Kids", [leafRef, leafRef]);

      const xref = new XRefMock([{ ref: leafRef, data: leaf }]);
      const tree = new NumberTree(root, xref);

      expect(() => tree.getAll()).toThrow(
        new Error('Duplicate entry in "Nums" tree.')
      );
    });
  });
});
