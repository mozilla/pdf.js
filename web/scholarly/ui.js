let modes;
let activeMode = null;

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
    none: {
      button: document.getElementById("editorNone")
    }
  }

  for (let [type, elements] of Object.entries(modes)) {
    elements.button.addEventListener("click", () => onButtonClick(type));
  }
  modes.stickyNote.input.value = '#FF0000';
  modes.highlight.input.value = '#FFFF00';
}

export function getMode() {
  return activeMode;
}

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

