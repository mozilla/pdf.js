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
    this.groups = new Map();

    if (data === null) {
      return;
    }
    this.name = data.name;
    this.creator = data.creator;
    for (const group of data.groups) {
      this.groups.set(
        group.id,
        new OptionalContentGroup(group.name, group.intent)
      );
    }

    if (data.baseState === "OFF") {
      for (const group of this.groups) {
        group.visible = false;
      }
    }

    for (const on of data.on) {
      this.groups.get(on).visible = true;
    }

    for (const off of data.off) {
      this.groups.get(off).visible = false;
    }
  }

  isVisible(group) {
    if (group.type === "OCG") {
      if (!this.groups.has(group.id)) {
        warn(`Optional content group not found: ${group.id}`);
        return true;
      }
      return this.groups.get(group.id).visible;
    } else if (group.type === "OCMD") {
      // Per the spec, the expression should be preferred if available. Until
      // we implement this, just fallback to using the group policy for now.
      if (group.expression) {
        warn("Visibility expression not supported yet.");
      }
      if (!group.policy || group.policy === "AnyOn") {
        // Default
        for (const id of group.ids) {
          if (!this.groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this.groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOn") {
        for (const id of group.ids) {
          if (!this.groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this.groups.get(id).visible) {
            return false;
          }
        }
        return true;
      } else if (group.policy === "AnyOff") {
        for (const id of group.ids) {
          if (!this.groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (!this.groups.get(id).visible) {
            return true;
          }
        }
        return false;
      } else if (group.policy === "AllOff") {
        for (const id of group.ids) {
          if (!this.groups.has(id)) {
            warn(`Optional content group not found: ${id}`);
            return true;
          }
          if (this.groups.get(id).visible) {
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
}

export { OptionalContentConfig };
