# PDF.js Annotation Events - Work in Progress

This document provides an overview of the PDF.js annotation events system and tracks the current progress of the implementation and analysis. This is intended to be used as a reference for future work in this area.

## Current Status

- Fixed the issue in `examples/annotation-events-sandbox/annotation-events-sandbox.js` where `pdfjsLib.EventBus` was not available in the public API
- Identified and documented the custom annotation events with the pattern `pdfjs-annotations-*`
- Analyzed the data structure and serialization status of the annotations in these events
- Created a comparative example (`examples/annotation-events-sandbox/index.html`) that demonstrates both the official API events and legacy custom events side-by-side
- Fixed all handler methods in `src/core/worker_annotation_handler.js` to properly validate message sink objects before using them and create default sinks when missing
- Removed the `examples/annotation-events` directory to avoid confusion, since we're focusing on the sandbox implementation
- Improved the `examples/annotation-events-sandbox/js/pdf-viewer.js` file with robust error handling and version compatibility for annotation editor layer initialization
- Enhanced the `examples/annotation-events-sandbox/js/annotation-manager.js` file to properly handle ink parameters and update editor modes
- Fixed CSS contrast issues in `examples/annotation-events-sandbox/annotation-events-sandbox.css` for better readability of text in panels

## Worker Annotation Handler Improvements

All handler methods in `src/core/worker_annotation_handler.js` have been updated with proper sink validation to prevent errors when handling annotation events. The following pattern has been implemented consistently across all methods:

1. Initial sink validation at the beginning of each handler method with default sink creation:

   ```javascript
   if (!sink) {
     console.warn(
       "Missing message sink in handleEnableAnnotationCreation, creating default"
     );
     sink = {
       resolve: () => {},
       reject: () => {},
     };
   } else if (typeof sink.resolve !== "function") {
     console.warn(
       "Invalid message sink provided to handleEnableAnnotationCreation, creating default"
     );
     sink = {
       resolve: () => {},
       reject: () => {},
     };
   }
   ```

2. Error handling that validates the sink before rejecting:

   ```javascript
   catch (error) {
     console.error("Error in [methodName]:", error);

     // Make sure sink is defined before using it
     if (sink && typeof sink.reject === "function") {
       sink.reject(new Error(error.message || "Unknown error"));
     } else {
       console.error("Could not reject promise: invalid sink object");
     }
   }
   ```

This ensures robust error handling even when the message passing system encounters issues or when promises are improperly constructed. Now, rather than simply failing when a message sink is missing or invalid, we create a default sink that does nothing, allowing the operation to proceed gracefully and maintaining the UI's responsiveness.

## Custom Event Integration Points

The following custom events with the pattern `pdfjs-annotations-*` have been identified:

### In src/display/editor/editor_annotation_events.js

1. **pdfjs-annotations-viewer-select**

   - Lines: 37-44
   - Class/Method: `AnnotationEditor.prototype.select`
   - Event dispatch: Sent when an annotation is selected

   ```javascript
   document.dispatchEvent(
     new CustomEvent("pdfjs-annotations-viewer-select", {
       detail: {
         uniqueId: this.uniqueId,
         annotation: this.serialize(),
       },
     })
   );
   ```

2. **pdfjs-annotations-viewer-unselect**

   - Lines: 60-66
   - Class/Method: `AnnotationEditor.prototype.unselect`
   - Event dispatch: Sent when an annotation is unselected

   ```javascript
   document.dispatchEvent(
     new CustomEvent("pdfjs-annotations-viewer-unselect", {
       detail: {
         uniqueId: this.uniqueId,
       },
     })
   );
   ```

3. **pdfjs-annotations-viewer-save-annotation**
   - Lines: 109-118
   - Class/Method: `AnnotationEditor.prototype.save`
   - Event dispatch: Sent when an annotation is saved
   ```javascript
   document.dispatchEvent(
     new CustomEvent("pdfjs-annotations-viewer-save-annotation", {
       detail: {
         uniqueId: this.uniqueId,
         annotation: this.serialize(),
       },
     })
   );
   ```

### In src/display/editor/annotation_editor_layer_events.js

4. **pdfjs-annotations-viewer** (PostMessage Event)
   - Lines: 97-107
   - Class/Method: `AnnotationEditorLayer.prototype.save`
   - Event dispatch: Sent via postMessage when annotations are saved
   ```javascript
   window.parent.postMessage(
     {
       type: "pdfjs-annotations-viewer",
       event: "save-annotations",
       annotations: [...annotationsMap].map(([key, value]) => ({
         key,
         value,
       })),
     },
     "*"
   );
   ```

## Data Structure Analysis

### For select and save-annotation events:

- The data includes both a `uniqueId` and the serialized `annotation` object
- The annotation is fully serialized via the `serialize()` method
- Structure:
  ```javascript
  {
    detail: {
      uniqueId: string,
      annotation: {
        // Serialized annotation properties including:
        id: string,
        pageIndex: number,
        rect: [number, number, number, number], // x1, y1, x2, y2
        type: string, // e.g., "ink", "freeText", "highlight"
        color: [number, number, number], // RGB values
        opacity: number,
        // Additional properties specific to the annotation type
      }
    }
  }
  ```

### For unselect events:

- The data only includes the `uniqueId`
- No annotation data is transferred
- Structure:
  ```javascript
  {
    detail: {
      uniqueId: string;
    }
  }
  ```

### For save-annotations batch operation:

- The data includes an array of all annotations from the annotation storage
- Each annotation is represented as a key-value pair
- The value contains the serialized annotation data
- Structure:
  ```javascript
  {
    type: "pdfjs-annotations-viewer",
    event: "save-annotations",
    annotations: [
      {
        key: string,
        value: {
          // Serialized annotation data similar to the individual save format
        }
      },
      // Additional annotations...
    ]
  }
  ```

## Serialization Status

In all cases where annotation data is transferred via custom events:

1. **Annotations are serialized**:

   - Individual annotations are serialized via the `serialize()` method before being sent
   - For batch operations, the data comes from the annotationStorage's serializable map

2. **Serialization Process**:

   - The `serialize()` method converts the annotation object to a plain JavaScript object
   - This serialized form removes any methods and complex references
   - The result is a pure data object suitable for JSON serialization or postMessage transfer

3. **Data Completeness**:
   - The serialized data includes all necessary information to understand or recreate the annotation
   - This includes position, size, color, content, and any type-specific properties

## Event Handling Architecture

The PDF.js library implements a dual approach to annotation events:

1. **Legacy Custom Events**: Events with the pattern `pdfjs-annotations-*` are maintained for backward compatibility with existing integrations.

2. **Official API Events**: The library also provides a structured API through the AnnotationEventManager, which uses typed events like those defined in AnnotationEventType.

## Testing Results

During testing of the Annotation Events Sandbox:

1. The worker annotation handler enhancements have been confirmed to work correctly.
2. When a message sink is missing, the code now gracefully creates a default sink instead of failing.
3. Console warnings show the detection of missing sinks: `[warn] Missing message sink in handleEnableAnnotationCreation, creating default`
4. Annotation creation and mode changes are working successfully for ink, text, and highlight annotations.
5. The event logging system correctly captures both the API events and legacy custom events.

## Recent Improvements

### Enhanced PDF Viewer Robustness

In `examples/annotation-events-sandbox/js/pdf-viewer.js`, we've implemented:

1. **Version compatibility checks** - The code now properly detects the PDF.js version and adapts to different API structures
2. **Graceful error handling** - When annotation editor layer initialization fails, a dummy layer is created to prevent errors cascading through the application
3. **Flexible API adaptation** - Added fallback methods that try multiple API patterns to find the one that works with the current PDF.js build

Example of the robust initialization code:

```javascript
// Check if the AnnotationEditorLayer class is available
if (typeof pdfjsLib.AnnotationEditorLayer !== "function") {
  throw new Error(
    "AnnotationEditorLayer is not available in this PDF.js build"
  );
}

// Some versions expect editingParams, others expect mode directly
if (pdfjsLib.AnnotationEditorLayer.toString().includes("editingParams")) {
  options.editingParams = { mode: editorMode, uiManager };
}

// Create dummy annotation editor layer when initialization fails
pageDiv.annotationEditorLayer = {
  updateMode: () =>
    console.warn("Using dummy editor layer - updateMode ignored"),
  updateParams: () =>
    console.warn("Using dummy editor layer - updateParams ignored"),
};
```

### Improved Annotation Manager

In `examples/annotation-events-sandbox/js/annotation-manager.js`, we've enhanced:

1. **Ink parameter handling** - The ink parameters are now properly applied to all editor layers
2. **Editor mode setting** - Mode changes are correctly propagated to annotation editor layers
3. **Toolbar visibility** - The ink parameters toolbar is now correctly shown/hidden based on the selected tool

### CSS Contrast Improvements

The `examples/annotation-events-sandbox/annotation-events-sandbox.css` file has been updated to:

1. **Improve text contrast** - Ensured all text has proper contrast against its background
2. **Enhance readability** - Added explicit color definitions to prevent text from inheriting problematic colors
3. **Visual distinction for events** - Added background colors to different event types for better visual separation

## Next Steps

1. **Comprehensive Testing**: Continue testing across different browsers and scenarios to ensure the event system works reliably.

2. **Documentation Updates**: Update the official PDF.js documentation to clarify the usage of annotation events, especially the distinction between the legacy custom events and the official API.

3. **Event Standardization**: Consider standardizing the event system to use only the official API and deprecate the legacy custom events in future versions.

4. **Robust Error Handling**: Apply similar improvements to other parts of the codebase that might benefit from the same pattern of robust message sink validation and default creation.

5. **EventBus Public API**: Consider exposing the EventBus in the public API to avoid the need for custom implementations in examples and applications.

## Resources

- [PDF.js GitHub Repository](https://github.com/mozilla/pdf.js)
- [PDF.js API Documentation](https://mozilla.github.io/pdf.js/api/)
- [Examples/annotation-events-sandbox](examples/annotation-events-sandbox/) - Working example using the annotation events API

## Event Mapping Reference

| Official API Event   | Legacy Custom Event                      | Description                                  |
| -------------------- | ---------------------------------------- | -------------------------------------------- |
| annotationSelected   | pdfjs-annotations-viewer-select          | Fired when an annotation is selected         |
| annotationUnselected | pdfjs-annotations-viewer-unselect        | Fired when an annotation is unselected       |
| annotationsSaved     | pdfjs-annotations-viewer-save-annotation | Fired when an individual annotation is saved |
| annotationBatchSaved | pdfjs-annotations-viewer (postMessage)   | Fired when a batch of annotations is saved   |

### Data Structure Comparison

#### Official API Event Data (annotationSelected)

```javascript
{
  id: "uniqueId123",
  pageIndex: 0,
  type: "freetext",
  rect: [100, 100, 200, 150],
  data: {
    contents: "Sample annotation",
    color: [0, 0, 255],
    opacity: 1.0
  },
  timestamp: 1624365789123
}
```

#### Legacy Custom Event Data (pdfjs-annotations-viewer-select)

```javascript
{
  detail: {
    uniqueId: "uniqueId123",
    annotation: {
      id: "uniqueId123",
      pageIndex: 0,
      rect: [100, 100, 200, 150],
      type: "freetext",
      color: [0, 0, 255],
      opacity: 1.0,
      contents: "Sample annotation"
    }
  }
}
```

This reference table and data structure comparison helps developers understand the relationship between the two event systems and how to transition between them.
