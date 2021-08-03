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
import { XFAObject } from "./xfa_object.js";

const SIGNATURE_NS_ID = NamespaceIds.signature.id;

class Signature extends XFAObject {
  constructor(attributes) {
    super(SIGNATURE_NS_ID, "signature", /* hasChildren = */ true);
  }
}

class SignatureNamespace {
  static [$buildXFAObject](name, attributes) {
    if (SignatureNamespace.hasOwnProperty(name)) {
      return SignatureNamespace[name](attributes);
    }
    return undefined;
  }

  static signature(attributes) {
    return new Signature(attributes);
  }
}

export { SignatureNamespace };
