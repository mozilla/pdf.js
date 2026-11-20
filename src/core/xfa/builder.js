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
  $isNsAgnostic,
  $nsAttributes,
  $onChild,
} from "./symbol_utils.js";
import { makeArr, warn } from "../../shared/util.js";
import { UnknownNamespace } from "./unknown.js";
import { XFAObject } from "./xfa_object.js";

class Empty extends XFAObject {
  constructor() {
    super(-1, "", Object.create(null));
  }

  [$onChild](_) {
    return false;
  }
}

class Builder {
  constructor(namespaces, rootNamespace) {
    this._namespaceSetup = namespaces;
    this._namespaceStack = [];
    this._nsAgnosticLevel = 0;

    // Each prefix has its own stack
    this._namespacePrefixes = new Map();
    this._namespaces = new Map();
    this._nextNsId = Math.max(
      ...Object.values(NamespaceIds).map(({ id }) => id)
    );
    this._currentNamespace =
      rootNamespace || new UnknownNamespace(++this._nextNsId);
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

    if (Object.hasOwn(attributes, $nsAttributes)) {
      // Only support xfa-data namespace.
      const dataTemplate = this._namespaceSetup.datasets;
      const nsAttrs = attributes[$nsAttributes];
      let xfaAttrs = null;
      for (const [ns, attrs] of Object.entries(nsAttrs)) {
        const nsToUse = this._getNamespaceToUse(ns);
        if (dataTemplate && nsToUse === dataTemplate) {
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
      namespaceToUse?.[$buildXFAObject](name, attributes) || new Empty();

    if (node[$isNsAgnostic]()) {
      this._nsAgnosticLevel++;
    }

    // In case the node has some namespace things,
    // we must pop the different stacks.
    if (hasNamespaceDef || prefixes || node[$isNsAgnostic]()) {
      node[$cleanup] = {
        hasNamespace: hasNamespaceDef,
        prefixes,
        nsAgnostic: node[$isNsAgnostic](),
      };
    }

    return node;
  }

  isNsAgnostic() {
    return this._nsAgnosticLevel > 0;
  }

  _searchNamespace(nsName) {
    let ns = this._namespaces.get(nsName);
    if (ns) {
      return ns;
    }
    for (const [name, { check }] of Object.entries(NamespaceIds)) {
      if (check(nsName)) {
        ns = this._namespaceSetup[name];
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
      this._namespacePrefixes
        .getOrInsertComputed(prefix, makeArr)
        .push(namespace);
    }
  }

  _getNamespaceToUse(prefix) {
    if (!prefix) {
      return this._currentNamespace;
    }
    const prefixStack = this._namespacePrefixes.get(prefix);
    if (prefixStack?.length > 0) {
      return prefixStack.at(-1);
    }

    warn(`Unknown namespace prefix: ${prefix}.`);
    return null;
  }

  clean(data) {
    const { hasNamespace, prefixes, nsAgnostic } = data;
    if (hasNamespace) {
      this._currentNamespace = this._namespaceStack.pop();
    }
    prefixes?.forEach(({ prefix }) => {
      this._namespacePrefixes.get(prefix).pop();
    });
    if (nsAgnostic) {
      this._nsAgnosticLevel--;
    }
  }
}

export { Builder };
