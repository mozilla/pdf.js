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
  USERACTIVATION_CALLBACKID,
  USERACTIVATION_MAXTIME_VALIDITY,
} from "./app_utils.js";
import { DocInternals } from "./doc.js";
import { FieldInternals } from "./field.js";

const { values } = Object;

// The events are plain objects, tagged as `Event`: an Event class would be
// reachable, and its source readable, through `event.constructor`.
const EVENT_PROTOTYPE = Object.create(Object.prototype, {
  [Symbol.toStringTag]: { value: "Event" },
});

function createEvent(data) {
  return {
    __proto__: EVENT_PROTOTYPE,
    change: data.change || "",
    changeEx: data.changeEx || null,
    commitKey: data.commitKey || 0,
    fieldFull: data.fieldFull || false,
    keyDown: data.keyDown || false,
    modifier: data.modifier || false,
    name: data.name,
    rc: true,
    richChange: data.richChange || [],
    richChangeEx: data.richChangeEx || [],
    richValue: data.richValue || [],
    selEnd: data.selEnd ?? -1,
    selStart: data.selStart ?? -1,
    shift: data.shift || false,
    source: data.source || null,
    target: data.target || null,
    targetName: "",
    type: "Field",
    value: data.value || "",
    willCommit: data.willCommit || false,
  };
}

function mergeChange(event) {
  let value = event.value;
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    value = value.toString();
  }
  const prefix = event.selStart >= 0 ? value.substring(0, event.selStart) : "";
  const postfix =
    event.selEnd >= 0 && event.selEnd <= value.length
      ? value.substring(event.selEnd)
      : "";

  return `${prefix}${event.change}${postfix}`;
}

class EventDispatcher {
  #calculationOrder;

  #doc;

  #externalCall;

  #isCalculating = false;

  #objects;

  #userActivationData;

  constructor(
    doc,
    calculationOrder,
    objects,
    externalCall,
    userActivationData
  ) {
    this.#doc = doc;
    this.#calculationOrder = calculationOrder;
    this.#objects = objects;
    this.#externalCall = externalCall;
    this.#userActivationData = userActivationData;
  }

  #userActivation() {
    this.#userActivationData.userActivation = true;
    this.#externalCall("setTimeout", [
      USERACTIVATION_CALLBACKID,
      USERACTIVATION_MAXTIME_VALIDITY,
    ]);
  }

  dispatch(baseEvent) {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("TESTING") &&
      baseEvent.name === "sandboxtripbegin"
    ) {
      this.#externalCall("send", [{ command: "sandboxTripEnd" }]);
      return;
    }

    const id = baseEvent.id;
    if (!(id in this.#objects)) {
      let event;
      if (id === "doc" || id === "page") {
        event = globalThis.event = createEvent(baseEvent);
        event.source = event.target = globalThis;
      }
      if (id === "doc") {
        const eventName = event.name;
        if (eventName === "Open") {
          // Treat opening the document as user activation.
          this.#userActivation();
          // Initialize document scripts before formatters use them (#15818).
          DocInternals.initActions(this.#doc);
          // Run format callbacks before OpenAction, without applying
          // event.value to the fields.
          this.#formatAll();
        }
        if (
          !["DidPrint", "DidSave", "WillPrint", "WillSave"].includes(eventName)
        ) {
          this.#userActivation();
        }
        DocInternals.dispatchDocEvent(this.#doc, event.name);
      } else if (id === "page") {
        this.#userActivation();
        DocInternals.dispatchPageEvent(
          this.#doc,
          event.name,
          baseEvent.actions,
          baseEvent.pageNumber
        );
      } else if (id === "app" && baseEvent.name === "ResetForm") {
        this.#userActivation();
        for (const fieldId of baseEvent.ids) {
          const field = this.#objects[fieldId];
          if (field) {
            // The view has already been reset.
            FieldInternals.setValue(field, field.defaultValue);
          }
        }
      }
      return;
    }

    const name = baseEvent.name;
    const source = this.#objects[id];
    const event = (globalThis.event = createEvent(baseEvent));
    let savedChange;

    this.#userActivation();
    FieldInternals.prepareEvent(source, id, event);

    switch (name) {
      case "Keystroke":
        savedChange = {
          value: event.value,
          changeEx: event.changeEx,
          change: event.change,
          selStart: event.selStart,
          selEnd: event.selEnd,
        };
        break;
      case "Blur":
      case "Focus":
        Object.defineProperty(event, "value", {
          configurable: false,
          writable: false,
          enumerable: true,
          value: event.value,
        });
        break;
      case "Validate":
        this.#runValidation(source, event);
        return;
      case "Action":
        this.#runActions(source, source, event, name);
        this.#runCalculate(source, event);
        return;
    }

    this.#runActions(source, source, event, name);

    if (name !== "Keystroke") {
      return;
    }

    if (event.rc) {
      if (event.willCommit) {
        this.#runValidation(source, event);
      } else {
        if (FieldInternals.getIsChoice(source)) {
          FieldInternals.setValue(source, savedChange.changeEx);
          FieldInternals.send(source, {
            value: FieldInternals.getValue(source),
          });
          return;
        }

        const value = mergeChange(event);
        FieldInternals.setValue(source, value);
        let selStart, selEnd;
        if (
          event.selStart !== savedChange.selStart ||
          event.selEnd !== savedChange.selEnd
        ) {
          // Selection has been changed by the script so apply the changes.
          selStart = event.selStart;
          selEnd = event.selEnd;
        } else {
          selEnd = selStart = savedChange.selStart + event.change.length;
        }
        FieldInternals.send(source, { value, selRange: [selStart, selEnd] });
      }
    } else if (!event.willCommit) {
      FieldInternals.send(source, {
        value: savedChange.value,
        selRange: [savedChange.selStart, savedChange.selEnd],
      });
    } else {
      // Entry is not valid (rc == false) and it's a commit
      // so just clear the field.
      FieldInternals.send(source, {
        value: "",
        formattedValue: null,
        selRange: [0, 0],
      });
    }
  }

  #formatAll() {
    // Run format actions if any for all the fields.
    const event = (globalThis.event = createEvent({}));
    for (const source of values(this.#objects)) {
      event.value = FieldInternals.getComputedValue(source);
      this.#runActions(source, source, event, "Format");
    }
  }

  #runValidation(source, event) {
    const didValidateRun = this.#runActions(source, source, event, "Validate");
    if (event.rc) {
      FieldInternals.setValue(source, event.value);

      this.#runCalculate(source, event);

      const savedValue = (event.value =
        FieldInternals.getComputedValue(source));
      const formattedValue = this.#runActions(source, source, event, "Format")
        ? event.value?.toString?.()
        : null;

      FieldInternals.send(source, { value: savedValue, formattedValue });
      event.value = savedValue;
    } else if (didValidateRun) {
      // The value is not valid.
      FieldInternals.send(source, {
        value: "",
        formattedValue: null,
        selRange: [0, 0],
        focus: true, // Stay in the field.
      });
    }
  }

  #runActions(source, target, event, eventName) {
    event.source = source;
    event.target = target;
    event.name = eventName;
    event.targetName = target.name;
    event.rc = true;

    return FieldInternals.runActions(target, event);
  }

  calculateNow() {
    // Guard against recursive calls to doc.calculateNow().
    if (
      !this.#calculationOrder ||
      this.#isCalculating ||
      !this.#doc.calculate
    ) {
      return;
    }
    this.#isCalculating = true;
    const first = this.#calculationOrder[0];
    const source = this.#objects[first];
    globalThis.event = createEvent({});

    this.#runCalculate(source, globalThis.event);

    this.#isCalculating = false;
  }

  #runCalculate(source, event) {
    // Called by calculateNow and after Action or Validate events.
    if (!this.#calculationOrder || !this.#doc.calculate) {
      return;
    }

    for (const targetId of this.#calculationOrder) {
      if (!(targetId in this.#objects)) {
        continue;
      }

      if (!this.#doc.calculate) {
        // An action could have changed calculate value.
        break;
      }

      event.value = null;
      const target = this.#objects[targetId];
      let savedValue = FieldInternals.getComputedValue(target);
      this.#runActions(source, target, event, "Calculate");

      if (!event.rc) {
        continue;
      }

      if (event.value !== null) {
        // A new value has been calculated so set it.
        FieldInternals.setValue(target, event.value);
      } else {
        event.value = FieldInternals.getComputedValue(target);
      }

      this.#runActions(target, target, event, "Validate");
      if (!event.rc) {
        if (FieldInternals.getComputedValue(target) !== savedValue) {
          target.value = savedValue;
        }
        continue;
      }

      if (event.value === null) {
        event.value = FieldInternals.getComputedValue(target);
      }

      savedValue = FieldInternals.getComputedValue(target);
      const formattedValue = this.#runActions(target, target, event, "Format")
        ? event.value?.toString?.()
        : null;

      FieldInternals.send(target, { value: savedValue, formattedValue });
    }
  }
}

export { EventDispatcher, mergeChange };
