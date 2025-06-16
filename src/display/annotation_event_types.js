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
 * Annotation event types.
 * @enum {string}
 */
const AnnotationEventType = Object.freeze({
  // Lifecycle events
  INITIALIZED: "annotationInitialized",
  LAYER_LOADED: "annotationLayerLoaded",

  // Selection events
  SELECTED: "annotationSelected",
  UNSELECTED: "annotationUnselected",

  // Modification events
  CREATED: "annotationCreated",
  MODIFIED: "annotationModified",
  REMOVED: "annotationRemoved",

  // Batch events
  SAVED: "annotationsSaved",
  LOADED: "annotationsLoaded",

  // UI events
  SIDEBAR_TOGGLED: "annotationSidebarToggled",
  CREATION_MODE_CHANGED: "annotationCreationModeChanged",
});

export { AnnotationEventType };
