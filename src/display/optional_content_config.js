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
  info,
  objectFromMap,
  RenderingIntentFlag,
  unreachable,
  warn,
} from "../shared/util.js";
import { MurmurHash3_64 } from "../shared/murmurhash3.js";

const INTERNAL = Symbol("INTERNAL");

class OptionalContentGroup {
  #isDisplay = false;

  #isPrint = false;

  #userSet = false;

  #visible = true;

  constructor(renderingIntent, { name, intent, usage, rbGroups }) {
    this.#isDisplay = !!(renderingIntent & RenderingIntentFlag.DISPLAY);
    this.#isPrint = !!(renderingIntent & RenderingIntentFlag.PRINT);

    this.name = name;
    this.intent = intent;
    this.usage = usage;
    this.rbGroups = rbGroups;
  }

  /**
   * @type {boolean}
   */
  get visible() {
    if (this.#userSet) {
      return this.#visible;
    }
    if (!this.#visible) {
      return false;
    }
    const { print, view } = this.usage;

    if (this.#isDisplay) {
      return view?.viewState !== "OFF";
    } else if (this.#isPrint) {
      return print?.printState !== "OFF";
    }
    return true;
  }

  /**
   * @ignore
   */
  _setVisible(internal, visible, userSet = false) {
    if (internal !== INTERNAL) {
      unreachable("Internal method `_setVisible` called.");
    }
    this.#userSet = userSet;
    this.#visible = visible;
  }
}

class OptionalContentConfig {
  #cachedGetHash = null;

  #groups = new Map();

  #initialHash = null;

  #order = null;

  constructor(data, renderingIntent = RenderingIntentFlag.DISPLAY) {
    this.renderingIntent = renderingIntent;

    this.name = null;
    this.creator = null;

    if (data === null) {
      return;
    }
    this.name = data.name;
    this.creator = data.creator;
    this.#order = data.order;
    for (const group of data.groups) {
      this.#groups.set(
        group.id,
        new OptionalContentGroup(renderingIntent, group)
      );
    }

    if (data.baseState === "OFF") {
      for (const group of this.#groups.values()) {
        group._setVisible(INTERNAL, false);
      }
    }

    for (const on of data.on) {
      this.#groups.get(on)._setVisible(INTERNAL, true);
    }

    for (const off of data.off) {
      this.#groups.get(off)._setVisible(INTERNAL, false);
    }

    // The following code must always run *last* in the constructor.
    this.#initialHash = this.getHash();
  }

  #evaluateVisibilityExpression(array) {
    const length = array.length;
    if (length < 2) {
      return true;
    }
    const operator = array[0];
    for (let i = 1; i < length; i++) {
      const element = array[i];
      let state;
      if (Array.isArray(element)) {
        state = this.#evaluateVisibilityExpression(element);
      } else if (this.#groups.has(element)) {
        state = this.#groups.get(element).visible;
      } else {
        warn(`Optional content group not found: ${element}`);
        return true;
      }
      switch (operator) {
        case "And":
          if (!state) {
            return false;
          }
          break;
        case "Or":
          if (state) {
            return true;
          }
          break;
        case "Not":
          return !state;
        default:
          return true;
      }
    }
    return operator === "And";
  }

  isVisible(group) {
    if (this.#groups.size === 0) {
      return true;
    }
    if (!group) {
      info("Optional content group not defined.");
      return true;
    }
    if (group.type === "OCG") {
      if (!this.#groups.has(group.id)) {
        warn(`Optional content group not found: ${group.id}`);
        return true;
      }
      return this.#groups.get(group.id).visible;
    } else if (group.type === "OCMD") {
      // Per the spec, the expression should be preferred if available.
      if (group.expression) {
        return this.#evaluateVisibilityExpression(group.expression);
      }
      if (!group.policy || group.policy === "AnyOn") {
        // Default
        for (const id of group.ids) {
          if (!this.#groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this.#groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOn") {
        for (const id of group.ids) {
          if (!this.#groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this.#groups.get(id).visible) {
            return false;
          }
        }
        return true;
      } else if (group.policy === "AnyOff") {
        for (const id of group.ids) {
          if (!this.#groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this.#groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOff") {
        for (const id of group.ids) {
          if (!this.#groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this.#groups.get(id).visible) {
            return false;
          }
        }
        return true;
      }
      warn(`Unknown optional content policy ${group.policy}.`);
      return true;
    }
    warn(`Unknown group type ${group.type}.`);
    return true;
  }

  setVisibility(id, visible = true, preserveRB = true) {
    const group = this.#groups.get(id);
    if (!group) {
      warn(`Optional content group not found: ${id}`);
      return;
    }

    // If the visibility is about to be set to `true` and the group belongs to
    // any radiobutton groups, hide all other OCGs in these radiobutton groups,
    // provided that radiobutton state relationships are to be preserved.
    if (preserveRB && visible && group.rbGroups.length) {
      for (const rbGroup of group.rbGroups) {
        for (const otherId of rbGroup) {
          if (otherId !== id) {
            this.#groups.get(otherId)?._setVisible(INTERNAL, false, true);
          }
        }
      }
    }

    group._setVisible(INTERNAL, !!visible, /* userSet = */ true);

    this.#cachedGetHash = null;
  }

  setOCGState({ state, preserveRB }) {
    let operator;

    for (const elem of state) {
      switch (elem) {
        case "ON":
        case "OFF":
        case "Toggle":
          operator = elem;
          continue;
      }

      const group = this.#groups.get(elem);
      if (!group) {
        continue;
      }
      switch (operator) {
        case "ON":
          this.setVisibility(elem, true, preserveRB);
          break;
        case "OFF":
          this.setVisibility(elem, false, preserveRB);
          break;
        case "Toggle":
          this.setVisibility(elem, !group.visible, preserveRB);
          break;
      }
    }

    this.#cachedGetHash = null;
  }

  get hasInitialVisibility() {
    return this.#initialHash === null || this.getHash() === this.#initialHash;
  }

  getOrder() {
    if (!this.#groups.size) {
      return null;
    }
    if (this.#order) {
      return this.#order.slice();
    }
    return [...this.#groups.keys()];
  }

  getGroups() {
    return this.#groups.size > 0 ? objectFromMap(this.#groups) : null;
  }

  getGroup(id) {
    return this.#groups.get(id) || null;
  }

  getHash() {
    if (this.#cachedGetHash !== null) {
      return this.#cachedGetHash;
    }
    const hash = new MurmurHash3_64();

    for (const [id, group] of this.#groups) {
      hash.update(`${id}:${group.visible}`);
    }
    return (this.#cachedGetHash = hash.hexdigest());
  }
}

export { OptionalContentConfig };
