import {getColor, getMode, initUI, sendEvent} from "./ui.js";

var listeners = new Map();
var highlights = [];
var stickyNotes = [];
let es;

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

    let bb = canvas.getBoundingClientRect();
    let relX = (e.x - bb.left) / bb.width;
    let relY = (e.y - bb.top) / bb.height;
    let color = getColor();

    var styles = `
    .stickynote-wrapper {
      --color-bg: ` + color + `;
      position: absolute;
      top: 0px;
      left: 0px;
      display: flex;
      flex-direction: row;
    }

    .stickynote-content {
      background-color: var(--color-bg);
      padding: 1em 2em 1em 1em;
      border-radius: 0 1em 1em 1em;
      color: rgba(0, 0, 0, 80%);
      margin-right: 0.3em;
    }

    .stickynote-wrapper > img {
      width: 3em;
      height: 3em;
      border-radius: 100%;
      overflow: hidden;
    }

    .stickynote-content > svg {
      position: absolute;
      top: 5px;
      right: 3.3em;
      cursor: pointer;
    }
    `

    let page = canvas.parentElement.parentElement;
    let span = document.createElement("span");
    let profilePicture = "https://lh3.googleusercontent.com/a/AItbvmlrh0nzdNs8foIotTu6O-3JN6XvLvLRuKyYosp3=s96-c";

    span.innerHTML = '<div class="stickynote-wrapper">\n'
      + '  <div class="stickynote-content">\n'
      + '      <svg style="width:24px;height:24px" viewBox="0 0 24 24">\n'
      + '        <path fill="currentColor" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />\n'
      + '      </svg>\n'
      + '    This is super usefull information!\n'
      + '  </div>\n'
      + '  \n'
      + '  <img src=' + profilePicture + ' />\n'
      + '</div>\n'

    var styleSheet = document.createElement("style");
    styleSheet.innerText = styles;

    span.style.position = "absolute";
    span.style.top = (e.y - bb.top) + "px";
    span.style.left = (e.x - bb.left) + "px";
    span.appendChild(styleSheet);
    page.appendChild(span);
    span.contentEditable = true;

    let content = span.innerText;
    stickyNotes.push({
      page,
      relPos: {x: relX, y: relY},
      color,
      content
    });
  })
}


/**
 * Draws the existing annotations at their corresponding positions.
 *
 * @param event the page render event
 */
function drawAnnotations(event) {
  highlights.forEach(element => {
    if (element.page === event.pageNumber) {
      renderHighlight(event.source.canvas, element.relPos, element.relSize,
        element.color, "Fritz", "abc");
    }
  });
}

/**
 * Draws a colored rectangle at the given position.
 *
 * @param canvas the canvas on which to draw
 * @param relX the relative x position
 * @param relY the relative y position
 * @param relW the relative width of the rectangle
 * @param relH the relative height of the rectangle
 */
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

function renderStickyNote(canvas, relX, relY, color, content, profilePictureURL) {

}

/**
 * Prevents text from being selected while drawing a rectangle.
 *
 * @param event the mouse down event
 */
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

/**
 * Renders a sticky note.
 *
 * @param canvas the canvas on which to draw
 * @param relPos the relative position of the annotation on the PDF file
 * @param content the textual content
 * @param color the color of the rectangle
 * @param userName the username of the annotation creator
 * @param profilePictureURL the profile picture of the annotation creator
 */
function renderStickyNote(canvas, relPos, content, color, userName,
  profilePictureURL) {

}

/**
 * Renders a highlight.
 *
 * @param canvas the canvas on which to draw
 * @param relPos the relative position of the annotation on the PDF file
 * @param relSize the relative size of the rectangle
 * @param color the color of the rectangle
 * @param userName the username of the annotation creator
 * @param profilePictureURL the profile picture of the annotation creator
 */
function renderHighlight(canvas, relPos, relSize, color, userName,
  profilePictureURL) {
  renderRect(canvas, relPos.x, relPos.y, relSize.width, relSize.height, color);
}
