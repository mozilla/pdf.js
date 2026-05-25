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

import "./app_utils.js";
import "./app.js";
import "./aform.js";
import "./color.js";
import "./console.js";
import "./doc.js";
import "./event.js";
import "./field.js";
import "./util.js";
import { ADBE } from "./constants.js";

globalThis.pdfjsScripting = {
  initSandbox(params) {
    delete globalThis.pdfjsScripting;

    // externalCall is a function to call a function defined
    // outside the sandbox.
    // (see src/pdf.sandbox.external.js).
    const externalCall = globalThis.callExternalFunction;
    delete globalThis.callExternalFunction;

    // eslint-disable-next-line no-eval
    const globalEval = code => globalThis.eval(code);
    const send = data => {
      if (data.stack) {
        data = { command: "error", value: `${data.toString()}\n${data.stack}` };
      }
      externalCall("send", [data]);
    };
    const appObjects = Object.create(null);
    const { data } = params;

    const {
      AForm,
      App,
      CheckboxField,
      Console,
      Doc,
      EventDispatcher,
      Field,
      RadioButtonField,
      Util,
    } = globalThis;
    delete globalThis.AForm;
    delete globalThis.App;
    delete globalThis.CheckboxField;
    delete globalThis.Console;
    delete globalThis.Doc;
    delete globalThis.EventDispatcher;
    delete globalThis.Field;
    delete globalThis.RadioButtonField;
    delete globalThis.Util;

    // Claim all internal factories before any instance is created.
    // Each is a one-shot: claimInternals() deletes itself from the class after
    // the first call, making it inaccessible from that point on.
    const getDocInternals = Doc.claimInternals();
    const getEventDispatcherInternals = EventDispatcher.claimInternals();
    const getAppInternals = App.claimInternals();
    const getUtilInternals = Util.claimInternals();
    const fieldPrivate = Field.claimInternals();
    const radioFieldPrivate = RadioButtonField.claimInternals(fieldPrivate);
    const checkboxFieldPrivate =
      CheckboxField.claimInternals(radioFieldPrivate);

    function getFieldPrivate(field) {
      if (field instanceof CheckboxField) {
        return checkboxFieldPrivate;
      }
      if (field instanceof RadioButtonField) {
        return radioFieldPrivate;
      }
      return fieldPrivate;
    }

    const userActivationData = {
      userActivation: false,
      disablePrinting: false,
      disableSaving: false,
    };
    const doc = new Doc({
      send,
      globalEval,
      userActivationData,
      ...data.docInfo,
      getFieldPrivate,
    });
    const docInternals = getDocInternals(doc);

    const eventDispatcher = new EventDispatcher(
      doc,
      data.calculationOrder,
      appObjects,
      externalCall,
      getFieldPrivate,
      docInternals,
      userActivationData
    );
    const eventDispatcherInternals =
      getEventDispatcherInternals(eventDispatcher);

    const app = (globalThis.app = new App({
      send,
      globalEval,
      userActivationData,
      externalCall,
      doc,
      calculationOrder: data.calculationOrder,
      ...data.appInfo,
      getFieldPrivate,
    }));
    const appInternals = getAppInternals(app);

    const util = (globalThis.util = new Util());
    const utilInternals = getUtilInternals(util);

    if (data.objects) {
      const annotations = [];

      for (const [name, objs] of Object.entries(data.objects)) {
        annotations.length = 0;
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
        obj.fieldPath = name;
        obj.appObjects = appObjects;
        obj.util = util;
        obj.fieldPrivate = fieldPrivate;
        obj.radioFieldPrivate = radioFieldPrivate;
        obj.checkboxFieldPrivate = checkboxFieldPrivate;
        obj.getFieldPrivate = getFieldPrivate;
        obj.docInternals = docInternals;

        const otherFields = annotations.slice(1);

        let field;
        switch (obj.type) {
          case "radiobutton": {
            obj.fieldPrivate = radioFieldPrivate;
            field = new RadioButtonField(otherFields, obj);
            break;
          }
          case "checkbox": {
            obj.fieldPrivate = checkboxFieldPrivate;
            field = new CheckboxField(otherFields, obj);
            break;
          }
          default:
            if (otherFields.length > 0) {
              obj.siblings = otherFields.map(x => x.id);
            }
            field = new Field(obj);
        }

        docInternals.addField(name, field);
        for (const object of objs) {
          appObjects[object.id] = field;
        }
        if (container) {
          appObjects[container.id] = field;
        }
      }
    }

    globalThis.event = null;
    globalThis.global = Object.create(null);
    globalThis.console = new Console({ send });
    globalThis.ADBE = ADBE;

    // AF... functions
    const aform = new AForm(
      doc,
      app,
      util,
      utilInternals,
      eventDispatcherInternals.mergeChange
    );
    for (const name of Object.getOwnPropertyNames(AForm.prototype)) {
      if (name !== "constructor") {
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
      dispatchEvent: eventDispatcherInternals.dispatch,
      timeoutCb: appInternals.evalCallback,
    };

    return (name, args) => {
      try {
        functions[name](args);
      } catch (error) {
        send(error);
      }
    };
  },
};

export {};
