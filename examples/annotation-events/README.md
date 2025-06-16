# PDF.js Annotation Events API Example

This example demonstrates how to use the new Annotation Events API in PDF.js. The API provides a standardized way to interact with PDF annotations, including creating, selecting, modifying, and removing annotations.

## Overview

The example shows how to:

1. Initialize the PDF.js viewer with a PDF document
2. Access the `annotationEventManager` from the `PDFDocumentProxy`
3. Register event listeners for annotation events
4. Perform operations on annotations using the API
5. Display annotation information in a sidebar

## Running the Example

1. Build PDF.js by running `gulp generic` in the project root
2. Open `index.html` in a web browser

## Key Components

### Annotation Event Manager

The `annotationEventManager` is accessed through the `PDFDocumentProxy`:

```javascript
const { annotationEventManager } = pdfDocument;
```

### Event Types

The API provides a set of predefined event types through the `AnnotationEventType` enum:

```javascript
pdfjsLib.AnnotationEventType.SELECTED;
pdfjsLib.AnnotationEventType.UNSELECTED;
pdfjsLib.AnnotationEventType.CREATED;
pdfjsLib.AnnotationEventType.MODIFIED;
pdfjsLib.AnnotationEventType.REMOVED;
// etc.
```

### Event Listening

You can register event listeners using the `on` method:

```javascript
annotationEventManager.on(pdfjsLib.AnnotationEventType.SELECTED, data => {
  console.log(`Annotation selected: ${data.id} on page ${data.pageIndex + 1}`);
  // Handle the selection
});
```

### Annotation Operations

The API provides methods for performing operations on annotations:

```javascript
// Select an annotation
annotationEventManager.selectAnnotation(id, pageIndex);

// Create an annotation
annotationEventManager.createAnnotation(type, properties, pageIndex);

// Modify an annotation
annotationEventManager.modifyAnnotation(id, properties);

// Remove an annotation
annotationEventManager.removeAnnotation(id);
```

### UI Control

The API also provides methods for controlling the annotation UI:

```javascript
// Enable annotation creation mode
annotationEventManager.enableAnnotationCreation(type);

// Disable annotation creation mode
annotationEventManager.disableAnnotationCreation();

// Show the annotation sidebar
annotationEventManager.showAnnotationSidebar();

// Hide the annotation sidebar
annotationEventManager.hideAnnotationSidebar();
```

## Event Data

Each event type provides specific data in the callback:

### Selection Events

```javascript
{
  id: string,         // The annotation ID
  pageIndex: number,  // The page index (0-based)
  timestamp: number   // When the event occurred
}
```

### Creation/Modification Events

```javascript
{
  id: string,         // The annotation ID
  type: string,       // The annotation type
  pageIndex: number,  // The page index (0-based)
  properties: any,    // The annotation properties
  timestamp: number   // When the event occurred
}
```

## Notes

- This example uses the existing custom events for backward compatibility
- The API is designed to work alongside the existing annotation system
- The example demonstrates both the event-driven approach and the method-based approach

## Further Reading

For more details on the Annotation Events API, see the [annotations-api.md](../../annotations-api.md) document.
