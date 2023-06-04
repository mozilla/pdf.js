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
  $appendChild,
  $isNsAgnostic,
  $namespaceId,
  $nodeName,
  $onChild,
} from "./symbol_utils.js";
import { $buildXFAObject, NamespaceIds } from "./namespaces.js";
import { XFAObject, XmlObject } from "./xfa_object.js";

const DATASETS_NS_ID = NamespaceIds.datasets.id;

class Data extends XmlObject {
  constructor(attributes) {
    super(DATASETS_NS_ID, "data", attributes);
  }

  [$isNsAgnostic]() {
    return true;
  }
}

class Datasets extends XFAObject {
  constructor(attributes) {
    super(DATASETS_NS_ID, "datasets", /* hasChildren = */ true);
    this.data = null;
    this.Signature = null;
  }

  [$onChild](child) {
    const name = child[$nodeName];
    if (
      (name === "data" && child[$namespaceId] === DATASETS_NS_ID) ||
      (name === "Signature" &&
        child[$namespaceId] === NamespaceIds.signature.id)
    ) {
      this[name] = child;
    }
    this[$appendChild](child);
  }
}

class DatasetsNamespace {
  static [$buildXFAObject](name, attributes) {
    if (DatasetsNamespace.hasOwnProperty(name)) {
      return DatasetsNamespace[name](attributes);
    }
    return undefined;
  }

  static datasets(attributes) {
    return new Datasets(attributes);
  }

  static data(attributes) {
    return new Data(attributes);
  }
}

export { DatasetsNamespace };
