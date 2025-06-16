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
 * Manages annotation events and operations.
 */
class AnnotationEventManager {
  /**
   * @param {PDFDocumentProxy} pdfDocument - The PDF document.
   * @param {Object} transport - The document transport.
   */
  constructor(pdfDocument, transport) {
    this._document = pdfDocument;
    this._transport = transport;
    this._eventListeners = new Map();
    this._setupMessageHandler();
  }

  /**
   * Set up the message handler for annotation events.
   * @private
   */
  _setupMessageHandler() {
    this._transport.messageHandler.on("AnnotationEvent", data => {
      const { type, detail } = data;
      this._dispatchEvent(type, detail);
    });
  }

  /**
   * Dispatch an event to all registered listeners.
   * @param {string} type - The event type.
   * @param {Object} detail - The event details.
   * @private
   */
  _dispatchEvent(type, detail) {
    const listeners = this._eventListeners.get(type) || [];
    for (const listener of listeners) {
      try {
        listener(detail);
      } catch (error) {
        console.error(`Error in annotation event listener for ${type}:`, error);
      }
    }
  }

  /**
   * Register an event listener.
   * @param {string} eventName - The event name.
   * @param {Function} callback - The callback function.
   */
  on(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName).push(callback);
  }

  /**
   * Unregister an event listener.
   * @param {string} eventName - The event name.
   * @param {Function} callback - The callback function.
   */
  off(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      return;
    }
    const listeners = this._eventListeners.get(eventName);
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Select an annotation.
   * @param {string} id - The annotation ID.
   * @param {number} pageIndex - The page index.
   * @returns {Promise<void>}
   */
  selectAnnotation(id, pageIndex) {
    return this._transport.messageHandler.sendWithPromise("SelectAnnotation", {
      id,
      pageIndex,
    });
  }

  /**
   * Unselect an annotation.
   * @param {string} id - The annotation ID.
   * @returns {Promise<void>}
   */
  unselectAnnotation(id) {
    return this._transport.messageHandler.sendWithPromise(
      "UnselectAnnotation",
      {
        id,
      }
    );
  }

  /**
   * Create an annotation.
   * @param {string} type - The annotation type.
   * @param {Object} properties - The annotation properties.
   * @param {number} pageIndex - The page index.
   * @returns {Promise<string>} - The annotation ID.
   */
  createAnnotation(type, properties, pageIndex) {
    return this._transport.messageHandler.sendWithPromise("CreateAnnotation", {
      type,
      properties,
      pageIndex,
    });
  }

  /**
   * Modify an annotation.
   * @param {string} id - The annotation ID.
   * @param {Object} properties - The new annotation properties.
   * @returns {Promise<void>}
   */
  modifyAnnotation(id, properties) {
    return this._transport.messageHandler.sendWithPromise("ModifyAnnotation", {
      id,
      properties,
    });
  }

  /**
   * Remove an annotation.
   * @param {string} id - The annotation ID.
   * @returns {Promise<void>}
   */
  removeAnnotation(id) {
    return this._transport.messageHandler.sendWithPromise("RemoveAnnotation", {
      id,
    });
  }

  /**
   * Enable annotation creation mode.
   * @param {string} type - The annotation type.
   * @returns {Promise<void>}
   */
  enableAnnotationCreation(type) {
    return this._transport.messageHandler.sendWithPromise(
      "EnableAnnotationCreation",
      {
        type,
      }
    );
  }

  /**
   * Disable annotation creation mode.
   * @returns {Promise<void>}
   */
  disableAnnotationCreation() {
    return this._transport.messageHandler.sendWithPromise(
      "DisableAnnotationCreation",
      {}
    );
  }

  /**
   * Show the annotation sidebar.
   * @returns {Promise<void>}
   */
  showAnnotationSidebar() {
    return this._transport.messageHandler.sendWithPromise(
      "ShowAnnotationSidebar",
      {}
    );
  }

  /**
   * Hide the annotation sidebar.
   * @returns {Promise<void>}
   */
  hideAnnotationSidebar() {
    return this._transport.messageHandler.sendWithPromise(
      "HideAnnotationSidebar",
      {}
    );
  }

  /**
   * Get all annotations.
   * @param {number} [pageIndex] - The page index. If not provided, returns annotations for all pages.
   * @returns {Promise<Array<Object>>}
   */
  getAnnotations(pageIndex) {
    return this._transport.messageHandler.sendWithPromise("GetAllAnnotations", {
      pageIndex,
    });
  }

  /**
   * Set annotations.
   * @param {Array<Object>} annotations - The annotations to set.
   * @returns {Promise<void>}
   */
  setAnnotations(annotations) {
    return this._transport.messageHandler.sendWithPromise("SetAnnotations", {
      annotations,
    });
  }
}

export { AnnotationEventManager };
