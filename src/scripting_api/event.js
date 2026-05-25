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

class Event {
  constructor(data) {
    this.change = data.change || "";
    this.changeEx = data.changeEx || null;
    this.commitKey = data.commitKey || 0;
    this.fieldFull = data.fieldFull || false;
    this.keyDown = data.keyDown || false;
    this.modifier = data.modifier || false;
    this.name = data.name;
    this.rc = true;
    this.richChange = data.richChange || [];
    this.richChangeEx = data.richChangeEx || [];
    this.richValue = data.richValue || [];
    this.selEnd = data.selEnd ?? -1;
    this.selStart = data.selStart ?? -1;
    this.shift = data.shift || false;
    this.source = data.source || null;
    this.target = data.target || null;
    this.targetName = "";
    this.type = "Field";
    this.value = data.value || "";
    this.willCommit = data.willCommit || false;
  }
}

globalThis.EventDispatcher = class EventDispatcher {
  static claimInternals() {
    delete EventDispatcher.claimInternals;
    return instance => ({
      dispatch: instance.#dispatch.bind(instance),
      mergeChange: instance.#mergeChange.bind(instance),
    });
  }

  #doc;

  #calculationOrder;

  #objects;

  #externalCall;

  #getFieldPrivate;

  #docInternals;

  #isCalculating = false;

  #userActivationData;

  constructor(
    doc,
    calculationOrder,
    objects,
    externalCall,
    getFieldPrivate,
    docInternals,
    userActivationData
  ) {
    this.#doc = doc;
    this.#calculationOrder = calculationOrder;
    this.#objects = objects;
    this.#externalCall = externalCall;
    this.#getFieldPrivate = getFieldPrivate;
    this.#docInternals = docInternals;
    this.#userActivationData = userActivationData;

    docInternals.setCalculateNow(this.#calculateNow.bind(this));
  }

  #mergeChange(event) {
    let value = event.value;
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value !== "string") {
      value = value.toString();
    }
    const prefix =
      event.selStart >= 0 ? value.substring(0, event.selStart) : "";
    const postfix =
      event.selEnd >= 0 && event.selEnd <= value.length
        ? value.substring(event.selEnd)
        : "";

    return `${prefix}${event.change}${postfix}`;
  }

  #userActivation() {
    this.#userActivationData.userActivation = true;

    const USERACTIVATION_CALLBACKID = 0;
    const USERACTIVATION_MAXTIME_VALIDITY = 5000;
    this.#externalCall("setTimeout", [
      USERACTIVATION_CALLBACKID,
      USERACTIVATION_MAXTIME_VALIDITY,
    ]);
  }

  #dispatch(baseEvent) {
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
        event = globalThis.event = new Event(baseEvent);
        event.source = event.target = globalThis;
        event.name = baseEvent.name;
      }
      if (id === "doc") {
        const eventName = event.name;
        if (eventName === "Open") {
          // The user has decided to open this pdf, hence we enable
          // userActivation.
          this.#userActivation();
          // Initialize named actions before calling formatAll to avoid any
          // errors in the case where a formatter is using one of those named
          // actions (see #15818).
          this.#docInternals.initActions();
          // Before running the Open event, we run the format callbacks but
          // without changing the value of the fields.
          // Acrobat does the same thing.
          this.formatAll();
        }
        if (
          !["DidPrint", "DidSave", "WillPrint", "WillSave"].includes(eventName)
        ) {
          this.#userActivation();
        }
        this.#docInternals.dispatchDocEvent(event.name);
      } else if (id === "page") {
        this.#userActivation();
        this.#docInternals.dispatchPageEvent(
          event.name,
          baseEvent.actions,
          baseEvent.pageNumber
        );
      } else if (id === "app" && baseEvent.name === "ResetForm") {
        this.#userActivation();
        for (const fieldId of baseEvent.ids) {
          const field = this.#objects[fieldId];
          if (field) {
            this.#getFieldPrivate(field).reset(field);
          }
        }
      }
      return;
    }

    const name = baseEvent.name;
    const source = this.#objects[id];
    const event = (globalThis.event = new Event(baseEvent));
    let savedChange;

    this.#userActivation();

    const sfp = this.#getFieldPrivate(source);
    if (sfp.isButton()) {
      sfp.setId(source, id);
      event.value = sfp.getExportValue(source, event.value);
      if (name === "Action") {
        sfp.setValue(source, event.value);
      }
    }

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
        this.runValidation(source, event);
        return;
      case "Action":
        this.runActions(source, source, event, name);
        this.runCalculate(source, event);
        return;
    }

    this.runActions(source, source, event, name);

    if (name !== "Keystroke") {
      return;
    }

    if (event.rc) {
      if (event.willCommit) {
        this.runValidation(source, event);
      } else {
        if (sfp.getIsChoice(source)) {
          source.value = savedChange.changeEx;
          sfp.send(source, {
            id: sfp.getId(source),
            siblings: sfp.getSiblings(source),
            value: source.value,
          });
          return;
        }

        const value = (source.value = this.#mergeChange(event));
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
        sfp.send(source, {
          id: sfp.getId(source),
          siblings: sfp.getSiblings(source),
          value,
          selRange: [selStart, selEnd],
        });
      }
    } else if (!event.willCommit) {
      sfp.send(source, {
        id: sfp.getId(source),
        siblings: sfp.getSiblings(source),
        value: savedChange.value,
        selRange: [savedChange.selStart, savedChange.selEnd],
      });
    } else {
      // Entry is not valid (rc == false) and it's a commit
      // so just clear the field.
      sfp.send(source, {
        id: sfp.getId(source),
        siblings: sfp.getSiblings(source),
        value: "",
        formattedValue: null,
        selRange: [0, 0],
      });
    }
  }

  formatAll() {
    // Run format actions if any for all the fields.
    const event = (globalThis.event = new Event({}));
    for (const source of Object.values(this.#objects)) {
      event.value = this.#getFieldPrivate(source).getComputedValue(source);
      this.runActions(source, source, event, "Format");
    }
  }

  runValidation(source, event) {
    const didValidateRun = this.runActions(source, source, event, "Validate");
    const sfp = this.#getFieldPrivate(source);
    if (event.rc) {
      source.value = event.value;

      this.runCalculate(source, event);

      const savedValue = (event.value = sfp.getComputedValue(source));
      let formattedValue = null;

      if (this.runActions(source, source, event, "Format")) {
        formattedValue = event.value?.toString?.();
      }

      sfp.send(source, {
        id: sfp.getId(source),
        siblings: sfp.getSiblings(source),
        value: savedValue,
        formattedValue,
      });
      event.value = savedValue;
    } else if (didValidateRun) {
      // The value is not valid.
      sfp.send(source, {
        id: sfp.getId(source),
        siblings: sfp.getSiblings(source),
        value: "",
        formattedValue: null,
        selRange: [0, 0],
        focus: true, // Stay in the field.
      });
    }
  }

  runActions(source, target, event, eventName) {
    event.source = source;
    event.target = target;
    event.name = eventName;
    event.targetName = target.name;
    event.rc = true;

    return this.#getFieldPrivate(target).runActions(target, event);
  }

  #calculateNow() {
    // This function can be called by a JS script (doc.calculateNow()).
    // If !this.#calculationOrder then there is nothing to calculate.
    // #isCalculating is here to prevent infinite recursion with calculateNow.
    // If !this.#doc.calculate then the script doesn't want to have
    // a calculate.

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
    globalThis.event = new Event({});

    this.runCalculate(source, globalThis.event);

    this.#isCalculating = false;
  }

  runCalculate(source, event) {
    // #doc.calculate is equivalent to doc.calculate and can be
    // changed by a script to allow a future calculate or not.
    // This function is either called by calculateNow or when an action
    // is triggered (in this case we cannot be currently calculating).
    // So there are no need to check for #isCalculating because it has
    // been already done in calculateNow.
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
      const tfp = this.#getFieldPrivate(target);
      let savedValue = tfp.getComputedValue(target);
      this.runActions(source, target, event, "Calculate");

      if (!event.rc) {
        continue;
      }

      if (event.value !== null) {
        // A new value has been calculated so set it.
        target.value = event.value;
      } else {
        event.value = tfp.getComputedValue(target);
      }

      this.runActions(target, target, event, "Validate");
      if (!event.rc) {
        if (tfp.getComputedValue(target) !== savedValue) {
          target.value = savedValue;
        }
        continue;
      }

      if (event.value === null) {
        event.value = tfp.getComputedValue(target);
      }

      savedValue = tfp.getComputedValue(target);
      let formattedValue = null;
      if (this.runActions(target, target, event, "Format")) {
        formattedValue = event.value?.toString?.();
      }

      tfp.send(target, {
        id: tfp.getId(target),
        siblings: tfp.getSiblings(target),
        value: savedValue,
        formattedValue,
      });
    }
  }
};

export {};
