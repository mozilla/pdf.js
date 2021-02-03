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
  IntegerObject,
  OptionObject,
  StringObject,
  XFAObject,
  XFAObjectArray,
} from "./xfa_object.js";

const CONFIG_NS_ID = NamespaceIds.config.id;

class Acrobat extends XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "acrobat", /* hasChildren = */ true);
    this.acrobat7 = null;
    this.autoSave = null;
    this.common = null;
    this.validate = null;
    this.validateApprovalSignatures = null;
    this.submitUrl = new XFAObjectArray();
  }
}

class Acrobat7 extends XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "acrobat7", /* hasChildren = */ true);
    this.dynamicRender = null;
  }
}

class AdobeExtensionLevel extends IntegerObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "adobeExtensionLevel", 0, n => n >= 1 && n <= 8);
  }
}

class AutoSave extends OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "autoSave", ["disabled", "enabled"]);
  }
}

class Config extends XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "config", /* hasChildren = */ true);
    this.acrobat = null;
    this.present = null;
    this.trace = null;
    this.agent = new XFAObjectArray();
  }
}

class DynamicRender extends OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "dynamicRender", ["forbidden", "required"]);
  }
}

class Present extends XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "present", /* hasChildren = */ true);
    this.behaviorOverride = null;
    this.cache = null;
    this.common = null;
    this.copies = null;
    this.destination = null;
    this.incrementalMerge = null;
    this.layout = null;
    this.output = null;
    this.overprint = null;
    this.pagination = null;
    this.paginationOverride = null;
    this.script = null;
    this.validate = null;
    this.xdp = null;
    this.driver = new XFAObjectArray();
    this.labelPrinter = new XFAObjectArray();
    this.pcl = new XFAObjectArray();
    this.pdf = new XFAObjectArray();
    this.ps = new XFAObjectArray();
    this.submitUrl = new XFAObjectArray();
    this.webClient = new XFAObjectArray();
    this.zpl = new XFAObjectArray();
  }
}

class Pdf extends XFAObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "pdf", /* hasChildren = */ true);
    this.name = attributes.name || "";
    this.adobeExtensionLevel = null;
    this.batchOutput = null;
    this.compression = null;
    this.creator = null;
    this.encryption = null;
    this.fontInfo = null;
    this.interactive = null;
    this.linearized = null;
    this.openAction = null;
    this.pdfa = null;
    this.producer = null;
    this.renderPolicy = null;
    this.scriptModel = null;
    this.silentPrint = null;
    this.submitFormat = null;
    this.tagged = null;
    this.version = null;
    this.viewerPreferences = null;
    this.xdc = null;
  }
}

class SubmitUrl extends StringObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "submitUrl");
  }
}

class Validate extends OptionObject {
  constructor(attributes) {
    super(CONFIG_NS_ID, "validate", [
      "preSubmit",
      "prePrint",
      "preExecute",
      "preSave",
    ]);
  }
}

class ConfigNamespace {
  static [$buildXFAObject](name, attributes) {
    if (ConfigNamespace.hasOwnProperty(name)) {
      return ConfigNamespace[name](attributes);
    }
    return undefined;
  }

  static acrobat(attrs) {
    return new Acrobat(attrs);
  }

  static acrobat7(attrs) {
    return new Acrobat7(attrs);
  }

  static adobeExtensionLevel(attrs) {
    return new AdobeExtensionLevel(attrs);
  }

  static autoSave(attrs) {
    return new AutoSave(attrs);
  }

  static config(attrs) {
    return new Config(attrs);
  }

  static dynamicRender(attrs) {
    return new DynamicRender(attrs);
  }

  static pdf(attrs) {
    return new Pdf(attrs);
  }

  static present(attrs) {
    return new Present(attrs);
  }

  static submitUrl(attrs) {
    return new SubmitUrl(attrs);
  }

  static validate(attrs) {
    return new Validate(attrs);
  }
}

export { ConfigNamespace };
