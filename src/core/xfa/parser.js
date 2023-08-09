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

import {
  $acceptWhitespace,
  $clean,
  $content,
  $finalize,
  $globalData,
  $isCDATAXml,
  $nsAttributes,
  $onChild,
  $onText,
  $setId,
} from "./symbol_utils.js";
import { XMLParserBase, XMLParserErrorCode } from "../xml_parser.js";
import { Builder } from "./builder.js";
import { warn } from "../../shared/util.js";

class XFAParser extends XMLParserBase {
  constructor(rootNameSpace = null, richText = false) {
    super();
    this._builder = new Builder(rootNameSpace);
    this._stack = [];
    this._globalData = {
      usedTypefaces: new Set(),
    };
    this._ids = new Map();
    this._current = this._builder.buildRoot(this._ids);
    this._errorCode = XMLParserErrorCode.NoError;
    this._whiteRegex = /^\s+$/;
    this._nbsps = /\xa0+/g;
    this._richText = richText;
  }

  parse(data) {
    this.parseXml(data);

    if (this._errorCode !== XMLParserErrorCode.NoError) {
      return undefined;
    }

    this._current[$finalize]();

    return this._current.element;
  }

  onText(text) {
    // Normally by definition a &nbsp is unbreakable
    // but in real life Acrobat can break strings on &nbsp.
    text = text.replace(this._nbsps, match => match.slice(1) + " ");
    if (this._richText || this._current[$acceptWhitespace]()) {
      this._current[$onText](text, this._richText);
      return;
    }

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
    const attributeObj = Object.create({});
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
        const i = name.indexOf(":");
        if (i === -1) {
          attributeObj[name] = value;
        } else {
          // Attributes can have their own namespace.
          // For example in data, we can have <foo xfa:dataNode="dataGroup"/>
          let nsAttrs = attributeObj[$nsAttributes];
          if (!nsAttrs) {
            nsAttrs = attributeObj[$nsAttributes] = Object.create(null);
          }
          const [ns, attrName] = [name.slice(0, i), name.slice(i + 1)];
          const attrs = (nsAttrs[ns] ||= Object.create(null));
          attrs[attrName] = value;
        }
      }
    }

    return [namespace, prefixes, attributeObj];
  }

  _getNameAndPrefix(name, nsAgnostic) {
    const i = name.indexOf(":");
    if (i === -1) {
      return [name, null];
    }
    return [name.substring(i + 1), nsAgnostic ? "" : name.substring(0, i)];
  }

  onBeginElement(tagName, attributes, isEmpty) {
    const [namespace, prefixes, attributesObj] = this._mkAttributes(
      attributes,
      tagName
    );
    const [name, nsPrefix] = this._getNameAndPrefix(
      tagName,
      this._builder.isNsAgnostic()
    );
    const node = this._builder.build({
      nsPrefix,
      name,
      attributes: attributesObj,
      namespace,
      prefixes,
    });
    node[$globalData] = this._globalData;

    if (isEmpty) {
      // No children: just push the node into its parent.
      node[$finalize]();
      if (this._current[$onChild](node)) {
        node[$setId](this._ids);
      }
      node[$clean](this._builder);
      return;
    }

    this._stack.push(this._current);
    this._current = node;
  }

  onEndElement(name) {
    const node = this._current;
    if (node[$isCDATAXml]() && typeof node[$content] === "string") {
      const parser = new XFAParser();
      parser._globalData = this._globalData;
      const root = parser.parse(node[$content]);
      node[$content] = null;
      node[$onChild](root);
    }

    node[$finalize]();
    this._current = this._stack.pop();
    if (this._current[$onChild](node)) {
      node[$setId](this._ids);
    }
    node[$clean](this._builder);
  }

  onError(code) {
    this._errorCode = code;
  }
}

export { XFAParser };
