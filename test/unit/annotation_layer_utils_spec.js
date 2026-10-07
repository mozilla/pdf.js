/* Copyright 2017 Mozilla Foundation
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
import { renderRichText } from "../../src/display/annotation_layer_utils.js";

describe("annotation_layer_utils", function () {
  describe("renderRichText", function () {
    // Unlike other tests we cannot simply compare the HTML-strings since
    // Chrome and Firefox produce different results. Instead we compare sets
    // containing the individual parts of the HTML-strings.
    const splitParts = s => new Set(s.split(/[<>/ ]+/).filter(Boolean));

    it("should render plain text", function () {
      if (isNodeJS) {
        pending("DOM is not supported in Node.js.");
      }
      const container = document.createElement("div");
      renderRichText(
        {
          html: "Hello world!\nThis is a test.",
          dir: "ltr",
          className: "foo",
        },
        container
      );
      expect(splitParts(container.innerHTML)).toEqual(
        splitParts(
          '<p dir="ltr" class="richText foo">Hello world!<br>This is a test.</p>'
        )
      );
    });

    it("should render XFA rich text", function () {
      if (isNodeJS) {
        pending("DOM is not supported in Node.js.");
      }
      const container = document.createElement("div");
      const xfaHtml = {
        name: "div",
        attributes: { style: { color: "red" } },
        children: [
          {
            name: "p",
            attributes: { style: { fontSize: "20px" } },
            children: [
              {
                name: "span",
                attributes: { style: { fontWeight: "bold" } },
                value: "Hello",
              },
              { name: "#text", value: " world!" },
            ],
          },
        ],
      };
      renderRichText(
        { html: xfaHtml, dir: "ltr", className: "foo" },
        container
      );
      expect(splitParts(container.innerHTML)).toEqual(
        splitParts(
          '<div style="color: red;" class="richText foo">' +
            '<p style="font-size: 20px;">' +
            '<span style="font-weight: bold;">Hello</span> world!</p></div>'
        )
      );
    });

    it("should only keep the supported rich text elements", function () {
      if (isNodeJS) {
        pending("DOM is not supported in Node.js.");
      }
      const container = document.createElement("div");
      const xfaHtml = {
        name: "div",
        children: [
          { name: "p", value: "kept" },
          {
            name: "section",
            children: [{ name: "span", value: "removed" }],
          },
        ],
      };
      renderRichText(
        { html: xfaHtml, dir: "ltr", className: "foo" },
        container
      );

      expect(container.querySelector("p")).not.toBeNull();
      expect(container.querySelector("section")).toBeNull();
      expect(container.querySelector("span")).toBeNull();
      expect(container.textContent).toEqual("kept");
    });

    it("should only keep the supported rich text attributes", function () {
      if (isNodeJS) {
        pending("DOM is not supported in Node.js.");
      }
      const container = document.createElement("div");
      const xfaHtml = {
        name: "div",
        children: [
          {
            name: "p",
            attributes: { class: ["bar"], dir: "rtl", title: "unsupported" },
            value: "text",
          },
        ],
      };
      renderRichText(
        { html: xfaHtml, dir: "ltr", className: "foo" },
        container
      );
      const p = container.querySelector("p");

      expect(p.getAttribute("class")).toEqual("bar");
      expect(p.getAttribute("dir")).toEqual("rtl");
      expect(p.hasAttribute("title")).toEqual(false);
    });

    it("should only apply the supported rich text style properties", function () {
      if (isNodeJS) {
        pending("DOM is not supported in Node.js.");
      }
      const container = document.createElement("div");
      const xfaHtml = {
        name: "div",
        children: [
          {
            name: "span",
            attributes: { style: { color: "green", width: "100px" } },
            value: "text",
          },
        ],
      };
      renderRichText(
        { html: xfaHtml, dir: "ltr", className: "foo" },
        container
      );
      const span = container.querySelector("span");

      expect(span.style.color).toEqual("green");
      expect(span.style.width).toEqual("");
    });
  });
});
