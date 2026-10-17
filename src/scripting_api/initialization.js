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

import { App, AppInternals } from "./app.js";
import {
  Border,
  Cursor,
  Display,
  Font,
  GlobalConstants,
  Highlight,
  Position,
  ScaleHow,
  ScaleWhen,
  Style,
  Trans,
  ZoomType,
} from "./constants.js";
import { Doc, DocInternals } from "./doc.js";
import {
  exposeObject,
  serializeError,
  useNativeToStringForPublicFunctions,
} from "./app_utils.js";
import { AForm } from "./aform.js";
import { Color } from "./color.js";
import { Console } from "./console.js";
import { createMap } from "./common.js";
import { EventDispatcher } from "./event.js";
import { Field } from "./field.js";
import { Util } from "./util.js";

function initSandbox(params) {
  delete globalThis.pdfjsScripting;

  // Host callbacks are defined in src/pdf.sandbox.external.js.
  const externalCall = globalThis.callExternalFunction;
  delete globalThis.callExternalFunction;

  // Keep the original eval in case a script replaces it.
  // eslint-disable-next-line no-eval
  const globalEval = globalThis.eval.bind(globalThis);
  const send = data => externalCall("send", [data]);
  const { data } = params;
  // Map widget and container IDs to fields.
  const appObjects = Object.create(null);
  const userActivationData = {
    userActivation: false,
    disablePrinting: false,
    disableSaving: false,
  };

  let eventDispatcher = null;
  const doc = new Doc({
    ...data.docInfo,
    send,
    globalEval,
    appObjects,
    userActivationData,
    calculateNow: () => eventDispatcher.calculateNow(),
  });
  eventDispatcher = new EventDispatcher(
    doc,
    data.calculationOrder,
    appObjects,
    externalCall,
    userActivationData
  );
  const app = new App({
    ...data.appInfo,
    send,
    globalEval,
    externalCall,
    doc,
    userActivationData,
  });
  const util = new Util();
  const getTerminalChildren = fieldName =>
    DocInternals.getTerminalChildren(doc, fieldName);

  for (const [name, objs] of createMap(data.objects)) {
    const annotations = [];
    let container = null;

    for (const obj of objs) {
      if (obj.type !== "") {
        annotations.push(obj);
      } else {
        container = obj;
      }
    }

    let obj = container;
    if (annotations.length > 0) {
      obj = annotations[0];
      obj.send = send;
    }

    obj.globalEval = globalEval;
    obj.sendError = send;
    obj.fieldPath = name;
    obj.appObjects = appObjects;
    obj.util = util;
    obj.getTerminalChildren = getTerminalChildren;

    const field = exposeObject(new Field(obj, annotations.slice(1)));
    DocInternals.addField(doc, name, field);
    for (const object of objs) {
      appObjects[object.id] = field;
    }
    if (container) {
      appObjects[container.id] = field;
    }
  }

  const color = exposeObject(new Color(), /* bindMethods = */ true);

  globalThis.event = null;
  globalThis.global = Object.create(null);
  globalThis.app = exposeObject(app, /* bindMethods = */ true);
  globalThis.color = color;
  globalThis.console = exposeObject(
    new Console({ send }),
    /* bindMethods = */ true
  );
  globalThis.util = exposeObject(util, /* bindMethods = */ true);
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

  // Avoid to have a popup asking to update Acrobat.
  globalThis.ADBE = {
    Reader_Value_Asked: true,
    Viewer_Value_Asked: true,
  };

  // Global form helpers.
  const aform = new AForm(doc, app, util, color);
  for (const name of Object.getOwnPropertyNames(AForm.prototype)) {
    if (name !== "constructor") {
      globalThis[name] = aform[name].bind(aform);
    }
  }

  // Add global constants such as IDS_GREATER_THAN or RE_NUMBER_ENTRY_DOT_SEP
  for (const [name, value] of Object.entries(GlobalConstants)) {
    Object.defineProperty(globalThis, name, {
      value,
      writable: false,
    });
  }

  // Color functions
  Object.defineProperties(globalThis, {
    ColorConvert: {
      value: color.convert.bind(color),
      writable: true,
    },
    ColorEqual: {
      value: color.equal.bind(color),
      writable: true,
    },
  });

  // The doc properties must live in the global scope too
  const properties = Object.create(null);
  for (const name of Object.getOwnPropertyNames(Doc.prototype)) {
    if (name === "constructor") {
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

  useNativeToStringForPublicFunctions();

  const functions = {
    dispatchEvent: event => eventDispatcher.dispatch(event),
    timeoutCb: timeout => AppInternals.evalCallback(app, timeout),
  };

  return (name, args) => {
    try {
      functions[name](args);
    } catch (error) {
      send(serializeError(error));
    }
  };
}

export { initSandbox };
