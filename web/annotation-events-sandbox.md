# PDF.js Annotation Events Sandbox

This sandbox provides a comprehensive testing environment for the PDF.js Annotation Events API. It allows developers to test all aspects of the annotation events system, including creating annotations, sending events, and monitoring event traffic.

## Running the Sandbox

1. Build PDF.js by running `gulp generic` in the project root
2. Start the development server with `gulp server`
3. Navigate to `http://localhost:8888/web/annotation-events-sandbox.html`

## Features

### PDF Viewer

- Displays PDF documents with annotation capabilities
- Supports loading custom PDFs via the file picker
- Renders pages with proper scaling

### Annotation Creation

- Create ink annotations
- Create text annotations
- Create highlight annotations
- Disable annotation creation mode

### Event Testing

- Send custom events to PDF.js:
  - Select annotations
  - Unselect annotations
  - Modify annotations
  - Remove annotations
- Monitor events from PDF.js in real-time
- Filter events by type
- Inspect event data payloads

### Annotation Management

- View a list of all annotations in the document
- Select annotations from the list
- Inspect annotation properties
- Modify annotation properties via JSON editor

## Using the Sandbox

### Loading a PDF

- The sandbox loads a default PDF on startup
- Use the "Choose PDF" button to load a different PDF

### Creating Annotations

1. Click one of the annotation creation buttons (Ink, Text, Highlight)
2. Draw or place the annotation on the PDF
3. The annotation will appear in the annotations list
4. The creation event will be logged in the event log

### Sending Events

1. Select an event type from the dropdown
2. Select an annotation from the dropdown
3. For "Modify" events, edit the JSON properties
4. For "Select" events, specify the page index
5. Click "Send Event"
6. The event will be sent to PDF.js and the response will be logged

### Monitoring Events

- All events from PDF.js are displayed in the event log
- Use the filter dropdown to show only specific event types
- Click "Show data" to view the full event payload
- Toggle "Auto-scroll" to automatically scroll to new events

### Inspecting Annotations

- Click on an annotation in the list to select it
- The inspector panel will show the annotation's properties
- Basic information includes ID, type, and page
- The properties section shows the full JSON data

## API Integration

The sandbox uses the new `annotationEventManager` API for all operations:

```javascript
// Get the annotation event manager
const { annotationEventManager } = pdfDocument;

// Listen for events
annotationEventManager.on(pdfjsLib.AnnotationEventType.SELECTED, data => {
  // Handle selection event
});

// Send events
annotationEventManager.selectAnnotation(id, pageIndex);
annotationEventManager.modifyAnnotation(id, properties);
```

## Troubleshooting

- If annotations don't appear, check the console for errors
- If events aren't being logged, ensure the PDF.js build is up-to-date
- If the sandbox doesn't load, verify that the development server is running

## Development

The sandbox consists of three main files:

- `annotation-events-sandbox.html` - HTML structure
- `annotation-events-sandbox.css` - Styling
- `annotation-events-sandbox.js` - JavaScript functionality

To modify the sandbox, edit these files and refresh the page in your browser.
