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

import { PDFDocumentProxy } from "./api.js";

/**
 * Annotation event types.
 */
export enum AnnotationEventType {
  // Lifecycle events
  INITIALIZED = "annotationInitialized",
  LAYER_LOADED = "annotationLayerLoaded",

  // Selection events
  SELECTED = "annotationSelected",
  UNSELECTED = "annotationUnselected",

  // Modification events
  CREATED = "annotationCreated",
  MODIFIED = "annotationModified",
  REMOVED = "annotationRemoved",

  // Batch events
  SAVED = "annotationsSaved",
  LOADED = "annotationsLoaded",

  // UI events
  SIDEBAR_TOGGLED = "annotationSidebarToggled",
  CREATION_MODE_CHANGED = "annotationCreationModeChanged",
}

/**
 * Base interface for all annotation event details.
 */
export interface AnnotationEventDetail {
  source: any;
  timestamp?: number;
}

/**
 * Interface for annotation events that include an annotation ID.
 */
export interface AnnotationIdEventDetail extends AnnotationEventDetail {
  id: string;
  uniqueId?: string;
  pageIndex: number;
}

/**
 * Interface for annotation events that include annotation data.
 */
export interface AnnotationDataEventDetail extends AnnotationIdEventDetail {
  data: any;
  type?: string;
}

/**
 * Interface for batch annotation events.
 */
export interface AnnotationBatchEventDetail extends AnnotationEventDetail {
  annotations: any[];
}

/**
 * Interface for UI-related annotation events.
 */
export interface AnnotationUIEventDetail extends AnnotationEventDetail {
  visible?: boolean;
  mode?: string | null;
}

/**
 * Manages annotation events and operations.
 */
export class AnnotationEventManager {
  /**
   * @param {PDFDocumentProxy} pdfDocument - The PDF document.
   * @param {Object} transport - The document transport.
   */
  constructor(pdfDocument: PDFDocumentProxy, transport: any);

  /**
   * Register an event listener.
   * @param {string} eventName - The event name.
   * @param {Function} callback - The callback function.
   */
  on(eventName: string, callback: (detail: any) => void): void;

  /**
   * Unregister an event listener.
   * @param {string} eventName - The event name.
   * @param {Function} callback - The callback function.
   */
  off(eventName: string, callback: (detail: any) => void): void;

  /**
   * Select an annotation.
   * @param {string} id - The annotation ID.
   * @param {number} pageIndex - The page index.
   * @returns {Promise<void>}
   */
  selectAnnotation(id: string, pageIndex: number): Promise<void>;

  /**
   * Unselect an annotation.
   * @param {string} id - The annotation ID.
   * @returns {Promise<void>}
   */
  unselectAnnotation(id: string): Promise<void>;

  /**
   * Create an annotation.
   * @param {string} type - The annotation type.
   * @param {Object} properties - The annotation properties.
   * @param {number} pageIndex - The page index.
   * @returns {Promise<string>} - The annotation ID.
   */
  createAnnotation(
    type: string,
    properties: any,
    pageIndex: number
  ): Promise<string>;

  /**
   * Modify an annotation.
   * @param {string} id - The annotation ID.
   * @param {Object} properties - The new annotation properties.
   * @returns {Promise<void>}
   */
  modifyAnnotation(id: string, properties: any): Promise<void>;

  /**
   * Remove an annotation.
   * @param {string} id - The annotation ID.
   * @returns {Promise<void>}
   */
  removeAnnotation(id: string): Promise<void>;

  /**
   * Enable annotation creation mode.
   * @param {string} type - The annotation type.
   * @returns {Promise<void>}
   */
  enableAnnotationCreation(type: string): Promise<void>;

  /**
   * Disable annotation creation mode.
   * @returns {Promise<void>}
   */
  disableAnnotationCreation(): Promise<void>;

  /**
   * Show the annotation sidebar.
   * @returns {Promise<void>}
   */
  showAnnotationSidebar(): Promise<void>;

  /**
   * Hide the annotation sidebar.
   * @returns {Promise<void>}
   */
  hideAnnotationSidebar(): Promise<void>;

  /**
   * Get all annotations.
   * @param {number} [pageIndex] - The page index. If not provided, returns annotations for all pages.
   * @returns {Promise<Array<Object>>}
   */
  getAnnotations(pageIndex?: number): Promise<Array<any>>;

  /**
   * Set annotations.
   * @param {Array<Object>} annotations - The annotations to set.
   * @returns {Promise<void>}
   */
  setAnnotations(annotations: Array<any>): Promise<void>;
}
