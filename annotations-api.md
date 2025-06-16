# PDF.js Annotations API Extension Proposal

## Current State Assessment

### Existing API Capabilities

The current PDF.js API provides limited functionality for working with annotations:

1. **AnnotationStorage**: Available via `PDFDocumentProxy.annotationStorage`, primarily designed for form fields.
2. **getAnnotations()**: Method on `PDFPageProxy` to retrieve annotations for a specific page.
3. **Render Parameters**: Annotation rendering can be controlled via `annotationMode` parameter in the `render()` method.

### Current Custom Event Implementation

MuniCollab has implemented a custom event-based system for annotation interaction:

1. **Outbound Events (PDF.js → Parent)**:

   - `pdfjs-annotations-viewer`: Sends all serialized annotations
   - `pdfjs-annotations-viewer-save-annotation`: Saves individual annotation data
   - `pdfjs-annotations-viewer-select`: Notifies when an annotation is selected
   - `pdfjs-annotations-viewer-unselect`: Notifies when an annotation is unselected
   - `pdfjs-annotations-viewer-annotation-layer-loaded`: Signals annotation layer loaded
   - `pdfjs-annotations-viewer-annotations-sidebar`: Requests to show annotations sidebar
   - `pdfjs-annotations-viewer-initialized`: Signals PDF.js initialization
   - `pdfjs-annotations-viewer` with `save-annotations` event: Saves all annotations

2. **Inbound Events (Parent → PDF.js)**:
   - `pdfjs-annotations-app-modified`: Updates modified annotations
   - `pdfjs-annotations-app`: Adds or removes annotations
   - `pdfjs-annotations-app-select`: Selects an annotation
   - `pdfjs-annotations-app-unselect`: Unselects an annotation
   - `pdfjs-annotations-app-create`: Switches to ink creation mode
   - `pdfjs-annotations-app-remove-draft`: Removes unsaved annotations
   - `pdfjs-annotations-app-sidebar-initialize`: Shows annotations sidebar button
   - `pdfjs-annotations-app-can-modify`: Enables ink and free text tools

### Limitations of Current Approach

1. **Non-Standard**: Uses custom events not part of the official API
2. **Security Concerns**: Uses wildcard origin (`*`) in postMessage calls
3. **Maintenance Burden**: Custom code must be maintained separately from upstream
4. **Synchronization Complexity**: Relies on interval-based synchronization
5. **No Type Safety**: Lacks TypeScript definitions for event data structures
6. **Limited Error Handling**: No standardized error reporting mechanism

## Proposed API Extension

### Core Design Principles

1. **Event-Based Architecture**: Maintain the event-driven approach but formalize it
2. **Bidirectional Communication**: Support both reading and writing annotations
3. **Type Safety**: Provide TypeScript definitions for all interfaces
4. **Backward Compatibility**: Allow gradual migration from custom events
5. **Performance Optimization**: Reduce reliance on polling/intervals
6. **Security Improvements**: Add origin validation and proper error handling

### New API Components

#### 1. AnnotationEventManager

A new class to manage annotation events, accessible via `PDFDocumentProxy.annotationEventManager`.

```typescript
interface AnnotationEventManager {
  // Event registration
  on(eventName: string, callback: Function): void;
  off(eventName: string, callback: Function): void;

  // Annotation operations
  selectAnnotation(id: string, pageIndex: number): Promise<void>;
  unselectAnnotation(id: string): Promise<void>;
  createAnnotation(
    type: string,
    properties: any,
    pageIndex: number
  ): Promise<string>;
  modifyAnnotation(id: string, properties: any): Promise<void>;
  removeAnnotation(id: string): Promise<void>;

  // Mode control
  enableAnnotationCreation(type: string): Promise<void>;
  disableAnnotationCreation(): Promise<void>;

  // UI control
  showAnnotationSidebar(): Promise<void>;
  hideAnnotationSidebar(): Promise<void>;

  // Batch operations
  getAnnotations(pageIndex?: number): Promise<Array<any>>;
  setAnnotations(annotations: Array<any>): Promise<void>;
}
```

#### 2. AnnotationEvents Enumeration

```typescript
enum AnnotationEventType {
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
```

#### 3. AnnotationEventData Interfaces

```typescript
interface BaseAnnotationEventData {
  timestamp: number;
}

interface AnnotationIdentifierData extends BaseAnnotationEventData {
  id: string;
  pageIndex: number;
}

interface AnnotationContentData extends AnnotationIdentifierData {
  type: string;
  properties: any;
  serialized: any;
}

interface AnnotationBatchData extends BaseAnnotationEventData {
  annotations: Array<AnnotationContentData>;
}

interface AnnotationCreationModeData extends BaseAnnotationEventData {
  mode: string | null; // null means disabled
}

interface AnnotationSidebarData extends BaseAnnotationEventData {
  visible: boolean;
}
```

#### 4. Extension to PDFDocumentProxy

```typescript
interface PDFDocumentProxy {
  // Existing properties...

  // New property
  annotationEventManager: AnnotationEventManager;
}
```

#### 5. Extension to PDFPageProxy

```typescript
interface PDFPageProxy {
  // Existing methods...

  // Enhanced methods
  getAnnotations(params?: GetAnnotationsParameters): Promise<Array<any>>;

  // New methods
  createAnnotation(type: string, properties: any): Promise<string>;
  selectAnnotation(id: string): Promise<void>;
}
```

### Implementation Details

#### 1. Core Implementation in PDFDocumentProxy

```javascript
// In src/display/api.js

class PDFDocumentProxy {
  // Existing code...

  constructor(pdfInfo, transport) {
    // Existing initialization...

    // Initialize the annotation event manager
    this._annotationEventManager = new AnnotationEventManager(this, transport);
  }

  get annotationEventManager() {
    return this._annotationEventManager;
  }
}
```

#### 2. AnnotationEventManager Implementation

```javascript
// New file: src/display/annotation_event_manager.js

class AnnotationEventManager {
  constructor(pdfDocument, transport) {
    this._document = pdfDocument;
    this._transport = transport;
    this._eventListeners = new Map();
    this._setupMessageHandler();
  }

  _setupMessageHandler() {
    // Set up internal event handling
    this._transport.messageHandler.on("AnnotationEvent", data => {
      const { type, detail } = data;
      this._dispatchEvent(type, detail);
    });
  }

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

  on(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName).push(callback);
  }

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

  // Implementation of other methods...
  selectAnnotation(id, pageIndex) {
    return this._transport.messageHandler.sendWithPromise("SelectAnnotation", {
      id,
      pageIndex,
    });
  }

  // Other methods follow similar pattern...
}
```

#### 3. Worker-Side Implementation

```javascript
// In worker code (pdf.worker.js)

// Add handlers for annotation events
class WorkerMessageHandler {
  // Existing code...

  _setupAnnotationEventHandlers() {
    // Handle annotation selection
    this.on("SelectAnnotation", (data, sink) => {
      const { id, pageIndex } = data;

      // Implementation to select annotation
      // ...

      // Notify about the selection
      this.send("AnnotationEvent", {
        type: "annotationSelected",
        detail: {
          id,
          pageIndex,
          timestamp: Date.now(),
          // Additional data...
        },
      });

      sink.resolve();
    });

    // Similar handlers for other annotation operations
  }
}
```

#### 4. Integration with Existing Annotation Editors

```javascript
// In src/display/editor/editor.js

class AnnotationEditor {
  // Existing code...

  select() {
    // Existing selection code...

    // Add notification through the official API
    if (this._uiManager._eventBus) {
      this._uiManager._eventBus.dispatch("annotationselected", {
        source: this,
        id: this.uniqueId,
        pageIndex: this.pageIndex,
      });
    }

    // Keep existing custom event for backward compatibility
    const customEvent = new CustomEvent("pdfjs-annotations-viewer-select", {
      detail: {
        uniqueId: this.uniqueId,
        annotation: this.serialize(),
      },
    });
    window.parent.dispatchEvent(customEvent);
  }

  // Similar modifications for other methods...
}
```

#### 5. EventBus Integration

```javascript
// In src/display/api.js

// Modify the PDFDocumentLoadingTask to pass the eventBus to the worker
class PDFDocumentLoadingTask {
  // Existing code...

  _onProgress(progressParams) {
    // Existing code...

    // Forward annotation events from the eventBus to the AnnotationEventManager
    this.eventBus.on("annotationselected", event => {
      const { id, pageIndex } = event;
      this._transport.messageHandler.send("AnnotationEvent", {
        type: "annotationSelected",
        detail: {
          id,
          pageIndex,
          timestamp: Date.now(),
        },
      });
    });

    // Similar handlers for other annotation events
  }
}
```

### Migration Path

#### Phase 1: Add Official API Alongside Custom Events

1. Implement the `AnnotationEventManager` class
2. Add event dispatching to existing annotation code
3. Keep custom events for backward compatibility
4. Document the new API and provide examples

#### Phase 2: Encourage Migration to Official API

1. Mark custom events as deprecated
2. Provide migration guides and tools
3. Add warnings when custom events are used
4. Showcase performance benefits of the official API

#### Phase 3: Complete Transition

1. Make custom events optional via configuration
2. Remove custom event code from main codebase
3. Provide a separate compatibility layer for legacy support

### Backward Compatibility Considerations

1. **Event Naming**: Ensure new event names don't conflict with existing ones
2. **Data Structures**: Maintain compatibility with existing annotation data formats
3. **Configuration Options**: Allow disabling new API features if needed
4. **Polyfill Support**: Provide fallbacks for older browsers
5. **Documentation**: Clearly document migration paths and breaking changes

## Security Considerations

### Origin Validation

Replace wildcard origins with proper validation:

```javascript
// Before
window.parent.postMessage(data, "*");

// After
const targetOrigin =
  this._transport.loadingParams.docBaseUrl || window.location.origin;
window.parent.postMessage(data, targetOrigin);
```

### Data Validation

Add schema validation for annotation data:

```javascript
function validateAnnotationData(data, schema) {
  // Implementation of schema validation
  // ...

  if (!valid) {
    throw new Error(`Invalid annotation data: ${errors.join(", ")}`);
  }

  return data;
}
```

### Error Handling

Improve error reporting and handling:

```javascript
try {
  // Annotation operation
} catch (error) {
  this._dispatchEvent("annotationError", {
    operation: "select",
    id,
    pageIndex,
    error: error.message,
    timestamp: Date.now(),
  });
  throw error;
}
```

## Performance Optimizations

### Reduce Polling

Replace interval-based checking with event-driven updates:

```javascript
// Before
setInterval(() => {
  syncAnnotationsWithState();
}, 250);

// After
this.annotationEventManager.on("annotationModified", () => {
  syncAnnotationsWithState();
});
```

### Batch Operations

Add support for batch operations to reduce overhead:

```javascript
// Instead of multiple individual updates
for (const annotation of annotations) {
  this.modifyAnnotation(annotation.id, annotation.properties);
}

// Use batch operation
this.setAnnotations(annotations);
```

### Lazy Loading

Implement lazy loading for annotation data:

```javascript
getAnnotations(pageIndex) {
  if (this._cachedAnnotations.has(pageIndex)) {
    return Promise.resolve(this._cachedAnnotations.get(pageIndex));
  }

  return this._transport.messageHandler.sendWithPromise("GetAnnotations", {
    pageIndex
  }).then(annotations => {
    this._cachedAnnotations.set(pageIndex, annotations);
    return annotations;
  });
}
```

## Example Usage

### Basic Event Listening

```javascript
const loadingTask = pdfjsLib.getDocument("document.pdf");
loadingTask.promise.then(pdfDocument => {
  // Listen for annotation selection events
  pdfDocument.annotationEventManager.on(
    pdfjsLib.AnnotationEventType.SELECTED,
    data => {
      console.log("Annotation selected:", data.id, "on page", data.pageIndex);
    }
  );

  // Listen for annotation modification events
  pdfDocument.annotationEventManager.on(
    pdfjsLib.AnnotationEventType.MODIFIED,
    data => {
      console.log(
        "Annotation modified:",
        data.id,
        "with properties",
        data.properties
      );
    }
  );
});
```

### Annotation Creation

```javascript
pdfDocument.getPage(1).then(page => {
  // Create a new ink annotation
  page
    .createAnnotation("ink", {
      color: "#FF0000",
      thickness: 2,
      paths: [
        [
          [10, 10],
          [20, 20],
          [30, 10],
        ],
      ],
    })
    .then(id => {
      console.log("Created annotation with ID:", id);

      // Select the newly created annotation
      page.selectAnnotation(id);
    });
});
```

### Batch Operations

```javascript
// Get all annotations
pdfDocument.annotationEventManager.getAnnotations().then(annotations => {
  // Modify some property for all annotations
  const updatedAnnotations = annotations.map(annotation => ({
    ...annotation,
    properties: {
      ...annotation.properties,
      opacity: 0.8,
    },
  }));

  // Update all annotations in one operation
  pdfDocument.annotationEventManager.setAnnotations(updatedAnnotations);
});
```

## Conclusion

Extending the PDF.js API to include comprehensive annotation event handling would significantly improve the developer experience and enable more robust integrations. By formalizing the event system, providing type safety, and optimizing performance, this proposal aims to address the limitations of the current custom event approach while maintaining backward compatibility.

The proposed API extension follows the existing patterns in PDF.js, making it intuitive for developers already familiar with the library. It also addresses security concerns and provides a clear migration path for existing implementations.

This approach would benefit both MuniCollab's specific use case and the broader PDF.js community by providing a standardized way to interact with PDF annotations.
