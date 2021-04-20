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
    this.selEnd = data.selEnd || -1;
    this.selStart = data.selStart || -1;
    this.shift = data.shift || false;
    this.source = data.source || null;
    this.target = data.target || null;
    this.targetName = "";
    this.type = "Field";
    this.value = data.value || "";
    this.willCommit = data.willCommit || false;
  }
}

class EventDispatcher {
  constructor(document, calculationOrder, objects) {
    this._document = document;
    this._calculationOrder = calculationOrder;
    this._objects = objects;

    this._document.obj._eventDispatcher = this;
  }

  mergeChange(event) {
    let value = event.value;
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

  dispatch(baseEvent) {
    const id = baseEvent.id;
    if (!(id in this._objects)) {
      let event;
      if (id === "doc" || id === "page") {
        event = globalThis.event = new Event(baseEvent);
        event.source = event.target = this._document.wrapped;
        event.name = baseEvent.name;
      }
      if (id === "doc") {
        this._document.obj._dispatchDocEvent(event.name);
      } else if (id === "page") {
        this._document.obj._dispatchPageEvent(
          event.name,
          baseEvent.actions,
          baseEvent.pageNumber
        );
      }
      return;
    }

    const name = baseEvent.name;
    const source = this._objects[id];
    const event = (globalThis.event = new Event(baseEvent));
    let savedChange;

    if (source.obj._isButton()) {
      source.obj._id = id;
      event.value = source.obj._getExportValue(event.value);
      if (name === "Action") {
        source.obj._value = event.value;
      }
    }

    switch (name) {
      case "Keystroke":
        savedChange = {
          value: event.value,
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
        if (this._document.obj.calculate) {
          this.runCalculate(source, event);
        }
        return;
    }

    this.runActions(source, source, event, name);

    if (name === "Keystroke") {
      if (event.rc) {
        if (event.willCommit) {
          this.runValidation(source, event);
        } else if (
          event.change !== savedChange.change ||
          event.selStart !== savedChange.selStart ||
          event.selEnd !== savedChange.selEnd
        ) {
          source.wrapped.value = this.mergeChange(event);
        }
      } else if (!event.willCommit) {
        source.obj._send({
          id: source.obj._id,
          value: savedChange.value,
          selRange: [savedChange.selStart, savedChange.selEnd],
        });
      }
    }
  }

  runValidation(source, event) {
    const hasRan = this.runActions(source, source, event, "Validate");
    if (event.rc) {
      if (hasRan) {
        source.wrapped.value = event.value;
        source.wrapped.valueAsString = event.value;
      } else {
        source.obj.value = event.value;
        source.obj.valueAsString = event.value;
      }

      if (this._document.obj.calculate) {
        this.runCalculate(source, event);
      }

      event.value = source.obj.value;
      this.runActions(source, source, event, "Format");
      source.wrapped.valueAsString = event.value;
    }
  }

  runActions(source, target, event, eventName) {
    event.source = source.wrapped;
    event.target = target.wrapped;
    event.name = eventName;
    event.targetName = target.obj.name;
    event.rc = true;

    return target.obj._runActions(event);
  }

  calculateNow() {
    if (!this._calculationOrder) {
      return;
    }
    const first = this._calculationOrder[0];
    const source = this._objects[first];
    globalThis.event = new Event({});
    this.runCalculate(source, globalThis.event);
  }

  runCalculate(source, event) {
    if (!this._calculationOrder) {
      return;
    }

    for (const targetId of this._calculationOrder) {
      if (!(targetId in this._objects)) {
        continue;
      }

      if (!this._document.obj.calculate) {
        // An action may have changed calculate value.
        continue;
      }

      event.value = null;
      const target = this._objects[targetId];
      this.runActions(source, target, event, "Calculate");
      if (!event.rc) {
        continue;
      }
      if (event.value !== null) {
        target.wrapped.value = event.value;
      }

      event.value = target.obj.value;
      this.runActions(target, target, event, "Validate");
      if (!event.rc) {
        continue;
      }

      event.value = target.obj.value;
      this.runActions(target, target, event, "Format");
      if (event.value !== null) {
        target.wrapped.valueAsString = event.value;
      }
    }
  }
}

export { Event, EventDispatcher };
