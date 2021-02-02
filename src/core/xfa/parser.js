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

import { $clean, $finalize, $onChild, $onText } from "./xfa_object.js";
import { XMLParserBase, XMLParserErrorCode } from "../../shared/xml_parser.js";
import { Builder } from "./builder.js";
import { warn } from "../../shared/util.js";

class XFAParser extends XMLParserBase {
  constructor() {
    super();
    this._builder = new Builder();
    this._stack = [];
    this._current = this._builder.buildRoot();
    this._errorCode = XMLParserErrorCode.NoError;
    this._whiteRegex = /^\s+$/;
  }

  parse(data) {
    this.parseXml(data);

    if (this._errorCode !== XMLParserErrorCode.NoError) {
      return undefined;
    }

    return this._current.element;
  }

  onText(text) {
    if (this._whiteRegex.test(text)) {
      return;
    }
    this._current[$onText](text.trim());
  }

  onCdata(text) {
    this._current[$onText](text);
  }

  _mkAttributes(attributes, tagName) {
    // Transform attributes into an object and get out
    // namespaces information.
    let namespace = null;
    let prefixes = null;
    const attributeObj = Object.create(null);
    for (const { name, value } of attributes) {
      if (name === "xmlns") {
        if (!namespace) {
          namespace = value;
        } else {
          warn(`XFA - multiple namespace definition in <${tagName}>`);
        }
      } else if (name.startsWith("xmlns:")) {
        const prefix = name.substring("xmlns:".length);
        if (!prefixes) {
          prefixes = [];
        }
        prefixes.push({ prefix, value });
      } else {
        attributeObj[name] = value;
      }
    }

    return [namespace, prefixes, attributeObj];
  }

  _getNameAndPrefix(name) {
    const i = name.indexOf(":");
    if (i === -1) {
      return [name, null];
    }
    return [name.substring(i + 1), name.substring(0, i)];
  }

  onBeginElement(tagName, attributes, isEmpty) {
    const [namespace, prefixes, attributesObj] = this._mkAttributes(
      attributes,
      tagName
    );
    const [name, nsPrefix] = this._getNameAndPrefix(tagName);
    const node = this._builder.build({
      nsPrefix,
      name,
      attributes: attributesObj,
      namespace,
      prefixes,
    });

    if (isEmpty) {
      // No children: just push the node into its parent.
      node[$finalize]();
      this._current[$onChild](node);
      node[$clean](this._builder);
      return;
    }

    this._stack.push(this._current);
    this._current = node;
  }

  onEndElement(name) {
    const node = this._current;
    node[$finalize]();
    this._current = this._stack.pop();
    this._current[$onChild](node);
    node[$clean](this._builder);
  }

  onError(code) {
    this._errorCode = code;
  }
}

export { XFAParser };
