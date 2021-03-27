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

class XfaLayer {
  static setAttributes(html, attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (key !== "style") {
        html.setAttribute(key, value);
      } else {
        Object.assign(html.style, value);
      }
    }
  }

  static render(parameters) {
    const root = parameters.xfa;
    const rootHtml = document.createElement(root.name);
    if (root.attributes) {
      XfaLayer.setAttributes(rootHtml, root.attributes);
    }
    const stack = [[root, -1, rootHtml]];

    const rootDiv = parameters.div;
    rootDiv.appendChild(rootHtml);
    const coeffs = parameters.viewport.transform.join(",");
    rootDiv.style.transform = `matrix(${coeffs})`;

    // Set defaults.
    rootDiv.setAttribute("class", "xfaLayer xfaFont");

    while (stack.length > 0) {
      const [parent, i, html] = stack[stack.length - 1];
      if (i + 1 === parent.children.length) {
        stack.pop();
        continue;
      }

      const child = parent.children[++stack[stack.length - 1][1]];
      if (child === null) {
        continue;
      }

      const { name } = child;
      if (name === "#text") {
        html.appendChild(document.createTextNode(child.value));
        continue;
      }

      const childHtml = document.createElement(name);
      html.appendChild(childHtml);
      if (child.attributes) {
        XfaLayer.setAttributes(childHtml, child.attributes);
      }

      if (child.children && child.children.length > 0) {
        stack.push([child, -1, childHtml]);
      } else if (child.value) {
        childHtml.appendChild(document.createTextNode(child.value));
      }
    }
  }

  /**
   * Update the xfa layer.
   *
   * @public
   * @param {XfaLayerParameters} parameters
   * @memberof XfaLayer
   */
  static update(parameters) {
    const transform = `matrix(${parameters.viewport.transform.join(",")})`;
    parameters.div.style.transform = transform;
    parameters.div.hidden = false;
  }
}

export { XfaLayer };
