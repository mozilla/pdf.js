/* Copyright 2012 Mozilla Foundation
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

import { Dict, Name, Ref } from "./primitives.js";
import { FormatError, warn } from "../shared/util.js";

function _parseVisibilityExpression(
  xref,
  array,
  nestingCounter,
  currentResult
) {
  const MAX_NESTING = 10;
  if (++nestingCounter > MAX_NESTING) {
    warn("Visibility expression is too deeply nested");
    return;
  }
  const length = array.length;
  const operator = xref.fetchIfRef(array[0]);
  if (length < 2 || !(operator instanceof Name)) {
    warn("Invalid visibility expression");
    return;
  }
  switch (operator.name) {
    case "And":
    case "Or":
    case "Not":
      currentResult.push(operator.name);
      break;
    default:
      warn(`Invalid operator ${operator.name} in visibility expression`);
      return;
  }
  for (let i = 1; i < length; i++) {
    const raw = array[i];
    const object = xref.fetchIfRef(raw);
    if (Array.isArray(object)) {
      const nestedResult = [];
      currentResult.push(nestedResult);
      // Recursively parse a subarray.
      _parseVisibilityExpression(xref, object, nestingCounter, nestedResult);
    } else if (raw instanceof Ref) {
      // Reference to an OCG dictionary.
      currentResult.push(raw.toString());
    }
  }
}

function parseMarkedContentProps(xref, contentProperties, resources) {
  let optionalContent;
  if (contentProperties instanceof Name) {
    const properties = resources.get("Properties");
    optionalContent = properties.get(contentProperties.name);
  } else if (contentProperties instanceof Dict) {
    optionalContent = contentProperties;
  } else {
    throw new FormatError("Optional content properties malformed.");
  }

  const optionalContentType = optionalContent.get("Type")?.name;
  if (optionalContentType === "OCG") {
    return {
      type: optionalContentType,
      id: optionalContent.objId,
    };
  } else if (optionalContentType === "OCMD") {
    const expression = optionalContent.get("VE");
    if (Array.isArray(expression)) {
      const result = [];
      _parseVisibilityExpression(xref, expression, 0, result);
      if (result.length > 0) {
        return {
          type: "OCMD",
          expression: result,
        };
      }
    }

    const optionalContentGroups = optionalContent.get("OCGs");
    if (
      Array.isArray(optionalContentGroups) ||
      optionalContentGroups instanceof Dict
    ) {
      const groupIds = [];
      if (Array.isArray(optionalContentGroups)) {
        for (const ocg of optionalContentGroups) {
          groupIds.push(ocg.toString());
        }
      } else {
        // Dictionary, just use the obj id.
        groupIds.push(optionalContentGroups.objId);
      }
      const p = optionalContent.get("P");

      return {
        type: optionalContentType,
        ids: groupIds,
        policy: p instanceof Name ? p.name : null,
        expression: null,
      };
    } else if (optionalContentGroups instanceof Ref) {
      return {
        type: optionalContentType,
        id: optionalContentGroups.toString(),
      };
    }
  }
  return null;
}

export { parseMarkedContentProps };
