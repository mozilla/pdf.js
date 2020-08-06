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
import { warn } from "../shared/util.js";

class OptionalContentGroup {
  constructor(name, intent) {
    this.visible = true;
    this.name = name;
    this.intent = intent;
  }
}

class OptionalContentConfig {
  constructor(data) {
    this.name = null;
    this.creator = null;
    this._order = null;
    this._groups = new Map();

    if (data === null) {
      return;
    }
    this.name = data.name;
    this.creator = data.creator;
    this._order = data.order;
    for (const group of data.groups) {
      this._groups.set(
        group.id,
        new OptionalContentGroup(group.name, group.intent)
      );
    }

    if (data.baseState === "OFF") {
      for (const group of this._groups) {
        group.visible = false;
      }
    }

    for (const on of data.on) {
      this._groups.get(on).visible = true;
    }

    for (const off of data.off) {
      this._groups.get(off).visible = false;
    }
  }

  isVisible(group) {
    if (group.type === "OCG") {
      if (!this._groups.has(group.id)) {
        warn(`Optional content group not found: ${group.id}`);
        return true;
      }
      return this._groups.get(group.id).visible;
    } else if (group.type === "OCMD") {
      // Per the spec, the expression should be preferred if available. Until
      // we implement this, just fallback to using the group policy for now.
      if (group.expression) {
        warn("Visibility expression not supported yet.");
      }
      if (!group.policy || group.policy === "AnyOn") {
        // Default
        for (const id of group.ids) {
          if (!this._groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this._groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOn") {
        for (const id of group.ids) {
          if (!this._groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this._groups.get(id).visible) {
            return false;
          }
        }
        return true;
      } else if (group.policy === "AnyOff") {
        for (const id of group.ids) {
          if (!this._groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this._groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOff") {
        for (const id of group.ids) {
          if (!this._groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this._groups.get(id).visible) {
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

  setVisibility(id, visible = true) {
    if (!this._groups.has(id)) {
      warn(`Optional content group not found: ${id}`);
      return;
    }
    this._groups.get(id).visible = !!visible;
  }

  getOrder() {
    if (!this._groups.size) {
      return null;
    }
    if (this._order) {
      return this._order.slice();
    }
    return Array.from(this._groups.keys());
  }

  getGroups() {
    if (!this._groups.size) {
      return null;
    }
    return Object.fromEntries(this._groups);
  }

  getGroup(id) {
    return this._groups.get(id) || null;
  }
}

export { OptionalContentConfig };
