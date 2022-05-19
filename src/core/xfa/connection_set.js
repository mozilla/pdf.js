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
import { StringObject, XFAObject, XFAObjectArray } from "./xfa_object.js";

const CONNECTION_SET_NS_ID = NamespaceIds.connectionSet.id;

class ConnectionSet extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "connectionSet", /* hasChildren = */ true);
    this.wsdlConnection = new XFAObjectArray();
    this.xmlConnection = new XFAObjectArray();
    this.xsdConnection = new XFAObjectArray();
  }
}

class EffectiveInputPolicy extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "effectiveInputPolicy");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class EffectiveOutputPolicy extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "effectiveOutputPolicy");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Operation extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "operation");
    this.id = attributes.id || "";
    this.input = attributes.input || "";
    this.name = attributes.name || "";
    this.output = attributes.output || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class RootElement extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "rootElement");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class SoapAction extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "soapAction");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class SoapAddress extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "soapAddress");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Uri extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "uri");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class WsdlAddress extends StringObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "wsdlAddress");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class WsdlConnection extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "wsdlConnection", /* hasChildren = */ true);
    this.dataDescription = attributes.dataDescription || "";
    this.name = attributes.name || "";
    this.effectiveInputPolicy = null;
    this.effectiveOutputPolicy = null;
    this.operation = null;
    this.soapAction = null;
    this.soapAddress = null;
    this.wsdlAddress = null;
  }
}

class XmlConnection extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "xmlConnection", /* hasChildren = */ true);
    this.dataDescription = attributes.dataDescription || "";
    this.name = attributes.name || "";
    this.uri = null;
  }
}

class XsdConnection extends XFAObject {
  constructor(attributes) {
    super(CONNECTION_SET_NS_ID, "xsdConnection", /* hasChildren = */ true);
    this.dataDescription = attributes.dataDescription || "";
    this.name = attributes.name || "";
    this.rootElement = null;
    this.uri = null;
  }
}

class ConnectionSetNamespace {
  static [$buildXFAObject](name, attributes) {
    if (ConnectionSetNamespace.hasOwnProperty(name)) {
      return ConnectionSetNamespace[name](attributes);
    }
    return undefined;
  }

  static connectionSet(attrs) {
    return new ConnectionSet(attrs);
  }

  static effectiveInputPolicy(attrs) {
    return new EffectiveInputPolicy(attrs);
  }

  static effectiveOutputPolicy(attrs) {
    return new EffectiveOutputPolicy(attrs);
  }

  static operation(attrs) {
    return new Operation(attrs);
  }

  static rootElement(attrs) {
    return new RootElement(attrs);
  }

  static soapAction(attrs) {
    return new SoapAction(attrs);
  }

  static soapAddress(attrs) {
    return new SoapAddress(attrs);
  }

  static uri(attrs) {
    return new Uri(attrs);
  }

  static wsdlAddress(attrs) {
    return new WsdlAddress(attrs);
  }

  static wsdlConnection(attrs) {
    return new WsdlConnection(attrs);
  }

  static xmlConnection(attrs) {
    return new XmlConnection(attrs);
  }

  static xsdConnection(attrs) {
    return new XsdConnection(attrs);
  }
}

export { ConnectionSetNamespace };
