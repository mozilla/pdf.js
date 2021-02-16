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

import { ConfigNamespace } from "./config.js";
import { ConnectionSetNamespace } from "./connection_set.js";
import { DatasetsNamespace } from "./datasets.js";
import { LocaleSetNamespace } from "./locale_set.js";
import { SignatureNamespace } from "./signature.js";
import { StylesheetNamespace } from "./stylesheet.js";
import { TemplateNamespace } from "./template.js";
import { XdpNamespace } from "./xdp.js";
import { XhtmlNamespace } from "./xhtml.js";

const NamespaceSetUp = {
  config: ConfigNamespace,
  connection: ConnectionSetNamespace,
  datasets: DatasetsNamespace,
  localeSet: LocaleSetNamespace,
  signature: SignatureNamespace,
  stylesheet: StylesheetNamespace,
  template: TemplateNamespace,
  xdp: XdpNamespace,
  xhtml: XhtmlNamespace,
};

export { NamespaceSetUp };
