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

/** @typedef {import("./api").TextContent} TextContent */

class XfaText {
  /**
   * Walk an XFA tree and create an array of text nodes that is compatible
   * with a regular PDFs TextContent. Currently, only TextItem.str is supported,
   * all other fields and styles haven't been implemented.
   *
   * @param {Object} xfa - An XFA fake DOM object.
   *
   * @returns {TextContent}
   */
  static textContent(xfa) {
    const items = [];
    const output = {
      items,
      styles: Object.create(null),
    };
    function walk(node) {
      if (!node) {
        return;
      }
      let str = null;
      const name = node.name;
      if (name === "#text") {
        str = node.value;
      } else if (!XfaText.shouldBuildText(name)) {
        return;
      } else if (node?.attributes?.textContent) {
        str = node.attributes.textContent;
      } else if (node.value) {
        str = node.value;
      }
      if (str !== null) {
        items.push({
          str,
        });
      }
      if (!node.children) {
        return;
      }
      for (const child of node.children) {
        walk(child);
      }
    }
    walk(xfa);
    return output;
  }

  /**
   * @param {string} name - DOM node name. (lower case)
   *
   * @returns {boolean} true if the DOM node should have a corresponding text
   * node.
   */
  static shouldBuildText(name) {
    return !(
      name === "textarea" ||
      name === "input" ||
      name === "option" ||
      name === "select"
    );
  }
}

export { XfaText };
