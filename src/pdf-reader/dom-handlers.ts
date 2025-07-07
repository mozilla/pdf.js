export function enableReadButton({
  shouldEnable,
  onClick,
}: {
  shouldEnable: () => boolean;
  onClick: () => void;
}): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (!readButton) {
    throw new Error("Read button not found");
  }

  if (!shouldEnable()) {
    return;
  }

  readButton.disabled = false;
  readButton.onclick = onClick;
}

export function resetReadButton(): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (!readButton) {
    throw new Error("Read button not found");
  }

  readButton.disabled = true;
  readButton.onclick = null;
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}
