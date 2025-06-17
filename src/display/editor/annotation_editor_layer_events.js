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
 * This file extends the AnnotationEditorLayer class to use the official annotation events API.
 * It patches the methods that need to dispatch events through the API.
 */

import { AnnotationEditorLayer } from "./annotation_editor_layer.js";
import { AnnotationEventType } from "../annotation_event_types.js";

// Save the original methods that we're going to override
const originalAdd = AnnotationEditorLayer.prototype.add;
const originalRemove = AnnotationEditorLayer.prototype.remove;
const originalUpdateMode = AnnotationEditorLayer.prototype.updateMode;
const originalSave = AnnotationEditorLayer.prototype.save;
const originalEnable = AnnotationEditorLayer.prototype.enable;
const originalDisable = AnnotationEditorLayer.prototype.disable;

// Override the add method to dispatch the official event
AnnotationEditorLayer.prototype.add = function (editor) {
  // Call the original method
  originalAdd.call(this, editor);

  // Dispatch the official event
  const uiManager = this._uiManager || editor._uiManager;
  if (uiManager?.pdfDocument?.annotationEventManager) {
    // Dispatch the created event
    editor.dispatchCreatedEvent();
  }
};

// Override the remove method to dispatch the official event
AnnotationEditorLayer.prototype.remove = function (editor) {
  // Call the original method
  originalRemove.call(this, editor);

  // No need to dispatch an event here as the editor.remove() method
  // already dispatches the REMOVED event
};

// Override the updateMode method to dispatch the official event
AnnotationEditorLayer.prototype.updateMode = function (mode) {
  // Get the mode if not provided
  if (mode === undefined) {
    mode = this._uiManager?.getMode();
  }

  // Call the original method
  originalUpdateMode.call(this, mode);

  // Dispatch the official event
  const uiManager = this._uiManager;
  if (uiManager?.pdfDocument?.annotationEventManager) {
    // Dispatch the creation mode changed event
    uiManager.eventBus.dispatch(AnnotationEventType.CREATION_MODE_CHANGED, {
      source: this,
      mode,
    });
  }
};

// Override the save method to dispatch the official event
AnnotationEditorLayer.prototype.save = function () {
  // Call the original method
  originalSave.call(this);

  // Dispatch the official event
  const uiManager = this._uiManager;
  if (uiManager?.pdfDocument?.annotationEventManager) {
    // We still dispatch the custom event for backward compatibility
    const annotationStorage =
      window.PDFViewerApplication?.pdfDocument?.annotationStorage;
    if (!annotationStorage) {
      return;
    }

    const annotationsMap = annotationStorage.serializable.map ?? [];
    const annotations = [...annotationsMap].map(([key, value]) => ({
      key,
      value,
    }));

    window.parent.postMessage(
      {
        type: "pdfjs-annotations-viewer",
        event: "save-annotations",
        annotations,
      },
      "*"
    );

    // Dispatch the official event
    uiManager.eventBus.dispatch(AnnotationEventType.SAVED, {
      source: this,
      annotations,
    });
  }
};

// Override the enable method to dispatch the official event
AnnotationEditorLayer.prototype.enable = async function () {
  // Call the original method
  await originalEnable.call(this);

  // Dispatch the official event
  const uiManager = this._uiManager;
  if (uiManager?.pdfDocument?.annotationEventManager) {
    // Dispatch the layer loaded event
    uiManager.eventBus.dispatch(AnnotationEventType.LAYER_LOADED, {
      source: this,
      pageIndex: this.pageIndex,
    });
  }
};

// Override the disable method to dispatch the official event
AnnotationEditorLayer.prototype.disable = function () {
  // Call the original method
  originalDisable.call(this);

  // No need to dispatch an event here as the layer is being disabled
};

// Add a method to handle sidebar toggling
AnnotationEditorLayer.prototype.toggleAnnotationSidebar = function (visible) {
  const uiManager = this._uiManager;
  if (uiManager?.pdfDocument?.annotationEventManager) {
    // Dispatch the official event
    uiManager.eventBus.dispatch(AnnotationEventType.SIDEBAR_TOGGLED, {
      source: this,
      visible,
    });
  }
};

export { AnnotationEditorLayer };
