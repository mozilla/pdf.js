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

declare module "pdfjs-dist" {
  /**
   * Annotation event types.
   */
  export const AnnotationEventType: {
    readonly INITIALIZED: "annotationInitialized";
    readonly LAYER_LOADED: "annotationLayerLoaded";
    readonly SELECTED: "annotationSelected";
    readonly UNSELECTED: "annotationUnselected";
    readonly CREATED: "annotationCreated";
    readonly MODIFIED: "annotationModified";
    readonly REMOVED: "annotationRemoved";
    readonly SAVED: "annotationsSaved";
    readonly LOADED: "annotationsLoaded";
    readonly SIDEBAR_TOGGLED: "annotationSidebarToggled";
    readonly CREATION_MODE_CHANGED: "annotationCreationModeChanged";
  };

  /**
   * Base interface for annotation event data.
   */
  export interface BaseAnnotationEventData {
    timestamp: number;
  }

  /**
   * Interface for annotation identifier data.
   */
  export interface AnnotationIdentifierData extends BaseAnnotationEventData {
    id: string;
    pageIndex: number;
  }

  /**
   * Interface for annotation content data.
   */
  export interface AnnotationContentData extends AnnotationIdentifierData {
    type: string;
    properties: any;
    serialized: any;
  }

  /**
   * Interface for annotation batch data.
   */
  export interface AnnotationBatchData extends BaseAnnotationEventData {
    annotations: Array<AnnotationContentData>;
  }

  /**
   * Interface for annotation creation mode data.
   */
  export interface AnnotationCreationModeData extends BaseAnnotationEventData {
    mode: string | null; // null means disabled
  }

  /**
   * Interface for annotation sidebar data.
   */
  export interface AnnotationSidebarData extends BaseAnnotationEventData {
    visible: boolean;
  }

  /**
   * Manages annotation events and operations.
   */
  export interface AnnotationEventManager {
    /**
     * Register an event listener.
     * @param eventName - The event name.
     * @param callback - The callback function.
     */
    on(eventName: string, callback: Function): void;

    /**
     * Unregister an event listener.
     * @param eventName - The event name.
     * @param callback - The callback function.
     */
    off(eventName: string, callback: Function): void;

    /**
     * Select an annotation.
     * @param id - The annotation ID.
     * @param pageIndex - The page index.
     * @returns A promise that resolves when the annotation is selected.
     */
    selectAnnotation(id: string, pageIndex: number): Promise<void>;

    /**
     * Unselect an annotation.
     * @param id - The annotation ID.
     * @returns A promise that resolves when the annotation is unselected.
     */
    unselectAnnotation(id: string): Promise<void>;

    /**
     * Create an annotation.
     * @param type - The annotation type.
     * @param properties - The annotation properties.
     * @param pageIndex - The page index.
     * @returns A promise that resolves with the annotation ID.
     */
    createAnnotation(
      type: string,
      properties: any,
      pageIndex: number
    ): Promise<string>;

    /**
     * Modify an annotation.
     * @param id - The annotation ID.
     * @param properties - The new annotation properties.
     * @returns A promise that resolves when the annotation is modified.
     */
    modifyAnnotation(id: string, properties: any): Promise<void>;

    /**
     * Remove an annotation.
     * @param id - The annotation ID.
     * @returns A promise that resolves when the annotation is removed.
     */
    removeAnnotation(id: string): Promise<void>;

    /**
     * Enable annotation creation mode.
     * @param type - The annotation type.
     * @returns A promise that resolves when the mode is enabled.
     */
    enableAnnotationCreation(type: string): Promise<void>;

    /**
     * Disable annotation creation mode.
     * @returns A promise that resolves when the mode is disabled.
     */
    disableAnnotationCreation(): Promise<void>;

    /**
     * Show the annotation sidebar.
     * @returns A promise that resolves when the sidebar is shown.
     */
    showAnnotationSidebar(): Promise<void>;

    /**
     * Hide the annotation sidebar.
     * @returns A promise that resolves when the sidebar is hidden.
     */
    hideAnnotationSidebar(): Promise<void>;

    /**
     * Get all annotations.
     * @param pageIndex - The page index. If not provided, returns annotations for all pages.
     * @returns A promise that resolves with the annotations.
     */
    getAnnotations(pageIndex?: number): Promise<Array<any>>;

    /**
     * Set annotations.
     * @param annotations - The annotations to set.
     * @returns A promise that resolves when the annotations are set.
     */
    setAnnotations(annotations: Array<any>): Promise<void>;
  }

  /**
   * Extended PDFDocumentProxy interface with annotation event manager.
   */
  export interface PDFDocumentProxy {
    /**
     * The annotation event manager.
     */
    annotationEventManager: AnnotationEventManager;
  }

  /**
   * Extended PDFPageProxy interface with annotation methods.
   */
  export interface PDFPageProxy {
    /**
     * Create an annotation on this page.
     * @param type - The annotation type.
     * @param properties - The annotation properties.
     * @returns A promise that resolves with the annotation ID.
     */
    createAnnotation(type: string, properties: any): Promise<string>;

    /**
     * Select an annotation on this page.
     * @param id - The annotation ID.
     * @returns A promise that resolves when the annotation is selected.
     */
    selectAnnotation(id: string): Promise<void>;
  }
}
