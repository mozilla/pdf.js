/* Copyright 2025 Mozilla Foundation
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

/**
 * @typedef {Object} AnnotationEventDetail
 * @property {string} id - The annotation ID.
 * @property {number} pageIndex - The page index.
 * @property {number} timestamp - The timestamp when the event occurred.
 */

/**
 * Validate annotation data against a schema.
 * @param {Object} data - The annotation data to validate.
 * @param {Object} schema - The schema to validate against.
 * @returns {Object} The validated data.
 * @throws {Error} If the data is invalid.
 */
function validateAnnotationData(data, schema) {
  // Basic validation for now - can be expanded with a more robust schema validation
  if (!data) {
    throw new Error("Annotation data is required");
  }

  // Check required fields based on schema
  if (schema.required) {
    for (const field of schema.required) {
      if (data[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  // Check field types if specified
  if (schema.properties) {
    for (const [field, propSchema] of Object.entries(schema.properties)) {
      if (data[field] !== undefined && propSchema.type) {
        const type = typeof data[field];
        if (
          (propSchema.type === "string" && type !== "string") ||
          (propSchema.type === "number" && type !== "number") ||
          (propSchema.type === "boolean" && type !== "boolean") ||
          (propSchema.type === "object" && type !== "object") ||
          (propSchema.type === "array" && !Array.isArray(data[field]))
        ) {
          throw new Error(
            `Invalid type for field ${field}: expected ${propSchema.type}, got ${type}`
          );
        }
      }
    }
  }

  return data;
}

/**
 * Create a timestamp for annotation events.
 * @returns {number} The current timestamp.
 */
function createTimestamp() {
  return Date.now();
}

/**
 * Create an annotation event detail object.
 * @param {string} id - The annotation ID.
 * @param {number} pageIndex - The page index.
 * @param {Object} [additionalData] - Additional data to include.
 * @returns {AnnotationEventDetail} The event detail.
 */
function createAnnotationEventDetail(id, pageIndex, additionalData = {}) {
  return {
    id,
    pageIndex,
    timestamp: createTimestamp(),
    ...additionalData,
  };
}

/**
 * Create a batch annotation event detail object.
 * @param {Array<Object>} annotations - The annotations.
 * @returns {Object} The event detail.
 */
function createBatchAnnotationEventDetail(annotations) {
  return {
    annotations,
    timestamp: createTimestamp(),
  };
}

/**
 * Create a UI event detail object.
 * @param {Object} data - The UI event data.
 * @returns {Object} The event detail.
 */
function createUIEventDetail(data) {
  return {
    ...data,
    timestamp: createTimestamp(),
  };
}

/**
 * Schemas for annotation data validation.
 */
const AnnotationSchemas = {
  base: {
    required: ["id", "pageIndex"],
    properties: {
      id: { type: "string" },
      pageIndex: { type: "number" },
    },
  },
  create: {
    required: ["type", "properties", "pageIndex"],
    properties: {
      type: { type: "string" },
      properties: { type: "object" },
      pageIndex: { type: "number" },
    },
  },
  modify: {
    required: ["id", "properties"],
    properties: {
      id: { type: "string" },
      properties: { type: "object" },
    },
  },
  batch: {
    required: ["annotations"],
    properties: {
      annotations: { type: "array" },
    },
  },
};

export {
  validateAnnotationData,
  createTimestamp,
  createAnnotationEventDetail,
  createBatchAnnotationEventDetail,
  createUIEventDetail,
  AnnotationSchemas,
};
