/* Copyright 2024 Mozilla Foundation
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

import { OutlineRenderer } from "../../src/display/outline_renderer.js";

describe("OutlineRenderer", function () {
  let container;
  let navigateSpy;

  beforeEach(function () {
    container = document.createElement("div");
    document.body.appendChild(container);
    navigateSpy = jasmine.createSpy("onNavigate");
  });

  afterEach(function () {
    container.remove();
  });

  function createRenderer(opts = {}) {
    return new OutlineRenderer({
      container,
      onNavigate: navigateSpy,
      ...opts,
    });
  }

  function sampleOutline() {
    return [
      {
        title: "Chapter 1",
        dest: [0, { name: "Fit" }],
        items: [
          { title: "Section 1.1", dest: [1, { name: "Fit" }], items: [] },
          { title: "Section 1.2", dest: [2, { name: "Fit" }], items: [] },
        ],
      },
      {
        title: "Chapter 2",
        dest: [3, { name: "Fit" }],
        items: [],
      },
    ];
  }

  describe("constructor", function () {
    it("should throw if no container is provided", function () {
      expect(() => new OutlineRenderer({ onNavigate: () => {} })).toThrowError(
        /container element is required/
      );
    });

    it("should accept valid options", function () {
      const renderer = createRenderer();
      expect(renderer).toBeDefined();
    });
  });

  describe("render", function () {
    it("should display a message when outline is null", function () {
      const renderer = createRenderer();
      renderer.render(null);
      expect(container.querySelector("p").textContent).toBe(
        "No outline available."
      );
    });

    it("should display a message when outline is empty", function () {
      const renderer = createRenderer();
      renderer.render([]);
      expect(container.querySelector("p").textContent).toBe(
        "No outline available."
      );
    });

    it("should create a tree with the correct ARIA role", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const tree = container.querySelector('[role="tree"]');
      expect(tree).not.toBeNull();
      expect(tree.getAttribute("aria-label")).toBe("Document outline");
    });

    it("should render top-level items as treeitems", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const items = container.querySelectorAll(
        '[role="tree"] > [role="treeitem"]'
      );
      expect(items.length).toBe(2);
    });

    it("should create a search input", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const input = container.querySelector('input[type="search"]');
      expect(input).not.toBeNull();
      expect(input.getAttribute("aria-label")).toBe("Search outline");
    });

    it("should render child items inside a group", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const groups = container.querySelectorAll('[role="group"]');
      expect(groups.length).toBe(1); // Only Chapter 1 has children
    });
  });

  describe("expand/collapse", function () {
    it("should start collapsed by default", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const node = container.querySelector('[aria-expanded]');
      expect(node.getAttribute("aria-expanded")).toBe("false");
    });

    it("should start expanded when expandAll is true", function () {
      const renderer = createRenderer({ expandAll: true });
      renderer.render(sampleOutline());
      const node = container.querySelector('[aria-expanded]');
      expect(node.getAttribute("aria-expanded")).toBe("true");
    });

    it("should toggle on click of toggle button", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const toggle = container.querySelector(".pdfjs-outline-toggle");
      expect(toggle).not.toBeNull();
      toggle.click();
      const node = toggle.parentElement;
      expect(node.getAttribute("aria-expanded")).toBe("true");
      toggle.click();
      expect(node.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("navigation", function () {
    it("should call onNavigate with dest on title click", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      const titles = container.querySelectorAll(".pdfjs-outline-title");
      titles[1].click(); // Chapter 2 (leaf)
      expect(navigateSpy).toHaveBeenCalledWith([3, { name: "Fit" }]);
    });

    it("should not call onNavigate for items without dest", function () {
      const renderer = createRenderer();
      renderer.render([{ title: "No dest", items: [] }]);
      const title = container.querySelector(".pdfjs-outline-title");
      title.click();
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  describe("keyboard navigation", function () {
    function dispatchKey(element, key) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
    }

    it("should navigate down with ArrowDown", function () {
      const renderer = createRenderer({ expandAll: true });
      renderer.render(sampleOutline());
      const firstItem = container.querySelector('[role="treeitem"]');
      firstItem.focus();
      dispatchKey(firstItem, "ArrowDown");
      // Focus should have moved
      const focused = container.querySelector('[tabindex="0"]');
      expect(focused).not.toBe(firstItem);
    });

    it("should navigate to first item with Home", function () {
      const renderer = createRenderer({ expandAll: true });
      renderer.render(sampleOutline());
      const items = container.querySelectorAll('[role="treeitem"]');
      items[items.length - 1].focus();
      dispatchKey(items[items.length - 1], "Home");
      const focused = container.querySelector('[tabindex="0"]');
      expect(focused.querySelector(".pdfjs-outline-title").textContent).toBe(
        "Chapter 1"
      );
    });
  });

  describe("search", function () {
    it("should hide non-matching items", function () {
      const renderer = createRenderer({ expandAll: true });
      renderer.render(sampleOutline());
      const input = container.querySelector('input[type="search"]');
      input.value = "Chapter 2";
      input.dispatchEvent(new Event("input"));

      const hidden = container.querySelectorAll(".pdfjs-outline-hidden");
      expect(hidden.length).toBeGreaterThan(0);
    });

    it("should show all items when search is cleared", function () {
      const renderer = createRenderer({ expandAll: true });
      renderer.render(sampleOutline());
      const input = container.querySelector('input[type="search"]');
      input.value = "xyz";
      input.dispatchEvent(new Event("input"));
      input.value = "";
      input.dispatchEvent(new Event("input"));

      const hidden = container.querySelectorAll(".pdfjs-outline-hidden");
      expect(hidden.length).toBe(0);
    });
  });

  describe("dispose", function () {
    it("should remove all content from the container", function () {
      const renderer = createRenderer();
      renderer.render(sampleOutline());
      expect(container.children.length).toBeGreaterThan(0);
      renderer.dispose();
      expect(container.children.length).toBe(0);
    });
  });
});
