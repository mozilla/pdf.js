# MuniCollab PDF.js Custom Events Analysis

## Overview

This document contains the analysis of custom events in the PDF.js codebase that follow the pattern `pdfjs-annotations-*`. These events facilitate communication between the PDF.js viewer and the parent application (React app).

## Custom Event Dispatches

### 1. pdfjs-annotations-viewer

- **File**: `web/viewer.html`
- **Line**: ~1089
- **Function**: `sendAnnotationsToParent()`
- **Purpose**: Sends serialized annotations from annotationStorage to parent window
- **Data Shape**:

```javascript
{
  detail: {
    annotations: Array<{
      key: string,
      value: Object // Serialized annotation data
    }>
  }
}
```

- **Serialization**: Yes, annotations are serialized from `annotationStorage.serializable.map`

### 2. pdfjs-annotations-viewer-save-annotation

- **File**: `src/display/editor/editor.js`
- **Line**: 520
- **Class/Method**: `AnnotationEditor.save()`
- **Purpose**: Saves individual annotation data to parent
- **Data Shape**:

```javascript
{
  detail: {
    uniqueId: string,
    annotation: Object // Result of this.serialize()
  }
}
```

- **Serialization**: Yes, uses `this.serialize()` method

### 3. pdfjs-annotations-viewer-select

- **File**: `src/display/editor/editor.js`
- **Lines**: 408, 1802
- **Class/Methods**:
  - `AnnotationEditor.focusout()` (line 408)
  - `AnnotationEditor.select()` (line 1802)
- **Purpose**: Notifies parent when an annotation is selected
- **Data Shape**:

```javascript
{
  detail: {
    uniqueId: string,
    annotation: Object // Result of this.serialize()
  }
}
```

- **Serialization**: Yes, uses `this.serialize()` method

### 4. pdfjs-annotations-viewer-unselect

- **File**: `src/display/editor/editor.js`
- **Line**: 1851
- **Class/Method**: `AnnotationEditor.unselect()`
- **Purpose**: Notifies parent when an annotation is unselected
- **Data Shape**:

```javascript
{
  detail: {
    uniqueId: string;
  }
}
```

- **Serialization**: No, only passes the uniqueId

### 5. pdfjs-annotations-viewer-annotation-layer-loaded

- **File**: `web/viewer.html`
- **Line**: ~1161
- **Function**: `syncAnnotationsWithState()`
- **Purpose**: Signals that annotation layer has been loaded/synced
- **Data Shape**: No data payload (empty event)

### 6. pdfjs-annotations-viewer-annotations-sidebar

- **File**: `web/viewer.html`
- **Line**: ~1329
- **Location**: Click event listener for '#annotations-sidebar' button
- **Purpose**: Requests parent to show annotations sidebar
- **Data Shape**: No data payload (empty event)

### 7. pdfjs-annotations-viewer-initialized

- **File**: `web/viewer.html`
- **Line**: ~1366
- **Function**: `window.onPDFjsInitialized`
- **Purpose**: Signals that PDF.js has been initialized
- **Data Shape**: No data payload (empty event)

### 8. pdfjs-annotations-viewer (save-annotations)

- **File**: `src/display/editor/annotation_editor_layer.js`
- **Line**: 638
- **Class/Method**: `AnnotationEditorLayer.save()`
- **Purpose**: Saves all annotations from the layer
- **Data Shape**:

```javascript
{
  type: 'pdfjs-annotations-viewer',
  event: 'save-annotations',
  annotations: Array<{
    key: string,
    value: Object // Serialized annotation
  }>
}
```

- **Note**: Uses `window.parent.postMessage()` instead of CustomEvent
- **Serialization**: Yes, from `annotationStorage.serializable.map`

## Event Listeners

### Message Event Listener

- **File**: `web/viewer.html`
- **Line**: ~1254
- **Purpose**: Handles incoming messages from parent application
- **Listens for**:
  1. `pdfjs-annotations-app-modified`
  2. `pdfjs-annotations-app`
  3. `pdfjs-annotations-app-select`
  4. `pdfjs-annotations-app-unselect`
  5. `pdfjs-annotations-app-create`
  6. `pdfjs-annotations-app-remove-draft`
  7. `pdfjs-annotations-app-sidebar-initialize`
  8. `pdfjs-annotations-app-can-modify`

### Expected Data Shapes for Incoming Messages

#### 1. pdfjs-annotations-app-modified & pdfjs-annotations-app

```javascript
{
  type: string,
  annotations: Array<SerializedAnnotation>
}
```

- **Handler Functions**:
  - `handleModifiedAnnotations()` (line ~1188)
  - `handleAddedOrRemovedAnnotations()` (line ~1164)

#### 2. pdfjs-annotations-app-select

```javascript
{
  type: string,
  uniqueId: string,
  pageIndex: number
}
```

- **Handler Function**: `handleSelectAnnotation()` (line ~1225)

#### 3. pdfjs-annotations-app-unselect

```javascript
{
  type: string,
  uniqueId: string  // Note: uniqueId not used in handler
}
```

- **Handler Function**: `handleUnselectAnnotation()` (line ~1245)

#### 4. pdfjs-annotations-app-remove-draft

```javascript
{
  type: string,
  uniqueId: string,
  pageIndex: number
}
```

- **Handler Function**: `handleRemoveDraftAnnotation()` (line ~1251)

#### 5. pdfjs-annotations-app-create

```javascript
{
  type: string;
  // No additional data required
}
```

- **Handler Function**: `handleSwitchToInk()` (line ~1240)

#### 6. pdfjs-annotations-app-sidebar-initialize

```javascript
{
  type: string;
  // No additional data required
}
```

- **Effect**: Shows the annotations sidebar button

#### 7. pdfjs-annotations-app-can-modify

```javascript
{
  type: string;
  // No additional data required
}
```

- **Effect**: Makes ink and free text editor buttons visible

## Key Implementation Details

### State Management

The system maintains an `annotationsState` array that tracks:

```javascript
{
  annotation: any,
  isLoaded: boolean,
  shouldRemove?: boolean,
  shouldModify?: boolean,
  commitRemove?: boolean
}
```

### Unique Identifier Generation

- **Method**: `AnnotationEditor.generateUniqueId()`
- **Format**: `"annotation_" + Math.random().toString(36).substr(2, 9)`
- **Usage**: All annotations are tracked using this uniqueId

### Synchronization Process

1. **Interval-based sync**: Runs every 250ms via `syncAnnotationsWithState()`
2. **Pending selection check**: Runs every 125ms to handle deferred selections
3. **Event-driven updates**: Responds to PDF viewer area updates

### Communication Architecture

#### 1. Overview

The communication between PDF.js and the parent application uses a hybrid approach combining CustomEvents and postMessage API for cross-frame communication.

#### 2. Outbound Communication (PDF.js → Parent)

**Primary Method: CustomEvent**

- Most events use `CustomEvent` with `window.parent.dispatchEvent()`
- Events are dispatched directly to the parent window's event system
- Example:

```javascript
const customEvent = new CustomEvent("pdfjs-annotations-viewer-select", {
  detail: {
    uniqueId: this.uniqueId,
    annotation: this.serialize(),
  },
});
window.parent.dispatchEvent(customEvent);
```

**Secondary Method: postMessage**

- Used in `AnnotationEditorLayer.save()` for bulk annotation saves
- Example:

```javascript
window.parent.postMessage(
  {
    type: "pdfjs-annotations-viewer",
    event: "save-annotations",
    annotations,
  },
  "*"
);
```

#### 3. Inbound Communication (Parent → PDF.js)

**Method: postMessage**

- All incoming messages use `window.postMessage()`
- Single message event listener handles all message types
- Message routing based on `event.data.type` property

#### 4. Component Access Pattern

The system uses a helper function to access PDF.js components:

```javascript
function getPDFjsComponents() {
  const pdfViewerProxy = window.PDFViewerApplication;
  const pdfViewer = pdfViewerProxy.pdfViewer;
  const annotationEditorUIManager =
    pdfViewer?._layerProperties?.annotationEditorUIManager;
  const annotationStorage = pdfViewerProxy.pdfDocument.annotationStorage;

  return {
    pdfViewerProxy,
    pdfViewer,
    annotationEditorUIManager,
    annotationStorage,
  };
}
```

#### 5. Event Flow Sequence

**Annotation Creation Flow:**

1. User creates annotation in PDF.js
2. Editor dispatches `pdfjs-annotations-viewer-save-annotation`
3. Parent receives event and updates its state
4. Parent sends `pdfjs-annotations-app` message back
5. PDF.js syncs annotation state

**Annotation Selection Flow:**

1. User selects annotation in parent app
2. Parent sends `pdfjs-annotations-app-select` message
3. PDF.js sets `pendingAnnotationSelect`
4. Selection interval (125ms) checks for pending selections
5. Once annotation is loaded, it's selected and `pendingAnnotationSelect` is cleared

#### 6. Synchronization Mechanisms

**Three-tier synchronization:**

1. **Event-driven**: Immediate response to user actions
2. **Interval-based**: 250ms sync cycle for state consistency
3. **Pending operations**: 125ms cycle for deferred operations

**State Reconciliation:**

- `annotationsState` array maintains truth about annotation status
- Each annotation tracked with flags: `isLoaded`, `shouldRemove`, `shouldModify`
- Sync process handles additions, removals, and modifications

#### 7. Security Considerations

**Current Implementation:**

- Uses wildcard origin (`'*'`) in postMessage calls
- No origin validation in message event listener
- Relies on message type checking for basic validation

**Potential Improvements:**

- Implement origin validation
- Add message authentication
- Validate message payloads against schemas

#### 8. Error Handling

**Timing-based Resilience:**

- Deferred operations via `pendingAnnotationSelect`
- Retry mechanism through interval-based checking
- Graceful handling of missing components

**Missing Error Handling:**

- No explicit error events
- No failure callbacks
- Silent failures possible if components not ready

#### 9. Performance Implications

**Interval-based Operations:**

- 250ms sync interval = 4 updates/second
- 125ms selection interval = 8 checks/second
- Continuous CPU usage even when idle

**Memory Considerations:**

- `annotationsState` array grows with annotations
- No apparent cleanup mechanism for old states
- Potential memory leaks with long sessions

#### 10. Race Condition Management

**Potential Race Conditions:**

1. Multiple rapid selections before previous selection completes
2. Annotation modifications during sync cycles
3. Page navigation during annotation operations

**Mitigation Strategies:**

- Single `pendingAnnotationSelect` prevents multiple selections
- State flags (`shouldModify`, `shouldRemove`) queue operations
- Two-phase removal process prevents premature deletion

#### 11. Browser Compatibility

**APIs Used:**

- `CustomEvent`: Supported in all modern browsers
- `postMessage`: Universal support
- `scrollIntoView`: May have behavior differences

**Polyfills/Fallbacks:**

- None implemented
- Assumes modern browser environment

### Serialization Pattern

- Most annotation data is serialized using the editor's `serialize()` method
- Serialized data includes all properties needed to reconstruct the annotation
- The `annotationStorage.serializable.map` contains the canonical serialized state

## MuniCollab Customizations

Several customizations are marked with `@MuniCollab` comments:

1. Custom unique ID generation for annotations
2. Modified save behavior in focusout events
3. Integration with sidebar functionality
4. Custom event dispatching for annotation selection/deselection
5. Modified annotation layer save functionality

## Notes for Future Development

1. The system relies heavily on timing (intervals) for synchronization
2. Page index is 0-based in the data but 1-based in the DOM
3. Annotation removal is a two-step process (mark for removal, then commit)
4. The viewer can handle both adding new annotations and modifying existing ones
5. Draft annotations (unsaved) can be removed without affecting the storage
