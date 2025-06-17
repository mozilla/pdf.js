# PDF.js Annotation Events Example

This example demonstrates how to use the PDF.js annotation events API to create, modify, and interact with annotations in PDF documents. It shows both the official annotation events API and legacy custom events for comparison.

## Overview

The PDF.js annotation events system provides a standardized way to interact with annotations in PDF documents. This example includes:

- A complete viewer with annotation tools
- Real-time event logging
- Support for ink, text, and highlight annotations
- Customization of annotation parameters
- Comparison between official API events and legacy custom events

## How to Use

1. Start your local PDF.js server (run `gulp server` from the project root)
2. Navigate to `http://localhost:8888/examples/annotation-events/index.html`
3. Use the "Choose PDF" button to load a PDF file, or use the default document
4. Use the annotation tools in the toolbar to create annotations
5. Watch the event log on the right to see annotation events as they occur

## Annotation Tools

The example includes the following annotation tools:

- **Ink**: Draw freeform annotations with customizable color, thickness, and opacity
- **Text**: Add text annotations to the document
- **Highlight**: Highlight text in the document
- **Disable**: Turn off annotation creation mode

## Event Types

The example logs the following types of events:

### Official API Events (AnnotationEventType)

- `SELECTED`: Fired when an annotation is selected
- `UNSELECTED`: Fired when an annotation is unselected
- `CREATED`: Fired when a new annotation is created
- `MODIFIED`: Fired when an annotation is modified
- `REMOVED`: Fired when an annotation is removed
- `LAYER_LOADED`: Fired when an annotation layer is loaded
- `SIDEBAR_TOGGLED`: Fired when the annotation sidebar is toggled
- `CREATION_MODE_CHANGED`: Fired when the annotation creation mode changes

### Legacy Custom Events

- `pdfjs-annotations-viewer-select`: Fired when an annotation is selected
- `pdfjs-annotations-viewer-unselect`: Fired when an annotation is unselected
- `pdfjs-annotations-viewer-save-annotation`: Fired when an annotation is saved
- postMessage events with `type: "pdfjs-annotations-viewer"`: Fired for batch operations

## Event Data Structure

The event log shows the complete data structure for each event. Click on an event in the log to expand it and see the full details.

### Official API Event Example (CREATED)

```json
{
  "id": "annotation_123456",
  "type": "ink",
  "pageIndex": 0,
  "properties": {
    "color": [0, 102, 204],
    "thickness": 3,
    "opacity": 1.0,
    "paths": [...]
  }
}
```

### Legacy Custom Event Example (pdfjs-annotations-viewer-select)

```json
{
  "detail": {
    "uniqueId": "annotation_123456",
    "annotation": {
      "type": "ink",
      "color": [0, 102, 204],
      "opacity": 1.0,
      "thickness": 3,
      "paths": [...]
    }
  }
}
```

## Implementation Details

The example demonstrates several important implementation patterns:

1. **Initialization**: How to initialize the annotation system with PDF.js
2. **Event Listening**: How to register for annotation events
3. **Mode Switching**: How to enable and disable annotation creation modes
4. **Parameter Handling**: How to customize annotation properties
5. **Cross-version Compatibility**: How to handle different PDF.js API patterns

## Related Documentation

- [PDF.js API Documentation](https://mozilla.github.io/pdf.js/api/)
- [Annotation Events API Reference](../../src/display/annotation_events.d.ts)
- [Annotation Events Sandbox](../annotation-events-sandbox/): A more comprehensive testing environment

## Browser Compatibility

This example works in all modern browsers that support PDF.js. For best results, use the latest versions of Chrome, Firefox, Edge, or Safari.
