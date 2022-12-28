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
  $namespaceId,
  $nodeName,
  $onChildCheck,
  XFAObject,
  XFAObjectArray,
} from "./xfa_object.js";

const XDP_NS_ID = NamespaceIds.xdp.id;

class Xdp extends XFAObject {
  constructor(attributes) {
    super(XDP_NS_ID, "xdp", /* hasChildren = */ true);
    this.uuid = attributes.uuid || "";
    this.timeStamp = attributes.timeStamp || "";
    this.config = null;
    this.connectionSet = null;
    this.datasets = null;
    this.localeSet = null;
    this.stylesheet = new XFAObjectArray();
    this.template = null;
  }

  [$onChildCheck](child) {
    const ns = NamespaceIds[child[$nodeName]];
    return ns && child[$namespaceId] === ns.id;
  }
}

class XdpNamespace {
  static [$buildXFAObject](name, attributes) {
    if (XdpNamespace.hasOwnProperty(name)) {
      return XdpNamespace[name](attributes);
    }
    return undefined;
  }

  static xdp(attributes) {
    return new Xdp(attributes);
  }
}

export { XdpNamespace };
