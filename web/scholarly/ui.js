import {initFilter} from "./filter.js";

let modes;
let activeMode = 'none';

export function initUI() {
  modes = {
    stickyNote: {
      button: document.getElementById("editorScholarlyStickyNote"),
      toolbar: document.getElementById("editorScholarlyStickyNoteToolbar"),
      input: document.getElementById("editorScholarlyStickyNoteColor"),
    },
    highlight: {
      button: document.getElementById("editorScholarlyHighlight"),
      toolbar: document.getElementById("editorScholarlyHighlightToolbar"),
      input: document.getElementById("editorScholarlyHighlightColor"),
    },
    eraser: {
      button: document.getElementById("editorScholarlyEraser")
    },
    none: {
      button: document.getElementById("editorNone")
    }
  }

  for (let [type, elements] of Object.entries(modes)) {
    elements.button.addEventListener("click", () => onButtonClick(type));
  }
  modes.stickyNote.input.value = '#FF0000';
  modes.highlight.input.value = '#FFFF00';

  initExitButton();
  initFilter();
}

function initExitButton() {
  let btn = document.getElementById("scholarlyExitViewer");
  btn.addEventListener("click", () => {
    sendEvent("exit");
  });
}

export function sendEvent(name, arg) {
  let f = window.parent?.pdfViewerEvent;
  if(f != null) {
    f(name, arg);
  } else {
    console.warn("Failed to call window.pdfViewerEvent of parent window");
  }
}

/**
 * 'annotations' argument in RESTapi format
 *
 * @param name
 * @param arg
 */
export function receiveEvent(name, arg) {

}

/**
 * Returns either 'none', 'stickyNote' or 'highlight'.
 * Will never return null.
 * @returns {string}
 */
export function getMode() {
  return activeMode;
}

/**
 * Returns the color of the currently selected tool in RGB hex format.
 * If no tool is selected, this function returns '#000000'.
 * @returns {string}
 */
export function getColor() {
  return modes[activeMode]?.input?.value ?? '#000000'
}

function onButtonClick(id) {
  for (let [t, elements] of Object.entries(modes)) {
    if (id === t) {
      elements.button.classList.add("toggled");
      elements.toolbar?.classList?.remove("hidden");
      activeMode = id;
    } else {
      elements.button.classList.remove("toggled");
      elements.toolbar?.classList?.add("hidden");
    }
  }
}
