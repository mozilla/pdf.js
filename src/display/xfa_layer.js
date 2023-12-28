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

// eslint-disable-next-line max-len
/** @typedef {import("./annotation_storage").AnnotationStorage} AnnotationStorage */
/** @typedef {import("./display_utils").PageViewport} PageViewport */
/** @typedef {import("../../web/interfaces").IPDFLinkService} IPDFLinkService */

import { XfaText } from "./xfa_text.js";

/**
 * @typedef {Object} XfaLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Object} xfaHtml
 * @property {AnnotationStorage} [annotationStorage]
 * @property {IPDFLinkService} linkService
 * @property {string} [intent] - (default value is 'display').
 */

class XfaLayer {
  static setupStorage(html, id, element, storage, intent) {
    const storedData = storage.getValue(id, { value: null });
    switch (element.name) {
      case "textarea":
        if (storedData.value !== null) {
          html.textContent = storedData.value;
        }
        if (intent === "print") {
          break;
        }
        html.addEventListener("input", event => {
          storage.setValue(id, { value: event.target.value });
        });
        break;
      case "input":
        if (
          element.attributes.type === "radio" ||
          element.attributes.type === "checkbox"
        ) {
          if (storedData.value === element.attributes.xfaOn) {
            html.setAttribute("checked", true);
          } else if (storedData.value === element.attributes.xfaOff) {
            // The checked attribute may have been set when opening the file,
            // unset through the UI and we're here because of printing.
            html.removeAttribute("checked");
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("change", event => {
            storage.setValue(id, {
              value: event.target.checked
                ? event.target.getAttribute("xfaOn")
                : event.target.getAttribute("xfaOff"),
            });
          });
        } else {
          if (storedData.value !== null) {
            html.setAttribute("value", storedData.value);
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("input", event => {
            storage.setValue(id, { value: event.target.value });
          });
        }
        break;
      case "select":
        if (storedData.value !== null) {
          html.setAttribute("value", storedData.value);
          for (const option of element.children) {
            if (option.attributes.value === storedData.value) {
              option.attributes.selected = true;
            } else if (option.attributes.hasOwnProperty("selected")) {
              delete option.attributes.selected;
            }
          }
        }
        html.addEventListener("input", event => {
          const options = event.target.options;
          const value =
            options.selectedIndex === -1
              ? ""
              : options[options.selectedIndex].value;
          storage.setValue(id, { value });
        });
        break;
    }
  }

  static setAttributes({ html, element, storage = null, intent, linkService }) {
    const { attributes } = element;
    const isHTMLAnchorElement = html instanceof HTMLAnchorElement;

    if (attributes.type === "radio") {
      // Avoid to have a radio group when printing with the same as one
      // already displayed.
      attributes.name = `${attributes.name}-${intent}`;
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) {
        continue;
      }

      switch (key) {
        case "class":
          if (value.length) {
            html.setAttribute(key, value.join(" "));
          }
          break;
        case "dataId":
          // We don't need to add dataId in the html object but it can
          // be useful to know its value when writing printing tests:
          // in this case, don't skip dataId to have its value.
          break;
        case "id":
          html.setAttribute("data-element-id", value);
          break;
        case "style":
          Object.assign(html.style, value);
          break;
        case "textContent":
          html.textContent = value;
          break;
        default:
          if (!isHTMLAnchorElement || (key !== "href" && key !== "newWindow")) {
            html.setAttribute(key, value);
          }
      }
    }

    if (isHTMLAnchorElement) {
      linkService.addLinkAttributes(
        html,
        attributes.href,
        attributes.newWindow
      );
    }

    // Set the value after the others to be sure to overwrite any other values.
    if (storage && attributes.dataId) {
      this.setupStorage(html, attributes.dataId, element, storage);
    }
  }

  /**
   * Render the XFA layer.
   *
   * @param {XfaLayerParameters} parameters
   */
  static render(parameters) {
    const storage = parameters.annotationStorage;
    const linkService = parameters.linkService;
    const root = parameters.xfaHtml;
    const intent = parameters.intent || "display";
    const rootHtml = document.createElement(root.name);
    if (root.attributes) {
      this.setAttributes({
        html: rootHtml,
        element: root,
        intent,
        linkService,
      });
    }

    const isNotForRichText = intent !== "richText";
    const rootDiv = parameters.div;
    rootDiv.append(rootHtml);

    if (parameters.viewport) {
      const transform = `matrix(${parameters.viewport.transform.join(",")})`;
      rootDiv.style.transform = transform;
    }

    // Set defaults.
    if (isNotForRichText) {
      rootDiv.setAttribute("class", "xfaLayer xfaFont");
    }

    // Text nodes used for the text highlighter.
    const textDivs = [];

    // In the rich text context, it's possible to just have a text node without
    // a root element, so we handle this case here (see issue 17215).
    if (root.children.length === 0) {
      if (root.value) {
        const node = document.createTextNode(root.value);
        rootHtml.append(node);
        if (isNotForRichText && XfaText.shouldBuildText(root.name)) {
          textDivs.push(node);
        }
      }
      return { textDivs };
    }

    const stack = [[root, -1, rootHtml]];

    while (stack.length > 0) {
      const [parent, i, html] = stack.at(-1);
      if (i + 1 === parent.children.length) {
        stack.pop();
        continue;
      }

      const child = parent.children[++stack.at(-1)[1]];
      if (child === null) {
        continue;
      }

      const { name } = child;
      if (name === "#text") {
        const node = document.createTextNode(child.value);
        textDivs.push(node);
        html.append(node);
        continue;
      }

      const childHtml = child?.attributes?.xmlns
        ? document.createElementNS(child.attributes.xmlns, name)
        : document.createElement(name);

      html.append(childHtml);
      if (child.attributes) {
        this.setAttributes({
          html: childHtml,
          element: child,
          storage,
          intent,
          linkService,
        });
      }

      if (child.children?.length > 0) {
        stack.push([child, -1, childHtml]);
      } else if (child.value) {
        const node = document.createTextNode(child.value);
        if (isNotForRichText && XfaText.shouldBuildText(name)) {
          textDivs.push(node);
        }
        childHtml.append(node);
      }
    }

    /**
     * TODO: re-enable that stuff once we've JS implementation.
     * See https://bugzilla.mozilla.org/show_bug.cgi?id=1719465.
     *
     * for (const el of rootDiv.querySelectorAll(
     * ".xfaDisabled input, .xfaDisabled textarea"
     * )) {
     * el.setAttribute("disabled", true);
     * }
     * for (const el of rootDiv.querySelectorAll(
     * ".xfaReadOnly input, .xfaReadOnly textarea"
     * )) {
     * el.setAttribute("readOnly", true);
     * }
     */

    for (const el of rootDiv.querySelectorAll(
      ".xfaNonInteractive input, .xfaNonInteractive textarea"
    )) {
      el.setAttribute("readOnly", true);
    }

    return {
      textDivs,
    };
  }

  /**
   * Update the XFA layer.
   *
   * @param {XfaLayerParameters} parameters
   */
  static update(parameters) {
    const transform = `matrix(${parameters.viewport.transform.join(",")})`;
    parameters.div.style.transform = transform;
    parameters.div.hidden = false;
  }
}

export { XfaLayer };
