import {getColor, getMode, initUI, sendEvent} from "./ui.js";

var listeners = new Map();
var highlights = [];
var stickyNotes = [];
let es;
let profilePictureURL = "https://lh3.googleusercontent.com/a/AItbvmlrh0nzdNs8foIotTu6O-3JN6XvLvLRuKyYosp3=s96-c";
let stickyNoteCounter = 1;
let stickyNoteId = 1;

export function init(app) {
  initUI();

  app.eventBus.on("pagerendered", function (event) {
    let canvas = event.source.canvas;
    if (event.cssTransform) {
      return;
    }

    updateListeners(event);
    drawAnnotations(event);
    createHighlight(canvas, event.pageNumber);
    createStickyNote(canvas, event.pageNumber);
  });
}

function updateListeners(e) {
  let p = listeners.get(e.pageNumber);

  if (p === undefined) {
    return;
  }

  let canvas = e.source.canvas;

  canvas.parentElement.parentElement.removeEventListener("mousedown", p.mouseDownListener);
  canvas.parentElement.parentElement.removeEventListener("mousemove", p.mouseMoveListener);
  canvas.parentElement.parentElement.removeEventListener("mouseup", p.mouseUpListener);
}

function createHighlight(canvas, page) {
  let preview;
  let relX;
  let relY;

  function mouseDownListener(e) {
    if (getMode() !== "highlight") {
      return;
    }

    es = e;
    startDrag(e);
    disableSelect(e);

    let bb = canvas.getBoundingClientRect();
    relX = (e.x - bb.left) / bb.width;
    relY = (e.y - bb.top) / bb.height;
    preview = document.createElement("div");
    preview.style.position = "absolute";
    preview.style.left = (e.x - bb.left) + "px";
    preview.style.top = (e.y - bb.top) + "px";
    preview.style.backgroundColor = getColor();
    preview.style.opacity = "0.2";

    if (canvas.parentElement.parentElement != null) {
      canvas.parentElement.parentElement.querySelector(
        ".annotationEditorLayer").appendChild(preview);
    }
  }

  function mouseMoveListener(e) {
    if (getMode() !== "highlight" || preview == null) {
      return;
    }

    let bb = canvas.getBoundingClientRect();
    let endRelX = (e.x - bb.left) / bb.width;
    let endRelY = (e.y - bb.top) / bb.height;
    let relWidth = endRelX - relX;
    let relHeight = endRelY - relY;
    let absWidth = relWidth * bb.width;
    let absHeight = relHeight * bb.height;
    preview.style.width = Math.abs(absWidth) + "px";
    preview.style.height = Math.abs(absHeight) + "px";

    if (absWidth < 0) {
      preview.style.left = (e.x - bb.left) + "px";
    } else {
      preview.style.left = (relX * bb.width) + "px";
    }

    if (absHeight < 0) {
      preview.style.top = (e.y - bb.top) + "px";
    } else {
      preview.style.top = (relY * bb.height) + "px";
    }
  }

  function mouseUpListener(e) {
    if (getMode() !== "highlight") {
      return;
    }

    onDragEnd();
    let bb = canvas.getBoundingClientRect();
    let relX = (es.x - bb.left) / bb.width;
    let relY = (es.y - bb.top) / bb.height;
    let relW = (e.x - es.x) / bb.width;
    let relH = (e.y - es.y) / bb.height;
    let color = getColor();
    renderRect(canvas, relX, relY, relW, relH, color);
    highlights.push({
      page,
      relPos: {x: relX, y: relY},
      relSize: {width: relW, height: relH},
      color
    });

    let highlightSendFormat = {
      type: "highlight",
      color,
      startPosition: {x: relX, y: relY},
      endPosition: {x: relX + relW, y: relY + relH}
    };
    sendEvent("createHighlight", highlightSendFormat);

    preview = null;

    if (canvas.parentElement.parentElement != null) {
      canvas.parentElement.parentElement.querySelector(
        ".annotationEditorLayer").innerHTML = "";
    }
  }

  canvas.parentElement.parentElement.addEventListener("mousedown", mouseDownListener);
  canvas.parentElement.parentElement.addEventListener("mousemove", mouseMoveListener);
  canvas.parentElement.parentElement.addEventListener("mouseup", mouseUpListener);

  listeners.set(page, {mouseDownListener, mouseMoveListener, mouseUpListener});
}

function createStickyNote(canvas, page) {
  canvas.parentElement.parentElement.addEventListener("click", (e) => {
    if (getMode() !== "stickyNote") {
      return;
    }

    if (e.y < page.y || e.y > page.y + page.height) {
      return;
    }

    let bb = canvas.getBoundingClientRect();
    let relX = (e.x - bb.left) / bb.width;
    let relY = (e.y - bb.top) / bb.height;
    let color = getColor();
    let content = null;

    stickyNotes.push({
      stickyNoteId,
      page,
      relPos: {x: relX, y: relY},
      color,
      content
    });

    renderNote(stickyNoteId, canvas, relX, relY, color, content, profilePictureURL)

    stickyNoteId++;
  })
}

function drawAnnotations(event) {
  highlights.forEach(element => {
    if (element.page === event.pageNumber) {
      renderHighlight(event.source.canvas, element.relPos, element.relSize,
        element.color, "Fritz", "abc");
    }
  });

  stickyNotes.forEach(element => {
    if (element.page === event.pageNumber) {
      renderStickyNote(element.stickyNoteId, event.source.canvas, element.relPos, element.content, element.color, "Fritz", profilePictureURL);
    }
  });
}

function renderRect(canvas, relX, relY, relW, relH, color) {
  let ctx = canvas.getContext('2d');

  let absX = canvas.width * relX;
  let absY = canvas.height * relY;
  let absW = canvas.width * relW;
  let absH = canvas.height * relH;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(absX, absY, absW, absH);
}

function renderNote(stickyNoteId, canvas, relX, relY, color, content, profilePictureURL) {
  let idSave = "StickyNoteSave" + stickyNoteCounter;
  let idDelete = "StickyNoteDelete" + stickyNoteCounter;
  let idEdit = "StickyNoteEdit" + stickyNoteCounter;
  let idSpanEdit = "noteEdit" + stickyNoteCounter;
  let idSpanDisplay = "noteDisplay" + stickyNoteCounter;
  stickyNoteCounter++;

  let spanEdit = document.createElement("span");
  spanEdit.innerHTML =
    `<div class="stickynote-wrapper" id="${idSpanEdit}">\n`
    + `  <div class="stickynote-content" style="background-color: ${color}"'>\n`
    + '    <textarea placeholder="Add a sticky note"></textarea>\n'
    + `    <button id="${idSave}" >Save</button>\n`
    + '  </div>\n'
    + '\n'
    + '  <img src=' + profilePictureURL + ' />\n'
    + '</div>'
  let bb = canvas.getBoundingClientRect();
  spanEdit.style.position = "absolute";
  spanEdit.style.top = (relY * bb.height) + "px";
  spanEdit.style.left = (relX * bb.width) + "px";
  spanEdit.style.backgroundColor = color;
  canvas.parentElement.parentElement.appendChild(spanEdit);

  let spanDisplay = document.createElement("span");
  spanDisplay = document.createElement("span");
  spanDisplay.innerHTML =
    `<div class="stickynote-wrapper" style="top: 200px" id="${idSpanDisplay}">\n`
    + `  <div class="stickynote-content style="background-color: ${color}">\n`
    + `    <div style="top: 6px" id="${idDelete}">\n`
    + '      <svg style="width:20px;height:20px" viewBox="0 0 24 24">\n'
    + '        <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />\n'
    + '      </svg>\n'
    + '    </div>\n'
    + `    <div style="top: 30px" id="${idEdit}">\n`
    + '      <svg style="width:20px;height:20px" viewBox="0 0 24 24">\n'
    + '        <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />\n'
    + '      </svg>\n'
    + '    </div>\n'
    + '    <p>\n'
    + `${content}`
    + '    </p>\n'
    + '  </div>\n'
    + '  <img src=' + profilePictureURL + ' />\n'
    + '</div>'
  spanDisplay.style.position = "absolute";
  spanDisplay.style.top = (relY * bb.height) + "px";
  spanDisplay.style.left = (relX * bb.width) + "px";
  spanDisplay.style.backgroundColor = color;
  canvas.parentElement.parentElement.appendChild(spanDisplay);

  console.log("ID: " + stickyNoteId);
  console.log("CONTENT: " + content);
  if (content == null) {
    spanDisplay.hidden = true;
  } else {
    spanEdit.hidden = true;
    document.querySelector(`.stickynote-wrapper#${idSpanEdit} > div > textarea`).value = content;
    document.querySelector(`.stickynote-wrapper#${idSpanDisplay} > div > p`).innerText = content;
  }


  document.getElementById(idDelete).addEventListener("click", (e) => {
    canvas.parentElement.parentElement.removeChild(spanDisplay);
    canvas.parentElement.parentElement.removeChild(spanEdit);

    for (var i = 0; i < stickyNotes.length; i++) {
      if (stickyNotes[i].stickyNoteId == stickyNoteId) {
        stickyNotes.splice(i, 1);
      }
    }
  });

  document.getElementById(idEdit).addEventListener("click", (e) => {
    spanDisplay.hidden = true;
    spanEdit.hidden = false;
  });

  document.getElementById(idSave).addEventListener("click", (e) => {
    let textField = document.querySelector(`.stickynote-wrapper#${idSpanEdit} > div > textarea`);
    let paragraph = document.querySelector(`.stickynote-wrapper#${idSpanDisplay} > div > p`);
    spanEdit.hidden = true;
    spanDisplay.hidden = false;
    paragraph.innerText = textField.value;

    for (var i = 0; i < stickyNotes.length; i++) {
      if (stickyNotes[i].stickyNoteId == stickyNoteId) {
        stickyNotes[i].content = textField.value;
      }
    }
  });
}

function changeToEdit() {

}

function changeToDisplay() {

}

function disableSelect(event) {
  event.preventDefault();
}

function startDrag(event) {
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('selectstart', disableSelect);
}

function onDragEnd() {
  window.removeEventListener('mouseup', onDragEnd);
  window.removeEventListener('selectstart', disableSelect);
}

function renderStickyNote(stickyNoteId, canvas, relPos, content, color, userName,
  profilePictureURL) {
  renderNote(stickyNoteId, canvas, relPos.x, relPos.y, color, content, profilePictureURL);
}

function renderHighlight(canvas, relPos, relSize, color, userName,
  profilePictureURL) {
  renderRect(canvas, relPos.x, relPos.y, relSize.width, relSize.height, color);
}
