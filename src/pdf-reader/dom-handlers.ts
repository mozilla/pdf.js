export function onReadButtonClick(): void {
  console.log("Read button clicked!");

  // TODO: Add your reading functionality here
  // For example:
  // - Start analysis of the current PDF
  // - Show reading mode
  // - Process document content
  // - etc.
}

export function enableReadButton(): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (readButton) {
    readButton.disabled = false;
  }
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}
