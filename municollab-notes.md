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

1. **Outbound (PDF.js → Parent)**:

   - Uses `CustomEvent` with `window.parent.dispatchEvent()`
   - One exception uses `window.parent.postMessage()`

2. **Inbound (Parent → PDF.js)**:
   - Uses `window.postMessage()`
   - Handled by message event listener

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
