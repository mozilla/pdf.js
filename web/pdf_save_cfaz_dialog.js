/**
 * @typedef {Object} PDFSaveCfazDialogOptions
 * @property {HTMLDialogElement} dialog - The overlay's DOM element.
 * @property {Object} message - Message's DOM element.
 * @property {HTMLButtonElement} closeButton - Button for closing the overlay.
 */

class PDFSaveCfazDialog {
  /**
   * @param {PDFSaveCfazDialogOptions} options
   * @param {OverlayManager} overlayManager - Manager for the viewer overlays.
   * @param {EventBus} eventBus - The application event bus.
   * @param {IL10n} l10n - Localization service.
   */
  constructor(
    { dialog, message, closeButton },
    overlayManager,
    l10n,
  ) {
    this.dialog = dialog;
    this.message = message;
    this.closeButton = closeButton;
    this.overlayManager = overlayManager;
    this.l10n = l10n;

    this.#reset();
    this.#updateUI();

    // Bind the event listener for the Close button.
    this.closeButton.addEventListener("click", this.close.bind(this));

    this.overlayManager.register(this.dialog);
  }

  /**
   * Set messageContent to show in overlay
   *
   * @param {String} messageContent - Message string
   */
  setMessageContent(messageContent) {
    this.messageContent = messageContent;
    
    this.#updateUI();
  }

  /**
   * Set closeButtonToggle to show in overlay
   *
   * @param {Boolean} closeButtonToggle - closeButtonToggle Boolean
   */
  setCloseButtonToggle(closeButtonToggle) {
    this.closeButtonToggle = closeButtonToggle;
    
    this.#updateUI();
  }

  #reset() {
    this.closeButtonToggle = false;
    this.messageContent = "Enviando arquivo…";
  }

  /**
   * Open the document properties overlay.
   */
  async open() {
    await Promise.all([
      this.overlayManager.open(this.dialog),
    ]);
  }

  /**
   * Close the document properties overlay.
   */
  async close() {
    this.overlayManager.close(this.dialog);
  }

  /**
   * Always updates all of the dialog fields, to prevent inconsistent UI state.
   */
  #updateUI() {
    this.message.textContent = this.messageContent;

    if(this.closeButtonToggle){
        this.closeButton.parentElement.style = 'display: block'
    }else{
        this.closeButton.parentElement.style = 'display: none'
    }
  }
}

export { PDFSaveCfazDialog };
