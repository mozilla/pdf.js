import {getColor, getMode, initUI, sendEvent} from "./ui.js";

var highlights = [];
let es;

export function init(app) {
  initUI();

  app.eventBus.on("pagerendered", function (event) {
    let canvas = event.source.canvas;
    if (event.cssTransform) {
      return;
    }

    drawAnnotations(event);
    createHighlight(canvas, event.pageNumber);
  });
}

function createHighlight(canvas, page) {
  let preview;
  let relX;
  let relY;

  canvas.parentElement.parentElement.addEventListener("mousedown", (e) => {
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
  })

  canvas.parentElement.parentElement.addEventListener("mousemove", (e) => {
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

  })

  canvas.parentElement.parentElement.addEventListener("mouseup", (ee) => {
    if (getMode() !== "highlight") {
      return;
    }

    onDragEnd();
    let bb = canvas.getBoundingClientRect();
    let relX = (es.x - bb.left) / bb.width;
    let relY = (es.y - bb.top) / bb.height;
    let relW = (ee.x - es.x) / bb.width;
    let relH = (ee.y - es.y) / bb.height;
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
  })
}

function createStickyNote(canvas) {
  canvas.parentElement.parentElement.addEventListener("click", (e) => {
    onClick(e, canvas);
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

function onClick(e, canvas) {
  let bb = canvas.getBoundingClientRect();
  let relX = (e.x - bb.left) / bb.width;
  let relY = (e.y - bb.top) / bb.height;
  renderRect(canvas, relX, relY, 0.1, 0.1);

  let page = canvas.parentElement.parentElement;
  let span = document.createElement("span");
  span.style.position = "absolute";
  span.style.top = (e.y - bb.top) + "px";
  span.style.left = (e.x - bb.left) + "px";
  span.setAttribute("type", "text");
  span.setAttribute("value", "Hello World!");
  page.appendChild(span);
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
