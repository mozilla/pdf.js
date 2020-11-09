/* Copyright 2020 Mozilla Foundation
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

import { AForm } from "./aform.js";
import { App } from "./app.js";
import { Console } from "./console.js";
import { Doc } from "./doc.js";
import { Field } from "./field.js";
import { ProxyHandler } from "./proxy.js";
import { Util } from "./util.js";
import { ZoomType } from "./constants.js";

function initSandbox({ data, extra, out }) {
  const proxyHandler = new ProxyHandler(data.dispatchEventName);
  const { send, crackURL } = extra;
  const doc = new Doc({
    send,
    ...data.docInfo,
  });
  const _document = { obj: doc, wrapped: new Proxy(doc, proxyHandler) };
  const app = new App({
    send,
    _document,
    calculationOrder: data.calculationOrder,
  });
  const util = new Util({ crackURL });
  const aform = new AForm(doc, app, util);

  for (const [name, objs] of Object.entries(data.objects)) {
    const obj = objs[0];
    obj.send = send;
    obj.doc = _document.wrapped;
    const field = new Field(obj);
    const wrapped = new Proxy(field, proxyHandler);
    doc._addField(name, wrapped);
    app._objects[obj.id] = { obj: field, wrapped };
  }

  out.global = Object.create(null);
  out.app = new Proxy(app, proxyHandler);
  out.console = new Proxy(new Console({ send }), proxyHandler);
  out.util = new Proxy(util, proxyHandler);
  out.zoomtype = ZoomType;
  for (const name of Object.getOwnPropertyNames(AForm.prototype)) {
    if (name.startsWith("AF")) {
      out[name] = aform[name].bind(aform);
    }
  }
}

export { initSandbox };
