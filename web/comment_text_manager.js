import { DOMSVGFactory } from "pdfjs-lib";

class CommentTextManager {
  #clickAC = null;

  #currentEditor = null;

  #cancelButton;

  #dialog;

  #eventBus;

  #hasUsedPointer = false;

  #overlayManager;

  #saveButton;

  #textarea;

  #uiManager;

  // This is unused, except for telemetry, which is not implemented for this
  // class because it is out of scope for Stud.IP.
  // We're keeping this around anyway in case it will be used in the future
  // (e.g. for undo/redo).
  // eslint-disable-next-line no-unused-private-class-members
  #previousCommentText = null;

  #resizeAC = null;

  #svgElement = null;

  #rectElement = null;

  #container;

  #telemetryData = null;

  constructor(
    { dialog, textarea, cancelButton, saveButton },
    container,
    overlayManager,
    eventBus
  ) {
    this.#dialog = dialog;
    this.#textarea = textarea;
    this.#cancelButton = cancelButton;
    this.#saveButton = saveButton;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;
    this.#container = container;

    dialog.addEventListener("close", this.#close.bind(this));
    dialog.addEventListener("contextmenu", event => {
      if (event.target !== this.#textarea) {
        event.preventDefault();
      }
    });
    cancelButton.addEventListener("click", this.#finish.bind(this));
    saveButton.addEventListener("click", this.#save.bind(this));

    this.#overlayManager.register(dialog);
  }

  #createSVGElement() {
    if (this.#svgElement) {
      return;
    }

    // We create a mask to add to the dialog backdrop: the idea is to have a
    // darken background everywhere except on the editor to clearly see the
    // picture to describe.

    const svgFactory = new DOMSVGFactory();
    const svg = (this.#svgElement = svgFactory.createElement("svg"));
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    const defs = svgFactory.createElement("defs");
    svg.append(defs);
    const mask = svgFactory.createElement("mask");
    defs.append(mask);
    mask.setAttribute("id", "commenttext-manager-mask");
    mask.setAttribute("maskContentUnits", "objectBoundingBox");
    let rect = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "white");
    rect.setAttribute("width", "1");
    rect.setAttribute("height", "1");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");

    rect = this.#rectElement = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "black");
    this.#dialog.append(svg);
  }

  async editCommentText(uiManager, editor) {
    if (this.#currentEditor || !editor) {
      return;
    }
    this.#createSVGElement();

    this.#hasUsedPointer = false;

    this.#clickAC = new AbortController();
    const clickOpts = { signal: this.#clickAC.signal },
      onClick = this.#onClick.bind(this);
    for (const element of [
      this.#textarea,
      this.#saveButton,
      this.#cancelButton,
    ]) {
      element.addEventListener("click", onClick, clickOpts);
    }

    const { commentText } = editor.commentTextData;
    this.#previousCommentText = this.#textarea.value =
      commentText?.trim() || "";
    this.#updateUIState();

    this.#currentEditor = editor;
    this.#uiManager = uiManager;
    this.#uiManager.removeEditListeners();

    this.#resizeAC = new AbortController();
    this.#eventBus._on("resize", this.#setPosition.bind(this), {
      signal: this.#resizeAC.signal,
    });

    try {
      await this.#overlayManager.open(this.#dialog);
      this.#setPosition();
    } catch (ex) {
      this.#close();
      throw ex;
    }
  }

  #setPosition() {
    if (!this.#currentEditor) {
      return;
    }
    const dialog = this.#dialog;
    const { style } = dialog;
    const {
      x: containerX,
      y: containerY,
      width: containerW,
      height: containerH,
    } = this.#container.getBoundingClientRect();
    const { innerWidth: windowW, innerHeight: windowH } = window;
    const { width: dialogW, height: dialogH } = dialog.getBoundingClientRect();
    const { x, y, width, height } = this.#currentEditor.getClientDimensions();
    const MARGIN = 10;
    const isLTR = this.#uiManager.direction === "ltr";

    const xs = Math.max(x, containerX);
    const xe = Math.min(x + width, containerX + containerW);
    const ys = Math.max(y, containerY);
    const ye = Math.min(y + height, containerY + containerH);
    this.#rectElement.setAttribute("width", `${(xe - xs) / windowW}`);
    this.#rectElement.setAttribute("height", `${(ye - ys) / windowH}`);
    this.#rectElement.setAttribute("x", `${xs / windowW}`);
    this.#rectElement.setAttribute("y", `${ys / windowH}`);

    let left = null;
    let top = Math.max(y, 0);
    top += Math.min(windowH - (top + dialogH), 0);

    if (isLTR) {
      // Prefer to position the dialog "after" (so on the right) the editor.
      if (x + width + MARGIN + dialogW < windowW) {
        left = x + width + MARGIN;
      } else if (x > dialogW + MARGIN) {
        left = x - dialogW - MARGIN;
      }
    } else if (x > dialogW + MARGIN) {
      left = x - dialogW - MARGIN;
    } else if (x + width + MARGIN + dialogW < windowW) {
      left = x + width + MARGIN;
    }

    if (left === null) {
      top = null;
      left = Math.max(x, 0);
      left += Math.min(windowW - (left + dialogW), 0);
      if (y > dialogH + MARGIN) {
        top = y - dialogH - MARGIN;
      } else if (y + height + MARGIN + dialogH < windowH) {
        top = y + height + MARGIN;
      }
    }

/*    if (top !== null) {
      dialog.classList.add("positioned");
      if (isLTR) {
        style.left = `${left}px`;
      } else {
        style.right = `${windowW - left - dialogW}px`;
      }
      style.top = `${top}px`;
    } else {
      dialog.classList.remove("positioned");
      style.left = "";
      style.top = "";
    }*/
  }

  #finish() {
    if (this.#overlayManager.active === this.#dialog) {
      this.#overlayManager.close(this.#dialog);
    }
  }

  #close() {
    this.#currentEditor._reportTelemetry(
      this.#telemetryData || {
        action: "alt_text_cancel",
        alt_text_keyboard: !this.#hasUsedPointer,
      }
    );
    this.#telemetryData = null;

    this.#removeOnClickListeners();
    this.#uiManager?.addEditListeners();
    this.#resizeAC?.abort();
    this.#resizeAC = null;
    this.#currentEditor.altTextFinish();
    this.#currentEditor = null;
    this.#uiManager = null;
  }

  // This is vestigial, left over from the AltTextManager class upon which this
  // class is based.
  #updateUIState() {}

  #save() {
    const commentText = this.#textarea.value.trim();
    this.#currentEditor.commentTextData = {
      commentText,
    };
    this.#finish();
  }

  #onClick(evt) {
    if (evt.detail === 0) {
      return; // The keyboard was used.
    }
    this.#hasUsedPointer = true;
    this.#removeOnClickListeners();
  }

  #removeOnClickListeners() {
    this.#clickAC?.abort();
    this.#clickAC = null;
  }

  destroy() {
    this.#uiManager = null; // Avoid re-adding the edit listeners.
    this.#finish();
    this.#svgElement?.remove();
    this.#svgElement = this.#rectElement = null;
  }
}

export { CommentTextManager };
