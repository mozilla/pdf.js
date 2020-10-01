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
    this.selEnd = data.selEnd || 0;
    this.selStart = data.selStart || 0;
    this.shift = data.shift || false;
    this.source = data.source || null;
    this.target = data.target || null;
    this.targetName = data.targetName || "";
    this.type = "Field";
    this.value = data.value || null;
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

  dispatch(baseEvent) {
    const id = baseEvent.id;
    if (!(id in this._objects)) {
      return;
    }

    const name = baseEvent.name.replace(" ", "");
    const source = this._objects[id];
    const event = (this._document.obj._event = new Event(baseEvent));
    const oldValue = source.obj.value;

    this.runActions(source, source, event, name);
    if (event.rc && oldValue !== event.value) {
      source.wrapped.value = event.value;
    }
  }

  runActions(source, target, event, eventName) {
    event.source = source.wrapped;
    event.target = target.wrapped;
    event.name = eventName;
    event.rc = true;
    if (!target.obj._runActions(event)) {
      return true;
    }
    return event.rc;
  }
}

export { Event, EventDispatcher };
