import { noContextMenu } from "../display_utils.js";

class CommentText {
  #commentText = null;

  #commentTextButton = null;

  #commentTextTooltip = null;

  #commentTextTooltipTimeout = null;

  #commentTextWasFromKeyboard = false;

  #badge = null;

  #editor = null;

  static _l10n = null;

  constructor(editor) {
    this.#editor = editor;
  }

  static initialize(l10n) {
    CommentText._l10n ??= l10n;
  }

  async render() {
    const commentText = (this.#commentTextButton =
      document.createElement("button"));
    commentText.className = "commentText";
    commentText.tabIndex = "0";

    const label = document.createElement("span");
    commentText.append(label);

    commentText.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-comment-text-button"
    );
    label.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-comment-text-button-label"
    );

    const signal = this.#editor._uiManager._signal;
    commentText.addEventListener("contextmenu", noContextMenu, { signal });
    commentText.addEventListener(
      "pointerdown",
      event => event.stopPropagation(),
      {
        signal,
      }
    );

    const onClick = event => {
      event.preventDefault();
      this.#editor._uiManager.editCommentText(this.#editor);
    };
    commentText.addEventListener("click", onClick, { capture: true, signal });
    commentText.addEventListener(
      "keydown",
      event => {
        if (event.target === commentText && event.key === "Enter") {
          this.#commentTextWasFromKeyboard = true;
          onClick(event);
        }
      },
      { signal }
    );
    await this.#setState();

    return commentText;
  }

  get #label() {
    return this.#commentText && "added";
  }

  finish() {
    if (!this.#commentTextButton) {
      return;
    }
    this.#commentTextButton.focus({
      focusVisible: this.#commentTextWasFromKeyboard,
    });
    this.#commentTextWasFromKeyboard = false;
  }

  isEmpty() {
    return !this.#commentText;
  }

  hasData() {
    return this.isEmpty();
  }

  toggleAltTextBadge(visibility = false) {
    if (this.#commentText) {
      this.#badge?.remove();
      this.#badge = null;
      return;
    }
    if (!this.#badge) {
      const badge = (this.#badge = document.createElement("div"));
      badge.className = "noAltTextBadge";
      this.#editor.div.append(badge);
    }
    this.#badge.classList.toggle("hidden", !visibility);
  }

  serialize(isForCopying) {
    const commentText = this.#commentText;
    return {
      commentText,
    };
  }

  get data() {
    return {
      commentText: this.#commentText,
    };
  }

  /**
   * Set the alt text data.
   */
  set data({ commentText }) {
    this.#commentText = commentText;
    this.#setState();
  }

  toggle(enabled = false) {
    if (!this.#commentTextButton) {
      return;
    }
    if (!enabled && this.#commentTextTooltipTimeout) {
      clearTimeout(this.#commentTextTooltipTimeout);
      this.#commentTextTooltipTimeout = null;
    }
    this.#commentTextButton.disabled = !enabled;
  }

  shown() {
    this.#editor._reportTelemetry({
      action: "pdfjs.image.alt_text.image_status_label_displayed",
      data: { label: this.#label },
    });
  }

  destroy() {
    this.#commentTextButton?.remove();
    this.#commentTextButton = null;
    this.#commentTextTooltip = null;
    this.#badge?.remove();
    this.#badge = null;
  }

  async #setState() {
    const button = this.#commentTextButton;
    if (!button) {
      return;
    }

    if (!this.#commentText) {
      button.classList.remove("done");
      this.#commentTextTooltip?.remove();
      return;
    }
    button.classList.add("done");
    button.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-edit-button");

    let tooltip = this.#commentTextTooltip;
    if (!tooltip) {
      this.#commentTextTooltip = tooltip = document.createElement("span");
      tooltip.className = "tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.id = `alt-text-tooltip-${this.#editor.id}`;

      const DELAY_TO_SHOW_TOOLTIP = 100;
      const signal = this.#editor._uiManager._signal;
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(this.#commentTextTooltipTimeout);
          this.#commentTextTooltipTimeout = null;
        },
        { once: true }
      );
      button.addEventListener(
        "mouseenter",
        () => {
          this.#commentTextTooltipTimeout = setTimeout(() => {
            this.#commentTextTooltipTimeout = null;
            this.#commentTextTooltip.classList.add("show");
            this.#editor._reportTelemetry({
              action: "alt_text_tooltip",
            });
          }, DELAY_TO_SHOW_TOOLTIP);
        },
        { signal }
      );
      button.addEventListener(
        "mouseleave",
        () => {
          if (this.#commentTextTooltipTimeout) {
            clearTimeout(this.#commentTextTooltipTimeout);
            this.#commentTextTooltipTimeout = null;
          }
          this.#commentTextTooltip?.classList.remove("show");
        },
        { signal }
      );
    }
    tooltip.removeAttribute("data-l10n-id");
    tooltip.textContent = this.#commentText;

    if (!tooltip.parentNode) {
      button.append(tooltip);
    }

    const element = this.#editor.getImageForAltText();
    element?.setAttribute("aria-describedby", tooltip.id);
  }
}

export { CommentText };
