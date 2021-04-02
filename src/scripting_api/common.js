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

const FieldType = {
  none: 0,
  number: 1,
  percent: 2,
  date: 3,
  time: 4,
};

function createActionsMap(actions) {
  const actionsMap = new Map();
  if (actions) {
    for (const [eventType, actionsForEvent] of Object.entries(actions)) {
      actionsMap.set(eventType, actionsForEvent);
    }
  }
  return actionsMap;
}

function getFieldType(actions) {
  let format = actions.get("Format");
  if (!format) {
    return FieldType.none;
  }

  format = format[0];

  format = format.trim();
  if (format.startsWith("AFNumber_")) {
    return FieldType.number;
  }
  if (format.startsWith("AFPercent_")) {
    return FieldType.percent;
  }
  if (format.startsWith("AFDate_")) {
    return FieldType.date;
  }
  if (format.startsWith("AFTime__")) {
    return FieldType.time;
  }
  return FieldType.none;
}

export { createActionsMap, FieldType, getFieldType };
