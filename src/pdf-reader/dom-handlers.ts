export function onReadButtonClick(): void {
  console.log("Read button clicked!");

  // TODO: Add your reading functionality here
  // For example:
  // - Start analysis of the current PDF
  // - Show reading mode
  // - Process document content
  // - etc.
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}

// Assign to window object so it's accessible from HTML
window.onReadButtonClick = onReadButtonClick;
