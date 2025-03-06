/** @typedef {import("./event_utils.js").EventBus} EventBus */
/** @typedef {import("./interfaces.js").IL10n} IL10n */

/**
 * @typedef {Object} AnnotationNavigatorOptions
 * @property {HTMLDivElement} container - The container of annotation navigator.
 * @property {HTMLOListElement} list - The list of annotations elements.
 * @property {HTMLSelectElement} filter - The annotations filter element.
 */

class AnnotationNavigator {
  #editors = [];

  /**
   * @param {AnnotationNavigatorOptions} options
   * @param {EventBus} eventBus - The application event bus.
   * @param {IL10n} l10n - Localization service.
   */
  constructor({ container, list, filter }, eventBus, l10n) {
    this.container = container;
    this.list = list;
    this.filter = filter;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.#bindListeners();
  }

  #formatHTML(editor) {
    return `<li id="${editor.id}_li" class="annotationNavigatorItem">
      <h4>${editor.name}</h4>
      <p>Page ${editor.pageIndex}</p>
      <p>X: ${editor.x.toFixed(4)} / Y: ${editor.y.toFixed(4)}</p>
      <button type="button" data-editor="${editor.id}" data-page="${editor.pageIndex}" data-x="${editor.x}" data-y="${editor.y}">Focus</button>
    </li>`;
  }

  #updateUI() {
    // eslint-disable-next-line no-unsanitized/property
    this.list.innerHTML = this.#editors.map(this.#formatHTML).join("");
  }

  #bindListeners() {
    window.PDFViewerApplication.eventBus.on(
      "pdfjs.annotation.editor_attach",
      event => {
        this.#editors.push(event.editor);
        this.#updateUI();
      }
    );

    window.PDFViewerApplication.eventBus.on(
      "pdfjs.annotation.editor_detach",
      event => {
        this.#editors = this.#editors.filter(e => e.id !== event.editor.id);
        this.#updateUI();
      }
    );

    this.list.addEventListener("click", event => {
      if (event.target.nodeName === "BUTTON") {
        console.log(event.target.dataset);
        const pageNumber = Number(event.target.dataset.page);
        window.PDFViewerApplication.pdfViewer.scrollPageIntoView({
          pageNumber,
        });
        const editorId = event.target.dataset.editor;
        if (editorId) {
          setTimeout(() => {
            const targetEditor = document.getElementById(editorId);
            if (targetEditor) {
              targetEditor.focus();
            }
          }, 300);
        }
      }
    });
  }
}

export { AnnotationNavigator };
