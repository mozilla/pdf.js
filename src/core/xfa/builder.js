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

import { $buildXFAObject, NamespaceIds } from "./namespaces.js";
import {
  $cleanup,
  $finalize,
  $nsAttributes,
  $onChild,
  $resolvePrototypes,
  XFAObject,
} from "./xfa_object.js";
import { NamespaceSetUp } from "./setup.js";
import { Template } from "./template.js";
import { UnknownNamespace } from "./unknown.js";
import { warn } from "../../shared/util.js";

const _ids = Symbol();

class Root extends XFAObject {
  constructor(ids) {
    super(-1, "root", Object.create(null));
    this.element = null;
    this[_ids] = ids;
  }

  [$onChild](child) {
    this.element = child;
    return true;
  }

  [$finalize]() {
    super[$finalize]();
    if (this.element.template instanceof Template) {
      this.element.template[$resolvePrototypes](this[_ids]);
    }
  }
}

class Empty extends XFAObject {
  constructor() {
    super(-1, "", Object.create(null));
  }

  [$onChild](_) {
    return false;
  }
}

class Builder {
  constructor() {
    this._namespaceStack = [];

    // Each prefix has its own stack
    this._namespacePrefixes = new Map();
    this._namespaces = new Map();
    this._nextNsId = Math.max(
      ...Object.values(NamespaceIds).map(({ id }) => id)
    );
    this._currentNamespace = new UnknownNamespace(++this._nextNsId);
  }

  buildRoot(ids) {
    return new Root(ids);
  }

  build({ nsPrefix, name, attributes, namespace, prefixes }) {
    const hasNamespaceDef = namespace !== null;
    if (hasNamespaceDef) {
      // Define the current namespace to use.
      this._namespaceStack.push(this._currentNamespace);
      this._currentNamespace = this._searchNamespace(namespace);
    }

    if (prefixes) {
      // The xml node may have namespace prefix definitions
      this._addNamespacePrefix(prefixes);
    }

    if (attributes.hasOwnProperty($nsAttributes)) {
      // Only support xfa-data namespace.
      const dataTemplate = NamespaceSetUp.datasets;
      const nsAttrs = attributes[$nsAttributes];
      let xfaAttrs = null;
      for (const [ns, attrs] of Object.entries(nsAttrs)) {
        const nsToUse = this._getNamespaceToUse(ns);
        if (nsToUse === dataTemplate) {
          xfaAttrs = { xfa: attrs };
          break;
        }
      }
      if (xfaAttrs) {
        attributes[$nsAttributes] = xfaAttrs;
      } else {
        delete attributes[$nsAttributes];
      }
    }

    const namespaceToUse = this._getNamespaceToUse(nsPrefix);
    const node =
      (namespaceToUse && namespaceToUse[$buildXFAObject](name, attributes)) ||
      new Empty();

    // In case the node has some namespace things,
    // we must pop the different stacks.
    if (hasNamespaceDef || prefixes) {
      node[$cleanup] = {
        hasNamespace: hasNamespaceDef,
        prefixes,
      };
    }

    return node;
  }

  _searchNamespace(nsName) {
    let ns = this._namespaces.get(nsName);
    if (ns) {
      return ns;
    }
    for (const [name, { check }] of Object.entries(NamespaceIds)) {
      if (check(nsName)) {
        ns = NamespaceSetUp[name];
        if (ns) {
          this._namespaces.set(nsName, ns);
          return ns;
        }
        // The namespace is known but not handled.
        break;
      }
    }

    ns = new UnknownNamespace(++this._nextNsId);
    this._namespaces.set(nsName, ns);
    return ns;
  }

  _addNamespacePrefix(prefixes) {
    for (const { prefix, value } of prefixes) {
      const namespace = this._searchNamespace(value);
      let prefixStack = this._namespacePrefixes.get(prefix);
      if (!prefixStack) {
        prefixStack = [];
        this._namespacePrefixes.set(prefix, prefixStack);
      }
      prefixStack.push(namespace);
    }
  }

  _getNamespaceToUse(prefix) {
    if (!prefix) {
      return this._currentNamespace;
    }
    const prefixStack = this._namespacePrefixes.get(prefix);
    if (prefixStack && prefixStack.length > 0) {
      return prefixStack[prefixStack.length - 1];
    }

    warn(`Unknown namespace prefix: ${prefix}.`);
    return null;
  }

  clean(data) {
    const { hasNamespace, prefixes } = data;
    if (hasNamespace) {
      this._currentNamespace = this._namespaceStack.pop();
    }
    if (prefixes) {
      prefixes.forEach(({ prefix }) => {
        this._namespacePrefixes.get(prefix).pop();
      });
    }
  }
}

export { Builder };
