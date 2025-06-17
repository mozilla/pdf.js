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
 * This file extends the AnnotationEditor class to use the official annotation events API.
 * It patches the methods that need to dispatch events through the API.
 */

import { AnnotationEditor } from "./editor.js";
import { AnnotationEventType } from "../annotation_event_types.js";

// Save the original methods that we're going to override
const originalSelect = AnnotationEditor.prototype.select;
const originalUnselect = AnnotationEditor.prototype.unselect;
const originalFocusout = AnnotationEditor.prototype.focusout;
const originalSave = AnnotationEditor.prototype.save;
const originalCommit = AnnotationEditor.prototype.commit;
const originalRemove = AnnotationEditor.prototype.remove;

// Override the select method to dispatch the official event
AnnotationEditor.prototype.select = function () {
  // Call the original method
  originalSelect.call(this);

  // Dispatch the official event
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // We still dispatch the custom event for backward compatibility
    const customEvent = new CustomEvent("pdfjs-annotations-viewer-select", {
      detail: {
        uniqueId: this.uniqueId,
        annotation: this.serialize(),
      },
    });
    window.parent.dispatchEvent(customEvent);

    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.SELECTED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
      data: this.serialize(),
    });
  }
};

// Override the unselect method to dispatch the official event
AnnotationEditor.prototype.unselect = function () {
  // Call the original method
  originalUnselect.call(this);

  // Dispatch the official event
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // We still dispatch the custom event for backward compatibility
    const customEvent = new CustomEvent("pdfjs-annotations-viewer-unselect", {
      detail: {
        uniqueId: this.uniqueId,
      },
    });
    window.parent.dispatchEvent(customEvent);

    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.UNSELECTED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
    });
  }
};

// Override the focusout method to dispatch the official event
AnnotationEditor.prototype.focusout = function (event) {
  // Call the original method
  originalFocusout.call(this, event);

  // Dispatch the official event if the annotation was modified
  if (
    (this._uiManager.pdfDocument?.annotationEventManager &&
      this._hasBeenMoved) ||
    this._hasBeenResized
  ) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.MODIFIED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
      data: this.serialize(),
    });
  }
};

// Override the save method to dispatch the official event
AnnotationEditor.prototype.save = function () {
  // Call the original method
  originalSave.call(this);

  // Dispatch the official event
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // We still dispatch the custom event for backward compatibility
    const customEvent = new CustomEvent(
      "pdfjs-annotations-viewer-save-annotation",
      {
        detail: {
          uniqueId: this.uniqueId,
          annotation: this.serialize(),
        },
      }
    );
    window.parent.dispatchEvent(customEvent);

    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.MODIFIED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
      data: this.serialize(),
    });
  }
};

// Override the commit method to dispatch the official event
AnnotationEditor.prototype.commit = function () {
  // Call the original method
  originalCommit.call(this);

  // Dispatch the official event
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.MODIFIED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
      data: this.serialize(),
    });
  }
};

// Override the remove method to dispatch the official event
AnnotationEditor.prototype.remove = function () {
  // Dispatch the official event before removing
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.REMOVED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
    });
  }

  // Call the original method
  originalRemove.call(this);
};

// Add a new method to handle annotation creation
AnnotationEditor.prototype.dispatchCreatedEvent = function () {
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.CREATED, {
      source: this,
      id: this.id,
      uniqueId: this.uniqueId,
      pageIndex: this.pageIndex,
      type: this.editorType,
      data: this.serialize(),
    });
  }
};

// Add a method to handle sidebar toggling
AnnotationEditor.prototype.toggleAnnotationSidebar = function (visible) {
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(AnnotationEventType.SIDEBAR_TOGGLED, {
      source: this,
      visible,
    });
  }
};

// Add a method to handle creation mode changes
AnnotationEditor.prototype.changeCreationMode = function (mode) {
  if (this._uiManager.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    this._uiManager.eventBus.dispatch(
      AnnotationEventType.CREATION_MODE_CHANGED,
      {
        source: this,
        mode,
      }
    );
  }
};

export { AnnotationEditor };
