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

import { getInteger, getKeyword } from "./utils.js";
import { shadow, warn } from "../../shared/util.js";

// We use these symbols to avoid name conflict between tags
// and properties/methods names.
const $clean = Symbol();
const $cleanup = Symbol();
const $content = Symbol("content");
const $dump = Symbol();
const $finalize = Symbol();
const $getChildren = Symbol();
const $isTransparent = Symbol();
const $lastAttribute = Symbol();
const $namespaceId = Symbol("namespaceId");
const $nodeName = Symbol("nodeName");
const $onChild = Symbol();
const $onChildCheck = Symbol();
const $onText = Symbol();
const $text = Symbol();

const _attributes = Symbol();
const _attributeNames = Symbol();
const _children = Symbol();
const _defaultValue = Symbol();
const _hasChildren = Symbol();
const _max = Symbol();
const _options = Symbol();
const _parent = Symbol();
const _validator = Symbol();

class XFAObject {
  constructor(nsId, name, hasChildren = false) {
    this[$namespaceId] = nsId;
    this[$nodeName] = name;
    this[_hasChildren] = hasChildren;
    this[_parent] = null;
    this[_children] = [];
  }

  [$onChild](child) {
    if (!this[_hasChildren] || !this[$onChildCheck](child)) {
      return;
    }

    const name = child[$nodeName];
    const node = this[name];
    if (node instanceof XFAObjectArray) {
      if (node.push(child)) {
        child[_parent] = this;
        this[_children].push(child);
      }
    } else if (node === null) {
      this[name] = child;
      child[_parent] = this;
      this[_children].push(child);
    } else {
      warn(`XFA - node "${this[$nodeName]}" accepts only one child: ${name}`);
    }
  }

  [$onChildCheck](child) {
    return (
      this.hasOwnProperty(child[$nodeName]) &&
      child[$namespaceId] === this[$namespaceId]
    );
  }

  [$onText](_) {}

  [$finalize]() {}

  [$clean](builder) {
    delete this[_hasChildren];
    if (this[$cleanup]) {
      builder.clean(this[$cleanup]);
      delete this[$cleanup];
    }
  }

  [$isTransparent]() {
    return this.name === "";
  }

  [$lastAttribute]() {
    return "";
  }

  get [_attributeNames]() {
    // Lazily get attributes names
    const proto = Object.getPrototypeOf(this);
    if (!proto._attributes) {
      const attributes = (proto._attributes = new Set());
      for (const name of Object.getOwnPropertyNames(this)) {
        if (
          this[name] === null ||
          this[name] instanceof XFAObject ||
          this[name] instanceof XFAObjectArray
        ) {
          break;
        }
        attributes.add(name);
      }
    }
    return shadow(this, _attributeNames, proto._attributes);
  }

  [$getChildren](name = null) {
    if (!name) {
      return this[_children];
    }

    return this[_children].filter(c => c[$nodeName] === name);
  }

  [$dump]() {
    const dumped = Object.create(null);
    if (this[$content]) {
      dumped.$content = this[$content];
    }

    for (const name of Object.getOwnPropertyNames(this)) {
      const value = this[name];
      if (value === null) {
        continue;
      }
      if (value instanceof XFAObject) {
        dumped[name] = value[$dump]();
      } else if (value instanceof XFAObjectArray) {
        if (!value.isEmpty()) {
          dumped[name] = value.dump();
        }
      } else {
        dumped[name] = value;
      }
    }

    return dumped;
  }
}

class XFAObjectArray {
  constructor(max = Infinity) {
    this[_max] = max;
    this[_children] = [];
  }

  push(child) {
    const len = this[_children].length;
    if (len <= this[_max]) {
      this[_children].push(child);
      return true;
    }
    warn(
      `XFA - node "${child[$nodeName]}" accepts no more than ${this[_max]} children`
    );
    return false;
  }

  isEmpty() {
    return this[_children].length === 0;
  }

  dump() {
    return this[_children].length === 1
      ? this[_children][0][$dump]()
      : this[_children].map(x => x[$dump]());
  }
}

class XmlObject extends XFAObject {
  constructor(nsId, name, attributes = Object.create(null)) {
    super(nsId, name);
    this[$content] = "";
    if (name !== "#text") {
      this[_attributes] = attributes;
    }
  }

  [$onChild](child) {
    if (this[$content]) {
      const node = new XmlObject(this[$namespaceId], "#text");
      node[$content] = this[$content];
      this[$content] = "";
      this[_children].push(node);
    }
    this[_children].push(child);
  }

  [$onText](str) {
    this[$content] += str;
  }

  [$finalize]() {
    if (this[$content] && this[_children].length > 0) {
      const node = new XmlObject(this[$namespaceId], "#text");
      node[$content] = this[$content];
      this[_children].push(node);
      delete this[$content];
    }
  }

  [$text]() {
    if (this[_children].length === 0) {
      return this[$content];
    }
    return this[_children].map(c => c[$text]()).join("");
  }
}

class ContentObject extends XFAObject {
  constructor(nsId, name) {
    super(nsId, name);
    this[$content] = "";
  }

  [$onText](text) {
    this[$content] += text;
  }

  [$finalize]() {}
}

class OptionObject extends ContentObject {
  constructor(nsId, name, options) {
    super(nsId, name);
    this[_options] = options;
  }

  [$finalize]() {
    this[$content] = getKeyword({
      data: this[$content],
      defaultValue: this[_options][0],
      validate: k => this[_options].includes(k),
    });
  }

  [$clean](builder) {
    super[$clean](builder);
    delete this[_options];
  }
}

class StringObject extends ContentObject {
  [$finalize]() {
    this[$content] = this[$content].trim();
  }
}

class IntegerObject extends ContentObject {
  constructor(nsId, name, defaultValue, validator) {
    super(nsId, name);
    this[_defaultValue] = defaultValue;
    this[_validator] = validator;
  }

  [$finalize]() {
    this[$content] = getInteger({
      data: this[$content],
      defaultValue: this[_defaultValue],
      validate: this[_validator],
    });
  }

  [$clean](builder) {
    super[$clean](builder);
    delete this[_defaultValue];
    delete this[_validator];
  }
}

class Option01 extends IntegerObject {
  constructor(nsId, name) {
    super(nsId, name, 0, n => n === 1);
  }
}

class Option10 extends IntegerObject {
  constructor(nsId, name) {
    super(nsId, name, 1, n => n === 0);
  }
}

export {
  $clean,
  $cleanup,
  $content,
  $dump,
  $finalize,
  $getChildren,
  $isTransparent,
  $namespaceId,
  $nodeName,
  $onChild,
  $onChildCheck,
  $onText,
  $text,
  ContentObject,
  IntegerObject,
  Option01,
  Option10,
  OptionObject,
  StringObject,
  XFAObject,
  XFAObjectArray,
  XmlObject,
};
