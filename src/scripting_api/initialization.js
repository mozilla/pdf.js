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

import {
  Border,
  Cursor,
  Display,
  Font,
  Highlight,
  Position,
  ScaleHow,
  ScaleWhen,
  Style,
  Trans,
  ZoomType,
} from "./constants.js";
import { CheckboxField, Field, RadioButtonField } from "./field.js";
import { AForm } from "./aform.js";
import { App } from "./app.js";
import { Color } from "./color.js";
import { Console } from "./console.js";
import { Doc } from "./doc.js";
import { ProxyHandler } from "./proxy.js";
import { Util } from "./util.js";

function initSandbox(params) {
  delete globalThis.pdfjsScripting;

  // externalCall is a function to call a function defined
  // outside the sandbox.
  // (see src/pdf.sandbox.external.js).
  const externalCall = globalThis.callExternalFunction;
  delete globalThis.callExternalFunction;

  // eslint-disable-next-line no-eval
  const globalEval = code => globalThis.eval(code);
  const send = data => externalCall("send", [data]);
  const proxyHandler = new ProxyHandler();
  const { data } = params;
  const doc = new Doc({
    send,
    globalEval,
    ...data.docInfo,
  });
  const _document = { obj: doc, wrapped: new Proxy(doc, proxyHandler) };
  const app = new App({
    send,
    globalEval,
    externalCall,
    _document,
    calculationOrder: data.calculationOrder,
    proxyHandler,
    ...data.appInfo,
  });

  const util = new Util({ externalCall });
  const aform = new AForm(doc, app, util);

  if (data.objects) {
    for (const [name, objs] of Object.entries(data.objects)) {
      const obj = objs[0];
      obj.send = send;
      obj.globalEval = globalEval;
      obj.doc = _document.wrapped;
      let field;
      if (obj.type === "radiobutton") {
        const otherButtons = objs.slice(1);
        field = new RadioButtonField(otherButtons, obj);
      } else if (obj.type === "checkbox") {
        const otherButtons = objs.slice(1);
        field = new CheckboxField(otherButtons, obj);
      } else {
        field = new Field(obj);
      }

      const wrapped = new Proxy(field, proxyHandler);
      doc._addField(name, wrapped);
      const _object = { obj: field, wrapped };
      for (const object of objs) {
        app._objects[object.id] = _object;
      }
    }
  }

  globalThis.event = null;
  globalThis.global = Object.create(null);
  globalThis.app = new Proxy(app, proxyHandler);
  globalThis.color = new Proxy(new Color(), proxyHandler);
  globalThis.console = new Proxy(new Console({ send }), proxyHandler);
  globalThis.util = new Proxy(util, proxyHandler);
  globalThis.border = Border;
  globalThis.cursor = Cursor;
  globalThis.display = Display;
  globalThis.font = Font;
  globalThis.highlight = Highlight;
  globalThis.position = Position;
  globalThis.scaleHow = ScaleHow;
  globalThis.scaleWhen = ScaleWhen;
  globalThis.style = Style;
  globalThis.trans = Trans;
  globalThis.zoomtype = ZoomType;

  for (const name of Object.getOwnPropertyNames(AForm.prototype)) {
    if (name !== "constructor" && !name.startsWith("_")) {
      globalThis[name] = aform[name].bind(aform);
    }
  }

  // The doc properties must live in the global scope too
  const properties = Object.create(null);
  for (const name of Object.getOwnPropertyNames(Doc.prototype)) {
    if (name === "constructor" || name.startsWith("_")) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(Doc.prototype, name);
    if (descriptor.get) {
      properties[name] = {
        get: descriptor.get.bind(doc),
        set: descriptor.set.bind(doc),
      };
    } else {
      properties[name] = {
        value: Doc.prototype[name].bind(doc),
      };
    }
  }
  Object.defineProperties(globalThis, properties);

  const functions = {
    dispatchEvent: app._dispatchEvent.bind(app),
    timeoutCb: app._evalCallback.bind(app),
  };

  return (name, args) => {
    try {
      functions[name](args);
    } catch (error) {
      const value = `${error.toString()}\n${error.stack}`;
      send({ command: "error", value });
    }
  };
}

export { initSandbox };
