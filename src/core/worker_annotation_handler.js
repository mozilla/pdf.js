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

import { getUuid } from "../shared/util.js";
import {
  validateAnnotationData,
  createAnnotationEventDetail,
  createBatchAnnotationEventDetail,
  createUIEventDetail,
  AnnotationSchemas,
} from "./annotation_event_utils.js";

/**
 * Handles annotation-related messages in the worker.
 */
class WorkerAnnotationHandler {
  /**
   * @param {Object} handler - The worker message handler.
   * @param {Object} pdfManager - The PDF manager.
   */
  constructor(handler, pdfManager) {
    this.handler = handler;
    this.pdfManager = pdfManager;
    this.annotationStorage = pdfManager.annotationStorage;
    this.setupHandlers();
  }

  /**
   * Set up message handlers for annotation events.
   */
  setupHandlers() {
    // Selection events
    this.handler.on("SelectAnnotation", this.handleSelectAnnotation.bind(this));
    this.handler.on(
      "UnselectAnnotation",
      this.handleUnselectAnnotation.bind(this)
    );

    // Modification events
    this.handler.on("CreateAnnotation", this.handleCreateAnnotation.bind(this));
    this.handler.on("ModifyAnnotation", this.handleModifyAnnotation.bind(this));
    this.handler.on("RemoveAnnotation", this.handleRemoveAnnotation.bind(this));

    // UI events
    this.handler.on(
      "EnableAnnotationCreation",
      this.handleEnableAnnotationCreation.bind(this)
    );
    this.handler.on(
      "DisableAnnotationCreation",
      this.handleDisableAnnotationCreation.bind(this)
    );
    this.handler.on(
      "ShowAnnotationSidebar",
      this.handleShowAnnotationSidebar.bind(this)
    );
    this.handler.on(
      "HideAnnotationSidebar",
      this.handleHideAnnotationSidebar.bind(this)
    );

    // Batch operations
    this.handler.on(
      "GetAllAnnotations",
      this.handleGetAllAnnotations.bind(this)
    );
    this.handler.on("SetAnnotations", this.handleSetAnnotations.bind(this));
  }

  /**
   * Send an annotation event to the client.
   * @param {string} type - The event type.
   * @param {Object} detail - The event details.
   * @private
   */
  _sendAnnotationEvent(type, detail) {
    this.handler.send("AnnotationEvent", {
      type,
      detail,
    });
  }

  /**
   * Handle the SelectAnnotation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleSelectAnnotation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleSelectAnnotation"
        );
        return;
      }

      const { id, pageIndex } = validateAnnotationData(
        data,
        AnnotationSchemas.base
      );

      // TODO: Implement actual annotation selection logic
      // This would typically involve finding the annotation in storage
      // and marking it as selected

      // Send the selection event
      this._sendAnnotationEvent(
        "annotationSelected",
        createAnnotationEventDetail(id, pageIndex)
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleSelectAnnotation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the UnselectAnnotation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleUnselectAnnotation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleUnselectAnnotation"
        );
        return;
      }

      const { id } = validateAnnotationData(data, {
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      });

      // TODO: Implement actual annotation unselection logic
      // This would typically involve finding the annotation in storage
      // and marking it as unselected

      // Send the unselection event
      this._sendAnnotationEvent(
        "annotationUnselected",
        createAnnotationEventDetail(id, 0) // pageIndex might not be needed for unselect
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleUnselectAnnotation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the CreateAnnotation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleCreateAnnotation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleCreateAnnotation"
        );
        return;
      }

      const { type, properties, pageIndex } = validateAnnotationData(
        data,
        AnnotationSchemas.create
      );

      // Generate a unique ID for the new annotation
      const id = getUuid();

      // TODO: Implement actual annotation creation logic
      // This would typically involve creating a new annotation object
      // and adding it to the annotation storage

      // Send the creation event
      this._sendAnnotationEvent(
        "annotationCreated",
        createAnnotationEventDetail(id, pageIndex, {
          type,
          properties,
        })
      );

      sink.resolve(id);
    } catch (error) {
      console.error("Error in handleCreateAnnotation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the ModifyAnnotation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleModifyAnnotation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleModifyAnnotation"
        );
        return;
      }

      const { id, properties } = validateAnnotationData(
        data,
        AnnotationSchemas.modify
      );

      // TODO: Implement actual annotation modification logic
      // This would typically involve finding the annotation in storage
      // and updating its properties

      // For now, we'll assume the annotation is on page 0
      const pageIndex = 0;

      // Send the modification event
      this._sendAnnotationEvent(
        "annotationModified",
        createAnnotationEventDetail(id, pageIndex, {
          properties,
        })
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleModifyAnnotation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the RemoveAnnotation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleRemoveAnnotation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleRemoveAnnotation"
        );
        return;
      }

      const { id } = validateAnnotationData(data, {
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      });

      // TODO: Implement actual annotation removal logic
      // This would typically involve finding the annotation in storage
      // and removing it

      // For now, we'll assume the annotation is on page 0
      const pageIndex = 0;

      // Send the removal event
      this._sendAnnotationEvent(
        "annotationRemoved",
        createAnnotationEventDetail(id, pageIndex)
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleRemoveAnnotation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the EnableAnnotationCreation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleEnableAnnotationCreation(data, sink) {
    try {
      // For annotation creation, we don't require a valid sink since it's triggered by UI events
      // This prevents errors in the annotation toolbar
      if (!sink || typeof sink.resolve !== "function") {
        sink = {
          resolve: () => {},
          reject: () => {},
        };
      }

      const { type } = validateAnnotationData(data, {
        required: ["type"],
        properties: {
          type: { type: "string" },
        },
      });

      // TODO: Implement actual annotation creation mode logic
      // This would typically involve setting a flag or state
      // to indicate that the user is in annotation creation mode

      // Send the creation mode changed event
      this._sendAnnotationEvent(
        "annotationCreationModeChanged",
        createUIEventDetail({
          mode: type,
        })
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleEnableAnnotationCreation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the DisableAnnotationCreation message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleDisableAnnotationCreation(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleDisableAnnotationCreation"
        );
        return;
      }

      // No validation needed for this message

      // TODO: Implement actual annotation creation mode disabling logic
      // This would typically involve clearing a flag or state
      // to indicate that the user is no longer in annotation creation mode

      // Send the creation mode changed event
      this._sendAnnotationEvent(
        "annotationCreationModeChanged",
        createUIEventDetail({
          mode: null,
        })
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleDisableAnnotationCreation:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the ShowAnnotationSidebar message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleShowAnnotationSidebar(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleShowAnnotationSidebar"
        );
        return;
      }

      // No validation needed for this message

      // TODO: Implement actual sidebar showing logic
      // This would typically involve setting a flag or state
      // to indicate that the sidebar should be shown

      // Send the sidebar toggled event
      this._sendAnnotationEvent(
        "annotationSidebarToggled",
        createUIEventDetail({
          visible: true,
        })
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleShowAnnotationSidebar:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the HideAnnotationSidebar message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleHideAnnotationSidebar(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleHideAnnotationSidebar"
        );
        return;
      }

      // No validation needed for this message

      // TODO: Implement actual sidebar hiding logic
      // This would typically involve setting a flag or state
      // to indicate that the sidebar should be hidden

      // Send the sidebar toggled event
      this._sendAnnotationEvent(
        "annotationSidebarToggled",
        createUIEventDetail({
          visible: false,
        })
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleHideAnnotationSidebar:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the GetAllAnnotations message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleGetAllAnnotations(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleGetAllAnnotations"
        );
        return;
      }

      const { pageIndex } = data || {};

      // TODO: Implement actual annotation retrieval logic
      // This would typically involve getting annotations from storage
      // and returning them

      // For now, we'll return an empty array
      const annotations = [];

      // Send the annotations loaded event
      this._sendAnnotationEvent(
        "annotationsLoaded",
        createBatchAnnotationEventDetail(annotations)
      );

      sink.resolve(annotations);
    } catch (error) {
      console.error("Error in handleGetAllAnnotations:", error);

      // Make sure sink is defined before using it
      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }

  /**
   * Handle the SetAnnotations message.
   * @param {Object} data - The message data.
   * @param {Function} sink - The message sink.
   */
  handleSetAnnotations(data, sink) {
    try {
      // Check if sink is valid
      if (!sink || typeof sink.resolve !== "function") {
        console.error(
          "Invalid or missing message sink in handleSetAnnotations"
        );
        return;
      }

      const { annotations } = validateAnnotationData(
        data,
        AnnotationSchemas.batch
      );

      // TODO: Implement actual annotation setting logic
      // This would typically involve updating the annotation storage
      // with the provided annotations

      // Send the annotations saved event
      this._sendAnnotationEvent(
        "annotationsSaved",
        createBatchAnnotationEventDetail(annotations)
      );

      sink.resolve();
    } catch (error) {
      console.error("Error in handleSetAnnotations:", error);

      if (sink && typeof sink.reject === "function") {
        sink.reject(new Error(error.message || "Unknown error"));
      } else {
        console.error("Could not reject promise: invalid sink object");
      }
    }
  }
}

export { WorkerAnnotationHandler };
