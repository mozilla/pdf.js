# PDF.js Annotation Events Sandbox

This example demonstrates how to use the PDF.js annotation events system, providing a testing ground for both the official API events and legacy custom events.

## Overview

The Annotation Events Sandbox provides a complete testing environment for PDF.js annotation functionality. It allows:

- Loading and viewing PDF files
- Creating and editing annotations (ink, text, highlight)
- Customizing annotation properties
- Listening to and logging annotation events
- Testing both the official API events and legacy custom events

## Architecture

The sandbox is built with a modular architecture:

```
annotation-events-sandbox/
├── index.html              # Main entry point
├── annotation-events-sandbox.js # Main application file
├── annotation-events-sandbox.css # Styles
├── js/
│   ├── config.js           # PDF.js configuration
│   ├── dom-elements.js     # DOM element references
│   ├── event-logging.js    # Event logging functionality
│   ├── ui-controls.js      # UI control functionality
│   ├── pdf-viewer.js       # PDF viewing functionality
│   ├── annotation-manager.js # Annotation management
│   └── index.js            # Entry point for ES modules
```

## Key Features

### Dual Event System

The sandbox demonstrates both event systems available in PDF.js:

1. **Official API Events**: Events fired through the `AnnotationEventManager` with standardized event types
2. **Legacy Custom Events**: Events with the pattern `pdfjs-annotations-*` fired through DOM custom events and postMessage

### Event Logging

All events are logged in the Events panel, showing:

- Event type
- Event source (API or Legacy)
- Timestamp
- Complete event data

### Annotation Creation and Editing

The sandbox provides a full UI for:

- Creating different types of annotations (ink, text, highlight)
- Customizing properties (color, thickness, opacity)
- Selecting and viewing annotation details
- Testing the annotation event system in real-time

## How to Use

1. Start your local PDF.js server (run `gulp server` from the project root)
2. Navigate to `http://localhost:8888/examples/annotation-events-sandbox/index.html`
3. Use the "Choose PDF" button to load a PDF file
4. Use the annotation creation buttons to create annotations
5. Watch the Events panel to see events fired as you interact with annotations

### Creating Annotations

1. Click one of the annotation creation buttons (Ink, Text, Highlight)
2. For ink annotations:
   - Use the color, thickness, and opacity controls to customize
   - Draw on the PDF by clicking and dragging
3. For text annotations:
   - Click where you want to add text
   - Type your text and press Enter or click outside
4. For highlight annotations:
   - Select text on the PDF to highlight it

### Viewing Events

As you interact with annotations, events are logged in the Events panel:

- Blue events are from the official API
- Orange events are from legacy custom events
- Click on an event to expand its details
- Use the Clear Log button to reset the log

## Implementation Notes

### Version Compatibility

The sandbox includes extensive compatibility code to work with different PDF.js versions:

- Detects available annotation editor types
- Adapts to different API patterns for initialization
- Provides fallbacks for different method names
- Includes robust error handling

### Debugging Features

To help with debugging, the sandbox provides:

- Detailed console logging for annotation initialization
- Fallback implementation when features aren't available
- Visual indicators for annotation modes and states
- Inspection panel for selected annotations

## Troubleshooting

If you encounter issues:

1. Check the browser console for detailed error messages
2. Verify you're using a compatible PDF.js build with annotation support
3. Check that the worker path is correctly configured in `config.js`
4. Try with different PDF files (some PDFs might have restrictions)

## Further Development

This sandbox can be extended to:

- Add more annotation types
- Implement additional event listeners
- Customize annotation appearance
- Add export/import functionality
- Implement collaborative annotation features

## Related Documentation

- [PDF.js API Documentation](https://mozilla.github.io/pdf.js/api/)
- [Annotation Events API Reference](../../src/display/annotation_events.d.ts)
- [PDF.js GitHub Repository](https://github.com/mozilla/pdf.js)
